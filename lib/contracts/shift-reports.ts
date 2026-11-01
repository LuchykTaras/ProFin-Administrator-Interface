
export const SHIFT_REPORTS_CONTRACT_VERSION =
  "PROFIN_SHIFT_HISTORY_V1_2026" as const;

export type ShiftReport = {
  shiftId: string;
  shiftDate: string;
  submittedAt: string | null;
  administrator: string;
  status: string;
  income: number | null;
  visits: number | null;
  helsiVisits: number | null;
  newClients: number | null;
  problemOperations: number | null;
  vaccineEvents: number | null;
  packageOperations: number | null;
  helsiMismatchCategories: number | null;
  calculatedCash: number | null;
  actualCash: number | null;
  cashDifference: number | null;
  accrualStatus: string;
  comment: string;
  warning: string;
};

export type ShiftMonthSummary = {
  month: number;
  reports: number;
  matched: number;
  needsReview: number;
  other: number;
};

export type ShiftReportsData = {
  version: string;
  year: number;
  month: number;
  timezone: string;
  reports: ShiftReport[];
  summary: {
    year: number;
    totalReports: number;
    months: ShiftMonthSummary[];
  };
  selectedReport: ShiftReport | null;
  details: Array<Record<string, string | number | null>>;
  source: {
    reportsSheet: string;
    detailsSheet: string;
  };
};
