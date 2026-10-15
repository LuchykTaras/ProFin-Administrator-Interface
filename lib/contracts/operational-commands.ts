export const OPERATIONAL_COMMANDS_CONTRACT_VERSION =
  "PROFIN_OPERATIONAL_COMMANDS_PATCH_35_2026" as const;

export type CancelOperationInput = {
  operationId: string;
};

export type CancelOperationResult = {
  version: string;
  operationId: string;
  operationKind: string;
  eventId: string | null;
  status: "CANCELLED";
  warnings: string[];
};

export type CreateTransferInput = {
  routeId: string;
  sourceLotId: string;
  quantity: number;
  operationDate: string;
  expectedSourceBalance: number;
};

export type TransferRouteOption = {
  routeId: string;
  direction: "OUTGOING" | "INCOMING";
  counterpartyLocationId: string;
  counterpartyLocationName: string;
  counterpartyCode: string;
};

export type CreateTransferResult = {
  version: string;
  transferId: string;
  receiverLotId: string;
  sourceBranch: string;
  destinationBranch: string;
  inventoryType: string;
  inventoryName: string;
  quantity: number;
  status: string;
  warnings: string[];
};

export type AcceptTransferInput = {
  routeId: string;
  transferId: string;
};

export type AcceptTransferResult = {
  version: string;
  transferId: string;
  receiverLotId: string;
  sourceBranch: string;
  destinationBranch: string;
  inventoryType: string;
  inventoryName: string;
  quantity: number;
  transferStatus: string;
  warnings: string[];
};

export type CloseShiftInput = {
  actualCash: number;
  comment?: string | null;
};

export type CloseShiftStatus =
  | "MATCHED"
  | "NEEDS_REVIEW"
  | "INCOMPLETE"
  | "BLOCKED";

export type CloseShiftResult = {
  version: string;
  shiftId: string;
  shiftDate: string;
  periodStart: string;
  periodEnd: string;
  openingCash: number;
  cashIncome: number;
  cashExpense: number;
  collection: number;
  calculatedCash: number;
  actualCash: number;
  difference: number;
  status: CloseShiftStatus;
  sourceChecksum: string;
  sourceRowCount: number;
  problemOperationCount: number;
  helsiStatus: "NOT_CONNECTED" | "NOT_REQUIRED";
  warnings: string[];
};


export type IdempotentCommandResult<T> = {
  result: T;
  idempotencyReplayed: boolean;
};


// ============================================================
// Transfer planning
// ============================================================

export type TransferPlanInput = Omit<
  CreateTransferInput,
  "expectedSourceBalance"
>;

export type TransferPlanResult = {
  sourceLotId: string;

  inventoryName: string;
  inventoryType: string;

  series: string | null;
  expiryDate: string | null;

  sourceBranch: string;
  destinationBranch: string;

  quantity: number;
  sourceBalanceBefore: number;
  sourceBalanceAfter: number;

  operationDate: string;
  warnings: string[];
};


// ============================================================
// Incoming transfers
// ============================================================

export type IncomingTransferItem = {
  routeId: string;
  transferId: string;

  sourceLotId: string;
  receiverLotId: string;

  inventoryName: string;
  inventoryType: string;

  series: string | null;
  expiryDate: string | null;

  quantity: number;

  sourceBranch: string;
  destinationBranch: string;

  status: string;

  canAccept: boolean;
  canReturn: boolean;
};

export type TransferInboxResult = {
  checkedAt: string;
  items: IncomingTransferItem[];
};


// ============================================================
// Outgoing transfers
// ============================================================

export type OutgoingTransferItem = {
  routeId: string;
  transferId: string;

  sourceLotId: string;
  receiverLotId: string;

  inventoryName: string;
  inventoryType: string;

  series: string | null;
  quantity: number;

  sourceBranch: string;
  destinationBranch: string;

  status: string;
  pairedVerified: boolean;
};

export type TransferOutboxResult = {
  checkedAt: string;
  items: OutgoingTransferItem[];
};


// ============================================================
// Transfer returns
// ============================================================

export type ReturnTransferInput = {
  routeId: string;
  transferId: string;
};

export type ReturnTransferResult = {
  transferId: string;
  status: string;
  warnings: string[];
};
