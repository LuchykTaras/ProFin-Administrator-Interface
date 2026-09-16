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


const PROFIN_HMAC_CANONICAL_VERSION =
  "PROFIN-HMAC-V1";


function getHmacSecret():
string {
  const secret =
    process.env
      .APPS_SCRIPT_HMAC_SECRET
      ?.trim();


  if (!secret) {
    throw new AppError({
      status:
        500,

      code:
        "APPS_SCRIPT_HMAC_SECRET_MISSING",

      userMessage:
        "Не налаштовано захищений канал Apps Script.",

      technicalMessage:
        "APPS_SCRIPT_HMAC_SECRET is missing."
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
        "APPS_SCRIPT_HMAC_SECRET must contain at least 32 characters."
    });
  }


  return secret;
}


function getHmacKeyId():
string {
  const keyId =
    process.env
      .APPS_SCRIPT_HMAC_KEY_ID
      ?.trim();


  if (!keyId) {
    throw new AppError({
      status:
        500,

      code:
        "APPS_SCRIPT_HMAC_KEY_ID_MISSING",

      userMessage:
        "Не налаштовано ідентифікатор ключа Apps Script.",

      technicalMessage:
        "APPS_SCRIPT_HMAC_KEY_ID is missing."
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


  return [
    PROFIN_HMAC_CANONICAL_VERSION,

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
  const secret =
    getHmacSecret();


  const keyId =
    getHmacKeyId();


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