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
  IncomingTransferItem,
  OutgoingTransferItem,
  ReturnTransferInput,
  ReturnTransferResult,
  TransferInboxResult,
  TransferOutboxResult,
  TransferPlanInput,
  TransferPlanResult,
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


// ============================================================
// Transfer workspace settings
// ============================================================

type TransferWorkspaceSettings = {
  routes: TransferRouteOption[];
  writeEnabled: boolean;
};

export async function getTransferWorkspaceSettings(
  signal?: AbortSignal
): Promise<TransferWorkspaceSettings> {
  const response = await apiRequest<TransferWorkspaceSettings>(
    "/api/transfers/routes",
    {
      method: "GET",
      signal
    }
  );

  return {
    routes: response.data?.routes ?? [],
    writeEnabled: response.data?.writeEnabled === true
  };
}


// ============================================================
// Transfer preview — read-only
// ============================================================

type PreviewTransferOptions = {
  input: TransferPlanInput;
  signal?: AbortSignal;
};

export async function previewTransfer({
  input,
  signal
}: PreviewTransferOptions): Promise<TransferPlanResult> {
  const response = await apiRequest<TransferPlanResult>(
    "/api/transfers/plan",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input),
      signal
    }
  );

  if (!response.data) {
    throw new ApiClientError({
      status: 502,
      code: "EMPTY_TRANSFER_PREVIEW",
      requestId: response.requestId,
      userMessage: "Ядро не повернуло план переміщення.",
      retryable: false
    });
  }

  return response.data;
}


// ============================================================
// Incoming transfers
// ============================================================

export async function getTransferInbox(
  signal?: AbortSignal
): Promise<TransferInboxResult> {
  const response = await apiRequest<TransferInboxResult>(
    "/api/transfers/inbox",
    {
      method: "GET",
      signal
    }
  );

  if (!response.data) {
    throw new ApiClientError({
      status: 502,
      code: "EMPTY_TRANSFER_INBOX",
      requestId: response.requestId,
      userMessage: "Сервер не повернув вхідні переміщення.",
      retryable: false
    });
  }

  return response.data;
}


// ============================================================
// Outgoing transfers
// ============================================================

export async function getTransferOutbox(
  signal?: AbortSignal
): Promise<TransferOutboxResult> {
  const response = await apiRequest<TransferOutboxResult>(
    "/api/transfers/outbox",
    {
      method: "GET",
      signal
    }
  );

  if (!response.data) {
    throw new ApiClientError({
      status: 502,
      code: "EMPTY_TRANSFER_OUTBOX",
      requestId: response.requestId,
      userMessage: "Сервер не повернув відправлені переміщення.",
      retryable: false
    });
  }

  return response.data;
}


// ============================================================
// Return transfer
// ============================================================

export function returnTransfer(
  options: CommandOptions<ReturnTransferInput>
): Promise<IdempotentCommandResult<ReturnTransferResult>> {
  return postCommand<
    ReturnTransferInput,
    ReturnTransferResult
  >(
    "/api/transfers/return",
    options,
    "EMPTY_RETURN_TRANSFER_RESULT",
    "Сервер не підтвердив повернення переміщення."
  );
}
