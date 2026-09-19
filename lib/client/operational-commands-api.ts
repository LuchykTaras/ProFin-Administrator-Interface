import type {
  AcceptTransferInput,
  AcceptTransferResult,
  CancelOperationInput,
  CancelOperationResult,
  CloseShiftInput,
  CloseShiftResult,
  CreateTransferInput,
  CreateTransferResult,
  IdempotentCommandResult,
  TransferRouteOption
} from "@/lib/contracts/operational-commands";

import {
  ApiClientError,
  apiRequest
} from "@/lib/client/api-client";

type CommandOptions<T> = {
  input: T;
  idempotencyKey: string;
  signal?: AbortSignal;
};

async function postCommand<TInput, TResult>(
  path: string,
  options: CommandOptions<TInput>,
  emptyCode: string,
  emptyMessage: string
): Promise<IdempotentCommandResult<TResult>> {
  const envelope =
    await apiRequest<
      IdempotentCommandResult<TResult>
    >(
      path,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "idempotency-key":
            options.idempotencyKey
        },
        body: JSON.stringify(
          options.input
        ),
        signal: options.signal
      }
    );

  if (!envelope.data?.result) {
    throw new ApiClientError({
      status: 502,
      code: emptyCode,
      userMessage: emptyMessage,
      requestId:
        envelope.requestId,
      retryable: false
    });
  }

  return envelope.data;
}


export async function getTransferRoutes(
  signal?: AbortSignal
): Promise<TransferRouteOption[]> {
  const envelope =
    await apiRequest<{
      routes: TransferRouteOption[];
    }>(
      "/api/transfers/routes",
      {
        method: "GET",
        signal
      }
    );

  return envelope.data?.routes ?? [];
}

export function cancelOperation(
  options:
    CommandOptions<CancelOperationInput>
) {
  return postCommand<
    CancelOperationInput,
    CancelOperationResult
  >(
    "/api/operations/cancel",
    options,
    "EMPTY_CANCEL_OPERATION_RESULT",
    "Сервер не підтвердив скасування операції."
  );
}

export function createTransfer(
  options:
    CommandOptions<CreateTransferInput>
) {
  return postCommand<
    CreateTransferInput,
    CreateTransferResult
  >(
    "/api/transfers/create",
    options,
    "EMPTY_CREATE_TRANSFER_RESULT",
    "Сервер не підтвердив створення переміщення."
  );
}

export function acceptTransfer(
  options:
    CommandOptions<AcceptTransferInput>
) {
  return postCommand<
    AcceptTransferInput,
    AcceptTransferResult
  >(
    "/api/transfers/accept",
    options,
    "EMPTY_ACCEPT_TRANSFER_RESULT",
    "Сервер не підтвердив приймання переміщення."
  );
}

export function closeShift(
  options:
    CommandOptions<CloseShiftInput>
) {
  return postCommand<
    CloseShiftInput,
    CloseShiftResult
  >(
    "/api/shifts/close",
    options,
    "EMPTY_CLOSE_SHIFT_RESULT",
    "Сервер не підтвердив закриття зміни."
  );
}