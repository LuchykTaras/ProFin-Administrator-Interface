export const OPERATION_JOURNAL_CONTRACT_VERSION =
  "PROFIN_OPERATION_JOURNAL_V1" as const;


export type OperationJournalColumnKey =
  | "operationId"
  | "account"
  | "targetAccount"
  | "transactionDate"
  | "unitPrice"
  | "quantity"
  | "amount"
  | "doctor"
  | "patient"
  | "operationType"
  | "category"
  | "article"
  | "comment"
  | "paymentMonth"
  | "accrualMonth"
  | "accountingType"
  | "packageName"
  | "packageStartDate"
  | "packageDuration"
  | "packageMonthlyAmount"
  | "vaccineName"
  | "vaccineQuantity"
  | "vaccineUseDate"
  | "vaccineCost"
  | "vaccineId"
  | "assetName"
  | "assetCategory"
  | "assetAmortizationYears"
  | "assetStartDate"
  | "recordStatus"
  | "createdDate"
  | "createdTime"
  | "createdBy";


export type OperationJournalColumnKind =
  | "text"
  | "number"
  | "date"
  | "time";


export type OperationJournalCellValue =
  | string
  | number
  | null;


export type OperationJournalColumn = {
  key:
    OperationJournalColumnKey;

  label:
    string;

  kind:
    OperationJournalColumnKind;
};


export type OperationJournalRow = {
  rowNumber:
    number;

  values:
    Partial<
      Record<
        OperationJournalColumnKey,
        OperationJournalCellValue
      >
    >;
};


export type OperationJournalMode =
  | "INITIAL"
  | "DELTA";


export type OperationJournalData = {
  contractVersion:
    typeof OPERATION_JOURNAL_CONTRACT_VERSION;

  sourceSheet:
    "База операцій";

  policyVersion:
    string;

  monthKey:
    string;

  period: {
    from:
      string;

    to:
      string;
  };

  isCurrentMonth:
    boolean;

  live:
    boolean;

  mode:
    OperationJournalMode;

  returnedCount:
    number;

  monthTotal:
    number | null;

  latestRowNumber:
    number | null;

  latestOperationId:
    string | null;

  columns:
    OperationJournalColumn[];

  rows:
    OperationJournalRow[];
};