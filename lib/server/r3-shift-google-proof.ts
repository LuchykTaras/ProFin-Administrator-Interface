
import "server-only";

import {
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";

import { AppError } from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";

import type {
  R3BabVerifiedIdentity
} from "@/lib/server/r3-bab-identity";

export const SHIFT_GOOGLE_COOKIE =
  "profin_r3_shift_google_challenge";

export const SHIFT_GOOGLE_PATH =
  "/api/shifts/reports";

export const SHIFT_GOOGLE_TTL = 180;

const verifier = new OAuth2Client();

function fail(
  status: number,
  code: string
): never {
  throw new AppError({
    status,
    code,
    userMessage: "Google Identity verification failed."
  });
}

function config() {
  if (
    process.env.PROFIN_R3_SHIFT_GOOGLE_PROOF_ENABLED !==
    "true"
  ) {
    fail(403, "SHIFT_GOOGLE_PROOF_DISABLED");
  }

  const clientId =
    process.env.PROFIN_GOOGLE_OAUTH_CLIENT_ID?.trim();

  const secret =
    process.env.PROFIN_GOOGLE_PROOF_SECRET;

  if (
    !clientId ||
    !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    !secret ||
    Buffer.byteLength(secret) < 32
  ) {
    fail(503, "SHIFT_GOOGLE_PROOF_NOT_CONFIGURED");
  }

  return { clientId, secret };
}

function sign(
  context: SessionContext,
  date: string,
  nonce: string,
  issuedAt: string,
  secret: string
): string {
  return createHmac("sha256", secret)
    .update([
      context.sessionId,
      context.userId,
      context.projectId,
      context.locationId,
      context.role,
      String(context.activeYear),
      date,
      nonce,
      issuedAt
    ].join("\n"))
    .digest("hex");
}

export function issueShiftGoogleChallenge(
  context: SessionContext,
  date: string
) {
  const { clientId, secret } = config();

  const nonce =
    randomBytes(32).toString("base64url");

  const issuedAt =
    String(Math.floor(Date.now() / 1000));

  const signature = sign(
    context,
    date,
    nonce,
    issuedAt,
    secret
  );

  return {
    clientId,
    nonce,
    cookieValue:
      `${date}.${nonce}.${issuedAt}.${signature}`
  };
}

export async function requireShiftGoogleToken(
  request: Request,
  context: SessionContext,
  date: string,
  identity: R3BabVerifiedIdentity
): Promise<{
  tokenVerifiedForRequest: true;
  googleSubjectMatched: true;
}> {
  const { clientId, secret } = config();

  const credential =
    request.headers.get("x-profin-google-id-token");

  if (
    !credential ||
    credential.length < 100 ||
    credential.length > 8000
  ) {
    fail(401, "SHIFT_GOOGLE_TOKEN_REQUIRED");
  }

  const cookieValue =
    (await cookies()).get(SHIFT_GOOGLE_COOKIE)?.value;

  const parts = cookieValue?.split(".") ?? [];

  if (parts.length !== 4) {
    fail(403, "SHIFT_GOOGLE_CHALLENGE_MISSING");
  }

  const [
    cookieDate,
    nonce,
    issuedAt,
    signature
  ] = parts;

  if (
    cookieDate !== date ||
    !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
    !/^\d{10}$/.test(issuedAt) ||
    !/^[a-f0-9]{64}$/.test(signature)
  ) {
    fail(403, "SHIFT_GOOGLE_CHALLENGE_INVALID");
  }

  const age =
    Math.floor(Date.now() / 1000) -
    Number(issuedAt);

  if (
    age < 0 ||
    age > SHIFT_GOOGLE_TTL
  ) {
    fail(403, "SHIFT_GOOGLE_CHALLENGE_EXPIRED");
  }

  const expected = sign(
    context,
    date,
    nonce,
    issuedAt,
    secret
  );

  if (
    !timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    )
  ) {
    fail(403, "SHIFT_GOOGLE_CHALLENGE_MISMATCH");
  }

  let ticket;

  try {
    ticket = await verifier.verifyIdToken({
      idToken: credential,
      audience: clientId
    });
  } catch {
    fail(401, "SHIFT_GOOGLE_TOKEN_INVALID");
  }

  const payload = ticket.getPayload();

  if (
    !payload ||
    payload.nonce !== nonce ||
    payload.email_verified !== true ||
    payload.sub !== identity.googleSub ||
    payload.email?.trim().toLowerCase() !==
      identity.googleEmail.trim().toLowerCase()
  ) {
    fail(403, "SHIFT_GOOGLE_IDENTITY_MISMATCH");
  }

  return {
    tokenVerifiedForRequest: true,
    googleSubjectMatched: true
  };
}
