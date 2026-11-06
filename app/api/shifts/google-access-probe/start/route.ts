import { NextResponse } from "next/server";
import { apiFromError, getRequestId } from "@/lib/server/api";
import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";
import {
  PROBE_COOKIE,
  PROBE_PATH,
  PROBE_CALLBACK,
  PROBE_SCOPES,
  newProbeState,
  parseProbeDate,
  pkceChallenge,
  probeConfig,
  requireBaburkaRoute,
  sealProbeState
} from "@/lib/server/r3-google-access-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const date = parseProbeDate(request, context.activeYear);
    await requireBaburkaRoute(context, date, config.spreadsheetId);
    const state = newProbeState(context, date);
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", config.clientId);
    authUrl.searchParams.set("redirect_uri", PROBE_CALLBACK);
    authUrl.searchParams.set("scope", PROBE_SCOPES.join(" "));
    authUrl.searchParams.set("state", state.state);
    authUrl.searchParams.set("nonce", state.nonce);
    authUrl.searchParams.set("code_challenge", pkceChallenge(state.verifier));
    authUrl.searchParams.set("code_challenge_method", "S256");
    authUrl.searchParams.set("access_type", "online");
    authUrl.searchParams.set("prompt", "select_account");

    const response = NextResponse.redirect(authUrl);
    response.cookies.set(PROBE_COOKIE, sealProbeState(state, config.secret), {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: PROBE_PATH,
      maxAge: 300
    });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    const response = apiFromError(requestId, error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
