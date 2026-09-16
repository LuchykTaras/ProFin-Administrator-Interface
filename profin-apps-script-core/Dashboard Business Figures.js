// ============================================================
// Dashboard_Business_Figures_ProFin_OS.gs
// ProFin OS 2026 — Альтернатива Бабурка
// ============================================================
//
// Призначення:
//   Заповнює всі значення блоку «ЦИФРИ БІЗНЕСУ» на листі
//   «Дашборд» без зміни первинних даних, P&L, активів,
//   складу або обліку вакцин.
//
// Публічні функції:
//   dashboardBusinessFiguresAudit()
//   dashboardBusinessFiguresDryRun()
//   dashboardBusinessFiguresInstall()
//   dashboardBusinessFiguresRefresh()
//   dashboardBusinessFiguresHandleEdit_(e)
//
// Рекомендований порядок:
//   1) dashboardBusinessFiguresAudit()
//   2) dashboardBusinessFiguresDryRun()
//   3) dashboardBusinessFiguresInstall()
//   4) dashboardBusinessFiguresRefresh()
//
// ВАЖЛИВО:
//   Не створюйте другу function onEdit(e). За потреби додайте
//   dashboardBusinessFiguresHandleEdit_(e) до вже наявного onEdit.

const DASHBOARD_BUSINESS_FIGURES_CONFIG = {
  moduleVersion: 'BUSINESS_FIGURES_V1_2026',

  sheets: {
    dashboard: 'Дашборд',
    pl: 'P&L',
    assets: 'Активи',
    operations: 'База операцій',
    vaccineAccounting: 'Облік вакцин',
    inventory: 'Склад медичних запасів',
    inventoryMovements: 'Рух складу'
  },

  filters: {
  dateFromCell: 'E5',
  dateToCell: 'E6',
  dayCell: 'F5',
  monthCell: 'F6',
  reportYear: 2026
},

  pl: {
    monthNumberRow: 6,
    periodHeaderRow: 7,
    codeColumn: 2,   // B
    labelColumn: 3,  // C

    metrics: {
      revenue: {
        labels: ['Операційний дохід']
      },
      ebitda: {
        code: 'L-09-04',
        labels: ['Операційний прибуток (EBITDA)']
      },
      netProfit: {
        labels: ['Фінансовий результат Чистий прибуток']
      },
      opex: {
        labels: [
          'Постійніі (операційні) витрати OPEX',
          'Постійні (операційні) витрати OPEX'
        ]
      },
      doctorAccruals: {
  labels: ['Лікарі']
 },
      depreciation: {
        labels: ['Амортизація']
      }
    }
  },

  assets: {
    metricColumn: 13, // M
    valueColumn: 14,  // N
    metricLabel: 'Первісна вартість активів на балансі',
    updatedAtLabel: 'Оновлено станом на'
  },

  dashboardMetrics: {
    revenue: {
      labelCell: 'B11',
      rangeA1: 'B12:C12',
      valueCell: 'B12',
      namedRange: 'DASH_KPI_REVENUE',
      format: 'money'
    },
    netProfit: {
      labelCell: 'D11',
      rangeA1: 'D12',
      valueCell: 'D12',
      namedRange: 'DASH_KPI_NET_PROFIT',
      format: 'money'
    },
    netMargin: {
      labelCell: 'E11',
      rangeA1: 'E12',
      valueCell: 'E12',
      namedRange: 'DASH_KPI_NET_MARGIN',
      format: 'percent'
    },
    opex: {
      labelCell: 'F11',
      rangeA1: 'F12',
      valueCell: 'F12',
      namedRange: 'DASH_KPI_OPEX',
      format: 'money'
    },
    doctorAccruals: {
      labelCell: 'G11',
      rangeA1: 'G12',
      valueCell: 'G12',
      namedRange: 'DASH_KPI_DOCTOR_ACCRUALS',
      format: 'money'
    },
    assetGrossValue: {
      labelCell: 'B13',
      rangeA1: 'B14:C14',
      valueCell: 'B14',
      namedRange: 'DASH_KPI_ASSET_GROSS_VALUE',
      format: 'money'
    },
    depreciationPeriod: {
      labelCell: 'D13',
      rangeA1: 'D14',
      valueCell: 'D14',
      namedRange: 'DASH_KPI_DEPRECIATION_PERIOD',
      format: 'money'
    },
    ebitdaMargin: {
      labelCell: 'E13',
      rangeA1: 'E14',
      valueCell: 'E14',
      namedRange: 'DASH_KPI_EBITDA_MARGIN',
      format: 'percent'
    },
    vaccinesClinic: {
      labelCell: 'B15',
      rangeA1: 'B16',
      valueCell: 'B16',
      namedRange: 'DASH_KPI_VACCINES_CLINIC',
      format: 'count'
    },
    vaccinesStorage: {
      labelCell: 'D15',
      rangeA1: 'D16',
      valueCell: 'D16',
      namedRange: 'DASH_KPI_VACCINES_STORAGE',
      format: 'count'
    },
    vaccinesUsed: {
      labelCell: 'E15',
      rangeA1: 'E16',
      valueCell: 'E16',
      namedRange: 'DASH_KPI_VACCINES_USED',
      format: 'count'
    }
  },

  numberFormats: {
    money: '#,##0.00 "грн";[Red]-#,##0.00 "грн";0.00 "грн"',
    percent: '0.0%;[Red]-0.0%;0.0%',
    count: '0 "шт."'
  },

  properties: {
    version: 'PROFIN_DASH_BUSINESS_FIGURES_VERSION',
    lastPeriod: 'PROFIN_DASH_BUSINESS_FIGURES_LAST_PERIOD',
    lastUpdatedAt: 'PROFIN_DASH_BUSINESS_FIGURES_LAST_UPDATED_AT'
  },

  lockTimeoutMs: 20000,
  numericTolerance: 0.01
};


// ============================================================
// 1. READ-ONLY АУДИТ
// ============================================================

function dashboardBusinessFiguresAudit() {
  const context = dashboardBusinessFiguresAssertReady_();
  const period = dashboardBusinessFiguresResolvePeriod_(context);
  const plLayout = dashboardBusinessFiguresResolvePlLayout_(
    context.plSheet,
    period
  );

  const metricRows = {};
  Object.keys(DASHBOARD_BUSINESS_FIGURES_CONFIG.pl.metrics).forEach(
    function(metricCode) {
      metricRows[metricCode] = dashboardBusinessFiguresFindPlMetricRow_(
        context.plSheet,
        DASHBOARD_BUSINESS_FIGURES_CONFIG.pl.metrics[metricCode]
      );
    }
  );

  const namedRanges = dashboardBusinessFiguresInspectNamedRanges_(
    context.ss,
    context.dashboardSheet
  );

  const result = {
    ok: true,
    moduleVersion: DASHBOARD_BUSINESS_FIGURES_CONFIG.moduleVersion,
    period: dashboardBusinessFiguresPeriodResult_(period),
    sheetsFound: Object.keys(context.sheetsFound),
    plFactColumns: plLayout.months.map(function(item) {
      return {
        month: item.month,
        column: item.column,
        header: item.header
      };
    }),
    plMetricRows: metricRows,
    namedRanges: namedRanges,
    targetCells: dashboardBusinessFiguresTargetCells_(),
    noCellsWritten: true
  };

  Logger.log(
    'dashboardBusinessFiguresAudit: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


// ============================================================
// 2. DRY RUN — НІЧОГО НЕ ЗАПИСУЄ
// ============================================================

function dashboardBusinessFiguresDryRun() {
  const context = dashboardBusinessFiguresAssertReady_();
  const period = dashboardBusinessFiguresResolvePeriod_(context);
  const model = dashboardBusinessFiguresCalculateModel_(context, period);

  const result = {
    ok: model.issues.length === 0,
    moduleVersion: DASHBOARD_BUSINESS_FIGURES_CONFIG.moduleVersion,
    period: dashboardBusinessFiguresPeriodResult_(period),
    values: model.values,
    sources: model.sources,
    warnings: model.warnings,
    issues: model.issues,
    noCellsWritten: true
  };

  Logger.log(
    'dashboardBusinessFiguresDryRun: ' +
    JSON.stringify(result, null, 2)
  );

  return result;
}


// ============================================================
// 3. ОДНОРАЗОВА ІНСТАЛЯЦІЯ
// ============================================================

function dashboardBusinessFiguresInstall() {
  return dashboardBusinessFiguresRunWrite_('INSTALL');
}


// ============================================================
// 4. РОБОЧЕ ОНОВЛЕННЯ
// ============================================================

function dashboardBusinessFiguresRefresh(explicitPeriod) {
  return dashboardBusinessFiguresRunWrite_(
    'REFRESH',
    explicitPeriod
  );
}


function dashboardBusinessFiguresRunWrite_(
  mode,
  explicitPeriod
) {
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(DASHBOARD_BUSINESS_FIGURES_CONFIG.lockTimeoutMs)) {
    throw new Error(
      'Не вдалося отримати блокування для оновлення блоку «Цифри бізнесу».'
    );
  }

  const startedAt = Date.now();

  try {
  const context = dashboardBusinessFiguresAssertReady_();

const period = explicitPeriod
  ? dashboardBusinessFiguresNormalizeExternalPeriod_(
      explicitPeriod
    )
  : dashboardBusinessFiguresResolvePeriod_(
      context
    );

const model = dashboardBusinessFiguresCalculateModel_(
  context,
  period
);

    if (model.issues.length > 0) {
      throw new Error(
        'Розрахунок «Цифр бізнесу» зупинено: ' +
        model.issues.map(function(issue) {
          return issue.message;
        }).join(' | ')
      );
    }

    const namedRangeResult = dashboardBusinessFiguresCreateOrRepairNamedRanges_(
      context.ss,
      context.dashboardSheet
    );

    const writeResult = dashboardBusinessFiguresWriteModel_(
      context.dashboardSheet,
      model,
      period
    );

    const updatedAt = new Date();
    const properties = PropertiesService.getDocumentProperties();

    properties.setProperty(
      DASHBOARD_BUSINESS_FIGURES_CONFIG.properties.version,
      DASHBOARD_BUSINESS_FIGURES_CONFIG.moduleVersion
    );
    properties.setProperty(
      DASHBOARD_BUSINESS_FIGURES_CONFIG.properties.lastPeriod,
      dashboardBusinessFiguresPeriodKey_(period)
    );
    properties.setProperty(
      DASHBOARD_BUSINESS_FIGURES_CONFIG.properties.lastUpdatedAt,
      updatedAt.toISOString()
    );

    const result = {
      ok: true,
      mode: mode,
      moduleVersion: DASHBOARD_BUSINESS_FIGURES_CONFIG.moduleVersion,
      period: dashboardBusinessFiguresPeriodResult_(period),
      values: model.values,
      cellsWritten: writeResult.cellsWritten,
      namedRangesCreated: namedRangeResult.created,
      namedRangesRepaired: namedRangeResult.repaired,
      warnings: model.warnings,
      durationMs: Date.now() - startedAt,
      noSourceCellsWritten: true
    };

    Logger.log(
      'dashboardBusinessFigures' + mode + ': ' +
      JSON.stringify(result, null, 2)
    );

    return result;

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 4.1. ОНОВЛЕННЯ ТІЛЬКИ 3 ВАКЦИННИХ KPI
//      для DAY / неповного RANGE
// ============================================================

function dashboardBusinessFiguresRefreshVaccines(
  explicitPeriod
) {
  const lock =
    LockService.getDocumentLock();

  if (
    !lock.tryLock(
      DASHBOARD_BUSINESS_FIGURES_CONFIG
        .lockTimeoutMs
    )
  ) {
    throw new Error(
      'Не вдалося отримати блокування для оновлення вакцинних KPI.'
    );
  }

  try {
    const context =
      dashboardBusinessFiguresAssertReady_();

    const period = explicitPeriod
      ? dashboardBusinessFiguresNormalizeExternalPeriod_(
          explicitPeriod
        )
      : dashboardBusinessFiguresResolvePeriod_(
          context
        );

    const warnings = [];

    /*
     * Використовуємо вже наявне
     * розрахункове ядро вакцин.
     *
     * Воно дає:
     * B16 — станом на period.to;
     * D16 — станом на period.to;
     * E16 — за period.from..period.to.
     */
    const vaccines =
      dashboardBusinessFiguresCalculateVaccines_(
        context,
        period,
        warnings
      );

    const values = {
      vaccinesClinic:
        vaccines.vaccinesClinic,

      vaccinesStorage:
        vaccines.vaccinesStorage,

      vaccinesUsed:
        vaccines.vaccinesUsed
    };

    const sources = {
      vaccinesClinic:
        vaccines.sources.vaccinesClinic,

      vaccinesStorage:
        vaccines.sources.vaccinesStorage,

      vaccinesUsed:
        vaccines.sources.vaccinesUsed
    };

    const metricCodes = [
      'vaccinesClinic',
      'vaccinesStorage',
      'vaccinesUsed'
    ];

    const metrics =
      DASHBOARD_BUSINESS_FIGURES_CONFIG
        .dashboardMetrics;

    const snapshot = {};
    const updatedAt = new Date();

    /*
     * Snapshot лише трьох KPI.
     *
     * Фінансові картки взагалі
     * не читаємо і не змінюємо.
     */
    metricCodes.forEach(function(metricCode) {
      const cell =
        context.dashboardSheet.getRange(
          metrics[metricCode].valueCell
        );

      snapshot[metricCode] = {
        value:
          cell.getValue(),

        formula:
          cell.getFormula(),

        note:
          cell.getNote()
      };
    });

    try {
      metricCodes.forEach(function(metricCode) {
        const cell =
          context.dashboardSheet.getRange(
            metrics[metricCode].valueCell
          );

        const value =
          values[metricCode];

        if (
          value === null ||
          value === undefined ||
          !isFinite(Number(value))
        ) {
          cell.setValue(
            'Немає даних'
          );

        } else {
          cell.setValue(
            Number(value)
          );
        }

        cell.setNote(
          dashboardBusinessFiguresMetricNote_(
            metricCode,
            sources[metricCode],
            period,
            updatedAt
          )
        );
      });

      SpreadsheetApp.flush();

      /*
       * Контроль запису тільки
       * B16 / D16 / E16.
       */
      metricCodes.forEach(function(metricCode) {
        const expected =
          values[metricCode];

        const actual =
          context.dashboardSheet
            .getRange(
              metrics[metricCode]
                .valueCell
            )
            .getValue();

        if (
          expected === null ||
          expected === undefined ||
          !isFinite(Number(expected))
        ) {
          if (
            dashboardBusinessFiguresClean_(
              actual
            ) !== 'Немає даних'
          ) {
            throw new Error(
              'Контроль запису не пройдений для ' +
              metricCode +
              '.'
            );
          }

          return;
        }

        const actualNumber =
          dashboardBusinessFiguresNumber_(
            actual
          );

        if (
          actualNumber === null ||
          Math.abs(
            actualNumber -
            Number(expected)
          ) >
            DASHBOARD_BUSINESS_FIGURES_CONFIG
              .numericTolerance
        ) {
          throw new Error(
            'Контроль запису не пройдений для ' +
            metricCode +
            ': очікується ' +
            expected +
            ', записано ' +
            actual +
            '.'
          );
        }
      });

    } catch (error) {

      /*
       * Якщо щось не так —
       * повертаємо попередні
       * B16 / D16 / E16.
       */
      metricCodes.forEach(function(metricCode) {
        const cell =
          context.dashboardSheet.getRange(
            metrics[metricCode].valueCell
          );

        const old =
          snapshot[metricCode];

        cell.clearContent();

        if (old.formula) {
          cell.setFormula(
            old.formula
          );

        } else {
          cell.setValue(
            old.value
          );
        }

        cell.setNote(
          old.note
        );
      });

      SpreadsheetApp.flush();

      throw error;
    }

    return {
      ok: true,

      mode:
        'VACCINES_ONLY',

      period:
        dashboardBusinessFiguresPeriodResult_(
          period
        ),

      values:
        values,

      cellsWritten:
        metricCodes.map(
          function(metricCode) {
            return (
              context.dashboardSheet
                .getName() +
              '!' +
              metrics[metricCode]
                .valueCell
            );
          }
        ),

      warnings:
        warnings,

      financialKpisChanged:
        false,

      sourceSheetsChanged:
        false
    };

  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 5. РОЗРАХУНКОВЕ ЯДРО — READ ONLY
// ============================================================

function dashboardBusinessFiguresCalculateModel_(context, period) {
  const warnings = [];
  const issues = [];

  const financial = dashboardBusinessFiguresCalculateFinancial_(
    context.plSheet,
    period,
    warnings
  );

  const assets = dashboardBusinessFiguresCalculateAssets_(
    context.assetsSheet,
    period,
    warnings
  );

  const vaccines = dashboardBusinessFiguresCalculateVaccines_(
    context,
    period,
    warnings
  );

  if (financial.revenue === null) {
    issues.push({
      code: 'REVENUE_NOT_NUMERIC',
      message: 'Дохід P&L за обраний період не є числом.'
    });
  }

  if (financial.netProfit === null) {
    issues.push({
      code: 'NET_PROFIT_NOT_NUMERIC',
      message: 'Чистий прибуток P&L за обраний період не є числом.'
    });
  }

  const values = {
    revenue: financial.revenue,
    netProfit: financial.netProfit,
    netMargin: financial.netMargin,
    opex: financial.opex,
    doctorAccruals: financial.doctorAccruals,
    assetGrossValue: assets.assetGrossValue,
    depreciationPeriod: financial.depreciationPeriod,
    ebitdaMargin: financial.ebitdaMargin,
    vaccinesClinic: vaccines.vaccinesClinic,
    vaccinesStorage: vaccines.vaccinesStorage,
    vaccinesUsed: vaccines.vaccinesUsed
  };

  const sources = {
    revenue: financial.sources.revenue,
    netProfit: financial.sources.netProfit,
    netMargin: financial.sources.netMargin,
    opex: financial.sources.opex,
    doctorAccruals: financial.sources.doctorAccruals,
    assetGrossValue: assets.source,
    depreciationPeriod: financial.sources.depreciationPeriod,
    ebitdaMargin: financial.sources.ebitdaMargin,
    vaccinesClinic: vaccines.sources.vaccinesClinic,
    vaccinesStorage: vaccines.sources.vaccinesStorage,
    vaccinesUsed: vaccines.sources.vaccinesUsed
  };

  return {
    values: values,
    sources: sources,
    warnings: warnings,
    issues: issues
  };
}


function dashboardBusinessFiguresCalculateFinancial_(
  plSheet,
  period,
  warnings
) {
  dashboardBusinessFiguresAssertFullMonthPeriod_(
    period
  );

  /*
   * Усі фінансові KPI читаємо
   * тільки за періодом глобального фільтра.
   */
  const layout =
    dashboardBusinessFiguresResolvePlLayout_(
      plSheet,
      period
    );

  const cfg =
    DASHBOARD_BUSINESS_FIGURES_CONFIG.pl;

  const resolvedRows =
    {};

  Object.keys(
    cfg.metrics
  ).forEach(
    function(metricCode) {

      resolvedRows[
        metricCode
      ] =
        dashboardBusinessFiguresFindPlMetricRow_(
          plSheet,
          cfg.metrics[
            metricCode
          ]
        );
    }
  );


  const raw =
    {};

  const sourceCells =
    {};


  /*
   * ==========================================================
   * ОСНОВНІ KPI
   * ==========================================================
   *
   * Амортизацію обробляємо окремо нижче,
   * щоб зберегти fallback Факт -> План.
   */
  Object.keys(
    resolvedRows
  ).forEach(
    function(metricCode) {

      if (
        metricCode ===
        'depreciation'
      ) {
        return;
      }

      let total =
        0;

      const cells =
        [];


      layout.months.forEach(
        function(monthItem) {

          const cell =
            plSheet.getRange(
              resolvedRows[
                metricCode
              ],
              monthItem.column
            );

          const number =
            dashboardBusinessFiguresNumber_(
              cell.getValue()
            );


          if (
            number ===
            null
          ) {

            throw new Error(
              'P&L!' +
              cell.getA1Notation() +
              ' для метрики «' +
              metricCode +
              '» не є числом.'
            );
          }


          total +=
            number;


          cells.push(
            plSheet.getName() +
            '!' +
            cell.getA1Notation()
          );
        }
      );


      raw[
        metricCode
      ] =
        dashboardBusinessFiguresRound2_(
          total
        );


      sourceCells[
        metricCode
      ] =
        cells;
    }
  );


  /*
   * ==========================================================
   * АМОРТИЗАЦІЯ ЗА ВИБРАНИЙ ПЕРІОД
   * ==========================================================
   *
   * Більше НЕ читаємо січень-грудень.
   *
   * MONTH:
   *   тільки вибраний місяць.
   *
   * Кілька повних місяців:
   *   сума амортизації цих місяців.
   *
   * Зберігаємо старий fallback:
   * якщо Факт порожній або 0,
   * пробуємо План цього самого місяця.
   */
  let depreciationTotal =
    0;

  const depreciationCells =
    [];


  layout.months.forEach(
    function(monthItem) {

      const factCell =
        plSheet.getRange(
          resolvedRows
            .depreciation,
          monthItem.column
        );


      let number =
        dashboardBusinessFiguresNumber_(
          factCell.getValue()
        );


      let sourceCell =
        plSheet.getName() +
        '!' +
        factCell.getA1Notation();


      if (
        (
          number === null ||
          Math.abs(
            number
          ) <=
            0.0000001
        ) &&
        monthItem.column >
          2
      ) {

        const fallbackCell =
          plSheet.getRange(
            resolvedRows
              .depreciation,
            monthItem.column -
              2
          );


        const fallbackNumber =
          dashboardBusinessFiguresNumber_(
            fallbackCell.getValue()
          );


        if (
          fallbackNumber !==
            null &&
          Math.abs(
            fallbackNumber
          ) >
            0.0000001
        ) {

          number =
            fallbackNumber;


          sourceCell =
            plSheet.getName() +
            '!' +
            fallbackCell
              .getA1Notation();


          warnings.push({
            code:
              'DEPRECIATION_FACT_FALLBACK',

            message:
              'Амортизацію за місяць ' +
              monthItem.month +
              ' прочитано з ' +
              sourceCell +
              ', оскільки фактична клітинка ' +
              plSheet.getName() +
              '!' +
              factCell.getA1Notation() +
              ' порожня або дорівнює нулю.'
          });
        }
      }


      if (
        number ===
        null
      ) {

        throw new Error(
          'Не вдалося визначити амортизацію за місяць ' +
          monthItem.month +
          '.'
        );
      }


      depreciationTotal +=
        number;


      depreciationCells.push(
        sourceCell
      );
    }
  );


  raw.depreciation =
    dashboardBusinessFiguresRound2_(
      depreciationTotal
    );


  sourceCells.depreciation =
    depreciationCells;


  const revenue =
    raw.revenue;

  const netProfit =
    raw.netProfit;

  const ebitda =
    raw.ebitda;


  return {

    revenue:
      revenue,

    netProfit:
      netProfit,

    netMargin:
      Math.abs(
        revenue
      ) <=
        0.0000001
        ? null
        : netProfit /
          revenue,

    opex:
      Math.abs(
        raw.opex
      ),

    doctorAccruals:
      Math.abs(
        raw.doctorAccruals
      ),

    /*
     * Амортизація саме
     * за вибраний період.
     */
    depreciationPeriod:
      Math.abs(
        raw.depreciation
      ),

    ebitdaMargin:
      Math.abs(
        revenue
      ) <=
        0.0000001
        ? null
        : ebitda /
          revenue,

    sources: {

      revenue:
        sourceCells
          .revenue
          .join(', '),

      netProfit:
        sourceCells
          .netProfit
          .join(', '),

      netMargin:
        'Чистий прибуток / Дохід: ' +
        sourceCells
          .netProfit
          .join(', ') +
        ' / ' +
        sourceCells
          .revenue
          .join(', '),

      opex:
        sourceCells
          .opex
          .join(', '),

      doctorAccruals:
        sourceCells
          .doctorAccruals
          .join(', '),

      depreciationPeriod:
        sourceCells
          .depreciation
          .join(', '),

      ebitdaMargin:
        'EBITDA / Дохід: ' +
        sourceCells
          .ebitda
          .join(', ') +
        ' / ' +
        sourceCells
          .revenue
          .join(', ')
    }
  };
}

/**
 * Розраховує амортизаційний резерв
 * ЗА ВЕСЬ ЗВІТНИЙ РІК.
 *
 * Глобальний фільтр Дашборду
 * на цей показник не впливає.
 */
function dashboardBusinessFiguresCalculateAnnualDepreciation_(
  plSheet,
  depreciationRow,
  warnings
) {
  const year =
    DASHBOARD_BUSINESS_FIGURES_CONFIG
      .filters
      .reportYear;

  const annualPeriod = {
    mode: 'YEAR',
    from: new Date(year, 0, 1),
    to: new Date(year, 11, 31),
    source:
      'P&L — річний амортизаційний резерв за ' +
      year
  };

  /*
   * Отримуємо всі 12 місячних блоків P&L.
   */
  const annualLayout =
    dashboardBusinessFiguresResolvePlLayout_(
      plSheet,
      annualPeriod
    );

  let total = 0;
  const cells = [];

  annualLayout.months.forEach(function(monthItem) {
    const factCell =
      plSheet.getRange(
        depreciationRow,
        monthItem.column
      );

    let number =
      dashboardBusinessFiguresNumber_(
        factCell.getValue()
      );

    let sourceCell =
      plSheet.getName() +
      '!' +
      factCell.getA1Notation();

    /*
     * Зберігаємо твою чинну логіку:
     *
     * якщо у «Факт» амортизації
     * порожньо або 0 —
     * пробуємо планову клітинку
     * цього самого місяця.
     */
    if (
      (number === null ||
       Math.abs(number) <= 0.0000001) &&
      monthItem.column > 2
    ) {
      const fallbackCell =
        plSheet.getRange(
          depreciationRow,
          monthItem.column - 2
        );

      const fallbackNumber =
        dashboardBusinessFiguresNumber_(
          fallbackCell.getValue()
        );

      if (
        fallbackNumber !== null &&
        Math.abs(fallbackNumber) >
          0.0000001
      ) {
        number = fallbackNumber;

        sourceCell =
          plSheet.getName() +
          '!' +
          fallbackCell.getA1Notation();

        warnings.push({
          code:
            'ANNUAL_DEPRECIATION_FACT_FALLBACK',

          message:
            'Річний резерв: амортизацію за місяць ' +
            monthItem.month +
            ' прочитано з ' +
            sourceCell +
            ', оскільки фактична клітинка ' +
            plSheet.getName() +
            '!' +
            factCell.getA1Notation() +
            ' порожня або дорівнює нулю.'
        });
      }
    }

    if (number === null) {
      throw new Error(
        'Не вдалося визначити амортизацію за місяць ' +
        monthItem.month +
        ' для річного резерву.'
      );
    }

    total += number;
    cells.push(sourceCell);
  });

  return {
    value:
      Math.abs(
        dashboardBusinessFiguresRound2_(
          total
        )
      ),

    source:
      'Річний резерв ' +
      year +
      ': ' +
      cells.join(', ')
  };
}

function dashboardBusinessFiguresCalculateAssets_(assetsSheet, period, warnings) {
  const cfg = DASHBOARD_BUSINESS_FIGURES_CONFIG.assets;
  const lastRow = Math.max(assetsSheet.getLastRow(), 1);
  const values = assetsSheet
    .getRange(1, cfg.metricColumn, lastRow, 2)
    .getValues();

  let assetGrossValue = null;
  let sourceCell = '';
  let updatedAt = null;

  for (let index = 0; index < values.length; index++) {
    const label = dashboardBusinessFiguresNormalize_(values[index][0]);

    if (
      label === dashboardBusinessFiguresNormalize_(cfg.metricLabel)
    ) {
      assetGrossValue = dashboardBusinessFiguresNumber_(values[index][1]);
      sourceCell =
        assetsSheet.getName() + '!' +
        assetsSheet.getRange(index + 1, cfg.valueColumn).getA1Notation();
    }

    if (
      label === dashboardBusinessFiguresNormalize_(cfg.updatedAtLabel)
    ) {
      updatedAt = dashboardBusinessFiguresDateOnly_(values[index][1]);
    }
  }

  if (assetGrossValue === null) {
    throw new Error(
      'На листі «Активи» не знайдено числовий показник «' +
      cfg.metricLabel + '».'
    );
  }

  if (updatedAt && period.to.getTime() < updatedAt.getTime()) {
    warnings.push({
      code: 'ASSET_SUMMARY_CURRENT_NOT_HISTORICAL',
      message:
        'Показник активів є поточним підсумком листа «Активи» ' +
        'і не відновлює історичний стан на ' +
        dashboardBusinessFiguresFormatDate_(period.to) + '.'
    });
  }

  return {
    assetGrossValue: assetGrossValue,
    source: sourceCell || 'Активи!M:N'
  };
}


function dashboardBusinessFiguresCalculateVaccines_(
  context,
  period,
  warnings
) {
  /*
   * ==========================================================
   * ВАКЦИНИ + GLOBAL FILTER
   * ==========================================================
   *
   * ДЖЕРЕЛО КІНЦЕВИХ КІЛЬКОСТЕЙ:
   *
   *   Склад медичних запасів:
   *
   *   L = Продано / використано
   *   M = Передано на зберігання
   *   O = Поточний залишок
   *
   *
   * БАЗА ОПЕРАЦІЙ:
   *
   *   НЕ є джерелом підсумкового KPI.
   *
   *   Використовується лише для:
   *   - дати продажу / використання;
   *   - дати продажу на зберігання;
   *   - дати використання зі зберігання;
   *   - кількості одиниць конкретної датованої події.
   *
   *
   * B16:
   *   залишок клініки станом на period.to.
   *
   * D16:
   *   зовнішнє зберігання станом на period.to.
   *
   * E16:
   *   приріст L за period.from..period.to.
   *
   * Поточна контрольна точка завжди:
   *
   *   ΣL / ΣM / ΣO
   *
   * листа «Склад медичних запасів».
   * ==========================================================
   */

  const inventorySheet =
    context.inventorySheet;

  const operationsSheet =
    context.operationsSheet;


  if (!inventorySheet) {
    throw new Error(
      'Не знайдено лист «Склад медичних запасів».'
    );
  }


  if (!operationsSheet) {
    throw new Error(
      'Не знайдено лист «База операцій» ' +
      'для часової прив’язки вакцин.'
    );
  }


  const timeline =
    dashboardBusinessFiguresBuildVaccineInventoryTimeline_(
      inventorySheet,
      operationsSheet,
      warnings
    );

    /*
 * ==========================================================
 * GLOBAL FILTER ОЧИЩЕНО
 * ==========================================================
 *
 * Якщо E5 / E6 / F5 / F6 порожні,
 * dashboardBusinessFiguresResolvePeriod_()
 * ставить:
 *
 *   period.unfiltered = true
 *
 * У такому режимі НЕ застосовуємо
 * DAY / MONTH / RANGE до вакцин.
 *
 * Повертаємо поточні накопичувальні
 * значення безпосередньо з:
 *
 *   L — Продано / використано
 *   M — Передано на зберігання
 *   O — Поточний залишок
 *
 * «База операцій» у цьому режимі
 * не визначає значення KPI.
 */
if (
  period &&
  period.unfiltered === true
) {
  const currentClinic =
    Math.max(
      0,
      dashboardBusinessFiguresRound2_(
        timeline.current.clinic
      )
    );

  const currentStorage =
    Math.max(
      0,
      dashboardBusinessFiguresRound2_(
        timeline.current.storage
      )
    );

  const currentUsed =
    Math.max(
      0,
      dashboardBusinessFiguresRound2_(
        timeline.current.used
      )
    );


  return {
    vaccinesClinic:
      currentClinic,

    vaccinesStorage:
      currentStorage,

    vaccinesUsed:
      currentUsed,

    sources: {

      vaccinesClinic:
        'Склад медичних запасів — ' +
        'поточна загальна ΣO «Поточний залишок». ' +
        'Global Filter очищено.',

      vaccinesStorage:
        'Склад медичних запасів — ' +
        'поточна загальна ΣM «Передано на зберігання». ' +
        'Global Filter очищено.',

      vaccinesUsed:
        'Склад медичних запасів — ' +
        'поточна накопичувальна ΣL «Продано / використано». ' +
        'Global Filter очищено.'
    }
  };
}


  /*
   * Поточний місяць може мати period.to
   * у майбутньому.
   *
   * Наприклад:
   *
   * сьогодні 25.08,
   * F6 = Серпень,
   * period.to = 31.08.
   *
   * Майбутній склад не прогнозуємо.
   * Показуємо фактичний стан на сьогодні.
   */
  const today =
    dashboardBusinessFiguresDateOnly_(
      new Date()
    );


  let effectiveTo =
    dashboardBusinessFiguresDateOnly_(
      period.to
    );


  if (
    today &&
    effectiveTo &&
    effectiveTo.getTime() >
      today.getTime()
  ) {
    effectiveTo =
      today;

    warnings.push({
      code:
        'VACCINE_PERIOD_END_CLIPPED_TO_TODAY',

      message:
        'Дата завершення фільтра ' +
        dashboardBusinessFiguresFormatDate_(
          period.to
        ) +
        ' знаходиться після поточної дати. ' +
        'Вакцинні залишки показані станом на ' +
        dashboardBusinessFiguresFormatDate_(
          today
        ) +
        '.'
    });
  }


  if (!effectiveTo) {
    throw new Error(
      'Не вдалося визначити дату завершення ' +
      'періоду для вакцинних KPI.'
    );
  }


  /*
   * Стан на кінець періоду.
   */
  const endState =
    dashboardBusinessFiguresVaccineStateAt_(
      timeline,
      effectiveTo
    );


  /*
   * Для E16 потрібен стан L
   * на день ПЕРЕД period.from.
   */
  const beforeFrom =
    dashboardBusinessFiguresDateOnly_(
      period.from
    );


  if (!beforeFrom) {
    throw new Error(
      'Не вдалося визначити початок ' +
      'періоду для вакцинних KPI.'
    );
  }


  beforeFrom.setDate(
    beforeFrom.getDate() - 1
  );


  const beforeState =
    dashboardBusinessFiguresVaccineStateAt_(
      timeline,
      beforeFrom
    );


  /*
   * ==========================================================
   * B16 — ПОТОЧНИЙ ЗАЛИШОК СТАНОМ НА ДАТУ
   * ==========================================================
   */
  let vaccinesClinic =
    endState.clinic;


  /*
   * ==========================================================
   * D16 — НА ЗБЕРІГАННІ СТАНОМ НА ДАТУ
   * ==========================================================
   */
  let vaccinesStorage =
    endState.storage;


  /*
   * ==========================================================
   * E16 — ПРОДАНО / ВИКОРИСТАНО ЗА ПЕРІОД
   * ==========================================================
   *
   * Не SUM із Бази операцій.
   *
   * Це зміна складського L:
   *
   *   L(period.to)
   *      -
   *   L(day before period.from)
   */
  let vaccinesUsed =
    dashboardBusinessFiguresRound2_(
      endState.used -
      beforeState.used
    );


  if (vaccinesUsed < -0.01) {
    throw new Error(
      'Некоректна історія L «Продано / використано»: ' +
      'значення за період стало від’ємним (' +
      vaccinesUsed +
      ').'
    );
  }


  vaccinesClinic =
    Math.max(
      0,
      dashboardBusinessFiguresRound2_(
        vaccinesClinic
      )
    );


  vaccinesStorage =
    Math.max(
      0,
      dashboardBusinessFiguresRound2_(
        vaccinesStorage
      )
    );


  vaccinesUsed =
    Math.max(
      0,
      dashboardBusinessFiguresRound2_(
        vaccinesUsed
      )
    );


  /*
   * Якщо фільтр повністю знаходиться
   * до початку надійної історії складу —
   * не видаємо вигаданий залишок.
   */
  if (
    timeline.historyStart &&
    effectiveTo.getTime() <
      timeline.historyStart.getTime()
  ) {
    vaccinesClinic =
      null;

    vaccinesUsed =
      null;

    warnings.push({
      code:
        'VACCINE_INVENTORY_HISTORY_NOT_STARTED',

      message:
        'Надійна історія партій листа ' +
        '«Склад медичних запасів» починається ' +
        dashboardBusinessFiguresFormatDate_(
          timeline.historyStart
        ) +
        '.'
    });
  }


  return {
    vaccinesClinic:
      vaccinesClinic,

    vaccinesStorage:
      vaccinesStorage,

    vaccinesUsed:
      vaccinesUsed,

    sources: {

      vaccinesClinic:
        'Склад медичних запасів — O «Поточний залишок»; ' +
        'історичний стан відновлено за датами надходження ' +
        'та датованими вакцинними подіями. ' +
        'База операцій використана тільки як часовий журнал.',

      vaccinesStorage:
        'Склад медичних запасів — M «Передано на зберігання»; ' +
        'стан на дату відновлено за датами подій ' +
        '«Продаж на зберігання» / «Зміна статусу».',

      vaccinesUsed:
        'Склад медичних запасів — L «Продано / використано»; ' +
        'за період = L на кінець − L перед початком. ' +
        'Дати подій — База операцій.'
    }
  };
}


/**
 * ============================================================
 * ПОБУДОВА ЧАСОВОЇ МОДЕЛІ ВАКЦИН
 * ============================================================
 *
 * Поточна контрольна точка:
 *
 *   ΣL / ΣM / ΣO
 *
 * береться ТІЛЬКИ зі складу.
 *
 * База операцій потрібна для визначення,
 * КОЛИ складські накопичувальні значення
 * змінювалися.
 */
function dashboardBusinessFiguresBuildVaccineInventoryTimeline_(
  inventorySheet,
  operationsSheet,
  warnings
) {
  const tolerance =
    DASHBOARD_BUSINESS_FIGURES_CONFIG
      .numericTolerance;


  /*
   * ==========================================================
   * 1. СКЛАД
   * ==========================================================
   */
  const inventoryHeaders =
    dashboardBusinessFiguresHeaderMap_(
      inventorySheet
    );


  const inventoryIndexes = {

    stockType:
      dashboardBusinessFiguresRequireHeaderIndex_(
        inventoryHeaders,
        ['тип запасу']
      ),

    name:
      dashboardBusinessFiguresRequireHeaderIndex_(
        inventoryHeaders,
        ['найменування']
      ),

    receiptDate:
      dashboardBusinessFiguresRequireHeaderIndex_(
        inventoryHeaders,
        ['дата надходження']
      ),

    accepted:
      dashboardBusinessFiguresRequireHeaderIndex_(
        inventoryHeaders,
        ['прийнято']
      ),

    soldUsed:
      dashboardBusinessFiguresRequireHeaderIndex_(
        inventoryHeaders,
        ['продано / використано']
      ),

    storage:
      dashboardBusinessFiguresRequireHeaderIndex_(
        inventoryHeaders,
        ['передано на зберігання']
      ),

    balance:
      dashboardBusinessFiguresRequireHeaderIndex_(
        inventoryHeaders,
        ['поточний залишок']
      ),

    writtenOff:
      dashboardBusinessFiguresFindHeaderIndex_(
        inventoryHeaders,
        ['списано']
      ),

    movedOut:
      dashboardBusinessFiguresFindHeaderIndex_(
        inventoryHeaders,
        ['передано у філії']
      ),

    movementDate:
      dashboardBusinessFiguresFindHeaderIndex_(
        inventoryHeaders,
        ['дата та час переміщення']
      )
  };


  const inventoryUsedByName =
    Object.create(null);

  const inventoryStorageByName =
    Object.create(null);


  const receiptEvents = [];
  const transferEvents = [];


  let currentClinic = 0;
  let currentStorage = 0;
  let currentUsed = 0;

  let acceptedTotal = 0;
  let transferredTotal = 0;
  let writtenOffTotal = 0;

  let historyStart = null;
  let vaccineRows = 0;


  dashboardBusinessFiguresDataRows_(
    inventorySheet
  ).forEach(function(row) {

    const stockType =
      dashboardBusinessFiguresNormalize_(
        row[
          inventoryIndexes.stockType
        ]
      );


    if (
      stockType !== 'вакцина' &&
      stockType !== 'вакцини'
    ) {
      return;
    }


    vaccineRows++;


    const name =
      dashboardBusinessFiguresVaccineNameKey_(
        row[
          inventoryIndexes.name
        ]
      );


    const accepted =
      Math.max(
        0,
        dashboardBusinessFiguresNumber_(
          row[
            inventoryIndexes.accepted
          ]
        ) || 0
      );


    const soldUsed =
      Math.max(
        0,
        dashboardBusinessFiguresNumber_(
          row[
            inventoryIndexes.soldUsed
          ]
        ) || 0
      );


    const storage =
      Math.max(
        0,
        dashboardBusinessFiguresNumber_(
          row[
            inventoryIndexes.storage
          ]
        ) || 0
      );


    const balance =
      Math.max(
        0,
        dashboardBusinessFiguresNumber_(
          row[
            inventoryIndexes.balance
          ]
        ) || 0
      );


    acceptedTotal +=
      accepted;

    currentUsed +=
      soldUsed;

    currentStorage +=
      storage;

    currentClinic +=
      balance;


    inventoryUsedByName[name] =
      (
        inventoryUsedByName[name] ||
        0
      ) +
      soldUsed;


    inventoryStorageByName[name] =
      (
        inventoryStorageByName[name] ||
        0
      ) +
      storage;


    /*
     * Надходження.
     *
     * Кількість — зі складу.
     * Дата — «Дата надходження».
     */
    const receiptDate =
      dashboardBusinessFiguresDateOnly_(
        row[
          inventoryIndexes.receiptDate
        ]
      );


    if (
      receiptDate &&
      accepted > 0
    ) {
      receiptEvents.push({
        date:
          receiptDate,

        quantity:
          accepted,

        name:
          name
      });


      if (
        !historyStart ||
        receiptDate.getTime() <
          historyStart.getTime()
      ) {
        historyStart =
          receiptDate;
      }
    }


    /*
     * Міжфілійне вибуття.
     *
     * Воно впливає на O,
     * тому його потрібно вміти
     * повернути назад для історичної дати.
     */
    if (
      inventoryIndexes.movedOut >= 0
    ) {
      const movedOut =
        Math.max(
          0,
          dashboardBusinessFiguresNumber_(
            row[
              inventoryIndexes.movedOut
            ]
          ) || 0
        );


      if (movedOut > 0) {
        transferredTotal +=
          movedOut;


        const movementDate =
          inventoryIndexes.movementDate >= 0
            ? dashboardBusinessFiguresDateOnly_(
                row[
                  inventoryIndexes.movementDate
                ]
              )
            : null;


        if (movementDate) {
          transferEvents.push({
            date:
              movementDate,

            quantity:
              movedOut,

            name:
              name
          });

        } else {
          warnings.push({
            code:
              'VACCINE_TRANSFER_WITHOUT_DATE',

            message:
              'На складі є передача вакцин у філію ' +
              'без дати переміщення. ' +
              'Історичний O може бути неповним.'
          });
        }
      }
    }


    if (
      inventoryIndexes.writtenOff >= 0
    ) {
      writtenOffTotal +=
        Math.max(
          0,
          dashboardBusinessFiguresNumber_(
            row[
              inventoryIndexes.writtenOff
            ]
          ) || 0
        );
    }
  });


  if (vaccineRows === 0) {
    throw new Error(
      'На листі «Склад медичних запасів» ' +
      'немає рядків типу «Вакцина».'
    );
  }


  /*
   * ==========================================================
   * 2. БАЗА ОПЕРАЦІЙ — ТІЛЬКИ ЧАСОВІ ПОДІЇ
   * ==========================================================
   */
  const operationHeaders =
    dashboardBusinessFiguresHeaderMap_(
      operationsSheet
    );


  const operationIndexes = {

    transactionDate:
      dashboardBusinessFiguresRequireHeaderIndex_(
        operationHeaders,
        ['дата транзакції']
      ),

    type:
      dashboardBusinessFiguresRequireHeaderIndex_(
        operationHeaders,
        [
          'тип доходи / витрати',
          'тип доходи/витрати'
        ]
      ),

    category:
      dashboardBusinessFiguresRequireHeaderIndex_(
        operationHeaders,
        ['категорія']
      ),

    article:
      dashboardBusinessFiguresFindHeaderIndex_(
        operationHeaders,
        ['стаття']
      ),

    vaccineName:
      dashboardBusinessFiguresFindHeaderIndex_(
        operationHeaders,
        ['назва вакцини']
      ),

    vaccineQuantity:
      dashboardBusinessFiguresRequireHeaderIndex_(
        operationHeaders,
        ['кількість вакцин']
      ),

    usageDate:
      dashboardBusinessFiguresFindHeaderIndex_(
        operationHeaders,
        ['дата використання']
      ),

    vaccineId:
      dashboardBusinessFiguresFindHeaderIndex_(
        operationHeaders,
        ['id вакцини']
      ),

    status:
      dashboardBusinessFiguresFindHeaderIndex_(
        operationHeaders,
        ['статус запису']
      )
  };


  const directByName =
    Object.create(null);

  const storageSalesByName =
    Object.create(null);

  const storageSaleById =
    Object.create(null);

  const statusUseEvents = [];

  /*
   * Для D16 зберігаємо ВСІ історичні
   * зміни зовнішнього зберігання.
   *
   * Поточна точка все одно M зі складу.
   */
  const allStorageDeltas = [];


  dashboardBusinessFiguresDataRows_(
    operationsSheet
  ).forEach(function(row, dataIndex) {

    const type =
      dashboardBusinessFiguresNormalize_(
        row[
          operationIndexes.type
        ]
      );


    if (
      type !== 'вакцина' &&
      type !== 'вакцини'
    ) {
      return;
    }


    if (
      operationIndexes.status >= 0 &&
      dashboardBusinessFiguresVaccineOperationExcluded_(
        row[
          operationIndexes.status
        ]
      )
    ) {
      return;
    }


    const category =
      dashboardBusinessFiguresNormalize_(
        row[
          operationIndexes.category
        ]
      );


    const article =
      operationIndexes.article >= 0
        ? dashboardBusinessFiguresNormalize_(
            row[
              operationIndexes.article
            ]
          )
        : '';


    const transactionDate =
      dashboardBusinessFiguresDateOnly_(
        row[
          operationIndexes.transactionDate
        ]
      );


    const quantity =
      Math.abs(
        dashboardBusinessFiguresNumber_(
          row[
            operationIndexes.vaccineQuantity
          ]
        ) || 0
      );


    if (
      !transactionDate ||
      quantity <= 0
    ) {
      return;
    }


    const operationId =
      dashboardBusinessFiguresClean_(
        row[0]
      );


    /*
     * --------------------------------------------------------
     * ПРОДАЖ І ВИКОРИСТАННЯ
     * --------------------------------------------------------
     */
    if (
      category.indexOf(
        'продаж'
      ) !== -1 &&
      category.indexOf(
        'використ'
      ) !== -1
    ) {
      let eventDate =
        transactionDate;


      if (
        operationIndexes.usageDate >= 0
      ) {
        const usageDate =
          dashboardBusinessFiguresDateOnly_(
            row[
              operationIndexes.usageDate
            ]
          );


        if (usageDate) {
          eventDate =
            usageDate;
        }
      }


      /*
       * Події до появи складської історії
       * не прив'язуємо до L поточного складу.
       */
      if (
        historyStart &&
        eventDate.getTime() >=
          historyStart.getTime()
      ) {
        const name =
          dashboardBusinessFiguresVaccineNameKey_(
            operationIndexes.vaccineName >= 0
              ? (
                  row[
                    operationIndexes.vaccineName
                  ] ||
                  row[
                    operationIndexes.article
                  ]
                )
              : row[
                  operationIndexes.article
                ]
          );


        if (!directByName[name]) {
          directByName[name] = [];
        }


        directByName[name].push({
          date:
            eventDate,

          quantity:
            quantity,

          rowOrder:
            dataIndex,

          trackedQuantity:
            0
        });
      }


      return;
    }


    /*
     * --------------------------------------------------------
     * ПРОДАЖ НА ЗБЕРІГАННЯ
     * --------------------------------------------------------
     */
    if (
      category.indexOf(
        'зберіган'
      ) !== -1 &&
      category.indexOf(
        'продаж'
      ) !== -1
    ) {
      allStorageDeltas.push({
        date:
          transactionDate,

        delta:
          quantity
      });


      const name =
        dashboardBusinessFiguresVaccineNameKey_(
          operationIndexes.vaccineName >= 0
            ? (
                row[
                  operationIndexes.vaccineName
                ] ||
                row[
                  operationIndexes.article
                ]
              )
            : row[
                operationIndexes.article
              ]
        );


      const saleEvent = {
        id:
          operationId,

        date:
          transactionDate,

        quantity:
          quantity,

        name:
          name,

        rowOrder:
          dataIndex,

        trackedQuantity:
          0,

        trackedUsedQuantity:
          0
      };


      if (operationId) {
        storageSaleById[
          operationId
        ] =
          saleEvent;
      }


      if (
        historyStart &&
        transactionDate.getTime() >=
          historyStart.getTime()
      ) {
        if (
          !storageSalesByName[
            name
          ]
        ) {
          storageSalesByName[
            name
          ] = [];
        }


        storageSalesByName[
          name
        ].push(
          saleEvent
        );
      }


      return;
    }


    /*
     * --------------------------------------------------------
     * ЗМІНА СТАТУСУ -> ВИКОРИСТАНО
     * --------------------------------------------------------
     *
     * Така подія:
     *
     * M - 1
     * L + 1
     *
     * Але L збільшуємо тільки якщо
     * ця конкретна одиниця належить
     * до складського M/L контуру.
     */
    if (
      category.indexOf(
        'зміна статус'
      ) !== -1 &&
      article.indexOf(
        'використ'
      ) !== -1
    ) {
      allStorageDeltas.push({
        date:
          transactionDate,

        delta:
          -quantity
      });


      statusUseEvents.push({
        date:
          transactionDate,

        quantity:
          quantity,

        vaccineId:
          operationIndexes.vaccineId >= 0
            ? dashboardBusinessFiguresClean_(
                row[
                  operationIndexes.vaccineId
                ]
              )
            : '',

        rowOrder:
          dataIndex
      });
    }
  });


  /*
   * ==========================================================
   * 3. ПРИВ'ЯЗКА L ДО ДАТ
   * ==========================================================
   *
   * Для кожного препарату:
   *
   * L зі складу —
   * є контрольним підсумком.
   *
   * Спочатку віддаємо L прямим
   * «Продаж і використання».
   *
   * Залишок L повинен бути
   * використанням із M.
   */
  const allNames =
    Object.create(null);


  Object.keys(
    inventoryUsedByName
  ).forEach(function(name) {
    allNames[name] = true;
  });


  Object.keys(
    inventoryStorageByName
  ).forEach(function(name) {
    allNames[name] = true;
  });


  Object.keys(
    directByName
  ).forEach(function(name) {
    allNames[name] = true;
  });


  Object.keys(
    storageSalesByName
  ).forEach(function(name) {
    allNames[name] = true;
  });


  const trackedDirectEvents = [];
  const trackedStorageSaleEvents = [];

  const storageUseNeededByName =
    Object.create(null);


  Object.keys(
    allNames
  ).forEach(function(name) {

    const inventoryUsed =
      inventoryUsedByName[
        name
      ] || 0;


    const directEvents =
      directByName[
        name
      ] || [];


    const directAvailable =
      directEvents.reduce(
        function(sum, item) {
          return (
            sum +
            item.quantity
          );
        },
        0
      );


    /*
     * L — головний контроль.
     *
     * Якщо часових direct-подій більше,
     * ніж L складу, беремо лише стільки,
     * скільки реально є у L.
     */
    const directNeeded =
      Math.min(
        inventoryUsed,
        directAvailable
      );


    dashboardBusinessFiguresSelectLatestVaccineQuantity_(
      directEvents,
      directNeeded
    );


    directEvents.forEach(function(item) {
      if (
        item.trackedQuantity >
        0
      ) {
        trackedDirectEvents.push({
          date:
            item.date,

          quantity:
            item.trackedQuantity,

          name:
            name
        });
      }
    });


    const storageUseNeeded =
      Math.max(
        0,
        dashboardBusinessFiguresRound2_(
          inventoryUsed -
          directNeeded
        )
      );


    storageUseNeededByName[
      name
    ] =
      storageUseNeeded;


    /*
     * Поточне:
     *
     * M = продано на зберігання
     *     - використано зі зберігання.
     *
     * Отже:
     *
     * trackedStorageSales
     *   =
     * M + storageUseNeeded
     */
    const storageSaleNeeded =
      (
        inventoryStorageByName[
          name
        ] || 0
      ) +
      storageUseNeeded;


    const storageSaleEvents =
      storageSalesByName[
        name
      ] || [];


    dashboardBusinessFiguresSelectLatestVaccineQuantity_(
      storageSaleEvents,
      storageSaleNeeded
    );


    storageSaleEvents.forEach(function(item) {
      if (
        item.trackedQuantity >
        0
      ) {
        trackedStorageSaleEvents.push({
          date:
            item.date,

          quantity:
            item.trackedQuantity,

          name:
            name,

          saleId:
            item.id
        });
      }
    });
  });


  /*
   * ==========================================================
   * 4. ПРИВ'ЯЗКА «ЗМІНА СТАТУСУ -> ВИКОРИСТАНО»
   *    ДО КОНКРЕТНОГО ПРОДАЖУ НА ЗБЕРІГАННЯ
   * ==========================================================
   */
  statusUseEvents.sort(
    function(first, second) {

      const dateDiff =
        first.date.getTime() -
        second.date.getTime();


      if (dateDiff !== 0) {
        return dateDiff;
      }


      return (
        first.rowOrder -
        second.rowOrder
      );
    }
  );


  const trackedStorageUseEvents = [];

  const storageUsedMappedByName =
    Object.create(null);


  statusUseEvents.forEach(function(event) {

    const saleId =
      dashboardBusinessFiguresResolveStorageSaleId_(
        event.vaccineId,
        storageSaleById
      );


    if (!saleId) {
      /*
       * Історична / legacy одиниця.
       *
       * Вона впливає на D16,
       * але не повинна збільшувати
       * поточний L складу.
       */
      return;
    }


    const sale =
      storageSaleById[
        saleId
      ];


    if (
      !sale ||
      sale.trackedQuantity <=
        0
    ) {
      return;
    }


    const alreadyUsed =
      sale.trackedUsedQuantity ||
      0;


    const availableInSale =
      Math.max(
        0,
        sale.trackedQuantity -
        alreadyUsed
      );


    const name =
      sale.name;


    const mappedForName =
      storageUsedMappedByName[
        name
      ] || 0;


    const stillNeededForName =
      Math.max(
        0,
        (
          storageUseNeededByName[
            name
          ] || 0
        ) -
        mappedForName
      );


    const take =
      Math.min(
        event.quantity,
        availableInSale,
        stillNeededForName
      );


    if (take <= 0) {
      return;
    }


    sale.trackedUsedQuantity =
      alreadyUsed +
      take;


    storageUsedMappedByName[
      name
    ] =
      mappedForName +
      take;


    trackedStorageUseEvents.push({
      date:
        event.date,

      quantity:
        take,

      name:
        name,

      saleId:
        saleId
    });
  });


  /*
   * ==========================================================
   * 5. КОНТРОЛЬ ТОТОЖНОСТЕЙ
   * ==========================================================
   */
  const trackedDirectTotal =
    trackedDirectEvents.reduce(
      function(sum, item) {
        return sum + item.quantity;
      },
      0
    );


  const trackedStorageSaleTotal =
    trackedStorageSaleEvents.reduce(
      function(sum, item) {
        return sum + item.quantity;
      },
      0
    );


  const trackedStorageUseTotal =
    trackedStorageUseEvents.reduce(
      function(sum, item) {
        return sum + item.quantity;
      },
      0
    );


  /*
   * L:
   *
   * direct use
   * +
   * use from storage
   */
  const reconstructedUsed =
    dashboardBusinessFiguresRound2_(
      trackedDirectTotal +
      trackedStorageUseTotal
    );


  /*
   * M:
   *
   * tracked storage sales
   * -
   * tracked storage use
   */
  const reconstructedStorage =
    dashboardBusinessFiguresRound2_(
      trackedStorageSaleTotal -
      trackedStorageUseTotal
    );


  /*
   * O:
   *
   * accepted
   * -
   * direct use
   * -
   * storage sales
   * -
   * transfer out
   * -
   * write-off
   */
  const reconstructedClinic =
    dashboardBusinessFiguresRound2_(
      acceptedTotal -
      trackedDirectTotal -
      trackedStorageSaleTotal -
      transferredTotal -
      writtenOffTotal
    );


  const failedControls = [];


  if (
    Math.abs(
      reconstructedUsed -
      currentUsed
    ) >
    tolerance
  ) {
    failedControls.push(
      'L: склад=' +
      currentUsed +
      ', timeline=' +
      reconstructedUsed
    );
  }


  if (
    Math.abs(
      reconstructedStorage -
      currentStorage
    ) >
    tolerance
  ) {
    failedControls.push(
      'M: склад=' +
      currentStorage +
      ', timeline=' +
      reconstructedStorage
    );
  }


  if (
    Math.abs(
      reconstructedClinic -
      currentClinic
    ) >
    tolerance
  ) {
    failedControls.push(
      'O: склад=' +
      currentClinic +
      ', timeline=' +
      reconstructedClinic
    );
  }


  if (
    failedControls.length >
    0
  ) {
    throw new Error(
      'Вакцинний timeline не пройшов контроль L/M/O. ' +
      failedControls.join(' | ') +
      '. Підсумок із «Бази операцій» НЕ підставлено.'
    );
  }


  /*
   * Відсутність дати списання.
   *
   * Поточний O правильний,
   * але минулий O до дати списання
   * без події не можна відновити точно.
   */
  if (
    writtenOffTotal >
    tolerance
  ) {
    warnings.push({
      code:
        'VACCINE_WRITEOFF_DATE_NOT_MAPPED',

      message:
        'У «Склад медичних запасів» є списані вакцини (' +
        writtenOffTotal +
        ' шт.), але цей патч не має окремої ' +
        'датованої події списання. Поточний O правильний; ' +
        'історичний O до моменту списання може бути занижений.'
    });
  }


  return {

    historyStart:
      historyStart,

    current: {
      clinic:
        currentClinic,

      storage:
        currentStorage,

      used:
        currentUsed
    },

    receiptEvents:
      receiptEvents,

    transferEvents:
      transferEvents,

    directEvents:
      trackedDirectEvents,

    storageSaleEvents:
      trackedStorageSaleEvents,

    storageUseEvents:
      trackedStorageUseEvents,

    allStorageDeltas:
      allStorageDeltas,

    controls: {
      currentClinic:
        currentClinic,

      reconstructedClinic:
        reconstructedClinic,

      currentStorage:
        currentStorage,

      reconstructedStorage:
        reconstructedStorage,

      currentUsed:
        currentUsed,

      reconstructedUsed:
        reconstructedUsed
    }
  };
}


/**
 * ============================================================
 * СТАН ВАКЦИН НА КОНКРЕТНУ ДАТУ
 * ============================================================
 *
 * Починаємо від поточних L/M/O
 * і відкочуємо події, які відбулися
 * ПІСЛЯ requested date.
 */
function dashboardBusinessFiguresVaccineStateAt_(
  timeline,
  asOfDate
) {
  const asOf =
    dashboardBusinessFiguresDateOnly_(
      asOfDate
    );


  if (!asOf) {
    throw new Error(
      'Некоректна дата для відновлення стану вакцин.'
    );
  }


  let clinic =
    timeline.current.clinic;

  let storage =
    timeline.current.storage;

  let used =
    timeline.current.used;


  /*
   * Надходження після asOf
   * ще не існувало.
   */
  timeline.receiptEvents.forEach(
    function(event) {

      if (
        event.date.getTime() >
        asOf.getTime()
      ) {
        clinic -=
          event.quantity;
      }
    }
  );


  /*
   * Пряме використання після asOf:
   *
   * повертаємо назад в O
   * і забираємо з L.
   */
  timeline.directEvents.forEach(
    function(event) {

      if (
        event.date.getTime() >
        asOf.getTime()
      ) {
        clinic +=
          event.quantity;

        used -=
          event.quantity;
      }
    }
  );


  /*
   * Продаж на зберігання після asOf:
   *
   * повертаємо назад у клініку.
   *
   * M розраховується окремо
   * через повну storage-history.
   */
  timeline.storageSaleEvents.forEach(
    function(event) {

      if (
        event.date.getTime() >
        asOf.getTime()
      ) {
        clinic +=
          event.quantity;
      }
    }
  );


  /*
   * Використання зі зберігання
   * збільшило L.
   *
   * Для минулої дати
   * відкочуємо його з L.
   */
  timeline.storageUseEvents.forEach(
    function(event) {

      if (
        event.date.getTime() >
        asOf.getTime()
      ) {
        used -=
          event.quantity;
      }
    }
  );


  /*
   * Передача у філію після asOf:
   * вакцина на той момент ще була
   * в O клініки.
   */
  timeline.transferEvents.forEach(
    function(event) {

      if (
        event.date.getTime() >
        asOf.getTime()
      ) {
        clinic +=
          event.quantity;
      }
    }
  );


  /*
   * ==========================================================
   * M — ОКРЕМА ПОВНА ІСТОРІЯ ЗБЕРІГАННЯ
   * ==========================================================
   *
   * Поточна контрольна точка:
   *   M зі складу.
   *
   * Події:
   *   продаж на зберігання -> +M
   *   використано         -> -M
   *
   * Legacy-події теж враховуються,
   * тому історичний M може бути
   * більшим за поточні tracked-партії.
   */
  timeline.allStorageDeltas.forEach(
    function(event) {

      if (
        event.date.getTime() >
        asOf.getTime()
      ) {
        storage -=
          event.delta;
      }
    }
  );


  clinic =
    dashboardBusinessFiguresRound2_(
      clinic
    );

  storage =
    dashboardBusinessFiguresRound2_(
      storage
    );

  used =
    dashboardBusinessFiguresRound2_(
      used
    );


  /*
   * Малі похибки floating point.
   */
  if (
    Math.abs(clinic) <
    0.0000001
  ) {
    clinic = 0;
  }


  if (
    Math.abs(storage) <
    0.0000001
  ) {
    storage = 0;
  }


  if (
    Math.abs(used) <
    0.0000001
  ) {
    used = 0;
  }


  return {
    clinic:
      Math.max(
        0,
        clinic
      ),

    storage:
      Math.max(
        0,
        storage
      ),

    used:
      Math.max(
        0,
        used
      )
  };
}


/**
 * ============================================================
 * ВИБІР ОСТАННІХ ДАТОВАНИХ ОДИНИЦЬ
 * ============================================================
 *
 * Якщо у Базі операцій історичних подій
 * більше, ніж реально накопичено в L/M
 * поточного складу, старі legacy-події
 * не повинні потрапити у складський KPI.
 *
 * Тому кінцеву кількість визначає склад,
 * а Base Operations лише розкладає її
 * назад по датах.
 */
function dashboardBusinessFiguresSelectLatestVaccineQuantity_(
  events,
  neededQuantity
) {
  let remaining =
    Math.max(
      0,
      Number(
        neededQuantity
      ) || 0
    );


  events.forEach(function(event) {
    event.trackedQuantity =
      0;
  });


  const sorted =
    events.slice().sort(
      function(first, second) {

        const dateDiff =
          second.date.getTime() -
          first.date.getTime();


        if (dateDiff !== 0) {
          return dateDiff;
        }


        return (
          second.rowOrder -
          first.rowOrder
        );
      }
    );


  sorted.forEach(function(event) {

    if (
      remaining <=
      0
    ) {
      return;
    }


    const take =
      Math.min(
        event.quantity,
        remaining
      );


    event.trackedQuantity =
      take;


    remaining =
      dashboardBusinessFiguresRound2_(
        remaining -
        take
      );
  });


  return {
    requested:
      neededQuantity,

    unresolved:
      Math.max(
        0,
        remaining
      )
  };
}


/**
 * ============================================================
 * ПОШУК ID ПРОДАЖУ НА ЗБЕРІГАННЯ
 * ============================================================
 *
 * Приклади:
 *
 * VAC-20260810-522-V4
 *      ->
 * VAC-20260810-522
 *
 * Для старих форматів також пробуємо
 * прибрати останній "-1", "-2" тощо,
 * але лише якщо такий base ID реально
 * існує в «Базі операцій».
 */
function dashboardBusinessFiguresResolveStorageSaleId_(
  vaccineId,
  storageSaleById
) {
  const raw =
    dashboardBusinessFiguresClean_(
      vaccineId
    );


  if (!raw) {
    return '';
  }


  if (
    storageSaleById[
      raw
    ]
  ) {
    return raw;
  }


  const withoutV =
    raw.replace(
      /-V\d+$/i,
      ''
    );


  if (
    withoutV !== raw &&
    storageSaleById[
      withoutV
    ]
  ) {
    return withoutV;
  }


  const withoutNumber =
    raw.replace(
      /-\d+$/,
      ''
    );


  if (
    withoutNumber !== raw &&
    storageSaleById[
      withoutNumber
    ]
  ) {
    return withoutNumber;
  }


  return '';
}


/**
 * ============================================================
 * НОРМАЛІЗАЦІЯ НАЗВ ВАКЦИН
 * ============================================================
 */
function dashboardBusinessFiguresVaccineNameKey_(
  value
) {
  let text =
    dashboardBusinessFiguresNormalize_(
      value
    );


  text =
    text
      .replace(/[–—-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();


  /*
   * У файлі зустрічаються
   * різні написання одного препарату.
   */
  if (
    text ===
    'німенрикс'
  ) {
    text =
      'німменрикс';
  }


  if (
    text ===
      'превенар 13'
  ) {
    text =
      'превенар13';
  }


  return text;
}


/**
 * ============================================================
 * ВИКЛЮЧЕНІ СТАТУСИ БАЗИ ОПЕРАЦІЙ
 * ============================================================
 */
function dashboardBusinessFiguresVaccineOperationExcluded_(
  value
) {
  const status =
    dashboardBusinessFiguresNormalize_(
      value
    );


  if (!status) {
    return false;
  }


  return (
    status.indexOf(
      'скас'
    ) !== -1 ||

    status.indexOf(
      'ануль'
    ) !== -1 ||

    status.indexOf(
      'видален'
    ) !== -1 ||

    status.indexOf(
      'чернет'
    ) !== -1 ||

    status.indexOf(
      'помил'
    ) !== -1 ||

    status.indexOf(
      'відхилен'
    ) !== -1
  );
}


function dashboardBusinessFiguresCalculateClinicStock_(
  movementSheet,
  inventorySheet,
  asOfDate,
  warnings
) {
  /*
   * ==========================================================
   * 1. ПОТОЧНИЙ / МАЙБУТНІЙ END-DATE
   * ==========================================================
   *
   * Якщо дата, станом на яку показуємо залишок,
   * дорівнює сьогодні або знаходиться після сьогодні,
   * точним джерелом істини є фактичний поточний
   * залишок листа «Склад медичних запасів».
   *
   * Це особливо важливо для поточного місяця:
   *
   * F6 = Серпень
   * period.to = 31.08.2026
   *
   * але сьогодні, наприклад, 25.08.2026.
   *
   * Майбутній залишок на 31.08 передбачити неможливо,
   * тому показуємо точний фактичний стан на зараз.
   *
   * НЕ використовуємо цю гілку для минулих дат.
   */
  const today =
    dashboardBusinessFiguresDateOnly_(
      new Date()
    );

  if (
    today &&
    asOfDate.getTime() >=
      today.getTime()
  ) {
    const current =
      dashboardBusinessFiguresCurrentClinicStock_(
        inventorySheet
      );

    return {
      value:
        Math.max(
          0,
          dashboardBusinessFiguresRound2_(
            current
          )
        ),

      source:
        inventorySheet.getName() +
        ' — фактичний поточний залишок вакцин ' +
        'станом на ' +
        dashboardBusinessFiguresFormatDate_(
          today
        )
    };
  }


  /*
   * ==========================================================
   * 2. ІСТОРИЧНА ДАТА
   * ==========================================================
   *
   * Для минулих дат використовуємо тільки
   * фактичний журнал «Рух складу».
   *
   * Поточний залишок сюди НЕ підставляємо.
   */
  const movementHeaders =
    dashboardBusinessFiguresHeaderMap_(
      movementSheet
    );

  const dateIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      movementHeaders,
      ['дата']
    );

  const stockTypeIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      movementHeaders,
      ['тип запасу']
    );

  const movementTypeIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      movementHeaders,
      ['тип руху']
    );

  const quantityIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      movementHeaders,
      ['кількість']
    );

  const rows =
    dashboardBusinessFiguresDataRows_(
      movementSheet
    );

  const vaccineRows =
    [];

  const unknownMovementTypes =
    {};

  let balance =
    0;


  function resolveClinicDirection_(
    value
  ) {
    const type =
      dashboardBusinessFiguresNormalize_(
        value
      );

    if (!type) {
      return null;
    }


    /*
     * Не змінює фізичний залишок клініки.
     */
    if (
      type.indexOf(
        'очікування приймання'
      ) !== -1 ||
      type.indexOf(
        'використання зі зберігання'
      ) !== -1
    ) {
      return 0;
    }


    /*
     * ПРИХІД.
     */
    if (
      type.indexOf(
        'прийняття з філії'
      ) !== -1 ||
      type.indexOf(
        'надход'
      ) !== -1 ||
      type.indexOf(
        'оприбут'
      ) !== -1 ||
      type.indexOf(
        'повернення зі зберіган'
      ) !== -1 ||
      type.indexOf(
        'повернення із зберіган'
      ) !== -1 ||
      type.indexOf(
        'повернення від клієн'
      ) !== -1
    ) {
      return 1;
    }


    /*
     * ВИБУТТЯ.
     */
    if (
      type.indexOf(
        'передано на зберіган'
      ) !== -1 ||
      type.indexOf(
        'передача на зберіган'
      ) !== -1 ||
      type.indexOf(
        'передача у філію'
      ) !== -1 ||
      type.indexOf(
        'повернення постачаль'
      ) !== -1 ||
      type.indexOf(
        'продаж'
      ) !== -1 ||
      type.indexOf(
        'використ'
      ) !== -1 ||
      type.indexOf(
        'списан'
      ) !== -1 ||
      type.indexOf(
        'вибут'
      ) !== -1 ||
      type.indexOf(
        'видаток'
      ) !== -1
    ) {
      return -1;
    }


    return null;
  }


  rows.forEach(
    function(row) {

      const stockType =
        dashboardBusinessFiguresNormalize_(
          row[stockTypeIndex]
        );


      /*
       * Підтримуємо обидва варіанти:
       * "Вакцина" / "Вакцини".
       */
      if (
        stockType !== 'вакцина' &&
        stockType !== 'вакцини'
      ) {
        return;
      }


      const date =
        dashboardBusinessFiguresDateOnly_(
          row[dateIndex]
        );

      const quantity =
        dashboardBusinessFiguresNumber_(
          row[quantityIndex]
        );


      if (
        !date ||
        quantity === null
      ) {
        return;
      }


      vaccineRows.push({
        date:
          date,

        type:
          row[movementTypeIndex],

        quantity:
          quantity
      });


      if (
        date.getTime() >
        asOfDate.getTime()
      ) {
        return;
      }


      const direction =
        resolveClinicDirection_(
          row[movementTypeIndex]
        );


      if (
        direction === null
      ) {
        const key =
          dashboardBusinessFiguresClean_(
            row[movementTypeIndex]
          );

        unknownMovementTypes[
          key ||
          'Порожній тип'
        ] =
          true;

        return;
      }


      balance +=
        direction *
        Math.abs(
          quantity
        );
    }
  );


  if (
    Object.keys(
      unknownMovementTypes
    ).length > 0
  ) {
    warnings.push({
      code:
        'UNKNOWN_INVENTORY_MOVEMENT_TYPES',

      message:
        'Не враховано невідомі типи руху вакцин: ' +
        Object.keys(
          unknownMovementTypes
        ).join(', ')
    });
  }


  /*
   * Якщо історії вакцин немає взагалі —
   * не підставляємо приблизний current stock.
   */
  if (
    vaccineRows.length === 0
  ) {
    return {
      value:
        0,

      source:
        movementSheet.getName() +
        ' — немає фактичної історії руху вакцин'
    };
  }


  const earliest =
    vaccineRows.reduce(
      function(
        minDate,
        item
      ) {
        return (
          !minDate ||
          item.date.getTime() <
            minDate.getTime()
        )
          ? item.date
          : minDate;
      },
      null
    );


  /*
   * Вибрана дата раніше початку
   * журналу рухів.
   *
   * Точного історичного залишку немає,
   * тому KPI = 0, а не сьогоднішній залишок.
   */
  if (
    asOfDate.getTime() <
    earliest.getTime()
  ) {
    warnings.push({
      code:
        'INVENTORY_HISTORY_STARTS_AFTER_PERIOD',

      message:
        'Історія руху вакцин починається ' +
        dashboardBusinessFiguresFormatDate_(
          earliest
        ) +
        '. Для ' +
        dashboardBusinessFiguresFormatDate_(
          asOfDate
        ) +
        ' показано 0.'
    });


    return {
      value:
        0,

      source:
        movementSheet.getName() +
        ' — до цієї дати фактичних рухів вакцин немає'
    };
  }


  const roundedBalance =
    dashboardBusinessFiguresRound2_(
      balance
    );


  if (
    roundedBalance < 0
  ) {
    warnings.push({
      code:
        'VACCINE_CLINIC_NEGATIVE_BALANCE',

      message:
        'Від’ємний історичний залишок вакцин на ' +
        dashboardBusinessFiguresFormatDate_(
          asOfDate
        ) +
        ': ' +
        roundedBalance
    });
  }


  return {
    value:
      Math.max(
        0,
        roundedBalance
      ),

    source:
      movementSheet.getName() +
      ' — історичний баланс рухів вакцин станом на ' +
      dashboardBusinessFiguresFormatDate_(
        asOfDate
      )
  };
}


function dashboardBusinessFiguresCurrentClinicStock_(inventorySheet) {
  const headers = dashboardBusinessFiguresHeaderMap_(inventorySheet);
  const stockTypeIndex = dashboardBusinessFiguresRequireHeaderIndex_(
    headers,
    ['тип запасу']
  );
  const balanceIndex = dashboardBusinessFiguresRequireHeaderIndex_(
    headers,
    ['поточний залишок']
  );
  const statusIndex = dashboardBusinessFiguresFindHeaderIndex_(
    headers,
    ['статус']
  );

  let total = 0;

  dashboardBusinessFiguresDataRows_(inventorySheet).forEach(function(row) {
    if (
      dashboardBusinessFiguresNormalize_(row[stockTypeIndex]) !== 'вакцина'
    ) {
      return;
    }

    if (statusIndex >= 0) {
      const status = dashboardBusinessFiguresNormalize_(row[statusIndex]);
      if (
        status.indexOf('закрит') !== -1 ||
        status.indexOf('неактив') !== -1 ||
        status.indexOf('видален') !== -1
      ) {
        return;
      }
    }

    const quantity = dashboardBusinessFiguresNumber_(row[balanceIndex]);
    if (quantity !== null) {
      total += quantity;
    }
  });

  return Math.max(0, dashboardBusinessFiguresRound2_(total));
}


function dashboardBusinessFiguresCalculateStorageCount_(
  vaccineSheet,
  operationsSheet,
  asOfDate,
  warnings
) {
  const vaccineHeaders =
    dashboardBusinessFiguresHeaderMap_(
      vaccineSheet
    );

  const operationsHeaders =
    dashboardBusinessFiguresHeaderMap_(
      operationsSheet
    );

  /*
   * ----------------------------------------------------------
   * ОБЛІК ВАКЦИН
   * ----------------------------------------------------------
   *
   * Кожен рядок — конкретна одиниця вакцини.
   *
   * Для історичного залишку нам потрібні:
   * - ID продажу;
   * - фактична дата використання.
   *
   * ПОТОЧНИЙ статус навмисно НЕ використовуємо,
   * тому що він не відновлює історичний стан.
   */
  const saleIdIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      vaccineHeaders,
      ['id продажу']
    );

  const actualDateIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      vaccineHeaders,
      ['фактична дата']
    );

  /*
   * ----------------------------------------------------------
   * БАЗА ОПЕРАЦІЙ
   * ----------------------------------------------------------
   */
  const operationDateIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      operationsHeaders,
      ['дата транзакції']
    );

  const typeIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      operationsHeaders,
      [
        'тип доходи / витрати',
        'тип доходи/витрати'
      ]
    );

  const categoryIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      operationsHeaders,
      ['категорія']
    );

  const statusIndex =
    dashboardBusinessFiguresFindHeaderIndex_(
      operationsHeaders,
      ['статус запису']
    );

  const vaccineQuantityIndex =
    dashboardBusinessFiguresFindHeaderIndex_(
      operationsHeaders,
      ['кількість вакцин']
    );

  const quantityIndex =
    dashboardBusinessFiguresFindHeaderIndex_(
      operationsHeaders,
      ['кількість']
    );

  /*
   * Продажі типу
   * «Вакцина / Продаж на зберігання»,
   * які вже відбулися станом на asOfDate.
   *
   * Ключ = ID операції з колонки A
   * «Бази операцій».
   */
  const storageSales = {};

  dashboardBusinessFiguresDataRows_(
    operationsSheet
  ).forEach(function(row) {

    /*
     * ID операції у твоїй структурі —
     * колонка A.
     */
    const operationId =
      dashboardBusinessFiguresClean_(
        row[0]
      );

    const operationDate =
      dashboardBusinessFiguresDateOnly_(
        row[operationDateIndex]
      );

    if (
      !operationId ||
      !operationDate ||
      operationDate.getTime() >
        asOfDate.getTime()
    ) {
      return;
    }

    const type =
      dashboardBusinessFiguresNormalize_(
        row[typeIndex]
      );

    const category =
      dashboardBusinessFiguresNormalize_(
        row[categoryIndex]
      );

    /*
     * До зовнішнього зберігання
     * включаємо тільки:
     *
     * Тип = Вакцина
     * Категорія = Продаж на зберігання
     */
    if (
      type !== 'вакцина' ||
      category !== 'продаж на зберігання'
    ) {
      return;
    }

    /*
     * Скасовані / помилкові операції
     * не враховуємо.
     */
    if (statusIndex >= 0) {
      const status =
        dashboardBusinessFiguresNormalize_(
          row[statusIndex]
        );

      if (
        status.indexOf('скас') !== -1 ||
        status.indexOf('видален') !== -1 ||
        status.indexOf('ануль') !== -1 ||
        status.indexOf('помил') !== -1 ||
        status.indexOf('відхилен') !== -1
      ) {
        return;
      }
    }

    let expectedUnits =
      vaccineQuantityIndex >= 0
        ? dashboardBusinessFiguresNumber_(
            row[vaccineQuantityIndex]
          )
        : null;

    if (
      expectedUnits === null &&
      quantityIndex >= 0
    ) {
      expectedUnits =
        dashboardBusinessFiguresNumber_(
          row[quantityIndex]
        );
    }

    storageSales[operationId] = {
      date: operationDate,
      expectedUnits: expectedUnits,
      matchedUnits: 0
    };
  });

  let count = 0;

  /*
   * ----------------------------------------------------------
   * ВІДНОВЛЮЄМО ІСТОРИЧНИЙ СТАН
   * ----------------------------------------------------------
   *
   * Вакцина вважається такою, що знаходилась
   * на зовнішньому зберіганні на asOfDate, якщо:
   *
   * 1. її продаж «на зберігання» уже відбувся;
   *
   * 2. фактичного використання ще не було,
   *    АБО фактичне використання сталося
   *    ПІСЛЯ asOfDate.
   *
   * Саме тому вакцина, використана 10.08,
   * при перегляді станом на 31.07
   * все ще буде правильно врахована.
   */
  dashboardBusinessFiguresDataRows_(
    vaccineSheet
  ).forEach(function(row) {

    const saleId =
      dashboardBusinessFiguresClean_(
        row[saleIdIndex]
      );

    if (!saleId) {
      return;
    }

    const sale =
      storageSales[saleId];

    if (!sale) {
      return;
    }

    sale.matchedUnits++;

    const actualDate =
      dashboardBusinessFiguresDateOnly_(
        row[actualDateIndex]
      );

    /*
     * Якщо вакцина була використана
     * не пізніше вибраної дати —
     * на цю дату вона вже НЕ знаходилась
     * на зберіганні.
     */
    if (
      actualDate &&
      actualDate.getTime() <=
        asOfDate.getTime()
    ) {
      return;
    }

    count++;
  });

  /*
   * ----------------------------------------------------------
   * КОНТРОЛЬ КІЛЬКОСТІ
   * ----------------------------------------------------------
   *
   * Якщо в операції продано, наприклад, 3 вакцини,
   * а в «Облік вакцин» за цим ID знайдено лише 2,
   * це не приховуємо.
   */
  const mismatches = [];

  Object.keys(
    storageSales
  ).forEach(function(operationId) {

    const sale =
      storageSales[operationId];

    if (
      sale.expectedUnits !== null &&
      Math.abs(
        sale.expectedUnits -
        sale.matchedUnits
      ) > 0.0000001
    ) {
      mismatches.push(
        operationId +
        ': продаж=' +
        sale.expectedUnits +
        ', облік=' +
        sale.matchedUnits
      );
    }
  });

  if (mismatches.length > 0) {
    warnings.push({
      code:
        'VACCINE_STORAGE_UNIT_MISMATCH',

      message:
        'Розбіжність між «Продаж на зберігання» ' +
        'та «Облік вакцин»: ' +
        mismatches.join(' | ')
    });
  }

  return {
    value:
      count,

    source:
      operationsSheet.getName() +
      ' + ' +
      vaccineSheet.getName() +
      ' — історичний залишок зовнішнього зберігання станом на ' +
      dashboardBusinessFiguresFormatDate_(
        asOfDate
      )
  };
}


function dashboardBusinessFiguresCalculateUsedVaccines_(
  operationsSheet,
  period
) {
  const headers =
    dashboardBusinessFiguresHeaderMap_(
      operationsSheet
    );

  const dateIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      headers,
      ['дата транзакції']
    );

  const quantityIndex =
    dashboardBusinessFiguresFindHeaderIndex_(
      headers,
      ['кількість']
    );

  const vaccineQuantityIndex =
    dashboardBusinessFiguresFindHeaderIndex_(
      headers,
      ['кількість вакцин']
    );

  const typeIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      headers,
      [
        'тип доходи / витрати',
        'тип доходи/витрати'
      ]
    );

  const categoryIndex =
    dashboardBusinessFiguresRequireHeaderIndex_(
      headers,
      ['категорія']
    );

  const statusIndex =
    dashboardBusinessFiguresFindHeaderIndex_(
      headers,
      ['статус запису']
    );

  let total =
    0;

  let vaccineOperations =
    0;

  let rowsWithoutQuantity =
    0;


  dashboardBusinessFiguresDataRows_(
    operationsSheet
  ).forEach(function(row) {

    const date =
      dashboardBusinessFiguresDateOnly_(
        row[dateIndex]
      );

    /*
     * Тільки фактичний глобальний період:
     *
     * DAY:
     *   from = to
     *
     * MONTH:
     *   1 число -> останнє число
     *
     * RANGE:
     *   E5 -> E6
     */
    if (
      !date ||
      date.getTime() <
        period.from.getTime() ||
      date.getTime() >
        period.to.getTime()
    ) {
      return;
    }


    /*
     * Скасовані / видалені /
     * помилкові операції не враховуємо.
     */
    if (
      statusIndex >= 0
    ) {
      const status =
        dashboardBusinessFiguresNormalize_(
          row[statusIndex]
        );

      if (
        status.indexOf('скас') !== -1 ||
        status.indexOf('видален') !== -1 ||
        status.indexOf('ануль') !== -1 ||
        status.indexOf('помил') !== -1 ||
        status.indexOf('відхилен') !== -1
      ) {
        return;
      }
    }


    const type =
      dashboardBusinessFiguresNormalize_(
        row[typeIndex]
      );

    const category =
      dashboardBusinessFiguresNormalize_(
        row[categoryIndex]
      );


    /*
     * НОВИЙ формат.
     */
    const isNewVaccineSale =
      (
        type === 'вакцина' ||
        type === 'вакцини'
      ) &&
      (
        category ===
          'продаж і використання' ||
        category ===
          'продаж на зберігання'
      );


    /*
     * Історичний формат.
     */
    const isHistoricalVaccineSale =
      (
        type === 'доходи' ||
        type === 'дохід'
      ) &&
      category === 'вакцини';


    if (
      !isNewVaccineSale &&
      !isHistoricalVaccineSale
    ) {
      return;
    }


    vaccineOperations++;


    /*
     * ======================================================
     * ТІЛЬКИ ФАКТИЧНА КІЛЬКІСТЬ
     * ======================================================
     *
     * Пріоритет:
     *
     * 1. "Кількість вакцин";
     * 2. звичайна "Кількість".
     *
     * БІЛЬШЕ НЕМАЄ:
     *
     * сума > 0 -> quantity = 1
     *
     * Якщо кількість відсутня —
     * цей рядок дає 0.
     */
    let quantity =
      vaccineQuantityIndex >= 0
        ? dashboardBusinessFiguresNumber_(
            row[vaccineQuantityIndex]
          )
        : null;


    if (
      quantity === null &&
      quantityIndex >= 0
    ) {
      quantity =
        dashboardBusinessFiguresNumber_(
          row[quantityIndex]
        );
    }


    /*
     * Немає фактичної кількості
     * або вона <= 0:
     *
     * в підсумок НЕ потрапляє.
     */
    if (
      quantity === null ||
      !Number.isFinite(
        Number(quantity)
      ) ||
      Number(quantity) <= 0
    ) {
      rowsWithoutQuantity++;

      return;
    }


    total +=
      Number(quantity);
  });


  return {
    value:
      Math.max(
        0,
        dashboardBusinessFiguresRound2_(
          total
        )
      ),

    source:
      operationsSheet.getName() +
      ' — тільки фактична кількість вакцин ' +
      'за ' +
      dashboardBusinessFiguresFormatDate_(
        period.from
      ) +
      '–' +
      dashboardBusinessFiguresFormatDate_(
        period.to
      ),

    vaccineOperations:
      vaccineOperations,

    rowsWithoutQuantity:
      rowsWithoutQuantity
  };
}

// ============================================================
// 6. ПЕРІОД
// ============================================================

function dashboardBusinessFiguresNormalizeExternalPeriod_(
  period
) {
  if (
    !period ||
    !(period.from instanceof Date) ||
    isNaN(period.from.getTime()) ||
    !(period.to instanceof Date) ||
    isNaN(period.to.getTime())
  ) {
    throw new Error(
      'Передано некоректний період у «Цифри бізнесу».'
    );
  }

  const from =
    dashboardBusinessFiguresDateOnly_(
      period.from
    );

  const to =
    dashboardBusinessFiguresDateOnly_(
      period.to
    );

  if (
    from.getTime() >
    to.getTime()
  ) {
    throw new Error(
      'Дата «Період від» пізніше за «Період до».'
    );
  }

  return {
    mode:
      period.mode ||
      (
        from.getTime() ===
        to.getTime()
          ? 'DAY'
          : 'RANGE'
      ),

    from:
      from,

    to:
      to,

    source:
      period.source ||
      'Глобальний фільтр Дашборду'
  };
}


function dashboardBusinessFiguresResolvePeriod_(
  context
) {
  const cfg =
    DASHBOARD_BUSINESS_FIGURES_CONFIG
      .filters;

  const dashboard =
    context.dashboardSheet;


  /*
   * ==========================================================
   * 1. F5 — КОНКРЕТНИЙ ДЕНЬ
   * ==========================================================
   */
  const dayCell =
    dashboard.getRange(
      cfg.dayCell
    );

  const day =
    dashboardBusinessFiguresParseDate_(
      dayCell.getValue(),
      dayCell.getDisplayValue()
    );

  if (day) {
    return {
      mode:
        'DAY',

      from:
        day,

      to:
        day,

      source:
        dashboard.getName() +
        '!' +
        cfg.dayCell
    };
  }


  /*
   * ==========================================================
   * 2. F6 — МІСЯЦЬ
   * ==========================================================
   */
  const monthCell =
    dashboard.getRange(
      cfg.monthCell
    );

  const monthDate =
    dashboardBusinessFiguresParseMonth_(
      monthCell.getValue(),
      monthCell.getDisplayValue()
    );

  if (monthDate) {
    return {
      mode:
        'MONTH',

      from:
        new Date(
          monthDate.getFullYear(),
          monthDate.getMonth(),
          1
        ),

      to:
        new Date(
          monthDate.getFullYear(),
          monthDate.getMonth() + 1,
          0
        ),

      source:
        dashboard.getName() +
        '!' +
        cfg.monthCell
    };
  }


  /*
   * ==========================================================
   * 3. E5:E6 — ДЕНЬ АБО ДОВІЛЬНИЙ ДІАПАЗОН
   * ==========================================================
   */
  const fromCell =
    dashboard.getRange(
      cfg.dateFromCell
    );

  const toCell =
    dashboard.getRange(
      cfg.dateToCell
    );

  const from =
    dashboardBusinessFiguresParseDate_(
      fromCell.getValue(),
      fromCell.getDisplayValue()
    );

  const to =
    dashboardBusinessFiguresParseDate_(
      toCell.getValue(),
      toCell.getDisplayValue()
    );

  if (
    from ||
    to
  ) {
    const resolvedFrom =
      from || to;

    const resolvedTo =
      to || from;

    if (
      resolvedFrom.getTime() >
      resolvedTo.getTime()
    ) {
      throw new Error(
        'Дата «Період від» пізніше за «Період до». Дані не змінено.'
      );
    }

    return {
      mode:
        resolvedFrom.getTime() ===
        resolvedTo.getTime()
          ? 'DAY'
          : 'RANGE',

      from:
        resolvedFrom,

      to:
        resolvedTo,

      source:
        dashboard.getName() +
        '!' +
        cfg.dateFromCell +
        ':' +
        cfg.dateToCell
    };
  }


  /*
   * ==========================================================
   * 4. ФІЛЬТР ПОРОЖНІЙ
   * ==========================================================
   *
   * Залишаємо чинну поведінку:
   * останній місяць із фактом P&L.
   */
 /*
 * ==========================================================
 * 4. ФІЛЬТР ПОВНІСТЮ ПОРОЖНІЙ
 * ==========================================================
 *
 * Для фінансових KPI зберігаємо стару поведінку:
 * беремо останній місяць із фактом P&L.
 *
 * Але ставимо спеціальний технічний прапорець,
 * щоб вакцинні KPI розуміли:
 *
 * користувач НЕ обрав DAY / MONTH / RANGE.
 *
 * У такому режимі після кнопки «Очистити»
 * вакцини повинні показувати поточні загальні
 * L / M / O зі «Склад медичних запасів».
 */
const fallbackPeriod =
  dashboardBusinessFiguresLatestAvailablePlPeriod_(
    context.plSheet
  );

fallbackPeriod.unfiltered =
  true;

return fallbackPeriod;
}

function dashboardBusinessFiguresLatestAvailablePlPeriod_(plSheet) {
  const cfg = DASHBOARD_BUSINESS_FIGURES_CONFIG;
  const revenueRow = dashboardBusinessFiguresFindPlMetricRow_(
    plSheet,
    cfg.pl.metrics.revenue
  );

  const monthMap = dashboardBusinessFiguresBuildPlMonthMap_(plSheet);
  const months = Object.keys(monthMap)
    .map(Number)
    .sort(function(a, b) { return b - a; });

  for (let index = 0; index < months.length; index++) {
    const month = months[index];
    const value = dashboardBusinessFiguresNumber_(
      plSheet.getRange(revenueRow, monthMap[month].column).getValue()
    );

    if (value !== null && Math.abs(value) > 0.0000001) {
      return {
        mode: 'MONTH',
        from: new Date(cfg.filters.reportYear, month - 1, 1),
        to: new Date(cfg.filters.reportYear, month, 0),
        source: 'Останній місяць із ненульовим фактом P&L'
      };
    }
  }

  const now = new Date();
  return {
    mode: 'MONTH',
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    source: 'Поточний місяць — резервний режим'
  };
}


function dashboardBusinessFiguresAssertFullMonthPeriod_(period) {
  const firstDay = period.from.getDate() === 1;
  const lastDay =
    period.to.getDate() ===
    new Date(period.to.getFullYear(), period.to.getMonth() + 1, 0).getDate();

  if (!firstDay || !lastDay) {
    throw new Error(
      'Фінансові KPI читаються з місячного P&L. ' +
      'Для цього кроку оберіть повний календарний місяць або кілька повних місяців. ' +
      'Отримано: ' +
      dashboardBusinessFiguresFormatDate_(period.from) +
      '–' +
      dashboardBusinessFiguresFormatDate_(period.to) +
      '. Дані не змінено.'
    );
  }

  if (
    period.from.getFullYear() !== DASHBOARD_BUSINESS_FIGURES_CONFIG.filters.reportYear ||
    period.to.getFullYear() !== DASHBOARD_BUSINESS_FIGURES_CONFIG.filters.reportYear
  ) {
    throw new Error(
      'Поточна структура P&L налаштована на ' +
      DASHBOARD_BUSINESS_FIGURES_CONFIG.filters.reportYear +
      ' рік. Обраний період не підтримується.'
    );
  }
}


function dashboardBusinessFiguresResolvePlLayout_(plSheet, period) {
  dashboardBusinessFiguresAssertFullMonthPeriod_(period);

  const monthMap = dashboardBusinessFiguresBuildPlMonthMap_(plSheet);
  const months = [];
  const cursor = new Date(period.from.getFullYear(), period.from.getMonth(), 1);

  while (cursor.getTime() <= period.to.getTime()) {
    const monthNumber = cursor.getMonth() + 1;
    const item = monthMap[monthNumber];

    if (!item) {
      throw new Error(
        'У P&L не знайдено колонку «Факт» для місяця ' +
        monthNumber + '.'
      );
    }

    months.push({
      month: monthNumber,
      column: item.column,
      header: item.header
    });

    cursor.setMonth(cursor.getMonth() + 1);
  }

  return {
    months: months
  };
}


function dashboardBusinessFiguresBuildPlMonthMap_(plSheet) {
  const cfg = DASHBOARD_BUSINESS_FIGURES_CONFIG.pl;
  const lastColumn = Math.max(plSheet.getLastColumn(), 1);
  const monthValues = plSheet
    .getRange(cfg.monthNumberRow, 1, 1, lastColumn)
    .getValues()[0];
  const headers = plSheet
    .getRange(cfg.periodHeaderRow, 1, 1, lastColumn)
    .getDisplayValues()[0];

  const result = {};

  for (let index = 0; index < monthValues.length; index++) {
    const month = dashboardBusinessFiguresNumber_(monthValues[index]);

    if (month === null || month < 1 || month > 12) {
      continue;
    }

    const factColumnIndex = index + 2;

    if (factColumnIndex >= headers.length) {
      continue;
    }

    const factHeader = dashboardBusinessFiguresNormalize_(
      headers[factColumnIndex]
    );

    if (factHeader.indexOf('факт') === -1) {
      continue;
    }

    result[Math.round(month)] = {
      column: factColumnIndex + 1,
      header: headers[factColumnIndex]
    };
  }

  return result;
}


function dashboardBusinessFiguresFindPlMetricRow_(plSheet, metricConfig) {
  const cfg = DASHBOARD_BUSINESS_FIGURES_CONFIG.pl;
  const lastRow = Math.max(plSheet.getLastRow(), 1);
  const values = plSheet
    .getRange(1, cfg.codeColumn, lastRow, 2)
    .getDisplayValues();

  const expectedCode = dashboardBusinessFiguresNormalize_(
    metricConfig.code || ''
  );
  const expectedLabels = (metricConfig.labels || []).map(
    dashboardBusinessFiguresNormalize_
  );

  if (expectedCode) {
    for (let index = 0; index < values.length; index++) {
      if (
        dashboardBusinessFiguresNormalize_(values[index][0]) === expectedCode
      ) {
        return index + 1;
      }
    }
  }

  for (let index = 0; index < values.length; index++) {
    const label = dashboardBusinessFiguresNormalize_(values[index][1]);
    if (expectedLabels.indexOf(label) !== -1) {
      return index + 1;
    }
  }

  for (let index = 0; index < values.length; index++) {
    const label = dashboardBusinessFiguresNormalize_(values[index][1]);
    const contains = expectedLabels.some(function(expected) {
      return expected && label.indexOf(expected) !== -1;
    });

    if (contains) {
      return index + 1;
    }
  }

  throw new Error(
    'У P&L не знайдено метрику: ' +
    (metricConfig.code || (metricConfig.labels || []).join(' / '))
  );
}


// ============================================================
// 7. БЕЗПЕЧНИЙ ЗАПИС У ДАШБОРД
// ============================================================

function dashboardBusinessFiguresWriteModel_(
  dashboardSheet,
  model,
  period
) {
  const metrics =
    DASHBOARD_BUSINESS_FIGURES_CONFIG
      .dashboardMetrics;

  const snapshot = {};
  const updatedAt = new Date();

  /*
   * Зберігаємо ТІЛЬКИ бізнес-дані.
   *
   * Форматування взагалі не читаємо
   * і не записуємо.
   */
  Object.keys(metrics).forEach(function(metricCode) {
    const cfg = metrics[metricCode];
    const valueCell =
      dashboardSheet.getRange(
        cfg.valueCell
      );

    snapshot[metricCode] = {
      value:
        valueCell.getValue(),

      formula:
        valueCell.getFormula(),

      note:
        valueCell.getNote()
    };
  });

  try {
    Object.keys(metrics).forEach(function(metricCode) {
      const cfg = metrics[metricCode];

      const value =
        model.values[metricCode];

      const valueCell =
        dashboardSheet.getRange(
          cfg.valueCell
        );

      /*
       * ЄДИНЕ, що має право змінити
       * цей модуль — значення клітинки.
       *
       * НЕ змінюємо:
       * - font family;
       * - font size;
       * - font color;
       * - bold;
       * - italic;
       * - number format;
       * - background;
       * - borders;
       * - alignment;
       * - wrapping;
       * - merged ranges.
       */
      if (
        value === null ||
        value === undefined ||
        !isFinite(Number(value))
      ) {
        valueCell.setValue(
          'Немає даних'
        );

      } else {
        valueCell.setValue(
          Number(value)
        );
      }

      /*
       * Примітка не впливає
       * на візуальне оформлення.
       */
      valueCell.setNote(
        dashboardBusinessFiguresMetricNote_(
          metricCode,
          model.sources[metricCode],
          period,
          updatedAt
        )
      );
    });

    SpreadsheetApp.flush();

    dashboardBusinessFiguresVerifyWrittenValues_(
      dashboardSheet,
      model
    );

  } catch (error) {

    /*
     * У разі помилки повертаємо
     * попередній CONTENT.
     *
     * Форматування не відновлюємо,
     * бо ми його взагалі не змінювали.
     */
    Object.keys(metrics).forEach(function(metricCode) {
      const cfg = metrics[metricCode];

      const valueCell =
        dashboardSheet.getRange(
          cfg.valueCell
        );

      const old =
        snapshot[metricCode];

      valueCell.clearContent();

      if (old.formula) {
        valueCell.setFormula(
          old.formula
        );
      } else {
        valueCell.setValue(
          old.value
        );
      }

      valueCell.setNote(
        old.note
      );
    });

    SpreadsheetApp.flush();

    throw error;
  }

  return {
    cellsWritten:
      Object.keys(metrics).map(
        function(metricCode) {
          return (
            dashboardSheet.getName() +
            '!' +
            metrics[metricCode].valueCell
          );
        }
      ),

    /*
     * Для журналу одразу видно,
     * що стиль не чіпався.
     */
    formattingChanged: false
  };
}


function dashboardBusinessFiguresVerifyWrittenValues_(dashboardSheet, model) {
  const metrics = DASHBOARD_BUSINESS_FIGURES_CONFIG.dashboardMetrics;

  Object.keys(metrics).forEach(function(metricCode) {
    const expected = model.values[metricCode];
    const actual = dashboardSheet.getRange(metrics[metricCode].valueCell).getValue();

    if (expected === null || expected === undefined || !isFinite(Number(expected))) {
      if (dashboardBusinessFiguresClean_(actual) !== 'Немає даних') {
        throw new Error(
          'Контроль запису не пройдений для ' + metricCode + '.'
        );
      }
      return;
    }

    const actualNumber = dashboardBusinessFiguresNumber_(actual);

    if (
      actualNumber === null ||
      Math.abs(actualNumber - Number(expected)) >
        DASHBOARD_BUSINESS_FIGURES_CONFIG.numericTolerance
    ) {
      throw new Error(
        'Контроль запису не пройдений для ' + metricCode +
        ': очікується ' + expected + ', записано ' + actual + '.'
      );
    }
  });
}


function dashboardBusinessFiguresMetricNote_(
  metricCode,
  source,
  period,
  updatedAt
) {
  return [
    'Код: ' + metricCode,
    'Період: ' +
      dashboardBusinessFiguresFormatDate_(period.from) +
      '–' +
      dashboardBusinessFiguresFormatDate_(period.to),
    'Джерело: ' + (source || 'не визначено'),
    'Оновлено: ' +
      Utilities.formatDate(
        updatedAt,
        Session.getScriptTimeZone(),
        'dd.MM.yyyy HH:mm'
      )
  ].join('\n');
}


function dashboardBusinessFiguresCreateOrRepairNamedRanges_(ss, dashboardSheet) {
  const metrics = DASHBOARD_BUSINESS_FIGURES_CONFIG.dashboardMetrics;
  const existing = {};

  ss.getNamedRanges().forEach(function(namedRange) {
    existing[namedRange.getName()] = namedRange;
  });

  const created = [];
  const repaired = [];

  Object.keys(metrics).forEach(function(metricCode) {
    const cfg = metrics[metricCode];
    const expectedRange = dashboardSheet.getRange(cfg.rangeA1);
    const current = existing[cfg.namedRange];

    if (!current) {
      ss.setNamedRange(cfg.namedRange, expectedRange);
      created.push(cfg.namedRange);
      return;
    }

    const currentRange = current.getRange();
    const isCorrect =
      currentRange.getSheet().getSheetId() === dashboardSheet.getSheetId() &&
      currentRange.getA1Notation() === expectedRange.getA1Notation();

    if (!isCorrect) {
      current.setRange(expectedRange);
      repaired.push(cfg.namedRange);
    }
  });

  return {
    created: created,
    repaired: repaired
  };
}


// ============================================================
// 8. READY / STRUCTURE ASSERT
// ============================================================

function dashboardBusinessFiguresAssertReady_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const names = DASHBOARD_BUSINESS_FIGURES_CONFIG.sheets;
  const sheetsFound = {};

  Object.keys(names).forEach(function(key) {
    const sheet = ss.getSheetByName(names[key]);
    if (!sheet) {
      throw new Error('Лист «' + names[key] + '» не знайдено.');
    }
    sheetsFound[key] = sheet.getName();
  });

  const context = {
    ss: ss,
    dashboardSheet: ss.getSheetByName(names.dashboard),
    plSheet: ss.getSheetByName(names.pl),
    assetsSheet: ss.getSheetByName(names.assets),
    operationsSheet: ss.getSheetByName(names.operations),
    vaccineAccountingSheet: ss.getSheetByName(names.vaccineAccounting),
    inventorySheet: ss.getSheetByName(names.inventory),
    inventoryMovementsSheet: ss.getSheetByName(names.inventoryMovements),
    sheetsFound: sheetsFound
  };

  dashboardBusinessFiguresAssertDashboardTargets_(context.dashboardSheet);
  dashboardBusinessFiguresHeaderMap_(context.operationsSheet);
  dashboardBusinessFiguresHeaderMap_(context.vaccineAccountingSheet);
  dashboardBusinessFiguresHeaderMap_(context.inventorySheet);
  dashboardBusinessFiguresHeaderMap_(context.inventoryMovementsSheet);

  return context;
}


function dashboardBusinessFiguresAssertDashboardTargets_(dashboardSheet) {
  const metrics = DASHBOARD_BUSINESS_FIGURES_CONFIG.dashboardMetrics;

  Object.keys(metrics).forEach(function(metricCode) {
    const cfg = metrics[metricCode];
    const valueCell = dashboardSheet.getRange(cfg.valueCell);
    const targetRange = dashboardSheet.getRange(cfg.rangeA1);

    if (
      valueCell.getRow() !== targetRange.getRow() ||
      valueCell.getColumn() !== targetRange.getColumn()
    ) {
      throw new Error(
        'Некоректний контракт клітинки ' + metricCode +
        ': valueCell має бути верхньою лівою клітинкою rangeA1.'
      );
    }
  });
}


function dashboardBusinessFiguresInspectNamedRanges_(ss, dashboardSheet) {
  const existing = {};

  ss.getNamedRanges().forEach(function(namedRange) {
    existing[namedRange.getName()] = namedRange.getRange();
  });

  return Object.keys(DASHBOARD_BUSINESS_FIGURES_CONFIG.dashboardMetrics).map(
    function(metricCode) {
      const cfg = DASHBOARD_BUSINESS_FIGURES_CONFIG.dashboardMetrics[metricCode];
      const range = existing[cfg.namedRange];
      const expected = dashboardSheet.getName() + '!' + cfg.rangeA1;
      const actual = range
        ? range.getSheet().getName() + '!' + range.getA1Notation()
        : '';

      return {
        name: cfg.namedRange,
        exists: !!range,
        correct: actual === expected,
        actual: actual,
        expected: expected
      };
    }
  );
}


// ============================================================
// 9. ОПЦІЙНА ІНТЕГРАЦІЯ З ІСНУЮЧИМ onEdit
// ============================================================

function dashboardBusinessFiguresHandleEdit_(e) {
  if (!e || !e.range) {
    return null;
  }

  const cfg =
    DASHBOARD_BUSINESS_FIGURES_CONFIG;

  if (
    e.range
      .getSheet()
      .getName() !==
    cfg.sheets.dashboard
  ) {
    return null;
  }

  const watched = [
    cfg.filters.dateFromCell,
    cfg.filters.dateToCell,
    cfg.filters.dayCell,
    cfg.filters.monthCell
  ];

  if (
    watched.indexOf(
      e.range.getA1Notation()
    ) === -1
  ) {
    return null;
  }

  /*
   * Тут НІЧОГО не оновлюємо.
   *
   * E5 / E6 / F5 / F6
   * застосовуються тільки кнопкою
   * «Оновити Дашборд».
   *
   * dashboardGlobalFilterHandleEdit_(e)
   * і надалі відповідає лише за
   * взаємовиключення контролів.
   */
  return null;
}


// ============================================================
// 10. ДОПОМІЖНІ ФУНКЦІЇ
// ============================================================

function dashboardBusinessFiguresHeaderMap_(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const map = {};

  headers.forEach(function(header, index) {
    const normalized = dashboardBusinessFiguresNormalize_(header);
    if (normalized && map[normalized] === undefined) {
      map[normalized] = index;
    }
  });

  return map;
}


function dashboardBusinessFiguresFindHeaderIndex_(map, aliases) {
  for (let index = 0; index < aliases.length; index++) {
    const key = dashboardBusinessFiguresNormalize_(aliases[index]);
    if (map[key] !== undefined) {
      return map[key];
    }
  }
  return -1;
}


function dashboardBusinessFiguresRequireHeaderIndex_(map, aliases) {
  const index = dashboardBusinessFiguresFindHeaderIndex_(map, aliases);

  if (index < 0) {
    throw new Error(
      'Не знайдено обов’язковий заголовок: ' + aliases.join(' / ')
    );
  }

  return index;
}


function dashboardBusinessFiguresDataRows_(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow < 2 || lastColumn < 1) {
    return [];
  }

  return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
}


function dashboardBusinessFiguresMovementDirection_(value) {
  const type = dashboardBusinessFiguresNormalize_(value);

  if (!type) {
    return 0;
  }

  if (
    type.indexOf('повернення зі зберіган') !== -1 ||
    type.indexOf('повернення із зберіган') !== -1
  ) {
    return 1;
  }

  if (
    type.indexOf('повернення постачаль') !== -1 ||
    type.indexOf('передача на зберіган') !== -1 ||
    type.indexOf('продаж') !== -1 ||
    type.indexOf('використ') !== -1 ||
    type.indexOf('списан') !== -1 ||
    type.indexOf('вибут') !== -1 ||
    type.indexOf('видаток') !== -1
  ) {
    return -1;
  }

  if (
    type.indexOf('надход') !== -1 ||
    type.indexOf('оприбут') !== -1 ||
    type.indexOf('повернення від клієн') !== -1
  ) {
    return 1;
  }

  return 0;
}


function dashboardBusinessFiguresParseDate_(value, displayValue) {
  const direct = dashboardBusinessFiguresDateOnly_(value);
  if (direct) {
    return direct;
  }

  const text = dashboardBusinessFiguresClean_(displayValue || value);
  if (!text) {
    return null;
  }

  const match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (!match) {
    return null;
  }

  const date = new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );

  return isNaN(date.getTime()) ? null : date;
}


function dashboardBusinessFiguresParseMonth_(
  value,
  displayValue
) {
  /*
   * ==========================================================
   * 1. ЯКЩО У F6 ФАКТИЧНО ЗБЕРІГАЄТЬСЯ DATE
   * ==========================================================
   */
  const direct =
    dashboardBusinessFiguresDateOnly_(
      value
    );

  if (direct) {
    return new Date(
      direct.getFullYear(),
      direct.getMonth(),
      1
    );
  }


  /*
   * ==========================================================
   * 2. ТЕКСТОВЕ ЗНАЧЕННЯ
   * ==========================================================
   *
   * Підтримуємо:
   *
   *   Серпень
   *   Серпень 2026
   *   серпня 2026
   *   08.2026
   *   08-2026
   *   08/2026
   */
  const text =
    dashboardBusinessFiguresNormalize_(
      displayValue || value
    );

  if (!text) {
    return null;
  }


  /*
   * ==========================================================
   * 3. ЧИСЛОВИЙ ФОРМАТ МІСЯЦЯ
   * ==========================================================
   *
   * 08.2026
   * 08-2026
   * 08/2026
   */
  const numericMatch =
    text.match(
      /^(\d{1,2})[.\/-](\d{4})$/
    );

  if (numericMatch) {
    const month =
      Number(
        numericMatch[1]
      );

    const year =
      Number(
        numericMatch[2]
      );

    if (
      month >= 1 &&
      month <= 12 &&
      Number.isFinite(year)
    ) {
      return new Date(
        year,
        month - 1,
        1
      );
    }

    return null;
  }


  /*
   * ==========================================================
   * 4. НАЗВИ МІСЯЦІВ
   * ==========================================================
   */
  const monthNames = {
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


  const parts =
    text.split(/\s+/);


  /*
   * ==========================================================
   * 5. ФОРМАТ, ЯКИЙ ЗАРАЗ ВИКОРИСТОВУЄ F6
   * ==========================================================
   *
   * Наприклад:
   *
   *   Серпень
   *
   * Року в самій клітинці немає.
   * Тому використовуємо reportYear
   * із конфігурації цього самого модуля.
   *
   * У поточній конфігурації:
   *
   *   reportYear: 2026
   */
  if (
    parts.length === 1 &&
    monthNames[
      parts[0]
    ] !== undefined
  ) {
    return new Date(
      DASHBOARD_BUSINESS_FIGURES_CONFIG
        .filters
        .reportYear,

      monthNames[
        parts[0]
      ],

      1
    );
  }


  /*
   * ==========================================================
   * 6. МІСЯЦЬ + ЯВНИЙ РІК
   * ==========================================================
   *
   * Серпень 2026
   * Серпня 2026
   */
  if (
    parts.length >= 2 &&
    monthNames[
      parts[0]
    ] !== undefined
  ) {
    const year =
      Number(
        parts[1]
      );

    if (
      Number.isFinite(
        year
      ) &&
      year >= 1900 &&
      year <= 2100
    ) {
      return new Date(
        year,
        monthNames[
          parts[0]
        ],
        1
      );
    }
  }


  return null;
}


function dashboardBusinessFiguresDateOnly_(value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) {
    return null;
  }

  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}


function dashboardBusinessFiguresNumber_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return value;
  }

  const normalized = String(
    value === null || value === undefined ? '' : value
  )
    .replace(/\u00A0/g, '')
    .replace(/\s/g, '')
    .replace(',', '.');

  if (!normalized || normalized.indexOf('#') === 0) {
    return null;
  }

  const result = Number(normalized);
  return isFinite(result) ? result : null;
}


function dashboardBusinessFiguresRound2_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}


function dashboardBusinessFiguresClean_(value) {
  return String(
    value === null || value === undefined ? '' : value
  )
    .replace(/\u00A0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}


function dashboardBusinessFiguresNormalize_(value) {
  return dashboardBusinessFiguresClean_(value).toLowerCase();
}


function dashboardBusinessFiguresFormatDate_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}


function dashboardBusinessFiguresPeriodKey_(period) {
  return (
    dashboardBusinessFiguresFormatDate_(period.from) +
    '–' +
    dashboardBusinessFiguresFormatDate_(period.to)
  );
}


function dashboardBusinessFiguresPeriodResult_(period) {
  return {
    mode: period.mode,
    from: dashboardBusinessFiguresFormatDate_(period.from),
    to: dashboardBusinessFiguresFormatDate_(period.to),
    source: period.source
  };
}


function dashboardBusinessFiguresTargetCells_() {
  const result = {};

  Object.keys(DASHBOARD_BUSINESS_FIGURES_CONFIG.dashboardMetrics).forEach(
    function(metricCode) {
      const cfg = DASHBOARD_BUSINESS_FIGURES_CONFIG.dashboardMetrics[metricCode];
      result[metricCode] = {
        labelCell: cfg.labelCell,
        valueCell: cfg.valueCell,
        range: cfg.rangeA1,
        namedRange: cfg.namedRange
      };
    }
  );

  return result;
}
