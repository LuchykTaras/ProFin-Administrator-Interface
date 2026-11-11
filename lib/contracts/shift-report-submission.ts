
export const SHIFT_REPORT_SUBMISSION_VERSION =
  "PROFIN_SHIFT_REPORT_SUBMISSION_V1_2026" as const;

export const SHIFT_REPORT_METRIC_KEYS = [
  "dailyReceipts",
  "uniqueClients",
  "paidConsultations",
  "vaccinesSold",
  "vaccinesAdministered",
  "packagesSold",
  "newClients"
] as const;

export const SHIFT_REPORT_ACCOUNT_KEYS = [
  "Каса, грн",
  "Рахунок А-Банк, грн",
  "Рахунок Моно, грн",
  "Сейф"
] as const;

export type ShiftReportMetricKey =
  (typeof SHIFT_REPORT_METRIC_KEYS)[number];

export type ShiftReportAccountKey =
  (typeof SHIFT_REPORT_ACCOUNT_KEYS)[number];

export type ShiftReportMetricInput = {
  actual: number;
  comment?: string | null;
};

export type ShiftReportAccountInput = {
  actualEnd: number;
  comment?: string | null;
};

export type ShiftReportSubmissionDraft = {
  date: string;
  revision: string;

  metrics: Record<
    ShiftReportMetricKey,
    ShiftReportMetricInput
  >;

  accounts: Record<
    ShiftReportAccountKey,
    ShiftReportAccountInput
  >;

  confirmInitialBalances?: boolean;

  initialBalances?: Record<
    ShiftReportAccountKey,
    number
  >;

  comment?: string | null;
};

export type ShiftReportTrustedSubmission =
  ShiftReportSubmissionDraft & {
    requestId: string;
  };
