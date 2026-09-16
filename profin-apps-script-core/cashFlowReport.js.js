/****************************************************
 * ЗВІТ CASH FLOW — ДИНАМІЧНА ГЕНЕРАЦІЯ
 * Джерело: "База операцій"
 * Мапінг: "Мапінг"
 ****************************************************/

const CF_REPORT_SHEET_NAME = 'Звіт cash flow';
const CF_BASE_SHEET_NAME = 'База операцій';
const CF_MAPPING_SHEET_NAME = 'Мапінг';

const CF_HEADER_ROW = 4;
const CF_LABEL_COL = 2;
const CF_FIRST_DATA_ROW = 5;
const CF_CODE_COL = 1; // A

const CF_FILL_FUTURE_PERIODS = false;

const CF_ACCOUNT_LABELS = [
  'Каса, грн',
  'Рахунок А-Банк, грн',
  'Рахунок Моно, грн',
  'Сейф'
];

const CF_SUMMARY_LABELS = {
  openingBalance: 'Залишки на початок періоду',
  totalCashFlow: 'Загальний грошовий потік',
  closingBalance: 'Залишки на кінець періоду',
  netCashFlow: 'Чистий грошовий потік',
  cashIn: 'Надходження',
  cashOut: 'Виплати'
};

/****************************************************
 * ГОЛОВНА ФУНКЦІЯ
 ****************************************************/
function generateCashFlowReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const reportSheet = findSheetByName_(ss, CF_REPORT_SHEET_NAME);
  const baseSheet = findSheetByName_(ss, CF_BASE_SHEET_NAME);
  const mappingSheet = findSheetByName_(ss, CF_MAPPING_SHEET_NAME);

  if (!reportSheet) throw new Error('Не знайдено лист "' + CF_REPORT_SHEET_NAME + '"');
  if (!baseSheet) throw new Error('Не знайдено лист "' + CF_BASE_SHEET_NAME + '"');
  if (!mappingSheet) throw new Error('Не знайдено лист "' + CF_MAPPING_SHEET_NAME + '"');

  const allPeriods = getReportPeriods_(reportSheet);
  const operations = getBaseOperations_(baseSheet);
  const mapping = getCashFlowMapping_(mappingSheet);
  const rows = getReportRows_(reportSheet);

  const periods = filterActualPeriods_(allPeriods, operations);

  clearReportValues_(reportSheet, allPeriods);

  periods.forEach(period => {
    fillPeriod_(reportSheet, rows, operations, mapping, period);
  });

  SpreadsheetApp.getActive().toast('Звіт Cash Flow оновлено');
}

/****************************************************
 * ЗАПОВНЮЄ ОДИН ПЕРІОД
 ****************************************************/
function fillPeriod_(sheet, rows, operations, mapping, period) {
  const periodOps = operations.filter(op =>
    op.date >= period.startDate &&
    op.date <= period.endDate
  );

  rows.itemRows.forEach(item => {
    const target = normalizeReportLabel_(item.label);

    const sum = periodOps
      .filter(op => {
        const resolvedRow = resolveCashFlowRowForOperation_(op, mapping);
        if (!resolvedRow) return false;

        return normalizeReportLabel_(resolvedRow) === target;
      })
      .reduce((total, op) => total + op.amount, 0);

    sheet.getRange(item.row, period.col).setValue(Number(sum) || 0);
  });

  fillBalances_(sheet, rows, operations, period);
  fillCashFlowTotals_(sheet, rows, period.col);
}
 
/****************************************************
 * ЧИТАЄ МАПІНГ
 *
 * Очікувана логіка листа "Мапінг":
 * - одна з колонок має містити статтю / категорію з Бази операцій
 * - одна з колонок має містити назву рядка у звіті Cash Flow
 ****************************************************/
function getCashFlowMapping_(sheet) {
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];

  const headers = values[0].map(h => clean_(h).toLowerCase());

  const sourceCol = findHeaderIndex_(headers, [
    'стаття',
    'стаття бази',
    'стаття операції',
    'категорія',
    'назва статті'
  ]);

  const reportCol = findHeaderIndex_(headers, [
    'cash flow',
    'рядок cash flow',
    'стаття cash flow',
    'група cash flow',
    'звіт cash flow'
  ]);

  if (sourceCol === -1 || reportCol === -1) {
    throw new Error(
      'У листі "Мапінг" не знайдено потрібні колонки. Потрібна колонка зі статтею бази і колонка з рядком Cash Flow.'
    );
  }

  return values
    .slice(1)
    .map(row => ({
      source: clean_(row[sourceCol]),
      reportRow: clean_(row[reportCol])
    }))
    .filter(m => m.source && m.reportRow);
}

/****************************************************
 * ПЕРЕВІРЯЄ, ЧИ ОПЕРАЦІЯ НАЛЕЖИТЬ ДО РЯДКА ЗВІТУ
 ****************************************************/

function resolveCashFlowRowForOperation_(op, mapping) {
  if (clean_(op.type) === 'Інкасація') return null;

  const excluded = [
    'Внутрішній трансфер',
    'Інкасація',
    'Не включати',
    'ВИКЛЮЧИТИ'
  ].map(normalizeReportLabel_);

  const candidates = [
    op.article,
    op.category,
    op.type
  ].map(clean_).filter(Boolean);

  for (const candidate of candidates) {
    const normCandidate = normalizeReportLabel_(candidate);

    if (excluded.includes(normCandidate)) return null;

    const mapped = mapping.find(m =>
      normalizeReportLabel_(m.source) === normCandidate
    );

    if (mapped) {
      const target = clean_(mapped.reportRow);
      const normTarget = normalizeReportLabel_(target);

      if (!target || excluded.includes(normTarget)) return null;

      return target;
    }
  }

  return applyCashFlowFallbackMapping_(op);
}

function applyCashFlowFallbackMapping_(op) {
  const article = normalizeReportLabel_(op.article);
  const category = normalizeReportLabel_(op.category);

  const fallback = {
    'консультація': 'Консультації',
    'консультації': 'Консультації',
    'бонуси / %': 'Бонуси лікарям',
    'бонуси/%': 'Бонуси лікарям',
    'бонуси': 'Бонуси лікарям'
  };

  return fallback[article] || fallback[category] || clean_(op.article) || clean_(op.category);
}

/****************************************************
 * НЕ ЗАПОВНЮЄ МАЙБУТНІ ПЕРІОДИ
 ****************************************************/
function filterActualPeriods_(periods, operations) {
  if (CF_FILL_FUTURE_PERIODS) return periods;
  if (!operations.length) return [];

  const lastOperationDate = operations
    .map(op => op.date)
    .sort((a, b) => b - a)[0];

  const lastAllowedPeriodEnd = new Date(
    lastOperationDate.getFullYear(),
    lastOperationDate.getMonth() + 1,
    0
  );

  return periods.filter(period => period.endDate <= lastAllowedPeriodEnd);
}

/****************************************************
 * РАХУЄ ЗАЛИШКИ ПО РАХУНКАХ
 ****************************************************/
function fillBalances_(sheet, rows, operations, period) {
  let openingTotal = 0;
  let closingTotal = 0;

  CF_ACCOUNT_LABELS.forEach(accountName => {
    const opening = calculateAccountBalance_(operations, accountName, period.startDate, false);
    const closing = calculateAccountBalance_(operations, accountName, period.endDate, true);

    openingTotal += opening;
    closingTotal += closing;

    setByLabel_(sheet, rows, accountName, period.col, closing);
  });

  setByLabel_(sheet, rows, CF_SUMMARY_LABELS.openingBalance, period.col, openingTotal);
  setByLabel_(sheet, rows, CF_SUMMARY_LABELS.closingBalance, period.col, closingTotal);
}

/****************************************************
 * ЗАЛИШОК КОНКРЕТНОГО РАХУНКУ
 ****************************************************/
function calculateAccountBalance_(operations, accountName, borderDate, includeBorder) {
  const settings = getOpeningBalancesSettings_();

  const startDate = settings.startDate;
  const openingBalance = settings.balances[accountName] || 0;

  return operations
    .filter(op => {
      if (startDate && op.date < startDate) return false;
      return includeBorder ? op.date <= borderDate : op.date < borderDate;
    })
    .reduce((total, op) => {
      if (op.type === 'Інкасація') {
        if (op.account === accountName) total -= Math.abs(op.amount);
        if (op.transferTo === accountName) total += Math.abs(op.amount);
        return total;
      }

      if (op.account === accountName) {
        return total + op.amount;
      }

      return total;
    }, openingBalance);
}

/****************************************************
 * ЧИТАЄ ОПЕРАЦІЇ З "БАЗА ОПЕРАЦІЙ"
 ****************************************************/
/****************************************************
 * ЧИТАЄ ОПЕРАЦІЇ З "БАЗА ОПЕРАЦІЙ"
 *
 * Операції зі статусом "Скасовано"
 * не включаються у Cash Flow.
 *
 * Порожній статус та історичний імпорт
 * залишаються у звіті.
 ****************************************************/
function getBaseOperations_(sheet) {
  const startRow = 3;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return [];
  }

  const data = sheet
    .getRange(
      startRow,
      1,
      lastRow - startRow + 1,
      31
    )
    .getValues();

  return data
    .filter(
      function(row) {
        const id =
          clean_(row[0]);

        const status =
          clean_(row[29]);

        if (!id) {
          return false;
        }

        /*
         * Виключаємо тільки явно
         * скасовані операції.
         *
         * Порожні та історичні статуси
         * продовжують потрапляти у звіт.
         */
        return (
          status.toLowerCase() !==
          'скасовано'
        );
      }
    )
    .map(
      function(row) {
        return {
          id:
            clean_(row[0]),

          account:
            clean_(row[1]),

          transferTo:
            clean_(row[2]),

          date:
            parseDate_(row[3]),

          amount:
            Number(row[6]) || 0,

          type:
            clean_(row[9]),

          category:
            clean_(row[10]),

          article:
            clean_(row[11]),

          status:
            clean_(row[29])
        };
      }
    )
    .filter(
      function(operation) {
        return Boolean(
          operation.date
        );
      }
    );
}

/****************************************************
 * ЗЧИТУЄ ПЕРІОДИ З ШАПКИ
 ****************************************************/
function getReportPeriods_(sheet) {
  const lastCol = sheet.getLastColumn();
  const values = sheet.getRange(CF_HEADER_ROW, 1, 1, lastCol).getValues()[0];

  return values
    .map((value, index) => {
      const date = parseDate_(value);
      if (!date) return null;

      return {
        col: index + 1,
        startDate: new Date(date.getFullYear(), date.getMonth(), 1),
        endDate: new Date(date.getFullYear(), date.getMonth() + 1, 0)
      };
    })
    .filter(Boolean);
}

/****************************************************
 * ЗЧИТУЄ РЯДКИ ЗВІТУ
 ****************************************************/
function getReportRows_(sheet) {
  const lastRow = sheet.getLastRow();

  const values = sheet
    .getRange(1, CF_CODE_COL, lastRow, 2) // A:B
    .getDisplayValues();

  const byLabel = {};
  const byNormLabel = {};
  const itemRows = [];
  const allRows = [];

  values.forEach((rowValues, index) => {
    const code = clean_(rowValues[0]);
    const label = clean_(rowValues[1]);

    if (!label) return;

    const row = index + 1;
    const norm = normalizeReportLabel_(label);

    byLabel[label] = row;
    byNormLabel[norm] = row;

    const isSummary = isCashFlowSummaryRow_(label);
    const isItem = !isSummary;

    allRows.push({
      row,
      code,
      label,
      isDetail: isItem,
      isSummary
    });

    if (isItem) {
      itemRows.push({ row, code, label });
    }
  });

  return { byLabel, byNormLabel, itemRows, allRows };
}

/****************************************************
 * ВИЗНАЧАЄ, ЯКІ РЯДКИ МОЖНА ЗАПОВНЮВАТИ
 ****************************************************/
function isReportItemLabel_(label, code) {
  return !isCashFlowSummaryRow_(label);
}

/****************************************************
 * ОЧИЩАЄ ЗНАЧЕННЯ У ВСІХ ПЕРІОДАХ
 ****************************************************/
function clearReportValues_(sheet, periods) {
  const lastRow = sheet.getLastRow();

  if (!periods.length) return;

  const firstCol = Math.min(...periods.map(p => p.col));
  const lastCol = Math.max(...periods.map(p => p.col));
  const colsCount = lastCol - firstCol + 1;

  sheet
    .getRange(
      CF_FIRST_DATA_ROW,
      firstCol,
      lastRow - CF_FIRST_DATA_ROW + 1,
      colsCount
    )
    .clearContent();
}

/****************************************************
 * СТАВИТЬ ЗНАЧЕННЯ ПО НАЗВІ РЯДКА
 ****************************************************/
function setByLabel_(sheet, rows, label, col, value) {
  const row =
    rows.byLabel[label] ||
    rows.byNormLabel?.[normalizeReportLabel_(label)];

  if (!row) return;

  sheet.getRange(row, col).setValue(Number(value) || 0);
}


/****************************************************
 * ДОПОМІЖНІ ФУНКЦІЇ
 ****************************************************/
function findSheetByName_(ss, name) {
  const target = clean_(name).toLowerCase();

  return ss.getSheets().find(sheet =>
    clean_(sheet.getName()).toLowerCase() === target
  );
}

function findHeaderIndex_(headers, variants) {
  return headers.findIndex(header =>
    variants.some(v => header.includes(clean_(v).toLowerCase()))
  );
}

function parseDate_(value) {
  if (value instanceof Date && !isNaN(value)) return value;

  const text = clean_(value);
  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!match) return null;

  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}
function fillCashFlowTotals_(sheet, rows, col) {
  const operatingIncome = sumRowsBetweenLabels_(
    sheet, rows,
    'Доходи операційної діяльності',
    'Витрати операційної діяльності',
    col
  );

  const variableExpenses = sumRowsBetweenLabels_(
    sheet, rows,
    'Змінні витрати',
    'Постійні витрати (операційні)',
    col
  );

  const fixedExpenses = sumRowsBetweenLabels_(
    sheet, rows,
    'Постійні витрати (операційні)',
    'Придбання основних засобів',
    col
  );

  const operatingExpenses = variableExpenses + fixedExpenses;

  const investmentFlow = sumRowsBetweenLabels_(
    sheet, rows,
    'Придбання основних засобів',
    'Фінансова діяльність',
    col
  );

  const financeIncome = sumRowsBetweenLabels_(
    sheet, rows,
    'Фінансові надходження',
    'Фінансові виплати',
    col
  );

  const financeExpenses = sumRowsBetweenLabels_(
    sheet, rows,
    'Фінансові виплати',
    'Залишки на початок періоду',
    col
  );

  const financeFlow = financeIncome + financeExpenses;
  const operatingCashFlow = operatingIncome + operatingExpenses;

  const netCashFlow =
    operatingCashFlow +
    investmentFlow +
    financeFlow;

  setByLabel_(sheet, rows, 'Доходи операційної діяльності', col, operatingIncome);
  setByLabel_(sheet, rows, 'Змінні витрати', col, variableExpenses);
  setByLabel_(sheet, rows, 'Постійні витрати (операційні)', col, fixedExpenses);
  setByLabel_(sheet, rows, 'Витрати операційної діяльності', col, operatingExpenses);

  setByLabel_(sheet, rows, 'Придбання основних засобів', col, investmentFlow);

  setByLabel_(sheet, rows, 'Фінансова діяльність', col, financeFlow);
  setByLabel_(sheet, rows, 'Фінансові надходження', col, financeIncome);
  setByLabel_(sheet, rows, 'Фінансові виплати', col, financeExpenses);

  setByLabel_(
    sheet,
    rows,
    'Грошовий потік від операційної діяльності',
    col,
    operatingCashFlow
  );

  setByLabel_(sheet, rows, 'Надходження', col, operatingIncome + financeIncome);
  setByLabel_(sheet, rows, 'Виплати', col, operatingExpenses + investmentFlow + financeExpenses);
  setByLabel_(sheet, rows, 'Чистий грошовий потік', col, netCashFlow);

  const openingRow = rows.byLabel['Залишки на початок періоду'];
  const closingRow = rows.byLabel['Залишки на кінець періоду'];

  const opening = openingRow
    ? Number(sheet.getRange(openingRow, col).getValue()) || 0
    : 0;

  const closing = closingRow
    ? Number(sheet.getRange(closingRow, col).getValue()) || 0
    : 0;

  setByLabel_(sheet, rows, 'Загальний грошовий потік', col, closing - opening);
  fillCashFlowKpis_(sheet, rows, col);
}

function sumRowsBetweenLabels_(sheet, rows, startLabel, endLabel, col) {
  return sumCFDetailRowsBetweenLabels_(sheet, rows, startLabel, endLabel, col);
}
/****************************************************
 * KPI CASH FLOW
 ****************************************************/
function fillCashFlowKpis_(sheet, rows, col) {
  const opening = getByLabelValue_(sheet, rows, 'Залишки на початок періоду', col);
  const closing = getByLabelValue_(sheet, rows, 'Залишки на кінець періоду', col);

  const cashIn = getByLabelValue_(sheet, rows, 'Надходження', col);
  const cashOut = getByLabelValue_(sheet, rows, 'Виплати', col);
  const netCashFlow = getByLabelValue_(sheet, rows, 'Чистий грошовий потік', col);

  const operatingIncome = getByLabelValue_(sheet, rows, 'Доходи операційної діяльності', col);
  const operatingExpenses = getByLabelValue_(sheet, rows, 'Витрати операційної діяльності', col);

  const monthlyDepreciation = getMonthlyDepreciation_();

  const reserveFundAmount = monthlyDepreciation * 12;

  const solvencyOperating = Math.abs(operatingExpenses)
    ? operatingIncome / Math.abs(operatingExpenses)
    : 0;

  const solvencyWithBalance = Math.abs(operatingExpenses)
    ? (opening + operatingIncome) / Math.abs(operatingExpenses)
    : 0;

  const cashFlowEfficiency = cashIn
    ? netCashFlow / cashIn
    : 0;

 setByAnyLabel_(
  sheet,
  rows,
  [
    'Резервний фонд на оновлення активів',
    'Резервний фонд на оновлення активів (12 міс.)',
    'Резервний Фонд (сума фактичної місячної амортизації)'
    ],
  col,
  reserveFundAmount
);
  setByAnyLabel_(
  sheet,
  rows,
  [
    'Коефіцієнт платоспроможності (операційна діяльність)',
    'Коефіціент платоспроможності (операційна діяльність)',
    'Коеффіціент платоспроможності (операційна діяльність)'
  ],
  col,
  solvencyOperating
);

setByAnyLabel_(
  sheet,
  rows,
  [
    'Коефіцієнт платоспроможності (*з урахуванням залишків)',
    'Коефіціент платоспроможності (*з урахуванням залишків)',
    'Коеффіціент платоспроможності (*з урахуванням залишків)'
  ],
  col,
  solvencyWithBalance
);
  setByLabel_(
    sheet,
    rows,
    'Коефіцієнт ефективності грошового потоку',
    col,
    cashFlowEfficiency
  );
}
function getByLabelValue_(sheet, rows, label, col) {
  const row =
    rows.byLabel[label] ||
    rows.byNormLabel?.[normalizeReportLabel_(label)];

  if (!row) return 0;

  return Number(sheet.getRange(row, col).getValue()) || 0;
}
function generateCashFlowReportForSelectedPeriod() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const reportSheet = findSheetByName_(ss, CF_REPORT_SHEET_NAME);
  const baseSheet = findSheetByName_(ss, CF_BASE_SHEET_NAME);
  const mappingSheet = findSheetByName_(ss, CF_MAPPING_SHEET_NAME);

  if (!reportSheet) throw new Error('Не знайдено лист "' + CF_REPORT_SHEET_NAME + '"');
  if (!baseSheet) throw new Error('Не знайдено лист "' + CF_BASE_SHEET_NAME + '"');
  if (!mappingSheet) throw new Error('Не знайдено лист "' + CF_MAPPING_SHEET_NAME + '"');

  const monthName = String(reportSheet.getRange('D3').getDisplayValue()).trim();
const selectedYear = Number(reportSheet.getRange('F3').getValue());

const monthMap = {
  'Січень': 1,
  'Лютий': 2,
  'Березень': 3,
  'Квітень': 4,
  'Травень': 5,
  'Червень': 6,
  'Липень': 7,
  'Серпень': 8,
  'Вересень': 9,
  'Жовтень': 10,
  'Листопад': 11,
  'Грудень': 12
};

const selectedMonth = monthMap[monthName];

if (!selectedMonth || !selectedYear) {
  throw new Error('Вкажіть місяць у D3 і рік у F3');
  }

  const allPeriods = getReportPeriods_(reportSheet);

  const targetPeriod = allPeriods.find(period =>
    period.startDate.getMonth() + 1 === selectedMonth &&
    period.startDate.getFullYear() === selectedYear
  );

  if (!targetPeriod) {
    throw new Error('Не знайдено колонку для періоду: ' + selectedMonth + '.' + selectedYear);
  }

  const operations = getBaseOperations_(baseSheet);
  const mapping = getCashFlowMapping_(mappingSheet);
  const rows = getReportRows_(reportSheet);

 clearOnePeriodValues_(reportSheet, targetPeriod);
 fillPeriod_(reportSheet, rows, operations, mapping, targetPeriod);

 reportSheet.getRange('D3').clearContent();
 reportSheet.getRange('F3').clearContent();

 SpreadsheetApp.getActive().toast(
  'Cash Flow оновлено за ' + selectedMonth + '.' + selectedYear
 );
}
function clearOnePeriodValues_(sheet, period) {
  const lastRow = sheet.getLastRow();

  sheet
    .getRange(
      CF_FIRST_DATA_ROW,
      period.col,
      lastRow - CF_FIRST_DATA_ROW + 1,
      1
    )
    .clearContent();
}
function normalizeReportLabel_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\u00A0/g, ' ')
    .trim()
    .toLowerCase();
}

function setByAnyLabel_(sheet, rows, labels, col, value) {
  for (const label of labels) {
    const row =
      rows.byLabel[label] ||
      rows.byNormLabel?.[normalizeReportLabel_(label)];

    if (row) {
      sheet.getRange(row, col).setValue(value || 0);
      return;
    }
  }
}
function sumCFDetailRowsBetweenLabels_(sheet, rows, startLabel, endLabel, col) {
  const startRow =
    rows.byLabel[startLabel] ||
    rows.byNormLabel?.[normalizeReportLabel_(startLabel)];

  const endRow =
    rows.byLabel[endLabel] ||
    rows.byNormLabel?.[normalizeReportLabel_(endLabel)];

  if (!startRow || !endRow || endRow <= startRow) return 0;

  let total = 0;

  rows.allRows.forEach(item => {
    if (!item.isDetail) return;
    if (item.row <= startRow || item.row >= endRow) return;

    total += Number(sheet.getRange(item.row, col).getValue()) || 0;
  });

  return total;
}
function isCashFlowSummaryRow_(label) {
  const cleaned = clean_(label);

  const summaryLabels = [
    ...Object.values(CF_SUMMARY_LABELS),
    ...CF_ACCOUNT_LABELS,

    'Звіт Cash Flow',
    'Грошовий потік від операційної діяльності',
    'Доходи операційної діяльності',
    'Витрати операційної діяльності',
    'Змінні витрати',
    'Постійні витрати (операційні)',
    'Придбання основних засобів',
    'Фінансова діяльність',
    'Фінансові надходження',
    'Фінансові виплати'
  ];

  return summaryLabels.includes(cleaned);
}
function getOpeningBalancesSettings_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('Довідник');

  if (!sheet) {
    return {
      startDate: null,
      balances: {}
    };
  }

  return {
    startDate: parseDate_(sheet.getRange('G36').getValue()),

    balances: {
      'Каса, грн': Number(sheet.getRange('G31').getValue()) || 0,
      'Рахунок А-Банк, грн': Number(sheet.getRange('G32').getValue()) || 0,
      'Рахунок Моно, грн': Number(sheet.getRange('G33').getValue()) || 0,
      'Сейф': Number(sheet.getRange('G34').getValue()) || 0
    }
  };
}
