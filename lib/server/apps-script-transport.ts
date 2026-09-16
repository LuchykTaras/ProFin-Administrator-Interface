import "server-only";

import {
  randomBytes
} from "node:crypto";

import {
  APPS_SCRIPT_ADAPTER_CLIENT_VERSION,
  APPS_SCRIPT_ADAPTER_PROTOCOL_VERSION
} from "@/lib/contracts/apps-script-adapter";

import type {
  AppsScriptAdapterCommand,
  AppsScriptAdapterContext,
  AppsScriptAdapterRequest,
  AppsScriptAdapterResponse,
  UnsignedAppsScriptAdapterRequest
} from "@/lib/contracts/apps-script-adapter";

import {
  signAppsScriptRequest
} from "@/lib/server/apps-script-signing";

import {
  resolveAppsScriptAnnualRoute
} from "@/lib/server/apps-script-route";

import type {
  AppsScriptAnnualRoute
} from "@/lib/server/apps-script-route";

import {
  AppError
} from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";


const DEFAULT_TIMEOUT_MS =
  15000;


type CallAppsScriptAdapterParams<
  TPayload
> = {
  requestId:
    string;

  command:
    AppsScriptAdapterCommand;

  context:
    SessionContext;

  payload:
    TPayload;

  idempotencyKey?:
    string | null;

  operationDate?:
    string | null;
};


type SignedAppsScriptAdapterContext =
  AppsScriptAdapterContext & {
    annualRoute:
      AppsScriptAnnualRoute;
  };


function getAppsScriptWebAppUrl():
string {
  const raw =
    process.env
      .APPS_SCRIPT_WEB_APP_URL
      ?.trim();


  if (!raw) {
    throw new AppError({
      status:
        503,

      code:
        "APPS_SCRIPT_NOT_CONFIGURED",

      userMessage:
        "Apps Script adapter ще не налаштований.",

      technicalMessage:
        "APPS_SCRIPT_WEB_APP_URL is missing."
    });
  }


  let parsed:
    URL;


  try {
    parsed =
      new URL(
        raw
      );
  } catch {
    throw new AppError({
      status:
        500,

      code:
        "INVALID_APPS_SCRIPT_URL",

      userMessage:
        "Некоректна конфігурація Apps Script adapter.",

      technicalMessage:
        "APPS_SCRIPT_WEB_APP_URL is not a valid URL."
    });
  }


  if (
    parsed.protocol !==
    "https:"
  ) {
    throw new AppError({
      status:
        500,

      code:
        "INVALID_APPS_SCRIPT_PROTOCOL",

      userMessage:
        "Некоректна конфігурація Apps Script adapter.",

      technicalMessage:
        "Apps Script Web App URL must use HTTPS."
    });
  }


  return raw;
}


function getTimeoutMs():
number {
  const raw =
    process.env
      .APPS_SCRIPT_TIMEOUT_MS;


  if (!raw) {
    return DEFAULT_TIMEOUT_MS;
  }


  const value =
    Number(
      raw
    );


  if (
    !Number.isFinite(
      value
    ) ||
    value < 1000 ||
    value > 60000
  ) {
    return DEFAULT_TIMEOUT_MS;
  }


  return Math.floor(
    value
  );
}


function createNonce():
string {
  return randomBytes(
    16
  ).toString(
    "hex"
  );
}


function commandRequiresIdempotency(
  command:
    AppsScriptAdapterCommand
): boolean {
  return [
    "idempotencyProbe",
    "createOperationWeb",
    "createTransfer",
    "acceptTransfer",
    "cancelOperation",
    "requestCorrection",
    "closeShift"
  ].includes(
    String(
      command
    )
  );
}


function buildAdapterContext(
  context:
    SessionContext,

  annualRoute:
    AppsScriptAnnualRoute
): SignedAppsScriptAdapterContext {
  return {
    projectId:
      context.projectId,

    locationId:
      context.locationId,

    activeYear:
      context.activeYear,

    userId:
      context.userId,

    role:
      context.role,

    timezone:
      context.timezone,

    locale:
      context.locale,

    /*
     * PATCH 33.
     *
     * spreadsheetId ніколи не приходить
     * із browser payload.
     *
     * Його дістає сервер із year_registry
     * і лише після цього підписує HMAC.
     */
    annualRoute:
      annualRoute
  };
}


function isRecord(
  value:
    unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null
  );
}


function isAdapterResponse(
  value:
    unknown
): value is
  AppsScriptAdapterResponse<unknown> {
  if (
    !isRecord(
      value
    )
  ) {
    return false;
  }


  return (
    typeof value.protocolVersion ===
      "string" &&

    typeof value.requestId ===
      "string" &&

    typeof value.ok ===
      "boolean" &&

    typeof value.status ===
      "number" &&

    typeof value.code ===
      "string" &&

    typeof value.userMessage ===
      "string" &&

    (
      value.technicalMessage ===
        null ||
      typeof value.technicalMessage ===
        "string"
    ) &&

    typeof value.retryable ===
      "boolean"
  );
}


function normalizeAdapterStatus(
  status:
    number
): number {
  if (
    Number.isInteger(
      status
    ) &&
    status >= 400 &&
    status <= 599
  ) {
    return status;
  }


  return 502;
}


export async function callAppsScriptAdapter<
  TPayload,
  TData
>(
  params:
    CallAppsScriptAdapterParams<TPayload>
): Promise<
  AppsScriptAdapterResponse<TData>
> {
  const url =
    getAppsScriptWebAppUrl();


  /*
   * PATCH 33:
   *
   * ACTIVE workbook визначає сервер.
   *
   * Browser не може передати
   * spreadsheetId.
   */
  const annualRoute =
    await resolveAppsScriptAnnualRoute(
      params.context,
      params.operationDate
    );


  const requiresIdempotency =
    commandRequiresIdempotency(
      params.command
    );


  let idempotencyKey:
    string | null =
      null;


  if (
    requiresIdempotency
  ) {
    const candidate =
      params.idempotencyKey
        ?.trim();


    if (
      !candidate
    ) {
      throw new AppError({
        status:
          500,

        code:
          "IDEMPOTENCY_KEY_REQUIRED_BY_COMMAND",

        userMessage:
          "Не вдалося сформувати захищену команду.",

        technicalMessage:
          `Command ${String(
            params.command
          )} requires idempotencyKey.`,

        retryable:
          false
      });
    }


    idempotencyKey =
      candidate;
  }


  const timeoutMs =
    getTimeoutMs();


  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs
    );


  const unsignedRequest:
    UnsignedAppsScriptAdapterRequest<TPayload> = {
      protocolVersion:
        APPS_SCRIPT_ADAPTER_PROTOCOL_VERSION,

      clientVersion:
        APPS_SCRIPT_ADAPTER_CLIENT_VERSION,

      requestId:
        params.requestId,

      command:
        params.command,

      sentAt:
        new Date()
          .toISOString(),

      nonce:
        createNonce(),

      context:
        buildAdapterContext(
          params.context,
          annualRoute
        ),

      idempotencyKey:
        idempotencyKey,

      payload:
        params.payload
    };

console.log(
  "[APPS_SCRIPT_OUTGOING]",
  {
    requestId:
      unsignedRequest.requestId,

    command:
      unsignedRequest.command,

    nonce:
      unsignedRequest.nonce,

    sentAt:
      unsignedRequest.sentAt
  }
);

  const auth =
    signAppsScriptRequest(
      unsignedRequest
    );


  const requestEnvelope:
    AppsScriptAdapterRequest<TPayload> = {
      ...unsignedRequest,

      auth
    };


  let response:
    Response;


  try {
    response =
      await fetch(
        url,
        {
          method:
            "POST",

          headers: {
            "content-type":
              "application/json",

            "accept":
              "application/json"
          },

          body:
            JSON.stringify(
              requestEnvelope
            ),

          cache:
            "no-store",

          redirect:
            "follow",

          signal:
            controller.signal
        }
      );
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new AppError({
        status:
          504,

        code:
          "APPS_SCRIPT_TIMEOUT",

        userMessage:
          "Apps Script не відповів вчасно.",

        technicalMessage:
          `Apps Script timeout after ${timeoutMs} ms.`,

        retryable:
          true
      });
    }


    throw new AppError({
      status:
        502,

      code:
        "APPS_SCRIPT_NETWORK_ERROR",

      userMessage:
        "Не вдалося підключитися до Apps Script.",

      technicalMessage:
        error instanceof Error
          ? error.message
          : String(
              error
            ),

      retryable:
        true
    });
  } finally {
    clearTimeout(
      timeout
    );
  }


  let rawText:
    string;


  try {
    rawText =
      await response.text();
  } catch (error) {
    throw new AppError({
      status:
        502,

      code:
        "APPS_SCRIPT_RESPONSE_READ_FAILED",

      userMessage:
        "Не вдалося прочитати відповідь Apps Script.",

      technicalMessage:
        error instanceof Error
          ? error.message
          : String(
              error
            ),

      retryable:
        true
    });
  }


  let raw:
    unknown;


  try {
    raw =
      JSON.parse(
        rawText
      );
  } catch {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_APPS_SCRIPT_JSON",

      userMessage:
        "Apps Script повернув некоректну відповідь.",

      technicalMessage:
        rawText.slice(
          0,
          500
        ),

      retryable:
        false
    });
  }


  if (
    !isAdapterResponse(
      raw
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_APPS_SCRIPT_ENVELOPE",

      userMessage:
        "Apps Script повернув невідомий формат даних.",

      technicalMessage:
        "Response does not match AppsScriptAdapterResponse.",

      retryable:
        false
    });
  }


  if (
    raw.protocolVersion !==
    APPS_SCRIPT_ADAPTER_PROTOCOL_VERSION
  ) {
    throw new AppError({
      status:
        502,

      code:
        "APPS_SCRIPT_PROTOCOL_MISMATCH",

      userMessage:
        "Версія Apps Script adapter несумісна з вебінтерфейсом.",

      technicalMessage:
        `Expected ${APPS_SCRIPT_ADAPTER_PROTOCOL_VERSION}, got ${raw.protocolVersion}.`,

      retryable:
        false
    });
  }


  if (
    raw.requestId !==
    params.requestId
  ) {
    throw new AppError({
      status:
        502,

      code:
        "APPS_SCRIPT_REQUEST_ID_MISMATCH",

      userMessage:
        "Некоректна відповідь Apps Script.",

      technicalMessage:
        `Request ID mismatch. Expected ${params.requestId}, got ${raw.requestId}.`,

      retryable:
        false
    });
  }


  if (
    !response.ok
  ) {
    throw new AppError({
      status:
        502,

      code:
        "APPS_SCRIPT_HTTP_ERROR",

      userMessage:
        "Apps Script повернув HTTP-помилку.",

      technicalMessage:
        `HTTP ${response.status}.`,

      retryable:
        response.status >=
        500
    });
  }


  if (
    !raw.ok
  ) {
    throw new AppError({
      status:
        normalizeAdapterStatus(
          raw.status
        ),

      code:
        raw.code,

      userMessage:
        raw.userMessage,

      technicalMessage:
        raw.technicalMessage ??
        undefined,

      retryable:
        raw.retryable
    });
  }


  return raw as
    AppsScriptAdapterResponse<TData>;
}