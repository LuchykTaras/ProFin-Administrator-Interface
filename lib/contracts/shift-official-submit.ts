
export const SHIFT_OFFICIAL_SUBMIT_VERSION =
  "PROFIN_SHIFT_R3_02_CORE_SHAPE_V1" as const;

export const SHIFT_KPI_KEYS = [
  "dailyReceipts",
  "uniqueClients",
  "paidConsultations",
  "vaccinesSold",
  "vaccinesAdministered",
  "packagesSold",
  "newClients"
] as const;

export const SHIFT_ACCOUNT_NAMES = [
  "Каса, грн",
  "Рахунок А-Банк, грн",
  "Рахунок Моно, грн",
  "Сейф"
] as const;

export type ShiftKpiKey =
  typeof SHIFT_KPI_KEYS[number];

export type ShiftAccountName =
  typeof SHIFT_ACCOUNT_NAMES[number];

export type ShiftMetricInput = {
  actual: number;
  comment: string;
};

export type ShiftAccountInput = {
  actualEnd: number;
  comment: string;
};

export type OfficialShiftSubmission = {
  date: string;
  revision: string;
  metrics: Record<ShiftKpiKey, ShiftMetricInput>;
  accounts: Record<ShiftAccountName, ShiftAccountInput>;
  initialBalances: Partial<
    Record<ShiftAccountName, number>
  >;
  confirmInitialBalances: boolean;
  comment: string;
};

export class ShiftContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShiftContractError";
  }
}

function fail(message: string): never {
  throw new ShiftContractError(message);
}

function asObject(
  input: unknown
): Record<string, unknown> {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input)
  ) {
    return fail("Очікується JSON-об'єкт.");
  }

  return input as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): void {
  const provided = Object.keys(value);

  if (
    provided.length !== keys.length ||
    provided.some(key => !keys.includes(key)) ||
    keys.some(
      key => !Object.prototype.hasOwnProperty.call(value, key)
    )
  ) {
    fail("Невідповідність полів затвердженому контракту.");
  }
}

function coreNumber(
  value: unknown,
  field: string,
  whole = false
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > 1e10 ||
    (whole && (!Number.isInteger(value) || value < 0))
  ) {
    return fail(`Некоректне значення: ${field}.`);
  }

  return value;
}

function coreText(
  value: unknown,
  field: string,
  limit: number
): string {
  if (
    typeof value !== "string" ||
    value.trim().length > limit
  ) {
    return fail(`Некоректний текст: ${field}.`);
  }

  return value.trim();
}

function coreDate(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return fail("Некоректна дата зміни.");
  }

  const parsed = new Date(
    `${value}T00:00:00.000Z`
  );

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    return fail("Некоректна календарна дата.");
  }

  return value;
}

function parseMetrics(
  input: unknown
): OfficialShiftSubmission["metrics"] {
  const source = asObject(input);

  exactKeys(source, SHIFT_KPI_KEYS);

  const metrics =
    {} as OfficialShiftSubmission["metrics"];

  for (const key of SHIFT_KPI_KEYS) {
    const item = asObject(source[key]);

    exactKeys(item, ["actual", "comment"]);

    metrics[key] = {
      actual: coreNumber(
        item.actual,
        key,
        key !== "dailyReceipts"
      ),
      comment: coreText(
        item.comment,
        key,
        500
      )
    };
  }

  return metrics;
}

function parseAccounts(
  input: unknown
): OfficialShiftSubmission["accounts"] {
  const source = asObject(input);

  exactKeys(source, SHIFT_ACCOUNT_NAMES);

  const accounts =
    {} as OfficialShiftSubmission["accounts"];

  for (const name of SHIFT_ACCOUNT_NAMES) {
    const item = asObject(source[name]);

    exactKeys(item, ["actualEnd", "comment"]);

    const actualEnd = coreNumber(
      item.actualEnd,
      name
    );

    if (
      (name === "Каса, грн" || name === "Сейф") &&
      actualEnd < 0
    ) {
      fail(
        `Фізичний залишок не може бути від'ємним: ${name}.`
      );
    }

    accounts[name] = {
      actualEnd,
      comment: coreText(
        item.comment,
        name,
        500
      )
    };
  }

  return accounts;
}

function parseInitialBalances(
  input: unknown,
  confirmed: boolean
): OfficialShiftSubmission["initialBalances"] {
  const source = asObject(input);
  const provided = Object.keys(source);

  if (
    provided.some(
      name =>
        !SHIFT_ACCOUNT_NAMES.includes(
          name as ShiftAccountName
        )
    )
  ) {
    return fail(
      "Невідомий рахунок у початкових залишках."
    );
  }

  if (confirmed || provided.length > 0) {
    exactKeys(source, SHIFT_ACCOUNT_NAMES);
  }

  const opening:
    OfficialShiftSubmission["initialBalances"] = {};

  for (const name of SHIFT_ACCOUNT_NAMES) {
    if (
      Object.prototype.hasOwnProperty.call(
        source,
        name
      )
    ) {
      const amount = coreNumber(
        source[name],
        name
      );

      if (amount < 0) {
        fail(
          `Від'ємний початковий залишок: ${name}.`
        );
      }

      opening[name] = amount;
    }
  }

  return opening;
}

export function parseOfficialShiftSubmission(
  input: unknown
): OfficialShiftSubmission {
  const row = asObject(input);

  exactKeys(row, [
    "date",
    "revision",
    "metrics",
    "accounts",
    "initialBalances",
    "confirmInitialBalances",
    "comment"
  ]);

  if (
    typeof row.revision !== "string" ||
    !/^[a-f0-9]{64}$/.test(row.revision)
  ) {
    fail(
      "Некоректна SHA-256 ревізія snapshot."
    );
  }

  if (
    typeof row.confirmInitialBalances !==
    "boolean"
  ) {
    fail(
      "Відсутній стан підтвердження початкових залишків."
    );
  }

  const confirmed =
    row.confirmInitialBalances as boolean;

  return {
    date: coreDate(row.date),
    revision: row.revision as string,
    metrics: parseMetrics(row.metrics),
    accounts: parseAccounts(row.accounts),
    initialBalances: parseInitialBalances(
      row.initialBalances,
      confirmed
    ),
    confirmInitialBalances: confirmed,
    comment: coreText(
      row.comment,
      "comment",
      2000
    )
  };
}
