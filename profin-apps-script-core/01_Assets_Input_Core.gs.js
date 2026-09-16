/****************************************************
 * PROFIN OS — АКТИВИ
 * КРОК 2. БЕЗПЕЧНИЙ ЗАПИС ЧЕРЕЗ "ВВІД ОПЕРАЦІЙ"
 *
 * Залежності:
 * - 00_Assets_Core.gs
 * - inputOperations.gs
 ****************************************************/


/****************************************************
 * ПІДГОТОВКА КРОКУ 2
 *
 * Не створює активи.
 * Не змінює історичні рядки.
 ****************************************************/

function prepareAssetInputStep2() {
  if (
    typeof ASSET_MODULE_CONFIG === 'undefined'
  ) {
    throw new Error(
      'Не знайдено ASSET_MODULE_CONFIG. ' +
      'Спочатку встановіть і перевірте 00_Assets_Core.gs.'
    );
  }

  if (
    typeof assertAssetModuleStep1Ready_ !== 'function'
  ) {
    throw new Error(
      'Не знайдено assertAssetModuleStep1Ready_(). ' +
      'Крок 1 модуля активів не встановлений.'
    );
  }

  assertAssetModuleStep1Ready_();

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(INPUT_SHEET_NAME);

  const baseSheet =
    ss.getSheetByName(BASE_SHEET_NAME);

  const assetSheet =
    ss.getSheetByName(ASSETS_SHEET_NAME);

  if (!inputSheet) {
    throw new Error(
      'Не знайдено лист "Ввід операцій".'
    );
  }

  if (!baseSheet) {
    throw new Error(
      'Не знайдено лист "База операцій".'
    );
  }

  if (!assetSheet) {
    throw new Error(
      'Не знайдено лист "Активи".'
    );
  }

  /*
   * Перевіряємо, що AB1 справді є колонкою строку,
   * а не випадково зміщеною колонкою.
   */
  const currentHeader =
    assetInputNormalizeHeader_(
      baseSheet
        .getRange('AB1')
        .getDisplayValue()
    );

  if (
    currentHeader.indexOf(
      'строк амортизації'
    ) !== 0
  ) {
    throw new Error(
      'Крок 2 зупинено: AB1 не є колонкою строку амортизації. ' +
      'Поточне значення: "' +
      baseSheet.getRange('AB1').getDisplayValue() +
      '".'
    );
  }

  /*
   * Стандартизуємо одиницю виміру.
   */
  baseSheet
    .getRange('AB1')
    .setValue('Строк амортизації, років')
    .setNote(
      'У колонці зберігається строк корисного використання у роках.'
    );

  /*
   * Строк амортизації у формі.
   */
  inputSheet
    .getRange(INPUT.assetAmortization)
    .clearDataValidations()
    .setNumberFormat('0')
    .setDataValidation(
      SpreadsheetApp
        .newDataValidation()
        .requireNumberGreaterThan(0)
        .setAllowInvalid(false)
        .build()
    )
    .setNote(
      'Строк корисного використання у повних роках.'
    );

  /*
   * Дата введення нового активу має бути повною датою.
   * Правило "1 січня" застосовується лише до історичних
   * записів, де вже був указаний тільки рік.
   */
  inputSheet
    .getRange(INPUT.assetStartDate)
    .clearDataValidations()
    .setNumberFormat('dd.MM.yyyy')
    .setDataValidation(
      SpreadsheetApp
        .newDataValidation()
        .requireDate()
        .setAllowInvalid(false)
        .build()
    )
    .setNote(
      'Для нового активу вкажіть повну дату введення в експлуатацію.'
    );

  inputSheet
    .getRange(INPUT.category)
    .setNote(
      'Для активу можна вибрати наявну категорію або ввести нову.'
    );

  inputSheet
    .getRange(INPUT.article)
    .setNote(
      'Для активу можна вибрати наявну назву або ввести нову.'
    );

  /*
   * Перебудовуємо dropdown після заміни функцій.
   */
  updateInputDependentDropdowns();

  assertAssetInputStep2Ready_();

  SpreadsheetApp.flush();

  SpreadsheetApp.getActive().toast(
    'Крок 2 підготовлено. Запустіть testAssetInputStep2.',
    'Модуль "Активи"',
    8
  );
}


/****************************************************
 * ПЕРЕВІРКА ГОТОВНОСТІ ДО ЗАПИСУ
 ****************************************************/

function assertAssetInputStep2Ready_() {
  assertAssetModuleStep1Ready_();

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(INPUT_SHEET_NAME);

  const baseSheet =
    ss.getSheetByName(BASE_SHEET_NAME);

  const assetSheet =
    ss.getSheetByName(ASSETS_SHEET_NAME);

  if (!inputSheet) {
    throw new Error(
      'Не знайдено лист "Ввід операцій".'
    );
  }

  if (!baseSheet) {
    throw new Error(
      'Не знайдено лист "База операцій".'
    );
  }

  if (!assetSheet) {
    throw new Error(
      'Не знайдено лист "Активи".'
    );
  }

  const baseHeader =
    assetInputNormalizeHeader_(
      baseSheet
        .getRange('AB1')
        .getDisplayValue()
    );

  if (
    baseHeader.indexOf(
      'строк амортизації'
    ) !== 0 ||
    baseHeader.indexOf('рок') === -1
  ) {
    throw new Error(
      'AB1 має містити "Строк амортизації, років".'
    );
  }

  /*
   * Перевіряємо доступність полів форми.
   */
  [
    INPUT.type,
    INPUT.category,
    INPUT.article,
    INPUT.unitPrice,
    INPUT.quantity,
    INPUT.amount,
    INPUT.assetName,
    INPUT.assetCategory,
    INPUT.assetAmortization,
    INPUT.assetStartDate
  ].forEach(a1 => {
    inputSheet.getRange(a1);
  });

  return true;
}


/****************************************************
 * НОРМАЛІЗАЦІЯ ДАНИХ АКТИВУ
 *
 * Єдине джерело назв:
 * B7 Категорія → assetCategory
 * B8 Стаття    → assetName
 ****************************************************/

function normalizeAssetInputData_(data) {
  if (!data || data.type !== 'Актив') {
    return data;
  }

  const name =
    assetInputClean_(data.article) ||
    assetInputClean_(data.assetName);

  const category =
    assetInputClean_(data.category) ||
    assetInputClean_(data.assetCategory);

  data.article = name;
  data.assetName = name;

  data.category = category;
  data.assetCategory = category;

  let quantity =
    assetInputNumber_(data.quantity);

  if (!(quantity > 0)) {
    quantity = 1;
  }

  let unitPrice = Math.abs(
    assetInputNumber_(data.unitPrice)
  );

  let total = Math.abs(
    assetInputNumber_(data.amount)
  );

  /*
   * Якщо сума не вказана, але є ціна і кількість.
   */
  if (
    !(total > 0) &&
    unitPrice > 0 &&
    quantity > 0
  ) {
    total =
      unitPrice * quantity;
  }

  /*
   * Якщо є загальна сума, але не вказана ціна одиниці.
   */
  if (
    !(unitPrice > 0) &&
    total > 0 &&
    quantity > 0
  ) {
    unitPrice =
      total / quantity;
  }

  data.quantity = quantity;
  data.unitPrice =
    assetInputRoundMoney_(unitPrice);
  data.amount =
    assetInputRoundMoney_(total);

  data.assetAmortization =
    assetInputNumber_(
      data.assetAmortization
    );

  return data;
}


/****************************************************
 * ВАЛІДАЦІЯ АКТИВУ
 ****************************************************/

function validateAssetInputData_(data) {
  normalizeAssetInputData_(data);

  const errors = [];
  const warnings = [];

  const limit =
    ASSET_MODULE_CONFIG.capitalizationLimit;

  const quantity =
    assetInputNumber_(data.quantity);

  const unitPrice =
    Math.abs(
      assetInputNumber_(data.unitPrice)
    );

  const total =
    Math.abs(
      assetInputNumber_(data.amount)
    );

  const usefulLifeYears =
    assetInputNumber_(
      data.assetAmortization
    );

  if (!assetInputClean_(data.assetName)) {
    errors.push(
      'Для активу потрібна назва'
    );
  }

  if (!assetInputClean_(data.assetCategory)) {
    errors.push(
      'Для активу потрібна категорія'
    );
  }

  if (
    !Number.isInteger(quantity) ||
    quantity <= 0
  ) {
    errors.push(
      'Кількість активів має бути цілим додатним числом'
    );
  }

  if (!(unitPrice > 0)) {
    errors.push(
      'Для активу потрібна додатна ціна за одиницю'
    );
  }

  if (!(total > 0)) {
    errors.push(
      'Для активу потрібна загальна вартість'
    );
  }

  if (
    total > 0 &&
    total < limit
  ) {
    errors.push(
      'Актив має коштувати не менше ' +
      limit +
      ' грн. Меншу суму проведіть як операційну витрату.'
    );
  }

  if (
    quantity > 0 &&
    unitPrice > 0 &&
    total > 0
  ) {
    const calculatedTotal =
      quantity * unitPrice;

    if (
      Math.abs(
        calculatedTotal - total
      ) > 0.01
    ) {
      errors.push(
        'Загальна вартість активу не збігається: ' +
        'ціна за одиницю × кількість'
      );
    }
  }

  if (
    !Number.isInteger(usefulLifeYears) ||
    usefulLifeYears <= 0
  ) {
    errors.push(
      'Строк амортизації має бути вказаний у повних роках'
    );
  }

  if (usefulLifeYears > 100) {
    errors.push(
      'Строк амортизації не може перевищувати 100 років'
    );
  }

  if (
    !assetInputIsValidDate_(
      data.assetStartDate
    )
  ) {
    errors.push(
      'Для нового активу потрібна повна коректна дата введення в експлуатацію'
    );
  }

  return {
    errors: errors,
    warnings: warnings
  };
}


/****************************************************
 * УНІКАЛЬНИЙ ID ДЛЯ АКТИВУ
 ****************************************************/

function generateUniqueAssetOperationId_(
  operationDate
) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    ss.getSheetByName(BASE_SHEET_NAME);

  const assetSheet =
    ss.getSheetByName(ASSETS_SHEET_NAME);

  const baseIds =
    assetInputReadIdSet_(
      baseSheet,
      1,
      2
    );

  const assetIds =
    assetInputReadIdSet_(
      assetSheet,
      ASSET_MODULE_CONFIG.columns.operationId,
      ASSET_MODULE_CONFIG.startRow
    );

  for (
    let attempt = 0;
    attempt < 30;
    attempt++
  ) {
    const candidate =
      generateOperationId_(
        'Актив',
        operationDate
      );

    if (
      !baseIds.has(candidate) &&
      !assetIds.has(candidate)
    ) {
      return candidate;
    }
  }

  throw new Error(
    'Не вдалося сформувати унікальний ID активу після 30 спроб.'
  );
}


/****************************************************
 * ПОШУК НАСТУПНОГО БЕЗПЕЧНОГО РЯДКА
 ****************************************************/

function findNextFreeAssetRow_(sheet) {
  let targetRow =
    Math.max(
      findLastAssetDataRow_(sheet) + 1,
      ASSET_MODULE_CONFIG.startRow
    );

  while (true) {
    if (targetRow > sheet.getMaxRows()) {
      sheet.insertRowsAfter(
        sheet.getMaxRows(),
        targetRow - sheet.getMaxRows()
      );
    }

    const values = sheet
      .getRange(
        targetRow,
        1,
        1,
        ASSET_MODULE_CONFIG.columns.disposalDate
      )
      .getDisplayValues()[0];

    const hasData = values.some(
      value => assetInputClean_(value) !== ''
    );

    if (!hasData) {
      return targetRow;
    }

    targetRow++;
  }
}


/****************************************************
 * ПЕРЕВІРКА ДУБЛЯ ID В "АКТИВИ"
 ****************************************************/

function assetOperationIdExists_(operationId) {
  const sheet =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName(ASSETS_SHEET_NAME);

  if (!sheet) return false;

  return Boolean(
    assetInputFindRowByValue_(
      sheet,
      ASSET_MODULE_CONFIG.columns.operationId,
      ASSET_MODULE_CONFIG.startRow,
      operationId
    )
  );
}


/****************************************************
 * ПЕРЕВІРКА ДВОХ ЗАПИСІВ ПІСЛЯ ПРОВЕДЕННЯ
 ****************************************************/

function verifyAssetOperationWritten_(data) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    ss.getSheetByName(BASE_SHEET_NAME);

  const assetSheet =
    ss.getSheetByName(ASSETS_SHEET_NAME);

  const baseRow =
    assetInputFindRowByValue_(
      baseSheet,
      1,
      2,
      data.id
    );

  const assetRow =
    assetInputFindRowByValue_(
      assetSheet,
      ASSET_MODULE_CONFIG.columns.operationId,
      ASSET_MODULE_CONFIG.startRow,
      data.id
    );

  if (!baseRow) {
    throw new Error(
      'Контроль запису: актив не знайдено у "Базі операцій".'
    );
  }

  if (!assetRow) {
    throw new Error(
      'Контроль запису: актив не знайдено у листі "Активи".'
    );
  }

  const base = baseSheet
    .getRange(
      baseRow,
      1,
      1,
      33
    )
    .getValues()[0];

  const asset = assetSheet
    .getRange(
      assetRow,
      1,
      1,
      12
    )
    .getValues()[0];

  const errors = [];

  const expectedTotal =
    Math.abs(
      assetInputNumber_(data.amount)
    );

  if (
    assetInputClean_(base[9]) !== 'Актив'
  ) {
    errors.push(
      'у Базі операцій неправильний тип'
    );
  }

  if (
    assetInputClean_(base[25]) !==
    assetInputClean_(data.assetName)
  ) {
    errors.push(
      'не збігається назва активу'
    );
  }

  if (
    assetInputClean_(base[26]) !==
    assetInputClean_(data.assetCategory)
  ) {
    errors.push(
      'не збігається категорія активу'
    );
  }

  if (
    assetInputNumber_(base[27]) !==
    assetInputNumber_(data.assetAmortization)
  ) {
    errors.push(
      'не збігається строк амортизації'
    );
  }

  if (
    !assetInputSameDate_(
      base[28],
      data.assetStartDate
    )
  ) {
    errors.push(
      'не збігається дата введення'
    );
  }

  if (
    Math.abs(
      Math.abs(
        assetInputNumber_(base[6])
      ) - expectedTotal
    ) > 0.01
  ) {
    errors.push(
      'не збігається сума у Базі операцій'
    );
  }

  if (
    assetInputClean_(asset[9]) !==
    assetInputClean_(data.id)
  ) {
    errors.push(
      'неправильний ID у реєстрі активів'
    );
  }

  if (
    assetInputClean_(asset[10]) !==
    'Активний'
  ) {
    errors.push(
      'новий актив не має статусу "Активний"'
    );
  }

  if (
    Math.abs(
      assetInputNumber_(asset[4]) -
      expectedTotal
    ) > 0.01
  ) {
    errors.push(
      'не збігається первісна вартість у реєстрі активів'
    );
  }

  if (
    assetInputNumber_(asset[2]) !==
    assetInputNumber_(data.quantity)
  ) {
    errors.push(
      'не збігається кількість'
    );
  }

  if (
    Math.abs(
      assetInputNumber_(asset[3]) -
      Math.abs(
        assetInputNumber_(data.unitPrice)
      )
    ) > 0.01
  ) {
    errors.push(
      'не збігається ціна одиниці'
    );
  }

  if (
    !assetInputSameDate_(
      asset[6],
      data.assetStartDate
    )
  ) {
    errors.push(
      'не збігається дата в реєстрі активів'
    );
  }

  if (errors.length) {
    throw new Error(
      'Контроль цілісності активу не пройдено: ' +
      errors.join('; ')
    );
  }

  return {
    ok: true,
    baseRow: baseRow,
    assetRow: assetRow
  };
}


/****************************************************
 * ВІДКАТ НЕЗАВЕРШЕНОЇ ОПЕРАЦІЇ АКТИВУ
 *
 * Не видаляє рядки фізично, щоб не зміщувати:
 * - формули;
 * - KPI;
 * - інші модулі.
 ****************************************************/

function rollbackAssetOperation_(operationId) {
  if (!operationId) return;

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    ss.getSheetByName(BASE_SHEET_NAME);

  const assetSheet =
    ss.getSheetByName(ASSETS_SHEET_NAME);

  if (baseSheet) {
    const baseRow =
      assetInputFindRowByValue_(
        baseSheet,
        1,
        2,
        operationId
      );

    if (baseRow) {
      baseSheet
        .getRange(
          baseRow,
          1,
          1,
          33
        )
        .clearContent();
    }
  }

  if (assetSheet) {
    const assetRow =
      assetInputFindRowByValue_(
        assetSheet,
        ASSET_MODULE_CONFIG.columns.operationId,
        ASSET_MODULE_CONFIG.startRow,
        operationId
      );

    if (assetRow) {
      assetSheet
        .getRange(
          assetRow,
          1,
          1,
          ASSET_MODULE_CONFIG.columns.disposalDate
        )
        .clearContent();
    }
  }

  SpreadsheetApp.flush();

  Logger.log(
    'Виконано відкат операції активу: ' +
    operationId
  );
}


/****************************************************
 * СУХИЙ ТЕСТ КРОКУ 2
 *
 * Не записує дані в таблицю.
 ****************************************************/

function testAssetInputStep2() {
  assertAssetInputStep2Ready_();

  const validData = {
    type: 'Актив',
    category: 'Обладнання',
    article: 'Тестовий актив',
    assetCategory: '',
    assetName: '',
    quantity: 2,
    unitPrice: 3000,
    amount: 6000,
    assetAmortization: 5,
    assetStartDate:
      new Date(2026, 0, 15)
  };

  normalizeAssetInputData_(validData);

  const validResult =
    validateAssetInputData_(validData);

  if (validResult.errors.length) {
    throw new Error(
      'Коректний тестовий актив не пройшов валідацію: ' +
      validResult.errors.join('; ')
    );
  }

  const belowLimitData = {
    type: 'Актив',
    category: 'Обладнання',
    article: 'Актив нижче порогу',
    quantity: 1,
    unitPrice: 5999,
    amount: 5999,
    assetAmortization: 5,
    assetStartDate:
      new Date(2026, 0, 15)
  };

  const belowLimitResult =
    validateAssetInputData_(
      belowLimitData
    );

  const thresholdRejected =
    belowLimitResult.errors.some(
      message =>
        message.indexOf('6000') !== -1
    );

  if (!thresholdRejected) {
    throw new Error(
      'Тест порогу не пройдено: актив 5999 грн не був заблокований.'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const categories =
    getAssetCategories_(ss);

  const names =
    categories.length
      ? getAssetNames_(
          ss,
          categories[0]
        )
      : [];

  const result = {
    validAsset: {
      amount: validData.amount,
      quantity: validData.quantity,
      unitPrice: validData.unitPrice,
      usefulLifeYears:
        validData.assetAmortization,
      date:
        Utilities.formatDate(
          validData.assetStartDate,
          Session.getScriptTimeZone(),
          'dd.MM.yyyy'
        )
    },

    belowLimitRejected:
      thresholdRejected,

    categoriesFound:
      categories,

    namesForFirstCategory:
      names,

    noRowsWritten:
      true
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp.getActive().toast(
    'Крок 2 пройшов сухий тест',
    'Модуль "Активи"',
    8
  );

  return result;
}


/****************************************************
 * ДОПОМІЖНІ ФУНКЦІЇ
 ****************************************************/

function assetInputClean_(value) {
  return String(
    value === null ||
    value === undefined
      ? ''
      : value
  ).trim();
}


function assetInputNormalizeHeader_(value) {
  return assetInputClean_(value)
    .toLowerCase()
    .replace(/\s+/g, ' ');
}


function assetInputNumber_(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const text =
    assetInputClean_(value)
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

  if (!text) return 0;

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : 0;
}


function assetInputRoundMoney_(value) {
  const number =
    assetInputNumber_(value);

  return Math.round(
    (number + Number.EPSILON) * 100
  ) / 100;
}


function assetInputIsValidDate_(value) {
  return (
    value instanceof Date &&
    !isNaN(value.getTime())
  );
}


function assetInputSameDate_(first, second) {
  if (
    !assetInputIsValidDate_(first) ||
    !assetInputIsValidDate_(second)
  ) {
    return false;
  }

  return (
    first.getFullYear() ===
      second.getFullYear() &&
    first.getMonth() ===
      second.getMonth() &&
    first.getDate() ===
      second.getDate()
  );
}


function assetInputReadIdSet_(
  sheet,
  column,
  startRow
) {
  const result = new Set();

  if (!sheet) return result;

  const lastRow =
    sheet.getLastRow();

  if (lastRow < startRow) {
    return result;
  }

  sheet
    .getRange(
      startRow,
      column,
      lastRow - startRow + 1,
      1
    )
    .getDisplayValues()
    .flat()
    .map(assetInputClean_)
    .filter(Boolean)
    .forEach(value => {
      result.add(value);
    });

  return result;
}


function assetInputFindRowByValue_(
  sheet,
  column,
  startRow,
  expectedValue
) {
  if (!sheet) return 0;

  const expected =
    assetInputClean_(
      expectedValue
    );

  if (!expected) return 0;

  const lastRow =
    sheet.getLastRow();

  if (lastRow < startRow) {
    return 0;
  }

  const values = sheet
    .getRange(
      startRow,
      column,
      lastRow - startRow + 1,
      1
    )
    .getDisplayValues()
    .flat();

  for (
    let index = 0;
    index < values.length;
    index++
  ) {
    if (
      assetInputClean_(values[index]) ===
      expected
    ) {
      return startRow + index;
    }
  }

  return 0;
}