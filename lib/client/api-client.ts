import type {
  ApiEnvelope
} from "@/lib/contracts/interface";


type ApiClientErrorArgs = {
  status: number;

  code: string;

  userMessage: string;

  technicalMessage?:
    string | null;

  requestId?:
    string | null;

  retryable?:
    boolean;
};


export class ApiClientError
  extends Error {
  status: number;

  code: string;

  userMessage: string;

  technicalMessage:
    string | null;

  requestId:
    string | null;

  retryable: boolean;


  constructor(
    args: ApiClientErrorArgs
  ) {
    super(
      args.userMessage
    );

    this.name =
      "ApiClientError";

    this.status =
      args.status;

    this.code =
      args.code;

    this.userMessage =
      args.userMessage;

    this.technicalMessage =
      args.technicalMessage ??
      null;

    this.requestId =
      args.requestId ??
      null;

    this.retryable =
      args.retryable ??
      false;
  }
}


function isRecord(
  value: unknown
): value is
  Record<string, unknown> {
  return (
    typeof value ===
      "object" &&
    value !== null
  );
}


function isApiEnvelope(
  value: unknown
): value is
  ApiEnvelope<unknown> {
  if (
    !isRecord(
      value
    )
  ) {
    return false;
  }


  return (
    typeof value.ok ===
      "boolean" &&

    typeof value.code ===
      "string" &&

    typeof value.userMessage ===
      "string" &&

    typeof value.requestId ===
      "string" &&

    typeof value.retryable ===
      "boolean"
  );
}


export async function apiRequest<T>(
  path: string,

  init:
    RequestInit = {}
): Promise<
  ApiEnvelope<T>
> {
  const headers =
    new Headers(
      init.headers
    );


  headers.set(
    "Accept",
    "application/json"
  );


  if (
    init.body &&
    !headers.has(
      "Content-Type"
    )
  ) {
    headers.set(
      "Content-Type",
      "application/json"
    );
  }


  let response:
    Response;


  try {
    response =
      await fetch(
        path,
        {
          ...init,

          headers,

          credentials:
            "same-origin",

          cache:
            init.cache ??
            "no-store"
        }
      );
  } catch (error) {
    if (
      error instanceof
        DOMException &&
      error.name ===
        "AbortError"
    ) {
      throw error;
    }


    throw new ApiClientError({
      status:
        0,

      code:
        "NETWORK_ERROR",

      userMessage:
        "Не вдалося підключитися до серверного API.",

      technicalMessage:
        error instanceof Error
          ? error.message
          : null,

      retryable:
        true
    });
  }


  let raw:
    unknown;


  try {
    raw =
      await response
        .json();
  } catch {
    throw new ApiClientError({
      status:
        response.status,

      code:
        "INVALID_API_RESPONSE",

      userMessage:
        "Сервер повернув некоректну відповідь.",

      technicalMessage:
        "Response is not a valid ProFin API envelope.",

      retryable:
        response.status >=
        500
    });
  }


  if (
    !isApiEnvelope(
      raw
    )
  ) {
    throw new ApiClientError({
      status:
        response.status,

      code:
        "INVALID_API_ENVELOPE",

      userMessage:
        "Сервер повернув невідомий формат даних.",

      technicalMessage:
        "Expected ProFin ApiEnvelope.",

      retryable:
        false
    });
  }


  const envelope =
    raw as
      ApiEnvelope<T>;


  if (
    !response.ok ||
    !envelope.ok
  ) {
    throw new ApiClientError({
      status:
        response.status,

      code:
        envelope.code,

      userMessage:
        envelope.userMessage ||
        "Запит не виконано.",

      technicalMessage:
        envelope
          .technicalMessage,

      requestId:
        envelope
          .requestId,

      retryable:
        envelope
          .retryable
    });
  }


  return envelope;
}


export function getApiErrorMessage(
  error: unknown,

  fallback:
    string
): string {
  if (
    error instanceof
    ApiClientError
  ) {
    return (
      error.userMessage ||
      fallback
    );
  }


  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }


  return fallback;
}