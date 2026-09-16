// ============================================================
// Dashboard_Expense_Structure_Pie_From_PL.gs
// ProFin OS 2026 — Альтернатива Бабурка
// ============================================================
//
// Призначення:
//   P&L!C24:C36 — назви рядків витрат
//   P&L!B24:B36 — стабільні коди деталізованих статей
//   P&L!N24:N36 — фактичні значення витрат
//   P&L!N24     — контрольний підсумок сектора
//
// Чому ручна кругова діаграма не відображається:
//   у P&L витрати збережені як від'ємні значення;
//   кругова діаграма потребує невід'ємні числові значення.
//
// Що робить модуль:
//   1) читає P&L без змін;
//   2) бере секторні підсумки всередині вибраного блоку P&L;
//   3) перетворює витрати на абсолютні значення тільки в кеші;
//   4) перевіряє тотожність секторів з N24;
//   5) записує кеш у «Дані дашборду»!AA1:AB100;
//   6) одноразово створює стабільну кругову діаграму;
//   7) подальше оновлення змінює тільки кеш — не перебудовує діаграму.
//
// Публічні функції:
//   dashboardExpenseStructureDryRun()
//   dashboardExpenseStructureInstall()
//   dashboardExpenseStructureRefresh()
//   dashboardExpenseStructureAudit()
//   dashboardExpenseStructureRepair()
//
// «P&L» та первинні дані ніколи не змінюються.

const DASHBOARD_EXPENSE_STRUCTURE_CONFIG = {
  moduleVersion: 'EXPENSE_STRUCTURE_PIE_FROM_PL_V2_NAMED_RANGE_FIX',

  sourceSheetName: 'P&L',
  dashboardSheetName: 'Дашборд',
  cacheSheetName: 'Дані дашборду',

  source: {
    firstRow: 24,
    lastRow: 36,
    codeColumn: 2,      // B
    labelColumn: 3,     // C
    valueColumn: 14,    // N
    controlTotalCell: 'N24',
    periodHeaderCell: 'N7'
  },

  cache: {
    namedRange: 'DASH_EXPENSE_STRUCTURE_DATA',
    rangeA1: 'AA1:AB100'
  },

  chart: {
    title: 'Діаграма по секторам витрат за період',

    // Фізична зона порожньої діаграми у блоці «ВИТРАТИ».
    anchorZone: {
      minRow: 82,
      maxRow: 102,
      minColumn: 1,
      maxColumn: 4
    },

    defaultPosition: {
      row: 84,
      column: 2,
      offsetX: 0,
      offsetY: 0
    },

    defaultWidth: 500,
    defaultHeight: 265,

    titleNeedles: [
      'секторах витрат',
      'структура витрат',
      'витрат за період'
    ]
  },

  properties: {
    chartId: 'PROFIN_DASH_EXPENSE_STRUCTURE_CHART_ID',
    chartVersion: 'PROFIN_DASH_EXPENSE_STRUCTURE_CHART_VERSION'
  },

  tolerance: 0.01,
  lockTimeoutMs: 20000,
  chartOperationAttempts: 4
};


// ============================================================
// 1. DRY RUN — НІЧОГО НЕ ЗАПИСУЄ
// ============================================================

function dashboardExpenseStructureDryRun() {
  // Dry Run перевіряє тільки джерело P&L і не залежить від кешу
  // або поточної адреси named range. Нічого не записує.
  const context = dashboardExpenseStructureAssertSourceReady_();
  const model = dashboardExpenseStructureBuildModel_(context.sourceSheet);

  const result = {
    ok: model.controlOk,
    period: model.period,
    source: {
      labels: 'P&L!C24:C36',
      values: 'P&L!N24:N36',
      controlTotal: 'P&L!N24'
    },
    controlTotal: model.controlTotal,
    detailTotal: model.detailTotal,
    difference: model.difference,
    rowsIncluded: model.items.length,
    skippedRows: model.skippedRows,
    preview: model.output.slice(0, 20),
    issues: model.issues,
    noCellsWritten: true
  };

  Logger.log(
    'dashboardExpenseStructureDryRun: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


// ============================================================
// 2. ОДНОРАЗОВА ІДЕМПОТЕНТНА ІНСТАЛЯЦІЯ
// ============================================================

function dashboardExpenseStructureInstall() {
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(DASHBOARD_EXPENSE_STRUCTURE_CONFIG.lockTimeoutMs)) {
    throw new Error('Не вдалося отримати блокування для інсталяції діаграми витрат.');
  }

  try {
    const context = dashboardExpenseStructureCreateOrRepairContext_();
    const model = dashboardExpenseStructureBuildModel_(context.sourceSheet);

    dashboardExpenseStructureAssertControl_(model);
    dashboardExpenseStructureWriteCache_(context.cacheRange, model.output);

    SpreadsheetApp.flush();

    const chartResult = dashboardExpenseStructureEnsureChart_(context, false);

    const result = {
      ok: true,
      moduleVersion: DASHBOARD_EXPENSE_STRUCTURE_CONFIG.moduleVersion,
      period: model.period,
      controlTotal: model.controlTotal,
      detailTotal: model.detailTotal,
      difference: model.difference,
      rowsWritten: model.items.length,
      cacheRange: dashboardExpenseStructureRangeRef_(context.cacheRange),
      chartId: chartResult.chartId,
      chartInserted: chartResult.inserted,
      chartReused: chartResult.reused,
      oldChartRemoved: chartResult.oldChartRemoved,
      noSourceCellsWritten: true
    };

    Logger.log(
      'dashboardExpenseStructureInstall: ' +
      JSON.stringify(result, null, 2)
    );

    return result;

  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// 3. РОБОЧЕ ОНОВЛЕННЯ — ТІЛЬКИ КЕШ
// ============================================================

function dashboardExpenseStructureRefresh() {
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(DASHBOARD_EXPENSE_STRUCTURE_CONFIG.lockTimeoutMs)) {
    throw new Error('Не вдалося отримати блокування для оновлення діаграми витрат.');
  }

  const startedAt = Date.now();

  try {
    const context = dashboardExpenseStructureAssertReady_(true);
    const model = dashboardExpenseStructureBuildModel_(context.sourceSheet);

    dashboardExpenseStructureAssertControl_(model);
    dashboardExpenseStructureWriteCache_(context.cacheRange, model.output);

    SpreadsheetApp.flush();

    const result = {
      ok: true,
      period: model.period,
      controlTotal: model.controlTotal,
      detailTotal: model.detailTotal,
      difference: model.difference,
      rowsWritten: model.items.length,
      cacheRange: dashboardExpenseStructureRangeRef_(context.cacheRange),
      chartObjectChanged: false,
      durationMs: Date.now() - startedAt,
      noSourceCellsWritten: true
    };

    Logger.log(
      'dashboardExpenseStructureRefresh: ' +
      JSON.stringify(result, null, 2)
    );

    return result;

  } finally {
    lock.releaseLock();
  }
}


// ============================================================
// 4. РОЗРАХУНКОВЕ ЯДРО — READ ONLY
// ============================================================

function dashboardExpenseStructureBuildModel_(sourceSheet) {
  const cfg = DASHBOARD_EXPENSE_STRUCTURE_CONFIG.source;
  const rowCount = cfg.lastRow - cfg.firstRow + 1;

  const startColumn = Math.min(cfg.codeColumn, cfg.labelColumn, cfg.valueColumn);
  const endColumn = Math.max(cfg.codeColumn, cfg.labelColumn, cfg.valueColumn);
  const columnCount = endColumn - startColumn + 1;

  const values = sourceSheet
    .getRange(cfg.firstRow, startColumn, rowCount, columnCount)
    .getValues();

  const codeOffset = cfg.codeColumn - startColumn;
  const labelOffset = cfg.labelColumn - startColumn;
  const valueOffset = cfg.valueColumn - startColumn;

  const period = dashboardExpenseStructureClean_(
    sourceSheet.getRange(cfg.periodHeaderCell).getDisplayValue()
  );

  const controlRaw = sourceSheet.getRange(cfg.controlTotalCell).getValue();
  const controlNumber = dashboardExpenseStructureNumber_(controlRaw);
  const controlTotal = controlNumber === null ? null : Math.abs(controlNumber);

  const items = [];
  const skippedRows = [];
  const issues = [];
  let detailTotal = 0;

  for (let index = 0; index < values.length; index++) {
    const sheetRow = cfg.firstRow + index;
    const row = values[index];

    const code = dashboardExpenseStructureClean_(row[codeOffset]);
    const label = dashboardExpenseStructureClean_(row[labelOffset]);
    const rawValue = dashboardExpenseStructureNumber_(row[valueOffset]);

    // Перший рядок N24 — контрольний підсумок усього блоку.
    // Він не є окремим сектором діаграми.
    if (sheetRow === cfg.firstRow) {
      skippedRows.push({
        row: sheetRow,
        reason: 'CONTROL_TOTAL_ROW',
        label: label
      });
      continue;
    }

    // У цьому P&L секторні підсумки («Лікарі»,
    // «Медичні витрати») не мають коду в колонці B.
    // Рядки зі стабільним кодом є деталізацією секторів,
    // тому їх не додаємо вдруге і не подвоюємо суму.
    if (code) {
      skippedRows.push({
        row: sheetRow,
        reason: 'DETAIL_ROW',
        code: code,
        label: label
      });
      continue;
    }

    if (!label) {
      skippedRows.push({
        row: sheetRow,
        reason: 'EMPTY_LABEL'
      });
      continue;
    }

    if (rawValue === null) {
      skippedRows.push({
        row: sheetRow,
        reason: 'NOT_NUMERIC',
        label: label
      });
      continue;
    }

    const amount = Math.abs(rawValue);

    if (amount <= DASHBOARD_EXPENSE_STRUCTURE_CONFIG.tolerance) {
      skippedRows.push({
        row: sheetRow,
        reason: 'ZERO_VALUE',
        label: label
      });
      continue;
    }

    detailTotal += amount;

    items.push({
      row: sheetRow,
      label: label,
      sourceValue: rawValue,
      amount: amount
    });
  }

  detailTotal = dashboardExpenseStructureRound2_(detailTotal);

  const difference = controlTotal === null
    ? null
    : dashboardExpenseStructureRound2_(detailTotal - controlTotal);

  const controlOk =
    controlTotal !== null &&
    Math.abs(difference) <= DASHBOARD_EXPENSE_STRUCTURE_CONFIG.tolerance;

  if (controlTotal === null) {
    issues.push({
      code: 'CONTROL_TOTAL_NOT_NUMERIC',
      cell: cfg.controlTotalCell,
      message: 'Контрольний підсумок P&L не є числом.'
    });
  }

  if (!controlOk && controlTotal !== null) {
    issues.push({
      code: 'SECTOR_TOTAL_MISMATCH',
      expected: controlTotal,
      actual: detailTotal,
      difference: difference,
      message: 'Сума секторів не дорівнює підсумку блоку P&L.'
    });
  }

  items.sort(function(first, second) {
    if (second.amount !== first.amount) {
      return second.amount - first.amount;
    }
    return first.label.localeCompare(second.label, 'uk');
  });

  const output = [
    ['Сектор витрат', 'Сума, грн']
  ];

  items.forEach(function(item) {
    const labelWithAmount =
      item.label +
      ' — ' +
      dashboardExpenseStructureFormatMoney_(item.amount);

    output.push([
      labelWithAmount,
      item.amount
    ]);
  });

  if (items.length === 0) {
    output.push(['Немає даних за період', 0]);
  }

  return {
    period: period,
    controlTotal: controlTotal,
    detailTotal: detailTotal,
    difference: difference,
    controlOk: controlOk,
    items: items,
    skippedRows: skippedRows,
    issues: issues,
    output: output
  };
}

function dashboardExpenseStructureAssertControl_(model) {
  if (!model.controlOk) {
    throw new Error(
      'Контрольна тотожність витрат не пройдена. ' +
      'P&L підсумок: ' + model.controlTotal +
      '; деталізація: ' + model.detailTotal +
      '; різниця: ' + model.difference +
      '. Кеш і діаграма не оновлені.'
    );
  }

  if (model.items.length === 0) {
    throw new Error('У вибраному діапазоні P&L немає ненульових деталізованих витрат.');
  }
}


// ============================================================
// 5. БЕЗПЕЧНИЙ ЗАПИС КЕШУ
// ============================================================

function dashboardExpenseStructureWriteCache_(targetRange, output) {
  if (!Array.isArray(output) || output.length < 2) {
    throw new Error('Немає даних для кешу діаграми витрат.');
  }

  if (output[0].length !== 2) {
    throw new Error('Кеш діаграми витрат повинен мати рівно 2 колонки.');
  }

  if (
    output.length > targetRange.getNumRows() ||
    targetRange.getNumColumns() < 2
  ) {
    throw new Error(
      'Службовий діапазон замалий. Потрібно ' +
      output.length + ' рядків × 2 колонки.'
    );
  }

  const snapshot = targetRange.getValues();

  try {
    targetRange.clearContent();

    targetRange
      .offset(0, 0, output.length, 2)
      .setValues(output);

    targetRange
      .offset(1, 1, output.length - 1, 1)
      .setNumberFormat('#,##0.00');

  } catch (error) {
    targetRange.setValues(snapshot);
    SpreadsheetApp.flush();
    throw error;
  }
}


// ============================================================
// 6. ОДНОРАЗОВЕ СТАБІЛЬНЕ СТВОРЕННЯ ДІАГРАМИ
// ============================================================

function dashboardExpenseStructureEnsureChart_(context, forceReplace) {
  const properties = PropertiesService.getDocumentProperties();

  const storedVersion = properties.getProperty(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.properties.chartVersion
  );

  const storedId = properties.getProperty(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.properties.chartId
  );

  const managedChart = dashboardExpenseStructureFindChartById_(
    context.dashboardSheet,
    storedId
  );

  if (
    !forceReplace &&
    managedChart &&
    storedVersion === DASHBOARD_EXPENSE_STRUCTURE_CONFIG.moduleVersion &&
    dashboardExpenseStructureChartUsesRange_(managedChart, context.cacheRange)
  ) {
    return {
      chartId: managedChart.getChartId(),
      inserted: false,
      reused: true,
      oldChartRemoved: false
    };
  }

  const targetResult = dashboardExpenseStructureFindTargetChart_(
    context.dashboardSheet
  );

  const oldTarget = managedChart || targetResult.chart;
  const placement = dashboardExpenseStructureGetPlacement_(oldTarget);

  const insertedChart = dashboardExpenseStructureInsertChartWithRetry_(
    context,
    placement
  );

  let oldChartRemoved = false;

  if (
    oldTarget &&
    String(oldTarget.getChartId()) !== String(insertedChart.getChartId())
  ) {
    dashboardExpenseStructureRemoveChartWithRetry_(
      context.dashboardSheet,
      oldTarget
    );
    oldChartRemoved = true;
  }

  properties.setProperty(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.properties.chartId,
    String(insertedChart.getChartId())
  );

  properties.setProperty(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.properties.chartVersion,
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.moduleVersion
  );

  return {
    chartId: insertedChart.getChartId(),
    inserted: true,
    reused: false,
    oldChartRemoved: oldChartRemoved
  };
}


function dashboardExpenseStructureInsertChartWithRetry_(context, placement) {
  const sheet = context.dashboardSheet;
  const beforeIds = {};

  sheet.getCharts().forEach(function(chart) {
    beforeIds[String(chart.getChartId())] = true;
  });

  let lastError = null;

  for (
    let attempt = 1;
    attempt <= DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chartOperationAttempts;
    attempt++
  ) {
    try {
      const existingCandidate = dashboardExpenseStructureFindNewChart_(
        sheet,
        beforeIds,
        context.cacheRange,
        placement
      );

      if (existingCandidate) {
        return existingCandidate;
      }

      const chart = dashboardExpenseStructureBuildPieChart_(
        sheet,
        context.cacheRange,
        placement,
        context.sourceSheet
      );

      sheet.insertChart(chart);
      SpreadsheetApp.flush();
      Utilities.sleep(350);

      const inserted = dashboardExpenseStructureFindNewChart_(
        sheet,
        beforeIds,
        context.cacheRange,
        placement
      );

      if (!inserted) {
        throw new Error('Нову діаграму вставлено, але не вдалося підтвердити її джерело.');
      }

      return inserted;

    } catch (error) {
      lastError = error;

      const candidateAfterError = dashboardExpenseStructureFindNewChart_(
        sheet,
        beforeIds,
        context.cacheRange,
        placement
      );

      if (candidateAfterError) {
        return candidateAfterError;
      }

      if (
        !dashboardExpenseStructureIsTransientChartError_(error) ||
        attempt === DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chartOperationAttempts
      ) {
        break;
      }

      Utilities.sleep(500 * Math.pow(2, attempt - 1));
    }
  }

  throw new Error(
    'Не вдалося вставити кругову діаграму витрат. Остання помилка: ' +
    (lastError && lastError.message ? lastError.message : String(lastError))
  );
}


function dashboardExpenseStructureBuildPieChart_(
  dashboardSheet,
  sourceRange,
  placement,
  sourceSheet
) {
  const period = dashboardExpenseStructureClean_(
    sourceSheet
      .getRange(DASHBOARD_EXPENSE_STRUCTURE_CONFIG.source.periodHeaderCell)
      .getDisplayValue()
  );

  const title = period
    ? DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chart.title + ' — ' + period
    : DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chart.title;

  return dashboardSheet
    .newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(sourceRange)
    .setNumHeaders(1)
    .setTransposeRowsAndColumns(false)
    .setPosition(
      placement.row,
      placement.column,
      placement.offsetX,
      placement.offsetY
    )
    .setOption('title', title)
    .setOption('fontName', 'Arial')
    .setOption('width', placement.width)
    .setOption('height', placement.height)
    .setOption('is3D', false)
    .setOption('pieHole', 0.32)
    .setOption('pieSliceText', 'percentage')
    .setOption('sliceVisibilityThreshold', 0)
    .setOption('legend', {
      position: 'right',
      textStyle: {
        fontSize: 9
      }
    })
    .build();
}


// ============================================================
// 7. ПОШУК / ВИДАЛЕННЯ ДІАГРАМИ
// ============================================================

function dashboardExpenseStructureFindTargetChart_(sheet) {
  const charts = sheet.getCharts();
  const zone = DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chart.anchorZone;

  // 1. Пошук за позицією порожньої діаграми у блоці «ВИТРАТИ».
  for (let index = 0; index < charts.length; index++) {
    const info = charts[index].getContainerInfo();
    const row = info.getAnchorRow();
    const column = info.getAnchorColumn();

    if (
      row >= zone.minRow &&
      row <= zone.maxRow &&
      column >= zone.minColumn &&
      column <= zone.maxColumn
    ) {
      return {
        chart: charts[index],
        matchedBy: 'anchor'
      };
    }
  }

  // 2. Резервний пошук за назвою.
  for (let index = 0; index < charts.length; index++) {
    const title = dashboardExpenseStructureNormalize_(
      charts[index].getOptions().get('title')
    );

    const matches = DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chart.titleNeedles.some(
      function(needle) {
        return title.indexOf(needle) !== -1;
      }
    );

    if (matches) {
      return {
        chart: charts[index],
        matchedBy: 'title'
      };
    }
  }

  return {
    chart: null,
    matchedBy: ''
  };
}


function dashboardExpenseStructureFindChartById_(sheet, chartId) {
  if (!chartId) {
    return null;
  }

  const charts = sheet.getCharts();

  for (let index = 0; index < charts.length; index++) {
    if (String(charts[index].getChartId()) === String(chartId)) {
      return charts[index];
    }
  }

  return null;
}


function dashboardExpenseStructureChartUsesRange_(chart, expectedRange) {
  return chart.getRanges().some(function(range) {
    return (
      range.getSheet().getSheetId() === expectedRange.getSheet().getSheetId() &&
      range.getA1Notation() === expectedRange.getA1Notation()
    );
  });
}


function dashboardExpenseStructureFindNewChart_(
  sheet,
  beforeIds,
  sourceRange,
  placement
) {
  const charts = sheet.getCharts();

  for (let index = 0; index < charts.length; index++) {
    const chart = charts[index];
    const chartId = String(chart.getChartId());

    if (beforeIds[chartId]) {
      continue;
    }

    if (!dashboardExpenseStructureChartUsesRange_(chart, sourceRange)) {
      continue;
    }

    const info = chart.getContainerInfo();

    if (
      info.getAnchorRow() === placement.row &&
      info.getAnchorColumn() === placement.column
    ) {
      return chart;
    }
  }

  return null;
}


function dashboardExpenseStructureRemoveChartWithRetry_(sheet, chart) {
  const chartId = String(chart.getChartId());
  let lastError = null;

  for (
    let attempt = 1;
    attempt <= DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chartOperationAttempts;
    attempt++
  ) {
    try {
      sheet.removeChart(chart);
      SpreadsheetApp.flush();

      if (!dashboardExpenseStructureFindChartById_(sheet, chartId)) {
        return;
      }

      throw new Error('Стара діаграма залишилася після removeChart().');

    } catch (error) {
      lastError = error;

      if (!dashboardExpenseStructureFindChartById_(sheet, chartId)) {
        return;
      }

      if (
        !dashboardExpenseStructureIsTransientChartError_(error) ||
        attempt === DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chartOperationAttempts
      ) {
        break;
      }

      Utilities.sleep(400 * Math.pow(2, attempt - 1));
    }
  }

  throw new Error(
    'Нову діаграму вставлено, але стару не вдалося видалити. Остання помилка: ' +
    (lastError && lastError.message ? lastError.message : String(lastError))
  );
}


function dashboardExpenseStructureGetPlacement_(oldChart) {
  const defaults = DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chart.defaultPosition;
  let width = DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chart.defaultWidth;
  let height = DASHBOARD_EXPENSE_STRUCTURE_CONFIG.chart.defaultHeight;

  if (!oldChart) {
    return {
      row: defaults.row,
      column: defaults.column,
      offsetX: defaults.offsetX,
      offsetY: defaults.offsetY,
      width: width,
      height: height
    };
  }

  const info = oldChart.getContainerInfo();
  const options = oldChart.getOptions();
  const oldWidth = Number(options.get('width'));
  const oldHeight = Number(options.get('height'));

  if (isFinite(oldWidth) && oldWidth > 0) {
    width = oldWidth;
  }

  if (isFinite(oldHeight) && oldHeight > 0) {
    height = oldHeight;
  }

  return {
    row: info.getAnchorRow(),
    column: info.getAnchorColumn(),
    offsetX: info.getOffsetX(),
    offsetY: info.getOffsetY(),
    width: width,
    height: height
  };
}


function dashboardExpenseStructureIsTransientChartError_(error) {
  const message = String(
    error && error.message ? error.message : error
  ).toLowerCase();

  return (
    message.indexOf('service spreadsheets failed') !== -1 ||
    message.indexOf('internal error') !== -1 ||
    message.indexOf('timed out') !== -1 ||
    message.indexOf('try again') !== -1
  );
}


// ============================================================
// 8. READY / CONTEXT
// ============================================================

function dashboardExpenseStructureCreateOrRepairContext_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sourceSheet = dashboardExpenseStructureRequireSheet_(
    ss,
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.sourceSheetName
  );

  const dashboardSheet = dashboardExpenseStructureRequireSheet_(
    ss,
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.dashboardSheetName
  );

  let cacheSheet = ss.getSheetByName(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.cacheSheetName
  );

  if (!cacheSheet) {
    cacheSheet = ss.insertSheet(
      DASHBOARD_EXPENSE_STRUCTURE_CONFIG.cacheSheetName
    );
  }

  const cacheRange = cacheSheet.getRange(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.cache.rangeA1
  );

  // Самовідновлення: якщо named range раніше вказував, наприклад,
  // на AC1:AD100, інсталяція переносить ЙОГО Ж на AA1:AB100.
  // Новий дубль named range не створюється.
  dashboardExpenseStructureEnsureNamedRange_(
    ss,
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.cache.namedRange,
    cacheRange
  );

  dashboardExpenseStructureAssertSourceRanges_(sourceSheet);

  return {
    ss: ss,
    sourceSheet: sourceSheet,
    dashboardSheet: dashboardSheet,
    cacheSheet: cacheSheet,
    cacheRange: cacheRange
  };
}


function dashboardExpenseStructureAssertReady_(requireNamedRange) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sourceSheet = dashboardExpenseStructureRequireSheet_(
    ss,
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.sourceSheetName
  );

  const dashboardSheet = dashboardExpenseStructureRequireSheet_(
    ss,
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.dashboardSheetName
  );

  const cacheSheet = dashboardExpenseStructureRequireSheet_(
    ss,
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.cacheSheetName
  );

  const expectedRange = cacheSheet.getRange(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.cache.rangeA1
  );

  let cacheRange = ss.getRangeByName(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.cache.namedRange
  );

  /*
   * Виробниче оновлення / аудит вимагають правильний named range.
   * Dry Run сюди більше не заходить: він має окрему read-only
   * перевірку джерела і не повинен падати через стан кешу.
   */
  if (requireNamedRange) {
    if (!cacheRange) {
      throw new Error(
        'Named range "' +
        DASHBOARD_EXPENSE_STRUCTURE_CONFIG.cache.namedRange +
        '" не знайдено. Запустіть dashboardExpenseStructureInstall().' 
      );
    }

    if (!dashboardExpenseStructureSameRange_(cacheRange, expectedRange)) {
      throw new Error(
        'Named range має неправильну адресу: ' +
        dashboardExpenseStructureRangeRef_(cacheRange) +
        '. Очікується: ' +
        dashboardExpenseStructureRangeRef_(expectedRange) +
        '. Запустіть dashboardExpenseStructureInstall() повторно: ' +
        'версія V2 автоматично виправляє адресу.'
      );
    }
  } else {
    // Read-only режим не використовує помилковий named range.
    cacheRange = expectedRange;
  }

  dashboardExpenseStructureAssertSourceRanges_(sourceSheet);

  return {
    ss: ss,
    sourceSheet: sourceSheet,
    dashboardSheet: dashboardSheet,
    cacheSheet: cacheSheet,
    cacheRange: cacheRange
  };
}


// Read-only готовність саме для Dry Run.
// Не вимагає листа кешу, named ranges або діаграми.
function dashboardExpenseStructureAssertSourceReady_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sourceSheet = dashboardExpenseStructureRequireSheet_(
    ss,
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.sourceSheetName
  );

  dashboardExpenseStructureAssertSourceRanges_(sourceSheet);

  return {
    ss: ss,
    sourceSheet: sourceSheet
  };
}


function dashboardExpenseStructureAssertSourceRanges_(sourceSheet) {
  const cfg = DASHBOARD_EXPENSE_STRUCTURE_CONFIG.source;

  if (sourceSheet.getMaxRows() < cfg.lastRow) {
    throw new Error('У P&L недостатньо рядків для діапазону 24:36.');
  }

  if (sourceSheet.getMaxColumns() < cfg.valueColumn) {
    throw new Error('У P&L відсутня колонка N з фактичними витратами.');
  }

  const labels = sourceSheet
    .getRange(cfg.firstRow, cfg.labelColumn, cfg.lastRow - cfg.firstRow + 1, 1)
    .getDisplayValues()
    .flat()
    .map(dashboardExpenseStructureClean_)
    .filter(function(value) { return !!value; });

  if (labels.length === 0) {
    throw new Error('P&L!C24:C36 не містить назв витрат.');
  }
}


// ============================================================
// 9. АУДИТ / РЕМОНТ
// ============================================================

function dashboardExpenseStructureAudit() {
  const context = dashboardExpenseStructureAssertReady_(true);
  const properties = PropertiesService.getDocumentProperties();

  const chartId = properties.getProperty(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.properties.chartId
  );

  const chartVersion = properties.getProperty(
    DASHBOARD_EXPENSE_STRUCTURE_CONFIG.properties.chartVersion
  );

  const chart = dashboardExpenseStructureFindChartById_(
    context.dashboardSheet,
    chartId
  );

  const result = {
    ok: true,
    moduleVersion: DASHBOARD_EXPENSE_STRUCTURE_CONFIG.moduleVersion,
    storedChartId: chartId || '',
    storedChartVersion: chartVersion || '',
    chartFound: !!chart,
    chartRanges: chart
      ? chart.getRanges().map(dashboardExpenseStructureRangeRef_)
      : [],
    expectedRange: dashboardExpenseStructureRangeRef_(context.cacheRange),
    noCellsWritten: true
  };

  Logger.log(
    'dashboardExpenseStructureAudit: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


function dashboardExpenseStructureRepair() {
  const context = dashboardExpenseStructureCreateOrRepairContext_();
  const model = dashboardExpenseStructureBuildModel_(context.sourceSheet);

  dashboardExpenseStructureAssertControl_(model);
  dashboardExpenseStructureWriteCache_(context.cacheRange, model.output);
  SpreadsheetApp.flush();

  return dashboardExpenseStructureEnsureChart_(context, true);
}


// ============================================================
// 10. ДОПОМІЖНІ ФУНКЦІЇ
// ============================================================

function dashboardExpenseStructureEnsureNamedRange_(
  ss,
  rangeName,
  expectedRange
) {
  const matches = ss
    .getNamedRanges()
    .filter(function(namedRange) {
      return namedRange.getName() === rangeName;
    });

  let namedRange = null;

  if (matches.length === 0) {
    ss.setNamedRange(rangeName, expectedRange);
  } else {
    namedRange = matches[0];
    namedRange.setRange(expectedRange);

    // Захист на випадок історичних дублів.
    for (let index = 1; index < matches.length; index++) {
      matches[index].remove();
    }
  }

  SpreadsheetApp.flush();

  const actualRange = ss.getRangeByName(rangeName);

  if (!actualRange) {
    throw new Error(
      'Не вдалося створити або відновити named range "' +
      rangeName +
      '".'
    );
  }

  if (!dashboardExpenseStructureSameRange_(actualRange, expectedRange)) {
    throw new Error(
      'Не вдалося перенести named range "' +
      rangeName +
      '" на ' +
      dashboardExpenseStructureRangeRef_(expectedRange) +
      '. Фактична адреса: ' +
      dashboardExpenseStructureRangeRef_(actualRange) +
      '.'
    );
  }

  return actualRange;
}


function dashboardExpenseStructureSameRange_(firstRange, secondRange) {
  return (
    firstRange.getSheet().getSheetId() ===
      secondRange.getSheet().getSheetId() &&
    firstRange.getA1Notation() ===
      secondRange.getA1Notation()
  );
}


function dashboardExpenseStructureRequireSheet_(ss, sheetName) {
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Лист "' + sheetName + '" не знайдено.');
  }

  return sheet;
}


function dashboardExpenseStructureNumber_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return value;
  }

  const normalized = String(
    value === null || value === undefined ? '' : value
  )
    .replace(/\u00A0/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');

  if (!normalized) {
    return null;
  }

  const result = Number(normalized);
  return isFinite(result) ? result : null;
}


function dashboardExpenseStructureRound2_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}


function dashboardExpenseStructureFormatMoney_(value) {
  const rounded = dashboardExpenseStructureRound2_(value);
  const parts = rounded.toFixed(2).split('.');
  const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return integerPart + ',' + parts[1] + ' грн';
}


function dashboardExpenseStructureClean_(value) {
  return String(
    value === null || value === undefined ? '' : value
  )
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}


function dashboardExpenseStructureNormalize_(value) {
  return dashboardExpenseStructureClean_(value).toLowerCase();
}


function dashboardExpenseStructureRangeRef_(range) {
  return range.getSheet().getName() + '!' + range.getA1Notation();
}
