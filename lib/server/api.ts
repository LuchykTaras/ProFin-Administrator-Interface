import "server-only";

import {
  randomUUID
} from "node:crypto";

import {
  NextResponse
} from "next/server";

import {
  AppError
} from "@/lib/server/errors";


export type ApiPayload<T> = {
  requestId: string;
  ok: boolean;
  code: string;
  userMessage: string;
  technicalMessage: string | null;
  data: T | null;
  retryable: boolean;
};


export function getRequestId(
  request: Request
): string {
  return (
    request.headers.get("x-request-id") ??
    randomUUID()
  );
}


export function apiOk<T>(
  requestId: string,
  data: T,
  userMessage = "OK",
  code = "OK"
) {
  const payload: ApiPayload<T> = {
    requestId,
    ok: true,
    code,
    userMessage,
    technicalMessage: null,
    data,
    retryable: false
  };

  return NextResponse.json(
    payload,
    {
      status: 200,
      headers: {
        "x-request-id": requestId
      }
    }
  );
}


export function apiFail(
  requestId: string,
  params: {
    status: number;
    code: string;
    userMessage: string;
    technicalMessage?: string;
    retryable?: boolean;
  }
) {
  if (params.technicalMessage) {
    console.error(
      JSON.stringify({
        requestId,
        code: params.code,
        technicalMessage:
          params.technicalMessage
      })
    );
  }

  const payload: ApiPayload<null> = {
    requestId,
    ok: false,
    code: params.code,
    userMessage: params.userMessage,

    /*
     * Не віддаємо внутрішні технічні
     * деталі браузеру касира.
     */
    technicalMessage:
      "See server log by requestId",

    data: null,

    retryable:
      params.retryable ?? false
  };

  return NextResponse.json(
    payload,
    {
      status: params.status,
      headers: {
        "x-request-id": requestId
      }
    }
  );
}


export function apiFromError(
  requestId: string,
  error: unknown
) {
  if (error instanceof AppError) {
    return apiFail(
      requestId,
      {
        status: error.status,
        code: error.code,
        userMessage:
          error.userMessage,
        technicalMessage:
          error.message,
        retryable:
          error.retryable
      }
    );
  }

  console.error(
    JSON.stringify({
      requestId,
      code: "INTERNAL_ERROR",
      error:
        error instanceof Error
          ? error.message
          : String(error)
    })
  );

  return apiFail(
    requestId,
    {
      status: 500,
      code: "INTERNAL_ERROR",
      userMessage:
        "Сталася внутрішня помилка. Спробуйте ще раз.",
      technicalMessage:
        error instanceof Error
          ? error.message
          : String(error),
      retryable: false
    }
  );
}