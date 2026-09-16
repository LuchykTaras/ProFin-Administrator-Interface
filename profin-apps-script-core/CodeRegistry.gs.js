/****************************************************
 * CODE REGISTRY
 * --------------------------------------------------
 * Безпечний кодовий реєстр ProFin OS.
 *
 * Призначення:
 * - читає коди з листа "Технічний лист";
 * - формує індекси послуг, вакцин і фінансових статей;
 * - дозволяє підтягувати залежні списки за кодами;
 * - не змінює історичні дані;
 * - не запускає генерацію P&L або Cash Flow.
 *
 * ВАЖЛИВО:
 * Модуль нічого не записує у звіти.
 ****************************************************/

const CODE_REGISTRY_SHEET_NAME = 'Технічний лист';

/**
 * Поточна структура блоку послуг на Технічному листі:
 *
 * B — Категорія
 * C — Код послуги
 * D — Послуга
 * E — Вартість
 */
const CODE_REGISTRY_SERVICE_COLUMNS = {
  category: 2,
  code: 3,
  name: 4,
  price: 5
};

/**
 * Поточна структура блоку фінансових статей:
 *
 * H — Стаття руху коштів / група
 * I — Код
 * J — Стаття
 */
const CODE_REGISTRY_FINANCE_COLUMNS = {
  cashFlowGroup: 8,
  code: 9,
  name: 10
};

let CODE_REGISTRY_MEMORY_CACHE_ = null;


/****************************************************
 * PUBLIC API
 ****************************************************/

/**
 * Повертає повний кодовий реєстр.
 *
 * Використовує кеш у межах одного запуску скрипта.
 */
function getCodeRegistry_() {
  if (CODE_REGISTRY_MEMORY_CACHE_) {
    return CODE_REGISTRY_MEMORY_CACHE_;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CODE_REGISTRY_SHEET_NAME);

  if (!sheet) {
    throw new Error(
      'Не знайдено лист "' + CODE_REGISTRY_SHEET_NAME + '".'
    );
  }

  CODE_REGISTRY_MEMORY_CACHE_ = buildCodeRegistry_(sheet);

  return CODE_REGISTRY_MEMORY_CACHE_;
}


/**
 * Очищає лише внутрішній кеш реєстру.
 *
 * Не змінює таблицю.
 * Не запускає генерацію звітів.
 */
function resetCodeRegistryCache_() {
  CODE_REGISTRY_MEMORY_CACHE_ = null;
}


/**
 * Безпечний ручний тест.
 *
 * Лише читає Технічний лист і показує результат.
 */
function testCodeRegistry() {
  resetCodeRegistryCache_();

  const registry = getCodeRegistry_();

  const message = [
    'Кодовий реєстр прочитано.',
    '',
    'Послуг: ' + registry.services.length,
    'Вакцин: ' + registry.vaccines.length,
    'Фінансових статей: ' + registry.financeArticles.length,
    '',
    'Дублі кодів: ' + registry.diagnostics.duplicateCodes.length,
    'Порожніх кодів: ' + registry.diagnostics.emptyCodes.length,
    'Порожніх назв: ' + registry.diagnostics.emptyNames.length
  ].join('\n');

  SpreadsheetApp.getActive().toast(
    'Реєстр кодів успішно прочитано',
    'ProFin OS',
    5
  );

  Logger.log(message);
}


/****************************************************
 * BUILD REGISTRY
 ****************************************************/

function buildCodeRegistry_(sheet) {
  const lastRow = sheet.getLastRow();

  const registry = {
    services: [],
    vaccines: [],
    financeArticles: [],

    servicesByCode: {},
    servicesByName: {},
    servicesByCategory: {},

    vaccinesByCode: {},
    vaccinesByName: {},

    financeArticlesByCode: {},
    financeArticlesByName: {},

    diagnostics: {
      duplicateCodes: [],
      emptyCodes: [],
      emptyNames: []
    }
  };

  if (lastRow < 2) {
    return registry;
  }

  readServiceRegistry_(sheet, lastRow, registry);
  readFinanceRegistry_(sheet, lastRow, registry);

  return registry;
}


/****************************************************
 * SERVICES / VACCINES
 ****************************************************/

function readServiceRegistry_(sheet, lastRow, registry) {
  const startRow = 2;
  const numRows = lastRow - startRow + 1;

  if (numRows <= 0) return;

  const firstCol = CODE_REGISTRY_SERVICE_COLUMNS.category;
  const lastCol = CODE_REGISTRY_SERVICE_COLUMNS.price;
  const numCols = lastCol - firstCol + 1;

  const values = sheet
    .getRange(startRow, firstCol, numRows, numCols)
    .getDisplayValues();

  values.forEach((row, index) => {
    const sheetRow = startRow + index;

    const category = cleanRegistryValue_(row[0]);
    const code = normalizeRegistryCode_(row[1]);
    const name = cleanRegistryValue_(row[2]);
    const price = parseRegistryNumber_(row[3]);

    /*
     * Пропускаємо повністю порожні рядки.
     */
    if (!category && !code && !name) return;

    if (!code) {
      registry.diagnostics.emptyCodes.push({
        source: 'SERVICE',
        row: sheetRow,
        category: category,
        name: name
      });

      return;
    }

    if (!name) {
      registry.diagnostics.emptyNames.push({
        source: 'SERVICE',
        row: sheetRow,
        code: code,
        category: category
      });

      return;
    }

    const item = {
      entityType: 'SERVICE',
      row: sheetRow,
      category: category,
      categoryKey: normalizeRegistryText_(category),
      code: code,
      name: name,
      nameKey: normalizeRegistryText_(name),
      price: price,
      isVaccine: isVaccineRegistryItem_({
        category: category,
        code: code,
        name: name
      })
    };

    registerUniqueCode_(
      registry.servicesByCode,
      code,
      item,
      registry.diagnostics,
      'SERVICE'
    );

    registerNameIndex_(
      registry.servicesByName,
      item.nameKey,
      item
    );

    registerCategoryIndex_(
      registry.servicesByCategory,
      item.categoryKey,
      item
    );

    registry.services.push(item);

    if (item.isVaccine) {
      registerUniqueCode_(
        registry.vaccinesByCode,
        code,
        item,
        registry.diagnostics,
        'VACCINE'
      );

      registerNameIndex_(
        registry.vaccinesByName,
        item.nameKey,
        item
      );

      registry.vaccines.push(item);
    }
  });
}


/**
 * Визначення вакцини виконується переважно за кодом.
 *
 * Поточний технічний лист використовує:
 * В0001, В0002, В0003...
 *
 * Назва категорії використовується лише як додатковий
 * fallback для сумісності.
 */
function isVaccineRegistryItem_(item) {
  const code = normalizeRegistryCode_(item.code);
  const category = normalizeRegistryText_(item.category);

  const isVaccineCode =
    /^[ВB]\d+$/i.test(code);

  const isVaccineCategory = [
    'вакцина',
    'вакцини',
    'щеплення',
    'вакцинація'
  ].includes(category);

  return isVaccineCode || isVaccineCategory;
}


/****************************************************
 * FINANCIAL ARTICLES
 ****************************************************/

function readFinanceRegistry_(sheet, lastRow, registry) {
  const startRow = 2;
  const numRows = lastRow - startRow + 1;

  if (numRows <= 0) return;

  const firstCol = CODE_REGISTRY_FINANCE_COLUMNS.cashFlowGroup;
  const lastCol = CODE_REGISTRY_FINANCE_COLUMNS.name;
  const numCols = lastCol - firstCol + 1;

  const values = sheet
    .getRange(startRow, firstCol, numRows, numCols)
    .getDisplayValues();

  values.forEach((row, index) => {
    const sheetRow = startRow + index;

    const cashFlowGroup = cleanRegistryValue_(row[0]);
    const code = normalizeRegistryCode_(row[1]);
    const name = cleanRegistryValue_(row[2]);

    if (!cashFlowGroup && !code && !name) return;

    /*
     * У цьому блоці можуть бути проміжні службові рядки.
     * До реєстру фінансових статей включаємо тільки рядки,
     * де одночасно є код і назва.
     */
    if (!code || !name) return;

    const item = {
      entityType: 'FINANCE_ARTICLE',
      row: sheetRow,
      cashFlowGroup: cashFlowGroup,
      cashFlowGroupKey: normalizeRegistryText_(cashFlowGroup),
      code: code,
      name: name,
      nameKey: normalizeRegistryText_(name)
    };

    registerUniqueCode_(
      registry.financeArticlesByCode,
      code,
      item,
      registry.diagnostics,
      'FINANCE_ARTICLE'
    );

    registerNameIndex_(
      registry.financeArticlesByName,
      item.nameKey,
      item
    );

    registry.financeArticles.push(item);
  });
}


/****************************************************
 * SAFE RESOLVERS
 ****************************************************/

/**
 * Пошук послуги:
 * 1. за кодом;
 * 2. за назвою як fallback.
 */
function resolveService_(code, name) {
  const registry = getCodeRegistry_();

  return resolveRegistryItem_(
    code,
    name,
    registry.servicesByCode,
    registry.servicesByName
  );
}


/**
 * Пошук вакцини:
 * 1. за кодом;
 * 2. за назвою як fallback.
 */
function resolveVaccine_(code, name) {
  const registry = getCodeRegistry_();

  return resolveRegistryItem_(
    code,
    name,
    registry.vaccinesByCode,
    registry.vaccinesByName
  );
}


/**
 * Пошук фінансової статті:
 * 1. за кодом;
 * 2. за назвою як fallback.
 */
function resolveFinanceArticle_(code, name) {
  const registry = getCodeRegistry_();

  return resolveRegistryItem_(
    code,
    name,
    registry.financeArticlesByCode,
    registry.financeArticlesByName
  );
}


function resolveRegistryItem_(code, name, byCode, byName) {
  const normalizedCode = normalizeRegistryCode_(code);

  if (normalizedCode && byCode[normalizedCode]) {
    return Object.assign(
      {},
      byCode[normalizedCode],
      { resolvedBy: 'CODE' }
    );
  }

  const normalizedName = normalizeRegistryText_(name);

  if (normalizedName && byName[normalizedName]) {
    const matches = byName[normalizedName];

    /*
     * Якщо назва унікальна — повертаємо запис.
     * Якщо назва дублюється — не вгадуємо.
     */
    if (matches.length === 1) {
      return Object.assign(
        {},
        matches[0],
        { resolvedBy: 'NAME' }
      );
    }
  }

  return null;
}


/****************************************************
 * LISTS FOR DROPDOWNS
 ****************************************************/

/**
 * Повертає назви всіх активних послуг категорії.
 *
 * Приклад:
 * getServiceNamesByCategory_('Вакцини')
 */
function getServiceNamesByCategory_(category) {
  const registry = getCodeRegistry_();
  const categoryKey = normalizeRegistryText_(category);

  const items =
    registry.servicesByCategory[categoryKey] || [];

  return uniqueRegistryValues_(
    items.map(item => item.name)
  );
}


/**
 * Основна функція для списку вакцин.
 *
 * Більше не залежить від жорсткого значення
 * "Щеплення" у Довіднику.
 */
function getVaccineNamesFromRegistry_() {
  const registry = getCodeRegistry_();

  return uniqueRegistryValues_(
    registry.vaccines.map(item => item.name)
  );
}


/**
 * Повертає об’єкти вакцин разом із кодами.
 */
function getVaccinesFromRegistry_() {
  const registry = getCodeRegistry_();

  return registry.vaccines.map(item => ({
    code: item.code,
    name: item.name,
    price: item.price,
    category: item.category
  }));
}


/**
 * Повертає код вибраної послуги або вакцини.
 */
function getServiceCodeByName_(name) {
  const item = resolveService_('', name);

  return item ? item.code : '';
}


/**
 * Повертає код фінансової статті за її назвою.
 */
function getFinanceArticleCodeByName_(name) {
  const item = resolveFinanceArticle_('', name);

  return item ? item.code : '';
}


/****************************************************
 * SAFE DROPDOWN APPLICATION
 ****************************************************/

/**
 * Встановлює dropdown у вказану клітинку.
 *
 * Ця функція:
 * - не запускає звіти;
 * - не змінює інші листи;
 * - не очищує значення, якщо воно є у новому списку.
 */
function setSafeRegistryDropdown_(cell, values, emptyMessage) {
  const cleanValues = uniqueRegistryValues_(
    (values || [])
      .map(cleanRegistryValue_)
      .filter(Boolean)
  );

  const currentValue = cleanRegistryValue_(
    cell.getDisplayValue()
  );

  cell.clearDataValidations();

  if (!cleanValues.length) {
    cell.setNote(
      emptyMessage ||
      'У Технічному листі не знайдено доступних значень.'
    );

    return false;
  }

  const rule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(cleanValues, true)
    .setAllowInvalid(false)
    .build();

  cell.setDataValidation(rule);
  cell.clearNote();

  /*
   * Поточне значення очищуємо лише тоді,
   * коли його більше немає у довіднику.
   */
  if (
    currentValue &&
    !cleanValues.some(
      value =>
        normalizeRegistryText_(value) ===
        normalizeRegistryText_(currentValue)
    )
  ) {
    cell.clearContent();
  }

  return true;
}


/**
 * Безпечне застосування списку вакцин.
 *
 * Можна викликати з чинної функції
 * updateInputDependentDropdowns().
 */
function applyVaccineDropdownFromRegistry_(articleCell) {
  const vaccines = getVaccineNamesFromRegistry_();

  return setSafeRegistryDropdown_(
    articleCell,
    vaccines,
    'На Технічному листі не знайдено вакцин із кодами В0001, В0002 тощо.'
  );
}


/****************************************************
 * INDEX HELPERS
 ****************************************************/

function registerUniqueCode_(
  index,
  code,
  item,
  diagnostics,
  source
) {
  if (index[code]) {
    diagnostics.duplicateCodes.push({
      source: source,
      code: code,
      firstRow: index[code].row,
      duplicateRow: item.row,
      firstName: index[code].name,
      duplicateName: item.name
    });

    /*
     * Перший запис залишається основним.
     * Дублікат не перезаписує реєстр.
     */
    return;
  }

  index[code] = item;
}


function registerNameIndex_(index, nameKey, item) {
  if (!nameKey) return;

  if (!index[nameKey]) {
    index[nameKey] = [];
  }

  index[nameKey].push(item);
}


function registerCategoryIndex_(index, categoryKey, item) {
  if (!categoryKey) return;

  if (!index[categoryKey]) {
    index[categoryKey] = [];
  }

  index[categoryKey].push(item);
}


/****************************************************
 * NORMALIZATION HELPERS
 ****************************************************/

function cleanRegistryValue_(value) {
  return String(value == null ? '' : value)
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function normalizeRegistryText_(value) {
  return cleanRegistryValue_(value)
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s*\/\s*/g, '/');
}


function normalizeRegistryCode_(value) {
  return cleanRegistryValue_(value)
    .toUpperCase()
    .replace(/\s+/g, '');
}


function parseRegistryNumber_(value) {
  const normalized = cleanRegistryValue_(value)
    .replace(/\s/g, '')
    .replace(/грн/gi, '')
    .replace(',', '.');

  const number = Number(normalized);

  return Number.isFinite(number) ? number : 0;
}


function uniqueRegistryValues_(values) {
  const result = [];
  const seen = {};

  (values || []).forEach(value => {
    const cleanValue = cleanRegistryValue_(value);
    const key = normalizeRegistryText_(cleanValue);

    if (!cleanValue || seen[key]) return;

    seen[key] = true;
    result.push(cleanValue);
  });

  return result;
}