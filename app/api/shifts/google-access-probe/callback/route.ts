import { OAuth2Client } from "google-auth-library";
import { apiFromError, apiOk, getRequestId } from "@/lib/server/api";
import { db } from "@/lib/server/db";
import { probeR303CMetadata } from "@/lib/server/r3-google-metadata-probe";
import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";
import {
  PROBE_CALLBACK,
  PROBE_COOKIE,
  PROBE_PATH,
  PROBE_SCOPES,
  probeConfig,
  requireBaburkaRoute,
  requireProbeState
} from "@/lib/server/r3-google-access-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GoogleTokens = {
  access_token?: string;
  id_token?: string;
  scope?: string;
};

type IdentityLink = {
  googleSub: string;
  googleEmail: string | null;
  sharedSubject: boolean;
};

async function oauthExchange(code: string, verifier: string, config: ReturnType<typeof probeConfig>): Promise<GoogleTokens> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: PROBE_CALLBACK,
      grant_type: "authorization_code",
      code_verifier: verifier
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    throw new AppError({
      status: 403,
      code: "R3_GOOGLE_OAUTH_EXCHANGE_DENIED",
      userMessage: "Google не підтвердив обмін коду авторизації."
    });
  }
  return await response.json() as GoogleTokens;
}

function withNoStore(response: ReturnType<typeof apiOk> | ReturnType<typeof apiFromError>) {
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(PROBE_COOKIE, "", {
    path: PROBE_PATH,
    maxAge: 0,
    sameSite: "lax",
    httpOnly: true
  });
  return response;
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const config = probeConfig();
    const context = await requireSessionContext();
    assertPermission(context, "shift:read");
    if (context.role !== "OWNER" && context.role !== "SENIOR_ADMIN") {
      throw new AppError({
        status: 403,
        code: "R3_GOOGLE_PROBE_ROLE_DENIED",
        userMessage: "Роль не має доступу до R3-діагностики."
      });
    }
    const params = new URL(request.url).searchParams;
    const states = params.getAll("state");
    const codes = params.getAll("code");
    if (params.has("error")) {
      throw new AppError({ status: 403, code: "R3_GOOGLE_OAUTH_NOT_APPROVED", userMessage: "Google OAuth-доступ не надано." });
    }
    if (
      states.length !== 1 || codes.length !== 1 ||
      states[0].length > 128 || codes[0].length > 2048 ||
      !states[0] || !codes[0]
    ) {
      throw new AppError({ status: 400, code: "R3_GOOGLE_OAUTH_CALLBACK_INVALID", userMessage: "Некоректна відповідь Google OAuth." });
    }
    const challenge = await requireProbeState(context, config.secret, states[0]);
    await requireBaburkaRoute(context, challenge.date, config.spreadsheetId);
    const tokens = await oauthExchange(codes[0], challenge.verifier, config);
    if (!tokens.access_token || !tokens.id_token || !tokens.scope) {
      throw new AppError({ status: 403, code: "R3_GOOGLE_TOKEN_INCOMPLETE", userMessage: "Google не надав необхідних підтверджень." });
    }
    const granted = new Set(
  tokens.scope.split(/\s+/).filter(Boolean)
);

const scopeAliases: Record<string, string[]> = {
  email: [
    "https://www.googleapis.com/auth/userinfo.email"
  ],
  profile: [
    "https://www.googleapis.com/auth/userinfo.profile"
  ]
};

const missingScopes = PROBE_SCOPES.filter(
  scope =>
    !granted.has(scope) &&
    !(scopeAliases[scope] ?? []).some(
      alias => granted.has(alias)
    )
);

if (missingScopes.length > 0) {
  console.warn("R3_GOOGLE_SCOPE_MISSING", {
    missingScopes,
    grantedScopes: [...granted]
  });

  throw new AppError({
    status: 403,
    code: "R3_GOOGLE_SCOPE_MISSING",
    userMessage:
      "Google OAuth не надав усіх дозволів на читання метаданих."
  });
}

    let identity;
    try {
      const ticket = await new OAuth2Client().verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
      identity = ticket.getPayload();
    } catch {
      throw new AppError({ status: 403, code: "R3_GOOGLE_ID_TOKEN_INVALID", userMessage: "Google ID token не пройшов перевірку." });
    }
    if (!identity?.sub || !identity.email || identity.email_verified !== true || identity.nonce !== challenge.nonce) {
      throw new AppError({ status: 403, code: "R3_GOOGLE_IDENTITY_INVALID", userMessage: "Google-ідентичність не підтверджено." });
    }

    const rows = await db()`
      SELECT
        l.google_sub AS "googleSub",
        l.google_email AS "googleEmail",
        EXISTS (
          SELECT 1 FROM public.profin_google_identity_links other
          WHERE other.project_id = l.project_id
            AND other.google_sub = l.google_sub
            AND other.user_id <> l.user_id
            AND other.revoked_at IS NULL
        ) AS "sharedSubject"
      FROM public.profin_google_identity_links l
      WHERE l.project_id = ${context.projectId}
        AND l.user_id = ${context.userId}
        AND l.revoked_at IS NULL
      LIMIT 2
    `;
    const link = rows[0] as IdentityLink | undefined;
    if (
      rows.length !== 1 || !link || link.sharedSubject !== false ||
      link.googleSub !== identity.sub ||
      (typeof link.googleEmail !== "string" || link.googleEmail.trim().toLowerCase() !== identity.email.trim().toLowerCase())
    ) {
      throw new AppError({ status: 403, code: "R3_GOOGLE_LINK_MISMATCH", userMessage: "Google-акаунт не відповідає підтвердженій ProFin-прив'язці." });
    }

    const metadata = await probeR303CMetadata({
      context,
      date: challenge.date,
      accessToken: tokens.access_token,
      spreadsheetId: config.spreadsheetId,
      scriptId: config.scriptId
    });

    return withNoStore(apiOk(requestId, {
      version: "PROFIN_R3_03C_METADATA_V1",
      date: challenge.date,
      role: context.role,
      google: {
        personalOauthVerified: true,
        verifiedIdToken: true,
        boundSubjectMatched: true,
        oauthScopesVerified: true
      },
      access: metadata,
      integration: {
        externalSnapshotEnabled: false,
        snapshotExecuted: false,
        financialDataRead: false,
        canSubmit: false
      },
      decision: "BLOCKED" as const
    }, "OAuth і Google-прив'язку перевірено. Права на метадані показано окремо. Apps Script ACL ще не перевірено.", "SHIFT_R3_03B_OAUTH_PROBE_OK"));
  } catch (error) {
    return withNoStore(apiFromError(requestId, error));
  }
}
