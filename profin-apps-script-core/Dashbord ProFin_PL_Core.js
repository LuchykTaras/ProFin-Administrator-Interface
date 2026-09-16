// ============================================================
// ProFin_PL_Core.gs
// ProFin OS 2026 — Альтернатива Бабурка
// ============================================================
//
// ЄДИНЕ READ-ONLY P&L ЯДРО ДЛЯ ДАШБОРДУ.
//
// Джерело:
//   База операцій
//
// Принцип періоду:
//
//   DAY / неповний RANGE
//     -> Дата транзакції
//
//   повний календарний MONTH / повні місяці RANGE
//     -> Місяць нарахування
//     -> якщо він порожній, fallback на Дату транзакції
//
// Ядро:
//   - НЕ пише у P&L;
//   - НЕ пише у База операцій;
//   - НЕ пише у Дашборд;
//   - НЕ змінює діаграми;
//   - повертає модель доходів і витрат у пам'яті.
//
// ============================================================

const PROFIN_PL_CORE_CFG =
  Object.freeze({

    version:
  'PROFIN_PL_CORE_V3_EXPLICIT_EXPENSE_SECTORS_2026',

    sheets: {
      operations:
        'База операцій',

      pl:
        'P&L',

      dashboard:
        'Дашборд'
    },

    dashboardControls: {
      dateFrom:
        'E5',

      dateTo:
        'E6',

      day:
        'F5',

      month:
        'F6'
    },

    headers: {
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
        'Тип доходи/витрати',
        'Тип операції',
        'Тип'
      ],

      accountingType: [
        'Тип обліку'
      ],

      category: [
        'Категорія'
      ],

      article: [
        'Стаття'
      ],

      accrualMonth: [
        'Місяць нарахування'
      ],

      status: [
        'Статус запису',
        'Статус'
      ]
    },

    aliases: {
      income: [
        'доходи',
        'дохід'
      ],

      expense: [
        'витрати',
        'витрата'
      ],

      vaccine: [
        'вакцина',
        'вакцини'
      ],

      collection: [
        'інкасація'
      ]
    },

    excludedStatusFragments: [
      'скас',
      'ануль',
      'видален',
      'чернет',
      'помил',
      'відхилен'
    ],

    /*
     * P&L використовується ТІЛЬКИ
     * як контроль для повних місяців.
     *
     * За існуючою структурою:
     * row 6  -> номер місяця;
     * row 7  -> План / Факт;
     * C      -> назви показників.
     */
    plControl: {
  reportYear:
    2026,

  /*
   * P&L:
   *
   * row 6 — номер місяця;
   * row 7 — План / Факт;
   * B     — стабільний код деталізації;
   * C     — назва рядка.
   */
  monthNumberRow:
    6,

  periodHeaderRow:
    7,

  codeColumn:
    2,

  labelColumn:
    3,


  /*
   * ======================================================
   * ДОХОДИ
   * ======================================================
   *
   * row 8     — Операційний дохід;
   * rows 11:20 — категорії доходів.
   */
  revenueControlRow:
    8,

  revenueLabels: [
    'Операційний дохід'
  ],

  incomeFirstRow:
    11,

  incomeLastRow:
    20,


  /*
   * ======================================================
   * ВИТРАТИ
   * ======================================================
   *
   * 24:93 охоплює витратну частину P&L.
   *
   * Рядки без коду B = секторні підсумки.
   * Рядки з кодом B   = деталізація сектора.
   *
   * row 93 = загальний контроль витрат
   * перед EBITDA.
   */
  expenseFirstRow:
    24,

  expenseLastRow:
    93,

  expenseControlRow:
    93
},

    tolerance:
      0.01
  });


// ============================================================
// 1. PUBLIC READ-ONLY TEST
// ============================================================

function proFinPlCoreDryRun() {

  const period =
    proFinPlCoreResolveDashboardPeriod_();

  const model =
    proFinPlCoreCalculate_(
      period,
      {
        reconcile:
          true
      }
    );

  const result = {

    ok:
      model.ok,

    version:
      model.version,

    period:
      proFinPlCorePeriodForLog_(
        model.period
      ),

    basis:
      model.basis,

    income: {
      total:
        model.income.total,

      transactions:
        model.income.transactions,

      categories:
        model.income.categories
    },

    expense: {
      total:
        model.expense.total,

      transactions:
        model.expense.transactions,

      categories:
        model.expense.categories
    },

    stats:
      model.stats,

    reconciliation:
      model.reconciliation,

    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    chartObjectsChanged:
      false
  };

  Logger.log(
    'proFinPlCoreDryRun: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


// ============================================================
// 2. ГОЛОВНЕ РОЗРАХУНКОВЕ ЯДРО
// ============================================================

function proFinPlCoreCalculate_(
  period,
  options
) {

  const opts =
    options || {};

  const normalizedPeriod =
    proFinPlCoreNormalizePeriod_(
      period
    );

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const operationsSheet =
    proFinPlCoreRequireSheet_(
      ss,
      PROFIN_PL_CORE_CFG
        .sheets
        .operations
    );

  const values =
    operationsSheet
      .getDataRange()
      .getValues();

  if (
    values.length <
    2
  ) {
    throw new Error(
      'P&L Core: «База операцій» ' +
      'не містить робочих рядків.'
    );
  }

  const indexes =
    proFinPlCoreResolveIndexes_(
      values[0]
    );

  const fullCalendarMonths =
    proFinPlCoreIsFullMonthPeriod_(
      normalizedPeriod
    );

  const incomeMap =
    Object.create(null);

  const expenseMap =
    Object.create(null);

  const stats = {

    sourceRows:
      values.length - 1,

    includedRows:
      0,

    incomeTransactions:
      0,

    expenseTransactions:
      0,

    skippedStatusRows:
      0,

    skippedTypeRows:
      0,

    invalidDateRows:
      0,

    invalidAmountRows:
      0,

    invalidIncomeAmountRows:
      0,

    invalidExpenseAmountRows:
      0,

    nonPositiveIncomeRows:
      0,

    emptyExpenseCategoryRows:
      0,

    /*
     * Для повного місяця:
     * немає Місяця нарахування
     * -> використали дату транзакції.
     */
    accrualMonthFallbackRows:
      0
  };


  for (
    let rowIndex = 1;
    rowIndex < values.length;
    rowIndex++
  ) {

    const row =
      values[rowIndex];


    /*
     * --------------------------------------------------------
     * STATUS
     * --------------------------------------------------------
     */

    if (
      indexes.status >= 0 &&
      proFinPlCoreIsExcludedStatus_(
        row[
          indexes.status
        ]
      )
    ) {

      stats
        .skippedStatusRows++;

      continue;
    }


    /*
     * --------------------------------------------------------
     * TYPE
     * --------------------------------------------------------
     */

    const transactionType =
      proFinPlCoreNormalize_(
        row[
          indexes.type
        ]
      );

    const accountingType =
      indexes.accountingType >= 0
        ? proFinPlCoreNormalize_(
            row[
              indexes.accountingType
            ]
          )
        : '';


    const direction =
      proFinPlCoreClassifyDirection_(
        transactionType,
        accountingType
      );


    if (!direction) {

      stats
        .skippedTypeRows++;

      continue;
    }


    /*
     * --------------------------------------------------------
     * PERIOD
     * --------------------------------------------------------
     */

    const transactionDate =
      proFinPlCoreDateOnly_(
        row[
          indexes.date
        ]
      );


    const accrualMonth =
      indexes.accrualMonth >= 0
        ? proFinPlCoreMonthStart_(
            row[
              indexes.accrualMonth
            ]
          )
        : null;


    let rowInPeriod =
      false;


    /*
     * Повні календарні місяці:
     * P&L-basis = Місяць нарахування.
     */
    if (
      fullCalendarMonths &&
      accrualMonth
    ) {

      rowInPeriod =
        proFinPlCoreMonthInPeriod_(
          accrualMonth,
          normalizedPeriod
        );

    } else {

      /*
       * Якщо повний місяць,
       * але Місяць нарахування
       * у рядку порожній —
       * fallback на дату транзакції.
       */
      if (
        fullCalendarMonths &&
        !accrualMonth
      ) {

        stats
          .accrualMonthFallbackRows++;
      }


      if (
        !transactionDate
      ) {

        stats
          .invalidDateRows++;

        continue;
      }


      rowInPeriod =
        proFinPlCoreDateInPeriod_(
          transactionDate,
          normalizedPeriod
        );
    }


    if (
      !rowInPeriod
    ) {
      continue;
    }


    /*
     * --------------------------------------------------------
     * AMOUNT
     * --------------------------------------------------------
     */

    const rawAmount =
      proFinPlCoreNumber_(
        row[
          indexes.amount
        ]
      );


    if (
      rawAmount === null ||
      !Number.isFinite(
        rawAmount
      )
    ) {

      stats
        .invalidAmountRows++;

      if (
        direction ===
        'INCOME'
      ) {

        stats
          .invalidIncomeAmountRows++;

      } else {

        stats
          .invalidExpenseAmountRows++;
      }

      continue;
    }


    let amount;


    if (
      direction ===
      'INCOME'
    ) {

      /*
       * Доходи:
       * тільки додатне значення.
       */
      if (
        rawAmount <= 0
      ) {

        stats
          .nonPositiveIncomeRows++;

        continue;
      }

      amount =
        rawAmount;

    } else {

      /*
       * Витрати:
       * у P&L знак від'ємний,
       * для секторів потрібний abs.
       */
      amount =
        Math.abs(
          rawAmount
        );

      if (
        amount === 0
      ) {
        continue;
      }
    }


    /*
     * --------------------------------------------------------
     * DIMENSIONS
     * --------------------------------------------------------
     */

    const rawCategory =
      proFinPlCoreClean_(
        row[
          indexes.category
        ]
      );


    const rawArticle =
      indexes.article >= 0
        ? proFinPlCoreClean_(
            row[
              indexes.article
            ]
          )
        : '';


    const category =
      proFinPlCoreCanonicalCategory_(
        direction,
        transactionType,
        rawCategory,
        rawArticle
      );


    if (
      !category
    ) {

      if (
        direction ===
        'EXPENSE'
      ) {

        stats
          .emptyExpenseCategoryRows++;
      }

      continue;
    }


    const article =
      rawArticle ||
      (
        direction ===
        'INCOME'
          ? 'Без назви'
          : 'Без статті'
      );


    const targetMap =
      direction ===
        'INCOME'
        ? incomeMap
        : expenseMap;


    proFinPlCoreAdd_(
      targetMap,
      category,
      article,
      amount
    );


    stats
      .includedRows++;


    if (
      direction ===
      'INCOME'
    ) {

      stats
        .incomeTransactions++;

    } else {

      stats
        .expenseTransactions++;
    }
  }


  let income =
  proFinPlCoreFinalizeSide_(
    incomeMap
  );


let expense =
  proFinPlCoreFinalizeSide_(
    expenseMap
  );


let sourceMode =
  'OPERATIONS_PARTIAL_PERIOD';


/*
 * ============================================================
 * ПОВНИЙ КАЛЕНДАРНИЙ МІСЯЦЬ / МІСЯЦІ
 * ============================================================
 *
 * Для MONTH і RANGE, який складається
 * з повних календарних місяців,
 * джерелом істини є вже сформований
 * Факт P&L.
 *
 * Таким чином:
 *
 * Серпень на Dashboard
 * ===
 * Факт Серпень у P&L.
 *
 * База операцій тут залишається
 * тільки джерелом transaction-level
 * деталізації там, де P&L її фізично
 * не містить.
 */
if (
  fullCalendarMonths
) {
  const monthlyPlModel =
  proFinPlCoreBuildMonthlyModelFromPl_(
    ss,
    normalizedPeriod,
    income,
    expense
  );


  income =
    monthlyPlModel.income;


  expense =
    monthlyPlModel.expense;


  sourceMode =
    'PL_FACT_MONTHLY';
}


const reconciliation =
  opts.reconcile ===
    true
    ? proFinPlCoreReconcile_(
        ss,
        normalizedPeriod,
        fullCalendarMonths,
        income.total,
        expense.total
      )
    : {
        available:
          false,

        reason:
          'NOT_REQUESTED'
      };


  return {

    ok:
      true,

    version:
      PROFIN_PL_CORE_CFG
        .version,

    period:
      normalizedPeriod,

    basis: {

  fullCalendarMonths:
    fullCalendarMonths,

  mode:
    sourceMode
},

    income:
      income,

    expense:
      expense,

    stats:
      stats,

    reconciliation:
      reconciliation,

    noCellsWritten:
      true,

    noSourceCellsWritten:
      true,

    chartObjectsChanged:
      false
  };
}


// ============================================================
// 3. HEADER RESOLUTION
// ============================================================

function proFinPlCoreResolveIndexes_(
  headers
) {

  return {

    date:
      proFinPlCoreResolveHeader_(
        headers,
        PROFIN_PL_CORE_CFG
          .headers
          .date,
        true
      ),

    amount:
      proFinPlCoreResolveHeader_(
        headers,
        PROFIN_PL_CORE_CFG
          .headers
          .amount,
        true
      ),

    type:
      proFinPlCoreResolveHeader_(
        headers,
        PROFIN_PL_CORE_CFG
          .headers
          .type,
        true
      ),

    accountingType:
      proFinPlCoreResolveHeader_(
        headers,
        PROFIN_PL_CORE_CFG
          .headers
          .accountingType,
        false
      ),

    category:
      proFinPlCoreResolveHeader_(
        headers,
        PROFIN_PL_CORE_CFG
          .headers
          .category,
        true
      ),

    article:
      proFinPlCoreResolveHeader_(
        headers,
        PROFIN_PL_CORE_CFG
          .headers
          .article,
        false
      ),

    accrualMonth:
      proFinPlCoreResolveHeader_(
        headers,
        PROFIN_PL_CORE_CFG
          .headers
          .accrualMonth,
        false
      ),

    status:
      proFinPlCoreResolveHeader_(
        headers,
        PROFIN_PL_CORE_CFG
          .headers
          .status,
        false
      )
  };
}


function proFinPlCoreResolveHeader_(
  headers,
  candidates,
  required
) {

  const normalized =
    headers.map(
      function(value) {
        return proFinPlCoreNormalize_(
          value
        );
      }
    );


  for (
    let index = 0;
    index < candidates.length;
    index++
  ) {

    const key =
      proFinPlCoreNormalize_(
        candidates[index]
      );

    const position =
      normalized.indexOf(
        key
      );


    if (
      position >= 0
    ) {
      return position;
    }
  }


  if (
    required
  ) {

    throw new Error(
      'P&L Core: не знайдено заголовок: ' +
      candidates.join(
        ' / '
      )
    );
  }


  return -1;
}


// ============================================================
// 4. КЛАСИФІКАЦІЯ
// ============================================================

function proFinPlCoreClassifyDirection_(
  transactionType,
  accountingType
) {

  /*
   * Інкасація не є доходом/витратою P&L.
   */
  if (
    proFinPlCoreMatchesAlias_(
      transactionType,
      PROFIN_PL_CORE_CFG
        .aliases
        .collection
    )
  ) {
    return null;
  }


  /*
   * Новий тип вакцин
   * рахуємо доходом.
   */
  if (
    proFinPlCoreMatchesAlias_(
      transactionType,
      PROFIN_PL_CORE_CFG
        .aliases
        .vaccine
    )
  ) {
    return 'INCOME';
  }


  if (
    proFinPlCoreMatchesAlias_(
      transactionType,
      PROFIN_PL_CORE_CFG
        .aliases
        .income
    )
  ) {
    return 'INCOME';
  }


  if (
    proFinPlCoreMatchesAlias_(
      transactionType,
      PROFIN_PL_CORE_CFG
        .aliases
        .expense
    )
  ) {
    return 'EXPENSE';
  }


  /*
   * Fallback для історичних
   * записів через Тип обліку.
   */
  if (
    proFinPlCoreMatchesAlias_(
      accountingType,
      PROFIN_PL_CORE_CFG
        .aliases
        .income
    )
  ) {
    return 'INCOME';
  }


  if (
    proFinPlCoreMatchesAlias_(
      accountingType,
      PROFIN_PL_CORE_CFG
        .aliases
        .expense
    )
  ) {
    return 'EXPENSE';
  }


  return null;
}


// ============================================================
// 5. КАНОНІЧНІ КАТЕГОРІЇ
// ============================================================

function proFinPlCoreCanonicalCategory_(
  direction,
  transactionType,
  rawCategory,
  rawArticle
) {

  if (
    direction ===
    'INCOME'
  ) {

    /*
     * Старий:
     * Категорія = Вакцини.
     *
     * Новий:
     * Тип = Вакцина / Вакцини.
     */
    if (
      proFinPlCoreMatchesAlias_(
        transactionType,
        PROFIN_PL_CORE_CFG
          .aliases
          .vaccine
      ) ||
      proFinPlCoreMatchesAlias_(
        rawCategory,
        PROFIN_PL_CORE_CFG
          .aliases
          .vaccine
      )
    ) {

      return 'Вакцини';
    }


    /*
     * Поточна ліва діаграма доходів
     * уже використовує "Інше"
     * для порожньої категорії.
     */
    return (
      proFinPlCoreClean_(
        rawCategory
      ) ||
      'Інше'
    );
  }


  const category =
    proFinPlCoreClean_(
      rawCategory
    );


  if (
    !category
  ) {
    return '';
  }


  /*
   * Legacy-сумісність:
   *
   * Персонал + стаття "лікар..."
   * еквівалентна категорії "Лікарі".
   */
  const categoryKey =
    proFinPlCoreNormalize_(
      category
    );

  const articleKey =
    proFinPlCoreNormalize_(
      rawArticle
    );


  if (
    categoryKey ===
      'персонал' &&
    articleKey.indexOf(
      'лікар'
    ) !== -1
  ) {

    return 'Лікарі';
  }


  return category;
}


// ============================================================
// 6. AGGREGATION
// ============================================================

function proFinPlCoreAdd_(
  targetMap,
  category,
  article,
  amount
) {

  const categoryKey =
    proFinPlCoreNormalize_(
      category
    );


  if (
    !targetMap[
      categoryKey
    ]
  ) {

    targetMap[
      categoryKey
    ] = {

      key:
        categoryKey,

      category:
        category,

      amount:
        0,

      transactions:
        0,

      articles:
        Object.create(null)
    };
  }


  const categoryItem =
    targetMap[
      categoryKey
    ];


  categoryItem.amount +=
    amount;

  categoryItem
    .transactions++;


  const articleKey =
    proFinPlCoreNormalize_(
      article
    );


  if (
    !categoryItem
      .articles[
        articleKey
      ]
  ) {

    categoryItem
      .articles[
        articleKey
      ] = {

        key:
          articleKey,

        article:
          article,

        amount:
          0,

        transactions:
          0
      };
  }


  categoryItem
    .articles[
      articleKey
    ]
    .amount +=
      amount;


  categoryItem
    .articles[
      articleKey
    ]
    .transactions++;
}


function proFinPlCoreFinalizeSide_(
  map
) {

  const categories =
    Object.keys(
      map
    )
      .map(
        function(key) {

          const source =
            map[key];


          const articles =
            Object.keys(
              source.articles
            )
              .map(
                function(articleKey) {

                  const article =
                    source
                      .articles[
                        articleKey
                      ];


                  return {

                    key:
                      article.key,

                    article:
                      article.article,

                    amount:
                      proFinPlCoreRound2_(
                        article.amount
                      ),

                    transactions:
                      article.transactions
                  };
                }
              )

              .filter(
                function(item) {
                  return (
                    item.amount >
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
                    second.amount !==
                    first.amount
                  ) {

                    return (
                      second.amount -
                      first.amount
                    );
                  }

                  return first.article
                    .localeCompare(
                      second.article,
                      'uk'
                    );
                }
              );


          return {

            key:
              source.key,

            category:
              source.category,

            amount:
              proFinPlCoreRound2_(
                source.amount
              ),

            transactions:
              source.transactions,

            articles:
              articles
          };
        }
      )

      .filter(
        function(item) {
          return (
            item.amount >
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


  return {

    total:
      proFinPlCoreRound2_(
        categories.reduce(
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
      ),

    transactions:
      categories.reduce(
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
      ),

    categories:
      categories
  };
}


// ============================================================
// 7. PERIOD
// ============================================================

function proFinPlCoreNormalizePeriod_(
  period
) {

  const source =
    period || {};


  const from =
    source.from
      ? proFinPlCoreDateOnly_(
          source.from
        )
      : null;


  const to =
    source.to
      ? proFinPlCoreDateOnly_(
          source.to
        )
      : null;


  if (
    from &&
    to &&
    from.getTime() >
      to.getTime()
  ) {

    throw new Error(
      'P&L Core: period.from > period.to.'
    );
  }


  let mode =
    source.mode;


  if (
    !mode
  ) {

    mode =
      from &&
      to &&
      from.getTime() ===
        to.getTime()
        ? 'DAY'
        : 'RANGE';
  }


  return {

    mode:
      mode,

    from:
      from,

    to:
      to,

    source:
      source.source ||
      'EXPLICIT_PERIOD',

    globalRevision:
      Object.prototype
        .hasOwnProperty
        .call(
          source,
          'globalRevision'
        )
        ? source.globalRevision
        : null
  };
}


function proFinPlCoreIsFullMonthPeriod_(
  period
) {

  if (
    !period.from ||
    !period.to
  ) {
    return false;
  }


  if (
    period.from.getDate() !==
    1
  ) {
    return false;
  }


  const expectedLastDay =
    new Date(
      period.to.getFullYear(),
      period.to.getMonth() + 1,
      0
    )
      .getDate();


  return (
    period.to.getDate() ===
    expectedLastDay
  );
}


function proFinPlCoreDateInPeriod_(
  date,
  period
) {

  const time =
    date.getTime();


  if (
    period.from &&
    time <
      period.from.getTime()
  ) {
    return false;
  }


  if (
    period.to &&
    time >
      period.to.getTime()
  ) {
    return false;
  }


  return true;
}


function proFinPlCoreMonthInPeriod_(
  month,
  period
) {

  const monthTime =
    new Date(
      month.getFullYear(),
      month.getMonth(),
      1
    )
      .getTime();


  const fromTime =
    period.from
      ? new Date(
          period.from.getFullYear(),
          period.from.getMonth(),
          1
        )
          .getTime()
      : -Infinity;


  const toTime =
    period.to
      ? new Date(
          period.to.getFullYear(),
          period.to.getMonth(),
          1
        )
          .getTime()
      : Infinity;


  return (
    monthTime >=
      fromTime &&
    monthTime <=
      toTime
  );
}


// ============================================================
// 8. DASHBOARD PERIOD FOR MANUAL DRY RUN
// ============================================================

function proFinPlCoreResolveDashboardPeriod_() {

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const dashboard =
    proFinPlCoreRequireSheet_(
      ss,
      PROFIN_PL_CORE_CFG
        .sheets
        .dashboard
    );


  /*
   * F5 — день.
   */
  const day =
    proFinPlCoreDateOnly_(
      dashboard
        .getRange(
          PROFIN_PL_CORE_CFG
            .dashboardControls
            .day
        )
        .getValue()
    );


  if (
    day
  ) {

    return {

      mode:
        'DAY',

      from:
        day,

      to:
        day,

      source:
        'Дашборд!F5'
    };
  }


  /*
   * F6 — місяць.
   */
  const month =
    proFinPlCoreMonthStart_(
      dashboard
        .getRange(
          PROFIN_PL_CORE_CFG
            .dashboardControls
            .month
        )
        .getValue()
    );


  if (
    month
  ) {

    return {

      mode:
        'MONTH',

      from:
        month,

      to:
        new Date(
          month.getFullYear(),
          month.getMonth() + 1,
          0
        ),

      source:
        'Дашборд!F6'
    };
  }


  /*
   * E5:E6 — range.
   */
  const from =
    proFinPlCoreDateOnly_(
      dashboard
        .getRange(
          PROFIN_PL_CORE_CFG
            .dashboardControls
            .dateFrom
        )
        .getValue()
    );


  const to =
    proFinPlCoreDateOnly_(
      dashboard
        .getRange(
          PROFIN_PL_CORE_CFG
            .dashboardControls
            .dateTo
        )
        .getValue()
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
        'P&L Core: дата "від" ' +
        'пізніше дати "до".'
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
        'Дашборд!E5:E6'
    };
  }


  /*
   * Якщо фільтр порожній —
   * поточний календарний місяць.
   *
   * Це відповідає чинному
   * Global Filter Apply fallback.
   */
  const now =
    new Date();

  const currentMonth =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );


  return {

    mode:
      'MONTH',

    from:
      currentMonth,

    to:
      new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        0
      ),

    source:
      'CURRENT_CALENDAR_MONTH'
  };
}

// ============================================================
// 8A. P&L FACT MODEL FOR FULL CALENDAR MONTHS
// ============================================================

function proFinPlCoreBuildMonthlyModelFromPl_(
  ss,
  period,
  operationIncome,
  operationExpense
) {

  const plSheet =
    proFinPlCoreRequireSheet_(
      ss,
      PROFIN_PL_CORE_CFG
        .sheets
        .pl
    );


  const factColumnMap =
    proFinPlCoreBuildFactColumnMap_(
      plSheet
    );


  const months =
    proFinPlCoreMonthsBetween_(
      period.from,
      period.to
    );


  const factColumns =
    months.map(
      function(monthNumber) {

        const column =
          factColumnMap[
            monthNumber
          ];


        if (!column) {
          throw new Error(
            'P&L Core: не знайдено колонку Факт для місяця ' +
            monthNumber +
            '.'
          );
        }


        return {
          month:
            monthNumber,

          column:
            column
        };
      }
    );


  const income =
    proFinPlCoreBuildMonthlyIncomeFromPl_(
      plSheet,
      factColumns,
      operationIncome
    );


 const expense =
  proFinPlCoreBuildMonthlyExpenseFromPl_(
    plSheet,
    factColumns,
    operationExpense
  );


  return {
    income:
      income,

    expense:
      expense
  };
}


// ============================================================
// 8B. ДОХОДИ З ГОТОВОГО P&L
// ============================================================

function proFinPlCoreBuildMonthlyIncomeFromPl_(
  plSheet,
  factColumns,
  operationIncome
) {

  const cfg =
    PROFIN_PL_CORE_CFG
      .plControl;


  /*
   * Operation model потрібний
   * тільки для деталізації articles /
   * transactions правої income chart.
   *
   * СУМИ категорій беремо ТІЛЬКИ P&L.
   */
  const operationByCategory =
    Object.create(null);


  (
    operationIncome &&
    Array.isArray(
      operationIncome.categories
    )
      ? operationIncome.categories
      : []
  )
    .forEach(
      function(item) {

        operationByCategory[
          proFinPlCoreNormalize_(
            item.category
          )
        ] =
          item;
      }
    );


  const categories =
    [];


  for (
    let row =
      cfg.incomeFirstRow;

    row <=
      cfg.incomeLastRow;

    row++
  ) {

    const rawLabel =
      proFinPlCoreClean_(
        plSheet
          .getRange(
            row,
            cfg.labelColumn
          )
          .getDisplayValue()
      );


    if (!rawLabel) {
      continue;
    }


    const category =
      proFinPlCoreCanonicalPlIncomeLabel_(
        rawLabel
      );


    const amount =
      proFinPlCoreSumPlRowAcrossFacts_(
        plSheet,
        row,
        factColumns
      );


    /*
     * Доходна категорія в P&L
     * не повинна бути від'ємною.
     */
    if (
      amount <
      -PROFIN_PL_CORE_CFG
        .tolerance
    ) {

      throw new Error(
        'P&L Core: категорія доходу "' +
        category +
        '" має від’ємний Факт: ' +
        amount +
        '.'
      );
    }


    if (
      amount <=
      PROFIN_PL_CORE_CFG
        .tolerance
    ) {
      continue;
    }


    const operationItem =
      operationByCategory[
        proFinPlCoreNormalize_(
          category
        )
      ] ||
      null;


    const articles =
      operationItem &&
      Array.isArray(
        operationItem.articles
      )
        ? operationItem.articles.map(
            function(article) {

              return {
                key:
                  article.key,

                article:
                  article.article,

                /*
                 * Сума article тут
                 * transaction-level.
                 *
                 * Права income chart
                 * використовує transactions,
                 * не цю суму.
                 */
                amount:
                  article.amount,

                transactions:
                  article.transactions
              };
            }
          )
        : [];


    categories.push({
      key:
        proFinPlCoreNormalize_(
          category
        ),

      category:
        category,

      /*
       * ГОЛОВНЕ:
       * сума категорії = Факт P&L.
       */
      amount:
        proFinPlCoreRound2_(
          amount
        ),

      transactions:
        operationItem
          ? operationItem.transactions
          : 0,

      articles:
        articles
    });
  }


  /*
   * Контрольний Операційний дохід.
   */
  const controlTotal =
    proFinPlCoreSumPlRowAcrossFacts_(
      plSheet,
      cfg.revenueControlRow,
      factColumns
    );


  const detailTotal =
    proFinPlCoreRound2_(
      categories.reduce(
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
      detailTotal -
      controlTotal
    ) >
    PROFIN_PL_CORE_CFG
      .tolerance
  ) {

    throw new Error(
      'P&L Core: категорії доходу ' +
      'не дорівнюють Операційному доходу. ' +
      'Категорії: ' +
      detailTotal +
      '; P&L контроль: ' +
      controlTotal +
      '.'
    );
  }


  categories.sort(
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


  return {
    total:
      proFinPlCoreRound2_(
        controlTotal
      ),

    transactions:
      categories.reduce(
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
      ),

    categories:
      categories
  };
}


// ============================================================
// 8C. ВИТРАТИ З ГОТОВОГО P&L
// ============================================================

function proFinPlCoreBuildMonthlyExpenseFromPl_(
  plSheet,
  factColumns,
  operationExpense
) {

  const cfg =
    PROFIN_PL_CORE_CFG
      .plControl;
const operationByCategory =
  Object.create(null);

(
  operationExpense &&
  Array.isArray(
    operationExpense.categories
  )
    ? operationExpense.categories
    : []
).forEach(function(item) {
  const key =
    proFinPlCoreNormalize_(
      proFinPlCoreCanonicalPlExpenseLabel_(
        item.category
      )
    );

  operationByCategory[key] =
    item;
});

  /*
   * ==========================================================
   * ВАЖЛИВО
   * ==========================================================
   *
   * У P&L є ДВА РІВНІ:
   *
   * 24 — "Змінні (прямі) витрати"
   *      це АГРЕГАТ, а не сектор діаграми.
   *
   * 38 — "Постійні (операційні) витрати OPEX"
   *      це АГРЕГАТ, а не сектор діаграми.
   *
   * Якщо додати їх разом із дочірніми секторами,
   * загальна сума рахується двічі.
   *
   * Тому читаємо ТІЛЬКИ кінцеві бізнес-сектори P&L.
   */
  const sectorDefinitions = [

    {
      row:
        25,

      detailFrom:
        26,

      detailTo:
        28
    },

    {
      row:
        29,

      detailFrom:
        30,

      detailTo:
        36
    },

    /*
     * 38 = OPEX aggregate.
     * Його НЕ додаємо.
     */

    {
      row:
        39,

      detailFrom:
        40,

      detailTo:
        42
    },

    {
      row:
        43,

      detailFrom:
        44,

      detailTo:
        50
    },

    {
      row:
        51,

      detailFrom:
        52,

      detailTo:
        59
    },

    {
      row:
        60,

      detailFrom:
        61,

      detailTo:
        66
    },

    {
      row:
        67,

      detailFrom:
        68,

      detailTo:
        79
    },

    {
      row:
        80,

      detailFrom:
        81,

      detailTo:
        85
    },

    {
      row:
        86,

      detailFrom:
        87,

      detailTo:
        91
    }
  ];


  const categories =
    [];


  sectorDefinitions.forEach(
    function(definition) {

      /*
       * ------------------------------------------------------
       * НАЗВА СЕКТОРА
       * ------------------------------------------------------
       */

      const rawLabel =
        proFinPlCoreClean_(
          plSheet
            .getRange(
              definition.row,
              cfg.labelColumn
            )
            .getDisplayValue()
        );


      if (
        !rawLabel
      ) {
        return;
      }


      /*
       * ------------------------------------------------------
       * ДЕТАЛІЗАЦІЯ СЕКТОРА
       * ------------------------------------------------------
       */

      const articles =
        [];


      let detailTotal =
        0;


      for (
        let row =
          definition.detailFrom;

        row <=
          definition.detailTo;

        row++
      ) {

        const articleLabel =
          proFinPlCoreClean_(
            plSheet
              .getRange(
                row,
                cfg.labelColumn
              )
              .getDisplayValue()
          );


        if (
          !articleLabel
        ) {
          continue;
        }


        const articleAmount =
          Math.abs(
            proFinPlCoreRound2_(
              proFinPlCoreSumPlRowAcrossFacts_(
                plSheet,
                row,
                factColumns
              )
            )
          );


        /*
         * Нульові статті
         * у pie не додаємо.
         */
        if (
          articleAmount <=
          PROFIN_PL_CORE_CFG
            .tolerance
        ) {
          continue;
        }


        detailTotal +=
          articleAmount;


        articles.push({

          key:
            proFinPlCoreNormalize_(
              articleLabel
            ),

          article:
            articleLabel,

          amount:
            articleAmount,

          /*
           * P&L не зберігає тут
           * кількість первинних транзакцій.
           */
          transactions:
            0
        });
      }


      detailTotal =
        proFinPlCoreRound2_(
          detailTotal
        );


      /*
       * ------------------------------------------------------
       * СЕКТОРНИЙ SUBTOTAL
       * ------------------------------------------------------
       */

      const rawSectorAmount =
        Math.abs(
          proFinPlCoreRound2_(
            proFinPlCoreSumPlRowAcrossFacts_(
              plSheet,
              definition.row,
              factColumns
            )
          )
        );


      /*
       * Основне правило:
       *
       * якщо P&L має секторний subtotal —
       * використовуємо його;
       *
       * якщо subtotal = 0,
       * але дочірні Fact-рядки мають дані —
       * використовуємо їх точну суму.
       *
       * Саме це потрібно для, наприклад,
       * "Інші операційні витрати".
       */
      let sectorAmount =
        rawSectorAmount >
          PROFIN_PL_CORE_CFG
            .tolerance
          ? rawSectorAmount
          : detailTotal;


      sectorAmount =
        proFinPlCoreRound2_(
          sectorAmount
        );


      /*
       * Немає ані subtotal,
       * ані деталізації.
       */
      if (
        sectorAmount <=
        PROFIN_PL_CORE_CFG
          .tolerance
      ) {
        return;
      }


      /*
       * ------------------------------------------------------
       * НЕРОЗНЕСЕНИЙ ЗАЛИШОК
       * ------------------------------------------------------
       *
       * Наприклад:
       *
       * секторний subtotal = 1000
       * видимі detail rows = 900
       *
       * 100 грн не губимо.
       */

      if (
        detailTotal <
        sectorAmount -
          PROFIN_PL_CORE_CFG
            .tolerance
      ) {

        const residual =
          proFinPlCoreRound2_(
            sectorAmount -
            detailTotal
          );


        articles.push({

          key:
            'інше / нерознесене',

          article:
            'Інше / нерознесене',

          amount:
            residual,

          transactions:
            0
        });


        detailTotal =
          proFinPlCoreRound2_(
            detailTotal +
            residual
          );
      }


      /*
       * Якщо subtotal P&L існує,
       * але деталізація більша за нього —
       * це вже реальна неузгодженість P&L.
       *
       * Її не маскуємо.
       */
      if (
        rawSectorAmount >
          PROFIN_PL_CORE_CFG
            .tolerance &&
        detailTotal >
          rawSectorAmount +
            PROFIN_PL_CORE_CFG
              .tolerance
      ) {

        throw new Error(
          'P&L Core: деталізація сектора "' +
          rawLabel +
          '" більша за його Fact subtotal. ' +
          'Subtotal: ' +
          rawSectorAmount +
          '; деталізація: ' +
          detailTotal +
          '.'
        );
      }


      /*
       * ------------------------------------------------------
       * КАНОНІЧНА НАЗВА
       * ------------------------------------------------------
       */

      const category =
        proFinPlCoreCanonicalPlExpenseLabel_(
          rawLabel
        );

 const operationItem =
  operationByCategory[
    proFinPlCoreNormalize_(
      category
    )
  ] || null;

 const operationTransactions =
  operationItem
    ? Number(
        operationItem.transactions
      ) || 0
    : 0;
      articles.sort(
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


          return first.article
            .localeCompare(
              second.article,
              'uk'
            );
        }
      );


      categories.push({

        key:
          proFinPlCoreNormalize_(
            category
          ),

        category:
          category,

        amount:
          sectorAmount,

        transactions:
  operationTransactions,

        articles:
          articles
      });
    }
  );


  /*
   * ==========================================================
   * СОРТУВАННЯ СЕКТОРІВ
   * ==========================================================
   */

  categories.sort(
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
   * ==========================================================
   * СУМА ТІЛЬКИ КІНЦЕВИХ СЕКТОРІВ
   * ==========================================================
   */

  const sectorTotal =
    proFinPlCoreRound2_(
      categories.reduce(
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


  /*
   * ==========================================================
   * ГЛОБАЛЬНИЙ КОНТРОЛЬ P&L
   * ==========================================================
   *
   * row 93 = загальні витрати P&L.
   */

  const controlTotal =
    Math.abs(
      proFinPlCoreRound2_(
        proFinPlCoreSumPlRowAcrossFacts_(
          plSheet,
          cfg.expenseControlRow,
          factColumns
        )
      )
    );


  if (
    Math.abs(
      sectorTotal -
      controlTotal
    ) >
    PROFIN_PL_CORE_CFG
      .tolerance
  ) {

    const breakdown =
      categories
        .map(
          function(item) {

            return (
              item.category +
              '=' +
              item.amount
            );
          }
        )
        .join(
          '; '
        );


    throw new Error(
      'P&L Core: кінцеві сектори витрат ' +
      'не дорівнюють контрольному P&L. ' +
      'Сектори: ' +
      sectorTotal +
      '; контроль: ' +
      controlTotal +
      '; структура: ' +
      breakdown
    );
  }


  /*
   * ==========================================================
   * RESULT
   * ==========================================================
   */

  return {
  total:
    controlTotal,

  transactions:
    categories.reduce(
      function(sum, item) {
        return (
          sum +
          (Number(item.transactions) || 0)
        );
      },
      0
    ),

  categories:
    categories
};
}

// ============================================================
// 8D. P&L HELPERS
// ============================================================

function proFinPlCoreSumPlRowAcrossFacts_(
  plSheet,
  row,
  factColumns
) {

  let total =
    0;


  factColumns.forEach(
    function(item) {

      const value =
        proFinPlCoreNumber_(
          plSheet
            .getRange(
              row,
              item.column
            )
            .getValue()
        );


      if (
        value !==
        null
      ) {

        total +=
          value;
      }
    }
  );


  return proFinPlCoreRound2_(
    total
  );
}


function proFinPlCoreCanonicalPlIncomeLabel_(
  value
) {

  const label =
    proFinPlCoreClean_(
      value
    );


  const key =
    proFinPlCoreNormalize_(
      label
    );


  /*
   * P&L:
   * "Вакцини (використані)"
   *
   * Dashboard:
   * "Вакцини"
   */
  if (
    key.indexOf(
      'вакцини'
    ) ===
    0
  ) {

    return 'Вакцини';
  }


  if (
    key ===
      'додатковий дохід'
  ) {

    return 'Додаткові доходи';
  }


  return label;
}


function proFinPlCoreCanonicalPlExpenseLabel_(
  value
) {

  const label =
    proFinPlCoreClean_(
      value
    );


  const key =
    proFinPlCoreNormalize_(
      label
    );


  /*
   * У Базі операцій історично
   * зустрічалася опечатка.
   */
  if (
    key ===
      'аміністративні витрати'
  ) {

    return 'Адміністративні витрати';
  }


  /*
   * P&L має сектор
   * "Адмін.персонал",
   * а dashboard taxonomy
   * використовує "Персонал".
   */
  if (
    key ===
      'адмін.персонал' ||
    key ===
      'адмін персонал'
  ) {

    return 'Персонал';
  }


  return label;
}

// ============================================================
// 9. P&L MONTHLY RECONCILIATION
// ============================================================

function proFinPlCoreReconcile_(
  ss,
  period,
  fullCalendarMonths,
  coreIncome,
  coreExpense
) {

  /*
   * P&L фізично місячний.
   * Для дня / частини місяця
   * контроль не робимо.
   */
  if (
    !fullCalendarMonths
  ) {

    return {

      available:
        false,

      reason:
        'PARTIAL_PERIOD_HAS_NO_MONTHLY_PL_CONTROL'
    };
  }


  if (
    !period.from ||
    !period.to
  ) {

    return {

      available:
        false,

      reason:
        'PERIOD_NOT_BOUNDED'
    };
  }


  if (
    period.from.getFullYear() !==
      period.to.getFullYear() ||
    period.from.getFullYear() !==
      PROFIN_PL_CORE_CFG
        .plControl
        .reportYear
  ) {

    return {

      available:
        false,

      reason:
        'PL_RECONCILIATION_YEAR_NOT_SUPPORTED'
    };
  }


  const plSheet =
    ss.getSheetByName(
      PROFIN_PL_CORE_CFG
        .sheets
        .pl
    );


  if (
    !plSheet
  ) {

    return {

      available:
        false,

      reason:
        'PL_SHEET_NOT_FOUND'
    };
  }


  const factColumns =
    proFinPlCoreBuildFactColumnMap_(
      plSheet
    );


  const months =
    proFinPlCoreMonthsBetween_(
      period.from,
      period.to
    );


  for (
    let index = 0;
    index < months.length;
    index++
  ) {

    if (
      !factColumns[
        months[index]
      ]
    ) {

      return {

        available:
          false,

        reason:
          'PL_FACT_COLUMN_NOT_FOUND_FOR_MONTH_' +
          months[index]
      };
    }
  }


  const revenueRow =
    proFinPlCoreFindPlLabelRow_(
      plSheet,
      PROFIN_PL_CORE_CFG
        .plControl
        .revenueLabels
    );


  if (
    !revenueRow
  ) {

    return {

      available:
        false,

      reason:
        'PL_REVENUE_ROW_NOT_FOUND'
    };
  }


  let plIncome =
    0;

  let plExpense =
    0;


  months.forEach(
    function(monthNumber) {

      const column =
        factColumns[
          monthNumber
        ];


      const revenueValue =
        proFinPlCoreNumber_(
          plSheet
            .getRange(
              revenueRow,
              column
            )
            .getValue()
        );


      const expenseValue =
        proFinPlCoreNumber_(
          plSheet
            .getRange(
              PROFIN_PL_CORE_CFG
                .plControl
                .expenseControlRow,
              column
            )
            .getValue()
        );


      if (
        revenueValue !==
        null
      ) {

        plIncome +=
          revenueValue;
      }


      if (
        expenseValue !==
        null
      ) {

        plExpense +=
          Math.abs(
            expenseValue
          );
      }
    }
  );


  plIncome =
    proFinPlCoreRound2_(
      plIncome
    );


  plExpense =
    proFinPlCoreRound2_(
      plExpense
    );


  const incomeDifference =
    proFinPlCoreRound2_(
      coreIncome -
      plIncome
    );


  const expenseDifference =
    proFinPlCoreRound2_(
      coreExpense -
      plExpense
    );


  const incomeOk =
    Math.abs(
      incomeDifference
    ) <=
    PROFIN_PL_CORE_CFG
      .tolerance;


  const expenseOk =
    Math.abs(
      expenseDifference
    ) <=
    PROFIN_PL_CORE_CFG
      .tolerance;


  return {

    available:
      true,

    ok:
      incomeOk &&
      expenseOk,

    income: {

      core:
        coreIncome,

      pl:
        plIncome,

      difference:
        incomeDifference,

      ok:
        incomeOk
    },

    expense: {

      core:
        coreExpense,

      pl:
        plExpense,

      difference:
        expenseDifference,

      ok:
        expenseOk
    }
  };
}


function proFinPlCoreBuildFactColumnMap_(
  plSheet
) {

  const lastColumn =
    plSheet
      .getLastColumn();


  const months =
    plSheet
      .getRange(
        PROFIN_PL_CORE_CFG
          .plControl
          .monthNumberRow,
        1,
        1,
        lastColumn
      )
      .getDisplayValues()[0];


  const headers =
    plSheet
      .getRange(
        PROFIN_PL_CORE_CFG
          .plControl
          .periodHeaderRow,
        1,
        1,
        lastColumn
      )
      .getDisplayValues()[0];


  const result =
    Object.create(null);


  for (
    let columnIndex = 0;
    columnIndex < lastColumn;
    columnIndex++
  ) {

    const monthNumber =
      Number(
        proFinPlCoreClean_(
          months[
            columnIndex
          ]
        )
      );


    if (
      !Number.isInteger(
        monthNumber
      ) ||
      monthNumber < 1 ||
      monthNumber > 12
    ) {

      continue;
    }


    /*
     * У поточній структурі
     * місячний блок може містити
     * кілька сусідніх колонок.
     *
     * Шукаємо "Факт" у межах
     * поточної + двох наступних.
     */
    for (
      let offset = 0;
      offset <= 2;
      offset++
    ) {

      const index =
        columnIndex +
        offset;


      if (
        index >=
        lastColumn
      ) {
        break;
      }


      if (
        proFinPlCoreNormalize_(
          headers[
            index
          ]
        )
          .indexOf(
            'факт'
          ) !== -1
      ) {

        result[
          monthNumber
        ] =
          index + 1;

        break;
      }
    }
  }


  return result;
}


function proFinPlCoreFindPlLabelRow_(
  plSheet,
  labels
) {

  const lastRow =
    plSheet
      .getLastRow();


  const values =
    plSheet
      .getRange(
        1,
        PROFIN_PL_CORE_CFG
          .plControl
          .labelColumn,
        lastRow,
        1
      )
      .getDisplayValues();


  const keys =
    labels.map(
      function(label) {
        return proFinPlCoreNormalize_(
          label
        );
      }
    );


  for (
    let index = 0;
    index < values.length;
    index++
  ) {

    const key =
      proFinPlCoreNormalize_(
        values[index][0]
      );


    if (
      keys.indexOf(
        key
      ) !== -1
    ) {

      return (
        index + 1
      );
    }
  }


  return null;
}


function proFinPlCoreMonthsBetween_(
  from,
  to
) {

  const result =
    [];


  let cursor =
    new Date(
      from.getFullYear(),
      from.getMonth(),
      1
    );


  const end =
    new Date(
      to.getFullYear(),
      to.getMonth(),
      1
    );


  while (
    cursor.getTime() <=
    end.getTime()
  ) {

    result.push(
      cursor.getMonth() + 1
    );


    cursor =
      new Date(
        cursor.getFullYear(),
        cursor.getMonth() + 1,
        1
      );
  }


  return result;
}


// ============================================================
// 10. STATUS / ALIASES
// ============================================================

function proFinPlCoreIsExcludedStatus_(
  value
) {

  const key =
    proFinPlCoreNormalize_(
      value
    );


  if (
    !key
  ) {
    return false;
  }


  return PROFIN_PL_CORE_CFG
    .excludedStatusFragments
    .some(
      function(fragment) {

        return (
          key.indexOf(
            fragment
          ) !== -1
        );
      }
    );
}


function proFinPlCoreMatchesAlias_(
  value,
  aliases
) {

  const key =
    proFinPlCoreNormalize_(
      value
    );


  if (
    !key
  ) {
    return false;
  }


  return aliases.some(
    function(alias) {

      return (
        key ===
        proFinPlCoreNormalize_(
          alias
        )
      );
    }
  );
}


// ============================================================
// 11. DATE / MONTH
// ============================================================

function proFinPlCoreDateOnly_(
  value
) {

  if (
    Object.prototype
      .toString
      .call(
        value
      ) ===
        '[object Date]' &&
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


  const text =
    proFinPlCoreClean_(
      value
    );


  if (
    !text
  ) {
    return null;
  }


  let match =
    text.match(
      /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/
    );


  if (
    match
  ) {

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
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/
    );


  if (
    match
  ) {

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


  return null;
}


function proFinPlCoreMonthStart_(
  value
) {

  if (
    Object.prototype
      .toString
      .call(
        value
      ) ===
        '[object Date]' &&
    !isNaN(
      value.getTime()
    )
  ) {

    return new Date(
      value.getFullYear(),
      value.getMonth(),
      1
    );
  }


  const text =
    proFinPlCoreClean_(
      value
    );


  if (
    !text
  ) {
    return null;
  }


  let match =
    text.match(
      /^(\d{1,2})[.\/-](\d{4})$/
    );


  if (
    match
  ) {

    return new Date(
      Number(
        match[2]
      ),
      Number(
        match[1]
      ) - 1,
      1
    );
  }


  match =
    text.match(
      /^(\d{4})-(\d{1,2})$/
    );


  if (
    match
  ) {

    return new Date(
      Number(
        match[1]
      ),
      Number(
        match[2]
      ) - 1,
      1
    );
  }


  return null;
}


// ============================================================
// 12. NUMBER
// ============================================================

function proFinPlCoreNumber_(
  value
) {

  if (
    typeof value ===
    'number'
  ) {

    return Number.isFinite(
      value
    )
      ? value
      : null;
  }


  let text =
    proFinPlCoreClean_(
      value
    )
      .replace(
        /\u00A0/g,
        ''
      )
      .replace(
        /\s/g,
        ''
      );


  if (
    !text
  ) {
    return null;
  }


  if (
    text.indexOf(
      ','
    ) !== -1 &&
    text.indexOf(
      '.'
    ) !== -1
  ) {

    if (
      text.lastIndexOf(
        ','
      ) >
      text.lastIndexOf(
        '.'
      )
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
    text.indexOf(
      ','
    ) !== -1
  ) {

    text =
      text.replace(
        ',',
        '.'
      );
  }


  text =
    text.replace(
      /[^0-9.-]/g,
      ''
    );


  if (
    !text
  ) {
    return null;
  }


  const number =
    Number(
      text
    );


  return Number.isFinite(
    number
  )
    ? number
    : null;
}


// ============================================================
// 13. HELPERS
// ============================================================

function proFinPlCoreRequireSheet_(
  ss,
  name
) {

  const sheet =
    ss.getSheetByName(
      name
    );


  if (
    !sheet
  ) {

    throw new Error(
      'P&L Core: лист "' +
      name +
      '" не знайдено.'
    );
  }


  return sheet;
}


function proFinPlCoreClean_(
  value
) {

  return String(
    value == null
      ? ''
      : value
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


function proFinPlCoreNormalize_(
  value
) {

  return proFinPlCoreClean_(
    value
  )
    .toLocaleLowerCase(
      'uk'
    );
}


function proFinPlCoreRound2_(
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


function proFinPlCorePeriodForLog_(
  period
) {

  return {

    mode:
      period.mode,

    from:
      period.from
        ? Utilities.formatDate(
            period.from,
            Session.getScriptTimeZone(),
            'dd.MM.yyyy'
          )
        : null,

    to:
      period.to
        ? Utilities.formatDate(
            period.to,
            Session.getScriptTimeZone(),
            'dd.MM.yyyy'
          )
        : null,

    source:
      period.source,

    globalRevision:
      period.globalRevision
  };
}