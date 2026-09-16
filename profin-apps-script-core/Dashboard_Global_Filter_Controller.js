/**
 * ============================================================
 * ProFin OS 2026 — ГЛОБАЛЬНИЙ ФІЛЬТР ДАШБОРДУ
 * ============================================================
 *
 * Кнопка «Оновити Дашборд»:
 * dashboardGlobalFilterApply
 *
 * Кнопка «Очистити»:
 *   dashboardGlobalFilterClear
 *
 * Керуючі клітинки:
 *   Дашборд!E5 — період від
 *   Дашборд!E6 — період до
 *   Дашборд!F5 — конкретний день
 *   Дашборд!F6 — місяць
 *
 * Оновлює без створення та видалення діаграм:
 *   1) Доходи / Вакцини за період — Дані дашборду!Y1:Z3;
 *   2) Доходи вибраної категорії — Дані дашборду!V1:W400;
 *   3) Структура витрат — Дані дашборду!AA1:AB100;
 *   4) PNG-діаграму витрат через чинну
 *      dashboardExpenseDetailsRefreshChartData();
 *   5) «Цифри бізнесу» через чинну
 *      dashboardBusinessFiguresRefresh(), якщо період складається
 *      з повних календарних місяців;
 *   6) Таблицю вакцин із сумарним залишком менше 10 через чинну
 *      refreshDashboardLowStockVaccines().
 *
 * Первинні листи залишаються read-only.
 * Діаграми не перебудовуються: змінюються лише їхні дані.
 * ============================================================
 */

const DASHBOARD_GLOBAL_FILTER_CFG = Object.freeze({
  moduleVersion: 'DASHBOARD_GLOBAL_FILTER_V7_PL_CORE_ALL_CHARTS_2026',

  stateProperties: {
    globalActive:
      'PROFIN_DASH_GLOBAL_FILTER_ACTIVE'
  },

  sheets: {
    dashboard: 'Дашборд',
    operations: 'База операцій',
    data: 'Дані дашборду'
  },

  controls: {
    dateFrom: 'E5',
    dateTo: 'E6',
    day: 'F5',
    month: 'F6',
    reportYear: 2026
  },

  namedRanges: {
    dateFrom: 'DASH_DATE_FROM',
    dateTo: 'DASH_DATE_TO',
    day: 'DASH_GLOBAL_DAY',
    month: 'DASH_GLOBAL_MONTH'
  },

  localIncomeControls: {
  /*
   * Єдиний локальний фільтр доходів.
   *
   * Період визначає тільки
   * глобальний фільтр E5:E6/F5/F6.
   */
  category:
    'F72'
},

  technicalRanges: {
  incomeDetails: 'V1:W400',
  incomePeriod: 'Y1:Z100',
  expenseStructure: 'AA1:AB100'
},

  monthNames: [
    'Січень',
    'Лютий',
    'Березень',
    'Квітень',
    'Травень',
    'Червень',
    'Липень',
    'Серпень',
    'Вересень',
    'Жовтень',
    'Листопад',
    'Грудень'
  ],

  excludedStatusFragments: [
    'скас',
    'ануль',
    'видален',
    'чернет',
    'помил',
    'відхилен'
  ],

  typeAliases: {
    income: ['доходи', 'дохід'],
    expense: ['витрати', 'витрата'],
    collection: ['інкасація'],
    vaccine: ['вакцина', 'вакцини']
  },

  lockTimeoutMs: 30000
});


/**
 * ============================================================
 * 1. ОДНОРАЗОВЕ НАЛАШТУВАННЯ
 * ============================================================
 */
function dashboardGlobalFilterInstall() {
  const context = dashboardGlobalFilterContext_();

  dashboardGlobalFilterEnsureNamedRange_(
    context.ss,
    DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.dateFrom,
    context.dateFromRange
  );

  dashboardGlobalFilterEnsureNamedRange_(
    context.ss,
    DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.dateTo,
    context.dateToRange
  );

  dashboardGlobalFilterEnsureNamedRange_(
    context.ss,
    DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.day,
    context.dayRange
  );

  dashboardGlobalFilterEnsureNamedRange_(
    context.ss,
    DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.month,
    context.monthRange
  );

  context.dateFromRange.setNumberFormat('dd.MM.yyyy');
  context.dateToRange.setNumberFormat('dd.MM.yyyy');

  const dayRule = SpreadsheetApp
    .newDataValidation()
    .requireDate()
    .setAllowInvalid(false)
    .setHelpText(
      'Оберіть конкретний день.'
    )
    .build();

  context.dayRange
    .setDataValidation(dayRule)
    .setNumberFormat('dd.MM.yyyy');

  const monthRule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(
      DASHBOARD_GLOBAL_FILTER_CFG.monthNames,
      true
    )
    .setAllowInvalid(false)
    .setHelpText(
      'Оберіть місяць або залиште поле порожнім і виберіть день чи задайте період.'
    )
    .build();

  context.monthRange
  .setDataValidation(monthRule)
  .setNumberFormat('@');

/*
 * Старий локальний місячний
 * фільтр доходів H66 більше
 * не використовується.
 *
 * Форматування клітинки не чіпаємо.
 */
const legacyIncomeMonthCell =
  context.dashboardSheet.getRange(
    'H66'
  );

legacyIncomeMonthCell
  .clearContent();

legacyIncomeMonthCell
  .clearDataValidations();

legacyIncomeMonthCell
  .clearNote();

/*
 * Прибираємо також старий
 * пошкоджений named range
 * DASH_INCOME_MONTH.
 */
context.ss
  .getNamedRanges()
  .forEach(function(namedRange) {
    if (
      namedRange.getName() ===
      'DASH_INCOME_MONTH'
    ) {
      namedRange.remove();
    }
  });

SpreadsheetApp.flush();


  const result = {
    ok: true,
    moduleVersion: DASHBOARD_GLOBAL_FILTER_CFG.moduleVersion,
    controls: {
      dateFrom: dashboardGlobalFilterRangeRef_(context.dateFromRange),
      dateTo: dashboardGlobalFilterRangeRef_(context.dateToRange),
      day: dashboardGlobalFilterRangeRef_(context.dayRange),
      month: dashboardGlobalFilterRangeRef_(context.monthRange)
    },
    buttonFunctions: {
      apply: 'dashboardGlobalFilterApply',
      clear: 'dashboardGlobalFilterClear'
    },
    chartsCreated: false,
    chartsRemoved: false,
    noSourceCellsWritten: true
  };

  Logger.log(
    'dashboardGlobalFilterInstall: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * ============================================================
 * 2. КНОПКА «ОНОВИТИ ДАШБОРД»
 * ============================================================
 */
function dashboardGlobalFilterApply() {
  const scriptLock = LockService.getScriptLock();

  if (!scriptLock.tryLock(DASHBOARD_GLOBAL_FILTER_CFG.lockTimeoutMs)) {
    throw new Error(
      'Інше глобальне оновлення Дашборду ще виконується.'
    );
  }

  const startedAt = Date.now();

  try {
    const context = dashboardGlobalFilterContext_();

    dashboardGlobalFilterEnsureNamedRange_(
      context.ss,
      DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.dateFrom,
      context.dateFromRange
    );

    dashboardGlobalFilterEnsureNamedRange_(
      context.ss,
      DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.dateTo,
      context.dateToRange
    );

    dashboardGlobalFilterEnsureNamedRange_(
      context.ss,
      DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.day,
      context.dayRange
    );

    dashboardGlobalFilterEnsureNamedRange_(
      context.ss,
      DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.month,
      context.monthRange
    );

      /*
     * Кнопка «Оновити Дашборд» повинна працювати навіть тоді,
     * коли користувач ще не заповнив жодне поле фільтра.
     * У такому випадку використовуємо поточний календарний місяць.
     */
   const period =
  dashboardGlobalFilterResolveApplyPeriod_(
    context
  );

/*
 * Новий центральний фільтр працює
 * без запису дат у E5:E6.
 *
 * E6 — квартал.
 * F6 — місяць.
 *
 * period передається модулям
 * лише як об’єкт розрахункового контексту.
 */
    /*
     * Глобальний період успішно застосований.
     *
     * Від цього моменту локальні фільтри
     * H66 / H71 / I92 працюють уже
     * всередині глобального періоду.
     */
    const nativeResult =
  dashboardGlobalFilterRefreshNativeCaches_(
    context,
    period
  );
    const committedStateV8 =
  dashboardFilterCoordinatorCommitGlobal_(
    period
  );

    const steps = {
      nativeCaches: {
        ok: true,
        value: nativeResult
      },


      expenseDetails:
        dashboardGlobalFilterRunStep_(
          'dashboardExpenseDetailsRefreshChartData',
          function() {
            if (
              typeof dashboardExpenseDetailsRefreshChartData !==
              'function'
            ) {
              return {
                skipped: true,
                reason:
                  'Функція dashboardExpenseDetailsRefreshChartData відсутня.'
              };
            }

            return dashboardExpenseDetailsRefreshChartData({

            lockHeld:
            true,

            period:
            period,

            globalRevision:
            committedStateV8.revision,

            globalFilterActive:
            true,

            source:
            'GLOBAL_APPLY_V8'
            });
          }
        ),

      businessFigures:
  dashboardGlobalFilterRunStep_(
    'dashboardBusinessFiguresRefresh',
    function() {

      /*
       * ======================================================
       * ПОВНИЙ КАЛЕНДАРНИЙ МІСЯЦЬ / МІСЯЦІ
       * ======================================================
       *
       * Можемо оновити весь блок:
       *
       * - фінанси;
       * - активи;
       * - вакцини.
       */
      if (
        dashboardGlobalFilterIsFullMonthRange_(
          period
        )
      ) {
        if (
          typeof dashboardBusinessFiguresRefresh !==
            'function'
        ) {
          return {
            skipped:
              true,

            reason:
              'Функція dashboardBusinessFiguresRefresh відсутня.'
          };
        }

        return dashboardBusinessFiguresRefresh(
          period
        );
      }


      /*
       * ======================================================
       * DAY / НЕПОВНИЙ RANGE
       * ======================================================
       *
       * P&L не вміє коректно формувати
       * денні фінансові KPI.
       *
       * Але вакцинні KPI мають точні
       * первинні джерела з датами.
       *
       * Тому оновлюємо ТІЛЬКИ:
       *
       * B16 — вакцини на складі;
       * D16 — вакцини на зберіганні;
       * E16 — вакцини продано.
       */
      if (
        typeof dashboardBusinessFiguresRefreshVaccines !==
          'function'
      ) {
        return {
          skipped:
            true,

          reason:
            'Функція dashboardBusinessFiguresRefreshVaccines відсутня.'
        };
      }


      return dashboardBusinessFiguresRefreshVaccines(
        period
      );
    }
  ),

              doctorPayroll:
        dashboardGlobalFilterRunStep_(
          'refreshDashboardDoctorPayroll',
          function() {
            return dashboardGlobalFilterRefreshDoctorPayroll_(
              period
            );
          }
        ),


        lowStockVaccines:
        dashboardGlobalFilterRunStep_(
          'refreshDashboardLowStockVaccines',
          function() {
            if (
              typeof refreshDashboardLowStockVaccines !==
              'function'
            ) {
              throw new Error(
                'Функція refreshDashboardLowStockVaccines відсутня.'
              );
            }

            /*
             * Передаємо у модуль вакцин той самий період,
             * який використовується всіма блоками Дашборду.
             *
             * Модуль вакцин фільтрує партії за колонкою
             * «Дата надходження» та виключає статус «Закрита».
             */
            return refreshDashboardLowStockVaccines({
              showToast: false,

              period: {
                mode: period.mode,
                from: new Date(period.from.getTime()),
                to: new Date(period.to.getTime()),
                source: period.source
              }
            });
          }
              ),

           productsTests:
        dashboardGlobalFilterRunStep_(
          'refreshDashboardProductsTests',
          function() {
            if (
              typeof refreshDashboardProductsTests !==
              'function'
            ) {
              throw new Error(
                'Функція refreshDashboardProductsTests відсутня.'
              );
            }

            return refreshDashboardProductsTests({
              showToast: false,

              period: {
                mode: period.mode,
                from: new Date(period.from.getTime()),
                to: new Date(period.to.getTime()),
                source: period.source
              }
            });
          }
        ),

        interbranchSettlements:
        dashboardGlobalFilterRunStep_(
          'refreshInterbranchSettlementDashboardCards',
          function() {
            if (
              typeof refreshInterbranchSettlementDashboardCardsForSpreadsheet_ !==
              'function'
            ) {
              throw new Error(
                'Функція refreshInterbranchSettlementDashboardCardsForSpreadsheet_ відсутня.'
              );
            }

            return refreshInterbranchSettlementDashboardCardsForSpreadsheet_(
              context.ss,

              {
                mode: period.mode,
                from: new Date(period.from.getTime()),
                to: new Date(period.to.getTime()),
                source: period.source
              }
            );
          }
        )
      };

    SpreadsheetApp.flush();

    /*
     * PNG уже замінено на сервері.
     * Тепер примусово перемальовуємо відкритий Дашборд,
     * щоб нове зображення з’явилося без перезавантаження.
     */
    steps.expenseImageRepaint =
      dashboardGlobalFilterRunStep_(
        'dashboardGlobalFilterForceExpenseImageRepaint_',
        function() {
          if (
            !steps.expenseDetails.ok ||
            (
              steps.expenseDetails.value &&
              steps.expenseDetails.value.skipped
            )
          ) {
            return {
              skipped: true,
              reason:
                'PNG-діаграма витрат не оновлювалася.'
            };
          }

          return dashboardGlobalFilterForceExpenseImageRepaint_(
            context
          );
        }
      );

      steps.fixedButtons =
  dashboardGlobalFilterRunStep_(
    'dashboardGlobalFilterRestoreFixedButtons_',
    function() {
      return dashboardGlobalFilterRestoreFixedButtons_();
    }
  );

    const result = {
    ok:
    steps.nativeCaches.ok &&
    steps.expenseDetails.ok &&
    steps.businessFigures.ok &&
    steps.doctorPayroll.ok &&
    steps.lowStockVaccines.ok &&
    steps.productsTests.ok &&
    steps.interbranchSettlements.ok &&
    steps.expenseImageRepaint.ok &&
    steps.fixedButtons.ok,

      moduleVersion:
        DASHBOARD_GLOBAL_FILTER_CFG.moduleVersion,

      mode:
        'APPLY',

      period:
        dashboardGlobalFilterPeriodResult_(period),

      steps:
        steps,

      chartsCreated:
        false,

      chartsRemoved:
        false,

      sourceSheetsChanged:
        false,

      durationMs:
        Date.now() - startedAt
    };

        context.ss.toast(
      result.ok
        ? 'Дашборд оновлено'
        : 'Дашборд оновлено частково — перевірте журнал',
      'ProFin OS',
      5
    );

    Logger.log(
      'dashboardGlobalFilterApply: ' +
      JSON.stringify(result, null, 2)
    );

    return result;

  } finally {
    scriptLock.releaseLock();
  }
}


/**
 * ============================================================
 * 3. КНОПКА «ОЧИСТИТИ»
 * ============================================================
 */
function dashboardGlobalFilterClear() {
  const scriptLock = LockService.getScriptLock();

  if (!scriptLock.tryLock(DASHBOARD_GLOBAL_FILTER_CFG.lockTimeoutMs)) {
    throw new Error(
      'Інше глобальне оновлення Дашборду ще виконується.'
    );
  }

  const startedAt = Date.now();

  try {
    const context = dashboardGlobalFilterContext_();

context.dateFromRange.clearContent();
context.dateToRange.clearContent();
context.dayRange.clearContent();
context.monthRange.clearContent();

/*
 * F72 та I92 НЕ очищаємо.
 *
 * Категорійні фільтри залишаються
 * вибраними після очищення
 * глобального періоду.
 *
 * Локального місяця доходів
 * більше немає.
 */
const committedStateV8 =
  dashboardFilterCoordinatorCommitClear_();

/*
 * Після очищення секторні діаграми показують увесь
     * доступний період «Бази операцій».
     */
    const period = dashboardGlobalFilterResolvePeriod_(
      context,
      true
    );

    const nativeResult =
      dashboardGlobalFilterRefreshNativeCaches_(
        context,
        period
      );

    const steps = {
      nativeCaches: {
        ok: true,
        value: nativeResult
      },

      expenseDetails:
        dashboardGlobalFilterRunStep_(
          'dashboardExpenseDetailsRefreshChartData',
          function() {
            if (
              typeof dashboardExpenseDetailsRefreshChartData !==
              'function'
            ) {
              return {
                skipped: true,
                reason:
                  'Функція dashboardExpenseDetailsRefreshChartData відсутня.'
              };
            }

            return dashboardExpenseDetailsRefreshChartData({

            lockHeld:
            true,

            period:
            period,

            globalRevision:
            committedStateV8.revision,

            globalFilterActive:
            false,

            source:
           'GLOBAL_CLEAR_V8'
           });
          }
        ),

              businessFigures:
        dashboardGlobalFilterRunStep_(
          'dashboardBusinessFiguresRefresh',
          function() {
            if (
              typeof dashboardBusinessFiguresRefresh !==
              'function'
            ) {
              return {
                skipped: true,
                reason:
                  'Функція dashboardBusinessFiguresRefresh відсутня.'
              };
            }

            /*
             * За порожніх E5/E6/F5/F6 чинний модуль сам вибирає
             * останній місяць із фактом P&L.
             */
            return dashboardBusinessFiguresRefresh();
          }
        ),

      doctorPayroll:
        dashboardGlobalFilterRunStep_(
          'refreshDashboardDoctorPayroll',
          function() {
            return dashboardGlobalFilterRefreshDoctorPayroll_(
              period
            );
          }
        )
    };

    SpreadsheetApp.flush();

    /*
     * Після очищення періоду створено новий PNG
     * для повного доступного діапазону.
     *
     * Примусово перемальовуємо відкритий Дашборд,
     * щоб зображення повернулося одразу.
     */
    steps.expenseImageRepaint =
      dashboardGlobalFilterRunStep_(
        'dashboardGlobalFilterForceExpenseImageRepaint_',
        function() {
          if (
            !steps.expenseDetails.ok ||
            (
              steps.expenseDetails.value &&
              steps.expenseDetails.value.skipped
            )
          ) {
            return {
              skipped: true,
              reason:
                'PNG-діаграма витрат не оновлювалася.'
            };
          }

          return dashboardGlobalFilterForceExpenseImageRepaint_(
            context
          );
        }
      );
steps.fixedButtons =
  dashboardGlobalFilterRunStep_(
    'dashboardGlobalFilterRestoreFixedButtons_',
    function() {
      return dashboardGlobalFilterRestoreFixedButtons_();
    }
  );
    const result = {
  ok:
    steps.nativeCaches.ok &&
    steps.expenseDetails.ok &&
    steps.businessFigures.ok &&
    steps.doctorPayroll.ok &&
    steps.expenseImageRepaint.ok &&
    steps.fixedButtons.ok,
        
      moduleVersion:
        DASHBOARD_GLOBAL_FILTER_CFG.moduleVersion,

      mode:
        'CLEAR',

      chartPeriod:
        dashboardGlobalFilterPeriodResult_(period),

      steps:
        steps,

      controlsCleared:
        true,

      chartsCreated:
        false,

      chartsRemoved:
        false,

      sourceSheetsChanged:
        false,

      durationMs:
        Date.now() - startedAt
    };

    context.ss.toast(
      result.ok
        ? 'Фільтр Дашборду очищено'
        : 'Фільтр очищено частково — перевірте журнал',
      'ProFin OS',
      5
    );

    Logger.log(
      'dashboardGlobalFilterClear: ' +
      JSON.stringify(result, null, 2)
    );

    return result;

  } finally {
    scriptLock.releaseLock();
  }
}


/**
 * ============================================================
 * 4. DRY RUN
 * ============================================================
 */
function dashboardGlobalFilterDryRun() {
  const context = dashboardGlobalFilterContext_();
  const period = dashboardGlobalFilterResolvePeriod_(
    context,
    true
  );

/*
 * ============================================================
 * ОДИН P&L CORE ДЛЯ ВСІХ ТРЬОХ NATIVE DATASETS
 * ============================================================
 *
 * MONTH / повні календарні місяці
 *   -> готовий Fact P&L.
 *
 * DAY / неповний RANGE
 *   -> transaction-date logic того самого Core.
 */
const plModel =
  proFinPlCoreCalculate_(
    period
  );


const incomePeriod =
  dashboardGlobalFilterBuildIncomePeriodData_(
    null,
    period,
    plModel
  );


const incomeDetails =
  dashboardGlobalFilterBuildIncomeDetailsData_(
    context,
    null,
    period,
    plModel
  );


const expenseStructure =
  dashboardGlobalFilterBuildExpenseStructureData_(
    null,
    period,
    plModel
  );

  const result = {
    ok: true,
    moduleVersion: DASHBOARD_GLOBAL_FILTER_CFG.moduleVersion,
    period:
  dashboardGlobalFilterPeriodResult_(
    period
  ),

plCoreVersion:
  plModel.version,

plCoreBasis:
  plModel.basis,

expenseSourceOfTruth:
  expenseStructure.sourceOfTruth,

previews: {
      incomePeriod: incomePeriod.output,
      incomeDetails: incomeDetails.output.slice(0, 30),
      expenseStructure: expenseStructure.output.slice(0, 30)
    },
    counts: {
      incomeTransactions: incomePeriod.incomeTransactions,
      vaccineTransactions: incomePeriod.vaccineTransactions,
      incomeDetailTransactions: incomeDetails.totalTransactions,
      expenseTransactions: expenseStructure.totalTransactions
    },
    noCellsWritten: true
  };

  Logger.log(
    'dashboardGlobalFilterDryRun: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * ============================================================
 * 5. АУДИТ
 * ============================================================
 */
function dashboardGlobalFilterAudit() {
  const context = dashboardGlobalFilterContext_();

  const expected = {
    incomeDetails:
      context.dataSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .technicalRanges
          .incomeDetails
      ),

    incomePeriod:
      context.dataSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .technicalRanges
          .incomePeriod
      ),

    expenseStructure:
      context.dataSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .technicalRanges
          .expenseStructure
      )
  };

  const charts = context.dashboardSheet
    .getCharts()
    .map(function(chart) {
      return {
        chartId: chart.getChartId(),
        anchor:
          chart.getContainerInfo().getAnchorRow() +
          ':' +
          chart.getContainerInfo().getAnchorColumn(),
        title:
          dashboardGlobalFilterClean_(
            chart.getOptions().get('title')
          ),
        ranges:
          chart.getRanges().map(
            dashboardGlobalFilterRangeRef_
          )
      };
    });

  const result = {
    ok:
      dashboardGlobalFilterSameRange_(
        context.ss.getRangeByName(
          DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.dateFrom
        ),
        context.dateFromRange
      ) &&
      dashboardGlobalFilterSameRange_(
        context.ss.getRangeByName(
          DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.dateTo
        ),
        context.dateToRange
      ) &&
      dashboardGlobalFilterSameRange_(
        context.ss.getRangeByName(
          DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.day
        ),
        context.dayRange
      ) &&
      dashboardGlobalFilterSameRange_(
        context.ss.getRangeByName(
          DASHBOARD_GLOBAL_FILTER_CFG.namedRanges.month
        ),
        context.monthRange
      ),

    moduleVersion:
      DASHBOARD_GLOBAL_FILTER_CFG.moduleVersion,

    controls: {
      dateFrom: {
        range:
          dashboardGlobalFilterRangeRef_(
            context.dateFromRange
          ),
        value:
          context.dateFromRange.getDisplayValue()
      },
      dateTo: {
        range:
          dashboardGlobalFilterRangeRef_(
            context.dateToRange
          ),
        value:
          context.dateToRange.getDisplayValue()
      },
      day: {
        range:
          dashboardGlobalFilterRangeRef_(
            context.dayRange
          ),
        value:
          context.dayRange.getDisplayValue(),
        validation:
          !!context.dayRange.getDataValidation()
      },
      month: {
        range:
          dashboardGlobalFilterRangeRef_(
            context.monthRange
          ),
        value:
          context.monthRange.getDisplayValue(),
        validation:
          !!context.monthRange.getDataValidation()
      }
    },

    technicalRanges: {
      incomeDetails:
        dashboardGlobalFilterRangeRef_(
          expected.incomeDetails
        ),
      incomePeriod:
        dashboardGlobalFilterRangeRef_(
          expected.incomePeriod
        ),
      expenseStructure:
        dashboardGlobalFilterRangeRef_(
          expected.expenseStructure
        )
    },

    charts:
      charts,

    obsoleteHandlerPresent:
      typeof dashboardIncomeSectorHandleEdit_ ===
      'function',

    buttonFunctions: {
      apply: 'dashboardGlobalFilterApply',
      clear: 'dashboardGlobalFilterClear'
    },

    noCellsWritten:
      true
  };

  Logger.log(
    'dashboardGlobalFilterAudit: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * ============================================================
 * 6. ОБРОБНИК РЕДАГУВАННЯ КЕРУЮЧИХ КЛІТИНОК
 * ============================================================
 *
 * Не оновлює діаграми. Лише не дає одночасно залишити
 * суперечливі фільтри дня, місяця та періоду.
 *
 * Додайте один виклик до чинного onEdit(e):
 *
 *   dashboardGlobalFilterHandleEdit_(e);
 */
function dashboardGlobalFilterHandleEdit_(e) {
  if (!e || !e.range) {
    return null;
  }

  const cfg = DASHBOARD_GLOBAL_FILTER_CFG;

  if (
    e.range.getSheet().getName() !==
    cfg.sheets.dashboard
  ) {
    return null;
  }

 const a1 = e.range.getA1Notation();
const sheet = e.range.getSheet();
const hasValue = !!dashboardGlobalFilterClean_(
  e.range.getDisplayValue()
);
/*
 * F99 — локальна категорія витрат.
 * При зміні оновлюємо праву діаграму
 * деталізації витрат.
 */
if (
  typeof dashboardExpenseDetailsHandleEdit_ ===
  'function'
) {
  const expenseResult =
    dashboardExpenseDetailsHandleEdit_(e);

  if (
    expenseResult &&
    expenseResult.handled === true
  ) {
    return expenseResult;
  }
}
/*
 * Якщо користувач почав змінювати
 * новий глобальний фільтр, попередній
 * застосований глобальний режим
 * більше не вважаємо активним.
 *
 * Новий глобальний режим активує
 * тільки кнопка «Оновити Дашборд».
 */

/*
 * Перевіряємо, чи дата операції
 * входить у період, переданий
 * глобальним фільтром Дашборду.
 *
 * DAY   -> F5
 * MONTH -> F6
 * RANGE -> E5:E6
 */
const localIncomeResult =
  dashboardGlobalFilterHandleLocalIncomeEdit_(
    e
  );

if (
  localIncomeResult &&
  localIncomeResult.handled === true
) {
  return localIncomeResult;
}

/*
 * F5 — окремий календарний день.
   * Він взаємовиключний із періодом E5:E6 та місяцем F6.
   */
  if (a1 === cfg.controls.day) {
    if (hasValue) {
      sheet.getRange(cfg.controls.dateFrom).clearContent();
      sheet.getRange(cfg.controls.dateTo).clearContent();
      sheet.getRange(cfg.controls.month).clearContent();
    }

    return {
      handled: true,
      control: 'DAY'
    };
  }

  /*
   * F6 — цілий календарний місяць.
   */
  if (a1 === cfg.controls.month) {
    if (hasValue) {
      sheet.getRange(cfg.controls.dateFrom).clearContent();
      sheet.getRange(cfg.controls.dateTo).clearContent();
      sheet.getRange(cfg.controls.day).clearContent();
    }

    return {
      handled: true,
      control: 'MONTH'
    };
  }

  /*
   * E5:E6 — довільний день або діапазон.
   */
  if (
    a1 === cfg.controls.dateFrom ||
    a1 === cfg.controls.dateTo
  ) {
    if (hasValue) {
      sheet.getRange(cfg.controls.day).clearContent();
      sheet.getRange(cfg.controls.month).clearContent();
    }

    return {
      handled: true,
      control: 'DATE_RANGE'
    };
  }

  return null;
}


function dashboardGlobalFilterHandleLocalIncomeEdit_(
  e
) {
  if (
    !e ||
    !e.range
  ) {
    return null;
  }

  const cfg =
    DASHBOARD_GLOBAL_FILTER_CFG;

  if (
    e.range
      .getSheet()
      .getName() !==
    cfg.sheets.dashboard
  ) {
    return null;
  }

  /*
   * Єдиний локальний контрол
   * доходів — F72.
   */
  if (
    e.range.getA1Notation() !==
    cfg.localIncomeControls.category
  ) {
    return null;
  }

  const context =
    dashboardGlobalFilterContext_();

  /*
   * Якщо глобальний період уже
   * застосовано кнопкою —
   * використовуємо його.
   *
   * Якщо ні —
   * категорія працює на всій
   * доступній історії.
   *
   * Заповнені, але ще НЕ застосовані
   * E5/E6/F5/F6 тут не використовуємо.
   */
  const period =
  dashboardGlobalFilterIsActive_()
    ? dashboardGlobalFilterResolvePeriod_(
        context,
        false
      )
    : dashboardGlobalFilterSourcePeriod_(
        context.operationsSheet
      );


/*
 * ============================================================
 * F72 → ЄДИНЕ P&L CORE
 * ============================================================
 *
 * При зміні локальної категорії
 * правої діаграми доходів
 * НЕ рахуємо дані окремо
 * з Бази операцій.
 *
 * Використовуємо те саме ядро,
 * що і кнопка глобального фільтра.
 */
const plModel =
  proFinPlCoreCalculate_(
    period
  );


const incomeDetails =
  dashboardGlobalFilterBuildIncomeDetailsData_(
    context,
    null,
    period,
    plModel
  );

  const targetRange =
    context.dataSheet.getRange(
      cfg.technicalRanges
        .incomeDetails
    );

  const snapshot =
    dashboardGlobalFilterSnapshotRange_(
      targetRange
    );

  try {
    dashboardGlobalFilterWriteFullRange_(
      targetRange,
      incomeDetails.output,
      '0'
    );

    SpreadsheetApp.flush();

    return {
      handled:
        true,

      scope:
        'LOCAL_INCOME',

      mode:
        dashboardGlobalFilterIsActive_()
          ? 'GLOBAL_PLUS_CATEGORY'
          : 'CATEGORY_ONLY_SOURCE_RANGE',

      category:
        context.dashboardSheet
          .getRange(
            cfg.localIncomeControls
              .category
          )
          .getDisplayValue(),

      period:
        dashboardGlobalFilterPeriodResult_(
          period
        ),

      transactions:
        incomeDetails
          .totalTransactions
    };

  } catch (error) {

    dashboardGlobalFilterRestoreRange_(
      targetRange,
      snapshot
    );

    SpreadsheetApp.flush();

    throw error;
  }
}


/**
 * ============================================================
 * 7. АТОМАРНЕ ОНОВЛЕННЯ ТРЬОХ НАТИВНИХ ДІАГРАМ
 * ============================================================
 */
function dashboardGlobalFilterRefreshNativeCaches_(
  context,
  period
) {
  const documentLock =
    LockService.getDocumentLock();

  if (
    !documentLock.tryLock(
      DASHBOARD_GLOBAL_FILTER_CFG.lockTimeoutMs
    )
  ) {
    throw new Error(
      'Не вдалося отримати блокування для оновлення даних діаграм.'
    );
  }

  try {
    /*
 * ============================================================
 * ЄДИНЕ P&L CORE
 * ============================================================
 *
 * Один розрахунок на один Global Filter period.
 *
 * Усі три native datasets нижче
 * використовують ОДНУ й ту саму модель.
 */
const plModel =
  proFinPlCoreCalculate_(
    period
  );


const incomePeriod =
  dashboardGlobalFilterBuildIncomePeriodData_(
    null,
    period,
    plModel
  );


const incomeDetails =
  dashboardGlobalFilterBuildIncomeDetailsData_(
    context,
    null,
    period,
    plModel
  );


const expenseStructure =
  dashboardGlobalFilterBuildExpenseStructureData_(
    null,
    period,
    plModel
  );

    const incomePeriodRange =
      context.dataSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .technicalRanges
          .incomePeriod
      );

    const incomeDetailsRange =
      context.dataSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .technicalRanges
          .incomeDetails
      );

    const expenseStructureRange =
      context.dataSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .technicalRanges
          .expenseStructure
      );

    const snapshots = {
      incomePeriod:
        dashboardGlobalFilterSnapshotRange_(
          incomePeriodRange
        ),

      incomeDetails:
        dashboardGlobalFilterSnapshotRange_(
          incomeDetailsRange
        ),

      expenseStructure:
        dashboardGlobalFilterSnapshotRange_(
          expenseStructureRange
        )
    };

    try {
      dashboardGlobalFilterWriteFullRange_(
        incomePeriodRange,
        incomePeriod.output,
        '#,##0.00'
      );

      dashboardGlobalFilterWriteFullRange_(
        incomeDetailsRange,
        incomeDetails.output,
        '0'
      );

      dashboardGlobalFilterWriteFullRange_(
      expenseStructureRange,
      expenseStructure.output,
      '#,##0.00'
);

/*
 * Локального фільтра місяця
 * для діаграми доходів більше немає.
 */
  SpreadsheetApp.flush();

    } catch (error) {
      dashboardGlobalFilterRestoreRange_(
        incomePeriodRange,
        snapshots.incomePeriod
      );

      dashboardGlobalFilterRestoreRange_(
        incomeDetailsRange,
        snapshots.incomeDetails
      );

      dashboardGlobalFilterRestoreRange_(
        expenseStructureRange,
        snapshots.expenseStructure
      );

      SpreadsheetApp.flush();

      throw error;
    }

    return {
      incomePeriod: {
        range:
          dashboardGlobalFilterRangeRef_(
            incomePeriodRange
          ),
        regularIncome:
          incomePeriod.regularIncome,
        vaccines:
          incomePeriod.vaccines,
        transactions:
          incomePeriod.incomeTransactions +
          incomePeriod.vaccineTransactions
      },

      incomeDetails: {
        range:
          dashboardGlobalFilterRangeRef_(
            incomeDetailsRange
          ),
        category:
          incomeDetails.selectedCategory,
        sectors:
          incomeDetails.items.length,
        transactions:
          incomeDetails.totalTransactions
      },

      expenseStructure: {
        range:
          dashboardGlobalFilterRangeRef_(
            expenseStructureRange
          ),
        sectors:
          expenseStructure.items.length,
        transactions:
          expenseStructure.totalTransactions,
        totalExpense:
          expenseStructure.totalExpense
      },

      chartObjectsChanged:
        false
    };

  } finally {
    documentLock.releaseLock();
  }
}


/**
 * ============================================================
 * 8. ДАНІ «ДОХОДИ / ВАКЦИНИ»
 * ============================================================
 */
function dashboardGlobalFilterBuildIncomePeriodData_(
  operations,
  period,
  plModel
) {

  /*
   * plModel надходить від одного
   * центрального розрахунку Global Filter.
   *
   * Fallback залишає функцію
   * сумісною з окремими dry-run викликами.
   */
  const model =
    plModel ||
    proFinPlCoreCalculate_(
      period
    );


  /*
   * Зберігаємо поточний
   * візуальний порядок доходів.
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


  const preferredOrderMap =
    Object.create(null);


  preferredOrder.forEach(
    function(
      category,
      index
    ) {

      preferredOrderMap[
        dashboardGlobalFilterNormalize_(
          category
        )
      ] =
        index;
    }
  );


  const items =
    model.income.categories
      .map(
        function(item) {

          return {

            category:
              item.category,

            amount:
              dashboardGlobalFilterRound2_(
                item.amount
              ),

            transactions:
              item.transactions
          };
        }
      )

      .sort(
        function(
          first,
          second
        ) {

          const firstKey =
            dashboardGlobalFilterNormalize_(
              first.category
            );

          const secondKey =
            dashboardGlobalFilterNormalize_(
              second.category
            );


          const firstOrder =
            preferredOrderMap[
              firstKey
            ];

          const secondOrder =
            preferredOrderMap[
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
   * Старі поля результату
   * залишаємо для сумісності
   * з існуючими логами Global Filter.
   */
  const vaccineKey =
    dashboardGlobalFilterNormalize_(
      'Вакцини'
    );


  const vaccineItem =
    items.find(
      function(item) {

        return (
          dashboardGlobalFilterNormalize_(
            item.category
          ) ===
          vaccineKey
        );
      }
    ) ||
    null;


  const vaccines =
    vaccineItem
      ? vaccineItem.amount
      : 0;


  const vaccineTransactions =
    vaccineItem
      ? vaccineItem.transactions
      : 0;


  const totalIncome =
    dashboardGlobalFilterRound2_(
      model.income.total
    );


  const regularIncome =
    dashboardGlobalFilterRound2_(
      totalIncome -
      vaccines
    );


  const incomeTransactions =
    model.income.transactions -
    vaccineTransactions;


  /*
   * Формат Y:Z не міняємо.
   */
  const output = [
    [
      'Сектор доходу',
      'Сума, грн'
    ]
  ];


  items.forEach(
    function(item) {

      output.push([
        item.category,
        item.amount
      ]);
    }
  );


  if (
    !items.length
  ) {

    output.push([
      'Немає доходів за період',
      1
    ]);
  }


  return {

    regularIncome:
      regularIncome,

    vaccines:
      vaccines,

    totalIncome:
      totalIncome,

    incomeTransactions:
      incomeTransactions,

    vaccineTransactions:
      vaccineTransactions,

    sectors:
      items.length,

    items:
      items,

    output:
      output,

    plCoreVersion:
      model.version
  };
}


/**
 * ============================================================
 * 9. ДЕТАЛЬНА ДІАГРАМА ДОХОДІВ
 * ============================================================
 */
function dashboardGlobalFilterBuildIncomeDetailsData_(
  context,
  operations,
  period,
  plModel
) {
  const categoryCell =
    context.dashboardSheet.getRange(
      DASHBOARD_GLOBAL_FILTER_CFG
        .localIncomeControls
        .category
    );


  const selectedCategory =
    dashboardGlobalFilterClean_(
      categoryCell.getDisplayValue()
    );


  const selectedCategoryKey =
    dashboardGlobalFilterNormalize_(
      selectedCategory
    );


  const model =
    plModel ||
    proFinPlCoreCalculate_(
      period
    );


  const category =
    model.income.categories.find(
      function(item) {
        return (
          item.key ===
          selectedCategoryKey
        );
      }
    ) ||
    null;


  const items =
    (
      category
        ? category.articles
        : []
    )
      .map(
        function(item) {
          return {
            article:
              item.article,

            quantity:
              item.transactions
          };
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


  if (
    !items.length
  ) {
    output.push([
      'Немає транзакцій — ' +
        selectedCategory,

      1
    ]);
  }


  return {
    selectedCategory:
      selectedCategory,

    totalTransactions:
      totalTransactions,

    items:
      items,

    output:
      output,

    sourceOfTruth:
      'P&L_CORE',

    plCoreVersion:
      model.version
  };
}


/**
 * ============================================================
 * 10. СТРУКТУРА ВИТРАТ
 * ============================================================
 */
function dashboardGlobalFilterBuildExpenseStructureData_(
  operations,
  period,
  plModel
) {

  /*
   * ==========================================================
   * ЄДИНЕ P&L CORE
   * ==========================================================
   *
   * operations залишено в сигнатурі
   * лише для backward compatibility.
   *
   * Фінансові суми звідси більше
   * НЕ розраховуються напряму
   * з "База операцій".
   */
  const model =
    plModel ||
    proFinPlCoreCalculate_(
      period
    );


  const items =
    model.expense.categories

      .map(
        function(item) {

          return {
            category:
              item.category,

            amount:
              dashboardGlobalFilterRound2_(
                item.amount
              ),

            transactions:
              Number(
                item.transactions
              ) || 0
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
   * Total беремо з самого P&L Core.
   *
   * Для MONTH:
   *   це готовий Fact P&L.
   *
   * Для DAY / partial RANGE:
   *   це результат transaction-date
   *   режиму того самого ядра.
   */
  const totalExpense =
    dashboardGlobalFilterRound2_(
      model.expense.total
    );


  /*
   * Додатковий контроль:
   * сума секторів повинна дорівнювати
   * загальному expense total моделі.
   */
  const sectorsTotal =
    dashboardGlobalFilterRound2_(
      items.reduce(
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


  if (
    Math.abs(
      sectorsTotal -
      totalExpense
    ) >
    0.01
  ) {

    throw new Error(
      'Global Filter: P&L Core expense sectors ' +
      'не дорівнюють totalExpense. ' +
      'Сектори=' +
      sectorsTotal +
      '; total=' +
      totalExpense +
      '.'
    );
  }


  const totalTransactions =
    Number(
      model.expense.transactions
    ) || 0;


  /*
   * Формат AA:AB НЕ змінюємо.
   */
  const output = [
    [
      'Сектор витрат',
      'Сума, грн'
    ]
  ];


  items.forEach(
    function(item) {

      output.push([
        item.category +
          ' — ' +
          dashboardGlobalFilterFormatMoney_(
            item.amount
          ),

        item.amount
      ]);
    }
  );


  if (
    !items.length
  ) {

    output.push([
      'Немає витрат за період',
      1
    ]);
  }


  return {
    items:
      items,

    totalTransactions:
      totalTransactions,

    totalExpense:
      totalExpense,

    output:
      output,

    sourceOfTruth:
      model.basis &&
      model.basis.mode ===
        'PL_FACT_MONTHLY'
        ? 'P&L CORE → P&L FACT'
        : 'P&L CORE → TRANSACTION DATE',

    plCoreVersion:
      model.version,

    plCoreBasis:
      model.basis
  };
}


/**
 * ============================================================
 * 11. ЗЧИТУВАННЯ «БАЗИ ОПЕРАЦІЙ»
 * ============================================================
 */
function dashboardGlobalFilterReadOperations_(
  sheet
) {
  const values =
    sheet.getDataRange().getValues();

  if (values.length < 2) {
    throw new Error(
      '«База операцій» не містить робочих рядків.'
    );
  }

  const headers = values[0];

  const indexes = {
    date:
      dashboardGlobalFilterResolveHeader_(
        headers,
        ['Дата транзакції', 'Дата'],
        true
      ),

    amount:
      dashboardGlobalFilterResolveHeader_(
        headers,
        ['Сума', 'Сума, грн'],
        true
      ),

    type:
      dashboardGlobalFilterResolveHeader_(
        headers,
        [
          'Тип Доходи / Витрати',
          'Тип доходи / витрати',
          'Тип доходи/витрати',
          'Тип операції',
          'Тип'
        ],
        true
      ),

    category:
      dashboardGlobalFilterResolveHeader_(
        headers,
        ['Категорія'],
        true
      ),

    article:
      dashboardGlobalFilterResolveHeader_(
        headers,
        ['Стаття'],
        true
      ),

    status:
      dashboardGlobalFilterResolveHeader_(
        headers,
        ['Статус запису', 'Статус'],
        false
      )
  };

  return {
    rows: values.slice(1),
    indexes: indexes
  };
}


/**
 * ============================================================
 * 12. ПЕРІОД
 * ============================================================
 */

/**
 * Визначає період саме для кнопки «Оновити Дашборд».
 *
 * Якщо користувач задав день, місяць або межі періоду —
 * використовуємо чинну сувору перевірку.
 *
 * Якщо всі чотири поля E5, E6, F5, F6 порожні —
 * автоматично беремо поточний календарний місяць.
 * Це не змінює поведінку кнопки «Очистити» та dry run.
 */
function dashboardGlobalFilterResolveApplyPeriod_(context) {
  const centralPeriod =
    dashboardCentralPeriodV1Build_();

  return {
    mode: centralPeriod.mode,
    periodKey: centralPeriod.periodKey,
    label: centralPeriod.label,
    from: centralPeriod.from,
    to: centralPeriod.to,
    dataScope: centralPeriod.dataScope,
    source: centralPeriod.source
  };
}

function dashboardGlobalFilterResolvePeriod_(
  context,
  allowFallback
) {
  const day =
    dashboardGlobalFilterDateOnly_(
      context.dayRange.getValue()
    );

  const month =
    dashboardGlobalFilterParseMonth_(
      context.monthRange.getValue(),
      context.monthRange.getDisplayValue()
    );

  const from =
    dashboardGlobalFilterDateOnly_(
      context.dateFromRange.getValue()
    );

  const to =
    dashboardGlobalFilterDateOnly_(
      context.dateToRange.getValue()
    );

  /*
   * Пріоритет фільтрів:
   * 1. конкретний день F5;
   * 2. місяць F6;
   * 3. довільний період E5:E6.
   *
   * onEdit очищає взаємовиключні поля, але пріоритет
   * також захищає від залишкових значень після ручного
   * вставлення або старих версій скрипта.
   */
  if (day) {
    return {
      mode: 'DAY',
      from: day,
      to: day,
      source:
        dashboardGlobalFilterRangeRef_(
          context.dayRange
        )
    };
  }

  if (month) {
    return {
      mode: 'MONTH',
      from:
        new Date(
          month.getFullYear(),
          month.getMonth(),
          1
        ),
      to:
        new Date(
          month.getFullYear(),
          month.getMonth() + 1,
          0
        ),
      source:
        dashboardGlobalFilterRangeRef_(
          context.monthRange
        )
    };
  }

  if (from || to) {
    const resolvedFrom = from || to;
    const resolvedTo = to || from;

    if (
      resolvedFrom.getTime() >
      resolvedTo.getTime()
    ) {
      throw new Error(
        'Дата «Період від» пізніше за «Період до».'
      );
    }

    return {
      mode:
        resolvedFrom.getTime() ===
        resolvedTo.getTime()
          ? 'DAY'
          : 'RANGE',
      from: resolvedFrom,
      to: resolvedTo,
      source:
        dashboardGlobalFilterRangeRef_(
          context.dateFromRange
        ) +
        ' / ' +
        dashboardGlobalFilterRangeRef_(
          context.dateToRange
        )
    };
  }

  if (!allowFallback) {
    throw new Error(
      'Оберіть день, місяць або задайте дату початку/завершення.'
    );
  }

  return dashboardGlobalFilterSourcePeriod_(
    context.operationsSheet
  );
}


function dashboardGlobalFilterSourcePeriod_(
  operationsSheet
) {
  const operations =
    dashboardGlobalFilterReadOperations_(
      operationsSheet
    );

  const dates = [];

  operations.rows.forEach(function(row) {
    if (
      dashboardGlobalFilterIsExcludedStatus_(
        row[operations.indexes.status]
      )
    ) {
      return;
    }

    const type =
      dashboardGlobalFilterNormalize_(
        row[operations.indexes.type]
      );

    const supported =
      DASHBOARD_GLOBAL_FILTER_CFG
        .typeAliases
        .income
        .indexOf(type) !== -1 ||
      DASHBOARD_GLOBAL_FILTER_CFG
        .typeAliases
        .expense
        .indexOf(type) !== -1 ||
      DASHBOARD_GLOBAL_FILTER_CFG
        .typeAliases
        .vaccine
        .indexOf(type) !== -1;

    if (!supported) {
      return;
    }

    const date =
      dashboardGlobalFilterDateOnly_(
        row[operations.indexes.date]
      );

    if (date) {
      dates.push(date);
    }
  });

  if (!dates.length) {
    const today =
      dashboardGlobalFilterDateOnly_(
        new Date()
      );

    return {
      mode: 'SOURCE_RANGE',
      from: today,
      to: today,
      source:
        'Поточна дата — у Базі операцій немає валідних дат'
    };
  }

  dates.sort(function(a, b) {
    return a.getTime() - b.getTime();
  });

  return {
    mode: 'SOURCE_RANGE',
    from: dates[0],
    to: dates[dates.length - 1],
    source:
      'Мінімальна і максимальна дати валідних операцій'
  };
}


function dashboardGlobalFilterRowInPeriod_(
  row,
  indexes,
  period
) {
/*
 * Якщо змінено локальну категорію F72,
 * оновлюємо праву діаграму доходів.
 *
 * Період визначається виключно
 * глобальним фільтром Дашборду.
 */
  if (
    !period ||
    period.empty === true
  ) {
    return false;
  }

  const date =
    dashboardGlobalFilterDateOnly_(
      row[indexes.date]
    );

  return !!date &&
    date.getTime() >=
      period.from.getTime() &&
    date.getTime() <=
      period.to.getTime();
}


function dashboardGlobalFilterIsFullMonthRange_(
  period
) {
  const startsOnFirst =
    period.from.getDate() === 1;

  const endsOnLast =
    period.to.getDate() ===
    new Date(
      period.to.getFullYear(),
      period.to.getMonth() + 1,
      0
    ).getDate();

  return startsOnFirst && endsOnLast;
}

/**
 * ============================================================
 * 13. КОНТЕКСТ І NAMED RANGES
 * ============================================================
 */
function dashboardGlobalFilterContext_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const dashboardSheet =
    dashboardGlobalFilterRequireSheet_(
      ss,
      DASHBOARD_GLOBAL_FILTER_CFG
        .sheets
        .dashboard
    );

  const operationsSheet =
    dashboardGlobalFilterRequireSheet_(
      ss,
      DASHBOARD_GLOBAL_FILTER_CFG
        .sheets
        .operations
    );

  const dataSheet =
    dashboardGlobalFilterRequireSheet_(
      ss,
      DASHBOARD_GLOBAL_FILTER_CFG
        .sheets
        .data
    );

  return {
    ss: ss,
    dashboardSheet: dashboardSheet,
    operationsSheet: operationsSheet,
    dataSheet: dataSheet,

    dateFromRange:
      dashboardSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .controls
          .dateFrom
      ),

    dateToRange:
      dashboardSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .controls
          .dateTo
      ),

    dayRange:
      dashboardSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .controls
          .day
      ),

    monthRange:
      dashboardSheet.getRange(
        DASHBOARD_GLOBAL_FILTER_CFG
          .controls
          .month
      )
  };
}


function dashboardGlobalFilterEnsureNamedRange_(
  ss,
  name,
  expectedRange
) {
  const matches =
    ss.getNamedRanges()
      .filter(function(namedRange) {
        return namedRange.getName() === name;
      });

  if (!matches.length) {
    ss.setNamedRange(name, expectedRange);
    return;
  }

  matches[0].setRange(expectedRange);

  for (
    let index = 1;
    index < matches.length;
    index++
  ) {
    matches[index].remove();
  }
}


/**
 * ============================================================
 * 14. БЕЗПЕЧНИЙ ЗАПИС ТЕХНІЧНИХ ДІАПАЗОНІВ
 * ============================================================
 */
function dashboardGlobalFilterWriteFullRange_(
  targetRange,
  output,
  numberFormat
) {
  if (
    !Array.isArray(output) ||
    !output.length ||
    !Array.isArray(output[0]) ||
    output[0].length !== 2
  ) {
    throw new Error(
      'Дані діаграми повинні містити рівно дві колонки.'
    );
  }

  if (
    output.length >
    targetRange.getNumRows()
  ) {
    throw new Error(
      'Діапазон ' +
      dashboardGlobalFilterRangeRef_(
        targetRange
      ) +
      ' замалий для ' +
      output.length +
      ' рядків.'
    );
  }

  const matrix = [];

  for (
    let row = 0;
    row < targetRange.getNumRows();
    row++
  ) {
    if (row < output.length) {
      matrix.push([
        output[row][0],
        output[row][1]
      ]);
    } else {
      matrix.push(['', '']);
    }
  }

  /*
   * Один setValues() на весь діапазон.
   * Між очищенням і записом не виникає білого стану.
   */
  targetRange.setValues(matrix);

  targetRange
    .offset(
      0,
      0,
      targetRange.getNumRows(),
      1
    )
    .setNumberFormat('@');

  if (targetRange.getNumRows() > 1) {
    targetRange
      .offset(
        1,
        1,
        targetRange.getNumRows() - 1,
        1
      )
      .setNumberFormat(
        numberFormat
      );
  }
}


function dashboardGlobalFilterSnapshotRange_(
  range
) {
  return {
    values: range.getValues(),
    numberFormats: range.getNumberFormats(),
    notes: range.getNotes()
  };
}


function dashboardGlobalFilterRestoreRange_(
  range,
  snapshot
) {
  range.setValues(snapshot.values);
  range.setNumberFormats(
    snapshot.numberFormats
  );
  range.setNotes(snapshot.notes);
}

/**
 * ============================================================
 * ПРИМУСОВЕ ПЕРЕМАЛЬОВУВАННЯ PNG-ДІАГРАМИ ВИТРАТ
 * ПІСЛЯ КНОПОК «ФІЛЬТРУВАТИ» ТА «ОЧИСТИТИ»
 * ============================================================
 *
 * dashboardExpenseDetailsRefreshChartData() уже створює
 * правильний новий PNG на сервері.
 *
 * Ця функція змушує відкритий інтерфейс Google Sheets
 * одразу показати нове зображення без перезавантаження
 * сторінки браузера.
 */
function dashboardGlobalFilterForceExpenseImageRepaint_(
  context
) {
  if (
    typeof dashboardExpenseDetailsForceClientRepaint_ !==
    'function'
  ) {
    throw new Error(
      'Функція dashboardExpenseDetailsForceClientRepaint_ ' +
      'відсутня у модулі діаграми витрат.'
    );
  }

  /*
   * Намагаємося зберегти поточне
   * виділення користувача.
   */
  let restoreRange = null;

  try {
    const activeRange =
      SpreadsheetApp.getActiveRange();

    if (
      activeRange &&
      activeRange
        .getSheet()
        .getSheetId() ===
        context.dashboardSheet.getSheetId()
    ) {
      restoreRange =
        activeRange;
    }

  } catch (error) {
    restoreRange =
      null;
  }

  /*
   * Fallback — поточний фільтр
   * категорії витрат.
   */
  if (!restoreRange) {
    restoreRange =
      context.ss.getRangeByName(
        'DASH_EXPENSE_CATEGORY'
      ) ||
      context.dashboardSheet.getRange(
        'F99'
      );
  }

  SpreadsheetApp.flush();

  Utilities.sleep(
    350
  );

  const repaintResult =
    dashboardExpenseDetailsForceClientRepaint_(
      context.ss,
      context.dashboardSheet,
      restoreRange
    );

  SpreadsheetApp.flush();

  Utilities.sleep(
    150
  );

  return repaintResult;
}

function dashboardGlobalFilterSetActive_(
  active
) {
  PropertiesService
    .getDocumentProperties()
    .setProperty(
      DASHBOARD_GLOBAL_FILTER_CFG
        .stateProperties
        .globalActive,

      active
        ? '1'
        : '0'
    );
}


function dashboardGlobalFilterIsActive_() {
  return (
    PropertiesService
      .getDocumentProperties()
      .getProperty(
        DASHBOARD_GLOBAL_FILTER_CFG
          .stateProperties
          .globalActive
      ) === '1'
  );
}


/**
 * ============================================================
 * 15. ДОПОМІЖНІ ФУНКЦІЇ
 * ============================================================
 */

function dashboardGlobalFilterRefreshDoctorPayroll_(
  period
) {
  if (
    !period ||
    !period.from ||
    !period.to
  ) {
    throw new Error(
      'Не передано коректний період для блоку нарахувань лікарям.'
    );
  }

  if (
    typeof refreshDashboardDoctorPayroll !==
    'function'
  ) {
    return {
      ok:
        true,

      skipped:
        true,

      reason:
        'Функція refreshDashboardDoctorPayroll відсутня.',

      noCellsWritten:
        true,

      noSourceCellsWritten:
        true
    };
  }

  try {
    return refreshDashboardDoctorPayroll({
      from:
        new Date(
          period.from.getTime()
        ),

      to:
        new Date(
          period.to.getTime()
        ),

      showToast:
        false
    });

  } catch (error) {
    const message =
      String(
        error &&
        error.message
          ? error.message
          : error
      );

    if (
      message.indexOf(
        'Не знайдено всі необхідні заголовки'
      ) !== -1
    ) {
      return {
        ok:
          true,

        skipped:
          true,

        reason:
          'Блок «Нарахування лікарям» пропущено: ' +
          'поточний production-модуль не відповідає фактичній структурі джерела.',

        sourceContractResolved:
          false,

        period: {
          from:
            Utilities.formatDate(
              period.from,
              Session.getScriptTimeZone(),
              'dd.MM.yyyy'
            ),

          to:
            Utilities.formatDate(
              period.to,
              Session.getScriptTimeZone(),
              'dd.MM.yyyy'
            )
        },

        targetRange:
          'Дашборд!D36:G42',

        noCellsWritten:
          true,

        noSourceCellsWritten:
          true
      };
    }

    throw error;
  }
}
function dashboardGlobalFilterRestoreFixedButtons_() {
  if (
    typeof DASHBOARD_VISUAL_LOCK_CONFIG === 'undefined' ||
    typeof dashboardVisualRestoreDrawings_ !== 'function'
  ) {
    return {
      ok: true,
      skipped: true,
      reason: 'Модуль DASHBOARD_VISUAL_LAYOUT_LOCK не підключений.'
    };
  }

  const config = DASHBOARD_VISUAL_LOCK_CONFIG;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(config.sheetName);

  if (!sheet) {
    throw new Error(
      'Не знайдено лист «' + config.sheetName + '».'
    );
  }

  const json = PropertiesService
    .getDocumentProperties()
    .getProperty(config.propertyKey);

  if (!json) {
    return {
      ok: true,
      skipped: true,
      reason:
        'Еталон кнопок ще не зафіксований. ' +
        'Запустіть dashboardVisualLayoutCapture().'
    };
  }

  const snapshot = JSON.parse(json);

  const buttonDrawings =
    (snapshot.drawings || []).filter(function(item) {
      return String(item.onAction || '').trim() !== '';
    });

  if (!buttonDrawings.length) {
    return {
      ok: true,
      skipped: true,
      reason: 'У snapshot не знайдено кнопок із призначеною функцією.'
    };
  }

  const result =
    dashboardVisualRestoreDrawings_(
      sheet,
      buttonDrawings
    );

  SpreadsheetApp.flush();

  return {
    ok: result.ok,
    skipped: false,
    expectedButtons: buttonDrawings.length,
    restoredButtons: result.restored,
    positionWrites: result.positionWrites,
    sizeWrites: result.sizeWrites,
    missingButtons: result.missing
  };
}
function dashboardGlobalFilterRunStep_(
  name,
  callback
) {
  try {
    const value = callback();

    return {
      ok: true,
      name: name,
      value: value
    };

  } catch (error) {
    return {
      ok: false,
      name: name,
      error:
        String(
          error && error.message
            ? error.message
            : error
        )
    };
  }
}


function dashboardGlobalFilterResolveHeader_(
  headers,
  aliases,
  required
) {
  const normalizedHeaders =
    headers.map(
      dashboardGlobalFilterNormalize_
    );

  for (
    let index = 0;
    index < aliases.length;
    index++
  ) {
    const found =
      normalizedHeaders.indexOf(
        dashboardGlobalFilterNormalize_(
          aliases[index]
        )
      );

    if (found >= 0) {
      return found;
    }
  }

  if (required) {
    throw new Error(
      'У «Базі операцій» не знайдено колонку: ' +
      aliases.join(' / ')
    );
  }

  return -1;
}


function dashboardGlobalFilterIsExcludedStatus_(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return false;
  }

  const status =
    dashboardGlobalFilterNormalize_(
      value
    );

  return DASHBOARD_GLOBAL_FILTER_CFG
    .excludedStatusFragments
    .some(function(fragment) {
      return status.indexOf(fragment) !== -1;
    });
}


function dashboardGlobalFilterParseMonth_(
  rawValue,
  displayValue
) {
  const directDate =
    dashboardGlobalFilterDateOnly_(
      rawValue
    );

  if (directDate) {
    return new Date(
      directDate.getFullYear(),
      directDate.getMonth(),
      1
    );
  }

  const text =
    dashboardGlobalFilterNormalize_(
      displayValue || rawValue
    );

  if (!text) {
    return null;
  }

  const numericMatch =
    text.match(
      /^(0?[1-9]|1[0-2])[.\/-](\d{4})$/
    );

  if (numericMatch) {
    return new Date(
      Number(numericMatch[2]),
      Number(numericMatch[1]) - 1,
      1
    );
  }

  const names =
    DASHBOARD_GLOBAL_FILTER_CFG
      .monthNames
      .map(
        dashboardGlobalFilterNormalize_
      );

  for (
    let index = 0;
    index < names.length;
    index++
  ) {
    if (
      text === names[index] ||
      text.indexOf(names[index] + ' ') === 0
    ) {
      const yearMatch =
        text.match(/(\d{4})/);

      return new Date(
        yearMatch
          ? Number(yearMatch[1])
          : DASHBOARD_GLOBAL_FILTER_CFG
              .controls
              .reportYear,
        index,
        1
      );
    }
  }

  return null;
}


function dashboardGlobalFilterDateOnly_(
  value
) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate()
    );
  }

  const text =
    dashboardGlobalFilterClean_(
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
    return dashboardGlobalFilterCreateDate_(
      Number(match[3]),
      Number(match[2]),
      Number(match[1])
    );
  }

  match =
    text.match(
      /^(\d{4})[.\/-](\d{1,2})[.\/-](\d{1,2})$/
    );

  if (match) {
    return dashboardGlobalFilterCreateDate_(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    );
  }

  return null;
}


function dashboardGlobalFilterCreateDate_(
  year,
  month,
  day
) {
  const date =
    new Date(
      year,
      month - 1,
      day
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


function dashboardGlobalFilterNumber_(
  value
) {
  if (
    typeof value === 'number' &&
    isFinite(value)
  ) {
    return value;
  }

  const text =
    String(
      value === undefined ||
      value === null
        ? ''
        : value
    )
      .replace(/\u00A0/g, '')
      .replace(/\s/g, '')
      .replace(',', '.');

  if (!text) {
    return null;
  }

  const number = Number(text);

  return isFinite(number)
    ? number
    : null;
}


function dashboardGlobalFilterRequireSheet_(
  ss,
  name
) {
  const sheet =
    ss.getSheetByName(name);

  if (!sheet) {
    throw new Error(
      'Лист «' + name + '» не знайдено.'
    );
  }

  return sheet;
}


function dashboardGlobalFilterSameRange_(
  first,
  second
) {
  return !!first &&
    !!second &&
    first.getSheet().getSheetId() ===
      second.getSheet().getSheetId() &&
    first.getA1Notation() ===
      second.getA1Notation();
}


function dashboardGlobalFilterPeriodResult_(
  period
) {
  return {
    mode: period.mode,
    from:
      dashboardGlobalFilterFormatDate_(
        period.from
      ),
    to:
      dashboardGlobalFilterFormatDate_(
        period.to
      ),
    source: period.source
  };
}


function dashboardGlobalFilterFormatDate_(
  date
) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}


function dashboardGlobalFilterFormatMoney_(
  value
) {
  const rounded =
    dashboardGlobalFilterRound2_(
      value
    );

  const parts =
    rounded.toFixed(2).split('.');

  const integer =
    parts[0].replace(
      /\B(?=(\d{3})+(?!\d))/g,
      ' '
    );

  return integer +
    ',' +
    parts[1] +
    ' грн';
}


function dashboardGlobalFilterRound2_(
  value
) {
  return Math.round(
    (Number(value) + Number.EPSILON) *
    100
  ) / 100;
}


function dashboardGlobalFilterClean_(
  value
) {
  return String(
    value === undefined ||
    value === null
      ? ''
      : value
  )
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function dashboardGlobalFilterNormalize_(
  value
) {
  return dashboardGlobalFilterClean_(
    value
  ).toLowerCase();
}


function dashboardGlobalFilterRangeRef_(
  range
) {
  return range.getSheet().getName() +
    '!' +
    range.getA1Notation();
}
function dashboardRepairCurrentUiCellsOnce() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const dashboard =
    ss.getSheetByName(
      'Дашборд'
    );

  if (!dashboard) {
    throw new Error(
      'Лист «Дашборд» не знайдено.'
    );
  }

  /*
   * ==================================================
   * 1. ДОХОДИ
   * ==================================================
   *
   * Єдиний локальний фільтр:
   * F72 — категорія.
   */
  const incomeCategory =
    dashboard.getRange(
      'F72'
    );

  ss.setNamedRange(
    'DASH_INCOME_CATEGORY',
    incomeCategory
  );

  /*
   * Старий локальний місяць
   * більше не використовується.
   */
  ss.getNamedRanges()
    .filter(function(namedRange) {
      return (
        namedRange.getName() ===
        'DASH_INCOME_MONTH'
      );
    })
    .forEach(function(namedRange) {
      namedRange.remove();
    });

  /*
   * H66 містить старий текст
   * типу «липень 2026».
   */
  dashboard
    .getRange(
      'H66'
    )
    .clearContent()
    .clearNote()
    .clearDataValidations();

  /*
   * F76 містить старий validation
   * списку місяців.
   */
  dashboard
    .getRange(
      'F76'
    )
    .clearContent()
    .clearNote()
    .clearDataValidations();


  /*
   * ==================================================
   * 2. ВИТРАТИ
   * ==================================================
   *
   * Фактичний dropdown:
   * F99.
   */
  const expenseCategory =
    dashboard.getRange(
      'F99'
    );

  ss.setNamedRange(
    'DASH_EXPENSE_CATEGORY',
    expenseCategory
  );

  ss.setNamedRange(
    'DASH_EXPENSE_CATEGORY_FILTER',
    expenseCategory
  );

  ss.setNamedRange(
    'DASH_EXF',
    expenseCategory
  );

  /*
   * Забираємо тестовий dropdown
   * «Варіант 1 / Варіант 2».
   *
   * Правильний список відразу після
   * цього поставить
   * dashboardExpenseDetailsInstall().
   */
  expenseCategory
    .clearDataValidations();

  if (
    !String(
      expenseCategory
        .getDisplayValue() || ''
    ).trim()
  ) {
    expenseCategory.setValue(
      'Усі категорії'
    );
  }

  SpreadsheetApp.flush();

  const result = {
    ok:
      true,

    incomeCategory:
      'Дашборд!F72',

    incomeMonthRemoved:
      true,

    oldIncomeCellsCleared: [
      'Дашборд!H66',
      'Дашборд!F76'
    ],

    expenseCategory:
      'Дашборд!F99',

    expenseNamedRangesRepaired: [
      'DASH_EXPENSE_CATEGORY',
      'DASH_EXPENSE_CATEGORY_FILTER',
      'DASH_EXF'
    ],

    noBusinessDataChanged:
      true
  };

  Logger.log(
    'dashboardRepairCurrentUiCellsOnce: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
/**
 * R0 — read-only аудит архітектури дашборду.
 *
 * Не змінює:
 * - значення та формули;
 * - діаграми;
 * - named ranges;
 * - тригери;
 * - джерела даних.
 *
 * Запускати вручну один раз:
 * dashboardArchitectureReadOnlyTest
 */
function dashboardArchitectureReadOnlyTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const result = {
    test: 'dashboardArchitectureReadOnlyTest',
    mode: 'R0_READ_ONLY',
    startedAt: new Date().toISOString(),
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    changesMade: false,
    errors: [],
    warnings: [],
    sheets: [],
    namedRanges: [],
    charts: [],
    triggers: [],
    controls: {},
    sourceSheets: {}
  };

  function safe(label, fn) {
    try {
      return fn();
    } catch (error) {
      result.errors.push({
        area: label,
        message: String(error && error.message ? error.message : error)
      });
      return null;
    }
  }

  function clean(value) {
    return String(value === null || value === undefined ? '' : value)
      .trim();
  }

  function rangeSnapshot(sheetName, a1) {
    return safe(sheetName + '!' + a1, function() {
      const sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        result.warnings.push('Відсутній лист: ' + sheetName);
        return {
          sheet: sheetName,
          range: a1,
          exists: false
        };
      }

      const range = sheet.getRange(a1);

      return {
        sheet: sheetName,
        range: a1,
        exists: true,
        values: range.getDisplayValues(),
        formulas: range.getFormulas()
      };
    });
  }

  // 1. Перелік листів.
  result.sheets = ss.getSheets().map(function(sheet) {
    return {
      name: sheet.getName(),
      sheetId: sheet.getSheetId(),
      rows: sheet.getMaxRows(),
      columns: sheet.getMaxColumns(),
      hidden: sheet.isSheetHidden()
    };
  });

  // 2. Перевірка ключових листів і джерел.
  [
    'Дашборд',
    'Дані дашборду',
    'P&L',
    'База операцій',
    'Активи',
    'Склад медичних запасів',
    'Облік вакцин'
  ].forEach(function(sheetName) {
    const sheet = ss.getSheetByName(sheetName);

    result.sourceSheets[sheetName] = {
      exists: !!sheet,
      sheetId: sheet ? sheet.getSheetId() : null,
      lastRow: sheet ? sheet.getLastRow() : null,
      lastColumn: sheet ? sheet.getLastColumn() : null
    };
  });

  // 3. Фактичний стан центральних фільтрів.
  const dashboard = ss.getSheetByName('Дашборд');

  if (dashboard) {
    result.controls = {
      dateFrom: rangeSnapshot('Дашборд', 'E5'),
      dateTo: rangeSnapshot('Дашборд', 'E6'),
      globalDay: rangeSnapshot('Дашборд', 'F5'),
      globalMonth: rangeSnapshot('Дашборд', 'F6'),
      incomeMonthLegacy: rangeSnapshot('Дашборд', 'H66'),
      incomeCategory: rangeSnapshot('Дашборд', 'F72'),
      expenseCategory: rangeSnapshot('Дашборд', 'F99')
    };
  }

  // 4. Named ranges.
  result.namedRanges = safe('namedRanges', function() {
    return ss.getNamedRanges().map(function(namedRange) {
      const range = namedRange.getRange();

      return {
        name: namedRange.getName(),
        sheet: range.getSheet().getName(),
        range: range.getA1Notation(),
        value: range.getDisplayValue(),
        formula: range.getFormula()
      };
    }).sort(function(a, b) {
      return a.name.localeCompare(b.name);
    });
  }) || [];

  // 5. Фактичні діаграми на листі «Дашборд».
  result.charts = safe('charts', function() {
    if (!dashboard) return [];

    return dashboard.getCharts().map(function(chart, index) {
      const options = chart.getOptions();

      return {
        index: index + 1,
        chartId: chart.getChartId(),
        chartType: String(chart.getType()),
        title: options && options.get
          ? clean(options.get('title'))
          : '',
        anchor: chart.getContainerInfo
          ? {
              row: chart.getContainerInfo().getAnchorRow(),
              column: chart.getContainerInfo().getAnchorColumn()
            }
          : null,
        ranges: chart.getRanges().map(function(range) {
          return {
            sheet: range.getSheet().getName(),
            range: range.getA1Notation()
          };
        })
      };
    });
  }) || [];

  // 6. Фактичні тригери Apps Script.
  result.triggers = safe('projectTriggers', function() {
    return ScriptApp.getProjectTriggers().map(function(trigger) {
      return {
        handlerFunction: trigger.getHandlerFunction(),
        eventType: String(trigger.getEventType()),
        triggerSource: String(trigger.getTriggerSource())
      };
    });
  }) || [];

  // 7. Мінімальні контрольні висновки.
  const requiredSheets = [
    'Дашборд',
    'Дані дашборду',
    'P&L',
    'База операцій',
    'Активи',
    'Склад медичних запасів'
  ];

  requiredSheets.forEach(function(sheetName) {
    if (!result.sourceSheets[sheetName].exists) {
      result.errors.push({
        area: 'requiredSheet',
        message: 'Не знайдено обов’язковий лист: ' + sheetName
      });
    }
  });

  const requiredNamedRanges = [
    'DASH_DATE_FROM',
    'DASH_DATE_TO',
    'DASH_GLOBAL_DAY',
    'DASH_GLOBAL_MONTH'
  ];

  requiredNamedRanges.forEach(function(name) {
    const found = result.namedRanges.some(function(item) {
      return item.name === name;
    });

    if (!found) {
      result.warnings.push('Не знайдено named range: ' + name);
    }
  });

  result.finishedAt = new Date().toISOString();
  result.status = result.errors.length === 0 ? 'OK_WITH_WARNINGS' : 'ERRORS_FOUND';

  Logger.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  return result;
}
/**
 * R0 — аудит фактичних джерел дашборду.
 *
 * Перевіряє:
 * - формули KPI;
 * - джерела діаграм;
 * - named ranges;
 * - поточні фільтри;
 * - фактичні значення технічних кешів.
 *
 * Нічого не змінює.
 */
function dashboardSourceOwnershipReadOnlyTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName('Дашборд');
  const dataSheet = ss.getSheetByName('Дані дашборду');

  const result = {
    test: 'dashboardSourceOwnershipReadOnlyTest',
    mode: 'R0_READ_ONLY',
    spreadsheetName: ss.getName(),
    changesMade: false,
    errors: [],
    warnings: [],
    controls: {},
    dashboardBlocks: [],
    charts: [],
    namedRanges: [],
    cacheSnapshots: [],
    sourcePolicyCheck: []
  };

  function safe(label, fn) {
    try {
      return fn();
    } catch (error) {
      result.errors.push({
        area: label,
        message: String(error && error.message ? error.message : error)
      });
      return null;
    }
  }

  function clean(value) {
    return String(value === null || value === undefined ? '' : value)
      .trim();
  }

  function readRange(sheetName, a1) {
    return safe(sheetName + '!' + a1, function() {
      const sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        return {
          sheet: sheetName,
          range: a1,
          exists: false
        };
      }

      const range = sheet.getRange(a1);

      return {
        sheet: sheetName,
        range: a1,
        exists: true,
        values: range.getDisplayValues(),
        formulas: range.getFormulas()
      };
    });
  }

  function formulaSources(formulas) {
    const sources = [];

    (formulas || []).forEach(function(row) {
      (row || []).forEach(function(formula) {
        const value = clean(formula);
        if (!value) return;

        let match;

        const quotedPattern = /'([^']+)'!/g;
        while ((match = quotedPattern.exec(value)) !== null) {
          if (sources.indexOf(match[1]) === -1) {
            sources.push(match[1]);
          }
        }

        const plainPattern = /(?:^|[^A-Za-zА-Яа-яІіЇїЄє_])([A-Za-zА-Яа-яІіЇїЄє][A-Za-zА-Яа-яІіЇїЄє0-9 _-]*)!/g;
        while ((match = plainPattern.exec(value)) !== null) {
          const source = clean(match[1]);
          if (source && sources.indexOf(source) === -1) {
            sources.push(source);
          }
        }
      });
    });

    return sources;
  }

  function block(label, sheetName, a1, expectedSources) {
    const snapshot = readRange(sheetName, a1);

    if (!snapshot || !snapshot.exists) {
      result.dashboardBlocks.push({
        label: label,
        range: sheetName + '!' + a1,
        exists: false,
        expectedSources: expectedSources || []
      });
      return;
    }

    const sources = formulaSources(snapshot.formulas);

    result.dashboardBlocks.push({
      label: label,
      range: sheetName + '!' + a1,
      exists: true,
      expectedSources: expectedSources || [],
      formulaSources: sources,
      values: snapshot.values,
      formulas: snapshot.formulas
    });
  }

  // 1. Центральні фільтри та локальні фільтри.
  result.controls = {
    dateFrom: readRange('Дашборд', 'E5'),
    dateTo: readRange('Дашборд', 'E6'),
    globalDay: readRange('Дашборд', 'F5'),
    globalMonth: readRange('Дашборд', 'F6'),
    legacyIncomeMonth: readRange('Дашборд', 'H66'),
    incomeCategory: readRange('Дашборд', 'F72'),
    expenseCategory: readRange('Дашборд', 'F99')
  };

  // 2. KPI та ключові блоки дашборду.
  block(
    'Фінансові KPI',
    'Дашборд',
    'B14:G16',
    ['P&L']
  );

  block(
    'Операційний потік поточного місяця',
    'Дашборд',
    'A22:G42',
    ['P&L', 'База операцій']
  );

  block(
    'Залишки по рахунках',
    'Дашборд',
    'B49:F54',
    ['Звіт cash flow ']
  );

  block(
    'Останній звіт адміністратора',
    'Дашборд',
    'B55:F59',
    ['Звіт cash flow ', 'База операцій']
  );

  block(
    'Стан обліку',
    'Дашборд',
    'G49:G61',
    ['P&L', 'База операцій', 'Облік вакцин']
  );

  block(
    'Блок вакцин',
    'Дашборд',
    'A71:H97',
    ['Облік вакцин', 'Склад медичних запасів']
  );

  block(
    'Структура витрат',
    'Дашборд',
    'A98:G118',
    ['P&L']
  );

  block(
    'Активи',
    'Дашборд',
    'A119:G156',
    ['Активи']
  );

  block(
    'Косметичні засоби та тести',
    'Дашборд',
    'A199:G230',
    ['Склад медичних запасів', 'База операцій']
  );

  // 3. Фактичні джерела діаграм.
  result.charts = safe('dashboardCharts', function() {
    if (!dashboard) {
      return [];
    }

    return dashboard.getCharts().map(function(chart, index) {
      const options = chart.getOptions();
      const title = options && options.get
        ? clean(options.get('title'))
        : '';

      const ranges = chart.getRanges().map(function(range) {
        return {
          sheet: range.getSheet().getName(),
          range: range.getA1Notation()
        };
      });

      const chartSources = ranges.map(function(item) {
        return item.sheet;
      }).filter(function(item, index, array) {
        return array.indexOf(item) === index;
      });

      return {
        index: index + 1,
        chartId: chart.getChartId(),
        title: title,
        type: String(chart.getType()),
        ranges: ranges,
        sources: chartSources
      };
    });
  }) || [];

  // 4. Named ranges, пов’язані з дашбордом.
  result.namedRanges = safe('dashboardNamedRanges', function() {
    const names = [
      'DASH_DATE_FROM',
      'DASH_DATE_TO',
      'DASH_GLOBAL_DAY',
      'DASH_GLOBAL_MONTH',
      'DASH_INCOME_MONTH',
      'DASH_INCOME_CATEGORY',
      'DASH_EXPENSE_CATEGORY',
      'DASH_EXPENSE_CATEGORY_FILTER',
      'DASH_CHART_INCOME_DETAILS_DATA',
      'DASH_CHART_INCOME_SECTORS_DATA',
      'DASH_CHART_EXPENSE_DETAILS_DATA'
    ];

    return ss.getNamedRanges()
      .filter(function(namedRange) {
        return names.indexOf(namedRange.getName()) !== -1;
      })
      .map(function(namedRange) {
        const range = namedRange.getRange();

        return {
          name: namedRange.getName(),
          sheet: range.getSheet().getName(),
          range: range.getA1Notation(),
          value: range.getDisplayValue(),
          formula: range.getFormula()
        };
      });
  }) || [];

  // 5. Технічні кеші, з яких зараз живляться діаграми.
  [
    ['Дохід — деталізація', 'V1:W25'],
    ['Дохід — категорії', 'AC1:AD10'],
    ['Витрати — категорії', 'AA1:AB25'],
    ['Витрати — деталізація', 'CX1:DH25']
  ].forEach(function(item) {
    const snapshot = readRange('Дані дашборду', item[1]);

    result.cacheSnapshots.push({
      label: item[0],
      range: 'Дані дашборду!' + item[1],
      snapshot: snapshot
    });
  });

  // 6. Контроль відповідності джерел.
  const expectedRules = [
    {
      block: 'Фінансові KPI',
      allowed: ['P&L']
    },
    {
      block: 'Структура витрат',
      allowed: ['P&L']
    },
    {
      block: 'Активи',
      allowed: ['Активи']
    }
  ];

  expectedRules.forEach(function(rule) {
    const found = result.dashboardBlocks.find(function(item) {
      return item.label === rule.block;
    });

    if (!found || !found.exists) {
      result.sourcePolicyCheck.push({
        block: rule.block,
        status: 'NOT_VERIFIED',
        reason: 'Блок або формули відсутні'
      });
      return;
    }

    const foreignSources = (found.formulaSources || []).filter(function(source) {
      return rule.allowed.indexOf(source) === -1;
    });

    result.sourcePolicyCheck.push({
      block: rule.block,
      expectedSources: rule.allowed,
      actualSources: found.formulaSources,
      status: foreignSources.length === 0 ? 'PASS' : 'SOURCE_CONFLICT',
      foreignSources: foreignSources
    });
  });

  // 7. Окремий контроль неправильного використання «Нарахування».
  const allSources = [];

  result.dashboardBlocks.forEach(function(item) {
    (item.formulaSources || []).forEach(function(source) {
      if (allSources.indexOf(source) === -1) {
        allSources.push(source);
      }
    });
  });

  result.sourcePolicyCheck.push({
    rule: 'Нарахування не використовується для нарахувань лікарям',
    actualReferenceFound: allSources.indexOf('Нарахування') !== -1,
    expectedUse: 'Нарахування — лише облік вакцин'
  });

  result.finishedAt = new Date().toISOString();
  result.status = result.errors.length === 0
    ? 'OK_WITH_SOURCE_REPORT'
    : 'ERRORS_FOUND';

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
/**
 * R0 — аудит періодичної логіки дашборду.
 *
 * Перевіряє:
 * - центральний період E5:E6;
 * - legacy-фільтр H66;
 * - named ranges;
 * - формули з TODAY, NOW, DATE, MONTH, YEAR;
 * - зашиті дати та назви місяців у формулах.
 *
 * Нічого не змінює.
 */
function dashboardPeriodControlReadOnlyTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const result = {
    test: 'dashboardPeriodControlReadOnlyTest',
    mode: 'R0_READ_ONLY',
    spreadsheetName: ss.getName(),
    changesMade: false,
    errors: [],
    warnings: [],
    controls: {},
    namedRanges: [],
    formulaPeriodFindings: [],
    verdict: {}
  };

  function safe(label, fn) {
    try {
      return fn();
    } catch (error) {
      result.errors.push({
        area: label,
        message: String(error && error.message ? error.message : error)
      });
      return null;
    }
  }

  function readCell(sheetName, a1) {
    return safe(sheetName + '!' + a1, function() {
      const sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        return {
          exists: false,
          sheet: sheetName,
          range: a1
        };
      }

      const range = sheet.getRange(a1);

      return {
        exists: true,
        sheet: sheetName,
        range: a1,
        value: range.getDisplayValue(),
        formula: range.getFormula()
      };
    });
  }

  function scanFormulaSheet(sheetName) {
    return safe('formulaScan:' + sheetName, function() {
      const sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        return [];
      }

      const range = sheet.getDataRange();
      const formulas = range.getFormulas();
      const findings = [];

      const periodPattern =
        /(TODAY\s*\(|NOW\s*\(|DATE\s*\(|EOMONTH\s*\(|MONTH\s*\(|YEAR\s*\(|DAY\s*\(|202[0-9][-.\/][0-9]{1,2}[-.\/][0-9]{1,2}|202[0-9][-.\/][0-9]{1,2}|січень|лютий|березень|квітень|травень|червень|липень|серпень|вересень|жовтень|листопад|грудень)/i;

      for (let row = 0; row < formulas.length; row++) {
        for (let col = 0; col < formulas[row].length; col++) {
          const formula = String(formulas[row][col] || '').trim();

          if (!formula || !periodPattern.test(formula)) {
            continue;
          }

          findings.push({
            sheet: sheetName,
            cell: range.getCell(row + 1, col + 1).getA1Notation(),
            formula: formula
          });
        }
      }

      return findings;
    }) || [];
  }

  // 1. Фактичні поля періоду та локальні фільтри.
  result.controls = {
    centralDateFrom: readCell('Дашборд', 'E5'),
    centralDateTo: readCell('Дашборд', 'E6'),
    globalDay: readCell('Дашборд', 'F5'),
    globalMonth: readCell('Дашборд', 'F6'),
    legacyIncomeMonth: readCell('Дашборд', 'H66'),
    incomeCategory: readCell('Дашборд', 'F72'),
    expenseCategory: readCell('Дашборд', 'F99')
  };

  // 2. Named ranges, які можуть впливати на період.
  result.namedRanges = safe('namedRanges', function() {
    const names = [
      'DASH_DATE_FROM',
      'DASH_DATE_TO',
      'DASH_GLOBAL_DAY',
      'DASH_GLOBAL_MONTH',
      'DASH_INCOME_MONTH'
    ];

    return ss.getNamedRanges()
      .filter(function(namedRange) {
        return names.indexOf(namedRange.getName()) !== -1;
      })
      .map(function(namedRange) {
        const range = namedRange.getRange();

        return {
          name: namedRange.getName(),
          sheet: range.getSheet().getName(),
          range: range.getA1Notation(),
          value: range.getDisplayValue(),
          formula: range.getFormula()
        };
      });
  }) || [];

  // 3. Пошук періодичної логіки у формулах.
  ['Дашборд', 'Дані дашборду'].forEach(function(sheetName) {
    const findings = scanFormulaSheet(sheetName);

    findings.forEach(function(item) {
      result.formulaPeriodFindings.push(item);
    });
  });

  // 4. Висновок щодо центрального фільтра.
  const fromValue = result.controls.centralDateFrom &&
    result.controls.centralDateFrom.value;

  const toValue = result.controls.centralDateTo &&
    result.controls.centralDateTo.value;

  const legacyValue = result.controls.legacyIncomeMonth &&
    result.controls.legacyIncomeMonth.value;

  result.verdict = {
    centralPeriodPresent: !!fromValue && !!toValue,
    legacyPeriodPresent: !!legacyValue,
    formulasContainPeriodLogic: result.formulaPeriodFindings.length > 0,
    status: 'REVIEW_REQUIRED'
  };

  if (!fromValue || !toValue) {
    result.errors.push({
      area: 'centralPeriod',
      message: 'Центральний період E5:E6 не заповнений повністю.'
    });
  }

  if (legacyValue) {
    result.warnings.push({
      area: 'legacyPeriod',
      message: 'H66 містить окремий період і не має використовуватися в новій логіці.',
      value: legacyValue
    });
  }

  if (result.formulaPeriodFindings.length > 0) {
    result.warnings.push({
      area: 'formulaPeriodLogic',
      message: 'У формулах знайдено періодичну логіку або функції дати.'
    });
  }

  if (
    result.verdict.centralPeriodPresent &&
    !result.verdict.formulasContainPeriodLogic
  ) {
    result.verdict.status = 'CENTRAL_FILTER_ONLY_CONFIRMED_IN_FORMULAS';
  }

  result.finishedAt = new Date().toISOString();

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
/**
 * R0 — перевірка моделі періодів:
 * MONTH / QUARTER / ALL.
 *
 * Нічого не змінює.
 */
function dashboardPeriodModelReadOnlyTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dashboard = ss.getSheetByName('Дашборд');
  const pl = ss.getSheetByName('P&L');

  const result = {
    test: 'dashboardPeriodModelReadOnlyTest',
    mode: 'R0_READ_ONLY',
    spreadsheetName: ss.getName(),
    changesMade: false,
    errors: [],
    warnings: [],
    controls: {},
    plAvailability: {},
    expectedModes: {},
    verdict: {}
  };

  function value(sheet, a1) {
    if (!sheet) return null;

    const range = sheet.getRange(a1);

    return {
      value: range.getDisplayValue(),
      rawValue: range.getValue(),
      formula: range.getFormula()
    };
  }

  function clean(value) {
    return String(value === null || value === undefined ? '' : value)
      .trim();
  }

  function findRevenueRow() {
    if (!pl) return null;

    const lastRow = pl.getLastRow();
    const labels = pl.getRange(1, 1, lastRow, 3).getDisplayValues();

    for (let row = 0; row < labels.length; row++) {
      const text = labels[row]
        .map(clean)
        .join(' ')
        .toLowerCase();

      if (text.indexOf('операційний дохід') !== -1) {
        return row + 1;
      }
    }

    return null;
  }

  function parseMonthHeader(value) {
    const text = clean(value);

    if (!text) return null;

    const monthNames = {
      січень: 1,
      лютий: 2,
      березень: 3,
      квітень: 4,
      травень: 5,
      червень: 6,
      липень: 7,
      серпень: 8,
      вересень: 9,
      жовтень: 10,
      листопад: 11,
      грудень: 12
    };

    const lower = text.toLowerCase();

    for (const monthName in monthNames) {
      if (lower.indexOf(monthName) !== -1) {
        const yearMatch = lower.match(/20\d{2}/);

        return {
          month: monthNames[monthName],
          year: yearMatch ? Number(yearMatch[0]) : null,
          label: text
        };
      }
    }

    if (value instanceof Date && !isNaN(value.getTime())) {
      return {
        month: value.getMonth() + 1,
        year: value.getFullYear(),
        label: text
      };
    }

    return null;
  }

  // 1. Поточний стан фільтрів.
  result.controls = {
    dateFrom: value(dashboard, 'E5'),
    dateTo: value(dashboard, 'E6'),
    day: value(dashboard, 'F5'),
    month: value(dashboard, 'F6'),
    legacyIncomeMonth: value(dashboard, 'H66')
  };

  // 2. Перевірка заборонених незалежних періодів.
  if (clean(result.controls.day.value)) {
    result.errors.push({
      area: 'dayFilter',
      message: 'F5 містить окремий денний фільтр. У новій моделі день не використовується.'
    });
  }

  if (clean(result.controls.legacyIncomeMonth.value)) {
    result.errors.push({
      area: 'legacyFilter',
      message: 'H66 містить окремий період і не може брати участь у розрахунках.',
      value: result.controls.legacyIncomeMonth.value
    });
  }

  // 3. Пошук доступних місяців у P&L.
  if (!pl) {
    result.errors.push({
      area: 'P&L',
      message: 'Лист P&L не знайдено.'
    });
  } else {
    const lastColumn = pl.getLastColumn();
    const headerValues = pl.getRange(7, 1, 1, lastColumn).getValues()[0];
    const headerDisplay = pl.getRange(7, 1, 1, lastColumn).getDisplayValues()[0];

    const revenueRow = findRevenueRow();
    const revenueValues = revenueRow
      ? pl.getRange(revenueRow, 1, 1, lastColumn).getValues()[0]
      : [];

    const availableMonths = [];

    for (let column = 0; column < lastColumn; column++) {
      const parsed = parseMonthHeader(
        headerValues[column] || headerDisplay[column]
      );

      if (!parsed) continue;

      const revenueValue = revenueValues[column];
      const hasFact =
        revenueValue !== '' &&
        revenueValue !== null &&
        revenueValue !== undefined;

      availableMonths.push({
        column: column + 1,
        header: parsed.label,
        month: parsed.month,
        year: parsed.year,
        hasRevenueFact: hasFact
      });
    }

    const factMonths = availableMonths.filter(function(item) {
      return item.hasRevenueFact;
    });

    result.plAvailability = {
      revenueRow: revenueRow,
      allPeriodHeaders: availableMonths,
      monthsWithRevenueFact: factMonths,
      firstAvailableMonth: factMonths.length
        ? factMonths[0]
        : null,
      lastAvailableMonth: factMonths.length
        ? factMonths[factMonths.length - 1]
        : null
    };
  }

  // 4. Очікувана модель режимів.
  result.expectedModes = {
    MONTH: {
      description: 'Один обраний місяць',
      expected: 'Повний календарний місяць'
    },
    QUARTER: {
      description: 'Один обраний квартал',
      expected: 'Три повні календарні місяці'
    },
    ALL: {
      description: 'Місяць або квартал не обрано',
      expected: 'Від першого доступного місяця P&L до останнього доступного місяця P&L'
    }
  };

  // 5. Поточний режим.
  const hasMonth = clean(result.controls.month.value) !== '';
  const hasFrom = clean(result.controls.dateFrom.value) !== '';
  const hasTo = clean(result.controls.dateTo.value) !== '';

  if (hasMonth) {
    result.verdict.currentMode = 'MONTH';
  } else if (hasFrom || hasTo) {
    result.verdict.currentMode = 'RANGE_OR_MANUAL_DATES';
    result.warnings.push({
      area: 'currentMode',
      message: 'Зараз період заданий через E5:E6, а не через режим «Місяць» або «Квартал».'
    });
  } else {
    result.verdict.currentMode = 'ALL';
  }

  result.verdict.allModeExpectedFrom =
    result.plAvailability.firstAvailableMonth || null;

  result.verdict.allModeExpectedTo =
    result.plAvailability.lastAvailableMonth || null;

  result.verdict.status =
    result.errors.length === 0
      ? 'REVIEW_REQUIRED'
      : 'PERIOD_MODEL_ERRORS_FOUND';

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
/**
 * R0 — визначення фактичного доступного періоду P&L.
 *
 * Враховує тільки колонки «Факт».
 * Колонки «План» ігнорує.
 * Нічого не змінює.
 */
function dashboardActualFactPeriodReadOnlyTest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const pl = ss.getSheetByName('P&L');

  const result = {
    test: 'dashboardActualFactPeriodReadOnlyTest',
    mode: 'R0_READ_ONLY',
    spreadsheetName: ss.getName(),
    changesMade: false,
    errors: [],
    warnings: [],
    factMonths: [],
    planMonthsIgnored: [],
    actualAvailablePeriod: null
  };

  if (!pl) {
    result.errors.push('Лист «P&L» не знайдено.');
    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  const lastColumn = pl.getLastColumn();
  const headers = pl.getRange(7, 1, 1, lastColumn).getDisplayValues()[0];

  const labels = pl
    .getRange(1, 1, pl.getLastRow(), 3)
    .getDisplayValues();

  let revenueRow = null;

  for (let row = 0; row < labels.length; row++) {
    const text = labels[row]
      .join(' ')
      .trim()
      .toLowerCase();

    if (text.indexOf('операційний дохід') !== -1) {
      revenueRow = row + 1;
      break;
    }
  }

  if (!revenueRow) {
    result.errors.push(
      'У P&L не знайдено рядок «Операційний дохід».'
    );

    Logger.log(JSON.stringify(result, null, 2));
    return result;
  }

  const revenueValues = pl
    .getRange(revenueRow, 1, 1, lastColumn)
    .getValues()[0];

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

  for (let column = 0; column < lastColumn; column++) {
    const header = String(headers[column] || '').trim();
    const lowerHeader = header.toLowerCase();

    const monthNumber = monthNames.findIndex(function(month) {
      return lowerHeader.indexOf(month) !== -1;
    }) + 1;

    if (!monthNumber) continue;

    const isFact = lowerHeader.indexOf('факт') !== -1;
    const isPlan = lowerHeader.indexOf('план') !== -1;

    const revenueValue = revenueValues[column];
    const hasFactValue =
      revenueValue !== '' &&
      revenueValue !== null &&
      revenueValue !== undefined;

    if (isPlan) {
      result.planMonthsIgnored.push({
        column: column + 1,
        header: header
      });
    }

    if (isFact && hasFactValue) {
      result.factMonths.push({
        column: column + 1,
        header: header,
        month: monthNumber,
        revenueValue: revenueValue
      });
    }
  }

  if (result.factMonths.length > 0) {
    result.actualAvailablePeriod = {
      from: result.factMonths[0],
      to: result.factMonths[result.factMonths.length - 1],
      mode: 'ALL',
      rule: 'від першого до останнього місяця з фактичними даними P&L'
    };
  } else {
    result.warnings.push(
      'Фактичних місяців у P&L не знайдено.'
    );
  }

  result.verdict =
    result.errors.length === 0 &&
    result.factMonths.length > 0
      ? 'ACTUAL_FACT_PERIOD_DETECTED'
      : 'REVIEW_REQUIRED';

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
/**
 * ============================================================
 * ProFin OS — CENTRAL PERIOD CONTEXT V1
 *
 * Новий єдиний період для реабілітованого дашборду.
 *
 * UI:
 *   Дашборд!E6 — Квартал
 *   Дашборд!F6 — Місяць
 *
 * Режими:
 *   MONTH   — обрано місяць;
 *   QUARTER — обрано квартал;
 *   ALL     — обидва поля порожні:
 *             від першого до останнього місяця з ФАКТОМ P&L.
 *
 * Цей блок:
 *   - не використовує E5, F5, H66;
 *   - не запускає старий dashboardGlobalFilterApply();
 *   - не змінює P&L, Базу операцій, діаграми чи кнопки;
 *   - не створює тригерів.
 * ============================================================
 */

const PROFIN_DASH_CENTRAL_PERIOD_V1_CFG = Object.freeze({
  version: 'PROFIN_DASH_CENTRAL_PERIOD_V1_2026_08_29',

  sheets: {
    dashboard: 'Дашборд',
    pl: 'P&L'
  },

  controls: {
    quarter: 'E6',
    month: 'F6'
  },

  pl: {
    reportYear: 2026,
    monthNumberRow: 6,
    factHeaderRow: 7,
    revenueRow: 8
  },

  propertyName: 'PROFIN_DASH_CENTRAL_PERIOD_V1',
  lockTimeoutMs: 30000,

  monthNames: [
    'Січень',
    'Лютий',
    'Березень',
    'Квітень',
    'Травень',
    'Червень',
    'Липень',
    'Серпень',
    'Вересень',
    'Жовтень',
    'Листопад',
    'Грудень'
  ]
});


/**
 * Read-only перевірка нового періоду.
 *
 * Запустити першою.
 * Нічого не записує у таблицю або властивості документа.
 */
function dashboardCentralPeriodV1Preview() {
  const context = dashboardCentralPeriodV1Build_();

  const result = {
    ok: true,
    mode: context.mode,
    periodKey: context.periodKey,
    label: context.label,
    from: dashboardCentralPeriodV1FormatDate_(context.from),
    to: dashboardCentralPeriodV1FormatDate_(context.to),
    dataScope: context.dataScope,
    source: context.source,
    selectedQuarter: context.selectedQuarter || '',
    selectedMonth: context.selectedMonth || '',
    availableMonths: context.availableMonths.map(function(item) {
      return item.label;
    }),
    availableQuarters: context.availableQuarters.map(function(item) {
      return item.label;
    }),
    changesMade: false
  };

  Logger.log(
    'dashboardCentralPeriodV1Preview: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


/**
 * Фіксує новий periodContext у Document Properties.
 *
 * Не запускає перерахунок дашборду.
 * Не викликає старий coordinator V8.
 */
function dashboardCentralPeriodV1Commit() {
  const cfg = PROFIN_DASH_CENTRAL_PERIOD_V1_CFG;
  const lock = LockService.getScriptLock();

  lock.waitLock(cfg.lockTimeoutMs);

  try {
    const context = dashboardCentralPeriodV1Build_();

    const state = {
      schemaVersion: 'V1',
      mode: context.mode,
      periodKey: context.periodKey,
      label: context.label,
      fromMs: context.from.getTime(),
      toMs: context.to.getTime(),
      dataScope: context.dataScope,
      source: context.source,
      appliedAtMs: Date.now()
    };

    PropertiesService
      .getDocumentProperties()
      .setProperty(
        cfg.propertyName,
        JSON.stringify(state)
      );

    const result = {
      ok: true,
      committed: true,
      state: state,
      changesMade: {
        documentProperty: cfg.propertyName,
        cells: false,
        charts: false,
        triggers: false,
        sourceSheets: false
      }
    };

    Logger.log(
      'dashboardCentralPeriodV1Commit: ' +
      JSON.stringify(result, null, 2)
    );

    return result;

  } finally {
    lock.releaseLock();
  }
}


/**
 * Читає останній зафіксований новий periodContext.
 * Read-only.
 */
function dashboardCentralPeriodV1ReadCommitted() {
  const raw = PropertiesService
    .getDocumentProperties()
    .getProperty(
      PROFIN_DASH_CENTRAL_PERIOD_V1_CFG.propertyName
    );

  if (!raw) {
    return {
      initialized: false,
      message: 'Новий periodContext ще не зафіксовано.'
    };
  }

  const state = JSON.parse(raw);

  return {
    initialized: true,
    mode: state.mode,
    periodKey: state.periodKey,
    label: state.label,
    from: dashboardCentralPeriodV1FormatDate_(
      new Date(state.fromMs)
    ),
    to: dashboardCentralPeriodV1FormatDate_(
      new Date(state.toMs)
    ),
    dataScope: state.dataScope,
    source: state.source,
    appliedAtMs: new Date(state.appliedAtMs).toISOString()
  };
}


/**
 * Внутрішній стандартний об’єкт періоду.
 */
function dashboardCentralPeriodV1Build_() {
  const cfg = PROFIN_DASH_CENTRAL_PERIOD_V1_CFG;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const dashboard = ss.getSheetByName(cfg.sheets.dashboard);
  const pl = ss.getSheetByName(cfg.sheets.pl);

  if (!dashboard) {
    throw new Error('CENTRAL PERIOD V1: не знайдено лист «Дашборд».');
  }

  if (!pl) {
    throw new Error('CENTRAL PERIOD V1: не знайдено лист «P&L».');
  }

  const selectedQuarter = dashboardCentralPeriodV1Clean_(
    dashboard.getRange(cfg.controls.quarter).getDisplayValue()
  );

  const selectedMonth = dashboardCentralPeriodV1Clean_(
    dashboard.getRange(cfg.controls.month).getDisplayValue()
  );

  if (selectedQuarter && selectedMonth) {
    throw new Error(
      'Оберіть або квартал у E6, або місяць у F6. ' +
      'Одночасний вибір заборонений.'
    );
  }

  const availableMonths =
    dashboardCentralPeriodV1ReadActualMonths_(pl);

  if (!availableMonths.length) {
    throw new Error(
      'У P&L не знайдено жодного місяця з фактичним ' +
      'значенням «Операційний дохід».'
    );
  }

  const availableQuarters =
    dashboardCentralPeriodV1BuildQuarterOptions_(
      availableMonths
    );

  if (selectedMonth) {
    const monthNumber =
      dashboardCentralPeriodV1ParseMonth_(
        selectedMonth
      );

    const month = availableMonths.filter(function(item) {
      return item.month === monthNumber;
    })[0];

    if (!month) {
      throw new Error(
        'Місяць «' + selectedMonth + '» не має фактичних даних P&L. ' +
        'Доступні: ' +
        availableMonths.map(function(item) {
          return item.label;
        }).join(', ') + '.'
      );
    }

    return dashboardCentralPeriodV1CreateContext_(
      'MONTH',
      month.month,
      month.month,
      availableMonths,
      availableQuarters,
      'Дашборд!F6'
    );
  }

  if (selectedQuarter) {
    const quarter =
      dashboardCentralPeriodV1ParseQuarter_(
        selectedQuarter
      );

    const quarterOption = availableQuarters.filter(function(item) {
      return item.quarter === quarter;
    })[0];

    if (!quarterOption) {
      throw new Error(
        'Квартал «' + selectedQuarter + '» ще не має ' +
        'фактичних даних P&L за всі три місяці.'
      );
    }

    return dashboardCentralPeriodV1CreateContext_(
      'QUARTER',
      quarterOption.fromMonth,
      quarterOption.toMonth,
      availableMonths,
      availableQuarters,
      'Дашборд!E6'
    );
  }

  return dashboardCentralPeriodV1CreateContext_(
    'ALL',
    availableMonths[0].month,
    availableMonths[availableMonths.length - 1].month,
    availableMonths,
    availableQuarters,
    'CENTRAL_FILTER_EMPTY_ALL_ACTUAL'
  );
}


function dashboardCentralPeriodV1ReadActualMonths_(pl) {
  const cfg = PROFIN_DASH_CENTRAL_PERIOD_V1_CFG;
  const lastRow = Math.min(Math.max(pl.getLastRow(), 1), 30);
  const lastColumn = pl.getLastColumn();

  const values = pl
    .getRange(1, 1, lastRow, lastColumn)
    .getValues();

  const displayValues = pl
    .getRange(1, 1, lastRow, lastColumn)
    .getDisplayValues();

  let revenueRowIndex = -1;

  for (let rowIndex = 0; rowIndex < lastRow; rowIndex++) {
    for (let columnIndex = 0; columnIndex < lastColumn; columnIndex++) {
      const label = dashboardCentralPeriodV1Clean_(
        displayValues[rowIndex][columnIndex]
      ).toLowerCase();

      if (label.indexOf('операційний дохід') !== -1) {
        revenueRowIndex = rowIndex;
        break;
      }
    }

    if (revenueRowIndex !== -1) {
      break;
    }
  }

  if (revenueRowIndex === -1) {
    throw new Error(
      'P&L: не знайдено рядок «Операційний дохід».'
    );
  }

  const resultByMonth = {};

  for (let columnIndex = 0; columnIndex < lastColumn; columnIndex++) {
    let isFactColumn = false;
    let month = null;

    for (let rowIndex = 0; rowIndex < revenueRowIndex; rowIndex++) {
      const header = dashboardCentralPeriodV1Clean_(
        displayValues[rowIndex][columnIndex]
      );

      const normalizedHeader = header.toLowerCase();

      if (normalizedHeader.indexOf('факт') !== -1) {
        isFactColumn = true;
      }

      if (!month) {
        month = dashboardCentralPeriodV1MonthFromHeader_(header);
      }

      if (!month) {
        const numericMonth = Number(
          values[rowIndex][columnIndex]
        );

        if (
          Number.isInteger(numericMonth) &&
          numericMonth >= 1 &&
          numericMonth <= 12
        ) {
          month = numericMonth;
        }
      }
    }

    const rawRevenue =
      values[revenueRowIndex][columnIndex];

    const displayRevenue =
      dashboardCentralPeriodV1Clean_(
        displayValues[revenueRowIndex][columnIndex]
      );

    const numericRevenue =
      dashboardCentralPeriodV1ParseNumber_(
        rawRevenue,
        displayRevenue
      );

    const hasActualRevenue =
      numericRevenue !== null;

    if (isFactColumn && month && hasActualRevenue) {
      resultByMonth[month] = {
        month: month,
        column: columnIndex + 1,
        revenueValue: numericRevenue,
        label:
          cfg.monthNames[month - 1] +
          ' ' +
          cfg.pl.reportYear
      };
    }
  }

  return Object.keys(resultByMonth)
    .map(function(key) {
      return resultByMonth[key];
    })
    .sort(function(a, b) {
      return a.month - b.month;
    });
}


function dashboardCentralPeriodV1ParseNumber_(
  rawValue,
  displayValue
) {
  if (
    typeof rawValue === 'number' &&
    Number.isFinite(rawValue)
  ) {
    return rawValue;
  }

  const text = String(displayValue || '')
    .replace(/\u00A0/g, '')
    .replace(/\s/g, '')
    .replace(/[₴грн%]/gi, '')
    .replace(',', '.')
    .trim();

  if (!text || text === '—' || text === '-') {
    return null;
  }

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : null;
}
/**
 * Розпізнає місяць у тексті:
 * «Факт Серпень», «Факт Серпень 2026» тощо.
 */
function dashboardCentralPeriodV1MonthFromHeader_(value) {
  const cfg = PROFIN_DASH_CENTRAL_PERIOD_V1_CFG;
  const normalized = dashboardCentralPeriodV1Clean_(value)
    .toLowerCase();

  for (let index = 0; index < cfg.monthNames.length; index++) {
    if (
      normalized.indexOf(
        cfg.monthNames[index].toLowerCase()
      ) !== -1
    ) {
      return index + 1;
    }
  }

  return null;
}  


function dashboardCentralPeriodV1BuildQuarterOptions_(months) {
  const cfg = PROFIN_DASH_CENTRAL_PERIOD_V1_CFG;
  const available = {};

  months.forEach(function(item) {
    available[item.month] = true;
  });

  const result = [];

  for (let quarter = 1; quarter <= 4; quarter++) {
    const fromMonth = (quarter - 1) * 3 + 1;
    const toMonth = fromMonth + 2;

    if (
      available[fromMonth] &&
      available[fromMonth + 1] &&
      available[toMonth]
    ) {
      result.push({
        quarter: quarter,
        fromMonth: fromMonth,
        toMonth: toMonth,
        label:
          quarter +
          ' квартал ' +
          cfg.pl.reportYear
      });
    }
  }

  return result;
}


function dashboardCentralPeriodV1CreateContext_(
  mode,
  fromMonth,
  toMonth,
  availableMonths,
  availableQuarters,
  source
) {
  const cfg = PROFIN_DASH_CENTRAL_PERIOD_V1_CFG;

  const from = new Date(
    cfg.pl.reportYear,
    fromMonth - 1,
    1
  );

  const to = new Date(
    cfg.pl.reportYear,
    toMonth,
    0
  );

  let label;
  let periodKey;

  if (mode === 'MONTH') {
    label =
      cfg.monthNames[fromMonth - 1] +
      ' ' +
      cfg.pl.reportYear;

    periodKey =
      cfg.pl.reportYear +
      '-' +
      String(fromMonth).padStart(2, '0');
  } else if (mode === 'QUARTER') {
    label =
      Math.ceil(fromMonth / 3) +
      ' квартал ' +
      cfg.pl.reportYear;

    periodKey =
      cfg.pl.reportYear +
      '-Q' +
      Math.ceil(fromMonth / 3);
  } else {
    label =
      'Увесь фактичний період: ' +
      cfg.monthNames[fromMonth - 1] +
      ' — ' +
      cfg.monthNames[toMonth - 1] +
      ' ' +
      cfg.pl.reportYear;

    periodKey =
      cfg.pl.reportYear +
      '-ALL-' +
      String(fromMonth).padStart(2, '0') +
      '-' +
      String(toMonth).padStart(2, '0');
  }

  return {
    mode: mode,
    periodKey: periodKey,
    label: label,
    from: from,
    to: to,
    dataScope: 'ACTUAL',
    source: source,
    selectedQuarter: mode === 'QUARTER' ? label : '',
    selectedMonth: mode === 'MONTH' ? label : '',
    availableMonths: availableMonths,
    availableQuarters: availableQuarters
  };
}


function dashboardCentralPeriodV1ParseMonth_(value) {
  const cfg = PROFIN_DASH_CENTRAL_PERIOD_V1_CFG;
  const normalized = dashboardCentralPeriodV1Clean_(value)
    .toLowerCase();

  for (let index = 0; index < cfg.monthNames.length; index++) {
    if (
      normalized.indexOf(
        cfg.monthNames[index].toLowerCase()
      ) !== -1
    ) {
      return index + 1;
    }
  }

  const numeric = Number(normalized);

  if (
    Number.isInteger(numeric) &&
    numeric >= 1 &&
    numeric <= 12
  ) {
    return numeric;
  }

  throw new Error(
    'Неможливо розпізнати місяць: «' + value + '».'
  );
}


function dashboardCentralPeriodV1ParseQuarter_(value) {
  const normalized = dashboardCentralPeriodV1Clean_(value)
    .toUpperCase();

  const roman = {
    'I': 1,
    'II': 2,
    'III': 3,
    'IV': 4
  };

  const romanMatch = normalized.match(/\b(III|II|IV|I)\b/);

  if (romanMatch && roman[romanMatch[1]]) {
    return roman[romanMatch[1]];
  }

  const numericMatch = normalized.match(/[1-4]/);

  if (numericMatch) {
    return Number(numericMatch[0]);
  }

  throw new Error(
    'Неможливо розпізнати квартал: «' + value + '».'
  );
}


function dashboardCentralPeriodV1Clean_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}


function dashboardCentralPeriodV1FormatDate_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}
/**
 * ============================================================
 * CENTRAL PERIOD V1 — ДИНАМІЧНІ СПИСКИ ФІЛЬТРІВ
 *
 * E6 — квартал
 * F6 — місяць
 *
 * Джерело списків:
 * тільки фактичні колонки P&L.
 *
 * Нічого не очищає і не запускає перерахунок.
 * ============================================================
 */
function dashboardCentralPeriodV1InstallDynamicLists() {
  const cfg = PROFIN_DASH_CENTRAL_PERIOD_V1_CFG;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const dashboard = ss.getSheetByName(cfg.sheets.dashboard);
  const pl = ss.getSheetByName(cfg.sheets.pl);

  if (!dashboard) {
    throw new Error(
      'Не знайдено лист «Дашборд».'
    );
  }

  if (!pl) {
    throw new Error(
      'Не знайдено лист «P&L».'
    );
  }

  const actualMonths =
    dashboardCentralPeriodV1ReadActualMonths_(pl);

  if (!actualMonths.length) {
    throw new Error(
      'У P&L не знайдено фактичних місяців.'
    );
  }

  const quarterOptions =
    dashboardCentralPeriodV1BuildQuarterOptions_(
      actualMonths
    );

  const monthValues =
    actualMonths.map(function(item) {
      return item.label;
    });

  const quarterValues =
    quarterOptions.map(function(item) {
      return item.label;
    });

  const quarterRange =
    dashboard.getRange(cfg.controls.quarter);

  const monthRange =
    dashboard.getRange(cfg.controls.month);

  const currentQuarter =
    dashboardCentralPeriodV1Clean_(
      quarterRange.getDisplayValue()
    );

  const currentMonth =
    dashboardCentralPeriodV1Clean_(
      monthRange.getDisplayValue()
    );

  /*
   * Перед записом перевіряємо наявні значення.
   * Якщо там залишився старий період,
   * нічого не змінюємо і повідомляємо про це.
   */
  if (
    currentQuarter &&
    quarterValues.indexOf(currentQuarter) === -1
  ) {
    throw new Error(
      'У E6 залишилося старе або недійсне значення: «' +
      currentQuarter +
      '». Очистіть E6 і запустіть функцію повторно.'
    );
  }

  if (
    currentMonth &&
    monthValues.indexOf(currentMonth) === -1
  ) {
    throw new Error(
      'У F6 залишилося старе або недійсне значення: «' +
      currentMonth +
      '». Очистіть F6 і запустіть функцію повторно.'
    );
  }

  const quarterRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        quarterValues,
        true
      )
      .setAllowInvalid(false)
      .setHelpText(
        'Оберіть квартал із фактичними даними P&L ' +
        'або залиште поле порожнім.'
      )
      .build();

  const monthRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(
        monthValues,
        true
      )
      .setAllowInvalid(false)
      .setHelpText(
        'Оберіть місяць із фактичними даними P&L ' +
        'або залиште поле порожнім.'
      )
      .build();

  quarterRange
    .setDataValidation(quarterRule)
    .setNumberFormat('@');

  monthRange
    .setDataValidation(monthRule)
    .setNumberFormat('@');

  SpreadsheetApp.flush();

  const result = {
    ok: true,
    quarterCell: 'Дашборд!E6',
    monthCell: 'Дашборд!F6',
    quarterOptions: quarterValues,
    monthOptions: monthValues,
    source: 'P&L — тільки фактичні місяці',
    changesMade: {
      validations: true,
      values: false,
      calculations: false,
      charts: false,
      triggers: false
    }
  };

  Logger.log(
    'dashboardCentralPeriodV1InstallDynamicLists: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}
