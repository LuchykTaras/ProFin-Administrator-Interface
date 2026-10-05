import type {
  ClientBirthdaysData
} from "@/lib/contracts/clients";

import {
  ApiClientError,
  apiRequest
} from "@/lib/client/api-client";


export async function getClientBirthdays(
  options: {
    daysAhead?: number;
    signal?: AbortSignal;
  } = {}
): Promise<ClientBirthdaysData> {
  const params =
    new URLSearchParams();


  if (
    typeof options.daysAhead ===
      "number"
  ) {
    params.set(
      "days",
      String(
        options.daysAhead
      )
    );
  }


  const query =
    params.toString();


  const envelope =
    await apiRequest<ClientBirthdaysData>(
      query
        ? `/api/clients/birthdays?${query}`
        : "/api/clients/birthdays",
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
        "EMPTY_CLIENT_BIRTHDAYS",

      userMessage:
        "Сервер не повернув список іменинників.",

      requestId:
        envelope.requestId,

      retryable:
        true
    });
  }


  return envelope.data;
}