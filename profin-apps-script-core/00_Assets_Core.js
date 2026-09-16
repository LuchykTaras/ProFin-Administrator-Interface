/****************************************************
 * PROFIN OS — АКТИВИ
 * КРОК 1. ЄДИНИЙ КОНТРАКТ ДАНИХ І БЕЗПЕЧНА ПЕРЕВІРКА
 *
 * Цей файл:
 * 1) не рахує амортизацію;
 * 2) не змінює наявні активи A:I;
 * 3) не змінює KPI у M:N;
 * 4) додає лише службові заголовки J:L;
 * 5) перевіряє готовність даних до наступних кроків.
 ****************************************************/

const ASSET_MODULE_CONFIG = Object.freeze({
  sheetName: 'Активи',
  baseSheetName: 'База операцій',

  headerRow: 2,
  startRow: 3,

  // Єдине управлінське правило ProFin OS.
  capitalizationLimit: 6000,

  // Історичні значення 2, 5, 7, 10 у колонці F є роками.
  usefulLifeUnit: 'YEARS',

  // У наступному кроці амортизація стартуватиме
  // з місяця введення активу в експлуатацію.
  firstMonthPolicy: 'FULL_MONTH',
  /*
 * Для історичних записів, де в колонці G вказано
 * лише рік, датою введення вважаємо 1 січня.
 */
  yearOnlyStartPolicy: 'JANUARY_1',
  yearOnlyStartMonthIndex: 0,
  yearOnlyStartDay: 1,
  columns: Object.freeze({
  name: 1,             // A Назва активу
  category: 2,         // B Категорія активу
  quantity: 3,         // C Кількість
  unitPrice: 4,        // D Ціна за одиницю
  total: 5,            // E Первісна загальна вартість
  usefulLifeYears: 6,  // F Строк амортизації, років
  startDate: 7,        // G Дата введення в експлуатацію
  funding: 8,          // H ФОП / грант / джерело фінансування
  branch: 9,           // I Філії
  operationId: 10,     // J ID операції з «Бази операцій»
  status: 11,          // K Статус активу
  disposalDate: 12     // L Дата вибуття
 }),

  technicalHeaders: Object.freeze([
    'ID операції',
    'Статус активу',
    'Дата вибуття'
  ]),

  statuses: Object.freeze([
    'Активний',
    'Проданий',
    'Списаний',
    'Вибув'
  ])
});


/****************************************************
 * ПУБЛІЧНИЙ ЗАПУСК КРОКУ 1
 ****************************************************/

function prepareAssetModuleStep1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const assetSheet = ss.getSheetByName(ASSET_MODULE_CONFIG.sheetName);
  const baseSheet = ss.getSheetByName(ASSET_MODULE_CONFIG.baseSheetName);

  if (!assetSheet) {
    throw new Error(
      'Не знайдено лист "' +
      ASSET_MODULE_CONFIG.sheetName +
      '"'
    );
  }

  if (!baseSheet) {
    throw new Error(
      'Не знайдено лист "' +
      ASSET_MODULE_CONFIG.baseSheetName +
      '"'
    );
  }

  /*
   * До будь-якого запису перевіряємо, що історичні
   * колонки A:I не були зміщені або перейменовані.
   */
  assertLegacyAssetSheetStructure_(assetSheet);

  /*
   * Додаємо службові колонки J:L.
   * KPI у M:N при цьому не переміщуються.
   */
  ensureAssetTechnicalColumns_(assetSheet);

  /*
   * Ставимо dropdown статусів і формат дати вибуття.
   */
  applyAssetStep1Validation_(assetSheet);

  /*
   * Після підготовки ще раз перевіряємо контракт.
   */
  assertAssetModuleStep1Ready_();

  /*
   * Формуємо аудит без автоматичного виправлення
   * історичних значень.
   */
  const report = buildAssetStep1Audit_(
    assetSheet,
    baseSheet
  );

  logAssetStep1Audit_(report);

  SpreadsheetApp.flush();

  SpreadsheetApp.getActive().toast(
    'Крок 1 завершено. Перевірено активів: ' +
      report.summary.assetRows,
    'Модуль "Активи"',
    8
  );

  return report;
}


/****************************************************
 * ПОВТОРНИЙ АУДИТ БЕЗ ЗМІНИ ЛИСТА
 ****************************************************/

function auditAssetModuleStep1() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const assetSheet = ss.getSheetByName(
    ASSET_MODULE_CONFIG.sheetName
  );
  const baseSheet = ss.getSheetByName(
    ASSET_MODULE_CONFIG.baseSheetName
  );

  if (!assetSheet) {
    throw new Error(
      'Не знайдено лист "' +
      ASSET_MODULE_CONFIG.sheetName +
      '"'
    );
  }

  if (!baseSheet) {
    throw new Error(
      'Не знайдено лист "' +
      ASSET_MODULE_CONFIG.baseSheetName +
      '"'
    );
  }

  assertLegacyAssetSheetStructure_(assetSheet);

  const report = buildAssetStep1Audit_(
    assetSheet,
    baseSheet
  );

  logAssetStep1Audit_(report);

  SpreadsheetApp.getActive().toast(
    'Аудит активів завершено. Деталі — у журналі виконання.',
    'Модуль "Активи"',
    8
  );

  return report;
}


/****************************************************
 * ПЕРЕВІРКА ІСТОРИЧНОЇ СТРУКТУРИ A:I
 ****************************************************/

/****************************************************
 * ПЕРЕВІРКА ІСТОРИЧНОЇ СТРУКТУРИ A:I
 *
 * Перевірка допускає узгоджені варіанти назв,
 * але не допускає зміщення колонок.
 ****************************************************/

function assertLegacyAssetSheetStructure_(sheet) {
  const headers = sheet
    .getRange(
      ASSET_MODULE_CONFIG.headerRow,
      1,
      1,
      9
    )
    .getDisplayValues()[0]
    .map(assetCoreNormalizeHeader_);

  const rules = [
    {
      column: 'A',
      ok:
        headers[0] === 'назва активу',
      expected:
        'Назва активу'
    },

    {
      column: 'B',
      ok:
        headers[1] === 'категорія активу',
      expected:
        'Категорія активу'
    },

    {
      column: 'C',
      ok:
        headers[2] === 'кількість',
      expected:
        'Кількість'
    },

    {
      column: 'D',
      ok:
        headers[3] === 'вартість' ||
        headers[3] === 'ціна за одиницю' ||
        (
          headers[3].indexOf('ціна') !== -1 &&
          headers[3].indexOf('одиниц') !== -1
        ),
      expected:
        'Ціна за одиницю'
    },

    {
      column: 'E',
      ok:
        headers[4] === 'сума' ||
        headers[4] === 'первісна вартість' ||
        (
          headers[4].indexOf('первісн') !== -1 &&
          headers[4].indexOf('вартіст') !== -1
        ),
      expected:
        'Первісна загальна вартість'
    },

    {
      column: 'F',
      ok:
        headers[5].indexOf(
          'строк амортизації'
        ) === 0,
      expected:
        'Строк амортизації'
    },

    {
      column: 'G',
      ok:
        headers[6].indexOf(
          'дата введення'
        ) === 0,
      expected:
        'Дата введення в експлуатацію'
    },

    {
      column: 'H',
      ok:
        headers[7].indexOf('фоп') !== -1 ||
        headers[7].indexOf('грант') !== -1 ||
        headers[7].indexOf(
          'джерело фінансування'
        ) !== -1,
      expected:
        'ФОП / грант / джерело фінансування'
    },

    {
      column: 'I',
      ok:
        headers[8].indexOf('філі') === 0,
      expected:
        'Філії'
    }
  ];

  const invalid = rules.filter(
    rule => !rule.ok
  );

  if (invalid.length) {
    throw new Error(
      'Структура листа "Активи" не відповідає очікуваній. ' +
      invalid
        .map(
          rule =>
            'колонка ' +
            rule.column +
            ': очікується "' +
            rule.expected +
            '"'
        )
        .join('; ')
    );
  }

  return true;
}
/****************************************************
 * ПЕРЕВІРКА СЛУЖБОВИХ ЗАГОЛОВКІВ J:L
 *
 * Дозволяє зберегти історичний заголовок J:
 * "ID операції «Бази операцій»".
 ****************************************************/

function assetCoreIsAllowedTechnicalHeader_(
  value,
  technicalIndex
) {
  const header =
    assetCoreNormalizeHeader_(value);

  /*
   * J — ID операції.
   */
  if (technicalIndex === 0) {
    if (header === 'id операції') {
      return true;
    }

    if (
      header.indexOf('id операції') !== -1 &&
      header.indexOf('баз') !== -1
    ) {
      return true;
    }

    return false;
  }

  /*
   * K — статус активу.
   */
  if (technicalIndex === 1) {
    return (
      header === 'статус активу' ||
      header.indexOf('статус актив') === 0
    );
  }

  /*
   * L — дата вибуття.
   */
  if (technicalIndex === 2) {
    return (
      header === 'дата вибуття' ||
      header.indexOf('дата вибут') === 0
    );
  }

  return false;
}

/****************************************************
 * ДОДАВАННЯ СЛУЖБОВИХ КОЛОНОК J:L
 *
 * ВАЖЛИВО:
 * - колонки не вставляються всередину таблиці;
 * - KPI у M:N не зміщуються;
 * - чужий непорожній заголовок не перезаписується.
 ****************************************************/

/****************************************************
 * ДОДАВАННЯ СЛУЖБОВИХ КОЛОНОК J:L
 *
 * ВАЖЛИВО:
 * - не вставляє колонки всередину таблиці;
 * - не зміщує KPI;
 * - не перезаписує прийнятний історичний заголовок;
 * - заповнює тільки порожні службові заголовки.
 ****************************************************/

function ensureAssetTechnicalColumns_(sheet) {
  const requiredColumnCount =
    ASSET_MODULE_CONFIG.columns.disposalDate;

  if (
    sheet.getMaxColumns() <
    requiredColumnCount
  ) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      requiredColumnCount -
        sheet.getMaxColumns()
    );
  }

  const startColumn =
    ASSET_MODULE_CONFIG.columns.operationId;

  const expected =
    ASSET_MODULE_CONFIG.technicalHeaders.slice();

  const current = sheet
    .getRange(
      ASSET_MODULE_CONFIG.headerRow,
      startColumn,
      1,
      expected.length
    )
    .getDisplayValues()[0]
    .map(assetCoreClean_);

  current.forEach((value, index) => {
    /*
     * Якщо заголовок уже є — перевіряємо,
     * але не перезаписуємо його.
     */
    if (value) {
      if (
        !assetCoreIsAllowedTechnicalHeader_(
          value,
          index
        )
      ) {
        throw new Error(
          'Крок 1 зупинено: клітинка ' +
          assetCoreColumnToLetter_(
            startColumn + index
          ) +
          ASSET_MODULE_CONFIG.headerRow +
          ' уже містить заголовок "' +
          value +
          '". Він не відповідає структурі модуля активів.'
        );
      }

      return;
    }

    /*
     * Заповнюємо лише порожню клітинку.
     */
    sheet
      .getRange(
        ASSET_MODULE_CONFIG.headerRow,
        startColumn + index
      )
      .setValue(expected[index]);
  });

  sheet
    .getRange(
      ASSET_MODULE_CONFIG.headerRow,
      ASSET_MODULE_CONFIG.columns.operationId
    )
    .setNote(
      'ID відповідної операції з листа "База операцій".'
    );

  sheet
    .getRange(
      ASSET_MODULE_CONFIG.headerRow,
      ASSET_MODULE_CONFIG.columns.status
    )
    .setNote(
      'Порожній статус історичного запису тимчасово вважається активним.'
    );

  sheet
    .getRange(
      ASSET_MODULE_CONFIG.headerRow,
      ASSET_MODULE_CONFIG.columns.disposalDate
    )
    .setNote(
      'Дата, з місяця якої актив більше не амортизується.'
    );
}


/****************************************************
 * ВАЛІДАЦІЯ СТАТУСУ І ФОРМАТ ДАТИ ВИБУТТЯ
 ****************************************************/

function applyAssetStep1Validation_(sheet) {
  const rowCount = Math.max(
    sheet.getMaxRows() -
      ASSET_MODULE_CONFIG.startRow +
      1,
    1
  );

  const statusRule =
    SpreadsheetApp.newDataValidation()
      .requireValueInList(
        ASSET_MODULE_CONFIG.statuses.slice(),
        true
      )
      /*
       * Історичні порожні статуси не блокуємо.
       * На наступних етапах порожній статус
       * тимчасово трактуватиметься як активний.
       */
      .setAllowInvalid(true)
      .build();

  sheet
    .getRange(
      ASSET_MODULE_CONFIG.startRow,
      ASSET_MODULE_CONFIG.columns.status,
      rowCount,
      1
    )
    .setDataValidation(statusRule);

  sheet
    .getRange(
      ASSET_MODULE_CONFIG.startRow,
      ASSET_MODULE_CONFIG.columns.disposalDate,
      rowCount,
      1
    )
    .setNumberFormat('dd.MM.yyyy');
}


/****************************************************
 * ЗАХИСНА ПЕРЕВІРКА ДЛЯ МАЙБУТНІХ КРОКІВ
 ****************************************************/

/****************************************************
 * ЗАХИСНА ПЕРЕВІРКА ГОТОВНОСТІ КРОКУ 1
 ****************************************************/

function assertAssetModuleStep1Ready_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet = ss.getSheetByName(
    ASSET_MODULE_CONFIG.sheetName
  );

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' +
      ASSET_MODULE_CONFIG.sheetName +
      '"'
    );
  }

  /*
   * Перевіряємо основні колонки A:I.
   */
  assertLegacyAssetSheetStructure_(sheet);

  /*
   * Перевіряємо службові колонки J:L.
   */
  const actual = sheet
    .getRange(
      ASSET_MODULE_CONFIG.headerRow,
      ASSET_MODULE_CONFIG.columns.operationId,
      1,
      ASSET_MODULE_CONFIG.technicalHeaders.length
    )
    .getDisplayValues()[0]
    .map(assetCoreClean_);

  const columnNames = [
    'J',
    'K',
    'L'
  ];

  for (
    let i = 0;
    i < actual.length;
    i++
  ) {
    if (!actual[i]) {
      throw new Error(
        'Модуль активів не готовий: клітинка ' +
        columnNames[i] +
        ASSET_MODULE_CONFIG.headerRow +
        ' не містить службового заголовка.'
      );
    }

    if (
      !assetCoreIsAllowedTechnicalHeader_(
        actual[i],
        i
      )
    ) {
      throw new Error(
        'Модуль активів не готовий: заголовок у клітинці ' +
        columnNames[i] +
        ASSET_MODULE_CONFIG.headerRow +
        ' має непідтримуване значення "' +
        actual[i] +
        '".'
      );
    }
  }

  return true;
}


/****************************************************
 * АУДИТ ПОТОЧНИХ АКТИВІВ
 ****************************************************/

function buildAssetStep1Audit_(
  assetSheet,
  baseSheet
) {
  const lastDataRow =
    findLastAssetDataRow_(assetSheet);

  const report = {
    config: {
      capitalizationLimit:
        ASSET_MODULE_CONFIG.capitalizationLimit,

      usefulLifeUnit:
        ASSET_MODULE_CONFIG.usefulLifeUnit,

      firstMonthPolicy:
        ASSET_MODULE_CONFIG.firstMonthPolicy,

      yearOnlyStartPolicy:
        ASSET_MODULE_CONFIG.yearOnlyStartPolicy,

      yearOnlyResolvedAs:
        '01.01 відповідного року'
    },

    summary: {
      assetRows: 0,
      assetsFrom6000: 0,
      assetsBelow6000: 0,
      invalidOrMissingTotal: 0,
      invalidQuantity: 0,
      invalidUsefulLife: 0,
      fullStartDates: 0,
      yearOnlyStartValues: 0,
      invalidStartDates: 0,
      missingOperationId: 0,
      blankStatus: 0,
      totalMismatchRows: 0,
      duplicateOperationIds: 0
    },

    rows: {
      below6000: [],
      invalidTotals: [],
      invalidQuantities: [],
      invalidUsefulLives: [],
      yearOnlyDates: [],
      invalidDates: [],
      missingOperationIds: [],
      blankStatuses: [],
      totalMismatches: [],
      duplicateOperationIds: []
    },

    baseOperations:
      auditBaseAssetHeadersStep1_(baseSheet)
  };


  if (
    lastDataRow <
    ASSET_MODULE_CONFIG.startRow
  ) {
    return report;
  }

  const rowCount =
    lastDataRow -
    ASSET_MODULE_CONFIG.startRow +
    1;

  const data = assetSheet
    .getRange(
      ASSET_MODULE_CONFIG.startRow,
      1,
      rowCount,
      ASSET_MODULE_CONFIG.columns.disposalDate
    )
    .getValues();

  const operationIdRows = {};

  data.forEach((row, index) => {
    const sheetRow =
      ASSET_MODULE_CONFIG.startRow +
      index;

    const name = assetCoreClean_(
      row[
        ASSET_MODULE_CONFIG.columns.name - 1
      ]
    );

    if (!name) return;

    report.summary.assetRows++;

    const quantity =
      assetCoreParseNumber_(
        row[
          ASSET_MODULE_CONFIG.columns.quantity - 1
        ]
      );

    const unitPrice = Math.abs(
      assetCoreParseNumber_(
        row[
          ASSET_MODULE_CONFIG.columns.unitPrice - 1
        ]
      )
    );

    const storedTotal = Math.abs(
      assetCoreParseNumber_(
        row[
          ASSET_MODULE_CONFIG.columns.total - 1
        ]
      )
    );

    const usefulLifeYears =
      assetCoreParseNumber_(
        row[
          ASSET_MODULE_CONFIG.columns.usefulLifeYears -
            1
        ]
      );

    const operationId =
      assetCoreClean_(
        row[
          ASSET_MODULE_CONFIG.columns.operationId - 1
        ]
      );

    const status =
      assetCoreClean_(
        row[
          ASSET_MODULE_CONFIG.columns.status - 1
        ]
      );

    /*
     * Перевірка кількості.
     */
    if (!(quantity > 0)) {
      report.summary.invalidQuantity++;

      report.rows.invalidQuantities.push(
        sheetRow
      );
    }

    /*
     * Перевірка первісної вартості.
     */
    if (!(storedTotal > 0)) {
      report.summary.invalidOrMissingTotal++;

      report.rows.invalidTotals.push(
        sheetRow
      );
    } else if (
      storedTotal >=
      ASSET_MODULE_CONFIG.capitalizationLimit
    ) {
      report.summary.assetsFrom6000++;
    } else {
      report.summary.assetsBelow6000++;

      report.rows.below6000.push({
        row: sheetRow,
        name: name,
        total: storedTotal
      });
    }

    /*
     * Перевірка строку амортизації.
     */
    if (!(usefulLifeYears > 0)) {
      report.summary.invalidUsefulLife++;

      report.rows.invalidUsefulLives.push(
        sheetRow
      );
    }

    /*
     * Перевірка дати введення.
     */
    const parsedStart =
      assetCoreParseStartDate_(
        row[
          ASSET_MODULE_CONFIG.columns.startDate - 1
        ]
      );

    if (parsedStart.kind === 'date') {
      report.summary.fullStartDates++;
    } else if (
      parsedStart.kind === 'year'
    ) {
      report.summary.yearOnlyStartValues++;

      report.rows.yearOnlyDates.push({
        row: sheetRow,
        name: name,
        year: parsedStart.year
      });
    } else {
      report.summary.invalidStartDates++;

      report.rows.invalidDates.push({
        row: sheetRow,
        name: name,
        value:
          row[
            ASSET_MODULE_CONFIG.columns.startDate - 1
          ]
      });
    }

    /*
     * Перевірка зв'язку з Базою операцій.
     */
    if (!operationId) {
      report.summary.missingOperationId++;

      report.rows.missingOperationIds.push(
        sheetRow
      );
    } else {
      if (!operationIdRows[operationId]) {
        operationIdRows[operationId] = [];
      }

      operationIdRows[operationId].push(
        sheetRow
      );
    }

    /*
     * Історичні статуси поки не заповнюємо
     * автоматично.
     */
    if (!status) {
      report.summary.blankStatus++;

      report.rows.blankStatuses.push(
        sheetRow
      );
    }

    /*
     * Перевірка:
     * кількість × ціна одиниці = загальна сума.
     *
     * На кроці 1 помилки лише фіксуються.
     */
    if (
      quantity > 0 &&
      unitPrice > 0 &&
      storedTotal > 0
    ) {
      const calculatedTotal =
        quantity * unitPrice;

      const difference = Math.abs(
        calculatedTotal - storedTotal
      );

      if (difference > 0.01) {
        report.summary.totalMismatchRows++;

        report.rows.totalMismatches.push({
          row: sheetRow,
          name: name,
          quantity: quantity,
          unitPrice: unitPrice,
          calculatedTotal: calculatedTotal,
          storedTotal: storedTotal
        });
      }
    }
  });

  /*
   * Пошук дублів ID операції.
   */
  Object.keys(operationIdRows).forEach(
    operationId => {
      if (
        operationIdRows[operationId].length >
        1
      ) {
        report.summary.duplicateOperationIds++;

        report.rows.duplicateOperationIds.push({
          operationId: operationId,
          rows: operationIdRows[operationId]
        });
      }
    }
  );

  return report;
}


/****************************************************
 * ПЕРЕВІРКА ЗАГОЛОВКІВ АКТИВІВ
 * У "БАЗІ ОПЕРАЦІЙ"
 ****************************************************/

function auditBaseAssetHeadersStep1_(baseSheet) {
  const values = baseSheet
    .getRange(
      1,
      26,
      1,
      4
    ) // Z:AC
    .getDisplayValues()[0]
    .map(assetCoreClean_);

  const warnings = [];

  if (values[0] !== 'Назва активу') {
    warnings.push(
      'Z1 має містити "Назва активу".'
    );
  }

  if (
    values[1] !== 'Категорія активу'
  ) {
    warnings.push(
      'AA1 має містити "Категорія активу".'
    );
  }

  if (
    assetCoreNormalizeHeader_(
      values[2]
    ).indexOf('строк амортизації') !== 0
  ) {
    warnings.push(
      'AB1 має містити заголовок строку амортизації.'
    );
  }

  if (
    assetCoreNormalizeHeader_(
      values[2]
    ).indexOf('міс') !== -1
  ) {
    warnings.push(
      'AB1 зараз позначений у місяцях, але фактичні історичні значення ' +
      'і поле форми використовують роки. Це буде виправлено у кроці 2.'
    );
  }

  if (
    assetCoreNormalizeHeader_(
      values[3]
    ).indexOf('дата введення') !== 0
  ) {
    warnings.push(
      'AC1 має містити "Дата введення в експлуатацію".'
    );
  }

  return {
    headers: {
      Z: values[0],
      AA: values[1],
      AB: values[2],
      AC: values[3]
    },
    warnings: warnings
  };
}


/****************************************************
 * ЖУРНАЛ АУДИТУ
 ****************************************************/

function logAssetStep1Audit_(report) {
  Logger.log(
    '=== PROFIN OS / АКТИВИ / КРОК 1 ==='
  );

  Logger.log(
    JSON.stringify(
      report,
      null,
      2
    )
  );

  const summary = report.summary;

  Logger.log(
    'Підсумок: активів=' +
      summary.assetRows +
      '; від 6000=' +
      summary.assetsFrom6000 +
      '; до 6000=' +
      summary.assetsBelow6000 +
      '; повних дат=' +
      summary.fullStartDates +
      '; лише рік=' +
      summary.yearOnlyStartValues +
      '; розбіжностей сума/кількість×ціна=' +
      summary.totalMismatchRows
  );

  if (
    report.baseOperations.warnings.length
  ) {
    Logger.log(
      'Попередження по "Базі операцій":\n' +
      report.baseOperations.warnings.join(
        '\n'
      )
    );
  }
}


/****************************************************
 * ВИЗНАЧЕННЯ ОСТАННЬОГО РЯДКА АКТИВІВ
 * ЗА КОЛОНКОЮ A
 *
 * Не використовуємо getLastRow() як межу даних,
 * бо нижче таблиці та праворуч є KPI і службові значення.
 ****************************************************/

function findLastAssetDataRow_(sheet) {
  const physicalLastRow = Math.max(
    sheet.getLastRow(),
    ASSET_MODULE_CONFIG.startRow
  );

  const values = sheet
    .getRange(
      ASSET_MODULE_CONFIG.startRow,
      ASSET_MODULE_CONFIG.columns.name,
      physicalLastRow -
        ASSET_MODULE_CONFIG.startRow +
        1,
      1
    )
    .getDisplayValues()
    .flat();

  for (
    let i = values.length - 1;
    i >= 0;
    i--
  ) {
    if (assetCoreClean_(values[i])) {
      return (
        ASSET_MODULE_CONFIG.startRow + i
      );
    }
  }

  return (
    ASSET_MODULE_CONFIG.startRow - 1
  );
}


/****************************************************
 * ДОПОМІЖНІ ФУНКЦІЇ З УНІКАЛЬНИМИ НАЗВАМИ
 *
 * Не конфліктують з наявними:
 * - clean_()
 * - numOrBlank_()
 * - cleanAssetValue_()
 * - parseAssetNumber_()
 ****************************************************/

function assetCoreClean_(value) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  ).trim();
}


function assetCoreNormalizeHeader_(value) {
  return assetCoreClean_(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


function assetCoreParseNumber_(value) {
  if (typeof value === 'number') {
    return isFinite(value)
      ? value
      : 0;
  }

  const text = assetCoreClean_(value)
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');

  if (!text) return 0;

  const number = Number(text);

  return isFinite(number)
    ? number
    : 0;
}


/****************************************************
 * РОЗПІЗНАВАННЯ ДАТИ ВВЕДЕННЯ
 *
 * Повертає:
 * - kind: "date" — повна дата;
 * - kind: "year" — записано лише рік;
 * - kind: "invalid" — дата відсутня або некоректна.
 ****************************************************/

/****************************************************
 * РОЗПІЗНАВАННЯ ДАТИ ВВЕДЕННЯ
 *
 * Правила:
 *
 * 1. Повна дата зберігається без змін.
 *
 * 2. Якщо вказано лише рік:
 *    2025 → 01.01.2025.
 *
 * 3. Поле kind зберігає походження дати:
 *    - "date" — користувач указав повну дату;
 *    - "year" — була застосована домовленість
 *      про 1 січня відповідного року;
 *    - "invalid" — значення не розпізнано.
 *
 * В обох коректних випадках властивість date
 * містить готову дату для розрахунку амортизації.
 ****************************************************/

function assetCoreParseStartDate_(value) {
  /*
   * Повноцінне значення Date з Google Sheets.
   */
  if (
    value instanceof Date &&
    !isNaN(value.getTime())
  ) {
    return {
      kind: 'date',
      date: new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate()
      ),
      assumedJanuary: false,
      sourceValue: value
    };
  }

  /*
   * Число 2025 у клітинці.
   */
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1900 &&
    value <= 2200
  ) {
    const year = value;

    return {
      kind: 'year',
      year: year,
      date: new Date(
        year,
        ASSET_MODULE_CONFIG.yearOnlyStartMonthIndex,
        ASSET_MODULE_CONFIG.yearOnlyStartDay
      ),
      assumedJanuary: true,
      sourceValue: value
    };
  }

  const text = assetCoreClean_(value);

  /*
   * Текстове значення "2025".
   */
  if (
    /^(19|20|21)\d{2}$/.test(text)
  ) {
    const year = Number(text);

    return {
      kind: 'year',
      year: year,
      date: new Date(
        year,
        ASSET_MODULE_CONFIG.yearOnlyStartMonthIndex,
        ASSET_MODULE_CONFIG.yearOnlyStartDay
      ),
      assumedJanuary: true,
      sourceValue: value
    };
  }

  /*
   * Повна текстова дата:
   * 01.07.2026
   * 01/07/2026
   * 01-07-2026
   */
  const match = text.match(
    /^(\d{1,2})[.\/-](\d{1,2})[.\/-]((?:19|20|21)\d{2})$/
  );

  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);

    const date = new Date(
      year,
      month - 1,
      day
    );

    /*
     * JavaScript може автоматично перетворити,
     * наприклад, 31.02 на дату в березні.
     * Тому перевіряємо точний збіг компонентів.
     */
    const isExactDate =
      !isNaN(date.getTime()) &&
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;

    if (isExactDate) {
      return {
        kind: 'date',
        date: date,
        assumedJanuary: false,
        sourceValue: value
      };
    }
  }

  return {
    kind: 'invalid',
    date: null,
    assumedJanuary: false,
    sourceValue: value
  };
}


/****************************************************
 * НОМЕР КОЛОНКИ → ЛІТЕРА
 *
 * Наприклад:
 * 1  → A
 * 10 → J
 * 27 → AA
 ****************************************************/

function assetCoreColumnToLetter_(column) {
  let value =
    Number(column) || 0;

  let result = '';

  while (value > 0) {
    const remainder =
      (value - 1) % 26;

    result =
      String.fromCharCode(
        65 + remainder
      ) + result;

    value = Math.floor(
      (value - 1) / 26
    );
  }

  return result;
}
/****************************************************
 * ТЕСТ ПРАВИЛА ІСТОРИЧНИХ РОКІВ
 *
 * Нічого не записує в таблицю.
 * Лише перевіряє результат у журналі.
 ****************************************************/

function testAssetJanuaryStartRule() {
  const testCases = [
    {
      input: 2025,
      expected: '01.01.2025'
    },
    {
      input: '2020',
      expected: '01.01.2020'
    },
    {
      input: new Date(2026, 6, 17),
      expected: '17.07.2026'
    }
  ];

  const results = testCases.map(testCase => {
    const parsed =
      assetCoreParseStartDate_(
        testCase.input
      );

    const actual =
      parsed.date instanceof Date &&
      !isNaN(parsed.date.getTime())
        ? Utilities.formatDate(
            parsed.date,
            Session.getScriptTimeZone(),
            'dd.MM.yyyy'
          )
        : 'INVALID';

    return {
      input: String(testCase.input),
      kind: parsed.kind,
      assumedJanuary:
        parsed.assumedJanuary,
      expected: testCase.expected,
      actual: actual,
      ok: actual === testCase.expected
    };
  });

  const failed = results.filter(
    result => !result.ok
  );

  Logger.log(
    JSON.stringify(
      results,
      null,
      2
    )
  );

  if (failed.length) {
    throw new Error(
      'Тест правила січня не пройдено. Помилок: ' +
      failed.length
    );
  }

  SpreadsheetApp.getActive().toast(
    'Правило січня перевірено успішно',
    'Модуль "Активи"',
    6
  );

  return results;
}