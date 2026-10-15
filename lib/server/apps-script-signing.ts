import "server-only";

import {
  createHmac
} from "node:crypto";

import {
  APPS_SCRIPT_HMAC_SCHEME
} from "@/lib/contracts/apps-script-adapter";

import type {
  AppsScriptAdapterAuth,
  UnsignedAppsScriptAdapterRequest
} from "@/lib/contracts/apps-script-adapter";

import {
  AppError
} from "@/lib/server/errors";


// PATCH 55.7.R4.3
// Бабурка продовжує використовувати HMAC V1.

const PROFIN_HMAC_CANONICAL_VERSION =
  "PROFIN-HMAC-V1";


// Альтернатива 2026 використовує HMAC V2.

const PROFIN_HMAC_CANONICAL_VERSION_ALT =
  "PROFIN-HMAC-V2";


const PROFIN_ALT_2026_SPREADSHEET_ID =
  "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8";

const PROFIN_BAB_2026_SPREADSHEET_ID =
  "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw";

const PROFIN_BAB_TEST_SPREADSHEET_ID =
  "1UZawoIWSgZwmFlmk4HmOcTD_Ir9fxWjwBjTCRc9M6ng";

const PROFIN_ALT_TEST_SPREADSHEET_ID =
  "1ppIrvrdzkBTg2_OEpv7kKhSZS0q3iLQesZzEVrfxfFY";

type HmacProfile =
  | "BAB_PRODUCTION"
  | "ALT_PRODUCTION"
  | "BAB_TEST"
  | "ALT_TEST";

const HMAC_ENV_PREFIX: Record<HmacProfile, string> = {
  BAB_PRODUCTION: "APPS_SCRIPT",
  ALT_PRODUCTION: "APPS_SCRIPT_ALT",
  BAB_TEST: "APPS_SCRIPT_BAB_TEST",
  ALT_TEST: "APPS_SCRIPT_ALT_TEST"
};

function resolveHmacProfile<TPayload>(
  request: UnsignedAppsScriptAdapterRequest<TPayload>
): HmacProfile {
  const context = request.context;

  const annualRoute = (
    context as typeof context & {
      annualRoute?: {
        projectId?: string;
        locationId?: string;
        year?: number;
        routeMode?: string;
        spreadsheetId?: string;
      } | null;
    }
  ).annualRoute;

  const matchingRoute =
    annualRoute?.projectId === context.projectId &&
    annualRoute?.locationId === context.locationId &&
    annualRoute?.year === context.activeYear;

  const testRequested =
    annualRoute?.routeMode === "TEST" ||
    context.locationId.endsWith("-test");

  if (testRequested) {
    if (
      !matchingRoute ||
      context.projectId !== "demo-project" ||
      context.activeYear !== 2026 ||
      annualRoute?.routeMode !== "TEST"
    ) {
      throw new AppError({
        status: 403,
        code: "TEST_HMAC_ROUTE_FORBIDDEN",
        userMessage: "Некоректний TEST-маршрут.",
        retryable: false
      });
    }

    if (
      context.locationId === "baburka-test" &&
      annualRoute.spreadsheetId ===
        PROFIN_BAB_TEST_SPREADSHEET_ID
    ) {
      return "BAB_TEST";
    }

    if (
      context.locationId === "alternatyva-test" &&
      annualRoute.spreadsheetId ===
        PROFIN_ALT_TEST_SPREADSHEET_ID
    ) {
      return "ALT_TEST";
    }

    throw new AppError({
      status: 403,
      code: "TEST_HMAC_SPREADSHEET_FORBIDDEN",
      userMessage: "TEST-таблиця не відповідає філії.",
      retryable: false
    });
  }

  if (
    !matchingRoute ||
    annualRoute?.routeMode !== "PRODUCTION"
  ) {
    throw new AppError({
      status: 403,
      code: "HMAC_ANNUAL_ROUTE_INVALID",
      userMessage: "Некоректний річний маршрут.",
      retryable: false
    });
  }

    if (
    context.activeYear === 2026 &&
    context.locationId === "alternatyva"
  ) {
    if (
      context.projectId !== "demo-project" ||
      annualRoute.spreadsheetId !==
        PROFIN_ALT_2026_SPREADSHEET_ID
    ) {
      throw new AppError({
        status: 403,
        code: "ALT_PRODUCTION_ROUTE_MISMATCH",
        userMessage: "Некоректна таблиця Альтернативи.",
        retryable: false
      });
    }

    return "ALT_PRODUCTION";
  }

  // PATCH 55.9.10.F
  // Для 2026 року забороняємо невідомі
  // production-філії та чужі таблиці.
  if (context.activeYear === 2026) {
    if (
      context.projectId !== "demo-project" ||
      context.locationId !== "main"
    ) {
      throw new AppError({
        status: 403,
        code: "UNKNOWN_PRODUCTION_HMAC_ROUTE",
        userMessage: "Невідомий production-маршрут.",
        retryable: false
      });
    }

    if (
      annualRoute.spreadsheetId !==
      PROFIN_BAB_2026_SPREADSHEET_ID
    ) {
      throw new AppError({
        status: 403,
        code: "BAB_PRODUCTION_ROUTE_MISMATCH",
        userMessage: "Некоректна таблиця Бабурки.",
        retryable: false
      });
    }
  }

  // Зберігаємо попередню поведінку
  // для інших років; вони потребують
  // окремого аудиту маршрутизації.
  return "BAB_PRODUCTION";
}


function getHmacSecret(
  profile: HmacProfile
): string {
  const propertyName =
    `${HMAC_ENV_PREFIX[profile]}_HMAC_SECRET`;

  const secret =
    process.env[propertyName]?.trim();


  if (!secret) {
    throw new AppError({
      status:
        500,

      code:
        "APPS_SCRIPT_HMAC_SECRET_MISSING",

      userMessage:
        "Не налаштовано захищений канал Apps Script.",

      technicalMessage:
        `${propertyName} is missing.`
    });
  }


  if (
    secret.length <
    32
  ) {
    throw new AppError({
      status:
        500,

      code:
        "APPS_SCRIPT_HMAC_SECRET_TOO_SHORT",

      userMessage:
        "Некоректна конфігурація захищеного каналу Apps Script.",

      technicalMessage:
  `${propertyName} must contain at least 32 characters.`
    });
  }


  return secret;
}


function getHmacKeyId(
  profile: HmacProfile
): string {
  const propertyName =
    `${HMAC_ENV_PREFIX[profile]}_HMAC_KEY_ID`;


  const keyId =
    process.env[propertyName]?.trim();


  if (!keyId) {
    throw new AppError({
      status:
        500,

      code:
        "APPS_SCRIPT_HMAC_KEY_ID_MISSING",

      userMessage:
        "Не налаштовано ідентифікатор ключа Apps Script.",

      technicalMessage:
        `${propertyName} is missing.`
    });
  }


  return keyId;
}


/*
 * Один контракт для scalar-полів.
 *
 * null та undefined завжди перетворюються
 * на порожній рядок.
 *
 * Ця функція повинна поводитися 1:1 так само,
 * як profinWebAdapterCanonicalScalar_
 * в Apps Script.
 */
function canonicalScalar(
  value:
    unknown
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  return String(
    value
  );
}


/*
 * Стабільна JSON-серіалізація.
 *
 * Ключі object сортуються,
 * тому порядок ключів у payload
 * не впливає на HMAC.
 */
export function stableStringify(
  value:
    unknown
): string {
  if (
    value === null
  ) {
    return "null";
  }


  if (
    typeof value ===
    "string"
  ) {
    return JSON.stringify(
      value
    );
  }


  if (
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return JSON.stringify(
      value
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return (
      "[" +
      value
        .map(
          item =>
            stableStringify(
              item
            )
        )
        .join(",") +
      "]"
    );
  }


  if (
    typeof value ===
    "object"
  ) {
    const record =
      value as
        Record<
          string,
          unknown
        >;


    const keys =
      Object
        .keys(
          record
        )
        .filter(
          key =>
            record[key] !==
            undefined
        )
        .sort();


    return (
      "{" +
      keys
        .map(
          key =>
            JSON.stringify(
              key
            ) +
            ":" +
            stableStringify(
              record[key]
            )
        )
        .join(",") +
      "}"
    );
  }


  throw new AppError({
    status:
      500,

    code:
      "HMAC_CANONICALIZATION_FAILED",

    userMessage:
      "Не вдалося сформувати підпис Apps Script.",

    technicalMessage:
      `Unsupported canonical value type: ${typeof value}.`
  });
}


/*
 * ЄДИНИЙ CANONICAL FORMAT.
 *
 * Порядок полів не можна міняти
 * незалежно на Next.js або Apps Script.
 *
 * Роздільник:
 * \n
 */
export function buildAppsScriptCanonicalString<
  TPayload
>(
  request:
    UnsignedAppsScriptAdapterRequest<TPayload>
): string {
  const context =
    request.context;


    const payloadCanonical =
    stableStringify(
      request.payload
    );


  // PATCH 55.7.R4.3
  // Отримуємо річний маршрут із серверного контексту.

  const annualRoute = (
    context as typeof context & {
      annualRoute?: {
        spreadsheetId?: string;
      } | null;
    }
  ).annualRoute;


  // V2 застосовується лише до Альтернативи 2026.

    const profile =
    resolveHmacProfile(request);

  const isV2 =
    profile !== "BAB_PRODUCTION";


  return [
        isV2
      ? PROFIN_HMAC_CANONICAL_VERSION_ALT
      : PROFIN_HMAC_CANONICAL_VERSION,

    canonicalScalar(
      request.protocolVersion
    ),

    canonicalScalar(
      request.clientVersion
    ),

    canonicalScalar(
      request.requestId
    ),

    canonicalScalar(
      request.command
    ),

    canonicalScalar(
      request.sentAt
    ),

    canonicalScalar(
      request.nonce
    ),

    canonicalScalar(
      context.projectId
    ),

    canonicalScalar(
      context.locationId
    ),

    canonicalScalar(
      context.activeYear
    ),

    canonicalScalar(
      context.userId
    ),

    canonicalScalar(
      context.role
    ),

    canonicalScalar(
      context.timezone
    ),

        canonicalScalar(
      context.locale
    ),

    // PATCH 55.7.R4.3
    // Підписуємо річний маршрут тільки у V2.
    // Для V1 порядок і кількість полів не змінюються.

        ...(isV2
      ? [
          stableStringify(
            annualRoute ?? null
          )
        ]
      : []),

    canonicalScalar(
      request.idempotencyKey
    ),

    payloadCanonical
  ].join(
    "\n"
  );
}


export function signAppsScriptRequest<
  TPayload
>(
  request:
    UnsignedAppsScriptAdapterRequest<TPayload>
): AppsScriptAdapterAuth {

  // PATCH 55.9.1.C3
  // Визначаємо філію за серверним річним маршрутом.

    const profile =
    resolveHmacProfile(request);

  const secret =
    getHmacSecret(profile);

  const keyId =
    getHmacKeyId(profile);


  const canonicalString =
    buildAppsScriptCanonicalString(
      request
    );


  const signature =
    createHmac(
      "sha256",
      Buffer.from(
        secret,
        "utf8"
      )
    )
      .update(
        Buffer.from(
          canonicalString,
          "utf8"
        )
      )
      .digest(
        "hex"
      )
      .toLowerCase();


  return {
    scheme:
      APPS_SCRIPT_HMAC_SCHEME,

    keyId,

    signature
  };
}