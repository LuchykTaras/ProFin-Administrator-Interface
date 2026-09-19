import "server-only";

import {
  AppError
} from "@/lib/server/errors";

export type UnknownRecord =
  Record<string, unknown>;

const TRUSTED_CONTEXT_KEYS =
  new Set([
    "projectId",
    "project_id",
    "locationId",
    "location_id",
    "year",
    "activeYear",
    "active_year",
    "spreadsheetId",
    "spreadsheet_id",
    "annualRoute",
    "annual_route",
    "transferRoute",
    "transfer_route",
    "shiftPolicy",
    "shift_policy",
    "cashAccounts",
    "cash_accounts",
    "context",
    "actor",
    "role",
    "userId",
    "user_id"
  ]);

export function isRecord(
  value: unknown
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function assertNoTrustedContextOverride(
  value: UnknownRecord,
  scope: string
): void {
  for (const key of Object.keys(value)) {
    if (TRUSTED_CONTEXT_KEYS.has(key)) {
      throw new AppError({
        status: 403,
        code: "TRUSTED_CONTEXT_OVERRIDE_FORBIDDEN",
        userMessage:
          "Контекст проєкту, локації та року визначає сервер.",
        technicalMessage:
          `Forbidden trusted-context key ${scope}.${key}.`
      });
    }
  }
}

export function assertAllowedKeys(
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
  scope: string
): void {
  const unknown = Object.keys(value)
    .filter(key => !allowed.has(key));

  if (unknown.length) {
    throw new AppError({
      status: 400,
      code: "UNKNOWN_COMMAND_FIELD",
      userMessage:
        "Запит містить невідоме поле.",
      technicalMessage:
        `${scope}: ${unknown.join(", ")}.`
    });
  }
}

export function requireString(
  value: unknown,
  code: string,
  userMessage: string
): string {
  const normalized =
    typeof value === "string"
      ? value.trim()
      : "";

  if (!normalized) {
    throw new AppError({
      status: 400,
      code,
      userMessage
    });
  }

  return normalized;
}

export function optionalString(
  value: unknown,
  maxLength = 1000
): string | null {
  if (
    value === null ||
    typeof value === "undefined"
  ) {
    return null;
  }

  if (typeof value !== "string") {
    throw new AppError({
      status: 400,
      code: "INVALID_OPTIONAL_STRING",
      userMessage:
        "Некоректне текстове поле."
    });
  }

  const normalized = value.trim();

  if (normalized.length > maxLength) {
    throw new AppError({
      status: 400,
      code: "TEXT_TOO_LONG",
      userMessage:
        "Текстове поле перевищує допустиму довжину."
    });
  }

  return normalized || null;
}

export function requirePositiveNumber(
  value: unknown,
  code: string,
  userMessage: string
): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(parsed) ||
    parsed <= 0
  ) {
    throw new AppError({
      status: 400,
      code,
      userMessage
    });
  }

  return parsed;
}

export function requireFiniteNumber(
  value: unknown,
  code: string,
  userMessage: string
): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(parsed)) {
    throw new AppError({
      status: 400,
      code,
      userMessage
    });
  }

  return parsed;
}

export function requireDateOnly(
  value: unknown,
  code = "INVALID_OPERATION_DATE"
): string {
  const normalized =
    requireString(
      value,
      code,
      "Дата має формат YYYY-MM-DD."
    );

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new AppError({
      status: 400,
      code,
      userMessage:
        "Дата має формат YYYY-MM-DD."
    });
  }

  return normalized;
}

export function requireIdempotencyKey(
  request: Request
): string {
  const key =
    request.headers
      .get("idempotency-key")
      ?.trim() ?? "";

  if (
    key.length < 16 ||
    key.length > 200
  ) {
    throw new AppError({
      status: 400,
      code: "INVALID_IDEMPOTENCY_KEY",
      userMessage:
        "Для захищеної команди потрібен коректний idempotency key."
    });
  }

  return key;
}

export async function requireJsonObject(
  request: Request
): Promise<UnknownRecord> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    throw new AppError({
      status: 400,
      code: "INVALID_JSON",
      userMessage:
        "Некоректний JSON-запит."
    });
  }

  if (!isRecord(raw)) {
    throw new AppError({
      status: 400,
      code: "INVALID_REQUEST_BODY",
      userMessage:
        "Некоректний формат запиту."
    });
  }

  assertNoTrustedContextOverride(
    raw,
    "body"
  );

  return raw;
}