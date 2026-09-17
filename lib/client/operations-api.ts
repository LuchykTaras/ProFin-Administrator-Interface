import type {
  CreateOperationInput,
  CreateOperationResult,
  OperationFormSchema
} from "@/lib/contracts/operations";

import {
  ApiClientError,
  apiRequest
} from "@/lib/client/api-client";


export type GetOperationFormSchemaOptions = {
  operationType?:
    string | null;

  category?:
    string | null;

  article?:
    string | null;

  signal?:
    AbortSignal;
};


export type CreateOperationOptions = {
  operation:
    CreateOperationInput;

  idempotencyKey:
    string;

  signal?:
    AbortSignal;
};


export type CreateOperationClientResult = {
  operation:
    CreateOperationResult;

  idempotencyReplayed:
    boolean;
};


/*
 * READ:
 * отримання server-driven schema.
 */
export async function getOperationFormSchema(
  options:
    GetOperationFormSchemaOptions =
      {}
): Promise<
  OperationFormSchema
> {
  const params =
    new URLSearchParams();


  if (
    options.operationType
  ) {
    params.set(
      "type",
      options.operationType
    );
  }


  if (
    options.category
  ) {
    params.set(
      "category",
      options.category
    );
  }


  if (
    options.article
  ) {
    params.set(
      "article",
      options.article
    );
  }


  const query =
    params.toString();


  const path =
    query
      ? `/api/operations/form-schema?${query}`
      : "/api/operations/form-schema";


  const envelope =
    await apiRequest<
      OperationFormSchema
    >(
      path,
      {
        method:
          "GET",

        signal:
          options.signal
      }
    );


  if (
    !envelope.data
  ) {
    throw new ApiClientError({
      status:
        200,

      code:
        "EMPTY_OPERATION_FORM_SCHEMA",

      userMessage:
        "Сервер не повернув структуру форми операції.",

      requestId:
        envelope.requestId,

      retryable:
        true
    });
  }


  return envelope.data;
}


/*
 * PATCH 40
 *
 * WRITE:
 *
 * Browser
 *   ↓
 * POST /api/operations/create
 *   ↓
 * Next.js server
 *   ↓
 * session / RBAC
 *   ↓
 * createOperationWeb
 *   ↓
 * Apps Script domain core
 *   ↓
 * Google Sheets
 */
export async function createOperation(
  options:
    CreateOperationOptions
): Promise<
  CreateOperationClientResult
> {
  const envelope =
    await apiRequest<
      CreateOperationClientResult
    >(
      "/api/operations/create",
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",

          "idempotency-key":
            options.idempotencyKey
        },

        body:
          JSON.stringify({
            operation:
              options.operation
          }),

        signal:
          options.signal
      }
    );


  if (
    !envelope.data ||
    !envelope.data.operation ||
    !envelope
      .data
      .operation
      .operationId
  ) {
    throw new ApiClientError({
      status:
        502,

      code:
        "EMPTY_CREATE_OPERATION_RESULT",

      userMessage:
        "Сервер не підтвердив проведення операції.",

      requestId:
        envelope.requestId,

      retryable:
        false
    });
  }


  return envelope.data;
}