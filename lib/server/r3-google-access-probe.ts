import "server-only";

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual
} from "node:crypto";

import { cookies } from "next/headers";
import { AppError } from "@/lib/server/errors";
import { resolveAppsScriptAnnualRoute } from "@/lib/server/apps-script-route";
import type { SessionContext } from "@/lib/server/session";

export const PROBE_COOKIE = "profin_r3_google_access_probe";
export const PROBE_PATH = "/api/shifts/google-access-probe";
export const PROBE_ORIGIN = "http://localhost:3000";
export const PROBE_CALLBACK = `${PROBE_ORIGIN}${PROBE_PATH}/callback`;
const TTL_MS = 5 * 60 * 1000;

export const PROBE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/script.projects.readonly"
] as const;

export type ProbeState = {
  state: string;
  nonce: string;
  verifier: string;
  issuedAt: number;
  sessionId: string;
  userId: string;
  projectId: string;
  locationId: string;
  year: number;
  date: string;
};

export function probeConfig() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.PROFIN_R3_GOOGLE_PROBE_ENABLED !== "true"
  ) {
    throw new AppError({
      status: 403,
      code: "R3_GOOGLE_PROBE_DISABLED",
      userMessage: "R3 Google-діагностику вимкнено."
    });
  }

  const clientId = process.env.PROFIN_GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.PROFIN_GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const secret = process.env.PROFIN_GOOGLE_PROOF_SECRET?.trim();
  const spreadsheetId = process.env.PROFIN_R3_GOOGLE_PROBE_SPREADSHEET_ID?.trim();
  const scriptId = process.env.PROFIN_R3_GOOGLE_PROBE_SCRIPT_ID?.trim();

  if (
    !clientId || !/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(clientId) ||
    !clientSecret || !secret || secret.length < 43 ||
    !spreadsheetId || !scriptId
  ) {
    throw new AppError({
      status: 503,
      code: "R3_GOOGLE_PROBE_CONFIG_MISSING",
      userMessage: "Налаштування R3 Google OAuth неповні."
    });
  }

  return { clientId, clientSecret, secret, spreadsheetId, scriptId };
}

export function parseProbeDate(request: Request, activeYear: number): string {
  const params = new URL(request.url).searchParams;
  const dates = params.getAll("date");
  const date = dates[0];
  if (
    dates.length !== 1 ||
    [...params.keys()].some(key => key !== "date") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_DATE",
      userMessage: "Некоректні параметри дати."
    });
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date ||
    Number(date.slice(0, 4)) !== activeYear
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_SHIFT_DATE",
      userMessage: "Некоректна дата або обліковий рік."
    });
  }
  return date;
}

export async function requireBaburkaRoute(
  context: SessionContext,
  date: string,
  spreadsheetId: string
) {
  const route = await resolveAppsScriptAnnualRoute(context, date);
  if (
    context.projectId !== "demo-project" ||
    context.locationId !== "main" ||
    context.activeYear !== 2026 ||
    route.projectId !== context.projectId ||
    route.locationId !== context.locationId ||
    route.year !== context.activeYear ||
    route.routeMode !== "PRODUCTION" ||
    route.status !== "ACTIVE" ||
    route.spreadsheetId !== spreadsheetId
  ) {
    throw new AppError({
      status: 403,
      code: "R3_GOOGLE_PROBE_ROUTE_DENIED",
      userMessage: "Поточний маршрут не відповідає дозволеній Бабурці 2026."
    });
  }
  return route;
}

export function newProbeState(context: SessionContext, date: string): ProbeState {
  return {
    state: randomBytes(32).toString("base64url"),
    nonce: randomBytes(32).toString("base64url"),
    verifier: randomBytes(64).toString("base64url"),
    issuedAt: Date.now(),
    sessionId: context.sessionId,
    userId: context.userId,
    projectId: context.projectId,
    locationId: context.locationId,
    year: context.activeYear,
    date
  };
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function sealProbeState(state: ProbeState, secret: string): string {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const mac = createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${mac}`;
}

export async function requireProbeState(
  context: SessionContext,
  secret: string,
  receivedState: string
): Promise<ProbeState> {
  const raw = (await cookies()).get(PROBE_COOKIE)?.value ?? "";
  const parts = raw.split(".");
  if (parts.length !== 2 || parts[0].length > 1500 || !/^[a-f0-9]{64}$/.test(parts[1])) {
    throw invalidChallenge();
  }
  const expected = createHmac("sha256", secret).update(parts[0]).digest("hex");
  if (!timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(parts[1], "hex"))) {
    throw invalidChallenge();
  }

  let state: ProbeState;
  try {
    state = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as ProbeState;
  } catch {
    throw invalidChallenge();
  }
  if (
    !state || !Number.isFinite(state.issuedAt) ||
    Date.now() - state.issuedAt > TTL_MS ||
    Date.now() < state.issuedAt ||
    !/^[a-zA-Z0-9_-]{43}$/.test(state.state) ||
    !/^[a-zA-Z0-9_-]{43}$/.test(state.nonce) ||
    !/^[a-zA-Z0-9_-]{86}$/.test(state.verifier) ||
    state.state !== receivedState ||
    state.sessionId !== context.sessionId ||
    state.userId !== context.userId ||
    state.projectId !== context.projectId ||
    state.locationId !== context.locationId ||
    state.year !== context.activeYear ||
    !/^2026-\d{2}-\d{2}$/.test(state.date)
  ) {
    throw invalidChallenge();
  }
  return state;
}

function invalidChallenge(): AppError {
  return new AppError({
    status: 403,
    code: "R3_GOOGLE_OAUTH_STATE_INVALID",
    userMessage: "Перевірка Google завершилася або не відповідає сесії."
  });
}
