import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";
import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import {
  requireSessionContext,
  type SessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE = "profin_google_identity_probe";
const TTL_SECONDS = 300;
const COOKIE_PATH = "/api/shifts/google-identity-proof";

function config() {
  const clientId = process.env.PROFIN_GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.PROFIN_GOOGLE_PROOF_SECRET;

  if (
    process.env.NODE_ENV !== "development" ||
    process.env.PROFIN_GOOGLE_PROOF_ENABLED !== "true"
  ) {
    throw new AppError({
      status: 403,
      code: "GOOGLE_IDENTITY_PROBE_DISABLED",
      userMessage: "Діагностичну перевірку вимкнено."
    });
  }

  if (!clientId || !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) || !secret || secret.length < 43) {
    throw new AppError({
      status: 503,
      code: "GOOGLE_IDENTITY_PROBE_NOT_CONFIGURED",
      userMessage: "Не налаштовано тестову перевірку Google."
    });
  }

  return { clientId, secret };
}

function mac(
  context: SessionContext,
  nonce: string,
  issuedAt: string,
  secret: string
) {
  return createHmac("sha256", secret)
    .update([
      context.sessionId,
      context.userId,
      context.projectId,
      context.locationId,
      String(context.activeYear),
      nonce,
      issuedAt
    ].join("\n"))
    .digest("hex");
}

function verifyChallenge(
  value: string | undefined,
  context: SessionContext,
  secret: string
): string | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [nonce, issuedAt, provided] = parts;

  if (
    !/^[A-Za-z0-9_-]{43}$/.test(nonce) ||
    !/^\d{10}$/.test(issuedAt) ||
    !/^[a-f0-9]{64}$/.test(provided)
  ) return null;

  const age = Math.floor(Date.now() / 1000) - Number(issuedAt);
  if (age < 0 || age > TTL_SECONDS) return null;

  const expected = mac(context, nonce, issuedAt, secret);
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))) {
    return null;
  }

  return nonce;
}

function noStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { clientId, secret } = config();
    const context = await requireSessionContext();
    assertPermission(context, "shift:read");

    const nonce = randomBytes(32).toString("base64url");
    const issuedAt = String(Math.floor(Date.now() / 1000));
    const signature = mac(context, nonce, issuedAt, secret);

    const response = apiOk(requestId, {
      clientId,
      nonce,
      expiresInSeconds: TTL_SECONDS,
      scope: "IDENTITY_DIAGNOSTIC_ONLY",
      canSubmit: false
    }, "Початкова перевірка Google готова.", "GOOGLE_IDENTITY_CHALLENGE_OK");

    response.cookies.set(COOKIE, `${nonce}.${issuedAt}.${signature}`, {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: COOKIE_PATH,
      maxAge: TTL_SECONDS
    });

    return noStore(response);
  } catch (error) {
    return noStore(apiFromError(requestId, error));
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { clientId, secret } = config();
    const context = await requireSessionContext();
    assertPermission(context, "shift:read");

    const origin = request.headers.get("origin");
    if (origin !== "http://localhost:3000" || new URL(request.url).origin !== origin) {
      throw new AppError({
        status: 403,
        code: "GOOGLE_PROOF_ORIGIN_DENIED",
        userMessage: "Недозволене походження запиту."
      });
    }

    if (!(request.headers.get("content-type") || "").startsWith("application/json")) {
      throw new AppError({
        status: 415,
        code: "GOOGLE_PROOF_JSON_REQUIRED",
        userMessage: "Очікується JSON-запит."
      });
    }

    const raw = await request.text();
    if (raw.length > 15000) {
      throw new AppError({
        status: 413,
        code: "GOOGLE_PROOF_TOO_LARGE",
        userMessage: "Завеликий запит."
      });
    }
    const parsed: unknown = JSON.parse(raw);
    const body = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
    const credential = body.credential;
    if (Object.keys(body).length !== 1 || typeof credential !== "string" || credential.length > 12000 || credential.length < 100) {
      throw new AppError({
        status: 400,
        code: "GOOGLE_PROOF_INVALID_INPUT",
        userMessage: "Не отримано коректний Google ID token."
      });
    }

    const cookieValue = (await cookies()).get(COOKIE)?.value;
    const nonce = verifyChallenge(cookieValue, context, secret);
    if (!nonce) {
      throw new AppError({
        status: 403,
        code: "GOOGLE_PROOF_CHALLENGE_EXPIRED",
        userMessage: "Перевірка завершилася. Оновіть сторінку."
      });
    }

    let payload;
    try {
      const ticket = await new OAuth2Client().verifyIdToken({
        idToken: credential,
        audience: clientId
      });
      payload = ticket.getPayload();
    } catch {
      throw new AppError({
        status: 401,
        code: "GOOGLE_ID_TOKEN_INVALID",
        userMessage: "Google не підтвердив токен."
      });
    }

    const googleEmail = payload?.email?.trim().toLowerCase();
    const googleAuthority = googleEmail?.endsWith("@gmail.com") || Boolean(payload?.hd);
    if (
      !payload ||
      payload.nonce !== nonce ||
      typeof payload.sub !== "string" || !payload.sub ||
      payload.email_verified !== true ||
      !googleEmail || !googleAuthority
    ) {
      throw new AppError({
        status: 403,
        code: "GOOGLE_IDENTITY_NOT_TRUSTED",
        userMessage: "Ідентичність Google не відповідає вимогам перевірки."
      });
    }

    const rows = await db()`
      SELECT EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.user_id = ${context.userId}
          AND u.project_id = ${context.projectId}
          AND u.role = ${context.role}
          AND u.status = 'ACTIVE'
          AND u.revoked_at IS NULL
          AND lower(trim(u.email)) = ${googleEmail}
      ) AS "emailMatches"
    `;
    const emailMatches = rows[0]?.emailMatches === true;
    if (!emailMatches) {
      throw new AppError({
        status: 403,
        code: "GOOGLE_PROFIN_EMAIL_MISMATCH",
        userMessage: "Google-акаунт не відповідає поточному користувачу ProFin."
      });
    }

    const response = apiOk(requestId, {
      googleIdTokenVerified: true,
      googleEmailMatchesProfin: true,
      googleSubjectBoundToUser: false,
      googleOAuthAccessTokenAvailable: false,
      appsScriptAclVerified: false,
      financialSnapshotEnabled: false,
      canSubmit: false,
      decision: "BLOCKED" as const
    }, "Google-особу для поточного запиту підтверджено. Фінансовий доступ заблоковано.", "GOOGLE_IDENTITY_PROOF_OK");

    response.cookies.set(COOKIE, "", {
      path: COOKIE_PATH,
      maxAge: 0,
      sameSite: "strict"
    });
    return noStore(response);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return noStore(apiFromError(requestId, new AppError({
        status: 400,
        code: "GOOGLE_PROOF_INVALID_JSON",
        userMessage: "Некоректний формат JSON."
      })));
    }
    return noStore(apiFromError(requestId, error));
  }
}
