/**
 * ============================================================
 * ProFin OS 2026
 * СЕКТОРНА ДІАГРАМА ВИТРАТ БЕЗ КЕШУ
 *
 * Джерело: "База операцій".
 * Фільтр категорії: Дашборд!F99.
 * Період: DASH_DATE_FROM / DASH_DATE_TO.
 *
 * Дані не записуються в "Дані дашборду".
 * Діаграма формується в пам'яті та вставляється як PNG.
 *
 * "Усі категорії":
 *   сектори = категорії витрат.
 *
 * Конкретна категорія:
 *   сектори = дати витрат цієї категорії.
 * ============================================================
 */

const DASHBOARD_EXPENSE_DETAILS_CONFIG = Object.freeze({
moduleVersion: 'EXPENSE_PIE_DIRECT_IMAGE_V10_FILTER_F99_LABELED_2026',
  sourceSheetName: 'База операцій',
  dashboardSheetName: 'Дашборд',
  headersRow: 1,

  headers: {
    date: 'Дата транзакції',
    amount: 'Сума',
    type: 'Тип Доходи / Витрати',
    accountingType: 'Тип обліку',
    category: 'Категорія',
    article: 'Стаття',
    status: 'Статус запису'
  },

  namedRanges: {
    selectedCategory: 'DASH_EXPENSE_CATEGORY',

    selectedCategoryAliases: [
      'DASH_EXPENSE_CATEGORY_FILTER',
      'DASH_EXF'
    ],

    periodFromCandidates: [
      'DASH_DATE_FROM',
      'DASH_PERIOD_FROM'
    ],

    periodToCandidates: [
      'DASH_DATE_TO',
      'DASH_PERIOD_TO'
    ]
  },

filter: {
  /*
   * Єдиний локальний фільтр
   * категорії PNG-діаграми витрат.
   */
  cell:
    'F99',

  /*
   * Текст-назва, який буде
   * видно безпосередньо
   * всередині dropdown.
   *
   * За логікою діаграми він означає
   * режим "показати всі категорії".
   */
  label:
    'Категорія витрат',

  allLabel:
    'Усі категорії'
},

  visual: {
  imageAltTitle:
    'PROFIN_EXPENSE_DETAILS_DIRECT_IMAGE',

  imageAltDescription:
    'Секторна діаграма витрат без кешу, сформована напряму з Бази операцій',

  /*
   * Фактична позиція правої
   * PNG-діаграми у книзі.
   */
  position: {
    row:
      100,

    column:
      6,

    offsetX:
      0,

    offsetY:
      0
  },

  width:
    700,

  height:
    360,

  /*
   * Права зона витрат.
   *
   * B98 — ліва секторна діаграма,
   * тому її ця зона не зачіпає.
   */
  embeddedChartZone: {
    minRow:
      99,

    maxRow:
      118,

    minColumn:
      5,

    maxColumn:
      8
  },

  legacyTitles: [
    'витрати за вибраним фільтром',
    'динаміка витрат',
    'частка витрат',
    'структура витрат'
  ]
},

  excludedStatuses: [
    'скасовано',
    'видалено',
    'помилка'
  ],

  trigger: {
    editHandler: 'dashboardExpenseDetailsInstalledOnEdit_'
  },

  properties: {
    imageVersion: 'PROFIN_EXPENSE_DIRECT_IMAGE_VERSION'
  },

  lockTimeoutMs: 20000
});


// ============================================================
// 1. ІНСТАЛЯЦІЯ
// ============================================================

function dashboardExpenseDetailsInstall() {

  const lock =
    LockService.getScriptLock();


  lock.waitLock(
    typeof DASHBOARD_FILTER_COORDINATOR_V8_CFG !==
      'undefined'
      ? DASHBOARD_FILTER_COORDINATOR_V8_CFG
          .lockTimeoutMs
      : 30000
  );


  try {

    const context =
      dashboardExpenseDetailsCreateOrRepairContext_();


    const categoriesResult =
      dashboardExpenseDetailsRefreshCategoryList_(
        context
      );


    /*
     * ВАЖЛИВО:
     *
     * НЕ:
     * - insertImage()
     * - removeChart()
     * - insertChart()
     * - newTrigger()
     *
     * Працюємо тільки з уже існуючою
     * native EmbeddedChart.
     */
    const refreshResult =
      dashboardExpenseDetailsRefreshChartData({
        lockHeld:
          true,

        source:
          'EXPENSE_NATIVE_INSTALL_SAFE'
      });


    const result = {

      ok:
        true,

      mode:
        'SAFE_NATIVE_EXISTING_CHART',

      moduleVersion:
        DASHBOARD_EXPENSE_DETAILS_CONFIG
          .moduleVersion,

      categories:
        categoriesResult.count,

      refresh:
        refreshResult,

      chartCreated:
        false,

      chartRemoved:
        false,

      pngGenerated:
        false,

      triggerInstalled:
        false,

      triggersModified:
        false,

      noSourceCellsWritten:
        true
    };


    Logger.log(
      'dashboardExpenseDetailsInstall: ' +
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


// ============================================================
// 2. ОНОВЛЕННЯ ДІАГРАМИ
// ============================================================

function dashboardExpenseDetailsRefreshChartData(
  options
) {

  const opts =
    options || {};


  /*
   * Global Apply / Clear уже володіє
   * shared ScriptLock.
   */
  if (
    opts.lockHeld === true
  ) {

    return dashboardExpenseDetailsRefreshChartDataUnlockedV8_(
      opts
    );
  }


  /*
   * Усі інші runtime-виклики
   * використовують ТОЙ САМИЙ mutex,
   * що й Global Filter.
   */
  const lock =
    LockService.getScriptLock();


  lock.waitLock(
    typeof DASHBOARD_FILTER_COORDINATOR_V8_CFG !==
      'undefined'
      ? DASHBOARD_FILTER_COORDINATOR_V8_CFG
          .lockTimeoutMs
      : 30000
  );


  try {

    return dashboardExpenseDetailsRefreshChartDataUnlockedV8_(
      opts
    );

  } finally {

    lock.releaseLock();
  }
}


function dashboardExpenseDetailsRefreshChartDataUnlockedV8_(
  options
) {

  const opts =
    options || {};


  const startedAt =
    Date.now();


  const context =
    dashboardExpenseDetailsAssertReady_();


  const selectedCategory =
    Object.prototype.hasOwnProperty.call(
      opts,
      'selectedCategory'
    )
      ? dashboardExpenseDetailsResolveSelectedCategory_(
          opts.selectedCategory
        )

      : dashboardExpenseDetailsResolveSelectedCategory_(
          context
            .selectedCategoryRange
            .getDisplayValue()
        );


  let period;


  if (opts.period) {

    const from =
      opts.period.from
        ? dashboardExpenseDetailsDateOnly_(
            opts.period.from
          )
        : null;


    const to =
      opts.period.to
        ? dashboardExpenseDetailsDateOnly_(
            opts.period.to
          )
        : null;


    if (
      from &&
      to &&
      from.getTime() >
        to.getTime()
    ) {

      throw new Error(
        'Expense V8: from > to.'
      );
    }


    period = {

      mode:
        opts.period.mode ||
        'RANGE',

      from:
        from,

      to:
        to,

      source:
        opts.source ||
        opts.period.source ||
        'EXPLICIT_FILTER_V8',

      globalRevision:
        Object.prototype.hasOwnProperty.call(
          opts,
          'globalRevision'
        )
          ? opts.globalRevision
          : (
              opts.period.globalRevision ||
              null
            )
    };

  } else {

    period =
      dashboardExpenseDetailsResolvePeriod_(
        context
      );
  }


  /*
   * НОВИЙ PRODUCTION RUNTIME:
   * БЕЗ PNG.
   */
  const prepared =
    dashboardExpenseDetailsPrepareNativeV8_(
      context,
      selectedCategory,
      period
    );


  const result =
    dashboardExpenseDetailsCommitPreparedNativeV8_(
      context,
      prepared
    );


  result.durationMs =
    Date.now() -
    startedAt;


  result.synchronization =
    'SCRIPT_MUTEX_V8';


  result.globalRevision =
    period.globalRevision;


  result.readsSourceDirectly =
    true;


  /*
   * Тепер використовується технічний source range
   * існуючої EmbeddedChart.
   */
  result.cacheUsed =
    true;


  result.noCacheCellsWritten =
    false;


  result.noSourceCellsWritten =
    true;


  result.pngGenerated =
    false;


  Logger.log(
    'dashboardExpenseDetailsRefreshChartData: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


// ============================================================
// 3. СУХИЙ ТЕСТ
// ============================================================

function dashboardExpenseDetailsDryRun() {

  const context =
    dashboardExpenseDetailsAssertReady_();


  const selectedCategory =
    dashboardExpenseDetailsResolveSelectedCategory_(
      context
        .selectedCategoryRange
        .getDisplayValue()
    );


  const period =
    dashboardExpenseDetailsResolvePeriod_(
      context
    );


  /*
   * Тестуємо ТОЙ САМИЙ dataset,
   * який використовує production.
   */
  const prepared =
    dashboardExpenseDetailsPrepareNativeV8_(
      context,
      selectedCategory,
      period
    );


  const dataset =
    prepared.dataset;


  const result = {

    ok:
      true,

    moduleVersion:
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .moduleVersion,

    plCoreVersion:
      prepared.plCoreVersion,

    selectedCategory:
      selectedCategory,

    mode:
      dataset.mode,

    period:
      dashboardExpenseDetailsPeriodResult_(
        period
      ),

    sectors:
      dataset.sectors,

    totalTransactions:
      dataset.totalTransactions,

    totalExpense:
      dataset.totalExpense,

    invalidAmountRows:
      dataset.invalidAmountRows,

    preview:
      dataset.items.slice(
        0,
        30
      ),

    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    chartObjectsChanged:
      false
  };


  Logger.log(
    'dashboardExpenseDetailsDryRun: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


// ============================================================
// 4. АУДИТ
// ============================================================

function dashboardExpenseDetailsAudit() {

  /*
   * ==========================================================
   * STEP 15
   * GLOBAL + LOCAL EXPENSE ACCEPTANCE
   *
   * READ ONLY.
   *
   * Перевіряє поточний стан після:
   *
   * 1. GLOBAL OFF + F99;
   * 2. GLOBAL ON  + F99;
   * 3. GLOBAL CLEAR зі збереженим F99.
   *
   * НІЧОГО НЕ:
   * - змінює F99;
   * - змінює Global Filter;
   * - записує у технічні діапазони;
   * - refresh-ить chart;
   * - створює / видаляє chart;
   * - створює / видаляє PNG;
   * - змінює triggers.
   * ==========================================================
   */

  const context =
    dashboardExpenseDetailsAssertReady_();


  /*
   * ----------------------------------------------------------
   * LOCAL FILTER F99
   * ----------------------------------------------------------
   */

  const selectedCategory =
    dashboardExpenseDetailsResolveSelectedCategory_(
      context
        .selectedCategoryRange
        .getDisplayValue()
    );


  /*
   * ----------------------------------------------------------
   * COMMITTED GLOBAL STATE
   * ----------------------------------------------------------
   */

  if (
    typeof dashboardFilterCoordinatorReadCommittedState_ !==
      'function'
  ) {
    throw new Error(
      'STEP 15: dashboardFilterCoordinatorReadCommittedState_ ' +
      'не знайдено.'
    );
  }

  const committedState =
    dashboardFilterCoordinatorReadCommittedState_();


  /*
   * Це саме той period,
   * який зараз бачить Expense production runtime.
   */

  const period =
    dashboardExpenseDetailsResolvePeriod_(
      context
    );


  /*
   * ----------------------------------------------------------
   * PRODUCTION NATIVE DATASET
   * ----------------------------------------------------------
   */

  const prepared =
    dashboardExpenseDetailsPrepareNativeV8_(
      context,
      selectedCategory,
      period
    );


  /*
   * ----------------------------------------------------------
   * RIGHT EXPENSE EMBEDDED CHART
   * ----------------------------------------------------------
   */

  const rightChart =
    dashboardExpenseDetailsFindRuntimeNativeChart_(
      context.dashboardSheet
    );

  const rightChartId =
    rightChart.getChartId();

  const rightRanges =
    rightChart.getRanges();

  const rightSourceRange =
    rightRanges.length === 1
      ? dashboardExpenseDetailsRangeRef_(
          rightRanges[0]
        )
      : null;


  /*
   * ЗАТВЕРДЖЕНИЙ project exception.
   *
   * НЕ переводимо на AC:AD.
   */

  const expectedRightSourceRange =
    'Дані дашборду!AP1:AQ100';


  /*
   * ЗАТВЕРДЖЕНИЙ project exception.
   *
   * Конкретна F99-категорія:
   * деталізація за статтями.
   */

  const expectedMode =
    selectedCategory ===
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .filter
        .allLabel
      ? 'CATEGORY_SECTORS'
      : 'SELECTED_CATEGORY_BY_ARTICLE';


  /*
   * ----------------------------------------------------------
   * LEFT EXPENSE STRUCTURE
   * ----------------------------------------------------------
   *
   * LEFT chart належить Global Filter.
   * F99 не повинна керувати ним.
   */

  const dataSheet =
    context.ss.getSheetByName(
      'Дані дашборду'
    );

  if (!dataSheet) {
    throw new Error(
      'STEP 15: лист "Дані дашборду" не знайдено.'
    );
  }


  let leftExpenseRangeA1 =
    'AA1:AB100';

  if (
    typeof DASHBOARD_GLOBAL_FILTER_CFG !==
      'undefined' &&

    DASHBOARD_GLOBAL_FILTER_CFG
      .technicalRanges &&

    DASHBOARD_GLOBAL_FILTER_CFG
      .technicalRanges
      .expenseStructure
  ) {
    leftExpenseRangeA1 =
      DASHBOARD_GLOBAL_FILTER_CFG
        .technicalRanges
        .expenseStructure;
  }


  const leftExpenseRange =
    dataSheet.getRange(
      leftExpenseRangeA1
    );

  const leftSourceRange =
    dashboardExpenseDetailsRangeRef_(
      leftExpenseRange
    );


  /*
   * Шукаємо chart, яка фактично читає
   * LEFT expense technical range.
   */

  const leftCharts =
    context.dashboardSheet
      .getCharts()
      .filter(function(chart) {

        return chart
          .getRanges()
          .some(function(range) {

            return (
              dashboardExpenseDetailsRangeRef_(
                range
              ) ===
              leftSourceRange
            );
          });
      });


  const leftChart =
    leftCharts.length === 1
      ? leftCharts[0]
      : null;

  const leftChartId =
    leftChart
      ? leftChart.getChartId()
      : null;


  /*
   * ----------------------------------------------------------
   * LEFT DATA CHECKSUM
   * ----------------------------------------------------------
   *
   * Потрібен для швидкого контролю:
   *
   * при зміні ТІЛЬКИ F99 під активним
   * Global Filter цей checksum
   * не повинен змінитися.
   */

  const leftPayload =
    JSON.stringify(
      leftExpenseRange.getDisplayValues()
    );

  const leftDigest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      leftPayload,
      Utilities.Charset.UTF_8
    );

  const leftChecksum =
    leftDigest
      .map(function(byte) {

        const normalized =
          byte < 0
            ? byte + 256
            : byte;

        return (
          '0' +
          normalized.toString(16)
        ).slice(-2);
      })
      .join('');


  /*
   * ----------------------------------------------------------
   * PERIOD ↔ COMMITTED STATE
   * ----------------------------------------------------------
   */

  const globalActive =
    committedState &&
    committedState.initialized === true &&
    committedState.active === true;


  const periodFromMs =
    period.from
      ? dashboardExpenseDetailsDateOnly_(
          period.from
        ).getTime()
      : null;

  const periodToMs =
    period.to
      ? dashboardExpenseDetailsDateOnly_(
          period.to
        ).getTime()
      : null;


  const committedFromMs =
    Number.isFinite(
      committedState.fromMs
    )
      ? dashboardExpenseDetailsDateOnly_(
          new Date(
            committedState.fromMs
          )
        ).getTime()
      : null;

  const committedToMs =
    Number.isFinite(
      committedState.toMs
    )
      ? dashboardExpenseDetailsDateOnly_(
          new Date(
            committedState.toMs
          )
        ).getTime()
      : null;


  const periodMatchesCommittedState =
    globalActive
      ? (
          period.source ===
            'COMMITTED_FILTER_V8' &&

          periodFromMs ===
            committedFromMs &&

          periodToMs ===
            committedToMs
        )

      : (
          period.source !==
            'COMMITTED_FILTER_V8'
        );


  /*
   * ----------------------------------------------------------
   * PNG COMPATIBILITY
   * ----------------------------------------------------------
   *
   * Старий PNG-код ЗБЕРІГАЄМО.
   * Він лише не є production runtime F99.
   */

  const pngCompatibilityAvailable =
    typeof dashboardExpenseDetailsBuildMemoryChart_ ===
      'function' &&

    typeof dashboardExpenseDetailsUpsertManagedImage_ ===
      'function' &&

    typeof dashboardExpenseDetailsForceClientRepaint_ ===
      'function';


  const managedExpenseImages =
    dashboardExpenseDetailsFindManagedImages_(
      context.dashboardSheet
    );


  const totalDashboardImages =
    context.dashboardSheet
      .getImages()
      .length;


  /*
   * ----------------------------------------------------------
   * CHECKS
   * ----------------------------------------------------------
   */

  const checks = {

    coordinatorInitialized:
      !!(
        committedState &&
        committedState.initialized === true
      ),

    periodMatchesCommittedState:
      periodMatchesCommittedState,

    rightChartFound:
      Number.isFinite(
        rightChartId
      ),

    rightChartHasOneRange:
      rightRanges.length === 1,

    rightSourcePreserved:
      rightSourceRange ===
        expectedRightSourceRange,

    rightModePreserved:
      prepared.dataset.mode ===
        expectedMode,

    leftChartFound:
      leftCharts.length === 1,

    leftAndRightAreDifferentCharts:
      !!(
        leftChart &&
        leftChartId !==
          rightChartId
      ),

    pngCompatibilityAvailable:
      pngCompatibilityAvailable
  };


  const failedChecks =
    Object.keys(
      checks
    )
      .filter(function(key) {
        return checks[key] !== true;
      });


  const result = {

    ok:
      failedChecks.length === 0,

    step:
      15,

    test:
      'GLOBAL_LOCAL_EXPENSE_ACCEPTANCE',

    state:
      globalActive
        ? 'GLOBAL_ON'
        : 'GLOBAL_OFF',

    checks:
      checks,

    failedChecks:
      failedChecks,


    /*
     * LOCAL
     */

    selectedCategory:
      selectedCategory,

    filterCell:
      dashboardExpenseDetailsRangeRef_(
        context.selectedCategoryRange
      ),


    /*
     * GLOBAL
     */

    committedState: {

      initialized:
        committedState.initialized,

      active:
        committedState.active,

      mode:
        committedState.mode,

      fromMs:
        committedState.fromMs,

      toMs:
        committedState.toMs,

      revision:
        committedState.revision
    },


    /*
     * PERIOD ACTUALLY USED BY EXPENSE
     */

    period:
      dashboardExpenseDetailsPeriodResult_(
        period
      ),

    periodMatchesCommittedState:
      periodMatchesCommittedState,


    /*
     * RIGHT
     */

    right: {

      renderer:
        'NATIVE_EMBEDDED_CHART',

      rendererImplementation:
        'EXISTING_EMBEDDED_CHART',

      chartId:
        rightChartId,

      sourceRange:
        rightSourceRange,

      expectedSourceRange:
        expectedRightSourceRange,

      mode:
        prepared.dataset.mode,

      expectedMode:
        expectedMode,

      sectors:
        prepared.dataset.sectors,

      totalTransactions:
        prepared.dataset.totalTransactions,

      totalExpense:
        prepared.dataset.totalExpense,

      invalidAmountRows:
        prepared.dataset.invalidAmountRows
    },


    /*
     * LEFT
     */

    left: {

      chartId:
        leftChartId,

      chartCount:
        leftCharts.length,

      sourceRange:
        leftSourceRange,

      checksum:
        leftChecksum
    },


    /*
     * PNG
     */

    png: {

      compatibilityAvailable:
        pngCompatibilityAvailable,

      managedExpenseImages:
        managedExpenseImages.length,

      totalDashboardImages:
        totalDashboardImages,

      generatedNow:
        false
    },


    /*
     * READ ONLY GUARANTEES
     */

    writesNow:
      false,

    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    noChartsModified:
      true,

    noImagesModified:
      true,

    noTriggersModified:
      true
  };


  Logger.log(
  'dashboardExpenseDetailsAudit STEP 15: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


// ============================================================
// 6. РОЗРАХУНОК ДАНИХ НАПРЯМУ З БАЗИ ОПЕРАЦІЙ
// ============================================================

 /**
 * ============================================================
 * STEP 11.1
 * CATEGORY MATCH — CURRENT + LEGACY DOCTOR COMPATIBILITY
 * ============================================================
 *
 * Сучасні записи:
 *
 *   Категорія = Лікарі
 *
 * Історичні doctor-specific записи:
 *
 *   Категорія = Персонал
 *   Стаття містить "лікар"
 *
 * ВАЖЛИВО:
 * - джерело НЕ переписуємо;
 * - весь "Персонал" у "Лікарі" НЕ переносимо;
 * - compatibility існує тільки в read-only dashboard layer.
 * ============================================================
 */
function dashboardExpenseDetailsCategoryMatchesV8_(
  rowCategory,
  article,
  selectedCategory
) {

  const selected =
    dashboardExpenseDetailsNormalize_(
      selectedCategory
    );


  const category =
    dashboardExpenseDetailsNormalize_(
      rowCategory
    );


  const normalizedArticle =
    dashboardExpenseDetailsNormalize_(
      article
    );


  /*
   * 1. Звичайний сучасний випадок.
   */
  if (
    category === selected
  ) {

    return true;
  }


  /*
   * 2. LEGACY DOCTOR PAYROLL.
   *
   * Тільки:
   *
   * Персонал
   *   └─ doctor-specific стаття
   *
   * НЕ весь "Персонал".
   */
  if (
    selected === 'лікарі' &&
    category === 'персонал' &&
    normalizedArticle.indexOf(
      'лікар'
    ) !== -1
  ) {

    return true;
  }


  return false;
}

/**
 * ============================================================
 * STEP 11.2
 * DOCTOR ROWS READ-ONLY AUDIT
 *
 * НІЧОГО НЕ ЗАПИСУЄ.
 *
 * Перевіряє ті самі рядки, які потрапляють у:
 *
 *   F99 = "Лікарі"
 *
 * через:
 *
 *   1. current:
 *      Категорія = Лікарі
 *
 *   2. legacy:
 *      Категорія = Персонал
 *      Стаття містить "лікар"
 *
 * Повертає:
 * - усі matched rows;
 * - current subtotal;
 * - legacy subtotal;
 * - окремо legacy rows;
 * - звірку з production Native V8 dataset.
 * ============================================================
 */
function dashboardExpenseDetailsDoctorRowsAuditV8() {

  const context =
    dashboardExpenseDetailsAssertReady_();


  const selectedCategory =
    'Лікарі';


  /*
   * Використовуємо ТОЙ САМИЙ committed period,
   * що й production Expense runtime.
   *
   * Global ON  -> committed V8 period.
   * Global OFF -> full expense history.
   */
  const period =
    dashboardExpenseDetailsResolvePeriod_(
      context
    );


  const values =
    context.sourceSheet
      .getDataRange()
      .getValues();


  const headers =
    values[
      DASHBOARD_EXPENSE_DETAILS_CONFIG.headersRow - 1
    ];


  const indexes =
    dashboardExpenseDetailsResolveIndexes_(
      headers
    );


  const rows =
    [];


  const legacyRows =
    [];


  let currentTransactions =
    0;


  let legacyTransactions =
    0;


  let currentExpense =
    0;


  let legacyExpense =
    0;


  let invalidAmountRows =
    0;


  for (
    let rowIndex =
      DASHBOARD_EXPENSE_DETAILS_CONFIG.headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {

    const row =
      values[rowIndex];


    /*
     * Тільки витрати.
     */
    if (
      !dashboardExpenseDetailsIsExpenseRow_(
        row,
        indexes
      )
    ) {

      continue;
    }


    /*
     * Виключені статуси.
     */
    if (
      indexes.status >= 0 &&
      dashboardExpenseDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {

      continue;
    }


    const transactionDate =
      dashboardExpenseDetailsDateOnly_(
        row[indexes.date]
      );


    if (!transactionDate) {

      continue;
    }


    /*
     * Той самий period filter,
     * що й production runtime.
     */
    if (
      period.from &&
      transactionDate.getTime() <
        period.from.getTime()
    ) {

      continue;
    }


    if (
      period.to &&
      transactionDate.getTime() >
        period.to.getTime()
    ) {

      continue;
    }


    const category =
      dashboardExpenseDetailsClean_(
        row[indexes.category]
      );


    if (!category) {

      continue;
    }


    const article =
      indexes.article >= 0
        ? dashboardExpenseDetailsClean_(
            row[indexes.article]
          )
        : '';


    /*
     * Використовуємо ТОЙ САМИЙ matcher,
     * що production Native V8.
     */
    if (
      !dashboardExpenseDetailsCategoryMatchesV8_(
        category,
        article,
        selectedCategory
      )
    ) {

      continue;
    }


    const rawAmount =
      dashboardExpenseDetailsNumber_(
        row[indexes.amount]
      );


    if (
      rawAmount === null ||
      !isFinite(rawAmount)
    ) {

      invalidAmountRows++;

      continue;
    }


    if (rawAmount === 0) {

      continue;
    }


    const normalizedCategory =
      dashboardExpenseDetailsNormalize_(
        category
      );


    const normalizedArticle =
      dashboardExpenseDetailsNormalize_(
        article
      );


    const isLegacy =
      normalizedCategory ===
        'персонал' &&

      normalizedArticle.indexOf(
        'лікар'
      ) !== -1;


    const expenseAmount =
      dashboardExpenseDetailsRound2_(
        Math.abs(
          rawAmount
        )
      );


    const item = {

      sourceRow:
        rowIndex + 1,

      date:
        dashboardExpenseDetailsFormatDate_(
          transactionDate
        ),

      matchType:
        isLegacy
          ? 'LEGACY_DOCTOR'
          : 'CURRENT_DOCTOR',

      category:
        category,

      article:
        article,

      rawAmount:
        rawAmount,

      expenseAmount:
        expenseAmount,

      status:
        indexes.status >= 0
          ? dashboardExpenseDetailsClean_(
              row[indexes.status]
            )
          : '',

      type:
        dashboardExpenseDetailsClean_(
          row[indexes.type]
        ),

      accountingType:
        indexes.accountingType >= 0
          ? dashboardExpenseDetailsClean_(
              row[indexes.accountingType]
            )
          : ''
    };


    rows.push(
      item
    );


    if (isLegacy) {

      legacyRows.push(
        item
      );


      legacyTransactions++;


      legacyExpense +=
        expenseAmount;

    } else {

      currentTransactions++;


      currentExpense +=
        expenseAmount;
    }
  }


  currentExpense =
    dashboardExpenseDetailsRound2_(
      currentExpense
    );


  legacyExpense =
    dashboardExpenseDetailsRound2_(
      legacyExpense
    );


  const totalExpense =
    dashboardExpenseDetailsRound2_(
      currentExpense +
      legacyExpense
    );


  /*
   * ==========================================================
   * CROSS-CHECK WITH PRODUCTION NATIVE DATASET
   * ==========================================================
   *
   * Нічого не commit-имо.
   *
   * PrepareNativeV8_ тільки читає Source
   * та будує dataset у пам'яті.
   */
  const prepared =
    dashboardExpenseDetailsPrepareNativeV8_(
      context,
      selectedCategory,
      period
    );


  const nativeTransactions =
    prepared.dataset.totalTransactions;


  const nativeExpense =
    dashboardExpenseDetailsRound2_(
      prepared.dataset.totalExpense
    );


  const transactionsMatch =
    rows.length ===
    nativeTransactions;


  const expenseMatch =
    totalExpense ===
    nativeExpense;


  const result = {

    ok:
      transactionsMatch &&
      expenseMatch &&
      invalidAmountRows === 0,

    mode:
      'STEP_11_2_DOCTOR_ROWS_READ_ONLY_AUDIT',

    selectedCategory:
      selectedCategory,

    period:
      dashboardExpenseDetailsPeriodResult_(
        period
      ),

    /*
     * Загальний результат.
     */
    matchedTransactions:
      rows.length,

    matchedExpense:
      totalExpense,

    /*
     * Сучасні записи.
     */
    currentTransactions:
      currentTransactions,

    currentExpense:
      currentExpense,

    /*
     * Legacy compatibility.
     */
    legacyTransactions:
      legacyTransactions,

    legacyExpense:
      legacyExpense,

    /*
     * Повний список 8 рядків.
     */
    rows:
      rows,

    /*
     * Окремо тільки legacy,
     * щоб одразу бачити 3 проблемні рядки.
     */
    legacyRows:
      legacyRows,

    /*
     * Production Native cross-check.
     */
    nativeTransactions:
      nativeTransactions,

    nativeExpense:
      nativeExpense,

    transactionsMatch:
      transactionsMatch,

    expenseMatch:
      expenseMatch,

    invalidAmountRows:
      invalidAmountRows,

    /*
     * Гарантії READ-ONLY.
     */
    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    noCacheCellsWritten:
      true,

    noChartsModified:
      true,

    noImagesModified:
      true,

    noTriggersModified:
      true
  };


  Logger.log(
    'dashboardExpenseDetailsDoctorRowsAuditV8: ' +
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
 * STEP 11.3
 * FINAL HISTORICAL DOCTOR EXPENSE TAXONOMY AUDIT
 *
 * READ ONLY.
 *
 * Мета:
 * побачити ВСІ фактичні статті витрат тільки для:
 *
 *   Категорія = Лікарі
 *   Категорія = Персонал
 *
 * по всій валідній історії "Бази операцій".
 *
 * НІЧОГО НЕ ЗМІНЮЄ:
 * - Source;
 * - F99;
 * - Global Filter;
 * - Coordinator;
 * - AP:AQ;
 * - EmbeddedChart;
 * - triggers.
 *
 * Результат:
 * Категорія + Стаття + кількість + сума
 * + чи входить група в "Лікарі" за ПОТОЧНИМ matcher.
 * ============================================================
 */
function dashboardExpenseDetailsDoctorTaxonomyAuditV8() {

  const context =
    dashboardExpenseDetailsAssertReady_();


  const values =
    context.sourceSheet
      .getDataRange()
      .getValues();


  const headers =
    values[
      DASHBOARD_EXPENSE_DETAILS_CONFIG.headersRow - 1
    ];


  const indexes =
    dashboardExpenseDetailsResolveIndexes_(
      headers
    );


  /*
   * ==========================================================
   * Аудитуємо тільки ці дві категорії.
   * ==========================================================
   */
  const CATEGORY_DOCTORS =
    'лікарі';


  const CATEGORY_PERSONNEL =
    'персонал';


  const groups =
    Object.create(null);


  let validExpenseRowsScanned =
    0;


  let targetCategoryRows =
    0;


  let invalidDateRows =
    0;


  let invalidAmountRows =
    0;


  let zeroAmountRows =
    0;


  /*
   * ==========================================================
   * FULL HISTORY.
   *
   * Навмисно НЕ використовуємо поточний Global Filter.
   *
   * Нам треба один раз встановити історичну таксономію
   * незалежно від того, який місяць зараз вибраний.
   * ==========================================================
   */
  for (
    let rowIndex =
      DASHBOARD_EXPENSE_DETAILS_CONFIG.headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {

    const row =
      values[rowIndex];


    /*
     * Тільки expense-контур.
     */
    if (
      !dashboardExpenseDetailsIsExpenseRow_(
        row,
        indexes
      )
    ) {

      continue;
    }


    /*
     * Скасовані / видалені / помилкові
     * записи не аналізуємо,
     * як і production runtime.
     */
    if (
      indexes.status >= 0 &&
      dashboardExpenseDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {

      continue;
    }


    validExpenseRowsScanned++;


    const category =
      dashboardExpenseDetailsClean_(
        row[indexes.category]
      );


    const categoryKey =
      dashboardExpenseDetailsNormalize_(
        category
      );


    if (
      categoryKey !== CATEGORY_DOCTORS &&
      categoryKey !== CATEGORY_PERSONNEL
    ) {

      continue;
    }


    targetCategoryRows++;


    /*
     * Production runtime потребує валідну дату.
     * Тому taxonomy будуємо по тих самих
     * фактично придатних операціях.
     */
    const transactionDate =
      dashboardExpenseDetailsDateOnly_(
        row[indexes.date]
      );


    if (!transactionDate) {

      invalidDateRows++;

      continue;
    }


    const articleRaw =
      indexes.article >= 0
        ? dashboardExpenseDetailsClean_(
            row[indexes.article]
          )
        : '';


    const article =
      articleRaw ||
      'Без статті';


    const articleKey =
      dashboardExpenseDetailsNormalize_(
        article
      );


    const rawAmount =
      dashboardExpenseDetailsNumber_(
        row[indexes.amount]
      );


    if (
      rawAmount === null ||
      !isFinite(
        rawAmount
      )
    ) {

      invalidAmountRows++;

      continue;
    }


    if (rawAmount === 0) {

      zeroAmountRows++;

      continue;
    }


    /*
     * Діаграма використовує абсолютну
     * величину expense.
     */
    const expenseAmount =
      dashboardExpenseDetailsRound2_(
        Math.abs(
          rawAmount
        )
      );


    const groupKey =
      categoryKey +
      '|' +
      articleKey;


    if (!groups[groupKey]) {

      groups[groupKey] = {

        category:
          category,

        categoryKey:
          categoryKey,

        article:
          article,

        articleKey:
          articleKey,

        transactions:
          0,

        totalExpense:
          0,

        firstDate:
          null,

        lastDate:
          null,

        sourceRows:
          []
      };
    }


    const group =
      groups[groupKey];


    group.transactions++;


    group.totalExpense +=
      expenseAmount;


    /*
     * Максимум 10 source-row IDs.
     *
     * Цього достатньо для ручної перевірки
     * і не роздуває Logger.
     */
    if (
      group.sourceRows.length < 10
    ) {

      group.sourceRows.push(
        rowIndex + 1
      );
    }


    if (
      !group.firstDate ||
      transactionDate.getTime() <
        group.firstDate.getTime()
    ) {

      group.firstDate =
        transactionDate;
    }


    if (
      !group.lastDate ||
      transactionDate.getTime() >
        group.lastDate.getTime()
    ) {

      group.lastDate =
        transactionDate;
    }
  }


  /*
   * ==========================================================
   * GROUP RESULT
   * ==========================================================
   */
  const taxonomy =
    Object.keys(
      groups
    )
      .map(
        function(key) {

          const group =
            groups[key];


          group.totalExpense =
            dashboardExpenseDetailsRound2_(
              group.totalExpense
            );


          /*
           * Перевіряємо саме ПОТОЧНЕ
           * production-правило.
           */
          const currentlyIncluded =
            dashboardExpenseDetailsCategoryMatchesV8_(
              group.category,
              group.article,
              'Лікарі'
            );


          let classification;


          if (
            group.categoryKey ===
              CATEGORY_DOCTORS
          ) {

            classification =
              'CURRENT_DOCTOR';

          } else if (
            currentlyIncluded
          ) {

            classification =
              'LEGACY_CURRENT_MATCHER';

          } else {

            classification =
              'PERSONNEL_NOT_INCLUDED';
          }


          /*
           * ====================================================
           * REVIEW SIGNALS
           *
           * Це НЕ business-rule.
           *
           * Лише підказки, які групи
           * варто переглянути перед whitelist.
           * ====================================================
           */
          const signals =
            [];


          const signalMap = [
            {
              needle:
                'лікар',

              label:
                'contains:лікар'
            },
            {
              needle:
                'доктор',

              label:
                'contains:доктор'
            },
            {
              needle:
                'медперсон',

              label:
                'contains:медперсон'
            },
            {
              needle:
                'зарплат',

              label:
                'contains:зарплат'
            },
            {
              needle:
                'бонус',

              label:
                'contains:бонус'
            },
            {
              needle:
                'подат',

              label:
                'contains:подат'
            },
            {
              needle:
                'консультац',

              label:
                'contains:консультац'
            },
            {
              needle:
                'оплат',

              label:
                'contains:оплат'
            }
          ];


          signalMap.forEach(
            function(signal) {

              if (
                group.articleKey.indexOf(
                  signal.needle
                ) !== -1
              ) {

                signals.push(
                  signal.label
                );
              }
            }
          );


          return {

            classification:
              classification,

            category:
              group.category,

            article:
              group.article,

            transactions:
              group.transactions,

            totalExpense:
              group.totalExpense,

            firstDate:
              group.firstDate
                ? dashboardExpenseDetailsFormatDate_(
                    group.firstDate
                  )
                : null,

            lastDate:
              group.lastDate
                ? dashboardExpenseDetailsFormatDate_(
                    group.lastDate
                  )
                : null,

            currentlyIncludedInDoctors:
              currentlyIncluded,

            reviewSignals:
              signals,

            sourceRowsSample:
              group.sourceRows
          };
        }
      )
      .sort(
        function(first, second) {

          /*
           * Спочатку Лікарі,
           * потім Персонал.
           */
          const firstCategoryOrder =
            dashboardExpenseDetailsNormalize_(
              first.category
            ) === CATEGORY_DOCTORS
              ? 0
              : 1;


          const secondCategoryOrder =
            dashboardExpenseDetailsNormalize_(
              second.category
            ) === CATEGORY_DOCTORS
              ? 0
              : 1;


          if (
            firstCategoryOrder !==
            secondCategoryOrder
          ) {

            return (
              firstCategoryOrder -
              secondCategoryOrder
            );
          }


          /*
           * Усередині категорії —
           * найбільші суми першими.
           */
          if (
            second.totalExpense !==
            first.totalExpense
          ) {

            return (
              second.totalExpense -
              first.totalExpense
            );
          }


          return first.article.localeCompare(
            second.article,
            'uk'
          );
        }
      );


  /*
   * ==========================================================
   * CONTROL TOTALS
   * ==========================================================
   */
  const currentDoctorGroups =
    taxonomy.filter(
      function(item) {

        return (
          item.classification ===
            'CURRENT_DOCTOR'
        );
      }
    );


  const legacyIncludedGroups =
    taxonomy.filter(
      function(item) {

        return (
          item.classification ===
            'LEGACY_CURRENT_MATCHER'
        );
      }
    );


  const personnelNotIncludedGroups =
    taxonomy.filter(
      function(item) {

        return (
          item.classification ===
            'PERSONNEL_NOT_INCLUDED'
        );
      }
    );


  function summarize(
    items
  ) {

    return {

      groups:
        items.length,

      transactions:
        items.reduce(
          function(sum, item) {

            return (
              sum +
              item.transactions
            );
          },
          0
        ),

      totalExpense:
        dashboardExpenseDetailsRound2_(
          items.reduce(
            function(sum, item) {

              return (
                sum +
                item.totalExpense
              );
            },
            0
          )
        )
    };
  }


  const currentDoctorSummary =
    summarize(
      currentDoctorGroups
    );


  const legacyIncludedSummary =
    summarize(
      legacyIncludedGroups
    );


  const personnelNotIncludedSummary =
    summarize(
      personnelNotIncludedGroups
    );


  const currentMatcherTotal = {

    groups:
      currentDoctorSummary.groups +
      legacyIncludedSummary.groups,

    transactions:
      currentDoctorSummary.transactions +
      legacyIncludedSummary.transactions,

    totalExpense:
      dashboardExpenseDetailsRound2_(
        currentDoctorSummary.totalExpense +
        legacyIncludedSummary.totalExpense
      )
  };


  const result = {

    ok:
      invalidDateRows === 0 &&
      invalidAmountRows === 0,

    mode:
      'STEP_11_3_FINAL_DOCTOR_EXPENSE_TAXONOMY',

    scope:
      'FULL_VALID_EXPENSE_HISTORY',

    sourceSheet:
      context.sourceSheet.getName(),

    auditedCategories: [
      'Лікарі',
      'Персонал'
    ],

    validExpenseRowsScanned:
      validExpenseRowsScanned,

    targetCategoryRows:
      targetCategoryRows,

    /*
     * Повна компактна taxonomy.
     */
    taxonomy:
      taxonomy,

    /*
     * Категорія вже сучасна.
     */
    currentDoctorSummary:
      currentDoctorSummary,

    /*
     * Персонал, який СЬОГОДНІ
     * підхоплюється через
     * article contains "лікар".
     */
    legacyIncludedSummary:
      legacyIncludedSummary,

    /*
     * Персонал, який сьогодні
     * НЕ входить у F99 = Лікарі.
     *
     * Саме цей блок нам треба
     * переглянути перед whitelist.
     */
    personnelNotIncludedSummary:
      personnelNotIncludedSummary,

    /*
     * Контроль того, що зараз
     * реально потрапляє у F99 = Лікарі.
     */
    currentMatcherTotal:
      currentMatcherTotal,

    invalidDateRows:
      invalidDateRows,

    invalidAmountRows:
      invalidAmountRows,

    zeroAmountRows:
      zeroAmountRows,

    /*
     * READ ONLY guarantees.
     */
    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    noCacheCellsWritten:
      true,

    noChartsModified:
      true,

    noImagesModified:
      true,

    noTriggersModified:
      true
  };


  Logger.log(
    'dashboardExpenseDetailsDoctorTaxonomyAuditV8: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}

function dashboardExpenseDetailsBuildDataset_(
  sourceSheet,
  selectedCategory,
  period
) {
  const values =
    sourceSheet
      .getDataRange()
      .getValues();

  const headers =
    values[
      DASHBOARD_EXPENSE_DETAILS_CONFIG.headersRow - 1
    ];

  const indexes =
    dashboardExpenseDetailsResolveIndexes_(
      headers
    );

  const allSelected =
    selectedCategory ===
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .filter
      .allLabel;

  const selectedCategoryKey =
    dashboardExpenseDetailsNormalize_(
      selectedCategory
    );

  const grouped =
    Object.create(null);
const articleMap =
  dashboardExpenseDetailsBuildArticleMapV1_();
  let totalTransactions = 0;
  let invalidAmountRows = 0;

  for (
    let rowIndex =
      DASHBOARD_EXPENSE_DETAILS_CONFIG.headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {
    const row =
      values[rowIndex];

    if (
      !dashboardExpenseDetailsIsExpenseRow_(
        row,
        indexes
      )
    ) {
      continue;
    }

    if (
      indexes.status >= 0 &&
      dashboardExpenseDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      continue;
    }

    const transactionDate =
      dashboardExpenseDetailsDateOnly_(
        row[indexes.date]
      );

    if (!transactionDate) {
      continue;
    }

    if (
      period.from &&
      transactionDate.getTime() <
        period.from.getTime()
    ) {
      continue;
    }

    if (
      period.to &&
      transactionDate.getTime() >
        period.to.getTime()
    ) {
      continue;
    }

    const category =
      dashboardExpenseDetailsClean_(
        row[indexes.category]
      );

    if (!category) {
      continue;
    }

    const categoryKey =
  dashboardExpenseDetailsNormalize_(
    category
  );


const article =
  indexes.article >= 0
    ? dashboardExpenseDetailsClean_(
        row[indexes.article]
      )
    : '';


/*
 * STEP 11.1
 *
 * Сучасна категорія:
 *   Лікарі
 *
 * +
 *
 * вузька historical compatibility:
 *   Персонал + doctor-specific стаття.
 */
if (
  !allSelected &&
  !dashboardExpenseDetailsCategoryMatchesV8_(
    category,
    article,
    selectedCategory
  )
) {

  continue;
}

    const rawAmount =
      dashboardExpenseDetailsNumber_(
        row[indexes.amount]
      );

    if (
      rawAmount === null ||
      !isFinite(rawAmount)
    ) {
      invalidAmountRows++;
      continue;
    }

    if (rawAmount === 0) {
      continue;
    }

    const amount =
      Math.abs(rawAmount);

    /*
     * Для "Усі категорії":
     * групуємо за категорією, як і раніше.
     *
     * Для конкретної категорії:
     * групуємо всі її операції за місяцем.
     */
    const monthKey =
      dashboardExpenseDetailsMonthKey_(
        transactionDate
      );

    const groupingKey =
      allSelected
        ? 'CATEGORY|' + categoryKey
        : 'MONTH|' + monthKey;

    if (!grouped[groupingKey]) {
      grouped[groupingKey] = {
        category:
          category,

        month:
          allSelected
            ? null
            : dashboardExpenseDetailsMonthStart_(
                transactionDate
              ),

        amount:
          0,

        transactions:
          0
      };
    }

    grouped[groupingKey].amount +=
      amount;

    grouped[groupingKey].transactions++;

    totalTransactions++;
  }

  const items =
    Object.keys(grouped)
      .map(function(key) {
        const item =
          grouped[key];

        item.amount =
          dashboardExpenseDetailsRound2_(
            item.amount
          );

        return item;
      })
      .filter(function(item) {
        return item.amount > 0;
      });

  /*
   * Усі категорії сортуються за сумою.
   * Місяці сортуються хронологічно.
   */
  items.sort(
    allSelected
      ? function(first, second) {
          return (
            second.amount -
              first.amount ||

            first.category.localeCompare(
              second.category,
              'uk'
            )
          );
        }

      : function(first, second) {
          return (
            first.month.getTime() -
            second.month.getTime()
          );
        }
  );

  const totalExpense =
    dashboardExpenseDetailsRound2_(
      items.reduce(
        function(sum, item) {
          return sum + item.amount;
        },
        0
      )
    );

  const resultItems =
    items.map(function(item) {
      const share =
        totalExpense > 0
          ? item.amount / totalExpense
          : 0;

      return {
        category:
          item.category,

        /*
         * Поле date залишене для сумісності,
         * але конкретні дати більше
         * не використовуються.
         */
        date:
          null,

        month:
          item.month
            ? dashboardExpenseDetailsFormatMonth_(
                item.month
              )
            : null,

        amount:
          item.amount,

        share:
          dashboardExpenseDetailsRound4_(
            share
          ),

        shareText:
          dashboardExpenseDetailsFormatPercent_(
            share
          ),

        transactions:
          item.transactions
      };
    });

  return {
    mode:
      allSelected
        ? 'CATEGORY_SECTORS'
        : 'SELECTED_CATEGORY_BY_MONTH',

    items:
      resultItems,

    sectors:
      resultItems.length,

    totalTransactions:
      totalTransactions,

    totalExpense:
      totalExpense,

    invalidAmountRows:
      invalidAmountRows,

    empty:
      resultItems.length === 0
  };
}

// ============================================================
// NATIVE V8 RUNTIME
//
// NORMAL PRODUCTION PATH:
//   Source → dataset → existing chart source range
//          → existing EmbeddedChart
//
// PNG тут НЕ створюється.
// ============================================================

function dashboardExpenseDetailsPrepareNativeV8_(
  context,
  selectedCategory,
  period
) {

  /*
   * ==========================================================
   * ЄДИНЕ P&L CORE
   * ==========================================================
   */

  const model =
    proFinPlCoreCalculate_(
      period
    );


  const allSelected =
    selectedCategory ===
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .filter
      .allLabel;


  const selectedCategoryKey =
    dashboardExpenseDetailsNormalize_(
      selectedCategory
    );


  let sourceItems;


  /*
   * ==========================================================
   * F99 = "Усі категорії"
   *
   * сектор = категорія витрат
   * ==========================================================
   */

  if (
    allSelected
  ) {

    sourceItems =
      model.expense.categories
        .map(
          function(item) {

            return {

              label:
                item.category,

              category:
                item.category,

              article:
                null,

              amount:
                item.amount,

              transactions:
                item.transactions
            };
          }
        );

  } else {

    /*
     * ========================================================
     * F99 = конкретна категорія
     *
     * сектор = стаття цієї категорії
     * ========================================================
     */

 sourceItems =
  dashboardExpenseDetailsBuildMappedOperationsArticlesV1_(
    context.sourceSheet,
    selectedCategory,
    period,
    model
  );
  }



  sourceItems.sort(
    function(
      first,
      second
    ) {

      if (
        second.amount !==
        first.amount
      ) {

        return (
          second.amount -
          first.amount
        );
      }


      return first.label
        .localeCompare(
          second.label,
          'uk'
        );
    }
  );


  const totalExpense =
    dashboardExpenseDetailsRound2_(
      sourceItems.reduce(
        function(
          sum,
          item
        ) {

          return (
            sum +
            item.amount
          );
        },
        0
      )
    );


  const totalTransactions =
    sourceItems.reduce(
      function(
        sum,
        item
      ) {

        return (
          sum +
          item.transactions
        );
      },
      0
    );


  const resultItems =
    sourceItems.map(
      function(item) {

        const amount =
          dashboardExpenseDetailsRound2_(
            item.amount
          );


        const share =
          totalExpense > 0
            ? amount /
              totalExpense
            : 0;


        return {

          label:
            item.label,

          category:
            item.category,

          article:
            item.article,

          date:
            null,

          month:
            null,

          amount:
            amount,

          share:
            dashboardExpenseDetailsRound4_(
              share
            ),

          shareText:
            dashboardExpenseDetailsFormatPercent_(
              share
            ),

          transactions:
            item.transactions
        };
      }
    );


  return {

    selectedCategory:
      selectedCategory,

    period:
      period,

    dataset: {

      mode:
        allSelected
          ? 'CATEGORY_SECTORS'
          : 'SELECTED_CATEGORY_BY_ARTICLE',

      items:
        resultItems,

      sectors:
        resultItems.length,

      totalTransactions:
        totalTransactions,

      totalExpense:
        totalExpense,

      invalidAmountRows:
        model.stats
          .invalidExpenseAmountRows,

      empty:
        resultItems.length ===
        0
    },

    plCoreVersion:
      model.version
  };
}


function dashboardExpenseDetailsFindRuntimeNativeChart_(
  dashboardSheet
) {

  const charts =
    dashboardSheet.getCharts();


  const preferred = [];


  charts.forEach(
    function(chart) {

      const ranges =
        chart.getRanges();


      if (
        ranges.length !== 1 ||
        ranges[0].getNumColumns() !== 2
      ) {

        return;
      }


      const title =
        dashboardExpenseDetailsNormalize_(
          chart
            .getOptions()
            .get(
              'title'
            )
        );


      if (
        title.indexOf(
          'деталізація видатків'
        ) === 0 ||
        title.indexOf(
          'деталізація витрат'
        ) === 0
      ) {

        preferred.push(
          chart
        );
      }
    }
  );


  if (
    preferred.length === 1
  ) {

    return preferred[0];
  }


  if (
    preferred.length > 1
  ) {

    throw new Error(
      'Native Expense V8: знайдено більше однієї ' +
      'EmbeddedChart "Деталізація видатків".'
    );
  }


  /*
   * Fallback:
   * шукаємо єдину 2-column chart
   * у правій expense-зоні.
   */
  const zone =
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .visual
      .embeddedChartZone;


  const candidates =
    charts.filter(
      function(chart) {

        const ranges =
          chart.getRanges();


        if (
          ranges.length !== 1 ||
          ranges[0].getNumColumns() !== 2
        ) {

          return false;
        }


        const info =
          chart.getContainerInfo();


        const row =
          info.getAnchorRow();


        const column =
          info.getAnchorColumn();


        return (
          row >= zone.minRow &&
          row <= zone.maxRow &&
          column >= zone.minColumn &&
          column <= zone.maxColumn
        );
      }
    );


  if (
    candidates.length !== 1
  ) {

    throw new Error(
      'Native Expense V8: не вдалося однозначно ' +
      'знайти існуючу праву EmbeddedChart. ' +
      'Candidates=' +
      candidates.length +
      '. PNG fallback заборонений.'
    );
  }


  return candidates[0];
}


function dashboardExpenseDetailsRemoveManagedPngsAfterNativeCommit_(
  dashboardSheet
) {

  const images =
    dashboardExpenseDetailsFindManagedImages_(
      dashboardSheet
    );


  let removed = 0;

  const errors = [];


  images.forEach(
    function(image) {

      try {

        image.remove();

        removed++;

      } catch (error) {

        errors.push(
          error.message
        );
      }
    }
  );


  if (removed) {

    SpreadsheetApp.flush();
  }


  return {

    found:
      images.length,

    removed:
      removed,

    errors:
      errors
  };
}


function dashboardExpenseDetailsCommitPreparedNativeV8_(
  context,
  prepared
) {

  const dashboardSheet =
    context.dashboardSheet;


  /*
   * ВАЖЛИВО:
   * chart уже існує.
   *
   * Ми НЕ:
   * - newChart()
   * - insertChart()
   * - removeChart()
   * - clearRanges()
   * - addRange()
   * - insertImage()
   */
  const chart =
    dashboardExpenseDetailsFindRuntimeNativeChart_(
      dashboardSheet
    );


  const chartIdBefore =
    chart.getChartId();


  const ranges =
    chart.getRanges();


  if (
    ranges.length !== 1
  ) {

    throw new Error(
      'Native Expense V8: EmbeddedChart повинна ' +
      'мати рівно один source range.'
    );
  }


  const targetRange =
    ranges[0];


  if (
    targetRange.getNumColumns() !== 2
  ) {

    throw new Error(
      'Native Expense V8: source range ' +
      'повинен мати рівно 2 колонки.'
    );
  }


  const capacity =
    targetRange.getNumRows() - 1;


  if (
    prepared.dataset.items.length >
    capacity
  ) {

    throw new Error(
      'Native Expense V8: недостатньо рядків ' +
      'у технічному source range. ' +
      'Потрібно=' +
      prepared.dataset.items.length +
      ', доступно=' +
      capacity +
      '.'
    );
  }


  /*
   * ==========================================================
   * PRIMARY COMMIT SNAPSHOT
   * ==========================================================
   */
  const snapshot = {

    values:
      targetRange.getValues(),

    numberFormats:
      targetRange.getNumberFormats()
  };


  const output =
    Array.from(
      {
        length:
          targetRange.getNumRows()
      },
      function() {

        return [
          '',
          ''
        ];
      }
    );


  output[0][0] =
    'Деталь витрат';


  output[0][1] =
    'Сума, грн';


  prepared.dataset.items.forEach(
    function(item, index) {

      output[
        index + 1
      ][0] =
        item.label +
        ' — ' +
        dashboardExpenseDetailsFormatMoney_(
          item.amount
        );


      output[
        index + 1
      ][1] =
        item.amount;
    }
  );


  const placeholderUsed =
    prepared.dataset.empty;


  if (placeholderUsed) {

    output[1][0] =
      'Немає витрат за період — ' +
      prepared.selectedCategory;


    /*
     * Тільки renderer placeholder.
     * У business total не входить.
     */
    output[1][1] =
      1;
  }


  /*
   * ==========================================================
   * PRIMARY DATA COMMIT
   * ==========================================================
   */
  try {

    targetRange.setValues(
      output
    );


    if (
      targetRange.getNumRows() > 1
    ) {

      targetRange
        .offset(
          1,
          1,
          targetRange.getNumRows() - 1,
          1
        )
        .setNumberFormat(
          '#,##0.00 "грн"'
        );
    }


    SpreadsheetApp.flush();


    /*
     * VERIFY
     */
    const actual =
      targetRange.getValues();


    if (
      String(
        actual[0][0] || ''
      ).trim() !==
        'Деталь витрат' ||

      String(
        actual[0][1] || ''
      ).trim() !==
        'Сума, грн'
    ) {

      throw new Error(
        'Native Expense V8: header verification failed.'
      );
    }


    let actualTotal =
      0;


    if (!placeholderUsed) {

      for (
        let rowIndex = 1;
        rowIndex < actual.length;
        rowIndex++
      ) {

        const value =
          actual[rowIndex][1];


        if (
          typeof value ===
            'number' &&
          Number.isFinite(
            value
          )
        ) {

          actualTotal +=
            value;
        }
      }


      actualTotal =
        dashboardExpenseDetailsRound2_(
          actualTotal
        );
    }


    const expectedTotal =
      dashboardExpenseDetailsRound2_(
        prepared.dataset.totalExpense
      );


    if (
      actualTotal !==
      expectedTotal
    ) {

      throw new Error(
        'Native Expense V8: checksum mismatch. ' +
        'Expected=' +
        expectedTotal +
        ', actual=' +
        actualTotal +
        '.'
      );
    }

  } catch (error) {

    /*
     * PRIMARY COMMIT FAILED:
     * restore source range.
     */
    targetRange.setValues(
      snapshot.values
    );


    targetRange.setNumberFormats(
      snapshot.numberFormats
    );


    SpreadsheetApp.flush();


    throw error;
  }


  /*
   * ==========================================================
   * PRESENTATION
   *
   * SECONDARY.
   * Правильні дані НЕ відкочуємо,
   * якщо title update не вдався.
   * ==========================================================
   */

  const expectedTitle =
    'Деталізація видатків — ' +
    prepared.selectedCategory;


  let titleUpdated =
    false;


  let titleError =
    null;


  let chartIdPreserved =
    true;


  try {

    const updatedChart =
      chart
        .modify()
        .setOption(
          'title',
          expectedTitle
        )
        .build();


    dashboardSheet.updateChart(
      updatedChart
    );


    SpreadsheetApp.flush();


    const actualChart =
      dashboardSheet
        .getCharts()
        .filter(
          function(candidate) {

            return (
              candidate.getChartId() ===
              chartIdBefore
            );
          }
        )[0] ||
        null;


    if (!actualChart) {

      throw new Error(
        'EmbeddedChart з початковим chartId ' +
        'не знайдено після title update.'
      );
    }


    chartIdPreserved =
      actualChart.getChartId() ===
      chartIdBefore;


    if (!chartIdPreserved) {

      throw new Error(
        'Native Expense V8: chartId змінився.'
      );
    }


    const actualTitle =
      String(
        actualChart
          .getOptions()
          .get(
            'title'
          ) || ''
      ).trim();


    if (
      actualTitle !==
      expectedTitle
    ) {

      throw new Error(
        'Native Expense V8: title verification failed.'
      );
    }


    titleUpdated =
      true;

  } catch (error) {

    titleError =
      error.message;


    console.warn(
      'Native Expense V8 title warning: ' +
      titleError
    );
  }


  /*
   * ==========================================================
   * LEGACY PNG CLEANUP
   *
   * НОВИЙ PNG НЕ створюється.
   * Якщо від старого runtime PNG залишився —
   * після успішного native data commit прибираємо його.
   * ==========================================================
   */
  let pngCleanup;


  try {

    pngCleanup =
      dashboardExpenseDetailsRemoveManagedPngsAfterNativeCommit_(
        dashboardSheet
      );

  } catch (error) {

    pngCleanup = {

      found:
        null,

      removed:
        0,

      errors: [
        error.message
      ]
    };


    console.warn(
      'Native Expense V8 PNG cleanup warning: ' +
      error.message
    );
  }

const cacheRangeRef =
  dashboardExpenseDetailsRangeRef_(
    targetRange
  );


const imageObjectsChanged =
  !!(
    pngCleanup &&
    Number(
      pngCleanup.removed
    ) > 0
  );

  return {

  ok:
    true,

  status:
    prepared.dataset.empty
      ? 'empty'
      : 'ok',

  /*
   * Контракт STEP 11.
   */
  renderer:
    'NATIVE_EMBEDDED_CHART',

  /*
   * Фактична реалізація:
   * використовуємо вже існуючу
   * EmbeddedChart.
   */
  rendererImplementation:
    'EXISTING_EMBEDDED_CHART',

  selectedCategory:
    prepared.selectedCategory,

  mode:
    prepared.dataset.mode,

  period:
    dashboardExpenseDetailsPeriodResult_(
      prepared.period
    ),

  sectors:
    prepared.dataset.sectors,

  totalTransactions:
    prepared.dataset.totalTransactions,

  totalExpense:
    prepared.dataset.totalExpense,

  invalidAmountRows:
    prepared.dataset.invalidAmountRows,

  chartId:
    chartIdBefore,

  chartIdPreserved:
    chartIdPreserved,

  /*
   * Оригінальне ім'я STEP 11.
   */
  cacheRange:
    cacheRangeRef,

  /*
   * Залишаємо також compatibility alias.
   */
  sourceRange:
    cacheRangeRef,

  /*
   * false означає:
   *
   * НЕ було:
   * - insertChart()
   * - removeChart()
   * - newChart()
   * - переприв'язки source range.
   *
   * Title update вважається
   * presentation metadata,
   * а не structural chart mutation.
   */
  chartObjectsChanged:
    false,

  chartPresentationUpdated:
    titleUpdated,

  title:
    expectedTitle,

  titleUpdated:
    titleUpdated,

  titleError:
    titleError,

  /*
   * У нормальному STEP 11 має бути false.
   *
   * true можливе лише якщо під час цього
   * запуску було прибрано залишковий
   * legacy managed PNG.
   */
  imageObjectsChanged:
    imageObjectsChanged,

  pngGenerated:
    false,

  pngCleanup:
    pngCleanup
};
}

// ============================================================
// 7. ПОБУДОВА старої PNG У ПАМ'ЯТІ
// ============================================================

function dashboardExpenseDetailsPrepareRenderV8_(
  context,
  selectedCategory,
  period
) {

  const dataset =
    dashboardExpenseDetailsBuildDataset_(
      context.sourceSheet,
      selectedCategory,
      period
    );


  const chart =
    dashboardExpenseDetailsBuildMemoryChart_(
      dataset,
      selectedCategory,
      period
    );


  const blob =
    chart
      .getAs(
        'image/png'
      )
      .setName(
        'profin-expense-pie-direct.png'
      );


  return {

    selectedCategory:
      selectedCategory,

    period:
      period,

    dataset:
      dataset,

    blob:
      blob
  };
}


function dashboardExpenseDetailsCommitPreparedRenderV8_(
  context,
  prepared
) {

  const imageResult =
    dashboardExpenseDetailsUpsertManagedImage_(
      context.dashboardSheet,
      prepared.blob,
      prepared.dataset,
      prepared.selectedCategory,
      prepared.period
    );


  return {

    ok:
      true,

    status:
      prepared.dataset.empty
        ? 'empty'
        : 'ok',

    selectedCategory:
      prepared.selectedCategory,

    mode:
      prepared.dataset.mode,

    period:
      dashboardExpenseDetailsPeriodResult_(
        prepared.period
      ),

    sectors:
      prepared.dataset.sectors,

    totalTransactions:
      prepared.dataset.totalTransactions,

    totalExpense:
      prepared.dataset.totalExpense,

    invalidAmountRows:
      prepared.dataset.invalidAmountRows,

    imageInserted:
      imageResult.inserted,

    imageReplaced:
      imageResult.replaced,

    imageAnchor:
      imageResult.anchor,

    removedOldImages:
      imageResult.removedOldImages,

    renderToken:
      imageResult.renderToken
  };
}

function dashboardExpenseDetailsRenderDirectImageWithContext_(
  context
) {
  const selectedCategory =
    dashboardExpenseDetailsResolveSelectedCategory_(
      context.selectedCategoryRange
        .getDisplayValue()
    );

  const period =
    dashboardExpenseDetailsResolvePeriod_(
      context
    );

  const dataset =
    dashboardExpenseDetailsBuildDataset_(
      context.sourceSheet,
      selectedCategory,
      period
    );

  const chart =
    dashboardExpenseDetailsBuildMemoryChart_(
      dataset,
      selectedCategory,
      period
    );

  const blob =
    chart
      .getAs('image/png')
      .setName(
        'profin-expense-pie-direct.png'
      );

  const imageResult =
    dashboardExpenseDetailsUpsertManagedImage_(
      context.dashboardSheet,
      blob,
      dataset,
      selectedCategory,
      period
    );

  return {
    ok: true,

    status:
      dataset.empty
        ? 'empty'
        : 'ok',

    selectedCategory:
      selectedCategory,

    mode:
      dataset.mode,

    period:
      dashboardExpenseDetailsPeriodResult_(
        period
      ),

    sectors:
      dataset.sectors,

    totalTransactions:
      dataset.totalTransactions,

    totalExpense:
      dataset.totalExpense,

    invalidAmountRows:
      dataset.invalidAmountRows,

    imageInserted:
      imageResult.inserted,

    imageReplaced:
      imageResult.replaced,

    imageAnchor:
      imageResult.anchor
  };
}


function dashboardExpenseDetailsBuildMemoryChart_(
  dataset,
  selectedCategory,
  period
) {
  const tableBuilder =
    Charts.newDataTable();

  tableBuilder.addColumn(
    Charts.ColumnType.STRING,
    'Категорія / місяць'
  );

  tableBuilder.addColumn(
    Charts.ColumnType.NUMBER,
    'Сума витрат, грн'
  );

  if (dataset.empty) {
    tableBuilder.addRow([
      'Немає даних за період',
      1
    ]);

  } else {

    dataset.items.forEach(
      function(item) {

        const money =
          dashboardExpenseDetailsFormatMoney_(
            item.amount
          );

        /*
         * Єдиний формат підпису:
         *
         * Усі категорії:
         * Лікарі — 120 589,40 грн — 27,8%
         *
         * Конкретна категорія:
         * липень — 120 589,40 грн — 100,0%
         */
        const baseLabel =
          dataset.mode ===
            'CATEGORY_SECTORS'
            ? item.category
            : item.month;

        const label =
          baseLabel +
          ' — ' +
          money +
          ' — ' +
          item.shareText;

        tableBuilder.addRow([
          label,
          item.amount
        ]);
      }
    );
  }

  let title;

  if (dataset.empty) {

    title =
      'Немає витрат за вибраним фільтром';

  } else if (
    selectedCategory ===
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .filter
      .allLabel
  ) {

    title =
      'Витрати за категоріями';

  } else {

    title =
      'Витрати категорії «' +
      selectedCategory +
      '» за місяцями';
  }

  return Charts
    .newPieChart()

    .setDataTable(
      tableBuilder.build()
    )

    .setDimensions(
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .visual
        .width,

      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .visual
        .height
    )

    .setTitle(
      title
    )

    /*
     * НЕ використовуємо
     * setLegendPosition(RIGHT).
     *
     * Нижче вмикаємо labeled legend.
     */

    .setBackgroundColor(
      '#ffffff'
    )

    .setOption(
      'fontName',
      'Arial'
    )

    .setOption(
      'fontSize',
      11
    )

    .setOption(
      'is3D',
      false
    )

    .setOption(
      'pieHole',
      0
    )

    /*
     * Процент також залишається
     * безпосередньо на секторі.
     */
    .setOption(
      'pieSliceText',
      dataset.empty
        ? 'label'
        : 'percentage'
    )

    .setOption(
      'pieSliceTextStyle',
      {
        fontSize:
          10
      }
    )

    /*
     * Не ховаємо маленькі сектори.
     */
    .setOption(
      'sliceVisibilityThreshold',
      0
    )

    .setOption(
      'titleTextStyle',
      {
        fontSize:
          16,

        bold:
          true
      }
    )

    /*
     * ГОЛОВНА ЗМІНА.
     *
     * Google малює лінії
     * від секторів до підписів,
     * як на секторній діаграмі
     * доходів вище.
     */
    .setOption(
      'legend',
      {
        position:
          'labeled',

        textStyle: {
          fontSize:
            10
        }
      }
    )

    .setOption(
      'tooltip',
      {
        text:
          'both',

        showColorCode:
          true
      }
    )

    /*
     * Залишаємо місце зліва/справа
     * для зовнішніх підписів.
     */
    .setOption(
      'chartArea',
      {
        left:
          60,

        top:
          55,

        width:
          '82%',

        height:
          '76%'
      }
    )

    .build();
}


// ============================================================
// 8. ВСТАВКА / ЗАМІНА ЗОБРАЖЕННЯ
// ============================================================

function dashboardExpenseDetailsUpsertManagedImage_(
  dashboardSheet,
  blob,
  dataset,
  selectedCategory,
  period
) {
  const config =
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .visual;

  /*
   * Усі PNG, якими керує саме
   * Expense Details.
   *
   * ВАЖЛИВО:
   * цей список отримуємо ДО вставлення
   * нового PNG.
   */
  const oldImages =
    dashboardExpenseDetailsFindManagedImages_(
      dashboardSheet
    );

  const primaryOldImage =
    oldImages.length
      ? oldImages[0]
      : null;

  /*
   * Геометрія за замовчуванням.
   */
  let anchorCell =
    dashboardSheet.getRange(
      config.position.row,
      config.position.column
    );

  let offsetX =
    Number(
      config.position.offsetX
    ) || 0;

  let offsetY =
    Number(
      config.position.offsetY
    ) || 0;

  let width =
    Number(config.width) || 700;

  let height =
    Number(config.height) || 360;

  /*
   * Якщо стара діаграма є —
   * беремо ТОЧНО її поточну геометрію.
   *
   * Тобто новий PNG стане
   * піксель у піксель на її місце.
   */
  if (primaryOldImage) {
    try {
      const oldAnchor =
        primaryOldImage
          .getAnchorCell();

      if (
        oldAnchor &&
        oldAnchor
          .getSheet()
          .getSheetId() ===
          dashboardSheet.getSheetId()
      ) {
        anchorCell =
          oldAnchor;
      }

      offsetX =
        Math.max(
          0,
          Number(
            primaryOldImage
              .getAnchorCellXOffset()
          ) || 0
        );

      offsetY =
        Math.max(
          0,
          Number(
            primaryOldImage
              .getAnchorCellYOffset()
          ) || 0
        );

      width =
        Math.max(
          1,
          Number(
            primaryOldImage
              .getWidth()
          ) ||
          width
        );

      height =
        Math.max(
          1,
          Number(
            primaryOldImage
              .getHeight()
          ) ||
          height
        );

    } catch (geometryError) {
      console.warn(
        'Не вдалося прочитати геометрію старого PNG: ' +
        geometryError.message
      );
    }
  }

  const renderToken =
    'render=' +
    Utilities.getUuid();

  const description =
    config.imageAltDescription +
    '; категорія=' +
    selectedCategory +
    '; період=' +
    dashboardExpenseDetailsBuildPeriodCaption_(
      period
    ).replace(
      /^\s*—\s*/,
      ''
    ) +
    '; секторів=' +
    dataset.sectors +
    '; сума=' +
    dataset.totalExpense +
    '; ' +
    renderToken;

  const uniqueBlob =
    blob.setName(
      'profin-expense-pie-' +
      Date.now() +
      '.png'
    );

  /*
   * =========================================================
   * DOUBLE BUFFER
   * =========================================================
   *
   * СТАРИЙ PNG залишається видимим.
   *
   * Спочатку:
   *   insertImage(new PNG)
   *
   * Потім:
   *   повністю налаштовуємо новий PNG
   *
   * Потім:
   *   flush()
   *
   * Потім:
   *   width + 1
   *   flush()
   *   width назад
   *   flush()
   *
   * І ЛИШЕ ПІСЛЯ ЦЬОГО
   * видаляємо старий PNG.
   */
  let newImage = null;

  try {
    newImage =
      dashboardSheet.insertImage(
        uniqueBlob,

        anchorCell.getColumn(),
        anchorCell.getRow(),

        offsetX,
        offsetY
      );

    if (!newImage) {
      throw new Error(
        'Google Sheets не повернув новий OverGridImage.'
      );
    }

    /*
     * Повністю готуємо новий об'єкт,
     * поки старий ще знаходиться
     * під ним.
     */
    newImage
      .setAltTextTitle(
        config.imageAltTitle
      )
      .setAltTextDescription(
        description
      )
      .setAnchorCell(
        anchorCell
      )
      .setAnchorCellXOffset(
        offsetX
      )
      .setAnchorCellYOffset(
        offsetY
      )
      .setWidth(
        width
      )
      .setHeight(
        height
      );

    SpreadsheetApp.flush();

    /*
     * Перевіряємо, що новий PNG
     * реально став на очікуване місце.
     */
    const actualAnchor =
      newImage.getAnchorCell();

    if (
      !actualAnchor ||
      actualAnchor
        .getSheet()
        .getSheetId() !==
        dashboardSheet.getSheetId()
    ) {
      throw new Error(
        'Новий PNG вставлено некоректно.'
      );
    }

    /*
     * REPAINT PULSE.
     *
     * На мить змінюємо тільки ширину
     * НОВОГО PNG.
     *
     * Старий PNG все ще знаходиться
     * під ним, тому користувач
     * не бачить білої ділянки.
     */
    newImage.setWidth(
      width + 1
    );

    SpreadsheetApp.flush();

    Utilities.sleep(
      80
    );

    newImage.setWidth(
      width
    );

    SpreadsheetApp.flush();

    /*
     * Невелике вікно для клієнта Sheets,
     * щоб прийняти новий графічний object.
     */
    Utilities.sleep(
      100
    );

    /*
     * ЛИШЕ ТЕПЕР видаляємо старі PNG.
     *
     * oldImages було отримано
     * ще ДО insertImage(),
     * тому newImage сюди не входить.
     */
    let removedOldImages = 0;

    oldImages.forEach(
      function(oldImage) {
        try {
          oldImage.remove();
          removedOldImages++;

        } catch (removeError) {
          console.warn(
            'Не вдалося видалити старий PNG: ' +
            removeError.message
          );
        }
      }
    );

    SpreadsheetApp.flush();

    return {
      inserted:
        true,

      replaced:
        oldImages.length > 0,

      removedOldImages:
        removedOldImages,

      renderToken:
        renderToken,

      anchor:
        dashboardExpenseDetailsRangeRef_(
          newImage.getAnchorCell()
        ),

      offsetX:
        newImage
          .getAnchorCellXOffset(),

      offsetY:
        newImage
          .getAnchorCellYOffset(),

      width:
        newImage.getWidth(),

      height:
        newImage.getHeight(),

      mode:
        'DOUBLE_BUFFER_INSERT_VERIFY_PULSE'
    };

  } catch (error) {

    /*
     * Якщо новий PNG створився,
     * але процес не завершився —
     * прибираємо ТІЛЬКИ новий.
     *
     * Старий PNG ми ще не видаляли,
     * тому користувач нічого
     * не втрачає.
     */
    if (newImage) {
      try {
        newImage.remove();
      } catch (cleanupError) {
        console.warn(
          'Не вдалося прибрати невдалий новий PNG: ' +
          cleanupError.message
        );
      }
    }

    SpreadsheetApp.flush();

    throw error;
  }
}


function dashboardExpenseDetailsFindManagedImages_(
  dashboardSheet
) {
  return dashboardSheet
    .getImages()
    .filter(function(image) {
      return (
        image.getAltTextTitle() ===
        DASHBOARD_EXPENSE_DETAILS_CONFIG
          .visual
          .imageAltTitle
      );
    });
}


// ============================================================
// 9. ВИДАЛЕННЯ ПОРОЖНЬОЇ EMBEDDED-ДІАГРАМИ
// ============================================================

function dashboardExpenseDetailsRemoveLegacyEmbeddedCharts_(
  dashboardSheet
) {
  const visual =
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .visual;

  const zone =
    visual.embeddedChartZone;

  const charts =
    dashboardSheet.getCharts();

  let removed = 0;

  charts.forEach(function(chart) {
    const info =
      chart.getContainerInfo();

    const row =
      info.getAnchorRow();

    const column =
      info.getAnchorColumn();

    const title =
      dashboardExpenseDetailsNormalize_(
        chart.getOptions().get('title')
      );

    const exactTarget =
      row === visual.position.row &&
      column === visual.position.column;

    const insideTargetZone =
      row >= zone.minRow &&
      row <= zone.maxRow &&
      column >= zone.minColumn &&
      column <= zone.maxColumn;

    const titleMatches =
      visual.legacyTitles.some(
        function(needle) {
          return (
            title.indexOf(
              dashboardExpenseDetailsNormalize_(
                needle
              )
            ) !== -1
          );
        }
      );

    /*
     * Діаграма в D83 є старою цільовою
     * діаграмою витрат.
     *
     * Діаграма біля A83 не потрапляє
     * до цієї умови.
     */
    if (
      exactTarget ||
      (
        insideTargetZone &&
        titleMatches
      )
    ) {
      dashboardSheet.removeChart(
        chart
      );

      removed++;
    }
  });

  if (removed) {
    SpreadsheetApp.flush();
  }

  return removed;
}


function dashboardExpenseDetailsInstalledOnEdit_(
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
    SpreadsheetApp.getActiveSpreadsheet();


  const selectedCategoryRange =
    ss.getRangeByName(
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .namedRanges
        .selectedCategory
    );


  if (
    !selectedCategoryRange
  ) {

    console.error(
      'dashboardExpenseDetailsInstalledOnEdit_: ' +
      'не знайдено DASH_EXPENSE_CATEGORY.'
    );

    return null;
  }


    if (
    !dashboardExpenseDetailsRangesIntersect_(
      e.range,
      selectedCategoryRange
    )
  ) {
    return null;
  }


  /*
   * STEP 13 CUTOVER GUARD.
   *
   * F99 відтепер обслуговує
   * єдиний центральний onEdit(e)
   * через:
   *
   * dashboardExpenseDetailsHandleEdit_(e)
   *
   * Сам installable trigger поки
   * фізично НЕ видаляємо.
   *
   * Старий код нижче також
   * НЕ видаляємо — він залишається
   * для rollback / compatibility.
   *
   * Але production refresh звідси
   * більше не запускаємо,
   * щоб не було подвійного refresh.
   */
  return {
    ok: true,
    handled: true,
    skipped: true,
    reason:
      'CENTRAL_ONEDIT_OWNS_F99'
  };


  const lockTimeoutMs =
    typeof DASHBOARD_FILTER_COORDINATOR_V8_CFG !==
      'undefined'
      ? DASHBOARD_FILTER_COORDINATOR_V8_CFG
          .lockTimeoutMs
      : 30000;


  /*
   * ==========================================================
   * PHASE A
   * SNAPSHOT
   * ==========================================================
   */

  const captureLock =
    LockService.getScriptLock();


  captureLock.waitLock(
    lockTimeoutMs
  );


  let request;


  try {

    const context =
      dashboardExpenseDetailsAssertReady_();


    const committedState =
      dashboardFilterCoordinatorReadCommittedState_();


    if (
      !committedState.initialized
    ) {

      throw new Error(
        'FILTER COORDINATOR V8 не ініціалізований.'
      );
    }


    const selectedCategory =
      dashboardExpenseDetailsResolveSelectedCategory_(
        selectedCategoryRange
          .getDisplayValue()
      );


    const localRevision =
      dashboardFilterCoordinatorBumpExpenseLocalRevision_();


    const period =
      dashboardExpenseDetailsResolvePeriod_(
        context
      );


    request = {

      selectedCategory:
        selectedCategory,

      localRevision:
        localRevision,

      globalRevision:
        period.globalRevision,

      globalFilterActive:
        committedState.active,

      period:
        period
    };


  } finally {

    captureLock.releaseLock();
  }


  /*
   * ==========================================================
   * PHASE B
   * CALCULATION
   *
   * БЕЗ MUTEX.
   * ==========================================================
   */

  const calculationContext =
    dashboardExpenseDetailsAssertReady_();


  const prepared =
  dashboardExpenseDetailsPrepareNativeV8_(
    calculationContext,
    request.selectedCategory,
    request.period
  );


  /*
   * ==========================================================
   * PHASE C
   * STALE CHECK + COMMIT
   * ==========================================================
   */

  const commitLock =
    LockService.getScriptLock();


  commitLock.waitLock(
    lockTimeoutMs
  );


  try {

    const currentGlobalRevision =
      dashboardFilterCoordinatorReadGlobalRevision_();


    const currentLocalRevision =
      dashboardFilterCoordinatorReadExpenseLocalRevision_();


    const currentCategory =
      dashboardExpenseDetailsResolveSelectedCategory_(
        selectedCategoryRange
          .getDisplayValue()
      );


    const categoryStillCurrent =
      dashboardExpenseDetailsNormalize_(
        currentCategory
      ) ===
      dashboardExpenseDetailsNormalize_(
        request.selectedCategory
      );


    const globalStillCurrent =
      currentGlobalRevision ===
      request.globalRevision;


    const localStillCurrent =
      currentLocalRevision ===
      request.localRevision;


    if (
      !categoryStillCurrent ||
      !globalStillCurrent ||
      !localStillCurrent
    ) {

      const staleResult = {

        ok:
          true,

        handled:
          true,

        skipped:
          true,

        reason:
          'STALE_SUPERSEDED',

        requestedCategory:
          request.selectedCategory,

        currentCategory:
          currentCategory,

        requestedGlobalRevision:
          request.globalRevision,

        currentGlobalRevision:
          currentGlobalRevision,

        requestedLocalRevision:
          request.localRevision,

        currentLocalRevision:
          currentLocalRevision,

        imageChanged:
          false
      };


      Logger.log(
        'dashboardExpenseDetailsInstalledOnEdit_: ' +
        JSON.stringify(
          staleResult,
          null,
          2
        )
      );


      return staleResult;
    }


    const commitContext =
      dashboardExpenseDetailsAssertReady_();


    const refreshResult =
    dashboardExpenseDetailsCommitPreparedNativeV8_(
    commitContext,
    prepared
  );


    SpreadsheetApp.flush();


    let repaintResult =
      null;


    if (
      typeof dashboardExpenseDetailsForceClientRepaint_ ===
        'function'
    ) {

      repaintResult =
        dashboardExpenseDetailsForceClientRepaint_(
          ss,
          selectedCategoryRange.getSheet(),
          selectedCategoryRange
        );
    }


    const result = {

      ok:
        true,

      handled:
        true,

      scope:
        'LOCAL_EXPENSE_V8',

      synchronization:
        'OPTIMISTIC_REVISION_PLUS_SCRIPT_MUTEX',

      selectedCategory:
        request.selectedCategory,

      globalFilterActive:
        request.globalFilterActive,

      globalRevision:
        request.globalRevision,

      localRevision:
        request.localRevision,

      period:
        refreshResult.period,

      sectors:
        refreshResult.sectors,

      totalTransactions:
        refreshResult.totalTransactions,

      totalExpense:
        refreshResult.totalExpense,

      refresh:
        refreshResult,

      repaint:
        repaintResult,

      stale:
        false
    };


    Logger.log(
      'dashboardExpenseDetailsInstalledOnEdit_: ' +
      JSON.stringify(
        result,
        null,
        2
      )
    );


    return result;


  } finally {

    commitLock.releaseLock();
  }
}

function dashboardExpenseDetailsHandleEdit_(
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
    SpreadsheetApp.getActiveSpreadsheet();

  const selectedCategoryRange =
    ss.getRangeByName(
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .namedRanges
        .selectedCategory
    );

  /*
   * Якщо named range ще не створений,
   * локальний обробник нічого не змінює.
   */
  if (!selectedCategoryRange) {
    return null;
  }

  /*
   * Реагуємо ТІЛЬКИ на локальний
   * dropdown категорії витрат F99.
   */
  const relevantEdit =
    dashboardExpenseDetailsRangesIntersect_(
      e.range,
      selectedCategoryRange
    );

  if (!relevantEdit) {
    return null;
  }

    try {
    /*
     * STEP 13.
     *
     * Локальна зміна F99 запускає
     * тільки production Native refresh.
     *
     * PNG helper-функції з проєкту
     * НЕ видаляємо.
     *
     * Тут просто більше не запускаємо
     * PNG repaint/runtime.
     *
     * GLOBAL OFF:
     *   повна доступна історія.
     *
     * GLOBAL ON:
     *   committed global period.
     */
    const result =
      dashboardExpenseDetailsRefreshChartData();

    return {
      handled: true,
      scope: 'LOCAL_EXPENSE',
      filter:
        selectedCategoryRange
          .getDisplayValue(),
      value: result
    };


  } catch (error) {
    console.error(
      'dashboardExpenseDetailsHandleEdit_: ' +
      error.message
    );

    return {
      handled: true,
      scope: 'LOCAL_EXPENSE',
      ok: false,
      error: error.message
    };
  }
}

function dashboardExpenseDetailsForceClientRepaint_(
  ss,
  dashboardSheet,
  editedRange
) {
  /*
   * Реальний repaint уже виконується
   * всередині
   * dashboardExpenseDetailsUpsertManagedImage_()
   *
   * через:
   *
   * NEW PNG
   * -> verify
   * -> +1 px
   * -> flush
   * -> original width
   * -> flush
   * -> remove OLD PNG.
   *
   * Тут більше не змінюємо
   * ні лист, ні позицію, ні PNG.
   */
  SpreadsheetApp.flush();

  return {
    applied: true,

    mode:
      'REPAINT_ALREADY_DONE_BY_DOUBLE_BUFFER',

    sheetChanged:
      false,

    dashboardSheet:
      dashboardSheet
        ? dashboardSheet.getName()
        : '',

    selection:
      editedRange
        ? editedRange.getA1Notation()
        : ''
  };
}


// ============================================================
// 11. ТРИГЕР
// ============================================================

function dashboardExpenseDetailsEnsureFilterTrigger_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const spreadsheetId =
    ss.getId();

  const handler =
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .trigger
      .editHandler;

  const matchingTriggers =
    ScriptApp
      .getProjectTriggers()
      .filter(function(trigger) {
        return (
          trigger.getHandlerFunction() ===
            handler &&

          trigger.getEventType() ===
            ScriptApp.EventType.ON_EDIT &&

          dashboardExpenseDetailsTriggerSourceId_(
            trigger
          ) === spreadsheetId
        );
      });

  let duplicatesRemoved = 0;

  for (
    let index = 1;
    index < matchingTriggers.length;
    index++
  ) {
    ScriptApp.deleteTrigger(
      matchingTriggers[index]
    );

    duplicatesRemoved++;
  }

  let installed = false;

  if (matchingTriggers.length === 0) {
    ScriptApp
      .newTrigger(handler)
      .forSpreadsheet(ss)
      .onEdit()
      .create();

    installed = true;
  }

  const triggerCount =
    ScriptApp
      .getProjectTriggers()
      .filter(function(trigger) {
        return (
          trigger.getHandlerFunction() ===
            handler &&

          trigger.getEventType() ===
            ScriptApp.EventType.ON_EDIT &&

          dashboardExpenseDetailsTriggerSourceId_(
            trigger
          ) === spreadsheetId
        );
      })
      .length;

  return {
    ok:
      triggerCount === 1,

    installed:
      installed,

    triggerCount:
      triggerCount,

    duplicatesRemoved:
      duplicatesRemoved
  };
}


function dashboardExpenseDetailsInstallFilterTrigger() {
  return dashboardExpenseDetailsEnsureFilterTrigger_();
}


function dashboardExpenseDetailsFilterTriggerAudit() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const filterRange =
    ss.getRangeByName(
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .namedRanges
        .selectedCategory
    );

  const handler =
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .trigger
      .editHandler;

  const spreadsheetId =
    ss.getId();

  const triggerCount =
    ScriptApp
      .getProjectTriggers()
      .filter(function(trigger) {
        return (
          trigger.getHandlerFunction() ===
            handler &&

          trigger.getEventType() ===
            ScriptApp.EventType.ON_EDIT &&

          dashboardExpenseDetailsTriggerSourceId_(
            trigger
          ) === spreadsheetId
        );
      })
      .length;

  const result = {
    ok:
      !!filterRange &&
      triggerCount === 1,

    filterRange:
      filterRange
        ? dashboardExpenseDetailsRangeRef_(
            filterRange
          )
        : null,

    filterValue:
      filterRange
        ? filterRange.getDisplayValue()
        : null,

    triggerCount:
      triggerCount,

    cacheUsed:
      false,

    noCellsWritten:
      true
  };

  Logger.log(
    'dashboardExpenseDetailsFilterTriggerAudit: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


// ============================================================
// 12. CONTEXT / READY
// ============================================================

function dashboardExpenseDetailsCreateOrRepairContext_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sourceSheet =
    dashboardExpenseDetailsRequireSheet_(
      ss,
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .sourceSheetName
    );

  const dashboardSheet =
    dashboardExpenseDetailsRequireSheet_(
      ss,
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .dashboardSheetName
    );

  const selectedCategoryRange =
    dashboardSheet.getRange(
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .filter
        .cell
    );

  ss.setNamedRange(
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .namedRanges
      .selectedCategory,

    selectedCategoryRange
  );

  DASHBOARD_EXPENSE_DETAILS_CONFIG
    .namedRanges
    .selectedCategoryAliases
    .forEach(function(name) {
      ss.setNamedRange(
        name,
        selectedCategoryRange
      );
    });

  const headers =
    sourceSheet
      .getRange(
        DASHBOARD_EXPENSE_DETAILS_CONFIG
          .headersRow,

        1,
        1,
        sourceSheet.getLastColumn()
      )
      .getValues()[0];

  dashboardExpenseDetailsResolveIndexes_(
    headers
  );

  return {
    ss:
      ss,

    sourceSheet:
      sourceSheet,

    dashboardSheet:
      dashboardSheet,

    selectedCategoryRange:
      selectedCategoryRange
  };
}


function dashboardExpenseDetailsAssertReady_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sourceSheet =
    dashboardExpenseDetailsRequireSheet_(
      ss,
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .sourceSheetName
    );

  const dashboardSheet =
    dashboardExpenseDetailsRequireSheet_(
      ss,
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .dashboardSheetName
    );

  const selectedCategoryRange =
    ss.getRangeByName(
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .namedRanges
        .selectedCategory
    );

  if (!selectedCategoryRange) {
    throw new Error(
      'Named range "' +
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .namedRanges
        .selectedCategory +
      '" не знайдено. Запустіть dashboardExpenseDetailsInstall().'
    );
  }

  const expectedFilterRange =
    dashboardSheet.getRange(
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .filter
        .cell
    );

  if (
    !dashboardExpenseDetailsSameRange_(
      selectedCategoryRange,
      expectedFilterRange
    )
  ) {
    throw new Error(
      'Фільтр витрат має посилатися на Дашборд!' +
      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .filter
        .cell +
      '.'
    );
  }

  const headers =
    sourceSheet
      .getRange(
        DASHBOARD_EXPENSE_DETAILS_CONFIG
          .headersRow,

        1,
        1,
        sourceSheet.getLastColumn()
      )
      .getValues()[0];

  dashboardExpenseDetailsResolveIndexes_(
    headers
  );

  return {
    ss:
      ss,

    sourceSheet:
      sourceSheet,

    dashboardSheet:
      dashboardSheet,

    selectedCategoryRange:
      selectedCategoryRange
  };
}


// ============================================================
// 13. ПЕРІОД
// ============================================================

function dashboardExpenseDetailsResolvePeriod_(
  context
) {

  /*
   * ==========================================================
   * FILTER COORDINATOR V8
   *
   * ГОЛОВНЕ ПРАВИЛО:
   *
   * E5 / E6 / F5 / F6 = DRAFT UI.
   *
   * Застосований глобальний період
   * читаємо з COMMITTED STATE V8.
   *
   * Тому зміна глобальних контролів
   * без натискання "Оновити Дашборд"
   * НЕ змінює локальну діаграму F99.
   * ==========================================================
   */


  const committedStateV8 =
    typeof dashboardFilterCoordinatorReadCommittedState_ ===
      'function'
      ? dashboardFilterCoordinatorReadCommittedState_()
      : null;


  const useCoordinatorV8 =
    !!(
      committedStateV8 &&
      committedStateV8.initialized === true
    );


  /*
   * ==========================================================
   * 1. COMMITTED GLOBAL V8 ACTIVE
   * ==========================================================
   */

  if (
    useCoordinatorV8 &&
    committedStateV8.active === true
  ) {

    if (
      !Number.isFinite(
        committedStateV8.fromMs
      ) ||
      !Number.isFinite(
        committedStateV8.toMs
      )
    ) {

      throw new Error(
        'FILTER V8 активний, але committed-state ' +
        'не містить валідних fromMs / toMs.'
      );
    }


    const from =
      dashboardExpenseDetailsDateOnly_(
        new Date(
          committedStateV8.fromMs
        )
      );


    const to =
      dashboardExpenseDetailsDateOnly_(
        new Date(
          committedStateV8.toMs
        )
      );


    if (
      !from ||
      !to
    ) {

      throw new Error(
        'FILTER V8: не вдалося перетворити ' +
        'committed period у валідні дати.'
      );
    }


    if (
      from.getTime() >
      to.getTime()
    ) {

      throw new Error(
        'FILTER V8: дата початку періоду ' +
        'більша за дату завершення.'
      );
    }


    return {

      mode:
        'DASHBOARD_FILTER_V8',

      from:
        from,

      to:
        to,

      source:
        'COMMITTED_FILTER_V8',

      globalRevision:
        committedStateV8.revision
    };
  }


  /*
   * ==========================================================
   * 2. COMMITTED GLOBAL V8 OFF
   * ==========================================================
   *
   * Якщо V8 вже ініціалізований,
   * active=false означає:
   *
   * локальний F99 працює по
   * ПОВНІЙ ІСТОРІЇ ВИТРАТ.
   *
   * Значення E5/E6 тут ІГНОРУЄМО,
   * навіть якщо вони фізично залишились
   * у клітинках.
   * ==========================================================
   */

  if (
    useCoordinatorV8 &&
    committedStateV8.active === false
  ) {

    return dashboardExpenseDetailsResolveSourcePeriodV8_(
      context
    );
  }


  /*
   * ==========================================================
   * 3. LEGACY FALLBACK
   * ==========================================================
   *
   * Працює тільки якщо Coordinator V8
   * взагалі відсутній або ще
   * не ініціалізований.
   *
   * Це страховка на перехідний період.
   * ==========================================================
   */

  const fromRange =
    dashboardExpenseDetailsFirstNamedRange_(
      context.ss,

      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .namedRanges
        .periodFromCandidates
    );


  const toRange =
    dashboardExpenseDetailsFirstNamedRange_(
      context.ss,

      DASHBOARD_EXPENSE_DETAILS_CONFIG
        .namedRanges
        .periodToCandidates
    );


  const from =
    fromRange
      ? dashboardExpenseDetailsDateOnly_(
          fromRange.getValue()
        )
      : null;


  const to =
    toRange
      ? dashboardExpenseDetailsDateOnly_(
          toRange.getValue()
        )
      : null;


  const legacyGlobalActive =
    PropertiesService
      .getDocumentProperties()
      .getProperty(
        'PROFIN_DASH_GLOBAL_FILTER_ACTIVE'
      ) === '1';


  if (
    legacyGlobalActive &&
    from &&
    to
  ) {

    if (
      from.getTime() >
      to.getTime()
    ) {

      throw new Error(
        'Дата початку періоду більша ' +
        'за дату завершення.'
      );
    }


    return {

      mode:
        'DASHBOARD_FILTER_LEGACY',

      from:
        from,

      to:
        to,

      source:
        (
          fromRange
            ? dashboardExpenseDetailsRangeRef_(
                fromRange
              )
            : 'DASH_DATE_FROM'
        ) +
        ' / ' +
        (
          toRange
            ? dashboardExpenseDetailsRangeRef_(
                toRange
              )
            : 'DASH_DATE_TO'
        ),

      globalRevision:
        0
    };
  }


  /*
   * Legacy GLOBAL OFF.
   */
  return dashboardExpenseDetailsResolveSourcePeriodV8_(
    context
  );
}


/**
 * ============================================================
 * FULL EXPENSE HISTORY
 *
 * Окремий resolver, щоб однакова логіка
 * використовувалась:
 *
 * - V8 global OFF;
 * - legacy global OFF.
 *
 * Читає напряму "База операцій".
 * ============================================================
 */
function dashboardExpenseDetailsResolveSourcePeriodV8_(
  context
) {

  const values =
    context.sourceSheet
      .getDataRange()
      .getValues();


  const headers =
    values[
      DASHBOARD_EXPENSE_DETAILS_CONFIG.headersRow - 1
    ];


  const indexes =
    dashboardExpenseDetailsResolveIndexes_(
      headers
    );


  const dates =
    [];


  for (
    let rowIndex =
      DASHBOARD_EXPENSE_DETAILS_CONFIG.headersRow;

    rowIndex < values.length;

    rowIndex++
  ) {

    const row =
      values[rowIndex];


    /*
     * Тільки expense-операції.
     */
    if (
      !dashboardExpenseDetailsIsExpenseRow_(
        row,
        indexes
      )
    ) {
      continue;
    }


    /*
     * Виключені статуси.
     */
    if (
      indexes.status >= 0 &&
      dashboardExpenseDetailsIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      continue;
    }


    const date =
      dashboardExpenseDetailsDateOnly_(
        row[indexes.date]
      );


    if (
      date
    ) {

      dates.push(
        date.getTime()
      );
    }
  }


  /*
   * Немає валідних витрат.
   */
  if (
    !dates.length
  ) {

    return {

      mode:
        'EMPTY',

      from:
        null,

      to:
        null,

      source:
        'Немає валідних витрат',

      globalRevision:
        typeof dashboardFilterCoordinatorReadGlobalRevision_ ===
          'function'
          ? dashboardFilterCoordinatorReadGlobalRevision_()
          : 0
    };
  }


  /*
   * Повна фактична історія витрат.
   */
  return {

    mode:
      'SOURCE_RANGE',

    from:
      new Date(
        Math.min.apply(
          null,
          dates
        )
      ),

    to:
      new Date(
        Math.max.apply(
          null,
          dates
        )
      ),

    source:
      'Мінімальна і максимальна дати валідних витрат',

    globalRevision:
      typeof dashboardFilterCoordinatorReadGlobalRevision_ ===
        'function'
        ? dashboardFilterCoordinatorReadGlobalRevision_()
        : 0
  };
}


// ============================================================
// 14. КОЛОНКИ ТА ФІЛЬТР ВИТРАТ
// ============================================================

function dashboardExpenseDetailsResolveIndexes_(
  headers
) {
  const map =
    Object.create(null);

  headers.forEach(
    function(header, index) {
      map[
        dashboardExpenseDetailsNormalize_(
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
        dashboardExpenseDetailsNormalize_(
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
        dashboardExpenseDetailsNormalize_(
          headerName
        )
      ];

    return (
      index === undefined
        ? -1
        : index
    );
  }

  const headersConfig =
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .headers;

  return {
    date:
      requiredIndex(
        headersConfig.date
      ),

    amount:
      requiredIndex(
        headersConfig.amount
      ),

    type:
      requiredIndex(
        headersConfig.type
      ),

    accountingType:
      optionalIndex(
        headersConfig.accountingType
      ),

    category:
  requiredIndex(
    headersConfig.category
  ),

  article:
  optionalIndex(
    headersConfig.article
  ),

  status:
  optionalIndex(
    headersConfig.status
  )
  };
}


function dashboardExpenseDetailsIsExpenseRow_(
  row,
  indexes
) {
  const mainType =
    dashboardExpenseDetailsNormalize_(
      row[indexes.type]
    );

  const accountingType =
    indexes.accountingType >= 0
      ? dashboardExpenseDetailsNormalize_(
          row[indexes.accountingType]
        )
      : '';

  return (
    mainType === 'витрати' ||
    mainType === 'витрата' ||
    accountingType === 'витрати' ||
    accountingType === 'витрата'
  );
}


function dashboardExpenseDetailsIsExcludedStatus_(
  value
) {
  return (
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .excludedStatuses
      .indexOf(
        dashboardExpenseDetailsNormalize_(
          value
        )
      ) !== -1
  );
}


// ============================================================
// 15. ДОПОМІЖНІ ФУНКЦІЇ
// ============================================================

function dashboardExpenseDetailsResolveSelectedCategory_(
  value
) {
  const cleaned =
    dashboardExpenseDetailsClean_(
      value
    );

  const filterLabel =
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .filter
      .label;

  const allLabel =
    DASHBOARD_EXPENSE_DETAILS_CONFIG
      .filter
      .allLabel;

  /*
   * Порожнє поле або текст
   * "Категорія витрат"
   * = режим усіх категорій.
   */
  if (
    !cleaned ||
    dashboardExpenseDetailsNormalize_(
      cleaned
    ) ===
    dashboardExpenseDetailsNormalize_(
      filterLabel
    )
  ) {
    return allLabel;
  }

  return cleaned;
}


function dashboardExpenseDetailsFirstNamedRange_(
  ss,
  names
) {
  for (
    let index = 0;
    index < names.length;
    index++
  ) {
    const range =
      ss.getRangeByName(
        names[index]
      );

    if (range) {
      return range;
    }
  }

  return null;
}


function dashboardExpenseDetailsRequireSheet_(
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


function dashboardExpenseDetailsPeriodResult_(
  period
) {
  return {
    mode:
      period.mode,

    from:
      period.from
        ? dashboardExpenseDetailsFormatDate_(
            period.from
          )
        : null,

    to:
      period.to
        ? dashboardExpenseDetailsFormatDate_(
            period.to
          )
        : null,

    source:
      period.source
  };
}


function dashboardExpenseDetailsBuildPeriodCaption_(
  period
) {
  if (
    !period.from ||
    !period.to
  ) {
    return '';
  }

  return (
    ' — ' +
    dashboardExpenseDetailsFormatDate_(
      period.from
    ) +
    '–' +
    dashboardExpenseDetailsFormatDate_(
      period.to
    )
  );
}


function dashboardExpenseDetailsRangesIntersect_(
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

  const firstBottom =
    firstRange.getRow() +
    firstRange.getNumRows() -
    1;

  const firstRight =
    firstRange.getColumn() +
    firstRange.getNumColumns() -
    1;

  const secondBottom =
    secondRange.getRow() +
    secondRange.getNumRows() -
    1;

  const secondRight =
    secondRange.getColumn() +
    secondRange.getNumColumns() -
    1;

  return !(
    firstBottom <
      secondRange.getRow() ||

    secondBottom <
      firstRange.getRow() ||

    firstRight <
      secondRange.getColumn() ||

    secondRight <
      firstRange.getColumn()
  );
}


function dashboardExpenseDetailsSameRange_(
  firstRange,
  secondRange
) {
  return (
    firstRange.getSheet().getSheetId() ===
      secondRange.getSheet().getSheetId() &&

    firstRange.getRow() ===
      secondRange.getRow() &&

    firstRange.getColumn() ===
      secondRange.getColumn() &&

    firstRange.getNumRows() ===
      secondRange.getNumRows() &&

    firstRange.getNumColumns() ===
      secondRange.getNumColumns()
  );
}


function dashboardExpenseDetailsDateOnly_(
  value
) {
  if (
    value instanceof Date &&
    !isNaN(value.getTime())
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
    dashboardExpenseDetailsClean_(
      value
    );

  if (!text) {
    return null;
  }

  let match =
    text.match(
      /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
    );

  if (match) {
    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      12,
      0,
      0
    );
  }

  match =
    text.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );

  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      12,
      0,
      0
    );
  }

  const parsed =
    new Date(text);

  if (
    isNaN(parsed.getTime())
  ) {
    return null;
  }

  return new Date(
    parsed.getFullYear(),
    parsed.getMonth(),
    parsed.getDate(),
    12,
    0,
    0
  );
}


function dashboardExpenseDetailsNumber_(
  value
) {
  if (
    typeof value === 'number' &&
    isFinite(value)
  ) {
    return value;
  }

  const normalized =
    String(
      value === null ||
      value === undefined
        ? ''
        : value
    )
      .replace(/\u00A0/g, '')
      .replace(/\s/g, '')
      .replace(/[грн₴]/gi, '')
      .replace(/,/g, '.')
      .replace(/[^0-9.\-]/g, '');

  if (!normalized) {
    return null;
  }

  const result =
    Number(normalized);

  return (
    isFinite(result)
      ? result
      : null
  );
}

/**
 * Ключ календарного місяця.
 *
 * 24.07.2026 -> 2026-07
 */
function dashboardExpenseDetailsMonthKey_(
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
  ].join('-');
}


/**
 * Повертає перший день місяця.
 * Використовується для правильного
 * хронологічного сортування.
 */
function dashboardExpenseDetailsMonthStart_(
  date
) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1,
    12,
    0,
    0
  );
}


/**
 * Формат місяця для легенди.
 *
 * Липень 2026 -> 07.2026
 */
function dashboardExpenseDetailsFormatMonth_(
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
    isNaN(date.getTime())
  ) {
    return '';
  }

  return monthNames[
    date.getMonth()
  ];
}

function dashboardExpenseDetailsDateKey_(
  date
) {
  return [
    date.getFullYear(),

    String(
      date.getMonth() + 1
    ).padStart(
      2,
      '0'
    ),

    String(
      date.getDate()
    ).padStart(
      2,
      '0'
    )
  ].join('-');
}


function dashboardExpenseDetailsFormatDate_(
  date
) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}


function dashboardExpenseDetailsFormatMoney_(
  value
) {
  const rounded =
    dashboardExpenseDetailsRound2_(
      value
    );

  const parts =
    Math.abs(rounded)
      .toFixed(2)
      .split('.');

  const integerPart =
    parts[0].replace(
      /\B(?=(\d{3})+(?!\d))/g,
      ' '
    );

  return (
    (
      rounded < 0
        ? '-'
        : ''
    ) +
    integerPart +
    ',' +
    parts[1] +
    ' грн'
  );
}


function dashboardExpenseDetailsFormatPercent_(
  fraction
) {
  return (
    (
      Number(fraction) *
      100
    )
      .toFixed(1)
      .replace('.', ',') +
    '%'
  );
}


function dashboardExpenseDetailsClean_(
  value
) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  )
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}


function dashboardExpenseDetailsNormalize_(
  value
) {
  return dashboardExpenseDetailsClean_(
    value
  ).toLowerCase();
}


function dashboardExpenseDetailsRangeRef_(
  range
) {
  return (
    range.getSheet().getName() +
    '!' +
    range.getA1Notation()
  );
}


function dashboardExpenseDetailsRound2_(
  value
) {
  return Math.round(
    (
      Number(value) +
      Number.EPSILON
    ) * 100
  ) / 100;
}


function dashboardExpenseDetailsRound4_(
  value
) {
  return Math.round(
    (
      Number(value) +
      Number.EPSILON
    ) * 10000
  ) / 10000;
}


function dashboardExpenseDetailsTriggerSourceId_(
  trigger
) {
  try {
    return (
      trigger.getTriggerSourceId() ||
      ''
    );

  } catch (error) {
    return '';
  }
}


// ============================================================
// 16. СУМІСНІ ПУБЛІЧНІ ІМЕНА
// ============================================================

function dashboardExpenseDetailsCacheMigrationAudit() {

  const context =
    dashboardExpenseDetailsAssertReady_();


  const ss =
    context.ss;


  const dashboardSheet =
    context.dashboardSheet;


  const cacheSheet =
    ss.getSheetByName(
      'Дані дашборду'
    );


  if (!cacheSheet) {

    throw new Error(
      'Не знайдено лист "Дані дашборду".'
    );
  }


  const oldRange =
    cacheSheet.getRange(
      'AP1:AQ100'
    );


  const newRange =
    cacheSheet.getRange(
      'AC1:AD100'
    );


  /*
   * ==========================================================
   * 1. CURRENT NATIVE CHART
   * ==========================================================
   */

  const chart =
    dashboardExpenseDetailsFindRuntimeNativeChart_(
      dashboardSheet
    );


  const chartId =
    chart.getChartId();


  const chartRanges =
    chart.getRanges();


  const currentRange =
    chartRanges.length === 1
      ? chartRanges[0]
      : null;


  const currentRangeRef =
    currentRange
      ? dashboardExpenseDetailsRangeRef_(
          currentRange
        )
      : null;


  const currentlyOnOldRange =
    currentRange
      ? dashboardExpenseDetailsSameRange_(
          currentRange,
          oldRange
        )
      : false;


  const alreadyOnNewRange =
    currentRange
      ? dashboardExpenseDetailsSameRange_(
          currentRange,
          newRange
        )
      : false;


  /*
   * ==========================================================
   * 2. TARGET AC:AD CONTENT AUDIT
   * ==========================================================
   */

  const values =
    newRange.getValues();


  const formulas =
    newRange.getFormulas();


  const notes =
    newRange.getNotes();


  const validations =
    newRange.getDataValidations();


  let occupiedCells =
    0;


  let formulaCells =
    0;


  let noteCells =
    0;


  let validationCells =
    0;


  const occupiedExamples =
    [];


  for (
    let row = 0;
    row < newRange.getNumRows();
    row++
  ) {

    for (
      let column = 0;
      column < newRange.getNumColumns();
      column++
    ) {

      const value =
        values[row][column];


      const formula =
        formulas[row][column];


      const note =
        notes[row][column];


      const validation =
        validations[row][column];


      const hasValue =
        value !== '' &&
        value !== null;


      const hasFormula =
        String(
          formula || ''
        ).trim() !== '';


      const hasNote =
        String(
          note || ''
        ).trim() !== '';


      const hasValidation =
        validation !== null;


      if (
        hasValue ||
        hasFormula ||
        hasNote ||
        hasValidation
      ) {

        occupiedCells++;


        if (
          occupiedExamples.length < 20
        ) {

          occupiedExamples.push(
            newRange
              .getCell(
                row + 1,
                column + 1
              )
              .getA1Notation()
          );
        }
      }


      if (hasFormula) {

        formulaCells++;
      }


      if (hasNote) {

        noteCells++;
      }


      if (hasValidation) {

        validationCells++;
      }
    }
  }


  /*
   * ==========================================================
   * 3. MERGED CELLS
   * ==========================================================
   */

  const targetHasMergedCells =
    newRange.isPartOfMerge();


  /*
   * ==========================================================
   * 4. NAMED RANGE CONFLICTS
   * ==========================================================
   */

  const namedRangeConflicts =
    ss
      .getNamedRanges()
      .filter(
        function(namedRange) {

          return dashboardExpenseDetailsRangesIntersect_(
            namedRange.getRange(),
            newRange
          );
        }
      )
      .map(
        function(namedRange) {

          return {

            name:
              namedRange.getName(),

            range:
              dashboardExpenseDetailsRangeRef_(
                namedRange.getRange()
              )
          };
        }
      );


  /*
   * ==========================================================
   * 5. OTHER CHART CONFLICTS
   * ==========================================================
   */

  const chartRangeConflicts =
    [];


  ss
    .getSheets()
    .forEach(
      function(sheet) {

        sheet
          .getCharts()
          .forEach(
            function(otherChart) {

              /*
               * Поточну Expense Details chart
               * не рахуємо конфліктом.
               */
              if (
                otherChart.getChartId() ===
                chartId
              ) {

                return;
              }


              otherChart
                .getRanges()
                .forEach(
                  function(range) {

                    if (
                      dashboardExpenseDetailsRangesIntersect_(
                        range,
                        newRange
                      )
                    ) {

                      chartRangeConflicts.push({

                        chartId:
                          otherChart.getChartId(),

                        chartSheet:
                          sheet.getName(),

                        sourceRange:
                          dashboardExpenseDetailsRangeRef_(
                            range
                          )
                      });
                    }
                  }
                );
            }
          );
      }
    );


  /*
   * ==========================================================
   * 6. OLD CACHE SNAPSHOT CHECK
   * ==========================================================
   */

  const oldValues =
    oldRange.getValues();


  let oldNonEmptyCells =
    0;


  oldValues.forEach(
    function(row) {

      row.forEach(
        function(value) {

          if (
            value !== '' &&
            value !== null
          ) {

            oldNonEmptyCells++;
          }
        }
      );
    }
  );


  /*
   * ==========================================================
   * FINAL DECISION
   * ==========================================================
   */

  const targetSafe =
    occupiedCells === 0 &&
    targetHasMergedCells === false &&
    namedRangeConflicts.length === 0 &&
    chartRangeConflicts.length === 0;


  const sourceCorrect =
    currentlyOnOldRange ||
    alreadyOnNewRange;


  const safeToMigrate =
    targetSafe &&
    sourceCorrect &&
    chartRanges.length === 1 &&
    chartId !== null;


  const result = {

    ok:
      true,

    mode:
      'EXPENSE_CACHE_MIGRATION_PREFLIGHT',

    chartId:
      chartId,

    chartRangeCount:
      chartRanges.length,

    currentCacheRange:
      currentRangeRef,

    expectedOldRange:
      dashboardExpenseDetailsRangeRef_(
        oldRange
      ),

    expectedNewRange:
      dashboardExpenseDetailsRangeRef_(
        newRange
      ),

    currentlyOnOldRange:
      currentlyOnOldRange,

    alreadyOnNewRange:
      alreadyOnNewRange,

    oldNonEmptyCells:
      oldNonEmptyCells,

    targetOccupiedCells:
      occupiedCells,

    targetFormulaCells:
      formulaCells,

    targetNoteCells:
      noteCells,

    targetValidationCells:
      validationCells,

    targetOccupiedExamples:
      occupiedExamples,

    targetHasMergedCells:
      targetHasMergedCells,

    namedRangeConflicts:
      namedRangeConflicts,

    chartRangeConflicts:
      chartRangeConflicts,

    targetSafe:
      targetSafe,

    sourceCorrect:
      sourceCorrect,

    safeToMigrate:
      safeToMigrate,

    noCellsWritten:
      true,

    noChartsModified:
      true,

    noImagesModified:
      true,

    noTriggersModified:
      true
  };


  Logger.log(
    'dashboardExpenseDetailsCacheMigrationAudit: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}

function dashboardExpenseDetailsRefresh() {

  return dashboardExpenseDetailsRefreshChartData();
}


function dashboardExpenseDetailsRepairChart() {
  return dashboardExpenseDetailsInstall();
}


function dashboardExpenseDetailsBindExistingChart() {
  return dashboardExpenseDetailsInstall();
}
function dashboardExpenseDetailsBuildArticleMapV1_() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const mappingSheet =
    spreadsheet
      .getSheets()
      .find(function(sheet) {
        const normalizedName =
          dashboardExpenseDetailsNormalize_(
            sheet.getName()
          )
            .replace(/[ `’']/g, '');

        return normalizedName === 'мапінг';
      });

  if (!mappingSheet) {
    throw new Error(
      'Не знайдено лист «Мапінг».'
    );
  }

  const rows =
    mappingSheet
      .getDataRange()
      .getDisplayValues();

  const articleMap =
    Object.create(null);

  for (
    let rowIndex = 1;
    rowIndex < rows.length;
    rowIndex++
  ) {
    const sourceArticle =
      dashboardExpenseDetailsNormalizeArticleKeyV1_(
        rows[rowIndex][0]
      );

    const plArticle =
      dashboardExpenseDetailsClean_(
        rows[rowIndex][3]
      );

    if (
      sourceArticle &&
      plArticle
    ) {
      articleMap[sourceArticle] =
        plArticle;
    }
  }

  return articleMap;
}


function dashboardExpenseDetailsNormalizeArticleKeyV1_(
  value
) {
  return dashboardExpenseDetailsNormalize_(
    value
  )
    .replace(/[.,;:]+$/g, '')
    .trim();
}


function dashboardExpenseDetailsResolveMappedArticleV1_(
  rawArticle,
  articleMap
 ) {
  const rawValue =
    dashboardExpenseDetailsClean_(
      rawArticle
    );

  if (!rawValue) {
    return 'Без статті';
  }

  const mappedArticle =
    articleMap[
      dashboardExpenseDetailsNormalizeArticleKeyV1_(
        rawValue
      )
    ];

  return mappedArticle || rawValue;
}
/**
 * ============================================================
 * EXPENSE DETAILS V1
 *
 * Категорія контролюється P&L.
 * Статті та кількість операцій беруться з Бази операцій.
 *
 * Якщо сума статей не дорівнює категорії P&L —
 * оновлення діаграми блокується помилкою.
 * ============================================================
 */
function dashboardExpenseDetailsBuildMappedOperationsArticlesV1_(
  sourceSheet,
  selectedCategory,
  period,
  plModel
) {
  const values =
    sourceSheet
      .getDataRange()
      .getValues();

  if (values.length < 2) {
    throw new Error(
      'База операцій не містить робочих рядків.'
    );
  }

  const indexes =
    proFinPlCoreResolveIndexes_(
      values[0]
    );

  const normalizedPeriod =
    proFinPlCoreNormalizePeriod_(
      period
    );

  const fullCalendarMonths =
    proFinPlCoreIsFullMonthPeriod_(
      normalizedPeriod
    );

  const selectedCategoryKey =
    dashboardExpenseDetailsNormalize_(
      selectedCategory
    );

  const plCategory =
    plModel.expense.categories.find(
      function(item) {
        return (
          dashboardExpenseDetailsNormalize_(
            item.category
          ) === selectedCategoryKey
        );
      }
    );

  if (!plCategory) {
    throw new Error(
      'У P&L не знайдено категорію витрат «' +
      selectedCategory +
      '».'
    );
  }

  const grouped =
  Object.create(null);

const articleMap =
  dashboardExpenseDetailsBuildArticleMapV1_();

let totalOperations = 0;
  let invalidAmountRows = 0;

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const row = values[rowIndex];

    if (
      indexes.status >= 0 &&
      proFinPlCoreIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      continue;
    }

    const transactionType =
      proFinPlCoreNormalize_(
        row[indexes.type]
      );

    const accountingType =
      indexes.accountingType >= 0
        ? proFinPlCoreNormalize_(
            row[indexes.accountingType]
          )
        : '';

    const direction =
      proFinPlCoreClassifyDirection_(
        transactionType,
        accountingType
      );

    if (direction !== 'EXPENSE') {
      continue;
    }

    const transactionDate =
      proFinPlCoreDateOnly_(
        row[indexes.date]
      );

    const accrualMonth =
      indexes.accrualMonth >= 0
        ? proFinPlCoreMonthStart_(
            row[indexes.accrualMonth]
          )
        : null;

    let rowInPeriod = false;

    if (
      fullCalendarMonths &&
      accrualMonth
    ) {
      rowInPeriod =
        proFinPlCoreMonthInPeriod_(
          accrualMonth,
          normalizedPeriod
        );
    } else if (transactionDate) {
      rowInPeriod =
        proFinPlCoreDateInPeriod_(
          transactionDate,
          normalizedPeriod
        );
    }

    if (!rowInPeriod) {
      continue;
    }

    const rawCategory =
      proFinPlCoreClean_(
        row[indexes.category]
      );

    const rawArticle =
      indexes.article >= 0
        ? proFinPlCoreClean_(
            row[indexes.article]
          )
        : '';

    const canonicalCategory =
      proFinPlCoreCanonicalCategory_(
        'EXPENSE',
        transactionType,
        rawCategory,
        rawArticle
      );

    const mappedCategory =
      proFinPlCoreCanonicalPlExpenseLabel_(
        canonicalCategory
      );

    if (
      !dashboardExpenseDetailsCategoryMatchesV8_(
        mappedCategory,
        rawArticle,
        selectedCategory
      )
    ) {
      continue;
    }

    const rawAmount =
      proFinPlCoreNumber_(
        row[indexes.amount]
      );

    if (
      rawAmount === null ||
      !Number.isFinite(rawAmount)
    ) {
      invalidAmountRows++;
      continue;
    }

    if (rawAmount === 0) {
      continue;
    }

    const amount =
      Math.abs(rawAmount);

    const article =
  dashboardExpenseDetailsResolveMappedArticleV1_(
    rawArticle,
    articleMap
  );

    const articleKey =
      dashboardExpenseDetailsNormalize_(
        article
      );

    if (!grouped[articleKey]) {
      grouped[articleKey] = {
        label: article,
        category: plCategory.category,
        article: article,
        amount: 0,
        transactions: 0
      };
    }

    grouped[articleKey].amount += amount;
    grouped[articleKey].transactions++;
    totalOperations++;
  }

  const sourceItems =
    Object.keys(grouped)
      .map(function(key) {
        const item = grouped[key];

        return {
          label: item.label,
          category: item.category,
          article: item.article,
          amount: dashboardExpenseDetailsRound2_(
            item.amount
          ),
          transactions: item.transactions
        };
      })
      .filter(function(item) {
        return item.amount > 0;
      })
      .sort(function(first, second) {
        return (
          second.amount - first.amount ||
          first.label.localeCompare(
            second.label,
            'uk'
          )
        );
      });

  const operationsTotal =
    dashboardExpenseDetailsRound2_(
      sourceItems.reduce(
        function(sum, item) {
          return sum + item.amount;
        },
        0
      )
    );

  const plTotal =
    dashboardExpenseDetailsRound2_(
      Math.abs(
        Number(plCategory.amount) || 0
      )
    );

  const difference =
    dashboardExpenseDetailsRound2_(
      operationsTotal - plTotal
    );

  const tolerance =
    typeof PROFIN_PL_CORE_CFG !== 'undefined' &&
    PROFIN_PL_CORE_CFG.tolerance
      ? PROFIN_PL_CORE_CFG.tolerance
      : 0.01;

  if (
    Math.abs(difference) > tolerance
  ) {
    throw new Error(
      'Деталізація витрат не узгоджується з P&L. ' +
      'Категорія: «' +
      selectedCategory +
      '». ' +
      'P&L: ' +
      plTotal +
      '; База операцій: ' +
      operationsTotal +
      '; різниця: ' +
      difference +
      '. ' +
      'Операцій: ' +
      totalOperations +
      '; рядків із некоректною сумою: ' +
      invalidAmountRows +
      '.'
    );
  }

  return sourceItems;
}
/**
 * Розбір невідповідності:
 * P&L категорія ↔ База операцій.
 *
 * Нічого не записує.
 */
function dashboardExpenseDetailsAuditMappedOperationsV1() {
  const cfg =
    DASHBOARD_EXPENSE_DETAILS_CONFIG;

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sourceSheet =
    ss.getSheetByName(
      cfg.sourceSheetName
    );

  const dashboardSheet =
    ss.getSheetByName(
      cfg.dashboardSheetName
    );

  if (!sourceSheet || !dashboardSheet) {
    throw new Error(
      'Не знайдено необхідні листи для аудиту.'
    );
  }

  const selectedCategory =
    dashboardExpenseDetailsClean_(
      dashboardSheet
        .getRange(cfg.filter.cell)
        .getDisplayValue()
    );

  if (!selectedCategory) {
    throw new Error(
      'У F99 не обрано категорію витрат.'
    );
  }

  const period =
    dashboardCentralPeriodV1Build_();

  const plModel =
    proFinPlCoreCalculate_(
      period
    );

  const selectedCategoryKey =
    dashboardExpenseDetailsNormalize_(
      selectedCategory
    );

  const plCategory =
    plModel.expense.categories.find(
      function(item) {
        return (
          dashboardExpenseDetailsNormalize_(
            item.category
          ) === selectedCategoryKey
        );
      }
    );

  if (!plCategory) {
    throw new Error(
      'Категорію «' +
      selectedCategory +
      '» не знайдено в P&L.'
    );
  }

  const values =
    sourceSheet
      .getDataRange()
      .getValues();

  const indexes =
    proFinPlCoreResolveIndexes_(
      values[0]
    );

  const normalizedPeriod =
    proFinPlCoreNormalizePeriod_(
      period
    );

  const fullCalendarMonths =
    proFinPlCoreIsFullMonthPeriod_(
      normalizedPeriod
    );

  const rows = [];
  const byArticle = {};
  let invalidAmountRows = 0;

  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {
    const row = values[rowIndex];

    if (
      indexes.status >= 0 &&
      proFinPlCoreIsExcludedStatus_(
        row[indexes.status]
      )
    ) {
      continue;
    }

    const transactionType =
      proFinPlCoreNormalize_(
        row[indexes.type]
      );

    const accountingType =
      indexes.accountingType >= 0
        ? proFinPlCoreNormalize_(
            row[indexes.accountingType]
          )
        : '';

    if (
      proFinPlCoreClassifyDirection_(
        transactionType,
        accountingType
      ) !== 'EXPENSE'
    ) {
      continue;
    }

    const transactionDate =
      proFinPlCoreDateOnly_(
        row[indexes.date]
      );

    const accrualMonth =
      indexes.accrualMonth >= 0
        ? proFinPlCoreMonthStart_(
            row[indexes.accrualMonth]
          )
        : null;

    let rowInPeriod = false;

    if (
      fullCalendarMonths &&
      accrualMonth
    ) {
      rowInPeriod =
        proFinPlCoreMonthInPeriod_(
          accrualMonth,
          normalizedPeriod
        );
    } else if (transactionDate) {
      rowInPeriod =
        proFinPlCoreDateInPeriod_(
          transactionDate,
          normalizedPeriod
        );
    }

    if (!rowInPeriod) {
      continue;
    }

    const rawCategory =
      proFinPlCoreClean_(
        row[indexes.category]
      );

    const rawArticle =
      indexes.article >= 0
        ? proFinPlCoreClean_(
            row[indexes.article]
          )
        : '';

    const canonicalCategory =
      proFinPlCoreCanonicalCategory_(
        'EXPENSE',
        transactionType,
        rawCategory,
        rawArticle
      );

    const mappedCategory =
      proFinPlCoreCanonicalPlExpenseLabel_(
        canonicalCategory
      );

    if (
      !dashboardExpenseDetailsCategoryMatchesV8_(
        mappedCategory,
        rawArticle,
        selectedCategory
      )
    ) {
      continue;
    }

    const amount =
      proFinPlCoreNumber_(
        row[indexes.amount]
      );

    if (
      amount === null ||
      !Number.isFinite(amount)
    ) {
      invalidAmountRows++;
      continue;
    }

    if (amount === 0) {
      continue;
    }

    const article =
      rawArticle || 'Без статті';

    const articleKey =
      dashboardExpenseDetailsNormalize_(
        article
      );

    if (!byArticle[articleKey]) {
      byArticle[articleKey] = {
        article: article,
        amount: 0,
        transactions: 0
      };
    }

    byArticle[articleKey].amount +=
      Math.abs(amount);

    byArticle[articleKey].transactions++;

    rows.push({
      sheetRow: rowIndex + 1,
      date: transactionDate
        ? Utilities.formatDate(
            transactionDate,
            Session.getScriptTimeZone(),
            'yyyy-MM-dd'
          )
        : null,
      accrualMonth: accrualMonth
        ? Utilities.formatDate(
            accrualMonth,
            Session.getScriptTimeZone(),
            'yyyy-MM'
          )
        : null,
      rawCategory: rawCategory,
      mappedCategory: mappedCategory,
      article: article,
      amount: Math.abs(amount)
    });
  }

  const articles =
    Object.keys(byArticle)
      .map(function(key) {
        return {
          article: byArticle[key].article,
          amount:
            dashboardExpenseDetailsRound2_(
              byArticle[key].amount
            ),
          transactions:
            byArticle[key].transactions
        };
      })
      .sort(function(first, second) {
        return second.amount - first.amount;
      });

  const operationsTotal =
    dashboardExpenseDetailsRound2_(
      articles.reduce(
        function(sum, item) {
          return sum + item.amount;
        },
        0
      )
    );

  const plTotal =
    dashboardExpenseDetailsRound2_(
      Math.abs(
        Number(plCategory.amount) || 0
      )
    );

  const result = {
    ok: true,
    selectedCategory: selectedCategory,
    period: {
      mode: period.mode,
      from: dashboardExpenseDetailsFormatAuditDateV1_(
        period.from
      ),
      to: dashboardExpenseDetailsFormatAuditDateV1_(
        period.to
      )
    },
    plTotal: plTotal,
    operationsTotal: operationsTotal,
    difference:
      dashboardExpenseDetailsRound2_(
        operationsTotal - plTotal
      ),
    matchedRows: rows.length,
    invalidAmountRows: invalidAmountRows,
    articles: articles,
    rows: rows,
    changesMade: false
  };

  Logger.log(
    'dashboardExpenseDetailsAuditMappedOperationsV1: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


function dashboardExpenseDetailsFormatAuditDateV1_(
  date
) {
  return date
    ? Utilities.formatDate(
        date,
        Session.getScriptTimeZone(),
        'dd.MM.yyyy'
      )
    : null;
}
/**
 * ============================================================
 * RECONCILIATION V1
 *
 * Порівнює статті категорії:
 * P&L ↔ База операцій.
 *
 * Нічого не змінює.
 * ============================================================
 */
function dashboardExpenseDetailsReconcileCategoryMappingV1() {
  const cfg =
    DASHBOARD_EXPENSE_DETAILS_CONFIG;

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const dashboard =
    ss.getSheetByName(
      cfg.dashboardSheetName
    );

  const sourceSheet =
    ss.getSheetByName(
      cfg.sourceSheetName
    );

  const selectedCategory =
    dashboardExpenseDetailsClean_(
      dashboard
        .getRange(cfg.filter.cell)
        .getDisplayValue()
    );

  if (!selectedCategory) {
    throw new Error(
      'У F99 не обрано категорію витрат.'
    );
  }

  const period =
    dashboardCentralPeriodV1Build_();

  const plModel =
    proFinPlCoreCalculate_(
      period
    );

  const selectedKey =
    dashboardExpenseDetailsNormalize_(
      selectedCategory
    );

  const plCategory =
    plModel.expense.categories.find(
      function(item) {
        return (
          dashboardExpenseDetailsNormalize_(
            item.category
          ) === selectedKey
        );
      }
    );

  if (!plCategory) {
    throw new Error(
      'Категорію «' +
      selectedCategory +
      '» не знайдено в P&L.'
    );
  }

  const operationsAudit =
    dashboardExpenseDetailsAuditMappedOperationsV1();

  const articleMap =
  dashboardExpenseDetailsBuildArticleMapV1_();

const plArticles = {};
const operationsArticles = {};

  (plCategory.articles || [])
    .forEach(function(item) {
      const key =
        dashboardExpenseDetailsNormalize_(
          item.article
        );

      plArticles[key] = {
        article: item.article,
        amount:
          dashboardExpenseDetailsRound2_(
            Number(item.amount) || 0
          ),
        transactions:
          item.transactions || 0
      };
    });

  (operationsAudit.articles || [])
  .forEach(function(item) {
    const mappedArticle =
      dashboardExpenseDetailsResolveMappedArticleV1_(
        item.article,
        articleMap
      );

    const key =
      dashboardExpenseDetailsNormalize_(
        mappedArticle
      );

    operationsArticles[key] = {
      article: mappedArticle,
      amount:
        dashboardExpenseDetailsRound2_(
          Number(item.amount) || 0
        ),
      transactions:
        item.transactions || 0
    };
  });

  const allKeys = {};

  Object.keys(plArticles)
    .forEach(function(key) {
      allKeys[key] = true;
    });

  Object.keys(operationsArticles)
    .forEach(function(key) {
      allKeys[key] = true;
    });

  const comparison =
    Object.keys(allKeys)
      .map(function(key) {
        const plItem =
          plArticles[key] || {
            article:
              operationsArticles[key].article,
            amount: 0,
            transactions: 0
          };

        const operationsItem =
          operationsArticles[key] || {
            article:
              plItem.article,
            amount: 0,
            transactions: 0
          };

        const difference =
          dashboardExpenseDetailsRound2_(
            operationsItem.amount -
            plItem.amount
          );

        let status = 'MATCH';

        if (
          plItem.amount === 0 &&
          operationsItem.amount !== 0
        ) {
          status =
            'OPERATION_PRESENT_ONLY';
        } else if (
          plItem.amount !== 0 &&
          operationsItem.amount === 0
        ) {
          status =
            'PL_PRESENT_ONLY';
        } else if (
          difference !== 0
        ) {
          status =
            'AMOUNT_DIFFERENCE';
        }

        return {
          article: operationsItem.article,
          plAmount: plItem.amount,
          operationsAmount: operationsItem.amount,
          difference: difference,
          plTransactions: plItem.transactions,
          operationTransactions:
            operationsItem.transactions,
          status: status
        };
      })
      .sort(function(first, second) {
        return (
          Math.abs(second.difference) -
          Math.abs(first.difference)
        );
      });

  const suspiciousArticles =
    comparison
      .filter(function(item) {
        return item.status !== 'MATCH';
      })
      .map(function(item) {
        return dashboardExpenseDetailsNormalize_(
          item.article
        );
      });

  const rowsForInvestigation =
    (operationsAudit.rows || [])
      .filter(function(row) {
        return (
          suspiciousArticles.indexOf(
            dashboardExpenseDetailsNormalize_(
  dashboardExpenseDetailsResolveMappedArticleV1_(
    row.article,
    articleMap
  )
)
          ) !== -1
        );
      });

  const result = {
    ok: true,
    selectedCategory: selectedCategory,
    period: {
      mode: period.mode,
      from:
        dashboardExpenseDetailsFormatAuditDateV1_(
          period.from
        ),
      to:
        dashboardExpenseDetailsFormatAuditDateV1_(
          period.to
        )
    },
    plTotal:
      dashboardExpenseDetailsRound2_(
        Math.abs(
          Number(plCategory.amount) || 0
        )
      ),
    operationsTotal:
      operationsAudit.operationsTotal,
    totalDifference:
      operationsAudit.difference,
    comparison: comparison,
    rowsForInvestigation: rowsForInvestigation,
    conclusion:
      'Операції зі статусами скасування, видалення або помилки ' +
      'не включалися. Свідоме виключення потрібно підтвердити ' +
      'окремим правилом або рядком P&L.',
    changesMade: false
  };

  Logger.log(
    'dashboardExpenseDetailsReconcileCategoryMappingV1: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
function restoreBaburkaDashboardDetailChartsAppearanceV1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName('Дашборд');
  const dataSheet = ss.getSheetByName('Дані дашборду');

  if (!dashboard || !dataSheet) {
    throw new Error('Не знайдено лист «Дашборд» або «Дані дашборду».');
  }

  const specs = [
    {
      name: 'incomeDetails',
      sourceA1: 'V1:W400',
      zone: { minRow: 72, maxRow: 95, minColumn: 5, maxColumn: 10 }
    },
    {
      name: 'expenseDetails',
      sourceA1: 'AP1:AQ100',
      zone: { minRow: 99, maxRow: 118, minColumn: 5, maxColumn: 8 }
    }
  ];

  const result = { ok: true, charts: [] };

  specs.forEach(function(spec) {
    const candidates = dashboard.getCharts().filter(function(chart) {
      const anchor = chart.getContainerInfo();
      const inTargetZone =
        anchor.getAnchorRow() >= spec.zone.minRow &&
        anchor.getAnchorRow() <= spec.zone.maxRow &&
        anchor.getAnchorColumn() >= spec.zone.minColumn &&
        anchor.getAnchorColumn() <= spec.zone.maxColumn;

      const ranges = chart.getRanges();
      const hasExpectedSource =
        ranges.length === 1 &&
        ranges[0].getSheet().getSheetId() === dataSheet.getSheetId() &&
        ranges[0].getA1Notation() === spec.sourceA1;

      return inTargetZone && hasExpectedSource;
    });

    if (candidates.length !== 1) {
      throw new Error(
        spec.name + ': знайдено діаграм ' +
        candidates.length + ', очікується одна.'
      );
    }

    const oldChart = candidates[0];

    const restoredChart = oldChart
      .modify()
      .clearRanges()
      .addRange(dataSheet.getRange(spec.sourceA1))
      .setChartType(Charts.ChartType.PIE)
      .setNumHeaders(1)
      .setTransposeRowsAndColumns(false)

      // Загальний стиль дашборду
      .setOption('fontName', 'Arial')
      .setOption('fontSize', 11)
      .setOption('backgroundColor', '#ffffff')
      .setOption('is3D', false)
      .setOption('pieHole', 0)
      .setOption('pieSliceText', 'percentage')
      .setOption('sliceVisibilityThreshold', 0)

      // Підписи-виноски, як у лівих діаграмах
      .setOption('legend', {
        position: 'labeled',
        textStyle: {
          color: '#000000',
          fontName: 'Arial',
          fontSize: 11
        }
      })

      .setOption('titleTextStyle', {
        color: '#000000',
        fontName: 'Arial',
        fontSize: 18,
        bold: true
      })
      .build();

    dashboard.updateChart(restoredChart);

    result.charts.push({
      name: spec.name,
      chartId: oldChart.getChartId(),
      source: 'Дані дашборду!' + spec.sourceA1,
      appearanceRestored: true
    });
  });

  SpreadsheetApp.flush();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}