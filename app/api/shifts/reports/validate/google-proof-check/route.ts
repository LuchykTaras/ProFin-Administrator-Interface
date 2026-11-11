
import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import { AppError } from "@/lib/server/errors";

import {
  requireR3BabVerifiedIdentity
} from "@/lib/server/r3-bab-identity";

import {
  requireShiftGoogleToken
} from "@/lib/server/r3-shift-google-proof";

import {
  requireSessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reject(
  status: number,
  code: string
): never {
  throw new AppError({
    status,
    code,
    userMessage: "Google Identity verification denied."
  });
}

function noStore<T extends Response>(
  response: T
): T {
  response.headers.set(
    "Cache-Control",
    "private, no-store"
  );
  return response;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    if (process.env.NODE_ENV !== "development") {
      reject(404, "SHIFT_GOOGLE_TEST_DISABLED");
    }

    if (
      request.headers.get("origin") !==
      new URL(request.url).origin
    ) {
      reject(403, "SHIFT_GOOGLE_ORIGIN_DENIED");
    }

    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers.get("content-type") ?? ""
      )
    ) {
      reject(415, "SHIFT_GOOGLE_JSON_REQUIRED");
    }

    const raw = await request.text();

    if (!raw || raw.length > 1024) {
      reject(400, "SHIFT_GOOGLE_BODY_INVALID");
    }

    let input: unknown;

    try {
      input = JSON.parse(raw);
    } catch {
      reject(400, "SHIFT_GOOGLE_JSON_INVALID");
    }

    if (
      !input ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 1
    ) {
      reject(400, "SHIFT_GOOGLE_BODY_INVALID");
    }

    const date = (
      input as Record<string, unknown>
    ).date;

    if (
      typeof date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    ) {
      reject(400, "SHIFT_GOOGLE_DATE_INVALID");
    }

    const parsed = new Date(
      `${date}T00:00:00.000Z`
    );

    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      reject(400, "SHIFT_GOOGLE_DATE_INVALID");
    }

    const context =
      await requireSessionContext();

    if (context.activeYear !== Number(date.slice(0, 4))) {
      reject(403, "SHIFT_GOOGLE_YEAR_DENIED");
    }

    const identity =
      await requireR3BabVerifiedIdentity(
        context,
        date
      );

    const proof =
      await requireShiftGoogleToken(
        request,
        context,
        date,
        identity
      );

    return noStore(
      apiOk(
        requestId,
        {
          identityVerified:
            proof.tokenVerifiedForRequest,
          googleSubjectMatched:
            proof.googleSubjectMatched,
          canSubmit: false,
          writePerformed: false
        },
        "Google Identity verified.",
        "SHIFT_GOOGLE_PROOF_PASS"
      )
    );
  } catch (error) {
    return noStore(
      apiFromError(requestId, error)
    );
  }
}
