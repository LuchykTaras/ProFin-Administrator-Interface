/****************************************************
 * P&L — ФАКТ / ПЛАН / СТРУКТУРА / ВІДХИЛЕННЯ
 * ProFin OS — оновлений візуал
 ****************************************************/

const PL_REPORT_SHEET_NAME = 'P&L';
const PL_BASE_SHEET_NAME = 'База операцій';
const PL_ACCRUAL_SHEET_NAME = 'Нарахування';
const PL_MAPPING_SHEET_NAME = 'Мапінг';

const PL_SELECTED_MONTH_CELL = 'D3';
const PL_SELECTED_YEAR_CELL = 'E3';
const PL_MONTHS_DICT_SHEET_NAME = 'Довідник';
const PL_MONTHS_DICT_MONTH_COL = 9; // I
const PL_MONTHS_DICT_YEAR_COL = 10; // J
const PL_TEAM_INPUT_CELL = 'E9';

const PL_MONTH_ROW = 6;
const PL_HEADER_ROW = 7;
const PL_FIRST_DATA_ROW = 8;

const PL_CODE_COL = 2;  // B
const PL_LABEL_COL = 3; // C

const PL_AUTO_PLAN_NOTE = 'AUTO_PLAN';

const PL_FORCE_EXCLUDE_LABELS = [
  'Отримання позики',
  'Інша фінансова допомога',
  'Внесок власника',
  'Повернення фінансової допомоги',
  'Виплата тіла кредиту',
  'Виплата дивідендів',
  'Інкасація',
  'Внутрішній трансфер',
  'Купівля обладнання',
  'Побутова техніка',
  'Меблі',
  'Ремонт на покращення',
  'IT / техніка',
  'Інші активи',
  'Продаж основних засобів'
];

const PL_MAPPING_ALIASES = {
  'консультація': 'Консультація',
  'консультації': 'Консультація',

  'щеплення': 'Вакцини (використані)',
  'вакцини': 'Вакцини (використані)',
  'вакцини/щеплення': 'Вакцини (використані)',
  'бонуси / %': 'Бонуси лікарям',
  'бонуси/%': 'Бонуси лікарям',
  'послуги медсестри': 'Послуги медсестри',
  'електоренергія': 'Електроенергія',
  'електроенергія': 'Електроенергія',

  'внутрішній трансфер': 'Не включати'
};

const PL_ROW_ALIASES = {
  'консультації': 'Консультація',
  'консультація': 'Консультація',

  'вакцини': 'Вакцини (використані)',
  'вакцина': 'Вакцини (використані)',
  'щеплення': 'Вакцини (використані)',
  'вакцини/щеплення': 'Вакцини (використані)',
  'послуги медсестри': 'Послуги медсестри',
  'електоренергія': 'Електроенергія',
  'електроенергія': 'Електроенергія',

  'пакети послуг': 'Пакетні послуги',
  'пакетні послуги': 'Пакетні послуги',

  'нсзу': 'НСЗУ'
};

/****************************************************
 * ГОЛОВНА ФУНКЦІЯ — тільки обраний місяць
 ****************************************************/

function generatePLReport() {
  throw new Error(
    'Повна генерація P&L за 12 місяців вимкнена. Використовуйте generatePLReportForSelectedPeriod().'
  );
}

function generatePLReportForSelectedPeriod() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheet = findSheetByName_(ss, PL_REPORT_SHEET_NAME);
  const baseSheet = findSheetByName_(ss, PL_BASE_SHEET_NAME);
  const accrualSheet = findSheetByName_(ss, PL_ACCRUAL_SHEET_NAME);
  const mappingSheet = findSheetByName_(ss, PL_MAPPING_SHEET_NAME);

  if (!sheet) throw new Error('Не знайдено лист "P&L"');
  if (!baseSheet) throw new Error('Не знайдено лист "База операцій"');
  if (!mappingSheet) throw new Error('Не знайдено лист "Мапінг"');

  const selected = getSelectedPLPeriodFromDirectory_(ss, sheet);

 const selectedMonth = selected.month;
 const selectedYear = selected.year;

  const rows = getPLRows_(sheet);
  const periods = getPLPeriods_(sheet);
  const mapping = getPLMapping_(mappingSheet);

  const period = periods.find(p =>
    p.month === selectedMonth &&
    p.year === selectedYear
  );

  if (!period) {
    throw new Error('Не знайдено блок колонок для ' + selectedMonth + '.' + selectedYear);
  }

  const baseStatusById =
  getPLBaseStatusByOperationId_(
    baseSheet
  );

const operations =
  getPLOperationsFromBase_(
    baseSheet
  ).concat(
    accrualSheet
      ? getPLOperationsFromAccruals_(
          accrualSheet,
          baseStatusById
        )
      : []
  );
  clearPLPeriodValues_(sheet, period);
  fillPLPeriod_(sheet, rows, operations, period, mapping);
  updatePLAutoPlanFromGeneratedFacts_(sheet, rows, periods);
  writeTotalFact_(sheet, rows, periods);

  sheet.getRange(PL_SELECTED_MONTH_CELL).clearContent();
  sheet.getRange(PL_SELECTED_YEAR_CELL).clearContent();

  SpreadsheetApp.getActive().toast(
    'P&L оновлено за ' + selectedMonth + '.' + selectedYear
  );
}

/****************************************************
 * ПЕРІОДИ З НОВОГО ВІЗУАЛУ
 ****************************************************/

function getPLPeriods_(sheet) {
  const lastCol = sheet.getLastColumn();
  const months = sheet.getRange(PL_MONTH_ROW, 1, 1, lastCol).getValues()[0];
  const headers = sheet.getRange(PL_HEADER_ROW, 1, 1, lastCol).getDisplayValues()[0];

  const periods = [];

  for (let col = 1; col <= lastCol; col++) {
    const month = Number(months[col - 1]);
    const header = clean_(headers[col - 1]);

    if (!month || !header.toLowerCase().startsWith('план')) continue;

    periods.push({
      month,
      year: Number(sheet.getRange(PL_SELECTED_YEAR_CELL).getValue()),
     startDate: new Date(Number(sheet.getRange(PL_SELECTED_YEAR_CELL).getValue()), month - 1, 1),
     endDate: new Date(Number(sheet.getRange(PL_SELECTED_YEAR_CELL).getValue()), month, 0),
      planCol: col,
      planStructureCol: col + 1,
      factCol: col + 2,
      factStructureCol: col + 3,
      varianceCol: col + 4
    });
  }

  return periods;
}

/****************************************************
 * ЗАПОВНЕННЯ ПЕРІОДУ
 ****************************************************/

/****************************************************
 * ЗАПОВНЕННЯ ОДНОГО ПЕРІОДУ P&L
 *
 * Порядок:
 * 1. Деталізовані операції.
 * 2. Операційний дохід.
 * 3. Категорійні підсумки.
 * 4. EBITDA та інші технічні підсумки.
 * 5. Амортизація з листа "Активи".
 * 6. EBIT і чистий прибуток.
 * 7. Інформаційні показники.
 * 8. Структура і відхилення.
 ****************************************************/

function fillPLPeriod_(
  sheet,
  rows,
  operations,
  period,
  mapping
 ) {
  /*
   * Операції лише обраного місяця.
   */
  const periodOps =
    operations.filter(op =>
      op.date >= period.startDate &&
      op.date <= period.endDate
    );

  /*
   * 1. Деталізовані операційні рядки.
   *
   * Придбання активів сюди не потрапляє,
   * оскільки воно виключене через
   * PL_FORCE_EXCLUDE_LABELS.
   */
  rows.itemRows.forEach(item => {
    const fact =
      periodOps
        .filter(op =>
          operationBelongsToPLRow_(
            op,
            item.label,
            mapping
          )
        )
        .reduce(
          (sum, op) =>
            sum +
            normalizePLAmount_(
              op,
              mapping
            ),
          0
        );

    writePLRow_(
      sheet,
      rows,
      period,
      item.label,
      fact
    );
  });
  /*
   * Собівартість прийнятих передач
   * Альтернатива → Бабурка.
   *
   * Рядок є лише в P&L Альтернативи.
   * Закупки вакцин повторно не включаються.
   */
  const interbranchTransferCost =
    getPLInterbranchTransferCostForPeriod_(
      SpreadsheetApp.getActiveSpreadsheet(),
      period
    );

  writePLRow_(
    sheet,
    rows,
    period,
    'Собівартість передач на Бабурку',
    interbranchTransferCost
  );
  /*
   * 2. Операційний дохід.
   */
  const revenue =
    sumPLDetailRowsBetweenLabels_(
      sheet,
      rows,
      'Операційний дохід',
      'Валовий дохід',
      period.factCol
    );

  writePLRow_(
    sheet,
    rows,
    period,
    'Операційний дохід',
    revenue
  );

  /*
   * 3. Автоматичні категорійні підсумки.
   */
  writePLAutoCategoryTotals_(
    sheet,
    rows,
    period,
    revenue
  );

  /*
   * 4. Чинні технічні підсумки P&L.
   *
   * На цьому етапі розраховуються:
   * - валовий дохід;
   * - змінні витрати;
   * - OPEX;
   * - загальні операційні витрати;
   * - EBITDA;
   * - фінансові видатки.
   *
   * Амортизація ще не застосована.
   */
  const totals =
    calculatePLTechnicalTotals_(
      sheet,
      rows,
      period,
      revenue
    );

  writePLTechnicalTotals_(
    sheet,
    rows,
    period,
    totals
  );

  /*
   * 5. Амортизація активів.
   *
   * Функція сама:
   * - визначає місяць звіту;
   * - розраховує амортизацію цього місяця;
   * - записує деталізацію;
   * - записує загальну амортизацію;
   * - залишає EBITDA без змін;
   * - перераховує EBIT;
   * - перераховує чистий прибуток;
   * - перевіряє запис;
   * - відновлює попередні значення при помилці.
   */
  const depreciation =
    writePLAssetDepreciationForPeriod_(
      sheet,
      rows,
      period
    );

  /*
   * 6. Інформаційні показники.
   */
  writePLInfoTotals_(
    sheet,
    rows,
    period,
    operations
  );

  /*
   * 7. Структура й відхилення.
   *
   * Запускаємо після амортизації,
   * щоб EBIT, чистий прибуток і рядки
   * амортизації отримали правильну структуру.
   */
  updatePLStructuresForPeriod_(
    sheet,
    rows,
    period,
    totals.revenue
  );

  return {
    totals: totals,
    depreciation: depreciation
  };
}
/****************************************************
 * ЗАПИС РЯДКА
 ****************************************************/

function writePLRow_(sheet, rows, period, label, fact) {
  const row = getPLRow_(rows, label);
  if (!row) return;

  const plan = Number(sheet.getRange(row, period.planCol).getValue()) || 0;
  const factValue = Number(fact) || 0;
  const variance = factValue - plan;

  sheet.getRange(row, period.planCol).setValue(plan);
  sheet.getRange(row, period.factCol).setValue(factValue);
  sheet.getRange(row, period.varianceCol).setValue(variance);
}

/****************************************************
 * РЯДКИ P&L
 ****************************************************/

function getPLRows_(sheet) {
  const lastRow = sheet.getLastRow();

  const values = sheet
    .getRange(1, PL_CODE_COL, lastRow, 2)
    .getDisplayValues();

  const rows = {
    byNorm: {},
    itemRows: [],
    allRows: []
  };

  values.forEach((rowValues, index) => {
    const code = clean_(rowValues[0]);
    const label = clean_(rowValues[1]);

    if (!label) return;

    const row = index + 1;
    if (row < PL_FIRST_DATA_ROW) return;

    const norm = normalizePL_(label);
    const isDetail = Boolean(code) && isPLDetailRow_(label, code);

    rows.byNorm[norm] = row;

    rows.allRows.push({
      row,
      code,
      label,
      isDetail
    });

    if (isDetail) {
      rows.itemRows.push({
        row,
        code,
        label
      });
    }
  });

  return rows;
}

function getPLRow_(rows, label) {
  return rows.byNorm[normalizePL_(label)] || null;
}

function getPLRowAny_(rows, labels) {
  for (const label of labels) {
    const row = getPLRow_(rows, label);
    if (row) return row;
  }
  return null;
}

function isPLDetailRow_(label, code) {
  const cleaned = clean_(label);
  if (!code) return false;
  if (PL_FORCE_EXCLUDE_LABELS.includes(cleaned)) return false;
  return true;
}

/****************************************************
 * МАПІНГ
 ****************************************************/

function getPLMapping_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data = sheet
    .getRange(2, 1, lastRow - 1, 5)
    .getDisplayValues();

  return data
    .map(row => ({
      source: clean_(row[0]),
      cashFlowGroup: clean_(row[1]),
      section: clean_(row[2]),
      plGroup: clean_(row[3]),
      plType: clean_(row[4])
    }))
    .filter(m => m.source);
}

function findPLMappingForOperation_(op, mapping) {
  if (clean_(op.type) === 'Інкасація') {
    return excludedPLMapping_(op.type);
  }

if (clean_(op.type) === 'Вакцина') {
  if (isStoredVaccineSale_(op)) {
    return {
      source: op.type,
      cashFlowGroup: 'Вакцина',
      section: '',
      plGroup: 'Вакцини на зберіганні',
      plType: 'INFO'
    };
  }

  if (isVaccineNurseService_(op)) {
    return {
      source: op.type,
      cashFlowGroup: 'Вакцина',
      section: '',
      plGroup: 'Послуги медсестри',
      plType: ''
    };
  }

  return {
    source: op.type,
    cashFlowGroup: 'Вакцина',
    section: '',
    plGroup: 'Вакцини (використані)',
    plType: ''
  };
}

  const keys = [
    clean_(op.article),
    clean_(op.category),
    clean_(op.type)
  ].filter(Boolean);

  for (const key of keys) {
    if (PL_FORCE_EXCLUDE_LABELS.includes(key)) {
      return excludedPLMapping_(key);
    }
  }

  for (const key of keys) {
    const found = mapping.find(m =>
      normalizePL_(m.source) === normalizePL_(key)
    );

    if (found) return found;
  }

  for (const key of keys) {
    const alias = PL_MAPPING_ALIASES[normalizePL_(key)];

    if (alias === 'Не включати') {
      return excludedPLMapping_(key);
    }

    if (alias) {
      return {
        source: key,
        cashFlowGroup: alias,
        section: '',
        plGroup: alias,
        plType: ''
      };
    }
  }

  return null;
}

function excludedPLMapping_(source) {
  return {
    source,
    cashFlowGroup: 'Не включати',
    section: '',
    plGroup: 'Не включати',
    plType: 'Не включати'
  };
}

function getMappedPLGroup_(op, mapping) {
  if (isVaccineCostAccrual_(op)) {
  return 'Собівартість вакцин';
 }
  const found = findPLMappingForOperation_(op, mapping);
  if (!found) return '';

  const plGroup = clean_(found.plGroup);
  const cashFlowGroup = clean_(found.cashFlowGroup);

  if (normalizePL_(plGroup) === normalizePL_('Не включати')) return 'Не включати';
  if (normalizePL_(cashFlowGroup) === normalizePL_('Не включати')) return 'Не включати';
  if (normalizePL_(cashFlowGroup) === normalizePL_('ВИКЛЮЧИТИ')) return 'Не включати';

  if (plGroup) return canonicalPLLabel_(plGroup);
  if (cashFlowGroup) return canonicalPLLabel_(cashFlowGroup);

  return '';
}

function canonicalPLLabel_(value) {
  const normalized = normalizePL_(value);
  return PL_ROW_ALIASES[normalized] || clean_(value);
}

function operationBelongsToPLRow_(op, label, mapping) {
  const mappedGroup = canonicalPLLabel_(getMappedPLGroup_(op, mapping));
  const target = canonicalPLLabel_(label);

  if (!mappedGroup) return false;
  if (normalizePL_(mappedGroup) === normalizePL_('Не включати')) return false;

  return normalizePL_(mappedGroup) === normalizePL_(target);
}

/****************************************************
 * НОРМАЛІЗАЦІЯ ЗНАКУ
 ****************************************************/

function normalizePLAmount_(op, mapping) {
  const groupClean = clean_(getMappedPLGroup_(op, mapping));
  const group = normalizePL_(groupClean);
  const type = normalizePL_(op.type);
  const source = normalizePL_(op.source);
  const originalAmount = Number(op.amount) || 0;
  const amount = Math.abs(originalAmount);

  if (!amount) return 0;

  if (
    group === normalizePL_('Не включати') ||
    PL_FORCE_EXCLUDE_LABELS.includes(groupClean)
  ) {
    return 0;
  }

  if (
    type === normalizePL_('Доходи') ||
    type === normalizePL_('Пакет')
  ) {
    return originalAmount >= 0 ? amount : -amount;
  }

  if (type === normalizePL_('Вакцина')) {
    return originalAmount >= 0 ? amount : -amount;
  }

  if (type === normalizePL_('Витрати')) {
    return -amount;
  }

  if (source === normalizePL_('Нарахування')) {
    return originalAmount;
  }

  if (type === normalizePL_('Фінансова діяльність')) {
    return 0;
  }

  return originalAmount;
}

/****************************************************
 * ОПЕРАЦІЇ
 ****************************************************/

function getPLOperationsFromBase_(sheet) {
  const startRow = 10;
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

        return (
          id &&
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

          date:
            parsePLDate_(row[3]),

          amount:
            Number(row[6]) || 0,

          type:
            clean_(row[9]),

          category:
            clean_(row[10]),

          article:
            clean_(row[11]),

          status:
            clean_(row[29]),

          source:
            'База операцій'
        };
      }
    )
    .filter(
      function(operation) {
        return (
          operation.date &&
          operation.type !==
            'Інкасація'
        );
      }
    );
}

function getPLOperationsFromAccruals_(
  sheet,
  baseStatusById
) {
  const startRow = 2;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return [];
  }

  const data = sheet
    .getRange(
      startRow,
      1,
      lastRow - startRow + 1,
      8
    )
    .getValues();

  return data
    .filter(
      function(row) {
        const accrualId =
          clean_(row[0]);

        if (!accrualId) {
          return false;
        }

        const rootOperationId =
          resolvePLAccrualRootOperationId_(
            accrualId
          );

        const rootStatus =
          clean_(
            baseStatusById[
              rootOperationId
            ]
          );

        /*
         * Якщо коренева операція скасована,
         * її нарахування не потрапляє в P&L.
         *
         * Якщо операцію не знайдено в базі,
         * історичне нарахування зберігається.
         */
        return (
          rootStatus.toLowerCase() !==
          'скасовано'
        );
      }
    )
    .map(
      function(row) {
        return {
          id:
            clean_(row[0]),

          date:
            parsePLDate_(row[2]),

          amount:
            Number(row[5]) || 0,

          type:
            clean_(row[1]),

          category:
            clean_(row[3]),

          article:
            clean_(row[4]),

          comment:
            clean_(row[7]),

          source:
            'Нарахування'
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
 * СУМУВАННЯ
 ****************************************************/

function sumPLRowsByLabels_(sheet, rows, period, labels) {
  return labels.reduce((total, label) => {
    const row = getPLRow_(rows, label);
    if (!row) return total;

    return total + (Number(sheet.getRange(row, period.factCol).getValue()) || 0);
  }, 0);
}

function sumPLDetailRowsBetweenLabels_(sheet, rows, startLabel, endLabel, col) {
  const startRow = getPLRow_(rows, startLabel);
  const endRow = getPLRow_(rows, endLabel);

  if (!startRow || !endRow || endRow <= startRow) return 0;

  let total = 0;

  rows.allRows.forEach(item => {
    if (!item.isDetail) return;
    if (normalizePL_(item.label) === normalizePL_('Вакцини на зберіганні')) return;
    if (item.row <= startRow || item.row >= endRow) return;

    total += Number(sheet.getRange(item.row, col).getValue()) || 0;
  });

  return total;
}

function sumPLDetailRowsUntilNextHeaderFromArray_(rows, startRow, valuesByRowOffset) {
  const nextHeader = rows.allRows.find(item =>
    item.row > startRow && !item.isDetail
  );

  const endRow = nextHeader ? nextHeader.row : Number.MAX_SAFE_INTEGER;

  let total = 0;

  rows.allRows.forEach(item => {
    if (!item.isDetail) return;
    if (item.row <= startRow || item.row >= endRow) return;

    const index = item.row - PL_FIRST_DATA_ROW;
    total += Number(valuesByRowOffset[index]) || 0;
  });

  return total;
}

function writePLAutoCategoryTotals_(sheet, rows, period, revenue) {
  const lastRow = sheet.getLastRow();
  const numRows = lastRow - PL_FIRST_DATA_ROW + 1;

  if (numRows <= 0) return;

  const factValues = sheet
    .getRange(PL_FIRST_DATA_ROW, period.factCol, numRows, 1)
    .getValues()
    .map(row => Number(row[0]) || 0);

  const technicalSummaryRows = [
    'Операційний дохід',
    'Кількість людей в команді',
    'Валовий дохід',
    'Змінні (прямі) витрати',
    'Постійніі (операційні) витрати OPEX',
    'Постійні (операційні) витрати OPEX',
    'Загальні витрати періоду (по основним статтям + податки + змінні витрати)',
    'Операційний прибуток (EBITDA)',
    'Амортизація',
    'Амортизація обладнання',
    'Амортизація меблів',
    'Амортизація НМА',
    'Операційний прибуток (EBIT)',
    'Видатки фінансової діяльності',
    'Фінансовий результат Чистий прибуток',
    'Дохід на людину',
    'Витрати на людину',
    'Рентабельність продажів %',
    'Рентабельність видатків %',
    'Вакцини на зберіганні'
  ].map(normalizePL_);

  rows.allRows.forEach(item => {
    if (item.isDetail) return;
    if (technicalSummaryRows.includes(normalizePL_(item.label))) return;

    const total = sumPLDetailRowsUntilNextHeaderFromArray_(
      rows,
      item.row,
      factValues
    );

    writePLRow_(sheet, rows, period, item.label, total);
  });
}

/****************************************************
 * СТРУКТУРА
 ****************************************************/

function updatePLStructuresForPeriod_(sheet, rows, period, revenue) {
  const lastRow = sheet.getLastRow();
  const numRows = lastRow - PL_FIRST_DATA_ROW + 1;

  if (numRows <= 0) return;

  const revenueBase = Math.abs(Number(revenue) || 0);

  const labels = sheet
    .getRange(PL_FIRST_DATA_ROW, PL_LABEL_COL, numRows, 1)
    .getDisplayValues();

  const facts = sheet
    .getRange(PL_FIRST_DATA_ROW, period.factCol, numRows, 1)
    .getValues();

  const plans = sheet
    .getRange(PL_FIRST_DATA_ROW, period.planCol, numRows, 1)
    .getValues();

  const planStructures = [];
  const factStructures = [];
  const variances = [];

  for (let i = 0; i < numRows; i++) {
    const label = clean_(labels[i][0]);

    if (!label) {
      planStructures.push(['']);
      factStructures.push(['']);
      variances.push(['']);
      continue;
    }

    const fact = Number(facts[i][0]) || 0;
    const plan = Number(plans[i][0]) || 0;

    const context = { revenue: revenueBase };

    planStructures.push([calculatePLStructure_(label, plan, context)]);
    factStructures.push([calculatePLStructure_(label, fact, context)]);
    variances.push([fact - plan]);
  }

  sheet
    .getRange(PL_FIRST_DATA_ROW, period.planStructureCol, numRows, 1)
    .setValues(planStructures)
    .setNumberFormat('0%');

  sheet
    .getRange(PL_FIRST_DATA_ROW, period.factStructureCol, numRows, 1)
    .setValues(factStructures)
    .setNumberFormat('0%');

  sheet
    .getRange(PL_FIRST_DATA_ROW, period.varianceCol, numRows, 1)
    .setValues(variances);
}

function calculatePLStructure_(label, value, context) {
  const amount = Number(value) || 0;
  const revenue = Math.abs(Number(context && context.revenue) || 0);
  const name = normalizePL_(label);

  const noStructure = [
    'кількість людей в команді',
    'дохід на людину',
    'витрати на людину',
    'рентабельність продажів %',
    'рентабельність видатків %',
    'вакцини на зберіганні'
  ];

  if (noStructure.includes(name)) return 0;
  if (!amount || !revenue) return 0;

  return Math.abs(amount) / revenue;
}

/****************************************************
 * АВТОПЛАН
 ****************************************************/

function updatePLAutoPlanFromGeneratedFacts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = findSheetByName_(ss, PL_REPORT_SHEET_NAME);

  if (!sheet) throw new Error('Не знайдено лист "P&L"');

  const rows = getPLRows_(sheet);
  const periods = getPLPeriods_(sheet);

  updatePLAutoPlanFromGeneratedFacts_(sheet, rows, periods);

  SpreadsheetApp.getActive().toast('Автоплан P&L оновлено');
}

function updatePLAutoPlanFromGeneratedFacts_(
  sheet,
  rows,
  periods
) {
  if (
    !periods.length ||
    !rows.allRows.length
  ) {
    return;
  }

  const lastRow =
    sheet.getLastRow();

  const rowCount =
    lastRow -
    PL_FIRST_DATA_ROW +
    1;

  if (rowCount <= 0) {
    return;
  }

  /*
   * Одним читанням беремо всі колонки
   * від першого «План» до останнього «Факт».
   */
  const firstPlanColumn =
    Math.min.apply(
      null,
      periods.map(function(period) {
        return period.planCol;
      })
    );

  const lastFactColumn =
    Math.max.apply(
      null,
      periods.map(function(period) {
        return period.factCol;
      })
    );

  const columnCount =
    lastFactColumn -
    firstPlanColumn +
    1;

  const values =
    sheet
      .getRange(
        PL_FIRST_DATA_ROW,
        firstPlanColumn,
        rowCount,
        columnCount
      )
      .getValues();

  const notes =
    sheet
      .getRange(
        PL_FIRST_DATA_ROW,
        firstPlanColumn,
        rowCount,
        columnCount
      )
      .getNotes();

  const planValuesByPeriod = {};

  /*
   * Розраховуємо середній факт по кожному рядку
   * та оновлюємо лише порожні або AUTO_PLAN плани.
   */
  rows.allRows.forEach(function(item) {
    const rowIndex =
      item.row -
      PL_FIRST_DATA_ROW;

    if (
      rowIndex < 0 ||
      rowIndex >= rowCount
    ) {
      return;
    }

    const facts = periods
      .map(function(period) {
        return Number(
          values[
            rowIndex
          ][
            period.factCol -
            firstPlanColumn
          ]
        ) || 0;
      })
      .filter(function(value) {
        return value !== 0;
      });

    if (!facts.length) {
      return;
    }

    const averageFact =
      facts.reduce(function(sum, value) {
        return sum + value;
      }, 0) /
      facts.length;

    periods.forEach(function(period) {
      const columnIndex =
        period.planCol -
        firstPlanColumn;

      const currentPlan =
        values[rowIndex][columnIndex];

      const note =
        clean_(
          notes[rowIndex][columnIndex]
        );

      const isEmpty =
        currentPlan === '' ||
        currentPlan === null;

      const isAutoPlan =
        note ===
        PL_AUTO_PLAN_NOTE;

      if (
        !isEmpty &&
        !isAutoPlan
      ) {
        return;
      }

      values[rowIndex][columnIndex] =
        averageFact;

      notes[rowIndex][columnIndex] =
        PL_AUTO_PLAN_NOTE;
    });
  });

  /*
   * Записуємо плани та примітки колонками,
   * а не по одній клітинці.
   */
  periods.forEach(function(period) {
    const columnIndex =
      period.planCol -
      firstPlanColumn;

    const planValues =
      values.map(function(row) {
        return [
          row[columnIndex]
        ];
      });

    const planNotes =
      notes.map(function(row) {
        return [
          row[columnIndex]
        ];
      });

    sheet
      .getRange(
        PL_FIRST_DATA_ROW,
        period.planCol,
        rowCount,
        1
      )
      .setValues(
        planValues
      )
      .setNotes(
        planNotes
      );

    planValuesByPeriod[
      period.planCol
    ] = planValues;
  });

  updatePLPlanStructuresForAllPeriods_(
    sheet,
    rows,
    periods,
    planValuesByPeriod
  );
}


function updatePLPlanStructuresForAllPeriods_(
  sheet,
  rows,
  periods,
  planValuesByPeriod
) {
  const revenueRow =
    getPLRow_(
      rows,
      'Операційний дохід'
    );

  if (!revenueRow) {
    return;
  }

  const lastRow =
    sheet.getLastRow();

  const rowCount =
    lastRow -
    PL_FIRST_DATA_ROW +
    1;

  if (rowCount <= 0) {
    return;
  }

  periods.forEach(function(period) {
    const planValues =
      planValuesByPeriod[
        period.planCol
      ];

    if (!planValues) {
      return;
    }

    const revenueIndex =
      revenueRow -
      PL_FIRST_DATA_ROW;

    const planRevenue =
      Number(
        planValues[
          revenueIndex
        ][0]
      ) || 0;

    const structures =
      planValues.map(function() {
        return [0];
      });

    rows.allRows.forEach(function(item) {
      const rowIndex =
        item.row -
        PL_FIRST_DATA_ROW;

      if (
        rowIndex < 0 ||
        rowIndex >= rowCount
      ) {
        return;
      }

      const plan =
        Number(
          planValues[
            rowIndex
          ][0]
        ) || 0;

      structures[rowIndex][0] =
        calculatePLStructure_(
          item.label,
          plan,
          {
            revenue:
              planRevenue
          }
        );
    });

    sheet
      .getRange(
        PL_FIRST_DATA_ROW,
        period.planStructureCol,
        rowCount,
        1
      )
      .setValues(
        structures
      )
      .setNumberFormat(
        '0.00%;[Red]-0.00%;0.00%'
      );
  });
}

/****************************************************
 * ВСЬОГО ФАКТ
 ****************************************************/

function writeTotalFact_(sheet, rows, periods) {
  const totalCol = getPLTotalFactCol_(sheet);
  if (!totalCol) return;

  Object.keys(rows.byNorm).forEach(key => {
    const row = rows.byNorm[key];

    const refs = periods.map(period =>
      columnToLetter_(period.factCol) + row
    );

    const formula = '=SUM(' + refs.join(',') + ')';

    sheet.getRange(row, totalCol).setFormula(formula);
  });
}

function getPLTotalFactCol_(sheet) {
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(PL_HEADER_ROW, 1, 1, lastCol).getDisplayValues()[0];

  for (let i = 0; i < headers.length; i++) {
    if (normalizePL_(headers[i]) === normalizePL_('Всього факт')) {
      return i + 1;
    }
  }

  return null;
}

/****************************************************
 * ОЧИСТКА
 ****************************************************/

function clearPLPeriodValues_(sheet, period) {
  const lastRow = sheet.getLastRow();
  const numRows = lastRow - PL_FIRST_DATA_ROW + 1;

  if (numRows <= 0) return;

  const labels = sheet
    .getRange(PL_FIRST_DATA_ROW, PL_LABEL_COL, numRows, 1)
    .getDisplayValues();

  const values = labels.map(row => {
    const label = clean_(row[0]);
    return [label ? 0 : ''];
  });

  sheet.getRange(PL_FIRST_DATA_ROW, period.planStructureCol, numRows, 1).setValues(values);
  sheet.getRange(PL_FIRST_DATA_ROW, period.factCol, numRows, 1).setValues(values);
  sheet.getRange(PL_FIRST_DATA_ROW, period.factStructureCol, numRows, 1).setValues(values);
  sheet.getRange(PL_FIRST_DATA_ROW, period.varianceCol, numRows, 1).setValues(values);
}
/****************************************************
 * ДОПОМІЖНІ
 ****************************************************/

function getPLTeamCount_(sheet, rows, period) {
  const inputValue = Number(sheet.getRange(PL_TEAM_INPUT_CELL).getValue()) || 0;

  if (inputValue) {
    return inputValue;
  }

  const row = getPLRowAny_(rows, [
    'Кількість людей в команді',
    'Кількість людей у команді',
    'Команда',
    'Людей в команді'
  ]);

  if (!row) return 0;

  const fact = Number(sheet.getRange(row, period.factCol).getValue()) || 0;
  const plan = Number(sheet.getRange(row, period.planCol).getValue()) || 0;

  return fact || plan || 0;
}

function normalizePL_(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function clean_(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parsePLDate_(value) {
  if (value instanceof Date && !isNaN(value)) return value;

  const text = clean_(value);
  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!match) return null;

  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );
}

function findSheetByName_(ss, name) {
  const target = clean_(name).toLowerCase();

  return ss.getSheets().find(sheet =>
    clean_(sheet.getName()).toLowerCase() === target
  );
}

function columnToLetter_(column) {
  let temp = '';
  let letter = '';

  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }

  return letter;
}
function getSelectedPLPeriodFromDirectory_(ss, reportSheet) {
  const monthName = clean_(reportSheet.getRange(PL_SELECTED_MONTH_CELL).getDisplayValue());
  const year = Number(reportSheet.getRange(PL_SELECTED_YEAR_CELL).getValue());

  if (!monthName || !year) {
    throw new Error('Вкажіть місяць у D3 і рік у E3');
  }

  const dictSheet = findSheetByName_(ss, PL_MONTHS_DICT_SHEET_NAME);

  if (!dictSheet) {
    throw new Error('Не знайдено лист "Довідник"');
  }

  const lastRow = dictSheet.getLastRow();

  const monthNames = dictSheet
    .getRange(1, PL_MONTHS_DICT_MONTH_COL, lastRow, 1)
    .getDisplayValues();

  const years = dictSheet
    .getRange(1, PL_MONTHS_DICT_YEAR_COL, lastRow, 1)
    .getValues();

  let selectedMonth = null;

  for (let i = 0; i < monthNames.length; i++) {
    const dictMonthName = clean_(monthNames[i][0]);

    if (normalizePL_(dictMonthName) === normalizePL_(monthName)) {
      selectedMonth = i + 1;
      break;
    }
  }

  if (!selectedMonth) {
    throw new Error('Не знайдено місяць у Довіднику: ' + monthName);
  }

  const yearExists = years.some(row => Number(row[0]) === year);

  if (!yearExists) {
    throw new Error('Не знайдено рік у Довіднику: ' + year);
  }

  return {
    month: selectedMonth,
    year: year
  };
}
function isVaccineCostAccrual_(op) {
  if (normalizePL_(op.source) !== normalizePL_('Нарахування')) return false;

  const text = normalizePL_(
    clean_(op.id) + ' ' +
    clean_(op.type) + ' ' +
    clean_(op.category) + ' ' +
    clean_(op.article) + ' ' +
    clean_(op.comment)
  );

  return (
    text.includes('вакцин') &&
    (
      text.includes('собіварт') ||
      text.includes('списання')
    )
  );
}

function isStoredVaccineSale_(op) {
  if (normalizePL_(op.type) !== normalizePL_('Вакцина')) return false;

  const text = normalizePL_(
    clean_(op.category) + ' ' +
    clean_(op.article) + ' ' +
    clean_(op.comment)
  );

  return (
    text.includes('зберіган') ||
    text.includes('на зберіганні')
  );
}

function isVaccineNurseService_(op) {
  if (normalizePL_(op.type) !== normalizePL_('Вакцина')) return false;

  const text = normalizePL_(
    clean_(op.category) + ' ' +
    clean_(op.article) + ' ' +
    clean_(op.comment)
  );

  return (
    text.includes('медсестр') ||
    text.includes('послуги медсестри')
  );
}
function calculatePLStoredVaccinesAmount_(operations) {
  return operations
    .filter(op => isStoredVaccineSale_(op))
    .reduce((sum, op) => sum + Math.abs(Number(op.amount) || 0), 0);
}

function writePLInfoTotals_(sheet, rows, period, operations) {
  const storedVaccinesAmount = calculatePLStoredVaccinesAmount_(operations);

  writePLRow_(
    sheet,
    rows,
    period,
    'Вакцини на зберіганні',
    storedVaccinesAmount
  );
}
/**
 * СТАТУСИ ОПЕРАЦІЙ ІЗ БАЗИ.
 */
function getPLBaseStatusByOperationId_(
  sheet
) {
  const startRow = 10;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return {};
  }

  const values = sheet
    .getRange(
      startRow,
      1,
      lastRow - startRow + 1,
      30
    )
    .getDisplayValues();

  const result = {};

  values.forEach(
    function(row) {
      const operationId =
        clean_(row[0]);

      if (!operationId) {
        return;
      }

      result[operationId] =
        clean_(row[29]);
    }
  );

  return result;
}


/**
 * ВИЗНАЧАЄ КОРЕНЕВУ ВАКЦИННУ ОПЕРАЦІЮ.
 *
 * VST|VAC-123|VAC-123-V1
 * перетворюється на VAC-123.
 */
function resolvePLAccrualRootOperationId_(
  operationId
) {
  const id =
    clean_(operationId);

  if (
    id.indexOf('VST|') === 0
  ) {
    const parts =
      id.split('|');

    return (
      clean_(parts[1]) ||
      id
    );
  }

  return id;
}
/**
 * СУХИЙ АУДИТ ДЖЕРЕЛ СОБІВАРТОСТІ ВАКЦИН У P&L.
 *
 * Нічого не записує.
 * Показує, які записи з 01.07.2026 вже формують
 * вакцинні витрати у чинній логіці P&L.
 */
function auditPLVaccineCostSourcesFromJuly2026() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    findSheetByName_(
      ss,
      PL_BASE_SHEET_NAME
    );

  const accrualSheet =
    findSheetByName_(
      ss,
      PL_ACCRUAL_SHEET_NAME
    );

  const mappingSheet =
    findSheetByName_(
      ss,
      PL_MAPPING_SHEET_NAME
    );

  if (
    !baseSheet ||
    !mappingSheet
  ) {
    throw new Error(
      'Не знайдено один із листів P&L: ' +
      '"База операцій" або "Мапінг".'
    );
  }

  const mapping =
    getPLMapping_(mappingSheet);

  const baseStatusById =
    getPLBaseStatusByOperationId_(
      baseSheet
    );

  const operations =
    getPLOperationsFromBase_(
      baseSheet
    ).concat(
      accrualSheet
        ? getPLOperationsFromAccruals_(
            accrualSheet,
            baseStatusById
          )
        : []
    );

  const startDate =
    new Date(
      '2026-07-01T00:00:00'
    );

  const rows =
    operations
      .filter(function(op) {
        return (
          op.date &&
          op.date >= startDate
        );
      })
      .map(function(op) {
        const plGroup =
          getMappedPLGroup_(
            op,
            mapping
          );

        const text =
          normalizePL_(
            [
              op.type,
              op.category,
              op.article,
              op.comment,
              plGroup
            ].join(' ')
          );

        return {
          id: op.id,
          date: op.date,
          month: Utilities.formatDate(
            op.date,
            Session.getScriptTimeZone(),
            'yyyy-MM'
          ),
          source: op.source,
          type: op.type,
          category: op.category,
          article: op.article,
          plGroup: plGroup,
          amount:
            normalizePLAmount_(
              op,
              mapping
            ),
          matchesVaccineCost:
            text.indexOf('вакцин') !== -1 ||
            text.indexOf('собіварт') !== -1
        };
      })
      .filter(function(item) {
        return item.matchesVaccineCost;
      });

  const summary = {};

  rows.forEach(function(item) {
    const key =
      item.month +
      ' | ' +
      item.source +
      ' | ' +
      (item.plGroup || 'БЕЗ ГРУПИ');

    summary[key] =
      Math.round(
        (
          Number(summary[key] || 0) +
          Number(item.amount || 0)
        ) * 100
      ) / 100;
  });

  const result = {
    ok: true,
    test:
      'auditPLVaccineCostSourcesFromJuly2026',
    writesNow: false,
    spreadsheet: ss.getName(),
    operationCount: rows.length,
    totalAmount:
      Math.round(
        rows.reduce(function(sum, item) {
          return sum +
            Number(item.amount || 0);
        }, 0) * 100
      ) / 100,
    summary: summary,
    sampleRows:
      rows.slice(0, 30)
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
function restorePLGenerateButtonPosition_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheets().find(function(item) {
      return String(item.getName() || '')
        .trim()
        .toLowerCase() === 'p&l';
    });

  if (!sheet) {
    throw new Error('Не знайдено лист "P&L".');
  }

  const buttons =
    sheet.getDrawings().filter(function(drawing) {
      return String(
        drawing.getOnAction() || ''
      ).trim() ===
        'generatePLReportForSelectedPeriod';
    });

  if (buttons.length !== 1) {
    throw new Error(
      'Знайдено кнопок генерації P&L: ' +
        buttons.length +
        '. Очікується одна.'
    );
  }

  buttons[0].setPosition(
    4, // рядок D4
    4, // колонка D
    0,
    0
  );

  return {
    ok: true,
    sheet: sheet.getName(),
    anchor: 'D4',
    action: buttons[0].getOnAction()
  };
}
function restorePLGenerateButtonPosition() {
  return restorePLGenerateButtonPosition_();
}
function applyPLReportNumberFormats() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheets().find(function(item) {
      return String(item.getName() || '')
        .trim()
        .toLowerCase() === 'p&l';
    });

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "P&L".'
    );
  }

  const headerRow = 7;
  const firstDataRow = 8;
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  const headers =
    sheet
      .getRange(
        headerRow,
        1,
        1,
        lastColumn
      )
      .getDisplayValues()[0];

  const moneyColumns = [];
  const percentColumns = [];

  headers.forEach(function(header, index) {
    const text =
      String(header || '').trim();

    const column = index + 1;

    if (
      text.indexOf('План ') === 0 ||
      text.indexOf('Факт ') === 0 ||
      text === 'Відхилення'
    ) {
      moneyColumns.push(column);
    }

    if (text === 'Структура') {
      percentColumns.push(column);
    }
  });

  const rowCount =
    lastRow - firstDataRow + 1;

  moneyColumns.forEach(function(column) {
    sheet
      .getRange(
        firstDataRow,
        column,
        rowCount,
        1
      )
      .setNumberFormat(
        '#,##0.00;[Red]-#,##0.00;0.00'
      );
  });

  percentColumns.forEach(function(column) {
    sheet
      .getRange(
        firstDataRow,
        column,
        rowCount,
        1
      )
      .setNumberFormat(
        '0.00%;[Red]-0.00%;0.00%'
      );
  });

  /*
   * Кількість людей — ціле число,
   * не сума у гривнях.
   */
  const labels =
    sheet
      .getRange(
        firstDataRow,
        3,
        rowCount,
        1
      )
      .getDisplayValues();

  labels.forEach(function(row, index) {
    const label =
      String(row[0] || '')
        .trim()
        .toLowerCase();

    const targetRow =
      firstDataRow + index;

    if (
      label ===
      'кількість людей в команді'
    ) {
      moneyColumns.forEach(function(column) {
        sheet
          .getRange(
            targetRow,
            column
          )
          .setNumberFormat('0');
      });
    }

    if (
      label.indexOf('рентабельність') !== -1
    ) {
      moneyColumns.forEach(function(column) {
        sheet
          .getRange(
            targetRow,
            column
          )
          .setNumberFormat(
            '0.00%;[Red]-0.00%;0.00%'
          );
      });
    }
  });

  return {
    ok: true,
    moneyColumns: moneyColumns.length,
    percentColumns: percentColumns.length
  };
}
/**
 * R0: перевірка готовності P&L до відображення
 * собівартості передач Альтернатива → Бабурка.
 *
 * Нічого не записує.
 */
function auditPLInterbranchTransferCostReadiness() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const plSheet =
    findSheetByName_(
      ss,
      PL_REPORT_SHEET_NAME
    );

  const settlementsSheet =
    ss.getSheetByName(
      'Взаєморозрахунки філій'
    );

  if (!plSheet) {
    throw new Error(
      'Не знайдено лист "P&L".'
    );
  }

  if (!settlementsSheet) {
    throw new Error(
      'Не знайдено лист "Взаєморозрахунки філій".'
    );
  }

  const rows =
    getPLRows_(plSheet);

  const targetLabels = [
    'Собівартість передач на Бабурку',
    'Собівартість міжфілійних передач'
  ];

  const existingRows =
    targetLabels
      .map(function(label) {
        return {
          label: label,
          row: getPLRow_(
            rows,
            label
          )
        };
      })
      .filter(function(item) {
        return Boolean(item.row);
      });

  const lastRow =
    settlementsSheet.getLastRow();

  const settlementRows =
    lastRow < 2
      ? []
      : settlementsSheet
          .getRange(
            2,
            1,
            lastRow - 1,
            16
          )
          .getValues();

  const byMonth = {};

  settlementRows.forEach(function(row) {
    const creditor =
      clean_(row[4]);

    const debtor =
      clean_(row[5]);

    const month =
      clean_(row[3]);

    const amount =
      Number(row[9]) || 0;

    const status =
      clean_(row[13]);

    /*
     * Беремо лише чинні нарахування
     * Альтернатива → Бабурка.
     */
    if (
      creditor !== 'Альтернатива' ||
      debtor !== 'Бабурка' ||
      !month ||
      amount <= 0 ||
      status === 'Скасовано'
    ) {
      return;
    }

    byMonth[month] =
      Math.round(
        (
          Number(byMonth[month] || 0) +
          amount
        ) * 100
      ) / 100;
  });

  const result = {
    ok:
      existingRows.length === 1 &&
      Object.keys(byMonth).length > 0,

    test:
      'auditPLInterbranchTransferCostReadiness',

    writesNow:
      false,

    spreadsheet:
      ss.getName(),

    plTargetRows:
      existingRows,

    settlementRowsFound:
      settlementRows.length,

    transferCostByMonth:
      byMonth,

    nextDecision:
      existingRows.length === 1
        ? 'READY_FOR_PL_CONNECTION'
        : 'ADD_ONE_SEPARATE_PL_ROW'
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
/**
 * Собівартість прийнятих передач
 * Альтернатива → Бабурка за місяць P&L.
 *
 * Працює лише в P&L Альтернативи.
 * Не впливає на Cash Flow, Базу операцій
 * або P&L Бабурки.
 */
function getPLInterbranchTransferCostForPeriod_(
  spreadsheet,
  period
) {
  if (
    typeof INTERBRANCH_SETTLEMENTS_CONFIG ===
      'undefined' ||
    typeof getCurrentInterbranchBranch_ !==
      'function'
  ) {
    return 0;
  }

  const config =
    INTERBRANCH_SETTLEMENTS_CONFIG;

  const currentBranch =
    getCurrentInterbranchBranch_(
      spreadsheet.getId()
    );

  if (
    !currentBranch ||
    currentBranch.name !==
      config.creditorBranch
  ) {
    return 0;
  }

  const settlementsSheet =
    spreadsheet.getSheetByName(
      config.settlementSheetName
    );

  if (
    !settlementsSheet ||
    settlementsSheet.getLastRow() < 2
  ) {
    return 0;
  }

  const accrualMonth =
    Utilities.formatDate(
      period.startDate,
      Session.getScriptTimeZone(),
      'yyyy-MM'
    );

  const values =
    settlementsSheet
      .getRange(
        2,
        1,
        settlementsSheet.getLastRow() - 1,
        16
      )
      .getValues();

  const total =
    values.reduce(function(sum, row) {
      const rowMonth =
        clean_(row[3]);

      const creditor =
        clean_(row[4]);

      const debtor =
        clean_(row[5]);

      const amount =
        Number(row[9]) || 0;

      const status =
        clean_(row[13]);

      if (
        rowMonth !== accrualMonth ||
        creditor !== config.creditorBranch ||
        debtor !== config.debtorBranch ||
        status === 'Скасовано'
      ) {
        return sum;
      }

      return sum + amount;
    }, 0);

  /*
   * У P&L витрата завжди від’ємна.
   */
  return -Math.round(total * 100) / 100;
}