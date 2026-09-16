/****************************************************
 * PROFIN OS — АКТИВИ
 * КРОК 4. ПОМІСЯЧНИЙ РОЗРАХУНОК АМОРТИЗАЦІЇ
 *
 * ПРАВИЛА:
 * 1. Капіталізація — від 6000 грн включно.
 * 2. Джерело первісної вартості — Активи!E.
 * 3. Строк — у повних роках, переводиться в місяці.
 * 4. Повна дата — амортизація з її календарного місяця.
 * 5. Лише рік — амортизація з січня цього року.
 * 6. Перший місяць враховується повністю.
 * 7. Останній місяць = старт + строк у місяцях - 1.
 * 8. Після завершення строку амортизація дорівнює 0.
 * 9. Дата вибуття — місяць, з якого амортизація припиняється.
 * 10. Порожній статус історичного активу тимчасово = Активний.
 *
 * СУМІСНІСТЬ:
 * - зберігає updateAssetDepreciationKpis();
 * - зберігає getMonthlyDepreciation_();
 * - не змінює історичні рядки листа "Активи";
 * - не записує амортизацію в "Базу операцій".
 ****************************************************/


/****************************************************
 * СУМІСНІСТЬ ЗІ СТАРИМ МОДУЛЕМ
 ****************************************************/

const ASSET_SHEET_NAME = 'Активи';
const ASSET_START_ROW = 3;

const ASSET_COLS = Object.freeze({
  name: 1,             // A Назва активу
  category: 2,         // B Категорія активу
  quantity: 3,         // C Кількість
  unitPrice: 4,        // D Ціна за одиницю
  total: 5,            // E Первісна загальна вартість
  usefulLife: 6,       // F Строк амортизації, років
  startDate: 7,        // G Дата введення в експлуатацію
  startYear: 7,        // Сумісність зі старою назвою
  funding: 8,          // H Джерело фінансування
  branch: 9,           // I Філія
  operationId: 10,     // J ID операції
  status: 11,          // K Статус активу
  disposalDate: 12     // L Дата вибуття
});

const ASSET_KPI = Object.freeze({
  originalCost: 'N3',
  accumulatedDepreciation: 'N4',
  assetBalance: 'N5',
  currentMonthlyDepreciation: 'N6',
  assetsOnBalance: 'N7',
  depreciatingAssets: 'N8',
  fullyDepreciatedAssets: 'N9',
  excludedBelowLimit: 'N10',
  updatedAt: 'N11',

  /*
   * Сумісність зі старими зверненнями.
   */
  monthlyDepreciation: 'N6',
  capitalizedAssets: 'N7',
  assetsOver10000: 'N7'
});


/****************************************************
 * ОСНОВНА КОНФІГУРАЦІЯ
 ****************************************************/

 const ASSET_DEPRECIATION_CONFIG = Object.freeze({
  sheetName: 'Активи',

  startRow: 3,

  /*
   * Реєстр активів займає A:L.
   * M:N — підсумковий блок.
   */
  lastDataColumn: 12,

  capitalizationLimit: 6000,

  kpi: Object.freeze({
    labelColumn: 13, // M
    valueColumn: 14, // N

    firstRow: 3,

    originalCostRow: 3,
    accumulatedRow: 4,
    bookValueRow: 5,
    currentMonthlyRow: 6,
    assetsOnBalanceRow: 7,
    depreciatingAssetsRow: 8,
    fullyDepreciatedAssetsRow: 9,
    excludedBelowLimitRow: 10,
    updatedAtRow: 11
  }),

  kpiLabels: Object.freeze({
    originalCost:
      'Первісна вартість активів на балансі',

    accumulated:
      'Накопичена амортизація',

    bookValue:
      'Залишкова балансова вартість',

    currentMonthly:
      'Поточна місячна амортизація',

    assetsOnBalance:
      'Активів на балансі',

    depreciatingAssets:
      'Активів у процесі амортизації',

    fullyDepreciatedAssets:
      'Повністю замортизованих активів',

    excludedBelowLimit:
      'Не капіталізовано через суму до 6000 грн',

    updatedAt:
      'Оновлено станом на'
  }),

  /*
   * Порожній статус історичного активу
   * тимчасово трактується як активний.
   */
  activeStatus: 'Активний',

  inactiveStatuses: Object.freeze([
    'Проданий',
    'Списаний',
    'Вибув'
  ])
});
/****************************************************
 * ПІДГОТОВКА КРОКУ 4
 *
 * Не змінює активи A:L.
 * Стандартизує лише назви KPI у M3:M6
 * і формати значень N3:N6.
 ****************************************************/

/****************************************************
 * ПІДГОТОВКА ПІДСУМКОВОГО БЛОКУ M3:N11
 *
 * Не змінює реєстр активів A:L.
 ****************************************************/

function prepareAssetDepreciationStep4() {
  assetDepAssertDependencies_();

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(
      ASSET_DEPRECIATION_CONFIG.sheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "Активи".'
    );
  }

  /*
   * Поширюємо оформлення на нові рядки.
   */
  sheet
    .getRange('M6:N6')
    .copyTo(
      sheet.getRange('M7:N11'),
      SpreadsheetApp.CopyPasteType.PASTE_FORMAT,
      false
    );

  const labels = [
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.originalCost
    ],
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.accumulated
    ],
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.bookValue
    ],
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.currentMonthly
    ],
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.assetsOnBalance
    ],
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.depreciatingAssets
    ],
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.fullyDepreciatedAssets
    ],
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.excludedBelowLimit
    ],
    [
      ASSET_DEPRECIATION_CONFIG
        .kpiLabels.updatedAt
    ]
  ];

  sheet
    .getRange(
      ASSET_DEPRECIATION_CONFIG
        .kpi.firstRow,

      ASSET_DEPRECIATION_CONFIG
        .kpi.labelColumn,

      labels.length,
      1
    )
    .setValues(labels);

  /*
   * N3:N6 — грошові показники.
   */
  sheet
    .getRange('N3:N6')
    .setNumberFormat('#,##0.00');

  /*
   * N7:N10 — кількісні показники.
   */
  sheet
    .getRange('N7:N10')
    .setNumberFormat('0');

  /*
   * N11 — дата й час актуальності.
   */
  sheet
    .getRange('N11')
    .setNumberFormat('dd.MM.yyyy HH:mm');

  sheet
    .getRange('N3:N11')
    .clearNote();

  sheet
    .getRange('N3')
    .setNote(
      'Первісна вартість капіталізованих активів, які перебувають на балансі.'
    );

  sheet
    .getRange('N4')
    .setNote(
      'Амортизація, накопичена від початку використання активів до поточного місяця включно.'
    );

  sheet
    .getRange('N5')
    .setNote(
      'Первісна вартість мінус накопичена амортизація.'
    );

  sheet
    .getRange('N6')
    .setNote(
      'Амортизація актуальних активів за поточний календарний місяць.'
    );

  sheet
    .getRange('N7')
    .setNote(
      'Кількість капіталізованих активів, які ще не вибули.'
    );

  sheet
    .getRange('N8')
    .setNote(
      'Активи, за якими в поточному місяці нараховується амортизація.'
    );

  sheet
    .getRange('N9')
    .setNote(
      'Активи з нульовою залишковою вартістю, які ще не вибули.'
    );

  sheet
    .getRange('N10')
    .setNote(
      'Рядки з первісною вартістю нижче управлінського порогу 6000 грн.'
    );

  sheet
    .getRange('N11')
    .setNote(
      'Дата й час останнього автоматичного перерахунку блока.'
    );

  SpreadsheetApp.flush();

  return true;
}


/****************************************************
 * ОНОВЛЕННЯ KPI ЗА ПОТОЧНИЙ МІСЯЦЬ
 ****************************************************/

/****************************************************
 * ОНОВЛЕННЯ ПІДСУМКУ ЛИСТА "АКТИВИ"
 *
 * Працює станом на поточний місяць.
 ****************************************************/

function updateAssetDepreciationKpis() {
  return refreshAssetSummaryKpis_(true);
}

/****************************************************
 * ОНОВЛЕННЯ KPI ЗА ВКАЗАНИЙ МІСЯЦЬ
 *
 * period:
 * - Date;
 * - "MM.YYYY";
 * - "YYYY-MM".
 ****************************************************/

/****************************************************
 * РОЗРАХУНОК ПОКАЗНИКІВ ЗА ВКАЗАНИЙ МІСЯЦЬ
 *
 * Не записує результат у підсумковий блок M:N.
 * Використовується для P&L та історичних звітів.
 ****************************************************/

function updateAssetDepreciationKpisForPeriod_(
  period
) {
  assetDepAssertDependencies_();

  const month =
    assetDepParsePeriod_(period);

  const summary =
    calculateAssetDepreciationForPeriod_(
      month,
      {
        strict: true,
        includeRows: true
      }
    );

  const annualDepreciation =
    calculateAssetDepreciationForYear_(
      month.getFullYear(),
      {
        strict: true
      }
    );

  return {
    period:
      Utilities.formatDate(
        month,
        Session.getScriptTimeZone(),
        'MM.yyyy'
      ),

    monthlyDepreciation:
      summary.monthlyDepreciation,

    accumulatedDepreciation:
      summary.accumulatedDepreciation,

    annualDepreciation:
      annualDepreciation,

    bookValue:
      summary.bookValue,

    assetsOnBalance:
      summary.assetsOnBalance,

    excludedBelowLimit:
      summary.excludedBelowLimit,

    includedRows:
      summary.includedRows,

    issues:
      summary.issues
  };
}


/****************************************************
 * ОСНОВНИЙ РОЗРАХУНОК ЗА МІСЯЦЬ
 ****************************************************/

function calculateAssetDepreciationForPeriod_(
  period,
  options
) {
  assetDepAssertDependencies_();

  const settings = Object.assign(
    {
      strict: true,
      includeRows: false
    },
    options || {}
  );

  const month =
    assetDepParsePeriod_(
      period
    );

  const records =
    assetDepReadRecords_();

  const result = {
    period:
      month,

    monthlyDepreciation:
      0,

    accumulatedDepreciation:
      0,

    bookValue:
      0,

    assetsOnBalance:
      0,

    capitalizedRowsTotal:
      0,

    excludedBelowLimit:
      0,

    includedRows:
      [],

    issues:
      []
  };

  records.forEach(record => {
    if (!record.name) return;

    if (!record.valid) {
      result.issues.push({
        row:
          record.row,

        name:
          record.name,

        errors:
          record.errors.slice()
      });

      return;
    }

    if (!record.isCapitalized) {
      result.excludedBelowLimit++;
      return;
    }

    result.capitalizedRowsTotal++;

    const monthResult =
      assetDepCalculateRecordForMonth_(
        record,
        month
      );

    result.monthlyDepreciation +=
      monthResult.monthlyDepreciation;

    result.accumulatedDepreciation +=
      monthResult.accumulatedDepreciation;

    result.bookValue +=
      monthResult.bookValue;

    if (monthResult.onBalance) {
      result.assetsOnBalance++;
    }

    if (
      settings.includeRows &&
      (
        monthResult.monthlyDepreciation !== 0 ||
        monthResult.onBalance
      )
    ) {
      result.includedRows.push({
        row:
          record.row,

        name:
          record.name,

        category:
          record.category,

        total:
          record.total,

        usefulLifeMonths:
          record.usefulLifeMonths,

        startMonth:
          assetDepFormatMonth_(
            record.startMonth
          ),

        naturalEndMonth:
          assetDepFormatMonth_(
            record.naturalEndMonth
          ),

        disposalStopMonth:
          record.disposalStopMonth
            ? assetDepFormatMonth_(
                record.disposalStopMonth
              )
            : '',

        monthlyDepreciation:
          monthResult.monthlyDepreciation,

        accumulatedDepreciation:
          monthResult.accumulatedDepreciation,

        bookValue:
          monthResult.bookValue,

        onBalance:
          monthResult.onBalance
      });
    }
  });

  result.monthlyDepreciation =
    assetDepRoundMoney_(
      result.monthlyDepreciation
    );

  result.accumulatedDepreciation =
    assetDepRoundMoney_(
      result.accumulatedDepreciation
    );

  result.bookValue =
    assetDepRoundMoney_(
      result.bookValue
    );

  if (
    settings.strict &&
    result.issues.length
  ) {
    throw new Error(
      'Розрахунок амортизації зупинено. Некоректних активів: ' +
      result.issues.length +
      '. Запустіть auditAssetDepreciationStep4() для деталей.'
    );
  }

  return result;
}


/****************************************************
 * РОЗРАХУНОК АМОРТИЗАЦІЇ
 * ЗА КАЛЕНДАРНИЙ РІК
 ****************************************************/

function calculateAssetDepreciationForYear_(
  year,
  options
) {
  const numericYear =
    Number(year);

  if (
    !Number.isInteger(
      numericYear
    ) ||
    numericYear < 1900 ||
    numericYear > 2200
  ) {
    throw new Error(
      'Некоректний рік для розрахунку амортизації.'
    );
  }

  let total = 0;

  for (
    let monthIndex = 0;
    monthIndex < 12;
    monthIndex++
  ) {
    const summary =
      calculateAssetDepreciationForPeriod_(
        new Date(
          numericYear,
          monthIndex,
          1
        ),
        Object.assign(
          {
            strict: true,
            includeRows: false
          },
          options || {}
        )
      );

    total +=
      summary.monthlyDepreciation;
  }

  return assetDepRoundMoney_(
    total
  );
}


/****************************************************
 * СУМІСНІСТЬ З ІСНУЮЧИМИ МОДУЛЯМИ
 *
 * Без аргументу повертає суму
 * за поточний місяць.
 *
 * З аргументом — за вказаний місяць.
 ****************************************************/

function getMonthlyDepreciation_(
  period
) {
  const month =
    period
      ? assetDepParsePeriod_(
          period
        )
      : assetDepMonthStart_(
          new Date()
        );

  return calculateAssetDepreciationForPeriod_(
    month,
    {
      strict: true,
      includeRows: false
    }
  ).monthlyDepreciation;
}


/****************************************************
 * ДЕТАЛІ ДЛЯ МАЙБУТНЬОЇ
 * ІНТЕГРАЦІЇ З P&L
 ****************************************************/

function getMonthlyDepreciationBreakdown_(
  period
) {
  const month =
    period
      ? assetDepParsePeriod_(
          period
        )
      : assetDepMonthStart_(
          new Date()
        );

  const summary =
    calculateAssetDepreciationForPeriod_(
      month,
      {
        strict: true,
        includeRows: true
      }
    );

  const byCategory = {};

  summary.includedRows.forEach(
    item => {
      if (
        !(item.monthlyDepreciation > 0)
      ) {
        return;
      }

      const category =
        item.category ||
        'Без категорії';

      byCategory[category] =
        assetDepRoundMoney_(
          (
            byCategory[category] ||
            0
          ) +
          item.monthlyDepreciation
        );
    }
  );

  return {
    period:
      assetDepFormatMonth_(
        month
      ),

    total:
      summary.monthlyDepreciation,

    byCategory:
      byCategory,

    rows:
      summary.includedRows
  };
}


/****************************************************
 * АУДИТ ФАКТИЧНОГО ЛИСТА "АКТИВИ"
 *
 * Нічого не змінює.
 ****************************************************/

function auditAssetDepreciationStep4() {
  assetDepAssertDependencies_();

  const records =
    assetDepReadRecords_();

  const report = {
    assetRows:
      0,

    validRows:
      0,

    invalidRows:
      0,

    capitalizedRows:
      0,

    belowLimitRows:
      0,

    historicalJanuaryRows:
      0,

    fullDateRows:
      0,

    inactiveRows:
      0,

    issues:
      []
  };

  records.forEach(record => {
    if (!record.name) return;

    report.assetRows++;

    if (!record.valid) {
      report.invalidRows++;

      report.issues.push({
        row:
          record.row,

        name:
          record.name,

        errors:
          record.errors.slice()
      });

      return;
    }

    report.validRows++;

    if (record.isCapitalized) {
      report.capitalizedRows++;
    } else {
      report.belowLimitRows++;
    }

    if (
      record.startSourceKind ===
      'year'
    ) {
      report.historicalJanuaryRows++;
    } else {
      report.fullDateRows++;
    }

    if (record.isInactive) {
      report.inactiveRows++;
    }
  });

  Logger.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );

  if (report.invalidRows) {
    SpreadsheetApp
      .getActive()
      .toast(
        'Аудит амортизації: знайдено помилок ' +
          report.invalidRows,
        'Модуль "Активи"',
        8
      );
  } else {
    SpreadsheetApp
      .getActive()
      .toast(
        'Аудит амортизації пройдено. Активів: ' +
          report.assetRows,
        'Модуль "Активи"',
        8
      );
  }

  return report;
}


/****************************************************
 * ЧИТАННЯ І НОРМАЛІЗАЦІЯ
 * РЕЄСТРУ АКТИВІВ
 ****************************************************/

function assetDepReadRecords_() {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(
      ASSET_DEPRECIATION_CONFIG.sheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "Активи".'
    );
  }

  const lastRow =
    findLastAssetDataRow_(
      sheet
    );

  if (
    lastRow <
    ASSET_DEPRECIATION_CONFIG.startRow
  ) {
    return [];
  }

  const data = sheet
    .getRange(
      ASSET_DEPRECIATION_CONFIG.startRow,
      1,

      lastRow -
        ASSET_DEPRECIATION_CONFIG.startRow +
        1,

      ASSET_DEPRECIATION_CONFIG
        .lastDataColumn
    )
    .getValues();

  return data.map(
    (row, index) =>
      assetDepBuildRecordFromRow_(
        row,
        ASSET_DEPRECIATION_CONFIG
          .startRow +
          index
      )
  );
}


/****************************************************
 * ПОБУДОВА ЗАПИСУ З РЯДКА ЛИСТА
 ****************************************************/

function assetDepBuildRecordFromRow_(
  row,
  sheetRow
) {
  return assetDepBuildSyntheticRecord_({
    row:
      sheetRow,

    name:
      row[0],

    category:
      row[1],

    quantity:
      row[2],

    unitPrice:
      row[3],

    total:
      row[4],

    usefulLifeYears:
      row[5],

    startDate:
      row[6],

    funding:
      row[7],

    branch:
      row[8],

    operationId:
      row[9],

    status:
      row[10],

    disposalDate:
      row[11]
  });
}


/****************************************************
 * НОРМАЛІЗАЦІЯ ОДНОГО АКТИВУ
 *
 * Використовується також у тестах,
 * тому може приймати штучний об’єкт.
 ****************************************************/

function assetDepBuildSyntheticRecord_(
  source
) {
  const errors = [];

  const name =
    assetDepClean_(
      source.name
    );

  const category =
    assetDepClean_(
      source.category
    );

  /*
   * Історична кількість іноді записана
   * як "2 шт". assetDepNumber_() її читає.
   */
  const quantity =
    assetDepNumber_(
      source.quantity
    ) || 1;

  const unitPrice =
    Math.abs(
      assetDepNumber_(
        source.unitPrice
      )
    );

  /*
   * Головне джерело вартості — колонка E.
   */
  const total =
    Math.abs(
      assetDepNumber_(
        source.total
      )
    );

  const usefulLifeYears =
    assetDepNumber_(
      source.usefulLifeYears
    );

  const status =
    assetDepClean_(
      source.status
    );

  const parsedStart =
    assetCoreParseStartDate_(
      source.startDate
    );

  const disposal =
    assetDepParseFullDate_(
      source.disposalDate
    );

  if (!name) {
    errors.push(
      'Не вказано назву активу'
    );
  }

  if (!(total > 0)) {
    errors.push(
      'Не вказано первісну загальну вартість у колонці E'
    );
  }

  if (
    !Number.isInteger(
      usefulLifeYears
    ) ||
    usefulLifeYears <= 0
  ) {
    errors.push(
      'Строк амортизації має бути додатним цілим числом років'
    );
  }

  if (
    !parsedStart ||
    !(
      parsedStart.date instanceof Date
    ) ||
    isNaN(
      parsedStart.date.getTime()
    )
  ) {
    errors.push(
      'Некоректна дата введення в експлуатацію'
    );
  }

  /*
   * Порожній статус історичного активу
   * тимчасово трактуємо як "Активний".
   */
  const normalizedStatus =
    status ||
    ASSET_DEPRECIATION_CONFIG
      .activeStatus;

  const isKnownStatus =
    normalizedStatus ===
      ASSET_DEPRECIATION_CONFIG
        .activeStatus ||
    ASSET_DEPRECIATION_CONFIG
      .inactiveStatuses
      .includes(
        normalizedStatus
      );

  if (!isKnownStatus) {
    errors.push(
      'Непідтримуваний статус активу: ' +
      normalizedStatus
    );
  }

  const isInactive =
    ASSET_DEPRECIATION_CONFIG
      .inactiveStatuses
      .includes(
        normalizedStatus
      );

  /*
   * Для неактивного активу потрібна дата,
   * з місяця якої він більше
   * не амортизується.
   */
  if (
    isInactive &&
    !disposal.valid
  ) {
    errors.push(
      'Для статусу "' +
      normalizedStatus +
      '" потрібна повна дата вибуття у колонці L'
    );
  }

  const startMonth =
    parsedStart &&
    parsedStart.date instanceof Date
      ? assetDepMonthStart_(
          parsedStart.date
        )
      : null;

  const usefulLifeMonths =
    Number.isInteger(
      usefulLifeYears
    ) &&
    usefulLifeYears > 0
      ? usefulLifeYears * 12
      : 0;

  /*
   * Останній природний місяць амортизації.
   *
   * Приклад:
   * старт 01.2025;
   * строк 60 місяців;
   * останній місяць 12.2029.
   */
  const naturalEndMonth =
    startMonth &&
    usefulLifeMonths > 0
      ? assetDepAddMonths_(
          startMonth,
          usefulLifeMonths - 1
        )
      : null;

  /*
   * Місяць вибуття — перший місяць,
   * у якому амортизація вже не нараховується.
   */
  const disposalStopMonth =
    disposal.valid
      ? assetDepMonthStart_(
          disposal.date
        )
      : null;

  if (
    disposalStopMonth &&
    startMonth &&
    disposalStopMonth <
      startMonth
  ) {
    errors.push(
      'Дата вибуття не може бути раніше місяця введення'
    );
  }

  return {
    row:
      Number(source.row) || 0,

    name:
      name,

    category:
      category,

    quantity:
      quantity,

    unitPrice:
      unitPrice,

    total:
      total,

    usefulLifeYears:
      usefulLifeYears,

    usefulLifeMonths:
      usefulLifeMonths,

    startMonth:
      startMonth,

    naturalEndMonth:
      naturalEndMonth,

    startSourceKind:
      parsedStart
        ? parsedStart.kind
        : 'invalid',

    funding:
      assetDepClean_(
        source.funding
      ),

    branch:
      assetDepClean_(
        source.branch
      ),

    operationId:
      assetDepClean_(
        source.operationId
      ),

    status:
      normalizedStatus,

    isInactive:
      isInactive,

    disposalStopMonth:
      disposalStopMonth,

    isCapitalized:
      total >=
      ASSET_DEPRECIATION_CONFIG
        .capitalizationLimit,

    valid:
      errors.length === 0,

    errors:
      errors
  };
}


/****************************************************
 * РОЗРАХУНОК ОДНОГО АКТИВУ
 * ЗА КОНКРЕТНИЙ МІСЯЦЬ
 ****************************************************/

function assetDepCalculateRecordForMonth_(
  record,
  period
) {
  const month =
    assetDepParsePeriod_(
      period
    );

  if (
    !record ||
    !record.valid ||
    !record.isCapitalized
  ) {
    return assetDepEmptyMonthResult_();
  }

  const startMonth =
    record.startMonth;

  /*
   * Місяць після завершення
   * природного строку.
   *
   * Наприклад:
   * останній місяць 12.2029;
   * exclusive = 01.2030.
   */
  const naturalEndExclusive =
    assetDepAddMonths_(
      record.naturalEndMonth,
      1
    );

  /*
   * Реальний кінець може настати раніше,
   * якщо актив вибув.
   */
  let effectiveEndExclusive =
    naturalEndExclusive;

  if (
    record.disposalStopMonth &&
    record.disposalStopMonth <
      effectiveEndExclusive
  ) {
    effectiveEndExclusive =
      record.disposalStopMonth;
  }

  const isWithinDepreciationPeriod =
    month >= startMonth &&
    month < effectiveEndExclusive;

  let monthlyDepreciation = 0;

  if (
    isWithinDepreciationPeriod
  ) {
    const monthIndex =
      assetDepMonthsBetween_(
        startMonth,
        month
      );

    /*
     * Стандартна місячна сума
     * округлюється до копійок.
     */
    const regularMonthly =
      assetDepRoundMoney_(
        record.total /
        record.usefulLifeMonths
      );

    /*
     * Останній природний місяць
     * коригує копійки так, щоб загальна
     * амортизація точно дорівнювала
     * первісній вартості.
     *
     * Це правило застосовується,
     * лише якщо актив не вибув раніше.
     */
    const isNaturalLastMonth =
      monthIndex ===
        record.usefulLifeMonths - 1 &&
      effectiveEndExclusive.getTime() ===
        naturalEndExclusive.getTime();

    monthlyDepreciation =
      isNaturalLastMonth
        ? assetDepRoundMoney_(
            record.total -
            regularMonthly *
              (
                record.usefulLifeMonths -
                1
              )
          )
        : regularMonthly;
  }

  const accumulatedMonths =
    assetDepCountDepreciatedMonthsThrough_(
      record,
      month,
      effectiveEndExclusive
    );

  const regularMonthly =
    assetDepRoundMoney_(
      record.total /
      record.usefulLifeMonths
    );

  let accumulatedDepreciation = 0;

  if (
    accumulatedMonths > 0
  ) {
    accumulatedDepreciation =
      accumulatedMonths >=
        record.usefulLifeMonths
        ? record.total
        : assetDepRoundMoney_(
            regularMonthly *
            accumulatedMonths
          );
  }

  accumulatedDepreciation =
    Math.min(
      record.total,
      assetDepRoundMoney_(
        accumulatedDepreciation
      )
    );

  /*
   * З місяця вибуття актив уже
   * не вважається таким,
   * що перебуває на балансі.
   */
  const disposedByPeriod =
    Boolean(
      record.disposalStopMonth &&
      month >=
        record.disposalStopMonth
    );

  /*
   * До місяця введення актив
   * ще не перебуває на балансі
   * у цьому розрахунку.
   */
  const startedByPeriod =
    month >= startMonth;

  const onBalance =
    startedByPeriod &&
    !disposedByPeriod;

  /*
   * Повністю замортизований,
   * але не вибулий актив залишається
   * на балансі з нульовою вартістю.
   */
  const bookValue =
    onBalance
      ? assetDepRoundMoney_(
          Math.max(
            0,
            record.total -
            accumulatedDepreciation
          )
        )
      : 0;

  return {
    monthlyDepreciation:
      assetDepRoundMoney_(
        monthlyDepreciation
      ),

    accumulatedDepreciation:
      accumulatedDepreciation,

    bookValue:
      bookValue,

    onBalance:
      onBalance
  };
}


/****************************************************
 * КІЛЬКІСТЬ НАРАХОВАНИХ МІСЯЦІВ
 * СТАНОМ НА ОБРАНИЙ ПЕРІОД
 ****************************************************/

function assetDepCountDepreciatedMonthsThrough_(
  record,
  periodMonth,
  effectiveEndExclusive
) {
  if (
    periodMonth <
    record.startMonth
  ) {
    return 0;
  }

  /*
   * Якщо звітний місяць уже після завершення,
   * беремо останній допустимий місяць.
   */
  const lastIncludedMonth =
    periodMonth <
      effectiveEndExclusive
      ? periodMonth
      : assetDepAddMonths_(
          effectiveEndExclusive,
          -1
        );

  if (
    lastIncludedMonth <
    record.startMonth
  ) {
    return 0;
  }

  return Math.min(
    record.usefulLifeMonths,

    assetDepMonthsBetween_(
      record.startMonth,
      lastIncludedMonth
    ) + 1
  );
}


/****************************************************
 * ПОРОЖНІЙ РЕЗУЛЬТАТ
 ****************************************************/

function assetDepEmptyMonthResult_() {
  return {
    monthlyDepreciation:
      0,

    accumulatedDepreciation:
      0,

    bookValue:
      0,

    onBalance:
      false
  };
}


/****************************************************
 * ЗАХИСНІ ПЕРЕВІРКИ ЗАЛЕЖНОСТЕЙ
 ****************************************************/

function assetDepAssertDependencies_() {
  if (
    typeof ASSET_MODULE_CONFIG ===
    'undefined'
  ) {
    throw new Error(
      'Не знайдено ASSET_MODULE_CONFIG. Спочатку встановіть 00_Assets_Core.gs.'
    );
  }

  if (
    typeof assertAssetModuleStep1Ready_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено assertAssetModuleStep1Ready_(). Крок 1 не встановлений.'
    );
  }

  if (
    typeof assetCoreParseStartDate_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено assetCoreParseStartDate_(). Правило історичного січня недоступне.'
    );
  }

  if (
    typeof findLastAssetDataRow_ !==
    'function'
  ) {
    throw new Error(
      'Не знайдено findLastAssetDataRow_(). Крок 1 не завершений.'
    );
  }

  assertAssetModuleStep1Ready_();

  return true;
}


/****************************************************
 * РОЗПІЗНАВАННЯ ПЕРІОДУ
 *
 * Приймає:
 * - Date;
 * - "MM.YYYY";
 * - "YYYY-MM".
 ****************************************************/

function assetDepParsePeriod_(
  value
) {
  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {
    return assetDepMonthStart_(
      value
    );
  }

  const text =
    assetDepClean_(
      value
    );

  /*
   * Формат MM.YYYY.
   */
  let match =
    text.match(
      /^([0-1]?\d)\.(\d{4})$/
    );

  if (match) {
    const month =
      Number(match[1]);

    const year =
      Number(match[2]);

    if (
      month >= 1 &&
      month <= 12
    ) {
      return new Date(
        year,
        month - 1,
        1
      );
    }
  }

  /*
   * Формат YYYY-MM.
   */
  match =
    text.match(
      /^(\d{4})-([0-1]?\d)$/
    );

  if (match) {
    const year =
      Number(match[1]);

    const month =
      Number(match[2]);

    if (
      month >= 1 &&
      month <= 12
    ) {
      return new Date(
        year,
        month - 1,
        1
      );
    }
  }

  throw new Error(
    'Некоректний період. Використайте Date, "MM.YYYY" або "YYYY-MM".'
  );
}


/****************************************************
 * РОЗПІЗНАВАННЯ ПОВНОЇ ДАТИ ВИБУТТЯ
 *
 * Значення лише з роком тут не допускається.
 ****************************************************/

function assetDepParseFullDate_(
  value
) {
  if (
    value === '' ||
    value === null ||
    value === undefined
  ) {
    return {
      valid:
        false,

      empty:
        true,

      date:
        null
    };
  }

  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {
    return {
      valid:
        true,

      empty:
        false,

      date:
        new Date(
          value.getFullYear(),
          value.getMonth(),
          value.getDate()
        )
    };
  }

  const text =
    assetDepClean_(
      value
    );

  const match =
    text.match(
      /^(\d{1,2})[.\/-](\d{1,2})[.\/-]((?:19|20|21)\d{2})$/
    );

  if (!match) {
    return {
      valid:
        false,

      empty:
        false,

      date:
        null
    };
  }

  const day =
    Number(match[1]);

  const month =
    Number(match[2]);

  const year =
    Number(match[3]);

  const date =
    new Date(
      year,
      month - 1,
      day
    );

  /*
   * Захист від автоматичного перенесення
   * некоректних дат JavaScript.
   *
   * Наприклад, 31.02 не повинно
   * перетворюватися на березень.
   */
  const exact =
    !isNaN(
      date.getTime()
    ) &&
    date.getFullYear() ===
      year &&
    date.getMonth() ===
      month - 1 &&
    date.getDate() ===
      day;

  return {
    valid:
      exact,

    empty:
      false,

    date:
      exact
        ? date
        : null
  };
}


/****************************************************
 * ПОЧАТОК МІСЯЦЯ
 ****************************************************/

function assetDepMonthStart_(
  date
) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1
  );
}


/****************************************************
 * ДОДАВАННЯ МІСЯЦІВ
 ****************************************************/

function assetDepAddMonths_(
  monthStart,
  months
) {
  return new Date(
    monthStart.getFullYear(),
    monthStart.getMonth() +
      Number(months || 0),
    1
  );
}


/****************************************************
 * РІЗНИЦЯ МІЖ МІСЯЦЯМИ
 ****************************************************/

function assetDepMonthsBetween_(
  startMonth,
  endMonth
) {
  return (
    (
      endMonth.getFullYear() -
      startMonth.getFullYear()
    ) * 12 +
    (
      endMonth.getMonth() -
      startMonth.getMonth()
    )
  );
}


/****************************************************
 * ФОРМАТ МІСЯЦЯ
 ****************************************************/

function assetDepFormatMonth_(
  date
) {
  return Utilities.formatDate(
    assetDepMonthStart_(
      date
    ),
    Session.getScriptTimeZone(),
    'MM.yyyy'
  );
}


/****************************************************
 * ОЧИЩЕННЯ ТЕКСТУ
 ****************************************************/

function assetDepClean_(
  value
) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  ).trim();
}


/****************************************************
 * ПЕРЕТВОРЕННЯ У ЧИСЛО
 *
 * Читає також значення:
 * - "2 шт";
 * - "6 000 грн";
 * - "5 років".
 ****************************************************/

function assetDepNumber_(
  value
) {
  if (
    typeof value === 'number'
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  const text =
    assetDepClean_(
      value
    )
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  if (!text) return 0;

  const number =
    Number(text);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}


/****************************************************
 * ОКРУГЛЕННЯ ГРОШЕЙ
 ****************************************************/

function assetDepRoundMoney_(
  value
) {
  const number =
    assetDepNumber_(
      value
    );

  return Math.round(
    (
      number +
      Number.EPSILON
    ) * 100
  ) / 100;
}


/****************************************************
 * СУМІСНА ОБГОРТКА СТАРОГО МОДУЛЯ
 *
 * Параметр sheet залишено для сумісності,
 * але новий модуль читає лист централізовано.
 ****************************************************/

function calculateAssetDepreciationStats_(
  sheet
) {
  const period =
    assetDepMonthStart_(
      new Date()
    );

  const monthSummary =
    calculateAssetDepreciationForPeriod_(
      period,
      {
        strict: true,
        includeRows: false
      }
    );

  return {
    monthlyDepreciation:
      monthSummary.monthlyDepreciation,

    annualDepreciation:
      calculateAssetDepreciationForYear_(
        period.getFullYear(),
        {
          strict: true
        }
      ),

    assetBalance:
      monthSummary.bookValue,

    /*
     * Стара назва залишена лише
     * для сумісності.
     */
    assetsOver10000:
      monthSummary.assetsOnBalance,

    capitalizedAssets:
      monthSummary.assetsOnBalance
  };
}


/****************************************************
 * ПОРОЖНЯ СТАТИСТИКА
 ****************************************************/

function emptyAssetStats_() {
  return {
    monthlyDepreciation:
      0,

    annualDepreciation:
      0,

    assetBalance:
      0,

    assetsOver10000:
      0,

    capitalizedAssets:
      0
  };
}


/****************************************************
 * СУМІСНІСТЬ ЗІ СТАРИМИ HELPER-ФУНКЦІЯМИ
 ****************************************************/

function cleanAssetValue_(
  value
) {
  return assetDepClean_(
    value
  );
}


function parseAssetNumber_(
  value
) {
  return assetDepNumber_(
    value
  );
}
/****************************************************
 * ПІДСУМОК РЕЄСТРУ АКТИВІВ СТАНОМ НА СЬОГОДНІ
 *
 * Не записує дані в таблицю.
 ****************************************************/

function calculateCurrentAssetSummary_() {
  assetDepAssertDependencies_();

  const currentMonth =
    assetDepMonthStart_(new Date());

  const periodSummary =
    calculateAssetDepreciationForPeriod_(
      currentMonth,
      {
        strict: true,
        includeRows: true
      }
    );

  /*
   * includedRows містить усі активи,
   * які перебувають на балансі,
   * включно з повністю замортизованими.
   */
  const onBalanceRows =
    periodSummary.includedRows.filter(
      item => item.onBalance
    );

  let originalCost = 0;
  let accumulatedDepreciation = 0;
  let bookValue = 0;
  let depreciatingAssets = 0;
  let fullyDepreciatedAssets = 0;

  onBalanceRows.forEach(item => {
    originalCost +=
      Number(item.total) || 0;

    accumulatedDepreciation +=
      Number(item.accumulatedDepreciation) || 0;

    bookValue +=
      Number(item.bookValue) || 0;

    if (
      Number(item.monthlyDepreciation) > 0
    ) {
      depreciatingAssets++;
    }

    if (
      Math.abs(
        Number(item.bookValue) || 0
      ) <= 0.01
    ) {
      fullyDepreciatedAssets++;
    }
  });

  return {
    calculationMonth:
      currentMonth,

    originalCost:
      assetDepRoundMoney_(originalCost),

    accumulatedDepreciation:
      assetDepRoundMoney_(
        accumulatedDepreciation
      ),

    bookValue:
      assetDepRoundMoney_(bookValue),

    currentMonthlyDepreciation:
      assetDepRoundMoney_(
        periodSummary.monthlyDepreciation
      ),

    assetsOnBalance:
      onBalanceRows.length,

    depreciatingAssets:
      depreciatingAssets,

    fullyDepreciatedAssets:
      fullyDepreciatedAssets,

    excludedBelowLimit:
      periodSummary.excludedBelowLimit,

    updatedAt:
      new Date(),

    issues:
      periodSummary.issues
  };
}
/****************************************************
 * ОНОВЛЕННЯ ПІДСУМКОВОГО БЛОКУ
 *
 * showToast:
 * true  — ручний запуск;
 * false — автоматичне фонове оновлення.
 ****************************************************/

function refreshAssetSummaryKpis_(showToast) {
  assetDepAssertDependencies_();

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(
      ASSET_DEPRECIATION_CONFIG.sheetName
    );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "Активи".'
    );
  }

  prepareAssetDepreciationStep4();

  const summary =
    calculateCurrentAssetSummary_();

  const values = [
    [summary.originalCost],
    [summary.accumulatedDepreciation],
    [summary.bookValue],
    [summary.currentMonthlyDepreciation],
    [summary.assetsOnBalance],
    [summary.depreciatingAssets],
    [summary.fullyDepreciatedAssets],
    [summary.excludedBelowLimit],
    [summary.updatedAt]
  ];

  sheet
    .getRange(
      ASSET_DEPRECIATION_CONFIG
        .kpi.firstRow,

      ASSET_DEPRECIATION_CONFIG
        .kpi.valueColumn,

      values.length,
      1
    )
    .setValues(values);

  sheet
    .getRange('N3:N6')
    .setNumberFormat('#,##0.00');

  sheet
    .getRange('N7:N10')
    .setNumberFormat('0');

  sheet
    .getRange('N11')
    .setNumberFormat('dd.MM.yyyy HH:mm');

  SpreadsheetApp.flush();

  if (showToast !== false) {
    SpreadsheetApp
      .getActive()
      .toast(
        'Підсумок активів оновлено',
        'Модуль "Активи"',
        6
      );
  }

  return summary;
}
/****************************************************
 * БЕЗПЕЧНЕ ФОНОВЕ ОНОВЛЕННЯ
 *
 * Помилка підсумкового блока не повинна
 * блокувати запис основної операції.
 ****************************************************/

function safeRefreshAssetSummary_() {
  try {
    return refreshAssetSummaryKpis_(
      false
    );
  } catch (error) {
    Logger.log(
      'Не вдалося оновити підсумок активів: ' +
      error.message
    );

    return null;
  }
}
/****************************************************
 * ОНОВЛЕННЯ ПІДСУМКУ ПРИ РУЧНІЙ ЗМІНІ
 * СТАТУСУ АБО ДАТИ ВИБУТТЯ
 ****************************************************/

function handleAssetSummaryEdit_(e) {
  if (
    !e ||
    !e.range
  ) {
    return;
  }

  const sheet =
    e.range.getSheet();

  if (
    sheet.getName() !==
    ASSET_DEPRECIATION_CONFIG.sheetName
  ) {
    return;
  }

  const firstRow =
    e.range.getRow();

  const lastRow =
    e.range.getLastRow();

  if (
    lastRow <
    ASSET_DEPRECIATION_CONFIG.startRow
  ) {
    return;
  }

  const firstColumn =
    e.range.getColumn();

  const lastColumn =
    e.range.getLastColumn();

  const touchesStatus =
    firstColumn <=
      ASSET_MODULE_CONFIG.columns.status &&
    lastColumn >=
      ASSET_MODULE_CONFIG.columns.status;

  const touchesDisposalDate =
    firstColumn <=
      ASSET_MODULE_CONFIG.columns.disposalDate &&
    lastColumn >=
      ASSET_MODULE_CONFIG.columns.disposalDate;

  if (
    !touchesStatus &&
    !touchesDisposalDate
  ) {
    return;
  }

  safeRefreshAssetSummary_();
}