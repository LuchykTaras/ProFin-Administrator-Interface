
import "server-only";

import type { SessionContext } from "@/lib/server/session";
import { assessR303CExecutionPreflight } from "@/lib/server/r3-google-execution-preflight";
import { resolveAppsScriptAnnualRoute } from "@/lib/server/apps-script-route";

const BABURKA_2026_SPREADSHEET_ID =
  "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw";

type GoogleDiagnostic = {
  googleStatus: string;
  googleReason: string;
};

type MetadataRead = GoogleDiagnostic & {
  status: string;
  value: Record<string, unknown> | null;
};

const SAFE_GOOGLE_STATUSES = new Set([
  "PERMISSION_DENIED", "NOT_FOUND", "UNAUTHENTICATED",
  "FAILED_PRECONDITION", "RESOURCE_EXHAUSTED", "UNAVAILABLE",
  "INTERNAL", "INVALID_ARGUMENT", "DEADLINE_EXCEEDED",
  "ABORTED", "UNKNOWN", "UNIMPLEMENTED"
]);

const SAFE_GOOGLE_REASONS = new Set([
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "SERVICE_DISABLED",
  "IAM_PERMISSION_DENIED", "API_KEY_INVALID",
  "CONSUMER_INVALID", "ACCESS_TOKEN_EXPIRED",
  "CREDENTIALS_MISSING", "BILLING_DISABLED",
  "QUOTA_EXCEEDED", "RATE_LIMIT_EXCEEDED",
  "USER_RATE_LIMIT_EXCEEDED", "ACCESS_DENIED",
  "forbidden", "notFound", "fileNotFound",
  "insufficientPermissions", "insufficientFilePermissions",
  "accessNotConfigured", "authError", "rateLimitExceeded",
  "userRateLimitExceeded", "dailyLimitExceeded", "backendError"
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeGoogleDiagnostic(payload: unknown): GoogleDiagnostic {
  const error = asRecord(asRecord(payload)?.error);
  const rawStatus = error?.status;

  const googleStatus =
    typeof rawStatus === "string" && SAFE_GOOGLE_STATUSES.has(rawStatus)
      ? rawStatus
      : "NOT_PROVIDED_OR_UNRECOGNIZED";

  const reasons: unknown[] = [];

  for (const key of ["details", "errors"]) {
    const items = error?.[key];

    if (Array.isArray(items)) {
      for (const item of items.slice(0, 10)) {
        reasons.push(asRecord(item)?.reason);
      }
    }
  }

  const googleReason = reasons.find(
    reason => typeof reason === "string" && SAFE_GOOGLE_REASONS.has(reason)
  );

  return {
    googleStatus,
    googleReason: typeof googleReason === "string"
      ? googleReason
      : reasons.some(reason => typeof reason === "string")
        ? "UNRECOGNIZED"
        : "NOT_PROVIDED"
  };
}

type ProbeInput = {
  context: SessionContext;
  date: string;
  accessToken: string;
  spreadsheetId: string;
  scriptId: string;
};

async function readGoogleMetadata(
  url: string,
  token: string,
  api: "DRIVE_FILES_GET" | "SCRIPT_PROJECTS_GET"
): Promise<MetadataRead> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json"
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12000)
    });

    if (!response.ok) {
      let errorPayload: unknown = null;

      try {
        errorPayload = await response.json();
      } catch {
        // A non-JSON error response is still a valid HTTP diagnostic.
      }

      const diagnostic = safeGoogleDiagnostic(errorPayload);

      console.warn("R3_03C_GOOGLE_METADATA_ERROR", {
        api,
        httpStatus: response.status,
        googleStatus: diagnostic.googleStatus,
        googleReason: diagnostic.googleReason
      });

      return {
        status: `HTTP_${response.status}`,
        value: null,
        ...diagnostic
      };
    }

    const data: unknown = await response.json();

    if (!asRecord(data)) {
      return {
        status: "INVALID_METADATA",
        value: null,
        googleStatus: "NOT_APPLICABLE",
        googleReason: "NOT_APPLICABLE"
      };
    }

    return {
      status: "OK",
      value: data as Record<string, unknown>,
      googleStatus: "NOT_APPLICABLE",
      googleReason: "NOT_APPLICABLE"
    };
  } catch {
    return {
      status: "NETWORK_ERROR",
      value: null,
      googleStatus: "NOT_AVAILABLE",
      googleReason: "NOT_AVAILABLE"
    };
  }
}

export async function probeR303CMetadata(input: ProbeInput) {
  const base = {
    version: "PROFIN_R3_03C_METADATA_V1" as const,
    diagnosticVersion: "R3_03C_03_GOOGLE_ERROR_CODES_V1" as const,
    routePinnedVerified: false,
    spreadsheetMetadataVerified: false,
    scriptProjectMetadataVerified: false,
    scriptParentVerified: false,
    approvedScriptVerified: false as const,
    appsScriptCoreAclVerified: false as const,
    appsScriptExecutionVerified: false as const,
    snapshotExecuted: false as const,
    financialDataRead: false as const,
    externalSnapshotEnabled: false as const,
    canSubmit: false as const,
    decision: "BLOCKED" as const,
    spreadsheetApiStatus: "NOT_CALLED",
    scriptApiStatus: "NOT_CALLED",
    spreadsheetGoogleStatus: "NOT_CALLED",
    spreadsheetGoogleReason: "NOT_CALLED",
    scriptGoogleStatus: "NOT_CALLED",
    scriptGoogleReason: "NOT_CALLED",
    executionPreflight: assessR303CExecutionPreflight({
      routePinnedVerified: false,
      spreadsheetApiStatus: "NOT_CALLED",
      scriptApiStatus: "NOT_CALLED",
      spreadsheetMetadataVerified: false,
      scriptProjectMetadataVerified: false,
      scriptParentVerified: false
    })
  };

  const {
    context,
    date,
    accessToken,
    spreadsheetId,
    scriptId
  } = input;

  if (
    context.projectId !== "demo-project" ||
    context.locationId !== "main" ||
    context.activeYear !== 2026 ||
    spreadsheetId !== BABURKA_2026_SPREADSHEET_ID ||
    !/^[A-Za-z0-9_-]{20,200}$/.test(scriptId) ||
    !accessToken
  ) {
    return {
      ...base,
      status: "ROUTE_OR_CONFIG_DENIED"
    };
  }

  let routePinnedVerified = false;

  try {
    const route = await resolveAppsScriptAnnualRoute(
      context,
      date
    );

    routePinnedVerified =
      route.projectId === context.projectId &&
      route.locationId === context.locationId &&
      route.year === context.activeYear &&
      route.routeMode === "PRODUCTION" &&
      route.status === "ACTIVE" &&
      route.spreadsheetId === BABURKA_2026_SPREADSHEET_ID;
  } catch {
    return {
      ...base,
      status: "ROUTE_LOOKUP_FAILED"
    };
  }

  if (!routePinnedVerified) {
    return {
      ...base,
      status: "ROUTE_MISMATCH"
    };
  }

  const driveUrl = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(spreadsheetId)}`
  );

  driveUrl.searchParams.set(
    "fields",
    "id,mimeType,trashed"
  );

  driveUrl.searchParams.set(
    "supportsAllDrives",
    "true"
  );

  const scriptUrl =
    `https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}`;

  const [spreadsheet, script] = await Promise.all([
    readGoogleMetadata(
      driveUrl.toString(),
      accessToken,
      "DRIVE_FILES_GET"
    ),
    readGoogleMetadata(
      scriptUrl,
      accessToken,
      "SCRIPT_PROJECTS_GET"
    )
  ]);

  const spreadsheetMetadataVerified =
    spreadsheet.status === "OK" &&
    spreadsheet.value?.id === spreadsheetId &&
    spreadsheet.value?.mimeType ===
      "application/vnd.google-apps.spreadsheet" &&
    spreadsheet.value?.trashed !== true;

  const scriptProjectMetadataVerified =
    script.status === "OK" &&
    script.value?.scriptId === scriptId;

  const scriptParentVerified =
    spreadsheetMetadataVerified &&
    scriptProjectMetadataVerified &&
    script.value?.parentId === spreadsheetId;

  return {
    ...base,
    status:
      spreadsheetMetadataVerified && scriptParentVerified
        ? "METADATA_VERIFIED_ACL_PENDING"
        : "METADATA_INCOMPLETE",
    routePinnedVerified,
    spreadsheetMetadataVerified,
    scriptProjectMetadataVerified,
    scriptParentVerified,
    spreadsheetApiStatus: spreadsheet.status,
    scriptApiStatus: script.status,
    spreadsheetGoogleStatus: spreadsheet.googleStatus,
    spreadsheetGoogleReason: spreadsheet.googleReason,
    scriptGoogleStatus: script.googleStatus,
    scriptGoogleReason: script.googleReason,
    executionPreflight: assessR303CExecutionPreflight({
      routePinnedVerified,
      spreadsheetApiStatus: spreadsheet.status,
      scriptApiStatus: script.status,
      spreadsheetMetadataVerified,
      scriptProjectMetadataVerified,
      scriptParentVerified
    })
  };
}
