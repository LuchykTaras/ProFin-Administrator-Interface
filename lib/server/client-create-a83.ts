import "server-only";

import { sha256 } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { apiFromError, apiOk, getRequestId } from "@/lib/server/api";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";
import { resolveAppsScriptAnnualRoute } from "@/lib/server/apps-script-route";
import { callAppsScriptAdapter } from "@/lib/server/apps-script-transport";
import {
  CLIENT_CREATE_A83_VERSION,
  type ClientCreateA83Request,
  type ClientCreateA83DryRun,
  type ClientCreateA83Committed,
  type CreateClientA83Input
} from "@/lib/contracts/client-create-a83";

const allowedRoot = new Set(["mode", "client"]);
const allowedClient = new Set(["name", "birthDate", "trustedPerson", "trustedPhone"]);

function fail(status: number, code: string, userMessage: string): never {
  throw new AppError({status, code, userMessage, retryable: false});
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function normalize(input: unknown): ClientCreateA83Request {
  if (!isRecord(input) || Object.keys(input).length !== 2 ||
      Object.keys(input).some(key => !allowedRoot.has(key)) ||
      (input.mode !== "DRY_RUN" && input.mode !== "COMMIT") ||
      !isRecord(input.client)) {
    return fail(400, "A83_BODY_INVALID", "Invalid client creation request.");
  }
  const raw = input.client;
  if (Object.keys(raw).length !== 4 ||
      Object.keys(raw).some(key => !allowedClient.has(key)) ||
      Object.values(raw).some(value => typeof value !== "string")) {
    return fail(400, "A83_FIELDS_INVALID", "Only four required text fields are allowed.");
  }
  const result: CreateClientA83Input = {
    name: (raw.name as string).replace(/\s+/g, " ").trim(),
    birthDate: (raw.birthDate as string).trim(),
    trustedPerson: (raw.trustedPerson as string).replace(/\s+/g, " ").trim(),
    trustedPhone: (raw.trustedPhone as string).replace(/[\s()-]/g, "").trim()
  };
  if (result.name.length < 3 || result.name.length > 160 ||
      result.trustedPerson.length < 3 || result.trustedPerson.length > 160 ||
      /^[=+\-@']/.test(result.name) || /^[=+\-@']/.test(result.trustedPerson) ||
      !/^\+?[0-9]{9,15}$/.test(result.trustedPhone) ||
      /[\x00-\x1F\x7F]/.test(result.name + result.trustedPerson)) {
    return fail(400, "A83_FIELDS_INVALID", "Check client names and phone number.");
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(result.birthDate);
  if (!m) return fail(400, "A83_DATE_INVALID", "Invalid birth date.");
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || d.getUTCFullYear() !== year ||
      d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day ||
      d.getTime() > Date.now()) {
    return fail(400, "A83_DATE_INVALID", "Invalid birth date.");
  }
  return {mode: input.mode, client: result};
}

type AppsScriptCreateData = {
  result?: unknown;
  status: "OK";
};
function parseAdapterResult(raw: unknown, mode: "DRY_RUN" | "COMMIT") {
  if (!isRecord(raw) || raw.version !== CLIENT_CREATE_A83_VERSION ||
      raw.mode !== mode || raw.locationId !== "main" ||
      raw.sourceSheet !== "\u041a\u043b\u0456\u0454\u043d\u0442\u0441\u044c\u043a\u0430 \u0431\u0430\u0437\u0430") {
    fail(502, "A83_RESULT_INVALID", "Invalid Apps Script client response.");
  }
  if (mode === "DRY_RUN") {
    for (const key of ["duplicateFound", "destinationFree", "ledgerReady",
      "writeEnabled", "readyForCommit"] as const) {
      if (typeof raw[key] !== "boolean") fail(502, "A83_PREVIEW_INVALID", "Invalid dry-run response.");
    }
    if (raw.writesPerformed !== false) {
      fail(502, "A83_DRY_RUN_WRITE_VIOLATION", "Dry-run response is invalid.");
    }
    return raw as unknown as ClientCreateA83DryRun;
  }
  if (typeof raw.clientId !== "string" ||
      !/^CL-\d{8}-\d{6}-[A-Z0-9]{4}$/.test(raw.clientId) ||
      typeof raw.replayed !== "boolean") {
    fail(502, "A83_COMMIT_RESULT_INVALID", "Invalid created client response.");
  }
  return raw as unknown as ClientCreateA83Committed;
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    // Browser session cookie: reject cross-origin form/fetch POST.
    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      fail(403, "A83_ORIGIN_FORBIDDEN", "Untrusted request origin.");
    }
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      fail(415, "A83_JSON_REQUIRED", "Expected an application/json request.");
    }
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > 4096) fail(413, "A83_BODY_TOO_LARGE", "Request body is too large.");

    const context = await requireSessionContext();
    assertPermission(context, "client:create");
    if (context.locationId !== "main" || context.activeYear !== 2026) {
      fail(403, "A83_BRANCH_FORBIDDEN", "Client creation is enabled only for Baburka 2026.");
    }
    const route = await resolveAppsScriptAnnualRoute(context);
    const pinnedId = process.env.PROFIN_A83_BAB_PRODUCTION_SPREADSHEET_ID?.trim();
    if (!pinnedId || route.spreadsheetId !== pinnedId ||
        route.routeMode !== "PRODUCTION" || route.status !== "ACTIVE" ||
        route.projectId !== context.projectId || route.locationId !== context.locationId ||
        route.year !== context.activeYear) {
      fail(403, "A83_PROD_ROUTE_FORBIDDEN", "Production branch route is not verified.");
    }

    const key = request.headers.get("idempotency-key")?.trim() ?? "";
    if (key.length < 16 || key.length > 200) {
      fail(400, "A83_IDEMPOTENCY_KEY_REQUIRED", "Stable idempotency key is required.");
    }
    let body: unknown;
    try {
      const raw = await request.text();
      if (raw.length > 4096) fail(413, "A83_BODY_TOO_LARGE", "Request body is too large.");
      body = JSON.parse(raw);
    } catch (error) {
      if (error instanceof AppError) throw error;
      fail(400, "A83_INVALID_JSON", "Invalid JSON request.");
    }
    const input = normalize(body);
    if (input.mode === "COMMIT" &&
        process.env.PROFIN_A83_PRODUCTION_WRITE_ENABLED !== "true") {
      fail(403, "A83_PROD_WRITE_DISABLED", "Production client creation is disabled.");
    }
    const adapter = await callAppsScriptAdapter<ClientCreateA83Request, AppsScriptCreateData>({
      command: "createClientWeb", requestId, context, payload: input,
      idempotencyKey: key
      // Deliberately NO request.signal for a write.
      // Client disconnect must not be interpreted as rolled-back commit.
    });
    const result = parseAdapterResult(adapter.data?.result, input.mode);
    if (result.mode === "DRY_RUN") {
      return apiOk(requestId, result, "Production read-only preview completed.",
        "CLIENT_DRY_RUN_A83");
    }

    // Stable audit event allows safe retry after Apps Script completed but DB failed.
    const eventId = "evt_a83_" + sha256([
      "CLIENT_CREATE_A83_PROD", context.projectId, context.locationId,
      context.activeYear, context.userId, key
    ].join("|")).slice(0, 40);
    try {
      const sql = db();
      await sql`
        INSERT INTO audit_events (
          event_id, request_id, actor_user_id, actor_role,
          project_id, location_id, financial_year,
          action, target_type, target_id, after_snapshot, result
        ) VALUES (
          ${eventId}, ${requestId}, ${context.userId}, ${context.role},
          ${context.projectId}, ${context.locationId}, ${context.activeYear},
          'CLIENT_CREATE', 'CLIENT', ${result.clientId},
          ${JSON.stringify({clientId: result.clientId, routeMode: "PRODUCTION",
            sourceSheet: result.sourceSheet, contractVersion: result.version,
            idempotencyKeyHash: sha256(key)})}::jsonb,
          'COMPLETED'
        ) ON CONFLICT (event_id) DO NOTHING
      `;
    } catch {
      // A previous Apps Script write may already have succeeded.
      throw new AppError({
        status: 503,
        code: "A83_AUDIT_PENDING",
        userMessage: "Client may have been created, but audit is pending. Retry with the SAME key and unchanged data.",
        retryable: true
      });
    }
    return apiOk(requestId, result, "Client created in Baburka production directory.",
      "CLIENT_CREATED_A83");
  } catch (error) {
    return apiFromError(requestId, error);
  }
}
