import "server-only";

import type {
  OperationJournalColumn,
  OperationJournalColumnKey
} from "@/lib/contracts/journal";

import type {
  SessionContext
} from "@/lib/server/session";


export type JournalColumnPolicy = {
  version:
    string;

  columns:
    readonly OperationJournalColumn[];

  visibleKeys:
    ReadonlySet<OperationJournalColumnKey>;
};


/*
 * PATCH 38A
 *
 * Перший production-профіль журналу.
 * За поточним рішенням власника:
 * ADMIN / OWNER / InTeg поки отримують
 * повний дозволений набір колонок
 * "Бази операцій".
 *
 * Важливо:
 * - policy живе server-side;
 * - browser не вирішує, які колонки дозволені;
 * - пізніше visibleKeys можна формувати з
 *   control-plane JSONB без зміни UI-contract.
 */
const FULL_COLUMNS:
  readonly OperationJournalColumn[] = [
    {
      key: "operationId",
      label: "ID",
      kind: "text"
    },
    {
      key: "account",
      label: "Рахунок",
      kind: "text"
    },
    {
      key: "targetAccount",
      label: "На рахунок",
      kind: "text"
    },
    {
      key: "transactionDate",
      label: "Дата транзакції",
      kind: "date"
    },
    {
      key: "unitPrice",
      label: "Ціна за одиницю",
      kind: "number"
    },
    {
      key: "quantity",
      label: "Кількість",
      kind: "number"
    },
    {
      key: "amount",
      label: "Сума",
      kind: "number"
    },
    {
      key: "doctor",
      label: "Лікар",
      kind: "text"
    },
    {
      key: "patient",
      label: "Пацієнт",
      kind: "text"
    },
    {
      key: "operationType",
      label: "Тип операції",
      kind: "text"
    },
    {
      key: "category",
      label: "Категорія",
      kind: "text"
    },
    {
      key: "article",
      label: "Стаття",
      kind: "text"
    },
    {
      key: "comment",
      label: "Коментар",
      kind: "text"
    },
    {
      key: "paymentMonth",
      label: "Місяць оплати",
      kind: "date"
    },
    {
      key: "accrualMonth",
      label: "Місяць нарахування",
      kind: "date"
    },
    {
      key: "accountingType",
      label: "Тип обліку",
      kind: "text"
    },
    {
      key: "packageName",
      label: "Пакет",
      kind: "text"
    },
    {
      key: "packageStartDate",
      label: "Дата старту пакету",
      kind: "date"
    },
    {
      key: "packageDuration",
      label: "Тривалість пакету",
      kind: "number"
    },
    {
      key: "packageMonthlyAmount",
      label: "Сума на місяць в пакеті",
      kind: "number"
    },
    {
      key: "vaccineName",
      label: "Назва вакцини",
      kind: "text"
    },
    {
      key: "vaccineQuantity",
      label: "Кількість вакцин",
      kind: "number"
    },
    {
      key: "vaccineUseDate",
      label: "Дата використання",
      kind: "date"
    },
    {
      key: "vaccineCost",
      label: "Собівартість вакцини",
      kind: "number"
    },
    {
      key: "vaccineId",
      label: "ID вакцини",
      kind: "text"
    },
    {
      key: "assetName",
      label: "Назва активу",
      kind: "text"
    },
    {
      key: "assetCategory",
      label: "Категорія активу",
      kind: "text"
    },
    {
      key: "assetAmortizationYears",
      label: "Строк амортизації, років",
      kind: "number"
    },
    {
      key: "assetStartDate",
      label: "Дата введення в експлуатацію",
      kind: "date"
    },
    {
      key: "recordStatus",
      label: "Статус запису",
      kind: "text"
    },
    {
      key: "createdDate",
      label: "Дата створення",
      kind: "date"
    },
    {
      key: "createdTime",
      label: "Час створення",
      kind: "time"
    },
    {
      key: "createdBy",
      label: "Створив користувач",
      kind: "text"
    }
  ];


export function resolveJournalColumnPolicy(
  _context:
    SessionContext
): JournalColumnPolicy {
  const columns =
    FULL_COLUMNS;

  return {
    version:
      "JOURNAL_FULL_V1",

    columns,

    visibleKeys:
      new Set(
        columns.map(
          column =>
            column.key
        )
      )
  };
}