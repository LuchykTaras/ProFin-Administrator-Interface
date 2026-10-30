import { apiRequest, ApiClientError } from "@/lib/client/api-client";
import type { ClientDirectoryData } from "@/lib/contracts/client-directory";

export async function getClientDirectoryPage(options: {
  query: string;
  offset: number;
  limit?: number;
  signal?: AbortSignal;
}): Promise<ClientDirectoryData> {
  const params = new URLSearchParams({
    q: options.query,
    offset: String(options.offset),
    limit: String(options.limit ?? 50)
  });
  const response = await apiRequest<ClientDirectoryData>(
    `/api/clients?${params.toString()}`,
    { method: "GET", signal: options.signal }
  );
  if (!response.data) {
    throw new ApiClientError({
      status: 502,
      code: "CLIENT_DIRECTORY_EMPTY_RESPONSE",
      userMessage: "Сервер не повернув клієнтську базу.",
      requestId: response.requestId,
      retryable: true
    });
  }
  return response.data;
}
