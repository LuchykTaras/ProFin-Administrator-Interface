/**
 * ============================================================
 * ProFin OS 2026
 *
 * Нативна Google Sheets-діаграма:
 * «Діаграма по секторам доходів за період»
 *
 * Джерело істини:
 *   База операцій
 *
 * Технічний діапазон нативної діаграми:
 *   Дані дашборду!Y1:Z3
 *
 * Сектори:
 *   1. Доходи
 *   2. Вакцини
 *
 * Повністю виключаються:
 *   - Витрати;
 *   - Інкасація;
 *   - невідомі типи;
 *   - скасовані, видалені та чернеткові записи.
 *
 * Вакцини:
 *
 * Старий формат:
 *   Тип Доходи / Витрати = Доходи
 *   Категорія = Вакцини
 *
 * Новий формат:
 *   Тип Доходи / Витрати = Вакцина / Вакцини
 *
 * Важливо:
 *   - наявна діаграма не видаляється;
 *   - нова діаграма не створюється;
 *   - позиція, розмір і оформлення не змінюються;
 *   - під час звичайного Refresh змінюються лише Y1:Z3;
 *   - База операцій залишається read-only.
 * ============================================================
 */

const DASHBOARD_INCOME_PERIOD_NATIVE_CFG =
  Object.freeze({
    moduleVersion:
  'INCOME_PERIOD_NATIVE_PL_CORE_V5_2026',

    sourceSheetName:
      'База операцій',

    dashboardSheetName:
      'Дашборд',

    dataSheetName:
      'Дані дашборду',

    sourceHeaderRow:
      1,

    /**
     * Постійний мінімальний діапазон.
     *
     * Y1:Z1 — заголовки;
     * Y2:Z2 — Доходи;
     * Y3:Z3 — Вакцини.
     */
    chartDataRangeA1:
  'Y1:Z100',

chartDataNamedRange:
  'DASH_INCOME_PERIOD_NATIVE_DATA',

chartTitle:
  'Діаграма по секторам доходів за період',

chartAnchorRow:
  72,

chartAnchorColumn:
  1,

chartAnchorA1:
  'A72',

    properties: {
      chartIds:
        'PROFIN_INCOME_PERIOD_NATIVE_CHART_IDS',

      moduleVersion:
        'PROFIN_INCOME_PERIOD_NATIVE_VERSION'
    },

    headerAliases: {
      date: [
        'Дата транзакції',
        'Дата'
      ],

      amount: [
        'Сума',
        'Сума, грн'
      ],

      type: [
        'Тип Доходи / Витрати',
        'Тип доходи / витрати',
        'Тип операції',
        'Тип'
      ],

      category: [
        'Категорія'
      ],

      status: [
        'Статус запису',
        'Статус'
      ]
    },

    typeAliases: {
      income: [
        'Доходи',
        'Дохід'
      ],

      vaccine: [
        'Вакцина',
        'Вакцини'
      ],

      expense: [
        'Витрати',
        'Витрата'
      ],

      collection: [
        'Інкасація'
      ]
    },

    vaccineCategoryAliases: [
      'Вакцина',
      'Вакцини'
    ],

    excludedStatusFragments: [
      'скас',
      'ануль',
      'видален',
      'чернет',
      'помилк',
      'відхилен'
    ],

    lockTimeoutMs:
      30000
  });


/**
 * ============================================================
 * 1. DRY RUN
 * ============================================================
 *
 * Нічого не записує.
 * Не змінює діаграми.
 */
function dashboardIncomePeriodNativeDryRun() {
  const startedAt =
    Date.now();

  const context =
    dashboardIncomePeriodNativeAssertReady_();

  const dataset =
    dashboardIncomePeriodNativeBuildDataset_(
      context
    );

  const targetCharts =
    dashboardIncomePeriodNativeFindTargetCharts_(
      context.dashboardSheet,
      false
    );

  const result = {
    ok:
      targetCharts.length > 0,

    moduleVersion:
      DASHBOARD_INCOME_PERIOD_NATIVE_CFG
        .moduleVersion,

    mode:
  'DRY_RUN',

/*
 * Джерело вже визначає P&L Core,
 * а не старий sourceSheet.
 */
sourceOfTruth:
  dataset.sourceOfTruth,

plCoreVersion:
  dataset.plCoreVersion,

plCoreBasis:
  dataset.plCoreBasis,

reconciliation:
  dataset.reconciliation,

technicalChartSource:
  dashboardIncomePeriodNativeRangeRef_(
    context.chartDataRange
  ),

    expectedChartTitle:
      DASHBOARD_INCOME_PERIOD_NATIVE_CFG
        .chartTitle,

    expectedChartAnchor:
      DASHBOARD_INCOME_PERIOD_NATIVE_CFG
        .chartAnchorA1,

    targetChartsFound:
      targetCharts.length,

    targetCharts:
      targetCharts.map(
        dashboardIncomePeriodNativeDescribeChart_
      ),

    period:
      dataset.period,

    sectors:
      dataset.chartRows.length,

    totalIncome:
      dataset.totalIncome,

    preview:
      dataset.chartRows,

    regularIncomeRows:
      dataset.regularIncomeRows,

    historicalVaccineRows:
      dataset.historicalVaccineRows,

    newVaccineRows:
      dataset.newVaccineRows,

    expenseRowsExcluded:
      dataset.expenseRowsExcluded,

    collectionRowsExcluded:
      dataset.collectionRowsExcluded,

    otherTypeRowsIgnored:
      dataset.otherTypeRowsIgnored,

    excludedStatusRows:
      dataset.excludedStatusRows,

    invalidDateRows:
      dataset.invalidDateRows,

    invalidAmountRows:
      dataset.invalidAmountRows,

    zeroAmountRows:
      dataset.zeroAmountRows,

    warnings:
      dataset.warnings,

    chartObjectChanged:
      false,

    noCellsWritten:
      true,

    durationMs:
      Date.now() - startedAt
  };

  Logger.log(
    'dashboardIncomePeriodNativeDryRun: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * ============================================================
 * 2. ОДНОРАЗОВА ІНСТАЛЯЦІЯ
 * ============================================================
 *
 * Послідовність захищає діаграму від білого стану:
 *
 * 1. Розрахунок із Бази операцій.
 * 2. Атомарний запис Y1:Z3.
 * 3. Перевірка записаних даних.
 * 4. Лише потім оновлення джерела діаграми.
 * 5. Перевірка фактичного getRanges().
 *
 * Якщо в A64 є кілька дублікатів із тією самою
 * назвою, скрипт оновлює кожен із них.
 */
function dashboardIncomePeriodNativeInstall() {
  const config =
    DASHBOARD_INCOME_PERIOD_NATIVE_CFG;

  const lock =
    LockService.getDocumentLock();

  if (
    !lock.tryLock(
      config.lockTimeoutMs
    )
  ) {
    throw new Error(
      'Не вдалося отримати блокування документа. ' +
      'Інше оновлення вже виконується.'
    );
  }

  const startedAt =
    Date.now();

  let context =
    null;

  let rangeSnapshot =
    null;

  let namedRangeSnapshot =
    null;

  let chartSnapshots =
    [];

  let updatedChartIds =
    [];

  try {
    context =
      dashboardIncomePeriodNativeAssertReady_();

    const dataset =
      dashboardIncomePeriodNativeBuildDataset_(
        context
      );

    const targetCharts =
      dashboardIncomePeriodNativeFindTargetCharts_(
        context.dashboardSheet,
        true
      );

    dashboardIncomePeriodNativeAssertRangeOwnership_(
      context.chartDataRange
    );

    rangeSnapshot =
      dashboardIncomePeriodNativeSnapshotRange_(
        context.chartDataRange
      );

    namedRangeSnapshot =
      context.ss.getRangeByName(
        config.chartDataNamedRange
      );

    chartSnapshots =
      targetCharts.map(
        dashboardIncomePeriodNativeSnapshotChart_
      );

    /**
     * Перед записом Y1:Z3 не очищається.
     *
     * Увесь блок 3×2 записується однією
     * операцією setValues().
     */
    dashboardIncomePeriodNativeWriteData_(
      context.chartDataRange,
      dataset
    );

    SpreadsheetApp.flush();

    dashboardIncomePeriodNativeVerifyData_(
      context.chartDataRange,
      dataset
    );

    context.ss.setNamedRange(
      config.chartDataNamedRange,
      context.chartDataRange
    );

    /**
     * Оновлюємо всі точні дублікати потрібної
     * діаграми в A64.
     *
     * clearRanges() існує тільки в builder.
     * До таблиці зберігається вже готовий об’єкт,
     * у якому Y1:Z3 доданий.
     */
    targetCharts.forEach(
      function(chart) {
        const alreadyCorrect =
          dashboardIncomePeriodNativeChartUsesExactRange_(
            chart,
            context.chartDataRange
          ) &&
          chart.getNumHeaders() === 1 &&
          chart.getTransposeRowsAndColumns() === false;

        if (alreadyCorrect) {
          return;
        }

        const updatedChart =
          chart
            .modify()

            .clearRanges()

            .addRange(
              context.chartDataRange
            )

            .setNumHeaders(
              1
            )

            .setTransposeRowsAndColumns(
              false
            )

            .build();

        context.dashboardSheet.updateChart(
          updatedChart
        );

        updatedChartIds.push(
          String(
            chart.getChartId()
          )
        );
      }
    );

    SpreadsheetApp.flush();

    const verifiedCharts =
      targetCharts.map(
        function(chart) {
          const currentChart =
            dashboardIncomePeriodNativeFindChartById_(
              context.dashboardSheet,
              chart.getChartId()
            );

          dashboardIncomePeriodNativeVerifyInstalledChart_(
            currentChart,
            context.chartDataRange
          );

          return currentChart;
        }
      );

    /**
     * Дані перевіряються ще раз уже після
     * updateChart().
     */
    dashboardIncomePeriodNativeVerifyData_(
      context.chartDataRange,
      dataset
    );

    const chartIds =
      verifiedCharts.map(
        function(chart) {
          return String(
            chart.getChartId()
          );
        }
      );

    const properties =
      PropertiesService
        .getDocumentProperties();

    properties.setProperty(
      config.properties.chartIds,
      JSON.stringify(
        chartIds
      )
    );

    properties.setProperty(
      config.properties.moduleVersion,
      config.moduleVersion
    );

    const result = {
      ok:
        true,

      moduleVersion:
        config.moduleVersion,

      mode:
        'INSTALL_EXISTING_NATIVE_CHART',

      sourceOfTruth:
  dataset.sourceOfTruth,

plCoreVersion:
  dataset.plCoreVersion,

plCoreBasis:
  dataset.plCoreBasis,

      technicalChartSource:
        dashboardIncomePeriodNativeRangeRef_(
          context.chartDataRange
        ),

      chartsMatched:
        targetCharts.length,

      chartsUpdated:
        updatedChartIds.length,

      chartIds:
        chartIds,

      charts:
        verifiedCharts.map(
          dashboardIncomePeriodNativeDescribeChart_
        ),

      chartCreated:
        false,

      chartRemoved:
        false,

      chartPositionChanged:
        false,

      chartFormattingChanged:
        false,

      period:
        dataset.period,

      sectors:
        dataset.chartRows.length,

      chartRows:
        dataset.chartRows,

      totalIncome:
        dataset.totalIncome,

      regularIncomeRows:
        dataset.regularIncomeRows,

      historicalVaccineRows:
        dataset.historicalVaccineRows,

      newVaccineRows:
        dataset.newVaccineRows,

      expenseRowsExcluded:
        dataset.expenseRowsExcluded,

      collectionRowsExcluded:
        dataset.collectionRowsExcluded,

      otherTypeRowsIgnored:
        dataset.otherTypeRowsIgnored,

      excludedStatusRows:
        dataset.excludedStatusRows,

      invalidDateRows:
        dataset.invalidDateRows,

      invalidAmountRows:
        dataset.invalidAmountRows,

      zeroAmountRows:
        dataset.zeroAmountRows,

      warnings:
        dataset.warnings,

      technicalRangeWritten:
        true,

      noSourceCellsWritten:
        true,

      durationMs:
        Date.now() - startedAt
    };

    Logger.log(
      'dashboardIncomePeriodNativeInstall: ' +
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;

  } catch (error) {
    /**
     * Відкат усіх діаграм, які могли
     * бути оновлені до виникнення помилки.
     */
    if (
      context &&
      chartSnapshots.length
    ) {
      chartSnapshots.forEach(
        function(snapshot) {
          try {
            dashboardIncomePeriodNativeRestoreChart_(
              context.dashboardSheet,
              snapshot
            );

          } catch (rollbackChartError) {
            console.error(
              'Не вдалося відновити діаграму ' +
              snapshot.chartId +
              ': ' +
              rollbackChartError.message
            );
          }
        }
      );
    }

    if (
      context &&
      rangeSnapshot
    ) {
      try {
        dashboardIncomePeriodNativeRestoreRange_(
          context.chartDataRange,
          rangeSnapshot
        );

      } catch (rollbackRangeError) {
        console.error(
          'Не вдалося відновити технічний діапазон: ' +
          rollbackRangeError.message
        );
      }
    }

    if (context) {
      try {
        dashboardIncomePeriodNativeRestoreNamedRange_(
          context.ss,
          config.chartDataNamedRange,
          namedRangeSnapshot
        );

      } catch (rollbackNamedRangeError) {
        console.error(
          'Не вдалося відновити named range: ' +
          rollbackNamedRangeError.message
        );
      }
    }

    SpreadsheetApp.flush();

    throw error;

  } finally {
    lock.releaseLock();
  }
}


/**
 * ============================================================
 * 3. ЗВИЧАЙНЕ ОНОВЛЕННЯ
 * ============================================================
 *
 * Після Install:
 *
 * - не викликає modify();
 * - не викликає clearRanges();
 * - не викликає addRange();
 * - не викликає updateChart();
 * - не створює і не видаляє діаграму;
 * - лише атомарно оновлює Y1:Z3.
 */
function dashboardIncomePeriodNativeRefresh() {
  const config =
    DASHBOARD_INCOME_PERIOD_NATIVE_CFG;

  const lock =
    LockService.getDocumentLock();

  if (
    !lock.tryLock(
      config.lockTimeoutMs
    )
  ) {
    throw new Error(
      'Не вдалося отримати блокування документа. ' +
      'Інше оновлення вже виконується.'
    );
  }

  const startedAt =
    Date.now();

  let context =
    null;

  let rangeSnapshot =
    null;

  try {
    context =
      dashboardIncomePeriodNativeAssertReady_();

    const managedCharts =
      dashboardIncomePeriodNativeFindManagedCharts_(
        context
      );

    if (!managedCharts.length) {
      throw new Error(
        'Керовані діаграми не знайдено. ' +
        'Спочатку один раз запустіть ' +
        'dashboardIncomePeriodNativeInstall().'
      );
    }

    managedCharts.forEach(
      function(chart) {
        dashboardIncomePeriodNativeVerifyInstalledChart_(
          chart,
          context.chartDataRange
        );
      }
    );

    const dataset =
      dashboardIncomePeriodNativeBuildDataset_(
        context
      );

    rangeSnapshot =
      dashboardIncomePeriodNativeSnapshotRange_(
        context.chartDataRange
      );

    dashboardIncomePeriodNativeWriteData_(
      context.chartDataRange,
      dataset
    );

    SpreadsheetApp.flush();

    dashboardIncomePeriodNativeVerifyData_(
      context.chartDataRange,
      dataset
    );

    const chartsAfter =
      managedCharts.map(
        function(chart) {
          const currentChart =
            dashboardIncomePeriodNativeFindChartById_(
              context.dashboardSheet,
              chart.getChartId()
            );

          dashboardIncomePeriodNativeVerifyInstalledChart_(
            currentChart,
            context.chartDataRange
          );

          return currentChart;
        }
      );

    const result = {
      ok:
        true,

      moduleVersion:
        config.moduleVersion,

      mode:
        'REFRESH_DATA_ONLY',

      sourceOfTruth:
  dataset.sourceOfTruth,

plCoreVersion:
  dataset.plCoreVersion,

plCoreBasis:
  dataset.plCoreBasis,

reconciliation:
  dataset.reconciliation,

      technicalChartSource:
        dashboardIncomePeriodNativeRangeRef_(
          context.chartDataRange
        ),

      chartsManaged:
        chartsAfter.length,

      chartIds:
        chartsAfter.map(
          function(chart) {
            return chart.getChartId();
          }
        ),

      chartObjectChanged:
        false,

      chartCreated:
        false,

      chartRemoved:
        false,

      chartPositionChanged:
        false,

      chartFormattingChanged:
        false,

      period:
        dataset.period,

      sectors:
        dataset.chartRows.length,

      chartRows:
        dataset.chartRows,

      totalIncome:
        dataset.totalIncome,

      regularIncomeRows:
        dataset.regularIncomeRows,

      historicalVaccineRows:
        dataset.historicalVaccineRows,

      newVaccineRows:
        dataset.newVaccineRows,

      expenseRowsExcluded:
        dataset.expenseRowsExcluded,

      collectionRowsExcluded:
        dataset.collectionRowsExcluded,

      otherTypeRowsIgnored:
        dataset.otherTypeRowsIgnored,

      excludedStatusRows:
        dataset.excludedStatusRows,

      invalidDateRows:
        dataset.invalidDateRows,

      invalidAmountRows:
        dataset.invalidAmountRows,

      zeroAmountRows:
        dataset.zeroAmountRows,

      warnings:
        dataset.warnings,

      technicalRangeWritten:
        true,

      noSourceCellsWritten:
        true,

      durationMs:
        Date.now() - startedAt
    };

    Logger.log(
      'dashboardIncomePeriodNativeRefresh: ' +
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;

  } catch (error) {
    if (
      context &&
      rangeSnapshot
    ) {
      dashboardIncomePeriodNativeRestoreRange_(
        context.chartDataRange,
        rangeSnapshot
      );

      SpreadsheetApp.flush();
    }

    throw error;

  } finally {
    lock.releaseLock();
  }
}


/**
 * ============================================================
 * 4. READ-ONLY АУДИТ
 * ============================================================
 */
function dashboardIncomePeriodNativeAudit() {
  const startedAt =
    Date.now();

  const context =
    dashboardIncomePeriodNativeAssertReady_();

  const dataset =
    dashboardIncomePeriodNativeBuildDataset_(
      context
    );

  const managedCharts =
    dashboardIncomePeriodNativeFindManagedCharts_(
      context
    );

  let technicalDataValid =
    false;

  let technicalDataError =
    '';

  try {
    dashboardIncomePeriodNativeVerifyData_(
      context.chartDataRange,
      dataset
    );

    technicalDataValid =
      true;

  } catch (error) {
    technicalDataError =
      error.message;
  }

  const chartResults =
    managedCharts.map(
      function(chart) {
        const sourceCorrect =
          dashboardIncomePeriodNativeChartUsesExactRange_(
            chart,
            context.chartDataRange
          );

        const anchorCorrect =
          dashboardIncomePeriodNativeChartAnchor_(
            chart
          ) ===
          DASHBOARD_INCOME_PERIOD_NATIVE_CFG
            .chartAnchorA1;

        const typeCorrect =
          dashboardIncomePeriodNativeIsPieChart_(
            chart
          );

        return {
          chartId:
            chart.getChartId(),

          title:
            dashboardIncomePeriodNativeChartTitle_(
              chart
            ),

          anchor:
            dashboardIncomePeriodNativeChartAnchor_(
              chart
            ),

          type:
            dashboardIncomePeriodNativeChartType_(
              chart
            ),

          ranges:
            chart
              .getRanges()
              .map(
                dashboardIncomePeriodNativeRangeRef_
              ),

          sourceCorrect:
            sourceCorrect,

          anchorCorrect:
            anchorCorrect,

          typeCorrect:
            typeCorrect,

          ok:
            sourceCorrect &&
            anchorCorrect &&
            typeCorrect
        };
      }
    );

  const result = {
    ok:
      managedCharts.length > 0 &&
      chartResults.every(
        function(item) {
          return item.ok;
        }
      ) &&
      technicalDataValid,

    moduleVersion:
      DASHBOARD_INCOME_PERIOD_NATIVE_CFG
        .moduleVersion,

    sourceOfTruth:
  dataset.sourceOfTruth,

plCoreVersion:
  dataset.plCoreVersion,

plCoreBasis:
  dataset.plCoreBasis,

reconciliation:
  dataset.reconciliation,

    expectedTechnicalSource:
      dashboardIncomePeriodNativeRangeRef_(
        context.chartDataRange
      ),

    expectedAnchor:
      DASHBOARD_INCOME_PERIOD_NATIVE_CFG
        .chartAnchorA1,

    chartsManaged:
      managedCharts.length,

    charts:
      chartResults,

    technicalDataValid:
      technicalDataValid,

    technicalDataError:
      technicalDataError,

    calculatedChartRows:
      dataset.chartRows,

    period:
      dataset.period,

    expenseRowsExcluded:
      dataset.expenseRowsExcluded,

    collectionRowsExcluded:
      dataset.collectionRowsExcluded,

    chartObjectChanged:
      false,

    noCellsWritten:
      true,

    durationMs:
      Date.now() - startedAt
  };

  Logger.log(
    'dashboardIncomePeriodNativeAudit: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * ============================================================
 * 5. СПИСОК ЗНАЙДЕНИХ ДІАГРАМ
 * ============================================================
 *
 * Read-only діагностика.
 */
function dashboardIncomePeriodNativeListCharts() {
  const context =
    dashboardIncomePeriodNativeAssertReady_();

  const charts =
    context.dashboardSheet
      .getCharts()
      .map(
        dashboardIncomePeriodNativeDescribeChart_
      );

  const result = {
    ok:
      true,

    chartsFound:
      charts.length,

    charts:
      charts,

    chartObjectChanged:
      false,

    noCellsWritten:
      true
  };

  Logger.log(
    'dashboardIncomePeriodNativeListCharts: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * ============================================================
 * 6. ПЕРЕВІРКА СТРУКТУРИ
 * ============================================================
 */
function dashboardIncomePeriodNativeAssertReady_() {
  const config =
    DASHBOARD_INCOME_PERIOD_NATIVE_CFG;

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sourceSheet =
    ss.getSheetByName(
      config.sourceSheetName
    );

  if (!sourceSheet) {
    throw new Error(
      'Не знайдено лист «' +
      config.sourceSheetName +
      '».'
    );
  }

  const dashboardSheet =
    ss.getSheetByName(
      config.dashboardSheetName
    );

  if (!dashboardSheet) {
    throw new Error(
      'Не знайдено лист «' +
      config.dashboardSheetName +
      '».'
    );
  }

  const dataSheet =
    ss.getSheetByName(
      config.dataSheetName
    );

  if (!dataSheet) {
    throw new Error(
      'Не знайдено лист «' +
      config.dataSheetName +
      '».'
    );
  }

  const lastRow =
    sourceSheet.getLastRow();

  const lastColumn =
    sourceSheet.getLastColumn();

  if (
    lastRow <= config.sourceHeaderRow ||
    lastColumn < 1
  ) {
    throw new Error(
      'Лист «База операцій» не містить робочих даних.'
    );
  }

  const headers =
    sourceSheet
      .getRange(
        config.sourceHeaderRow,
        1,
        1,
        lastColumn
      )
      .getDisplayValues()[0];

  const columns = {
    date:
      dashboardIncomePeriodNativeResolveColumn_(
        headers,
        config.headerAliases.date,
        true
      ),

    amount:
      dashboardIncomePeriodNativeResolveColumn_(
        headers,
        config.headerAliases.amount,
        true
      ),

    type:
      dashboardIncomePeriodNativeResolveColumn_(
        headers,
        config.headerAliases.type,
        true
      ),

    category:
      dashboardIncomePeriodNativeResolveColumn_(
        headers,
        config.headerAliases.category,
        true
      ),

    status:
      dashboardIncomePeriodNativeResolveColumn_(
        headers,
        config.headerAliases.status,
        false
      )
  };

  const chartDataRange =
    dataSheet.getRange(
      config.chartDataRangeA1
    );

  if (
  chartDataRange.getNumRows() !== 100 ||
  chartDataRange.getNumColumns() !== 2
) {
  throw new Error(
    'Технічний діапазон лівої діаграми ' +
    'повинен бути Y1:Z100. ' +
    'Поточне значення: ' +
    dashboardIncomePeriodNativeRangeRef_(
      chartDataRange
    ) +
    '.'
  );
}

  return {
    ss:
      ss,

    sourceSheet:
      sourceSheet,

    dashboardSheet:
      dashboardSheet,

    dataSheet:
      dataSheet,

    chartDataRange:
      chartDataRange,

    columns:
      columns,

    lastRow:
      lastRow,

    lastColumn:
      lastColumn
  };
}


function dashboardIncomePeriodNativeResolveColumn_(
  headers,
  aliases,
  required
) {
  const normalizedHeaders =
    headers.map(
      dashboardIncomePeriodNativeNormalize_
    );

  for (
    let aliasIndex = 0;
    aliasIndex < aliases.length;
    aliasIndex++
  ) {
    const normalizedAlias =
      dashboardIncomePeriodNativeNormalize_(
        aliases[aliasIndex]
      );

    const foundIndex =
      normalizedHeaders.indexOf(
        normalizedAlias
      );

    if (foundIndex >= 0) {
      return foundIndex;
    }
  }

  if (required) {
    throw new Error(
      'Не знайдено обов’язкову колонку. ' +
      'Очікувані назви: ' +
      aliases.join(', ')
    );
  }

  return -1;
}


/**
 * ============================================================
 * 7. РОЗРАХУНОК ДВОХ СЕКТОРІВ
 * ============================================================
 */
function dashboardIncomePeriodNativeBuildDataset_(
  context
) {

  /*
   * ==========================================================
   * ЄДИНЕ P&L CORE
   * ==========================================================
   *
   * Ліва діаграма доходів більше
   * НЕ формує фінансові суми самостійно.
   *
   * MONTH / повні календарні місяці:
   *   -> готовий Fact P&L.
   *
   * DAY / неповний RANGE:
   *   -> transaction-date calculation
   *      того самого P&L Core.
   */

  if (
    typeof proFinPlCoreCalculate_ !==
      'function'
  ) {
    throw new Error(
      'Ліва діаграма доходів: ' +
      'не знайдено proFinPlCoreCalculate_().'
    );
  }


  if (
    typeof proFinPlCoreResolveDashboardPeriod_ !==
      'function'
  ) {
    throw new Error(
      'Ліва діаграма доходів: ' +
      'не знайдено proFinPlCoreResolveDashboardPeriod_().'
    );
  }


  /*
   * Період беремо з тих самих
   * Dashboard-контролів:
   *
   * F5    -> DAY
   * F6    -> MONTH
   * E5:E6 -> RANGE
   */
  const period =
    proFinPlCoreResolveDashboardPeriod_();


  const model =
    proFinPlCoreCalculate_(
      period
    );


  /*
   * ==========================================================
   * ПОРЯДОК КАТЕГОРІЙ
   * ==========================================================
   *
   * Зберігаємо стабільний порядок
   * секторів на Дашборді.
   */
  const preferredOrder = [
    'Консультація',
    'Вакцини',
    'Довідки',
    'НСЗУ',
    'Пакетні послуги',
    'Косметичні засоби',
    'Швидкі тести',
    'Додаткові доходи',
    'Забір аналізів',
    'Послуги медсестри'
  ];


  const orderMap =
    Object.create(null);


  preferredOrder.forEach(
    function(
      category,
      index
    ) {
      orderMap[
        dashboardIncomePeriodNativeNormalize_(
          category
        )
      ] =
        index;
    }
  );


  /*
   * ==========================================================
   * СЕКТОРИ ДІАГРАМИ
   * ==========================================================
   *
   * Для MONTH сума item.amount
   * вже є готовим Fact P&L.
   */
  const chartRows =
    model.income.categories

      .map(
        function(item) {
          return {
            category:
              item.category,

            amount:
              dashboardIncomePeriodNativeRound2_(
                item.amount
              ),

            transactions:
              item.transactions,

            share:
              0,

            shareText:
              ''
          };
        }
      )

      .filter(
        function(item) {
          return (
            Number.isFinite(
              item.amount
            ) &&
            item.amount > 0
          );
        }
      )

      .sort(
        function(
          first,
          second
        ) {
          const firstKey =
            dashboardIncomePeriodNativeNormalize_(
              first.category
            );

          const secondKey =
            dashboardIncomePeriodNativeNormalize_(
              second.category
            );


          const firstOrder =
            orderMap[
              firstKey
            ];

          const secondOrder =
            orderMap[
              secondKey
            ];


          const firstKnown =
            firstOrder !==
            undefined;

          const secondKnown =
            secondOrder !==
            undefined;


          if (
            firstKnown &&
            secondKnown
          ) {
            return (
              firstOrder -
              secondOrder
            );
          }


          if (
            firstKnown
          ) {
            return -1;
          }


          if (
            secondKnown
          ) {
            return 1;
          }


          if (
            second.amount !==
            first.amount
          ) {
            return (
              second.amount -
              first.amount
            );
          }


          return first.category
            .localeCompare(
              second.category,
              'uk'
            );
        }
      );


  /*
   * Total беремо безпосередньо
   * з P&L Core.
   */
  const totalIncome =
    dashboardIncomePeriodNativeRound2_(
      model.income.total
    );


  chartRows.forEach(
    function(item) {
      const share =
        totalIncome > 0
          ? item.amount /
            totalIncome
          : 0;


      item.share =
        share;


      item.shareText =
        dashboardIncomePeriodNativeFormatPercent_(
          share
        );
    }
  );


  /*
   * ==========================================================
   * COMPATIBILITY FIELDS
   * ==========================================================
   *
   * Старі DryRun / Audit / Refresh
   * очікують ці поля.
   */

  const vaccineKey =
    dashboardIncomePeriodNativeNormalize_(
      'Вакцини'
    );


  const vaccineItem =
    chartRows.find(
      function(item) {
        return (
          dashboardIncomePeriodNativeNormalize_(
            item.category
          ) ===
          vaccineKey
        );
      }
    ) ||
    null;


  const vaccineAmount =
    vaccineItem
      ? vaccineItem.amount
      : 0;


  const vaccineTransactions =
    vaccineItem
      ? vaccineItem.transactions
      : 0;


  const regularIncomeAmount =
    dashboardIncomePeriodNativeRound2_(
      totalIncome -
      vaccineAmount
    );


  const regularIncomeRows =
    Math.max(
      0,

      model.income.transactions -
      vaccineTransactions
    );


  /*
   * Старий поділ historical/new vaccine
   * більше не є частиною фінансової логіки.
   *
   * Поля залишаємо лише для сумісності.
   */
  const historicalVaccineRows =
    0;


  const newVaccineRows =
    vaccineTransactions;


  const sourceOfTruth =
    model.basis &&
    model.basis.mode ===
      'PL_FACT_MONTHLY'
      ? 'P&L CORE → P&L FACT'
      : 'P&L CORE → TRANSACTION DATE';


  const resultPeriod =
    typeof proFinPlCorePeriodForLog_ ===
      'function'
      ? proFinPlCorePeriodForLog_(
          model.period
        )
      : {
          mode:
            model.period.mode,

          from:
            model.period.from,

          to:
            model.period.to,

          source:
            model.period.source
        };


  return {
    period:
      resultPeriod,

    chartRows:
      chartRows,

    totalIncome:
      totalIncome,

    regularIncomeAmount:
      regularIncomeAmount,

    vaccineAmount:
      vaccineAmount,

    regularIncomeRows:
      regularIncomeRows,

    historicalVaccineRows:
      historicalVaccineRows,

    newVaccineRows:
      newVaccineRows,

    expenseRowsExcluded:
      0,

    collectionRowsExcluded:
      0,

    otherTypeRowsIgnored:
      model.stats
        ? model.stats.skippedTypeRows
        : 0,

    excludedStatusRows:
      model.stats
        ? model.stats.skippedStatusRows
        : 0,

    invalidDateRows:
      model.stats
        ? model.stats.invalidDateRows
        : 0,

    invalidAmountRows:
      model.stats
        ? model.stats.invalidIncomeAmountRows
        : 0,

    zeroAmountRows:
      model.stats
        ? model.stats.nonPositiveIncomeRows
        : 0,

    warnings:
      [],

    sourceOfTruth:
      sourceOfTruth,

    plCoreVersion:
      model.version,

    plCoreBasis:
      model.basis,

    reconciliation:
      model.reconciliation
  };
}


/**
 * ============================================================
 * 8. ТЕХНІЧНИЙ ДІАПАЗОН Y1:Z3
 * ============================================================
 */
function dashboardIncomePeriodNativeWriteData_(
  range,
  dataset
) {
  if (
    !dataset ||
    !Array.isArray(
      dataset.chartRows
    )
  ) {
    throw new Error(
      'Некоректний dataset лівої діаграми.'
    );
  }

  const rows =
    range.getNumRows();

  const values =
    Array.from(
      {
        length: rows
      },
      function() {
        return [
          '',
          ''
        ];
      }
    );

  values[0] = [
    'Сектор доходу',
    'Сума, грн'
  ];

  dataset.chartRows.forEach(
    function(
      item,
      index
    ) {
      if (
        index + 1 >= rows
      ) {
        throw new Error(
          'У Y1:Z100 недостатньо місця ' +
          'для секторів доходу.'
        );
      }

      values[
        index + 1
      ] = [
        item.category,
        item.amount
      ];
    }
  );

  if (
    !dataset.chartRows.length
  ) {
    values[1] = [
      'Немає доходів за період',
      1
    ];
  }

  range.setValues(
    values
  );

  const formats =
    Array.from(
      {
        length: rows
      },
      function(_, index) {
        return index === 0
          ? [
              '@',
              '@'
            ]
          : [
              '@',
              '#,##0.00'
            ];
      }
    );

  range.setNumberFormats(
    formats
  );
}


function dashboardIncomePeriodNativeVerifyData_(
  range,
  dataset
) {
  const values =
    range.getValues();

  if (
    dashboardIncomePeriodNativeNormalize_(
      values[0][0]
    ) !==
      dashboardIncomePeriodNativeNormalize_(
        'Сектор доходу'
      ) ||

    dashboardIncomePeriodNativeNormalize_(
      values[0][1]
    ) !==
      dashboardIncomePeriodNativeNormalize_(
        'Сума, грн'
      )
  ) {
    throw new Error(
      'Не вдалося підтвердити заголовки у ' +
      dashboardIncomePeriodNativeRangeRef_(
        range
      ) +
      '.'
    );
  }

  const expectedRows =
    dataset.chartRows;

  if (!expectedRows.length) {
    return true;
  }

  for (
    let index = 0;
    index < expectedRows.length;
    index++
  ) {
    const expected =
      expectedRows[index];

    const actualCategory =
      values[
        index + 1
      ][0];

    const actualAmount =
      Number(
        values[
          index + 1
        ][1]
      );

    if (
      dashboardIncomePeriodNativeNormalize_(
        actualCategory
      ) !==
      dashboardIncomePeriodNativeNormalize_(
        expected.category
      )
    ) {
      throw new Error(
        'Категорія "' +
        expected.category +
        '" у Y1:Z100 не відповідає розрахунку.'
      );
    }

    if (
      !Number.isFinite(
        actualAmount
      ) ||
      Math.abs(
        actualAmount -
        expected.amount
      ) > 0.005
    ) {
      throw new Error(
        'Сума категорії "' +
        expected.category +
        '" у Y1:Z100 не відповідає розрахунку.'
      );
    }
  }

  return true;
}


/**
 * ============================================================
 * 9. ПОШУК ПОТРІБНОЇ ДІАГРАМИ
 * ============================================================
 *
 * На відміну від попередньої версії,
 * кілька діаграм у A64 не викликають помилку.
 *
 * Спочатку шукаються:
 * - A64;
 * - PIE;
 * - точна назва.
 *
 * Якщо точних збігів декілька,
 * повертаються всі — вони є дублікатами
 * тієї самої діаграми.
 */
function dashboardIncomePeriodNativeFindTargetCharts_(
  sheet,
  required
) {
  const config =
    DASHBOARD_INCOME_PERIOD_NATIVE_CFG;

  const charts =
    sheet.getCharts();

  const exactMatches =
    charts.filter(
      function(chart) {
        return (
          dashboardIncomePeriodNativeChartAnchor_(
            chart
          ) ===
            config.chartAnchorA1 &&

          dashboardIncomePeriodNativeIsPieChart_(
            chart
          ) &&

          dashboardIncomePeriodNativeNormalize_(
            dashboardIncomePeriodNativeChartTitle_(
              chart
            )
          ) ===
            dashboardIncomePeriodNativeNormalize_(
              config.chartTitle
            )
        );
      }
    );

  if (exactMatches.length) {
    return exactMatches;
  }

  /**
   * Резервний пошук старої діаграми:
   *
   * - якір A64;
   * - круговий тип;
   * - діапазони з База операцій;
   * - заголовки Тип Доходи / Витрати і Сума.
   */
  const fallbackMatches =
    charts.filter(
      function(chart) {
        if (
          dashboardIncomePeriodNativeChartAnchor_(
            chart
          ) !==
            config.chartAnchorA1 ||

          !dashboardIncomePeriodNativeIsPieChart_(
            chart
          )
        ) {
          return false;
        }

        const description =
          dashboardIncomePeriodNativeDescribeChart_(
            chart
          );

        return (
          description.hasTypeHeader &&
          description.hasAmountHeader &&
          description.rangesFromSourceSheet
        );
      }
    );

  if (fallbackMatches.length) {
    return fallbackMatches;
  }

  if (required) {
    throw new Error(
      'Не знайдено нативну кругову діаграму ' +
      '«' +
      config.chartTitle +
      '» у позиції ' +
      config.chartAnchorA1 +
      '. Жодних змін не виконано.'
    );
  }

  return [];
}


function dashboardIncomePeriodNativeFindManagedCharts_(
  context
) {
  const config =
    DASHBOARD_INCOME_PERIOD_NATIVE_CFG;

  const charts =
    context.dashboardSheet.getCharts();

  const storedValue =
    PropertiesService
      .getDocumentProperties()
      .getProperty(
        config.properties.chartIds
      );

  let storedIds =
    [];

  if (storedValue) {
    try {
      storedIds =
        JSON.parse(
          storedValue
        );

    } catch (error) {
      storedIds =
        [];
    }
  }

  if (
    Array.isArray(
      storedIds
    ) &&
    storedIds.length
  ) {
    const byIds =
      charts.filter(
        function(chart) {
          return (
            storedIds.indexOf(
              String(
                chart.getChartId()
              )
            ) >= 0
          );
        }
      );

    if (byIds.length) {
      return byIds;
    }
  }

  return dashboardIncomePeriodNativeFindTargetCharts_(
    context.dashboardSheet,
    false
  )
    .filter(
      function(chart) {
        return dashboardIncomePeriodNativeChartUsesExactRange_(
          chart,
          context.chartDataRange
        );
      }
    );
}


function dashboardIncomePeriodNativeDescribeChart_(
  chart
) {
  const config =
    DASHBOARD_INCOME_PERIOD_NATIVE_CFG;

  const ranges =
    chart.getRanges();

  const headers =
    ranges.map(
      function(range) {
        try {
          return dashboardIncomePeriodNativeClean_(
            range
              .getCell(
                1,
                1
              )
              .getDisplayValue()
          );

        } catch (error) {
          return '';
        }
      }
    );

  const normalizedHeaders =
    headers.map(
      dashboardIncomePeriodNativeNormalize_
    );

  const typeHeaders =
    config.headerAliases.type.map(
      dashboardIncomePeriodNativeNormalize_
    );

  const amountHeaders =
    config.headerAliases.amount.map(
      dashboardIncomePeriodNativeNormalize_
    );

  return {
    chartId:
      chart.getChartId(),

    title:
      dashboardIncomePeriodNativeChartTitle_(
        chart
      ),

    type:
      dashboardIncomePeriodNativeChartType_(
        chart
      ),

    anchor:
      dashboardIncomePeriodNativeChartAnchor_(
        chart
      ),

    ranges:
      ranges.map(
        dashboardIncomePeriodNativeRangeRef_
      ),

    headers:
      headers,

    hasTypeHeader:
      typeHeaders.some(
        function(alias) {
          return (
            normalizedHeaders.indexOf(
              alias
            ) >= 0
          );
        }
      ),

    hasAmountHeader:
      amountHeaders.some(
        function(alias) {
          return (
            normalizedHeaders.indexOf(
              alias
            ) >= 0
          );
        }
      ),

    rangesFromSourceSheet:
      ranges.length > 0 &&
      ranges.every(
        function(range) {
          return (
            range
              .getSheet()
              .getName() ===
            config.sourceSheetName
          );
        }
      )
  };
}


function dashboardIncomePeriodNativeFindChartById_(
  sheet,
  chartId
) {
  return (
    sheet
      .getCharts()
      .find(
        function(chart) {
          return (
            String(
              chart.getChartId()
            ) ===
            String(
              chartId
            )
          );
        }
      ) ||
    null
  );
}


function dashboardIncomePeriodNativeVerifyInstalledChart_(
  chart,
  expectedRange
) {
  if (!chart) {
    throw new Error(
      'Після операції діаграму не знайдено.'
    );
  }

  if (
    !dashboardIncomePeriodNativeIsPieChart_(
      chart
    )
  ) {
    throw new Error(
      'Цільова діаграма більше не є круговою.'
    );
  }

 if (
  dashboardIncomePeriodNativeChartAnchor_(
    chart
  ) !==
    DASHBOARD_INCOME_PERIOD_NATIVE_CFG
      .chartAnchorA1
) {
  throw new Error(
    'Діаграма змінила позицію. Очікується ' +
    DASHBOARD_INCOME_PERIOD_NATIVE_CFG
      .chartAnchorA1 +
    '.'
  );
}

if (
  !dashboardIncomePeriodNativeChartUsesExactRange_(
    chart,
    expectedRange
  )
) {
    throw new Error(
      'Діаграма використовує неправильне джерело. ' +
      'Очікується: ' +
      dashboardIncomePeriodNativeRangeRef_(
        expectedRange
      ) +
      '. Фактичні діапазони: ' +
      chart
        .getRanges()
        .map(
          dashboardIncomePeriodNativeRangeRef_
        )
        .join(', ')
    );
  }

  if (
    chart.getNumHeaders() !== 1
  ) {
    throw new Error(
      'Діаграма неправильно визначила заголовки.'
    );
  }

  if (
    chart.getTransposeRowsAndColumns() !== false
  ) {
    throw new Error(
      'У діаграмі помилково ввімкнено транспонування.'
    );
  }

  return true;
}


function dashboardIncomePeriodNativeChartUsesExactRange_(
  chart,
  expectedRange
) {
  const ranges =
    chart.getRanges();

  return (
    ranges.length === 1 &&
    dashboardIncomePeriodNativeSameRange_(
      ranges[0],
      expectedRange
    )
  );
}


function dashboardIncomePeriodNativeSameRange_(
  firstRange,
  secondRange
) {
  return (
    firstRange
      .getSheet()
      .getSheetId() ===
      secondRange
        .getSheet()
        .getSheetId() &&

    firstRange.getA1Notation() ===
      secondRange.getA1Notation()
  );
}


function dashboardIncomePeriodNativeIsPieChart_(
  chart
) {
  return (
    dashboardIncomePeriodNativeChartType_(
      chart
    ) ===
    String(
      Charts.ChartType.PIE
    )
  );
}


function dashboardIncomePeriodNativeChartType_(
  chart
) {
  try {
    return String(
      chart
        .modify()
        .getChartType()
    );

  } catch (error) {
    return '';
  }
}


function dashboardIncomePeriodNativeChartTitle_(
  chart
) {
  try {
    const value =
      chart
        .getOptions()
        .get(
          'title'
        );

    return value === null ||
      value === undefined
        ? ''
        : String(
            value
          );

  } catch (error) {
    return '';
  }
}


function dashboardIncomePeriodNativeChartAnchor_(
  chart
) {
  if (!chart) {
    return '';
  }

  try {
    const info =
      chart.getContainerInfo();

    if (!info) {
      return '';
    }

    const column =
      info.getAnchorColumn();

    const row =
      info.getAnchorRow();

    return (
      dashboardIncomePeriodNativeColumnToLetter_(
        Number(column)
      ) +
      String(
        Number(row)
      )
    );

  } catch (error) {
    console.warn(
      'dashboardIncomePeriodNativeChartAnchor_: ' +
      'не вдалося прочитати позицію chart object: ' +
      (
        error &&
        error.message
          ? error.message
          : String(error)
      )
    );

    return '';
  }
}


/**
 * ============================================================
 * 10. SNAPSHOT І ВІДКАТ
 * ============================================================
 */
function dashboardIncomePeriodNativeSnapshotRange_(
  range
) {
  return {
    values:
      range.getValues(),

    numberFormats:
      range.getNumberFormats()
  };
}


function dashboardIncomePeriodNativeRestoreRange_(
  range,
  snapshot
) {
  range.setValues(
    snapshot.values
  );

  range.setNumberFormats(
    snapshot.numberFormats
  );
}


function dashboardIncomePeriodNativeSnapshotChart_(
  chart
) {
  return {
    chartId:
      chart.getChartId(),

    ranges:
      chart.getRanges(),

    numHeaders:
      chart.getNumHeaders(),

    transpose:
      chart.getTransposeRowsAndColumns()
  };
}


function dashboardIncomePeriodNativeRestoreChart_(
  sheet,
  snapshot
) {
  const currentChart =
    dashboardIncomePeriodNativeFindChartById_(
      sheet,
      snapshot.chartId
    );

  if (!currentChart) {
    throw new Error(
      'Не знайдено діаграму для відкату: ' +
      snapshot.chartId
    );
  }

  let builder =
    currentChart
      .modify()
      .clearRanges();

  snapshot.ranges.forEach(
    function(range) {
      builder =
        builder.addRange(
          range
        );
    }
  );

  builder =
    builder
      .setNumHeaders(
        snapshot.numHeaders
      )

      .setTransposeRowsAndColumns(
        snapshot.transpose
      );

  sheet.updateChart(
    builder.build()
  );
}


function dashboardIncomePeriodNativeRestoreNamedRange_(
  ss,
  name,
  previousRange
) {
  if (previousRange) {
    ss.setNamedRange(
      name,
      previousRange
    );

    return;
  }

  ss.getNamedRanges()
    .forEach(
      function(namedRange) {
        if (
          namedRange.getName() ===
          name
        ) {
          namedRange.remove();
        }
      }
    );
}


/**
 * Не дозволяє перезаписати сторонні дані.
 */
function dashboardIncomePeriodNativeAssertRangeOwnership_(
  range
) {
  const values =
    range.getDisplayValues();

  const hasAnyValue =
    values.some(
      function(row) {
        return row.some(
          function(value) {
            return (
              dashboardIncomePeriodNativeClean_(
                value
              ) !== ''
            );
          }
        );
      }
    );

  if (!hasAnyValue) {
    return;
  }

  const owned =
    dashboardIncomePeriodNativeNormalize_(
      values[0][0]
    ) ===
      dashboardIncomePeriodNativeNormalize_(
        'Сектор доходу'
      ) &&

    dashboardIncomePeriodNativeNormalize_(
      values[0][1]
    ) ===
      dashboardIncomePeriodNativeNormalize_(
        'Сума, грн'
      );

  if (!owned) {
    throw new Error(
      'Діапазон ' +
      dashboardIncomePeriodNativeRangeRef_(
        range
      ) +
      ' містить сторонні дані. ' +
      'Скрипт зупинено без змін. ' +
      'Змініть chartDataRangeA1 на інший ' +
      'вільний діапазон розміром 3×2.'
    );
  }
}


/**
 * ============================================================
 * 11. ДОПОМІЖНІ ФУНКЦІЇ
 * ============================================================
 */
function dashboardIncomePeriodNativeIsExcludedStatus_(
  statusKey
) {
  if (!statusKey) {
    return false;
  }

  return DASHBOARD_INCOME_PERIOD_NATIVE_CFG
    .excludedStatusFragments
    .some(
      function(fragment) {
        return (
          statusKey.indexOf(
            fragment
          ) >= 0
        );
      }
    );
}


function dashboardIncomePeriodNativeResolvePeriod_(
  dates
) {
  if (!dates.length) {
    return {
      mode:
        'SOURCE_RANGE',

      from:
        '',

      to:
        '',

      source:
        'Немає валідних доходів'
    };
  }

  const sorted =
    dates
      .slice()
      .sort(
        function(first, second) {
          return (
            first.getTime() -
            second.getTime()
          );
        }
      );

  return {
    mode:
      'SOURCE_RANGE',

    from:
      dashboardIncomePeriodNativeFormatDate_(
        sorted[0]
      ),

    to:
      dashboardIncomePeriodNativeFormatDate_(
        sorted[
          sorted.length - 1
        ]
      ),

    source:
      'Мінімальна і максимальна дати ' +
      'валідних доходів та вакцин'
  };
}


function dashboardIncomePeriodNativeParseDate_(
  value
) {
  if (
    Object.prototype.toString.call(
      value
    ) ===
      '[object Date]' &&

    !Number.isNaN(
      value.getTime()
    )
  ) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
      12,
      0,
      0
    );
  }

  const text =
    dashboardIncomePeriodNativeClean_(
      value
    );

  if (!text) {
    return null;
  }

  let match =
    text.match(
      /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/
    );

  if (match) {
    return dashboardIncomePeriodNativeCreateDate_(
      Number(
        match[3]
      ),

      Number(
        match[2]
      ),

      Number(
        match[1]
      )
    );
  }

  match =
    text.match(
      /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/
    );

  if (match) {
    return dashboardIncomePeriodNativeCreateDate_(
      Number(
        match[1]
      ),

      Number(
        match[2]
      ),

      Number(
        match[3]
      )
    );
  }

  return null;
}


function dashboardIncomePeriodNativeCreateDate_(
  year,
  month,
  day
) {
  const date =
    new Date(
      year,
      month - 1,
      day,
      12,
      0,
      0
    );

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}


function dashboardIncomePeriodNativeToNumber_(
  value
) {
  if (
    typeof value ===
      'number' &&

    Number.isFinite(
      value
    )
  ) {
    return value;
  }

  let text =
    dashboardIncomePeriodNativeClean_(
      value
    );

  if (!text) {
    return NaN;
  }

  let negative =
    false;

  if (
    /^\(.*\)$/.test(
      text
    )
  ) {
    negative =
      true;

    text =
      text.slice(
        1,
        -1
      );
  }

  text =
    text
      .replace(
        /грн\.?/gi,
        ''
      )
      .replace(
        /₴/g,
        ''
      )
      .replace(
        /\s/g,
        ''
      );

  const lastComma =
    text.lastIndexOf(
      ','
    );

  const lastDot =
    text.lastIndexOf(
      '.'
    );

  if (
    lastComma >= 0 &&
    lastDot >= 0
  ) {
    if (
      lastComma >
      lastDot
    ) {
      text =
        text
          .replace(
            /\./g,
            ''
          )
          .replace(
            ',',
            '.'
          );

    } else {
      text =
        text.replace(
          /,/g,
          ''
        );
    }

  } else if (
    lastComma >= 0
  ) {
    text =
      text.replace(
        ',',
        '.'
      );
  }

  const number =
    Number(
      text
    );

  if (
    !Number.isFinite(
      number
    )
  ) {
    return NaN;
  }

  return negative
    ? -number
    : number;
}


function dashboardIncomePeriodNativeFormatDate_(
  date
) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const timezone =
    ss.getSpreadsheetTimeZone() ||
    Session.getScriptTimeZone() ||
    'Europe/Kyiv';

  return Utilities.formatDate(
    date,
    timezone,
    'dd.MM.yyyy'
  );
}


function dashboardIncomePeriodNativeFormatPercent_(
  value
) {
  return (
    (
      Math.round(
        value * 1000
      ) / 10
    )
      .toFixed(
        1
      )
      .replace(
        '.',
        ','
      ) +
    '%'
  );
}


function dashboardIncomePeriodNativeRound2_(
  value
) {
  return (
    Math.round(
      (
        Number(
          value
        ) +
        Number.EPSILON
      ) *
      100
    ) /
    100
  );
}


function dashboardIncomePeriodNativeNormalize_(
  value
) {
  return dashboardIncomePeriodNativeClean_(
    value
  )
    .toLocaleLowerCase(
      'uk-UA'
    )

    /**
     * Вирівнює латинську i та українську і.
     */
    .replace(
      /i/g,
      'і'
    )

    .replace(
      /[’`´]/g,
      "'"
    )

    .replace(
      /\s+/g,
      ' '
    );
}


function dashboardIncomePeriodNativeClean_(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(
    value
  )
    .replace(
      /\u00A0/g,
      ' '
    )
    .replace(
      /\s+/g,
      ' '
    )
    .trim();
}


function dashboardIncomePeriodNativeRangeRef_(
  range
) {
  return (
    range.getSheet().getName() +
    '!' +
    range.getA1Notation()
  );
}


function dashboardIncomePeriodNativeColumnToLetter_(
  column
) {
  let result =
    '';

  let current =
    column;

  while (current > 0) {
    const remainder =
      (
        current - 1
      ) % 26;

    result =
      String.fromCharCode(
        65 + remainder
      ) +
      result;

    current =
      Math.floor(
        (
          current - 1
        ) / 26
      );
  }

  return result;
}