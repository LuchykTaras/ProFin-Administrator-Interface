/****************************************************
 * HISTORICAL NORMALIZE
 * --------------------------------------------------
 * Одноразова нормалізація історичних імпортованих рядків
 * у "База операцій".
 *
 * Працює ТІЛЬКИ з ID, які починаються з:
 * - HIST-APR
 * - HIST-MAY
 *
 * Основний cashFlowReport.js не чіпаємо.
 ****************************************************/

function normalizeHistoricalImportedRows() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('База операцій');

  if (!sheet) {
    throw new Error('Не знайдено лист "База операцій"');
  }

  const startRow = 10;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    SpreadsheetApp.getActive().toast('Немає рядків для нормалізації');
    return;
  }

  const range = sheet.getRange(startRow, 1, lastRow - startRow + 1, 31);
  const values = range.getValues();

  let changed = 0;

  values.forEach(row => {
    const id = clean_(row[0]);

    if (!isHistoricalRow_(id)) return;

    const type = clean_(row[9]);      // J Тип
    const category = clean_(row[10]); // K Категорія
    const article = clean_(row[11]);  // L Стаття

    const normalized = normalizeHistoricalCategoryArticle_(type, category, article);

    if (!normalized) return;

    row[9] = normalized.type || type;
    row[10] = normalized.category || category;
    row[11] = normalized.article || article;

    row[12] = addHistoricalNote_(row[12]); // M Коментар

    changed++;
  });

  range.setValues(values);

  SpreadsheetApp.getActive().toast('Нормалізовано історичних рядків: ' + changed);
}

/****************************************************
 * ВИЗНАЧАЄ ІСТОРИЧНИЙ РЯДОК
 ****************************************************/
function isHistoricalRow_(id) {
  return (
    id.startsWith('HIST-APR') ||
    id.startsWith('HIST-MAY')
  );
}

/****************************************************
 * ПРАВИЛА НОРМАЛІЗАЦІЇ ІСТОРИЧНИХ СТАТЕЙ
 ****************************************************/
function normalizeHistoricalCategoryArticle_(type, category, article) {
  const t = clean_(type);
  const c = clean_(category);
  const a = clean_(article);

  if (!t || !a) return null;

  return {
    type: normalizeHistoricalType_(t),
    category: normalizeHistoricalCategoryKeepDetail_(c, a),
    article: normalizeHistoricalArticleKeepDetail_(c, a)
  };
}
function normalizeHistoricalType_(type) {
  const t = clean_(type).toLowerCase();

  if (t === 'доходи') return 'Доходи';
  if (t === 'витрати') return 'Витрати';
  if (t === 'інкасація') return 'Інкасація';

  return clean_(type);
}

function normalizeHistoricalCategoryKeepDetail_(category, article) {
  const c = clean_(category).toLowerCase();
  const a = clean_(article).toLowerCase();

  if (c === 'консультація') return 'Консультація';
  if (c === 'щеплення') return 'Вакцини';
  if (c === 'довідки') return 'Довідки';
  if (c === 'швидкі тести') return 'Швидкі тести';

  if (c === 'оренда і утримання') return 'Оренда і утримання';
  if (c === 'господарські') return 'Господарські витрати';

  if (c === 'аміністрація' || c === 'адміністрація') {
    return 'Адміністративні витрати';
  }

  if (c === 'персонал') return 'Персонал';
  if (c === 'медичні') return 'Медичні витрати';
  if (c === 'інше') return 'Інше';

  if (a === 'внутрішній трансфер') return 'Внутрішній трансфер';

  return clean_(category);
}

function normalizeHistoricalArticleKeepDetail_(category, article) {
  const c = clean_(category).toLowerCase();
  const a = clean_(article).toLowerCase();

  if (a === 'електоренергія') return 'Електроенергія';
  if (a === 'crm / хелсі') return 'CRM /Health24';
  if (a === 'чек-box' || a === 'чек box') return 'Чек-box';
  if (a === 'binotel') return 'Бінотел';
  if (a === 'київстар/vodafon') return 'Київстар/Vodafon';

  if (c === 'господарські' && a === 'вода') return 'Вода питна';
  if (a === 'покос трави') return 'Ремонт техніки та приміщення';

  if (a === 'внутрішній трансфер') return 'Внутрішній трансфер';

  return clean_(article);
}
function repairHistoricalImportedDetailsFromSources() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName('База операцій');

  if (!baseSheet) {
    throw new Error('Не знайдено лист "База операцій"');
  }

  const sources = {
    'HIST-APR': ss.getSheetByName('Рух коштів Квітень'),
    'HIST-MAY': ss.getSheetByName('Рух коштів Травень')
  };

  const startRow = 10;
  const lastRow = baseSheet.getLastRow();

  if (lastRow < startRow) return;

  const range = baseSheet.getRange(startRow, 1, lastRow - startRow + 1, 31);
  const values = range.getValues();

  let changed = 0;

  values.forEach(row => {
    const id = clean_(row[0]);

    if (!id.startsWith('HIST-APR') && !id.startsWith('HIST-MAY')) return;

    const prefix = id.startsWith('HIST-APR') ? 'HIST-APR' : 'HIST-MAY';
    const sourceSheet = sources[prefix];

    if (!sourceSheet) return;

    const parts = id.split('-');
    const sourceIndex = Number(parts[parts.length - 1]);

    if (!sourceIndex) return;

    const sourceRow = 9 + sourceIndex;
    const sourceValues = sourceSheet.getRange(sourceRow, 1, 1, 12).getValues()[0];

    const sourceType = clean_(sourceValues[8]);     // I Тип
    const sourceCategory = clean_(sourceValues[9]); // J Категорія
    const sourceArticle = clean_(sourceValues[10]); // K Стаття

    const normalized = normalizeHistoricalCategoryArticle_(
      sourceType,
      sourceCategory,
      sourceArticle
    );

    if (!normalized) return;

    row[9] = normalized.type;      // J Тип
    row[10] = normalized.category; // K Категорія
    row[11] = normalized.article;  // L Стаття

    row[12] = addHistoricalRepairNote_(row[12]);

    changed++;
  });

  range.setValues(values);

  SpreadsheetApp.getActive().toast(
    'Відновлено деталізацію історичних рядків: ' + changed
  );
}

function addHistoricalRepairNote_(comment) {
  const current = clean_(comment);

  if (current.includes('Відновлено деталізацію історії')) {
    return current;
  }

  if (!current) {
    return 'Відновлено деталізацію історії';
  }

  return current + ' | Відновлено деталізацію історії';
}

/****************************************************
 * ПОЗНАЧКА В КОМЕНТАРІ
 ****************************************************/
function addHistoricalNote_(comment) {
  const current = clean_(comment);

  if (current.includes('Нормалізовано історичний імпорт')) {
    return current;
  }

  if (!current) {
    return 'Нормалізовано історичний імпорт';
  }

  return current + ' | Нормалізовано історичний імпорт';
}