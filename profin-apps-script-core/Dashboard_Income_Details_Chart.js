// ============================================
// Dashboard_Income_Existing_Pie_Top_Filters.gs
// ProFin OS 2026 — Альтернатива Бабурка
// ============================================
//
// Призначення:
// - підключити ВЖЕ ІСНУЮЧУ кругову діаграму доходів;
// - зробити зелені клітинки над діаграмою фільтрами;
// - місяць: усі текстові місяці доходів;
// - категорія: усі фактичні категорії доходів;
// - при зміні фільтра оновлювати тільки Дані дашборду!V:W;
// - не створювати, не видаляти, не переміщувати
//   і не змінювати тип діаграми.
//
// Важливо:
// - не запускає newChart(), insertChart(), updateChart(),
//   modify() або removeChart();
// - «База операцій» залишається read-only;
// - повторний запуск dashboardIncomeDetailsBindExistingChart()
//   є безпечним.

const DASHBOARD_INCOME_DETAILS_CONFIG = {
  moduleVersion:
     'NCOME_EXISTING_PIE_TOP_FILTERS_V3_H66_H71_2026',

  sourceSheetName:
    'База операцій',

  dashboardSheetName:
    'Дашборд',

  cacheSheetName:
    'Дані дашборду',

  headersRow:
    1,

  dateHeader:
    'Дата транзакції',

  headers: {
    incomeExpenseType:
      'Тип Доходи / Витрати',

    accountingType:
      'Тип обліку',

    category:
      'Категорія',

    article:
      'Стаття',

    status:
      'Статус запису'
  },

  namedRanges: {
    selectedCategory:
      'DASH_INCOME_CATEGORY',

    selectedMonth:
      'DASH_INCOME_MONTH',

    categoryList:
      'DASH_INCOME_CATEGORY_LIST',

    monthList:
      'DASH_INCOME_MONTH_LIST',

    chartData:
      'DASH_CHART_INCOME_DETAILS_DATA'
  },

  cache: {
    categoryListRangeA1:
      'S2:S101',

    monthListRangeA1:
      'T2:T101',

    chartDataRangeA1:
      'V1:W400'
  },

  topFilters: {
  monthLabel:
    'Фільтр по місяцям',

  categoryLabel:
    'Фільтр по категоріям',

  /*
   * Нові точні клітинки фільтрів:
   *
   * H66 — місяць;
   * H71 — категорія.
   */
 monthFallbackCell:
  'F6',

 categoryFallbackCell:
  'F72',

  /*
   * Попередні клітинки фільтрів.
   * Їхні значення будуть перенесені
   * до нових клітинок.
   */
  legacyMonthCell:
    'F63',

  legacyCategoryCell:
    'E63'
},

  chart: {
    titleNeedles: [
      'доходи вибраної категорії',
      'транзакц',
      'детальн'
    ],

    /*
     * Використовується лише як додаткова
     * перевірка під час пошуку діаграми.
     */
    anchorZone: {
      minRow:
        55,

      maxRow:
        90,

      minColumn:
        4,

      maxColumn:
        10
    }
  },

  properties: {
    chartId:
      'PROFIN_DASH_INCOME_CATEGORY_DATES_CHART_ID',

    chartVersion:
      'PROFIN_DASH_INCOME_CATEGORY_DATES_CHART_VERSION'
  },

  excludedStatuses: [
    'скасовано',
    'видалено',
    'помилка'
  ],

  lockTimeoutMs:
    20000
};


// ============================================
// 1. ПІДКЛЮЧЕННЯ ДО ІСНУЮЧОЇ ДІАГРАМИ
// ============================================

function dashboardIncomeDetailsBindExistingChart() {
  const config =
    DASHBOARD_INCOME_DETAILS_CONFIG;

  const lock =
    LockService.getDocumentLock();

  if (
    !lock.tryLock(
      config.lockTimeoutMs
    )
  ) {
    throw new Error(
      'Не вдалося отримати блокування ' +
      'для підключення фільтрів доходів.'
    );
  }

  let rollback =
    null;

  try {
    const ss =
      SpreadsheetApp
        .getActiveSpreadsheet();

    const sourceSheet =
      dashboardIncomeDetailsRequireSheet_(
        ss,
        config.sourceSheetName
      );

    const dashboardSheet =
      dashboardIncomeDetailsRequireSheet_(
        ss,
        config.dashboardSheetName
      );

    const cacheSheet =
      dashboardIncomeDetailsRequireSheet_(
        ss,
        config.cacheSheetName
      );

    const categoryListRange =
      cacheSheet.getRange(
        config.cache
          .categoryListRangeA1
      );

    const monthListRange =
      cacheSheet.getRange(
        config.cache
          .monthListRangeA1
      );

    const chartDataRange =
      cacheSheet.getRange(
        config.cache
          .chartDataRangeA1
      );

    /*
     * До першого запису перевіряємо
     * структуру джерела.
     */
    const headers =
      sourceSheet
        .getRange(
          config.headersRow,
          1,
          1,
          sourceSheet.getLastColumn()
        )
        .getValues()[0];

    dashboardIncomeDetailsResolveIndexes_(
      headers
    );

    /*
     * До першого запису перевіряємо,
     * що потрібна діаграма вже існує.
     */
    const existingChart =
      dashboardIncomeDetailsFindExistingChart_(
        dashboardSheet,
        chartDataRange
      );

    if (!existingChart) {
      throw new Error(
        'Не знайдено існуючу діаграму доходів, ' +
        'яка читає ' +
        dashboardIncomeDetailsRangeRef_(
          chartDataRange
        ) +
        '. Скрипт не створював і не змінював діаграму.'
      );
    }

    const chartIdsBefore =
      dashboardIncomeDetailsGetChartIds_(
        dashboardSheet
      );

      /*
 * Запам’ятовуємо попередні фільтри
 * ДО переприв’язки named ranges.
 *
 * Зараз це:
 * F63 — місяць;
 * E63 — категорія.
 */
const previousMonthRange =
  ss.getRangeByName(
    config.namedRanges
      .selectedMonth
  );

const previousCategoryRange =
  ss.getRangeByName(
    config.namedRanges
      .selectedCategory
  );

const previousMonthValue =
  dashboardSheet
    .getRange('F6')
    .getDisplayValue();

const previousCategoryValue =
  previousCategoryRange
    ? dashboardIncomeDetailsReadText_(
        previousCategoryRange
      )
    : '';

    const monthFilterRange =
      dashboardIncomeDetailsResolveTopFilterRange_(
        ss,
        dashboardSheet,
        config.namedRanges
          .selectedMonth,
        config.topFilters
          .monthLabel,
        config.topFilters
          .legacyMonthCell,
        config.topFilters
          .monthFallbackCell
      );

    const categoryFilterRange =
      dashboardIncomeDetailsResolveTopFilterRange_(
        ss,
        dashboardSheet,
        config.namedRanges
          .selectedCategory,
        config.topFilters
          .categoryLabel,
        config.topFilters
          .legacyCategoryCell,
        config.topFilters
          .categoryFallbackCell
      );

    if (
      dashboardIncomeDetailsRangesIntersect_(
        monthFilterRange,
        categoryFilterRange
      )
    ) {
      throw new Error(
        'Фільтр місяця і фільтр категорії ' +
        'не можуть використовувати одну клітинку.'
      );
    }

    rollback =
      dashboardIncomeDetailsCreateBindingSnapshot_(
        ss,
        {
          selectedCategoryRange:
            categoryFilterRange,

          selectedMonthRange:
            monthFilterRange,

          categoryListRange:
            categoryListRange,

          monthListRange:
            monthListRange,

          chartDataRange:
            chartDataRange
        }
      );

    /*
     * Переприв’язуємо тільки named ranges.
     * Старі E63/F63 не очищаються.
     */
    dashboardIncomeDetailsSetNamedRange_(
      ss,
      config.namedRanges
        .selectedCategory,
      categoryFilterRange
    );

    dashboardIncomeDetailsSetNamedRange_(
      ss,
      config.namedRanges
        .selectedMonth,
      monthFilterRange
    );

    dashboardIncomeDetailsSetNamedRange_(
      ss,
      config.namedRanges
        .categoryList,
      categoryListRange
    );

    dashboardIncomeDetailsSetNamedRange_(
      ss,
      config.namedRanges
        .monthList,
      monthListRange
    );

    dashboardIncomeDetailsSetNamedRange_(
      ss,
      config.namedRanges
        .chartData,
      chartDataRange
    );

    /*
 * Переносимо поточний вибір:
 *
 * F63 → H66 — місяць;
 * E63 → H71 — категорія.
 *
 * Якщо значення вже не входить
 * до актуального списку, функції
 * оновлення dropdown нижче безпечно
 * виберуть доступне значення.
 */
if (
  previousMonthValue &&
  (
    !previousMonthRange ||
    !dashboardIncomeDetailsRangesIntersect_(
      previousMonthRange,
      monthFilterRange
    )
  )
) {
  dashboardIncomeDetailsSetControlValue_(
    monthFilterRange,
    previousMonthValue
  );
}

if (
  previousCategoryValue &&
  (
    !previousCategoryRange ||
    !dashboardIncomeDetailsRangesIntersect_(
      previousCategoryRange,
      categoryFilterRange
    )
  )
) {
  dashboardIncomeDetailsSetControlValue_(
    categoryFilterRange,
    previousCategoryValue
  );
}

    const context = {
      ss:
        ss,

      sourceSheet:
        sourceSheet,

      dashboardSheet:
        dashboardSheet,

      cacheSheet:
        cacheSheet,

      selectedCategoryRange:
        categoryFilterRange,

      selectedMonthRange:
        monthFilterRange,

      categoryListRange:
        categoryListRange,

      monthListRange:
        monthListRange,

      chartDataRange:
        chartDataRange,

      managedChart:
        existingChart
    };

    const categoriesResult =
      dashboardIncomeDetailsRefreshCategoryList_(
        context
      );

    const monthsResult =
      dashboardIncomeDetailsRefreshMonthList_(
        context
      );

    /*
     * Під час першого підключення
     * обираємо комбінацію, для якої є дані.
     */
    const selectionResult =
  context.selectedMonthRange
    .getA1Notation() === 'F6'
    ? {
        adjusted: false,
        reason:
          'central-period-controls-month'
      }
    : dashboardIncomeDetailsEnsureInitialCombination_(
        context
      );

    const cacheResult =
      dashboardIncomeDetailsRefreshCacheWithContext_(
        context
      );

    SpreadsheetApp.flush();

    const chartAfter =
      dashboardIncomeDetailsFindExistingChart_(
        dashboardSheet,
        chartDataRange
      );

    if (!chartAfter) {
      throw new Error(
        'Після оновлення V:W існуючу діаграму ' +
        'не знайдено. Об’єкт діаграми скрипт не змінював.'
      );
    }

    const chartIdsAfter =
      dashboardIncomeDetailsGetChartIds_(
        dashboardSheet
      );

    const chartCollectionUnchanged =
      JSON.stringify(
        chartIdsBefore
      ) ===
      JSON.stringify(
        chartIdsAfter
      );

    if (
      !chartCollectionUnchanged
    ) {
      throw new Error(
        'Набір діаграм на листі несподівано змінився. ' +
        'Зміни фільтрів і кешу буде відкочено.'
      );
    }

    const documentProperties =
      PropertiesService
        .getDocumentProperties();

    documentProperties.setProperty(
      config.properties.chartId,
      String(
        chartAfter.getChartId()
      )
    );

    documentProperties.setProperty(
      config.properties.chartVersion,
      config.moduleVersion
    );

    /*
 * Нове підключення вже перевірене.
 * Тепер вимикаємо старі dropdown.
 *
 * Це другорядне очищення:
 * його помилка не повинна скасовувати
 * правильне підключення H66/H71.
 */
const legacyFilterCleanup = {
  month:
    false,

  category:
    false,

  warnings:
    []
};

if (
  previousMonthRange &&
  !dashboardIncomeDetailsRangesIntersect_(
    previousMonthRange,
    monthFilterRange
  )
) {
  try {
    previousMonthRange
      .clearDataValidations()
      .clearContent();

    legacyFilterCleanup.month =
      true;

  } catch (error) {
    legacyFilterCleanup.warnings.push(
      'Не очищено старий фільтр місяця: ' +
      error.message
    );
  }
}

if (
  previousCategoryRange &&
  !dashboardIncomeDetailsRangesIntersect_(
    previousCategoryRange,
    categoryFilterRange
  )
) {
  try {
    previousCategoryRange
      .clearDataValidations()
      .clearContent();

    legacyFilterCleanup.category =
      true;

  } catch (error) {
    legacyFilterCleanup.warnings.push(
      'Не очищено старий фільтр категорії: ' +
      error.message
    );
  }
}

    const result = {
      ok:
        true,

      moduleVersion:
        config.moduleVersion,

      mode:
        'BIND_EXISTING_CHART_ONLY',

      monthFilter:
        dashboardIncomeDetailsRangeRef_(
          monthFilterRange
        ),

      categoryFilter:
        dashboardIncomeDetailsRangeRef_(
          categoryFilterRange
        ),

        legacyMonthFilter:
  previousMonthRange
    ? dashboardIncomeDetailsRangeRef_(
        previousMonthRange
      )
    : '',

legacyCategoryFilter:
  previousCategoryRange
    ? dashboardIncomeDetailsRangeRef_(
        previousCategoryRange
      )
    : '',

legacyFilterCleanup:
  legacyFilterCleanup,

      categoryList:
        dashboardIncomeDetailsRangeRef_(
          categoryListRange
        ),

      monthList:
        dashboardIncomeDetailsRangeRef_(
          monthListRange
        ),

      chartSource:
        dashboardIncomeDetailsRangeRef_(
          chartDataRange
        ),

      existingChartId:
        chartAfter.getChartId(),

      categories:
        categoriesResult.count,

      months:
        monthsResult.count,

      selectedCategory:
        cacheResult.selectedCategory,

      selectedMonth:
        cacheResult.selectedMonth,

      initialSelectionAdjusted:
        selectionResult.adjusted,

      dateRows:
        cacheResult.dateRows,

      totalTransactions:
        cacheResult.totalTransactions,

      placeholderUsed:
        cacheResult.placeholderUsed,

      chartObjectChanged:
        false,

      chartCollectionUnchanged:
        chartCollectionUnchanged,

      chartInserted:
        false,

      chartUpdated:
        false,

      chartRemoved:
        false,

      noSourceCellsWritten:
        true
    };

    Logger.log(
      'dashboardIncomeDetailsBindExistingChart: ' +
      JSON.stringify(
        result,
        null,
        2
      )
    );

    rollback =
      null;

    return result;

  } catch (error) {
    if (rollback) {
      try {
        dashboardIncomeDetailsRestoreBindingSnapshot_(
          rollback
        );

      } catch (rollbackError) {
        console.error(
          'Не вдалося повністю відкотити ' +
          'підключення фільтрів: ' +
          rollbackError.message
        );
      }
    }

    throw error;

  } finally {
    lock.releaseLock();
  }
}


// ============================================
// 2. ОНОВЛЕННЯ ПІСЛЯ ВИБОРУ ФІЛЬТРА
// ============================================

function dashboardIncomeDetailsRefreshChartData() {
  const config =
    DASHBOARD_INCOME_DETAILS_CONFIG;

  const lock =
    LockService.getDocumentLock();

  if (
    !lock.tryLock(
      config.lockTimeoutMs
    )
  ) {
    throw new Error(
      'Не вдалося отримати блокування ' +
      'для оновлення діаграми доходів.'
    );
  }

  const startedAt =
    Date.now();

  try {
    const context =
      dashboardIncomeDetailsAssertReady_();

    /*
     * Оновлюємо тільки V:W.
     * Об’єкт діаграми не торкаємо.
     */
    const result =
      dashboardIncomeDetailsRefreshCacheWithContext_(
        context
      );

    result.durationMs =
      Date.now() - startedAt;

    result.chartId =
      context.managedChart
        .getChartId();

    result.chartSource =
      dashboardIncomeDetailsRangeRef_(
        context.chartDataRange
      );

    result.chartObjectChanged =
      false;

    result.filterListsChanged =
      false;

    result.noSourceCellsWritten =
      true;

    Logger.log(
      'dashboardIncomeDetailsRefreshChartData: ' +
      JSON.stringify(
        result,
        null,
        2
      )
    );

    return result;

  } finally {
    lock.releaseLock();
  }
}


// ============================================
// 3. DRY RUN — БЕЗ ЗАПИСУ
// ============================================

function dashboardIncomeDetailsDryRun() {
  const context =
    dashboardIncomeDetailsAssertReady_();

  const selectedCategory =
    dashboardIncomeDetailsReadText_(
      context.selectedCategoryRange
    );

  const selectedMonth =
    dashboardIncomeDetailsGetSelectedMonth_(
      context.selectedMonthRange
    );

  if (!selectedCategory) {
    return {
      ok:
        false,

      status:
        'empty',

      message:
        'Не вибрано категорію доходу.',

      noCellsWritten:
        true
    };
  }

  if (!selectedMonth) {
    return {
      ok:
        false,

      status:
        'empty',

      message:
        'Не вибрано місяць доходу.',

      noCellsWritten:
        true
    };
  }

  const dataset =
    dashboardIncomeDetailsBuildDataset_(
      context.sourceSheet,
      selectedCategory,
      selectedMonth
    );

  const result = {
    ok:
      true,

    selectedCategory:
      selectedCategory,

    selectedMonth:
      dashboardIncomeDetailsFormatMonthText_(
        selectedMonth
      ),

    dateRows:
      dataset.dateRows,

    totalTransactions:
      dataset.totalTransactions,

    placeholderUsed:
      dataset.placeholderUsed,

    preview:
      dataset.output.slice(
        0,
        40
      ),

    chartObjectChanged:
      false,

    noCellsWritten:
      true
  };

  Logger.log(
    'dashboardIncomeDetailsDryRun: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


// ============================================
// 4. АУДИТ ПІДКЛЮЧЕННЯ
// ============================================

function dashboardIncomeDetailsAuditTopFilterBinding() {
  const context =
    dashboardIncomeDetailsAssertReady_();

  const monthControl =
    dashboardIncomeDetailsControlCell_(
      context.selectedMonthRange
    );

  const categoryControl =
    dashboardIncomeDetailsControlCell_(
      context.selectedCategoryRange
    );

  const result = {
    ok:
      !!context.managedChart &&
      !!monthControl.getDataValidation() &&
      !!categoryControl.getDataValidation(),

    moduleVersion:
      DASHBOARD_INCOME_DETAILS_CONFIG
        .moduleVersion,

    monthFilter:
      dashboardIncomeDetailsRangeRef_(
        context.selectedMonthRange
      ),

    categoryFilter:
      dashboardIncomeDetailsRangeRef_(
        context.selectedCategoryRange
      ),

    monthValue:
      monthControl.getDisplayValue(),

    categoryValue:
      categoryControl.getDisplayValue(),

    monthValidation:
      !!monthControl.getDataValidation(),

    categoryValidation:
      !!categoryControl.getDataValidation(),

    existingChartId:
      context.managedChart
        .getChartId(),

    chartSource:
      dashboardIncomeDetailsRangeRef_(
        context.chartDataRange
      ),

    managedChartRanges:
      context.managedChart
        .getRanges()
        .map(
          dashboardIncomeDetailsRangeRef_
        ),

    totalChartsOnDashboard:
      context.dashboardSheet
        .getCharts()
        .length,

    chartObjectChanged:
      false,

    noCellsWritten:
      true
  };

  Logger.log(
    'dashboardIncomeDetailsAuditTopFilterBinding: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


function dashboardIncomeDetailsAudit() {
  const context =
    dashboardIncomeDetailsAssertReady_();

  const selectedCategory =
    dashboardIncomeDetailsReadText_(
      context.selectedCategoryRange
    );

  const selectedMonth =
    dashboardIncomeDetailsGetSelectedMonth_(
      context.selectedMonthRange
    );

  const values =
    context.sourceSheet
      .getDataRange()
      .getValues();

  const headers =
    values[
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow - 1
    ];

  const indexes =
    dashboardIncomeDetailsResolveIndexes_(
      headers
    );

  const selectedCategoryKey =
    dashboardIncomeDetailsNormalize_(
      selectedCategory
    );

  let incomeRows = 0;
  let categoryRows = 0;
  let categoryMonthRows = 0;
  let invalidDateRows = 0;
  let excludedStatusRows = 0;

  for (
    let rowIndex =
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {
    const row = values[rowIndex];

    if (
      !dashboardIncomeDetailsIsIncomeRow_(
        row,
        indexes
      )
    ) {
      continue;
    }

    incomeRows++;

    if (
      indexes.status >= 0 &&
      dashboardIncomeDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      excludedStatusRows++;
      continue;
    }

    const categoryKey =
      dashboardIncomeDetailsNormalize_(
        dashboardIncomeDetailsResolveDisplayCategoryV1_(
    row,
   indexes
 )
      );

    if (
      categoryKey !==
      selectedCategoryKey
    ) {
      continue;
    }

    categoryRows++;

    const date =
      dashboardIncomeDetailsDateOnly_(
        row[indexes.date]
      );

    if (!date) {
      invalidDateRows++;
      continue;
    }

    if (
      date.getFullYear() ===
        selectedMonth.getFullYear() &&
      date.getMonth() ===
        selectedMonth.getMonth()
    ) {
      categoryMonthRows++;
    }
  }

  const dataset =
    dashboardIncomeDetailsBuildDataset_(
      context.sourceSheet,
      selectedCategory,
      selectedMonth
    );

  const cacheValues =
    context.chartDataRange
      .getDisplayValues();

  let cacheNonEmptyRows = 0;

  for (
    let rowIndex = 1;
    rowIndex < cacheValues.length;
    rowIndex++
  ) {
    if (
      dashboardIncomeDetailsClean_(
        cacheValues[rowIndex][0]
      ) ||
      dashboardIncomeDetailsClean_(
        cacheValues[rowIndex][1]
      )
    ) {
      cacheNonEmptyRows++;
    }
  }

  const result = {
    ok: true,
    test:
      'dashboardIncomeDetailsAudit',
    selectedCategory:
      selectedCategory,
    selectedMonth:
      dashboardIncomeDetailsFormatMonthText_(
        selectedMonth
      ),
    sourceRowsRead:
      values.length - 1,
    incomeRows:
      incomeRows,
    selectedCategoryRows:
      categoryRows,
    selectedCategoryMonthRows:
      categoryMonthRows,
    invalidDateRows:
      invalidDateRows,
    excludedStatusRows:
      excludedStatusRows,
    datasetDateRows:
      dataset.dateRows,
    datasetTransactions:
      dataset.totalTransactions,
    datasetPlaceholderUsed:
      dataset.placeholderUsed,
    cacheRange:
      dashboardIncomeDetailsRangeRef_(
        context.chartDataRange
      ),
    cacheNonEmptyRows:
      cacheNonEmptyRows,
    chartObjectChanged:
      false,
    noCellsWritten:
      true
  };

  Logger.log(
    'dashboardIncomeDetailsAudit: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/*
 * Сумісне ім’я.
 * Діаграму не створює і не змінює.
 */
function dashboardIncomeDetailsRepairChartRange() {
  return dashboardIncomeDetailsBindExistingChart();
}


// ============================================
// 5. ОБРОБНИК onEdit
// ============================================
//
// Не створюйте другу function onEdit(e).
//
// У чинному загальному onEdit(e)
// має залишатися один виклик:
//
// dashboardIncomeDetailsHandleEdit_(e);

function dashboardIncomeDetailsHandleEdit_(
  e
) {
  if (
    !e ||
    !e.range
  ) {
    return null;
  }

  const ss =
    e.source ||
    SpreadsheetApp
      .getActiveSpreadsheet();

  const categoryRange =
    ss.getRangeByName(
      DASHBOARD_INCOME_DETAILS_CONFIG
        .namedRanges
        .selectedCategory
    );

  const monthRange =
    ss.getRangeByName(
      DASHBOARD_INCOME_DETAILS_CONFIG
        .namedRanges
        .selectedMonth
    );

  if (
    !categoryRange ||
    !monthRange
  ) {
    return null;
  }

  const relevantEdit =
    dashboardIncomeDetailsRangesIntersect_(
      e.range,
      categoryRange
    ) ||
    dashboardIncomeDetailsRangesIntersect_(
      e.range,
      monthRange
    );

  if (!relevantEdit) {
    return null;
  }

  try {
    return dashboardIncomeDetailsRefreshChartData();

  } catch (error) {
    console.error(
      'dashboardIncomeDetailsHandleEdit_: ' +
      error.message
    );

    return null;
  }
}


// ============================================
// 6. ОНОВЛЕННЯ КЕШУ V:W
// ============================================

function dashboardIncomeDetailsRefreshCacheWithContext_(
  context
) {
  const selectedCategory =
    dashboardIncomeDetailsReadText_(
      context.selectedCategoryRange
    );

  const selectedMonth =
    dashboardIncomeDetailsGetSelectedMonth_(
      context.selectedMonthRange
    );

  if (!selectedCategory) {
    throw new Error(
      'Не вибрано категорію доходу.'
    );
  }

  if (!selectedMonth) {
    throw new Error(
      'Не вибрано місяць доходу.'
    );
  }

  const dataset =
    dashboardIncomeDetailsBuildDataset_(
      context.sourceSheet,
      selectedCategory,
      selectedMonth
    );

  dashboardIncomeDetailsWriteDataset_(
    context.chartDataRange,
    dataset.output
  );

  SpreadsheetApp.flush();

  return {
    ok:
      true,

    status:
      dataset.totalTransactions > 0
        ? 'ok'
        : 'empty',

    selectedCategory:
      selectedCategory,

    selectedMonth:
      dashboardIncomeDetailsFormatMonthText_(
        selectedMonth
      ),

    dateRows:
      dataset.dateRows,

    totalTransactions:
      dataset.totalTransactions,

    placeholderUsed:
      dataset.placeholderUsed,

    items:
      dataset.items,

    cacheSource:
      dashboardIncomeDetailsRangeRef_(
        context.chartDataRange
      )
  };
}


// ============================================
// 7. СПИСОК УСІХ КАТЕГОРІЙ ДОХОДУ
// ============================================

function dashboardIncomeDetailsRefreshCategoryList_(
  context
) {
  const values =
    context.sourceSheet
      .getDataRange()
      .getValues();

  const headers =
    values[
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow - 1
    ];

  const indexes =
    dashboardIncomeDetailsResolveIndexes_(
      headers
    );

  const categoryMap =
    Object.create(null);

  for (
    let rowIndex =
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {
    const row =
      values[rowIndex];

    if (
      !dashboardIncomeDetailsIsIncomeRow_(
        row,
        indexes
      )
    ) {
      continue;
    }

    if (
      indexes.status >= 0 &&
      dashboardIncomeDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      continue;
    }

   const category =
  dashboardIncomeDetailsResolveDisplayCategoryV1_(
    row,
    indexes
  );

    if (!category) {
      continue;
    }

    const key =
      dashboardIncomeDetailsNormalize_(
        category
      );

    if (!categoryMap[key]) {
      categoryMap[key] =
        category;
    }
  }

  const categories =
  Object.keys(
    categoryMap
  )
    .map(function(key) {
      return categoryMap[key];
    })

    /*
     * Жорстко забороняємо старий
     * службовий пункт "Всі категорії".
     *
     * У dropdown повинні бути
     * тільки реальні категорії доходів.
     */
    .filter(function(category) {
      const key =
        dashboardIncomeDetailsNormalize_(
          category
        );

      return (
        key !== 'всі категорії' &&
        key !== 'усі категорії'
      );
    })

    .sort(function(
      first,
      second
    ) {
      return first.localeCompare(
        second,
        'uk'
      );
    });

  dashboardIncomeDetailsWriteList_(
    context.categoryListRange,
    categories
  );

  if (!categories.length) {
    context.selectedCategoryRange
      .clearContent()
      .clearDataValidations();

    return {
      count:
        0,

      categories:
        []
    };
  }

  const activeListRange =
    context.categoryListRange.offset(
      0,
      0,
      categories.length,
      1
    );

  const validation =
    SpreadsheetApp
      .newDataValidation()

      .requireValueInRange(
        activeListRange,
        true
      )

      .setAllowInvalid(
        false
      )

      .setHelpText(
        'Оберіть категорію доходу.'
      )

      .build();

  context.selectedCategoryRange
    .setDataValidation(
      validation
    );

  const current =
    dashboardIncomeDetailsNormalize_(
      dashboardIncomeDetailsReadText_(
        context.selectedCategoryRange
      )
    );

  const currentExists =
    categories.some(
      function(category) {
        return (
          dashboardIncomeDetailsNormalize_(
            category
          ) === current
        );
      }
    );

  if (!currentExists) {
    dashboardIncomeDetailsSetControlValue_(
      context.selectedCategoryRange,
      categories[0]
    );
  }

  return {
    count:
      categories.length,

    categories:
      categories
  };
}


// ============================================
// 8. СПИСОК УСІХ ТЕКСТОВИХ МІСЯЦІВ
// ============================================

function dashboardIncomeDetailsRefreshMonthList_(
  context
) {
  const values =
    context.sourceSheet
      .getDataRange()
      .getValues();

  const headers =
    values[
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow - 1
    ];

  const indexes =
    dashboardIncomeDetailsResolveIndexes_(
      headers
    );

  const monthMap =
    Object.create(null);

  for (
    let rowIndex =
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {
    const row =
      values[rowIndex];

    if (
      !dashboardIncomeDetailsIsIncomeRow_(
        row,
        indexes
      )
    ) {
      continue;
    }

    if (
      indexes.status >= 0 &&
      dashboardIncomeDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      continue;
    }

    const transactionDate =
      dashboardIncomeDetailsDateOnly_(
        row[indexes.date]
      );

    if (!transactionDate) {
      continue;
    }

    const key =
      dashboardIncomeDetailsMonthKey_(
        transactionDate
      );

    monthMap[key] =
      new Date(
        transactionDate.getFullYear(),
        transactionDate.getMonth(),
        15
      );
  }

  const months =
    Object.keys(
      monthMap
    )
      .sort()

      .map(function(key) {
        return monthMap[key];
      });

  const monthLabels =
    months.map(
      dashboardIncomeDetailsFormatMonthText_
    );

  dashboardIncomeDetailsWriteList_(
    context.monthListRange,
    monthLabels
  );

  context.monthListRange
    .setNumberFormat(
      '@'
    );

  if (!months.length) {
    context.selectedMonthRange
      .clearContent()
      .clearDataValidations();

    return {
      count:
        0,

      months:
        [],

      monthLabels:
        []
    };
  }

  const activeListRange =
    context.monthListRange.offset(
      0,
      0,
      monthLabels.length,
      1
    );

  const validation =
    SpreadsheetApp
      .newDataValidation()

      .requireValueInRange(
        activeListRange,
        true
      )

      .setAllowInvalid(
        false
      )

      .setHelpText(
        'Оберіть місяць доходів.'
      )

      .build();

  context.selectedMonthRange
    .setDataValidation(
      validation
    )

    .setNumberFormat(
      '@'
    );

  const currentMonth =
    dashboardIncomeDetailsGetSelectedMonth_(
      context.selectedMonthRange
    );

  const currentExists =
    currentMonth &&
    months.some(
      function(month) {
        return (
          month.getFullYear() ===
            currentMonth.getFullYear() &&

          month.getMonth() ===
            currentMonth.getMonth()
        );
      }
    );

  if (!currentExists) {
    const now =
      new Date();

    const currentCalendarMonth =
      months.find(
        function(month) {
          return (
            month.getFullYear() ===
              now.getFullYear() &&

            month.getMonth() ===
              now.getMonth()
          );
        }
      );

    dashboardIncomeDetailsSetControlValue_(
      context.selectedMonthRange,

      dashboardIncomeDetailsFormatMonthText_(
        currentCalendarMonth ||
        months[
          months.length - 1
        ]
      )
    );
  }

  return {
    count:
      months.length,

    months:
      months,

    monthLabels:
      monthLabels
  };
}


// ============================================
// 9. ПОБУДОВА ДАНИХ: ДАТА + СТАТТЯ
// ============================================

function dashboardIncomeDetailsBuildDatasetFromPlCore_(
  selectedCategory,
  period
) {
  if (
    typeof proFinPlCoreCalculate_ !==
    'function'
  ) {
    throw new Error(
      'P&L Core не знайдено: proFinPlCoreCalculate_.'
    );
  }


  const model =
    proFinPlCoreCalculate_(
      period
    );


  const selectedKey =
    dashboardIncomeDetailsNormalize_(
      selectedCategory
    );


  const category =
    model.income.categories.find(
      function(item) {
        return (
          dashboardIncomeDetailsNormalize_(
            item.category
          ) ===
          selectedKey
        );
      }
    ) ||
    null;


  const sourceArticles =
    category
      ? category.articles
      : [];


  const items =
    sourceArticles
      .map(
        function(item) {
          return {
            article:
              item.article,

            quantity:
              item.transactions,

            amount:
              item.amount
          };
        }
      )

      .filter(
        function(item) {
          return (
            item.quantity >
            0
          );
        }
      )

      .sort(
        function(
          first,
          second
        ) {
          if (
            second.quantity !==
            first.quantity
          ) {
            return (
              second.quantity -
              first.quantity
            );
          }

          return first.article.localeCompare(
            second.article,
            'uk'
          );
        }
      );


  const totalTransactions =
    items.reduce(
      function(
        sum,
        item
      ) {
        return (
          sum +
          item.quantity
        );
      },
      0
    );


  const output = [
    [
      'Стаття — кількість',
      'Кількість'
    ]
  ];


  items.forEach(
    function(item) {
      output.push([
        item.article +
          ' — ' +
          item.quantity +
          ' шт.',

        item.quantity
      ]);
    }
  );


  let placeholderUsed =
    false;


  if (
    !items.length
  ) {
    placeholderUsed =
      true;

    output.push([
      'Немає транзакцій — ' +
        selectedCategory,

      1
    ]);
  }


  return {
    output:
      output,

    dateRows:
      items.length,

    totalTransactions:
      totalTransactions,

    placeholderUsed:
      placeholderUsed,

    items:
      items,

    sourceOfTruth:
      'P&L_CORE',

    plCoreVersion:
      model.version
  };
}

function dashboardIncomeDetailsBuildDataset_(
  sourceSheet,
  selectedCategory,
  selectedMonth
) {
  const values =
    sourceSheet
      .getDataRange()
      .getValues();

  const headers =
    values[
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow - 1
    ];

  const indexes =
    dashboardIncomeDetailsResolveIndexes_(
      headers
    );

  const selectedCategoryKey =
    dashboardIncomeDetailsNormalize_(
      selectedCategory
    );

  /*
   * Групування виконується тільки за статтею.
   *
   * Дата використовується виключно для перевірки
   * вибраного місяця, але не потрапляє:
   * - у назву сектора;
   * - у підказку при наведенні;
   * - у службовий діапазон V:W;
   * - у placeholder.
   */
  const grouped =
    Object.create(null);

  let totalTransactions =
    0;

  for (
    let rowIndex =
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {
    const row =
      values[rowIndex];

    if (
      !dashboardIncomeDetailsIsIncomeRow_(
        row,
        indexes
      )
    ) {
      continue;
    }

    if (
      indexes.status >= 0 &&
      dashboardIncomeDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      continue;
    }

const rowCategoryKey =
  dashboardIncomeDetailsNormalize_(
    dashboardIncomeDetailsResolveDisplayCategoryV1_(
      row,
      indexes
    )
  );

 if (
      rowCategoryKey !==
      selectedCategoryKey
    ) {
      continue;
    }

    const transactionDate =
      dashboardIncomeDetailsDateOnly_(
        row[indexes.date]
      );

    if (!transactionDate) {
      continue;
    }

    /*
     * Місяць продовжує працювати як фільтр.
     * Дата при цьому ніде на діаграмі
     * не відображається.
     */
    if (
      transactionDate.getFullYear() !==
        selectedMonth.getFullYear() ||

      transactionDate.getMonth() !==
        selectedMonth.getMonth()
    ) {
      continue;
    }

    const articleName =
      dashboardIncomeDetailsClean_(
        row[indexes.article]
      ) ||
      'Без назви';

    const groupKey =
      dashboardIncomeDetailsNormalize_(
        articleName
      );

    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        articleName:
          articleName,

        count:
          0,

        /*
         * Використовується лише для збереження
         * стабільного порядку секторів.
         * У діаграму дата не передається.
         */
        firstDate:
          transactionDate
      };
    }

    if (
      transactionDate.getTime() <
      grouped[groupKey].firstDate.getTime()
    ) {
      grouped[groupKey].firstDate =
        transactionDate;
    }

    grouped[groupKey].count++;

    totalTransactions++;
  }

  const groupedItems =
    Object.keys(
      grouped
    )
      .map(function(key) {
        return grouped[key];
      })

      .sort(function(
        first,
        second
      ) {
        const dateDifference =
          first.firstDate.getTime() -
          second.firstDate.getTime();

        if (
          dateDifference !== 0
        ) {
          return dateDifference;
        }

        return first.articleName.localeCompare(
          second.articleName,
          'uk'
        );
      });

  /*
   * У першій колонці більше немає
   * заголовка або значень із датою.
   */
  const output = [
    [
      'Стаття — кількість',
      'Кількість'
    ]
  ];

  const items =
    [];

  groupedItems.forEach(
    function(item) {
      const label =
        item.articleName +
        ' — ' +
        item.count +
        ' шт.';

      output.push([
        label,
        item.count
      ]);

      items.push({
        article:
          item.articleName,

        quantity:
          item.count,

        label:
          label
      });
    }
  );

  let placeholderUsed =
    false;

  if (!groupedItems.length) {
    placeholderUsed =
      true;

    /*
     * У порожньому стані також
     * не показуємо місяць або дату.
     */
    output.push([
      'Немає транзакцій — ' +
      selectedCategory,

      1
    ]);
  }

  return {
    output:
      output,

    /*
     * Назву поля залишаємо для сумісності
     * з чинними журналами й перевірками.
     * Тепер значення дорівнює кількості
     * сформованих секторів за статтями.
     */
    dateRows:
      groupedItems.length,

    totalTransactions:
      totalTransactions,

    placeholderUsed:
      placeholderUsed,

    items:
      items
  };
}


// ============================================
// 10. БЕЗПЕЧНИЙ ЗАПИС У V:W
// ============================================

function dashboardIncomeDetailsNormalizeChartOutputWithoutDates_(
  output
) {
  if (
    !Array.isArray(output) ||
    output.length < 2
  ) {
    throw new Error(
      'Неможливо очистити дані діаграми: ' +
      'отримано некоректний набір.'
    );
  }

  /*
   * Формати дат, які могли залишитися
   * від старої версії модуля:
   *
   * 25.05.2026 — Стаття — 1 шт.
   * 2026-05-25 — Стаття — 1 шт.
   */
  const datePrefixes = [
    /^\s*\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}\s*[—–-]\s*/,

    /^\s*\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}\s*[—–-]\s*/
  ];

  /*
   * Видаляємо старий текстовий місяць
   * із порожнього стану, якщо він там є.
   */
  const monthSuffix =
    /\s*[—–-]\s*(січень|лютий|березень|квітень|травень|червень|липень|серпень|вересень|жовтень|листопад|грудень)\s+\d{4}\s*$/i;

  /*
   * Відокремлюємо назву статті
   * від старого підпису кількості.
   */
  const countSuffix =
    /\s*[—–-]\s*(\d+(?:[.,]\d+)?)\s*шт\.?\s*$/i;

  const grouped =
    Object.create(null);

  const order =
    [];

  let placeholderLabel =
    '';

  for (
    let rowIndex = 1;
    rowIndex < output.length;
    rowIndex++
  ) {
    const row =
      output[rowIndex];

    if (
      !Array.isArray(row) ||
      row.length < 2
    ) {
      continue;
    }

    let label =
      dashboardIncomeDetailsClean_(
        row[0]
      );

    if (!label) {
      continue;
    }

    /*
     * Прибираємо дату з початку підпису.
     */
    datePrefixes.forEach(
      function(pattern) {
        label =
          label.replace(
            pattern,
            ''
          );
      }
    );

    /*
     * Порожній стан не є реальною статтею.
     */
    if (
      dashboardIncomeDetailsNormalize_(
        label
      ).indexOf(
        'немає транзакцій'
      ) === 0
    ) {
      placeholderLabel =
        label
          .replace(
            monthSuffix,
            ''
          )

          .replace(
            /\s*[—–-]\s*\d{1,2}\.\d{4}\s*$/,
            ''
          );

      continue;
    }

    const countMatch =
      label.match(
        countSuffix
      );

    let articleName =
      countMatch
        ? label.slice(
            0,
            countMatch.index
          )
        : label;

    /*
     * Додаткове очищення на випадок,
     * якщо перед назвою залишилися
     * пробіли або розділювачі.
     */
    articleName =
      dashboardIncomeDetailsClean_(
        articleName
      )
        .replace(
          /^[—–-]\s*/,
          ''
        );

    if (!articleName) {
      articleName =
        'Без назви';
    }

    let quantity =
      Number(
        row[1]
      );

    /*
     * Якщо кількість у другій колонці
     * була записана текстом, беремо її
     * зі старого підпису.
     */
    if (
      !Number.isFinite(
        quantity
      ) &&
      countMatch
    ) {
      quantity =
        Number(
          String(
            countMatch[1]
          ).replace(
            ',',
            '.'
          )
        );
    }

    if (
      !Number.isFinite(
        quantity
      ) ||
      quantity <= 0
    ) {
      continue;
    }

    const articleKey =
      dashboardIncomeDetailsNormalize_(
        articleName
      );

    if (!grouped[articleKey]) {
      grouped[articleKey] = {
        articleName:
          articleName,

        quantity:
          0
      };

      order.push(
        articleKey
      );
    }

    /*
     * Якщо стара версія створила
     * окремі сектори за кожною датою,
     * після очищення вони об’єднаються.
     */
    grouped[articleKey].quantity +=
      quantity;
  }

  const normalizedOutput = [
    [
      'Стаття — кількість',
      'Кількість'
    ]
  ];

  order.forEach(
    function(articleKey) {
      const item =
        grouped[articleKey];

      const quantity =
        Math.round(
          item.quantity
        );

      normalizedOutput.push([
        item.articleName +
          ' — ' +
          quantity +
          ' шт.',

        quantity
      ]);
    }
  );

  if (
    normalizedOutput.length === 1
  ) {
    normalizedOutput.push([
      placeholderLabel ||
        'Немає транзакцій',

      1
    ]);
  }

  return normalizedOutput;
}

function dashboardIncomeDetailsWriteDataset_(
  targetRange,
  output
) {
  /*
   * Останній захисний шар:
   *
   * навіть якщо стара функція сформувала
   * підписи з датами, у V:W потрапить
   * уже очищена й згрупована версія.
   */
  const safeOutput =
    dashboardIncomeDetailsNormalizeChartOutputWithoutDates_(
      output
    );

  if (
    !Array.isArray(
      safeOutput
    ) ||
    safeOutput.length < 2 ||
    !Array.isArray(
      safeOutput[0]
    ) ||
    safeOutput[0].length !== 2
  ) {
    throw new Error(
      'Набір даних повинен містити 2 колонки ' +
      'і щонайменше 1 рядок даних.'
    );
  }

  if (
    safeOutput.length >
      targetRange.getNumRows() ||

    targetRange.getNumColumns() < 2
  ) {
    throw new Error(
      'Діапазон ' +
      dashboardIncomeDetailsRangeRef_(
        targetRange
      ) +
      ' замалий для даних діаграми.'
    );
  }

  const snapshot =
    targetRange.getValues();

  const numberFormats =
    targetRange.getNumberFormats();

  try {
    /*
     * Очищається весь V1:W400,
     * тому старі рядки з датами
     * не можуть залишитися нижче.
     */
    targetRange.clearContent();

    const activeRange =
      targetRange.offset(
        0,
        0,
        safeOutput.length,
        2
      );

    activeRange.setValues(
      safeOutput
    );

    activeRange
      .offset(
        1,
        0,
        safeOutput.length - 1,
        1
      )

      .setNumberFormat(
        '@'
      );

    activeRange
      .offset(
        1,
        1,
        safeOutput.length - 1,
        1
      )

      .setNumberFormat(
        '0'
      );

  } catch (error) {
    targetRange.setValues(
      snapshot
    );

    targetRange.setNumberFormats(
      numberFormats
    );

    SpreadsheetApp.flush();

    throw error;
  }
}


// ============================================
// 11. ПОЧАТКОВА ВАЛІДНА КОМБІНАЦІЯ
// ============================================

function dashboardIncomeDetailsEnsureInitialCombination_(
  context
) {
  const selectedCategory =
    dashboardIncomeDetailsReadText_(
      context.selectedCategoryRange
    );

  const selectedMonth =
    dashboardIncomeDetailsGetSelectedMonth_(
      context.selectedMonthRange
    );

  if (
    !selectedCategory ||
    !selectedMonth
  ) {
    return {
      adjusted:
        false,

      reason:
        'missing-selection'
    };
  }

  const currentDataset =
    dashboardIncomeDetailsBuildDataset_(
      context.sourceSheet,
      selectedCategory,
      selectedMonth
    );

  if (
    currentDataset.totalTransactions > 0
  ) {
    return {
      adjusted:
        false,

      reason:
        'current-combination-has-data'
    };
  }

  const availableMonths =
    dashboardIncomeDetailsGetMonthsForCategory_(
      context.sourceSheet,
      selectedCategory
    );

  if (!availableMonths.length) {
    return {
      adjusted:
        false,

      reason:
        'category-has-no-months'
    };
  }

  const replacementMonth =
    availableMonths[
      availableMonths.length - 1
    ];

  dashboardIncomeDetailsSetControlValue_(
    context.selectedMonthRange,

    dashboardIncomeDetailsFormatMonthText_(
      replacementMonth
    )
  );

  return {
    adjusted:
      true,

    reason:
      'selected-latest-month-for-category',

    selectedMonth:
      dashboardIncomeDetailsFormatMonthText_(
        replacementMonth
      )
  };
}


function dashboardIncomeDetailsGetMonthsForCategory_(
  sourceSheet,
  selectedCategory
) {
  const values =
    sourceSheet
      .getDataRange()
      .getValues();

  const headers =
    values[
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow - 1
    ];

  const indexes =
    dashboardIncomeDetailsResolveIndexes_(
      headers
    );

  const selectedCategoryKey =
  dashboardIncomeDetailsNormalize_(
  dashboardIncomeDetailsResolveDisplayCategoryV1_(
    row,
    indexes
  )
 )

  const monthMap =
    Object.create(null);

  for (
    let rowIndex =
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {
    const row =
      values[rowIndex];

    if (
      !dashboardIncomeDetailsIsIncomeRow_(
        row,
        indexes
      )
    ) {
      continue;
    }

    if (
      indexes.status >= 0 &&
      dashboardIncomeDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      continue;
    }

    if (
      dashboardIncomeDetailsNormalize_(
        row[indexes.category]
      ) !== selectedCategoryKey
    ) {
      continue;
    }

    const date =
      dashboardIncomeDetailsDateOnly_(
        row[indexes.date]
      );

    if (!date) {
      continue;
    }

    monthMap[
      dashboardIncomeDetailsMonthKey_(
        date
      )
    ] =
      new Date(
        date.getFullYear(),
        date.getMonth(),
        15
      );
  }

  return Object.keys(
    monthMap
  )
    .sort()

    .map(function(key) {
      return monthMap[key];
    });
}


// ============================================
// 12. READ-ONLY ПЕРЕВІРКА ГОТОВНОСТІ
// ============================================

function dashboardIncomeDetailsAssertReady_() {
  const config =
    DASHBOARD_INCOME_DETAILS_CONFIG;

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const sourceSheet =
    dashboardIncomeDetailsRequireSheet_(
      ss,
      config.sourceSheetName
    );

  const dashboardSheet =
    dashboardIncomeDetailsRequireSheet_(
      ss,
      config.dashboardSheetName
    );

  const cacheSheet =
    dashboardIncomeDetailsRequireSheet_(
      ss,
      config.cacheSheetName
    );

  const selectedCategoryRange =
    ss.getRangeByName(
      config.namedRanges
        .selectedCategory
    );

  const selectedMonthRange =
    ss.getRangeByName(
      config.namedRanges
        .selectedMonth
    );

  const categoryListRange =
    ss.getRangeByName(
      config.namedRanges
        .categoryList
    );

  const monthListRange =
    ss.getRangeByName(
      config.namedRanges
        .monthList
    );

  const chartDataRange =
    ss.getRangeByName(
      config.namedRanges
        .chartData
    );

  const requiredRanges = {
    DASH_INCOME_CATEGORY:
      selectedCategoryRange,

    DASH_INCOME_MONTH:
      selectedMonthRange,

    DASH_INCOME_CATEGORY_LIST:
      categoryListRange,

    DASH_INCOME_MONTH_LIST:
      monthListRange,

    DASH_CHART_INCOME_DETAILS_DATA:
      chartDataRange
  };

  Object.keys(
    requiredRanges
  )
    .forEach(
      function(name) {
        if (!requiredRanges[name]) {
          throw new Error(
            'Named range "' +
            name +
            '" не знайдено. Запустіть ' +
            'dashboardIncomeDetailsBindExistingChart().'
          );
        }
      }
    );

  if (
    selectedCategoryRange
      .getSheet()
      .getSheetId() !==
      dashboardSheet.getSheetId() ||

    selectedMonthRange
      .getSheet()
      .getSheetId() !==
      dashboardSheet.getSheetId()
  ) {
    throw new Error(
      'Фільтри доходів повинні бути ' +
      'розташовані на листі "Дашборд".'
    );
  }

  if (
    dashboardIncomeDetailsRangesIntersect_(
      selectedCategoryRange,
      selectedMonthRange
    )
  ) {
    throw new Error(
      'Фільтр місяця і фільтр категорії ' +
      'використовують одну область.'
    );
  }

  const expectedChartDataRange =
    cacheSheet.getRange(
      config.cache
        .chartDataRangeA1
    );

  if (
    chartDataRange
      .getSheet()
      .getSheetId() !==
      expectedChartDataRange
        .getSheet()
        .getSheetId() ||

    chartDataRange.getA1Notation() !==
      expectedChartDataRange
        .getA1Notation()
  ) {
    throw new Error(
      config.namedRanges.chartData +
      ' має посилатися на ' +
      dashboardIncomeDetailsRangeRef_(
        expectedChartDataRange
      ) +
      '.'
    );
  }

  const managedChart =
    dashboardIncomeDetailsFindExistingChart_(
      dashboardSheet,
      chartDataRange
    );

  if (!managedChart) {
    throw new Error(
      'Існуючу діаграму доходів не знайдено ' +
      'за джерелом ' +
      dashboardIncomeDetailsRangeRef_(
        chartDataRange
      ) +
      '. Діаграма не створювалася і не змінювалася.'
    );
  }

  const headers =
    sourceSheet
      .getRange(
        config.headersRow,
        1,
        1,
        sourceSheet.getLastColumn()
      )
      .getValues()[0];

  dashboardIncomeDetailsResolveIndexes_(
    headers
  );

  return {
    ss:
      ss,

    sourceSheet:
      sourceSheet,

    dashboardSheet:
      dashboardSheet,

    cacheSheet:
      cacheSheet,

    selectedCategoryRange:
      selectedCategoryRange,

    selectedMonthRange:
      selectedMonthRange,

    categoryListRange:
      categoryListRange,

    monthListRange:
      monthListRange,

    chartDataRange:
      chartDataRange,

    managedChart:
      managedChart
  };
}


// ============================================
// 13. ПОШУК ІСНУЮЧОЇ ДІАГРАМИ
// ============================================

function dashboardIncomeDetailsFindExistingChart_(
  dashboardSheet,
  expectedRange
) {
  const properties =
    PropertiesService
      .getDocumentProperties();

  const storedId =
    properties.getProperty(
      DASHBOARD_INCOME_DETAILS_CONFIG
        .properties
        .chartId
    );

  if (storedId) {
    const byId =
      dashboardIncomeDetailsFindChartById_(
        dashboardSheet,
        storedId
      );

    if (
      byId &&
      dashboardIncomeDetailsChartUsesRange_(
        byId,
        expectedRange
      )
    ) {
      return byId;
    }
  }

  return dashboardIncomeDetailsFindChartByRange_(
    dashboardSheet,
    expectedRange
  );
}


function dashboardIncomeDetailsFindChartById_(
  sheet,
  chartId
) {
  return (
    sheet
      .getCharts()
      .find(function(chart) {
        return (
          String(
            chart.getChartId()
          ) ===
          String(
            chartId
          )
        );
      }) ||
    null
  );
}


function dashboardIncomeDetailsFindChartByRange_(
  sheet,
  expectedRange
) {
  const charts =
    sheet.getCharts();

  const zone =
    DASHBOARD_INCOME_DETAILS_CONFIG
      .chart
      .anchorZone;

  let firstRangeMatch =
    null;

  for (
    let index = 0;
    index < charts.length;
    index++
  ) {
    const chart =
      charts[index];

    if (
      !dashboardIncomeDetailsChartUsesRange_(
        chart,
        expectedRange
      )
    ) {
      continue;
    }

    if (!firstRangeMatch) {
      firstRangeMatch =
        chart;
    }

    const info =
      chart.getContainerInfo();

    const row =
      info.getAnchorRow();

    const column =
      info.getAnchorColumn();

    if (
      row >= zone.minRow &&
      row <= zone.maxRow &&
      column >= zone.minColumn &&
      column <= zone.maxColumn
    ) {
      return chart;
    }
  }

  return firstRangeMatch;
}


function dashboardIncomeDetailsChartUsesRange_(
  chart,
  expectedRange
) {
  return chart
    .getRanges()
    .some(
      function(range) {
        return (
          range
            .getSheet()
            .getSheetId() ===
            expectedRange
              .getSheet()
              .getSheetId() &&

          range.getA1Notation() ===
            expectedRange
              .getA1Notation()
        );
      }
    );
}


function dashboardIncomeDetailsGetChartIds_(
  sheet
) {
  return sheet
    .getCharts()

    .map(function(chart) {
      return String(
        chart.getChartId()
      );
    })

    .sort();
}


// ============================================
// 14. ПОШУК ЗЕЛЕНИХ КЛІТИНОК
// ============================================

function dashboardIncomeDetailsResolveTopFilterRange_(
  ss,
  dashboardSheet,
  namedRangeName,
  labelText,
  legacyCellA1,
  fallbackCellA1
) {
  /*
   * Використовуємо лише точну адресу:
   *
   * H66 — місяць;
   * H71 — категорія.
   *
   * Не шукаємо клітинку за написом
   * і не повертаємо старий named range.
   */
  const exactCell =
    dashboardSheet.getRange(
      fallbackCellA1
    );

  /*
   * Динамічний dropdown не повинен
   * міститися в об'єднаній клітинці.
   *
   * Це також захищає від ситуації,
   * коли два фільтри випадково отримують
   * один спільний merged range.
   */
  const mergedRanges =
    exactCell.getMergedRanges();

  if (mergedRanges.length) {
    throw new Error(
      'Клітинка ' +
      dashboardIncomeDetailsRangeRef_(
        exactCell
      ) +
      ' входить до об’єднаного діапазону ' +
      dashboardIncomeDetailsRangeRef_(
        mergedRanges[0]
      ) +
      '. Роз’єднайте цей діапазон перед ' +
      'підключенням dropdown-фільтра.'
    );
  }

  return exactCell;
}


function dashboardIncomeDetailsExpandMergedRange_(
  range
) {
  const mergedRanges =
    range.getMergedRanges();

  return mergedRanges.length
    ? mergedRanges[0]
    : range;
}


function dashboardIncomeDetailsRangeDistance_(
  firstRange,
  secondRange
) {
  return (
    Math.abs(
      firstRange.getRow() -
      secondRange.getRow()
    ) +

    Math.abs(
      firstRange.getColumn() -
      secondRange.getColumn()
    )
  );
}


function dashboardIncomeDetailsRangeContainsCell_(
  range,
  cell
) {
  if (
    range
      .getSheet()
      .getSheetId() !==
    cell
      .getSheet()
      .getSheetId()
  ) {
    return false;
  }

  return (
    cell.getRow() >=
      range.getRow() &&

    cell.getRow() <=
      range.getLastRow() &&

    cell.getColumn() >=
      range.getColumn() &&

    cell.getColumn() <=
      range.getLastColumn()
  );
}


// ============================================
// 15. SNAPSHOT / ВІДКАТ
// ============================================

function dashboardIncomeDetailsCreateBindingSnapshot_(
  ss,
  context
) {
  const config =
    DASHBOARD_INCOME_DETAILS_CONFIG;

  return {
    ss:
      ss,

    namedRanges: {
      selectedCategory:
        ss.getRangeByName(
          config.namedRanges
            .selectedCategory
        ),

      selectedMonth:
        ss.getRangeByName(
          config.namedRanges
            .selectedMonth
        ),

      categoryList:
        ss.getRangeByName(
          config.namedRanges
            .categoryList
        ),

      monthList:
        ss.getRangeByName(
          config.namedRanges
            .monthList
        ),

      chartData:
        ss.getRangeByName(
          config.namedRanges
            .chartData
        )
    },

    selectedCategory:
      dashboardIncomeDetailsSnapshotControl_(
        context.selectedCategoryRange
      ),

    selectedMonth:
      dashboardIncomeDetailsSnapshotControl_(
        context.selectedMonthRange
      ),

    categoryListRange:
      context.categoryListRange,

    categoryListValues:
      context.categoryListRange
        .getValues(),

    categoryListFormats:
      context.categoryListRange
        .getNumberFormats(),

    monthListRange:
      context.monthListRange,

    monthListValues:
      context.monthListRange
        .getValues(),

    monthListFormats:
      context.monthListRange
        .getNumberFormats(),

    chartDataRange:
      context.chartDataRange,

    chartDataValues:
      context.chartDataRange
        .getValues(),

    chartDataFormats:
      context.chartDataRange
        .getNumberFormats()
  };
}


function dashboardIncomeDetailsRestoreBindingSnapshot_(
  snapshot
) {
  const config =
    DASHBOARD_INCOME_DETAILS_CONFIG;

  dashboardIncomeDetailsRestoreNamedRange_(
    snapshot.ss,
    config.namedRanges
      .selectedCategory,
    snapshot.namedRanges
      .selectedCategory
  );

  dashboardIncomeDetailsRestoreNamedRange_(
    snapshot.ss,
    config.namedRanges
      .selectedMonth,
    snapshot.namedRanges
      .selectedMonth
  );

  dashboardIncomeDetailsRestoreNamedRange_(
    snapshot.ss,
    config.namedRanges
      .categoryList,
    snapshot.namedRanges
      .categoryList
  );

  dashboardIncomeDetailsRestoreNamedRange_(
    snapshot.ss,
    config.namedRanges
      .monthList,
    snapshot.namedRanges
      .monthList
  );

  dashboardIncomeDetailsRestoreNamedRange_(
    snapshot.ss,
    config.namedRanges
      .chartData,
    snapshot.namedRanges
      .chartData
  );

  dashboardIncomeDetailsRestoreControl_(
    snapshot.selectedCategory
  );

  dashboardIncomeDetailsRestoreControl_(
    snapshot.selectedMonth
  );

  snapshot.categoryListRange
    .setValues(
      snapshot.categoryListValues
    );

  snapshot.categoryListRange
    .setNumberFormats(
      snapshot.categoryListFormats
    );

  snapshot.monthListRange
    .setValues(
      snapshot.monthListValues
    );

  snapshot.monthListRange
    .setNumberFormats(
      snapshot.monthListFormats
    );

  snapshot.chartDataRange
    .setValues(
      snapshot.chartDataValues
    );

  snapshot.chartDataRange
    .setNumberFormats(
      snapshot.chartDataFormats
    );

  SpreadsheetApp.flush();
}


function dashboardIncomeDetailsSnapshotControl_(
  range
) {
  const control =
    dashboardIncomeDetailsControlCell_(
      range
    );

  return {
    range:
      range,

    value:
      control.getValue(),

    numberFormat:
      control.getNumberFormat(),

    validation:
      control.getDataValidation()
  };
}


function dashboardIncomeDetailsRestoreControl_(
  snapshot
) {
  const control =
    dashboardIncomeDetailsControlCell_(
      snapshot.range
    );

  control.setValue(
    snapshot.value
  );

  control.setNumberFormat(
    snapshot.numberFormat
  );

  if (
    snapshot.validation
  ) {
    snapshot.range
      .setDataValidation(
        snapshot.validation
      );

  } else {
    snapshot.range
      .clearDataValidations();
  }
}


function dashboardIncomeDetailsRestoreNamedRange_(
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


// ============================================
// 16. ПОШУК КОЛОНОК
// ============================================

function dashboardIncomeDetailsResolveIndexes_(
  headers
) {
  const map =
    Object.create(null);

  headers.forEach(
    function(
      header,
      index
    ) {
      map[
        dashboardIncomeDetailsNormalize_(
          header
        )
      ] = index;
    }
  );

  function requiredIndex(
    headerName
  ) {
    const index =
      map[
        dashboardIncomeDetailsNormalize_(
          headerName
        )
      ];

    if (
      index === undefined
    ) {
      throw new Error(
        'Не знайдено колонку "' +
        headerName +
        '" у листі "База операцій".'
      );
    }

    return index;
  }

  function optionalIndex(
    headerName
  ) {
    const index =
      map[
        dashboardIncomeDetailsNormalize_(
          headerName
        )
      ];

    return index === undefined
      ? -1
      : index;
  }

  return {
    date:
      requiredIndex(
        DASHBOARD_INCOME_DETAILS_CONFIG
          .dateHeader
      ),
   amount:
   optionalIndex('Сума'),
    type:
      requiredIndex(
        DASHBOARD_INCOME_DETAILS_CONFIG
          .headers
          .incomeExpenseType
      ),

    accountingType:
      optionalIndex(
        DASHBOARD_INCOME_DETAILS_CONFIG
          .headers
          .accountingType
      ),

    category:
      requiredIndex(
        DASHBOARD_INCOME_DETAILS_CONFIG
          .headers
          .category
      ),

    article:
      requiredIndex(
        DASHBOARD_INCOME_DETAILS_CONFIG
          .headers
          .article
      ),

    status:
      optionalIndex(
        DASHBOARD_INCOME_DETAILS_CONFIG
          .headers
          .status
      )
  };
}


// ============================================
// 17. ДОПОМІЖНІ ФУНКЦІЇ
// ============================================
function dashboardIncomeDetailsReadNumericValueV1_(
  value
) {
  if (typeof value === 'number') {
    return value;
  }

  const text =
    dashboardIncomeDetailsClean_(
      value
    )
      .replace(/\s/g, '')
      .replace(',', '.');

  const number =
    Number(text);

  return Number.isFinite(number)
    ? number
    : NaN;
}


function dashboardIncomeDetailsIsVaccineIncomeRowV1_(
  row,
  indexes
) {
  const mainType =
    dashboardIncomeDetailsNormalize_(
      row[indexes.type]
    );

  if (mainType !== 'вакцина') {
    return false;
  }

  const rawCategory =
    dashboardIncomeDetailsNormalize_(
      row[indexes.category]
    );

  const amount =
    indexes.amount >= 0
      ? dashboardIncomeDetailsReadNumericValueV1_(
          row[indexes.amount]
        )
      : NaN;

  return (
    amount > 0 &&
    (
      rawCategory ===
        'продаж і використання' ||
      rawCategory ===
        'продаж на зберігання'
    )
  );
}


function dashboardIncomeDetailsResolveDisplayCategoryV1_(
  row,
  indexes
) {
  if (
    dashboardIncomeDetailsIsVaccineIncomeRowV1_(
      row,
      indexes
    )
  ) {
    return 'Вакцини';
  }

  return dashboardIncomeDetailsClean_(
    row[indexes.category]
  );
}
function dashboardIncomeDetailsIsIncomeRow_(
  row,
  indexes
) {
  const mainType =
    dashboardIncomeDetailsNormalize_(
      row[indexes.type]
    );

  /*
   * Вакцинні рядки мають окремий тип.
   * Доходами є тільки позитивні продажі.
   * Від’ємні рядки — собівартість.
   */
  if (mainType === 'вакцина') {
    return dashboardIncomeDetailsIsVaccineIncomeRowV1_(
      row,
      indexes
    );
  }

  const accountingType =
    indexes.accountingType >= 0
      ? dashboardIncomeDetailsNormalize_(
          row[indexes.accountingType]
        )
      : '';

  return (
    mainType === 'доходи' ||
    mainType === 'дохід' ||
    accountingType === 'доходи' ||
    accountingType === 'дохід'
  );
}


function dashboardIncomeDetailsIsExcludedStatus_(
  value
) {
  const normalized =
    dashboardIncomeDetailsNormalize_(
      value
    );

  return (
    DASHBOARD_INCOME_DETAILS_CONFIG
      .excludedStatuses
      .indexOf(
        normalized
      ) !== -1
  );
}


function dashboardIncomeDetailsGetSelectedMonth_(
  range
) {
  const value =
    dashboardIncomeDetailsControlCell_(
      range
    ).getValue();

  return dashboardIncomeDetailsParseMonth_(
    value
  );
}


function dashboardIncomeDetailsParseMonth_(
  value
) {
  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      15
    );
  }

  const text =
    dashboardIncomeDetailsClean_(
      value
    ).toLowerCase();

  if (!text) {
    return null;
  }

  let match =
    text.match(
      /^(\d{1,2})\.(\d{4})$/
    );

  if (match) {
    return dashboardIncomeDetailsSafeMonth_(
      Number(
        match[2]
      ),

      Number(
        match[1]
      ) - 1
    );
  }

  match =
    text.match(
      /^(\d{4})-(\d{1,2})$/
    );

  if (match) {
    return dashboardIncomeDetailsSafeMonth_(
      Number(
        match[1]
      ),

      Number(
        match[2]
      ) - 1
    );
  }

  const monthAliases =
    dashboardIncomeDetailsMonthAliases_();

  match =
    text.match(
      /^([^\d]+?)\s+(\d{4})$/
    );

  if (match) {
    const monthName =
      dashboardIncomeDetailsNormalize_(
        match[1]
      );

    const monthIndex =
      monthAliases[
        monthName
      ];

    if (
      monthIndex !== undefined
    ) {
      return dashboardIncomeDetailsSafeMonth_(
        Number(
          match[2]
        ),

        monthIndex
      );
    }
  }

  const parsedDate =
    dashboardIncomeDetailsDateOnly_(
      value
    );

  if (!parsedDate) {
    return null;
  }

  return new Date(
    parsedDate.getFullYear(),
    parsedDate.getMonth(),
    15
  );
}


function dashboardIncomeDetailsSafeMonth_(
  year,
  monthIndex
) {
  if (
    !Number.isFinite(
      year
    ) ||

    !Number.isFinite(
      monthIndex
    ) ||

    monthIndex < 0 ||

    monthIndex > 11
  ) {
    return null;
  }

  const result =
    new Date(
      year,
      monthIndex,
      15
    );

  return (
    result.getFullYear() ===
      year &&

    result.getMonth() ===
      monthIndex
  )
    ? result
    : null;
}


function dashboardIncomeDetailsMonthAliases_() {
  return {
    'січень': 0,
    'січня': 0,

    'лютий': 1,
    'лютого': 1,

    'березень': 2,
    'березня': 2,

    'квітень': 3,
    'квітня': 3,

    'травень': 4,
    'травня': 4,

    'червень': 5,
    'червня': 5,

    'липень': 6,
    'липня': 6,

    'серпень': 7,
    'серпня': 7,

    'вересень': 8,
    'вересня': 8,

    'жовтень': 9,
    'жовтня': 9,

    'листопад': 10,
    'листопада': 10,

    'грудень': 11,
    'грудня': 11
  };
}


function dashboardIncomeDetailsFormatMonthText_(
  date
) {
  const monthNames = [
    'січень',
    'лютий',
    'березень',
    'квітень',
    'травень',
    'червень',
    'липень',
    'серпень',
    'вересень',
    'жовтень',
    'листопад',
    'грудень'
  ];

  if (
    !(date instanceof Date) ||
    isNaN(
      date.getTime()
    )
  ) {
    return '';
  }

  return (
    monthNames[
      date.getMonth()
    ] +
    ' ' +
    date.getFullYear()
  );
}


/*
 * Сумісне ім’я для старих викликів.
 */
function dashboardIncomeDetailsFormatMonth_(
  date
) {
  return dashboardIncomeDetailsFormatMonthText_(
    date
  );
}


function dashboardIncomeDetailsWriteList_(
  targetRange,
  values
) {
  targetRange.clearContent();

  if (!values.length) {
    return;
  }

  if (
    values.length >
    targetRange.getNumRows()
  ) {
    throw new Error(
      'Службовий список ' +
      dashboardIncomeDetailsRangeRef_(
        targetRange
      ) +
      ' замалий.'
    );
  }

  targetRange
    .offset(
      0,
      0,
      values.length,
      1
    )

    .setValues(
      values.map(
        function(value) {
          return [
            value
          ];
        }
      )
    );
}


function dashboardIncomeDetailsControlCell_(
  range
) {
  return range.getCell(
    1,
    1
  );
}


function dashboardIncomeDetailsReadText_(
  range
) {
  return dashboardIncomeDetailsClean_(
    dashboardIncomeDetailsControlCell_(
      range
    ).getDisplayValue()
  );
}


function dashboardIncomeDetailsSetControlValue_(
  range,
  value
) {
  dashboardIncomeDetailsControlCell_(
    range
  ).setValue(
    value
  );
}


function dashboardIncomeDetailsRangesIntersect_(
  firstRange,
  secondRange
) {
  if (
    firstRange
      .getSheet()
      .getSheetId() !==
    secondRange
      .getSheet()
      .getSheetId()
  ) {
    return false;
  }

  return !(
    firstRange.getLastRow() <
      secondRange.getRow() ||

    secondRange.getLastRow() <
      firstRange.getRow() ||

    firstRange.getLastColumn() <
      secondRange.getColumn() ||

    secondRange.getLastColumn() <
      firstRange.getColumn()
  );
}


function dashboardIncomeDetailsRequireSheet_(
  ss,
  sheetName
) {
  const sheet =
    ss.getSheetByName(
      sheetName
    );

  if (!sheet) {
    throw new Error(
      'Лист "' +
      sheetName +
      '" не знайдено.'
    );
  }

  return sheet;
}


function dashboardIncomeDetailsSetNamedRange_(
  ss,
  rangeName,
  range
) {
  ss.setNamedRange(
    rangeName,
    range
  );

  return range;
}


function dashboardIncomeDetailsDateOnly_(
  value
) {
  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );
  }

  if (
    typeof value ===
      'number' &&

    Number.isFinite(
      value
    )
  ) {
    const dateFromSerial =
      new Date(
        Math.round(
          (
            value -
            25569
          ) *
          86400 *
          1000
        )
      );

    if (
      !isNaN(
        dateFromSerial.getTime()
      )
    ) {
      return new Date(
        dateFromSerial.getFullYear(),
        dateFromSerial.getMonth(),
        dateFromSerial.getDate()
      );
    }
  }

  const text =
    dashboardIncomeDetailsClean_(
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
    return new Date(
      Number(
        match[3]
      ),

      Number(
        match[2]
      ) - 1,

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
    return new Date(
      Number(
        match[1]
      ),

      Number(
        match[2]
      ) - 1,

      Number(
        match[3]
      )
    );
  }

  const parsed =
    new Date(
      text
    );

  if (
    isNaN(
      parsed.getTime()
    )
  ) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate()
  );
}

function dashboardIncomeDetailsMonthKey_(
  date
) {
  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(
      2,
      '0'
    )
  ].join(
    '-'
  );
}


function dashboardIncomeDetailsClean_(
  value
) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  )
    .replace(
      /\u00A0/g,
      ' '
    )

    .trim()

    .replace(
      /\s+/g,
      ' '
    );
}


function dashboardIncomeDetailsNormalize_(
  value
) {
  return dashboardIncomeDetailsClean_(
    value
  ).toLowerCase();
}


function dashboardIncomeDetailsRangeRef_(
  range
) {
  return (
    range.getSheet().getName() +
    '!' +
    range.getA1Notation()
  );
}

function dashboardIncomeDetailsAuditDateLabels() {
  const context =
    dashboardIncomeDetailsAssertReady_();

  const values =
    context.chartDataRange
      .getDisplayValues();

  const datePattern =
    /(^|\s)\d{1,2}[.\/-]\d{1,2}[.\/-]\d{4}(\s|$)|(^|\s)\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}(\s|$)/;

  const labelsWithDates =
    [];

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const label =
      dashboardIncomeDetailsClean_(
        values[rowIndex][0]
      );

    if (!label) {
      continue;
    }

    if (
      datePattern.test(
        label
      )
    ) {
      labelsWithDates.push({
        cell:
          context.chartDataRange
            .getCell(
              rowIndex + 1,
              1
            )
            .getA1Notation(),

        label:
          label
      });
    }
  }

  const result = {
    ok:
      labelsWithDates.length === 0,

    selectedCategory:
      dashboardIncomeDetailsReadText_(
        context.selectedCategoryRange
      ),

    selectedMonth:
      dashboardIncomeDetailsReadText_(
        context.selectedMonthRange
      ),

    cacheRange:
      dashboardIncomeDetailsRangeRef_(
        context.chartDataRange
      ),

    labelsWithDates:
      labelsWithDates.length,

    offenders:
      labelsWithDates.slice(
        0,
        30
      ),

    chartObjectChanged:
      false,

    noCellsWritten:
      true
  };

  Logger.log(
    'dashboardIncomeDetailsAuditDateLabels: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
function dashboardIncomeDetailsAuditMonthCategoriesV1() {
  const context =
    dashboardIncomeDetailsAssertReady_();

  const selectedCategory =
    dashboardIncomeDetailsReadText_(
      context.selectedCategoryRange
    );

  const selectedMonth =
    dashboardIncomeDetailsGetSelectedMonth_(
      context.selectedMonthRange
    );

  if (!selectedMonth) {
    throw new Error(
      'Не вдалося визначити вибраний місяць.'
    );
  }

  const values =
    context.sourceSheet
      .getDataRange()
      .getValues();

  const headers =
    values[
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow - 1
    ];

  const indexes =
    dashboardIncomeDetailsResolveIndexes_(
      headers
    );

  const findHeaderIndex = function(
    headerName
  ) {
    const target =
      dashboardIncomeDetailsNormalize_(
        headerName
      );

    for (
      let index = 0;
      index < headers.length;
      index++
    ) {
      if (
        dashboardIncomeDetailsNormalize_(
          headers[index]
        ) === target
      ) {
        return index;
      }
    }

    return -1;
  };

  const paymentMonthIndex =
    findHeaderIndex('Місяць оплати');

  const accrualMonthIndex =
    findHeaderIndex('Місяць нарахування');

  const isSameMonth = function(
    date,
    month
  ) {
    return (
      date &&
      month &&
      date.getFullYear() ===
        month.getFullYear() &&
      date.getMonth() ===
        month.getMonth()
    );
  };

  const formatDate = function(
    date
  ) {
    return date
      ? Utilities.formatDate(
          date,
          Session.getScriptTimeZone(),
          'dd.MM.yyyy'
        )
      : '';
  };

  const selectedCategoryKey =
    dashboardIncomeDetailsNormalize_(
      selectedCategory
    );

  const categories = {};
  const selectedCategorySample = [];

  let incomeRowsInMonth = 0;
  let invalidDateRows = 0;
  let excludedStatusRows = 0;

  let selectedCategoryAllRows = 0;
  let selectedCategoryByDate = 0;
  let selectedCategoryByPaymentMonth = 0;
  let selectedCategoryByAccrualMonth = 0;

  for (
    let rowIndex =
      DASHBOARD_INCOME_DETAILS_CONFIG
        .headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {
    const row = values[rowIndex];

    if (
      !dashboardIncomeDetailsIsIncomeRow_(
        row,
        indexes
      )
    ) {
      continue;
    }

    if (
      indexes.status >= 0 &&
      dashboardIncomeDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      excludedStatusRows++;
      continue;
    }

    const rawCategory =
      dashboardIncomeDetailsClean_(
        row[indexes.category]
      ) || '(порожня категорія)';

    const rawArticle =
      dashboardIncomeDetailsClean_(
        row[indexes.article]
      ) || '(без статті)';

    const categoryKey =
      dashboardIncomeDetailsNormalize_(
        rawCategory
      );

    const transactionDate =
      dashboardIncomeDetailsDateOnly_(
        row[indexes.date]
      );

    const paymentMonth =
      paymentMonthIndex >= 0
        ? dashboardIncomeDetailsParseMonth_(
            row[paymentMonthIndex]
          )
        : null;

    const accrualMonth =
      accrualMonthIndex >= 0
        ? dashboardIncomeDetailsParseMonth_(
            row[accrualMonthIndex]
          )
        : null;

    const selectedCategoryMatch =
      categoryKey === selectedCategoryKey;

    if (selectedCategoryMatch) {
      selectedCategoryAllRows++;

      if (
        isSameMonth(
          transactionDate,
          selectedMonth
        )
      ) {
        selectedCategoryByDate++;
      }

      if (
        isSameMonth(
          paymentMonth,
          selectedMonth
        )
      ) {
        selectedCategoryByPaymentMonth++;
      }

      if (
        isSameMonth(
          accrualMonth,
          selectedMonth
        )
      ) {
        selectedCategoryByAccrualMonth++;
      }

      if (
        selectedCategorySample.length < 20
      ) {
        selectedCategorySample.push({
          sheetRow: rowIndex + 1,
          date: formatDate(transactionDate),
          category: rawCategory,
          article: rawArticle,
          paymentMonth:
            paymentMonth
              ? dashboardIncomeDetailsFormatMonthText_(
                  paymentMonth
                )
              : dashboardIncomeDetailsClean_(
                  paymentMonthIndex >= 0
                    ? row[paymentMonthIndex]
                    : ''
                ),
          accrualMonth:
            accrualMonth
              ? dashboardIncomeDetailsFormatMonthText_(
                  accrualMonth
                )
              : dashboardIncomeDetailsClean_(
                  accrualMonthIndex >= 0
                    ? row[accrualMonthIndex]
                    : ''
                )
        });
      }
    }

    if (
      !isSameMonth(
        transactionDate,
        selectedMonth
      )
    ) {
      continue;
    }

    incomeRowsInMonth++;

    if (!categories[categoryKey]) {
      categories[categoryKey] = {
        category: rawCategory,
        transactions: 0,
        articles: {}
      };
    }

    categories[categoryKey].transactions++;

    if (
      !categories[categoryKey]
        .articles[rawArticle]
    ) {
      categories[categoryKey]
        .articles[rawArticle] = 0;
    }

    categories[categoryKey]
      .articles[rawArticle]++;
  }

  const categoryBreakdown =
    Object.keys(categories)
      .map(function(key) {
        return {
          category:
            categories[key].category,

          transactions:
            categories[key].transactions,

          articles:
            Object.keys(
              categories[key].articles
            )
              .map(function(article) {
                return {
                  article: article,
                  transactions:
                    categories[key]
                      .articles[article]
                };
              })
              .sort(function(first, second) {
                return (
                  second.transactions -
                  first.transactions
                );
              })
        };
      })
      .sort(function(first, second) {
        return (
          second.transactions -
          first.transactions
        );
      });

  const result = {
    ok: true,
    test:
      'dashboardIncomeDetailsAuditMonthCategoriesV1',

    selectedCategory:
      selectedCategory,

    selectedMonth:
      dashboardIncomeDetailsFormatMonthText_(
        selectedMonth
      ),

    periodRuleUnderTest:
      'Дата транзакції',

    sourceRowsRead:
      values.length - 1,

    incomeRowsInSelectedMonth:
      incomeRowsInMonth,

    excludedStatusRows:
      excludedStatusRows,

    invalidDateRows:
      invalidDateRows,

    categoryBreakdown:
      categoryBreakdown,

    selectedCategoryComparison: {
      allRows:
        selectedCategoryAllRows,

      byTransactionDate:
        selectedCategoryByDate,

      byPaymentMonth:
        selectedCategoryByPaymentMonth,

      byAccrualMonth:
        selectedCategoryByAccrualMonth
    },

    selectedCategorySample:
      selectedCategorySample,

    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true
  };

  Logger.log(
    'dashboardIncomeDetailsAuditMonthCategoriesV1: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
function dashboardIncomeDetailsAuditVaccineSourceV1() {
  const context =
    dashboardIncomeDetailsAssertReady_();

  const selectedMonth =
    dashboardIncomeDetailsGetSelectedMonth_(
      context.selectedMonthRange
    );

  if (!selectedMonth) {
    throw new Error(
      'Не визначено вибраний місяць.'
    );
  }

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const candidateSheets = [
    'База операцій',
    'Нарахування',
    'Облік вакцин',
    'Дані дашборду',
    'Склад медичних запасів'
  ];

  const dateHeaders = [
    'Дата транзакції',
    'Місяць / дата нарахування',
    'Фактична дата',
    'Планова дата',
    'Дата використання',
    'Дата і час операції'
  ];

  const typeHeaders = [
    'Тип Доходи / Витрати',
    'Тип обліку',
    'Тип нарахування'
  ];

  const categoryHeaders = [
    'Категорія',
    'Тип нарахування',
    'Вакцина',
    'Назва вакцини',
    'Стаття'
  ];

  const amountHeaders = [
    'Сума',
    'Вартість',
    'Собівартість'
  ];

  const normalize =
    dashboardIncomeDetailsNormalize_;

  const clean =
    dashboardIncomeDetailsClean_;

  const findHeader = function(
    headers,
    variants
  ) {
    for (
      let index = 0;
      index < headers.length;
      index++
    ) {
      const current =
        normalize(headers[index]);

      if (
        variants.some(function(variant) {
          return (
            current ===
            normalize(variant)
          );
        })
      ) {
        return index;
      }
    }

    return -1;
  };

  const isSameMonth = function(
    value
  ) {
    const month =
      dashboardIncomeDetailsParseMonth_(
        value
      );

    return (
      month &&
      month.getFullYear() ===
        selectedMonth.getFullYear() &&
      month.getMonth() ===
        selectedMonth.getMonth()
    );
  };

  const toNumber = function(
    value
  ) {
    if (typeof value === 'number') {
      return value;
    }

    const text =
      String(value || '')
        .replace(/\s/g, '')
        .replace(',', '.');

    const number =
      Number(text);

    return Number.isFinite(number)
      ? number
      : null;
  };

  const reports = [];

  candidateSheets.forEach(
    function(sheetName) {
      const sheet =
        ss.getSheetByName(sheetName);

      if (!sheet) {
        return;
      }

      const values =
        sheet.getDataRange()
          .getValues();

      if (!values.length) {
        return;
      }

      const headers =
        values[0];

      const dateIndex =
        findHeader(
          headers,
          dateHeaders
        );

      const typeIndex =
        findHeader(
          headers,
          typeHeaders
        );

      const categoryIndex =
        findHeader(
          headers,
          categoryHeaders
        );

      const amountIndex =
        findHeader(
          headers,
          amountHeaders
        );

      let rowsInPeriod = 0;
      let vaccineRows = 0;
      let incomeRows = 0;
      let positiveAmountRows = 0;
      let negativeAmountRows = 0;

      const samples = [];

      for (
        let rowIndex = 1;
        rowIndex < values.length;
        rowIndex++
      ) {
        const row =
          values[rowIndex];

        let matchedDate = null;

        for (
          let columnIndex = 0;
          columnIndex < headers.length;
          columnIndex++
        ) {
          const header =
            normalize(headers[columnIndex]);

          const isDateColumn =
            dateHeaders.some(
              function(item) {
                return (
                  header ===
                  normalize(item)
                );
              }
            );

          if (!isDateColumn) {
            continue;
          }

          if (
            isSameMonth(
              row[columnIndex]
            )
          ) {
            matchedDate =
              row[columnIndex];

            break;
          }
        }

        if (!matchedDate) {
          continue;
        }

        rowsInPeriod++;

        const rowText =
          row.map(function(value) {
            return normalize(value);
          });

        const categoryText =
          categoryIndex >= 0
            ? normalize(
                row[categoryIndex]
              )
            : '';

        const vaccineSignal =
          sheetName ===
            'Облік вакцин' ||
          sheetName ===
            'Нарахування' ||
          categoryText === 'вакцини' ||
          rowText.some(function(value) {
            return value.indexOf(
              'вакцин'
            ) !== -1;
          });

        if (!vaccineSignal) {
          continue;
        }

        vaccineRows++;

        const typeText =
          typeIndex >= 0
            ? normalize(
                row[typeIndex]
              )
            : '';

        if (
          typeText === 'доходи' ||
          typeText === 'дохід'
        ) {
          incomeRows++;
        }

        const amount =
          amountIndex >= 0
            ? toNumber(
                row[amountIndex]
              )
            : null;

        if (amount !== null) {
          if (amount > 0) {
            positiveAmountRows++;
          }

          if (amount < 0) {
            negativeAmountRows++;
          }
        }

        if (samples.length < 15) {
          samples.push({
            sheetRow: rowIndex + 1,
            date: clean(matchedDate),
            type:
              typeIndex >= 0
                ? row[typeIndex]
                : '',
            category:
              categoryIndex >= 0
                ? row[categoryIndex]
                : '',
            amount: amount,
            rowPreview:
              row.slice(0, 12)
          });
        }
      }

      reports.push({
        sheet: sheetName,
        sourceRowsRead:
          Math.max(values.length - 1, 0),
        rowsInSelectedMonth:
          rowsInPeriod,
        vaccineRows:
          vaccineRows,
        incomeRows:
          incomeRows,
        positiveAmountRows:
          positiveAmountRows,
        negativeAmountRows:
          negativeAmountRows,
        samples:
          samples
      });
    }
  );

  const result = {
    ok: true,
    test:
      'dashboardIncomeDetailsAuditVaccineSourceV1',
    selectedMonth:
      dashboardIncomeDetailsFormatMonthText_(
        selectedMonth
      ),
    reports:
      reports,
    noCellsWritten: true,
    noSourceCellsWritten: true,
    noChartsModified: true
  };

  Logger.log(
    'dashboardIncomeDetailsAuditVaccineSourceV1: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}