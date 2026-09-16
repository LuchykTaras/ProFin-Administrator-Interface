import type {
  InterfaceBootstrapData
} from "@/lib/contracts/interface";

import {
  ApiClientError,
  apiRequest
} from "@/lib/client/api-client";


export async function getInterfaceBootstrap(
  signal?: AbortSignal
): Promise<InterfaceBootstrapData> {
  const envelope =
    await apiRequest<InterfaceBootstrapData>(
      "/api/interface/bootstrap",
      {
        method:
          "GET",

        signal
      }
    );


  if (
    !envelope.data
  ) {
    throw new ApiClientError({
      status:
        200,

      code:
        "EMPTY_INTERFACE_BOOTSTRAP",

      userMessage:
        "Сервер не повернув контекст інтерфейсу.",

      requestId:
        envelope.requestId,

      retryable:
        true
    });
  }


  return envelope.data;
}