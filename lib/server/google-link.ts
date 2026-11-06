import "server-only";

import { OAuth2Client } from "google-auth-library";
import { AppError } from "@/lib/server/errors";
import { createId } from "@/lib/server/crypto";
import type { SessionContext } from "@/lib/server/session";

const googleClient = new OAuth2Client();

export function googleLinkConfig() {
  const clientId = process.env.PROFIN_GOOGLE_OAUTH_CLIENT_ID;
  const origin = process.env.PROFIN_APP_ORIGIN;

  if (process.env.PROFIN_GOOGLE_LINK_ENABLED !== "true") {
    throw new AppError({
      status: 403,
      code: "GOOGLE_LINK_DISABLED",
      userMessage: "Прив’язку Google-акаунтів вимкнено."
    });
  }
  if (
    !clientId ||
    !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    !origin || !/^https:\/\/[^/]+$/.test(origin) && origin !== "http://localhost:3000"
  ) {
    throw new AppError({
      status: 503,
      code: "GOOGLE_LINK_NOT_CONFIGURED",
      userMessage: "Прив’язку Google не налаштовано на сервері."
    });
  }
  return { clientId, origin };
}

export function requireSameOrigin(request: Request, allowedOrigin: string) {
  if (
    request.headers.get("origin") !== allowedOrigin ||
    new URL(request.url).origin !== allowedOrigin
  ) {
    throw new AppError({
      status: 403,
      code: "GOOGLE_LINK_ORIGIN_DENIED",
      userMessage: "Недозволене походження запиту."
    });
  }
}

export async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (!(request.headers.get("content-type") || "").startsWith("application/json")) {
    throw new AppError({ status: 415, code: "JSON_REQUIRED", userMessage: "Очікується JSON." });
  }
  if (Number(request.headers.get("content-length") || 0) > 16000) {
    throw new AppError({ status: 413, code: "BODY_TOO_LARGE", userMessage: "Завеликий запит." });
  }
  const raw = await request.text();
  if (raw.length > 16000) {
    throw new AppError({ status: 413, code: "BODY_TOO_LARGE", userMessage: "Завеликий запит." });
  }
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { throw new AppError({ status: 400, code: "INVALID_JSON", userMessage: "Некоректний JSON." }); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new AppError({ status: 400, code: "INVALID_JSON", userMessage: "Очікується JSON-об’єкт." });
  }
  return value as Record<string, unknown>;
}

export function requireString(value: unknown, max = 500): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max) {
    throw new AppError({ status: 400, code: "INVALID_INPUT", userMessage: "Неприпустимі параметри." });
  }
  return value;
}

export async function verifiedGoogleIdentity(token: string, nonce: string, clientId: string) {
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: token, audience: clientId });
    payload = ticket.getPayload();
  } catch {
    throw new AppError({ status: 401, code: "GOOGLE_TOKEN_INVALID", userMessage: "Google ID token недійсний." });
  }
  const email = payload?.email?.trim().toLowerCase();
  if (
    !payload || payload.nonce !== nonce ||
    typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 255 ||
    !email || email.length > 320 || payload.email_verified !== true
  ) {
    throw new AppError({ status: 403, code: "GOOGLE_IDENTITY_UNVERIFIED", userMessage: "Не підтверджено Google-особу або nonce." });
  }
  return { sub: payload.sub, email };
}

export function requireOwner(context: SessionContext) {
  if (context.role !== "OWNER") {
    throw new AppError({ status: 403, code: "OWNER_REQUIRED", userMessage: "Потрібні повноваження власника." });
  }
}

export function disabledFinancialAccess() {
  return {
    googleLoginEnabled: false,
    appsScriptAclVerified: false,
    shiftSnapshotAuthorized: false,
    canSubmit: false
  } as const;
}

export const createLinkId = () => createId("glink");
export const createLinkRequestId = () => createId("glreq");
export const createLinkChallengeId = () => createId("glchal");

export function noStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
