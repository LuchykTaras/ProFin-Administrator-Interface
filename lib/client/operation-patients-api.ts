import {
  apiRequest,
  ApiClientError
} from "@/lib/client/api-client";

import type {
  OperationFieldOption
} from "@/lib/contracts/operations";

export async function getOperationPatientOptions(
  signal?: AbortSignal
): Promise<OperationFieldOption[]> {
  const response = await apiRequest<{
    patients: OperationFieldOption[];
  }>(
    "/api/operations/patient-options",
    {
      method: "GET",
      signal,
      cache: "no-store"
    }
  );

  if (
    !response.data ||
    !Array.isArray(response.data.patients)
  ) {
    throw new ApiClientError({
      status: 502,
      code: "EMPTY_PATIENT_OPTIONS_RESPONSE",
      userMessage:
        "Сервер не повернув список пацієнтів.",
      requestId: response.requestId,
      retryable: true
    });
  }

  return response.data.patients;
}