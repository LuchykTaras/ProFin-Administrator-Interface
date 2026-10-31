import { apiRequest, ApiClientError } from "@/lib/client/api-client";
import type {
  ClientCreateA83Request,
  ClientCreateA83Result
} from "@/lib/contracts/client-create-a83";

export async function submitClientA83(
  body: ClientCreateA83Request,
  idempotencyKey: string
): Promise<ClientCreateA83Result> {
  const response = await apiRequest<ClientCreateA83Result>("/api/clients", {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(body)
  });
  if (!response.data) {
    throw new ApiClientError({
      status: 502,
      code: "A83_RESPONSE_EMPTY",
      userMessage: "Client API did not return the result.",
      requestId: response.requestId,
      retryable: true
    });
  }
  return response.data;
}
