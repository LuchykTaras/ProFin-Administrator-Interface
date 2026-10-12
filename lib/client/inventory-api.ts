import type {
  InventoryData
} from "@/lib/contracts/inventory";

import {
  ApiClientError,
  apiRequest
} from "@/lib/client/api-client";


export async function getInventory(
  signal?:
    AbortSignal
): Promise<InventoryData> {
  const envelope =
    await apiRequest<InventoryData>(
      "/api/inventory",
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
        "EMPTY_INVENTORY_RESPONSE",

      userMessage:
        "Сервер не повернув дані складу.",

      requestId:
        envelope.requestId,

      retryable:
        true
    });
  }


  return envelope.data;
}