import type {
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