/************************************************
 * CASHFLOW CORE
 * ----------------------------------------------
 * Головний системний файл:
 * - меню
 * - onEdit
 * - dropdowns Cashflow
 * - довідники
 * - кольори
 * - валідації
 * - інтеграція з "Ввід операцій"
 *
 * Важливо:
 * Цей файл НЕ містить логіку проведення операцій.
 * Вона винесена окремо у inputOperations.js
 ************************************************/

/************************************************
 * ЄДИНИЙ onOpen PROFIN OS
 *
 * — створює Меню операцій;
 * — відновлює Visual Contract Дашборду;
 * — ініціалізує перегляд Бази операцій;
 * — не перемикає активний лист.
 ************************************************/

/************************************************
 * МЕНЮ
 ************************************************/

function onOpen() {
  const ui = SpreadsheetApp.getUi();

    const interbranchMenu = ui
    .createMenu('Переміщення між філіями')
    .addItem(
      'Виконати дію з вибраного рядка',
      'openInterbranchTransferDialog'
    )
    .addItem(
      'Оновити доступні дії',
      'installInterbranchTransferUiStep3'
    );

  const correctionMenu = ui
    .createMenu('Коригування та скасування')
    .addItem(
      'Скасувати операцію за ID',
      'openControlledOperationCancellationBaburka'
    )
    .addItem(
      'Скасувати останню операцію',
      'cancelLastActiveOperationBaburka'
    )
    .addSeparator()
    .addItem(
      'Змінити собівартість закупівлі',
      'openPurchaseCostCorrectionAlternative'
    )
    .addItem(
      'Змінити кількість закупівлі вакцини',
      'openVaccinePurchaseQuantityCorrection'
    )
    .addSeparator()
    .addItem(
      'Скасувати прийняте переміщення за ID',
      'cancelAcceptedInterbranchTransferById'
    );

  ui
    .createMenu('Меню операцій')
    .addItem(
      'Оновити всі списки Cashflow',
      'refreshAllCashflowSourcesAndDropdowns'
    )
    .addItem(
      'Налаштувати форму вводу',
      'restoreInputFormValidation'
    )
    .addItem(
      '🔄 Відновити форму вводу',
      'repairInputOperationForm'
    )
    .addItem(
      'Провести операцію',
      'postInputOperation'
    )
        .addSeparator()
    .addSubMenu(correctionMenu)
    .addSeparator()
    .addItem(
      'Сформувати Звіт cash flow',
      'generateCashFlowReport'
    )
    .addItem(
      'Сформувати P&L за обраний місяць',
      'generatePLReportForSelectedPeriod'
    )
    .addItem(
      'Оновити автоплан P&L',
      'updatePLAutoPlanFromGeneratedFacts'
    )
    .addSeparator()
    .addSubMenu(interbranchMenu)
    .addToUi();
}


/************************************************
 * КОНСТАНТИ CASHFLOW
 ************************************************/

const CASHFLOW_START_ROW = 10;

const COL_PATIENT = 8;
const COL_TYPE = 9;
const COL_CATEGORY = 10;
const COL_ARTICLE = 11;
const COL_PAYMENT_MONTH = 13;
const COL_ACCRUAL_MONTH = 14;

const CASHFLOW_ROWS_BUFFER = 300;


/************************************************
 * ГОЛОВНИЙ onEdit
 ************************************************/

function onEdit(e) {
  if (
    !e ||
    !e.range
  ) {
    return;
  }

  const sheet =
    e.range.getSheet();

  const sheetName =
    sheet.getName();

  const row =
    e.range.getRow();

  const col =
    e.range.getColumn();

  /**********************************************
   * ВВІД ОПЕРАЦІЙ
   **********************************************/

  if (
    sheetName ===
    INPUT_SHEET_NAME
  ) {
    handleInputOperationEdit_(
      e
    );

    return;
  }
    /**********************************************
   * ФІЛЬТРИ КЛІЄНТСЬКОЇ БАЗИ
   **********************************************/

  if (
    typeof handleClientDirectoryFilterEdit_ ===
      'function' &&
    handleClientDirectoryFilterEdit_(e)
  ) {
    return;
  }
  /**********************************************
   * ПОШУК ТОВАРУ НА СКЛАДІ
   **********************************************/

  if (
    sheetName ===
      'Склад медичних запасів' &&
    typeof handleInventoryProductSearchEdit_ ===
      'function' &&
    handleInventoryProductSearchEdit_(
      e
    )
  ) {
    return;
  }
  /**********************************************
   * CASHFLOW
   **********************************************/

  if (
    sheetName.startsWith(
      'Рух коштів'
    ) &&
    row >=
      CASHFLOW_START_ROW
  ) {
    /*
     * Тип операції.
     */
    if (
      col ===
      COL_TYPE
    ) {
      applyTypeColorsForRow_(
        sheet,
        row,
        true
      );

      applyCategoryDropdownForRow_(
        sheet,
        row
      );

      applyArticleDropdownForRow_(
        sheet,
        row
      );
    }

    /*
     * Категорія.
     */
    if (
      col ===
      COL_CATEGORY
    ) {
      applyTypeColorsForRow_(
        sheet,
        row,
        true
      );

      applyArticleDropdownForRow_(
        sheet,
        row
      );
    }

    return;
  }


  /**********************************************
   * ДАШБОРД
   **********************************************/

  if (
    sheetName ===
    'Дашборд'
  ) {
    let globalDashboardEditResult =
      null;

    /*
     * Спочатку головний глобальний контролер.
     *
     * Він визначає:
     * - чи редагувався глобальний фільтр;
     * - чи H66/H71 треба обробити
     *   у режимі GLOBAL + LOCAL.
     */
    if (
      typeof dashboardGlobalFilterHandleEdit_ ===
      'function'
    ) {
      globalDashboardEditResult =
        dashboardGlobalFilterHandleEdit_(
          e
        );
    }

    /*
     * Якщо H66/H71 уже обробив
     * глобальний модуль у режимі
     * GLOBAL + LOCAL,
     *
     * локальний модуль доходів вдруге
     * не запускаємо.
     */
    const localIncomeHandledByGlobal =
      !!(
        globalDashboardEditResult &&
        globalDashboardEditResult
          .handled === true &&
        globalDashboardEditResult
          .scope === 'LOCAL_INCOME'
      );

    /*
     * Якщо глобальний модуль НЕ забрав
     * цю локальну зміну —
     * запускаємо звичайний локальний
     * фільтр доходів.
     */
    if (
      !localIncomeHandledByGlobal &&
      typeof dashboardIncomeDetailsHandleEdit_ ===
        'function'
    ) {
      dashboardIncomeDetailsHandleEdit_(
        e
      );
    }

        /*
     * Локальна PNG-діаграма витрат
     * тут НЕ запускається.
     *
     * I92 обслуговує окремий
     * installable onEdit:
     *
     * dashboardExpenseDetailsInstalledOnEdit_
     *
     * Це виключає подвійне оновлення
     * та запуск важкої PNG-логіки
     * через simple onEdit.
     */

    return;
}

  /**********************************************
   * ДОВІДНИК
   **********************************************/

  if (
    sheetName ===
    'Довідник'
  ) {
    /*
     * Мінімальні залишки складу.
     */
    if (
      typeof handleInventoryMinimumStockDirectoryEdit_ ===
      'function'
    ) {
      handleInventoryMinimumStockDirectoryEdit_(
        e
      );
    }

    /*
     * Перебудова списків Cashflow
     * та залежних списків форми.
     */
    refreshAllCashflowSourcesAndDropdowns();

    updateInputDependentDropdowns();

    /*
     * Автоматичне оновлення лікарів,
     * коли редагування зачепило F9:F18.
     */
    const doctorsRangeEdited =
      e.range.getColumn() <= 6 &&
      e.range.getLastColumn() >= 6 &&
      e.range.getRow() <= 18 &&
      e.range.getLastRow() >= 9;

    if (
      doctorsRangeEdited &&
      typeof setupDoctorDropdown_ ===
        'function'
    ) {
      setupDoctorDropdown_();
    }

    /*
     * Оновлення активів і дашборду,
     * якщо відповідні модулі підключені.
     */
    if (
      typeof handleAssetSummaryEdit_ ===
      'function'
    ) {
      handleAssetSummaryEdit_(
        e
      );
    }

    if (
      typeof safeRefreshAssetSummary_ ===
      'function'
    ) {
      safeRefreshAssetSummary_();
    }

    return;
  }
}
/************************************************
 * ОНОВЛЕННЯ ВСІХ СПИСКІВ
 ************************************************/

function refreshAllCashflowSourcesAndDropdowns() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

 const typeRule = SpreadsheetApp
  .newDataValidation()
  .requireValueInList(
    [
      'Доходи',
      'Витрати',
      'Інкасація',
      'Фінансова діяльність',
      'Актив',
      'Вакцина',
      'Пакет'
    ],
    true
  )
  .setAllowInvalid(false)
  .build();
  ss.getSheets().forEach(sheet => {

    if (!sheet.getName().startsWith('Рух коштів')) return;

    const lastRow = Math.max(
      sheet.getLastRow(),
      CASHFLOW_START_ROW + CASHFLOW_ROWS_BUFFER
    );

    const rowsCount =
      lastRow - CASHFLOW_START_ROW + 1;


    /********************************************
     * Пацієнт
     ********************************************/
    sheet
      .getRange(
        CASHFLOW_START_ROW,
        COL_PATIENT,
        rowsCount,
        1
      )
      .clearDataValidations();


    /********************************************
     * Тип
     ********************************************/
    sheet
      .getRange(
        CASHFLOW_START_ROW,
        COL_TYPE,
        rowsCount,
        1
      )
      .setDataValidation(typeRule);
  });

  applyAccrualMonthValidationAndHighlight_();

  SpreadsheetApp
    .getActive()
    .toast('Списки Cashflow оновлено');
}


/************************************************
 * DROPDOWN КАТЕГОРІЇ
 ************************************************/

function applyCategoryDropdownForRow_(sheet, row) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const dictSheet = ss.getSheetByName('Довідник');

  if (!dictSheet) return;

  const typeValue =
    clean_(
      sheet
        .getRange(row, COL_TYPE)
        .getDisplayValue()
    );

  const categoryCell =
    sheet.getRange(row, COL_CATEGORY);

  const currentCategory =
    clean_(
      categoryCell.getDisplayValue()
    );

  if (!typeValue) {

    categoryCell.clearDataValidations();

    return;
  }

  let options = [];


  /**********************************************
   * Доходи
   **********************************************/
  if (typeValue === 'Доходи') {
    options = getIncomeCategories_(dictSheet);
  }


  /**********************************************
   * Витрати
   **********************************************/
  if (typeValue === 'Витрати') {
    options = getExpenseCategories_(dictSheet);
  }


  /**********************************************
   * Інкасація
   **********************************************/
  if (typeValue === 'Інкасація') {
    options = ['Внутрішній трансфер'];
  }


  if (!options.length) {

    categoryCell.clearDataValidations();

    return;
  }


  const rule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(false)
    .build();

  categoryCell.setDataValidation(rule);

 

  /**********************************************
   * Якщо категорія більше не існує
   **********************************************/
  if (
    currentCategory &&
    !options.includes(currentCategory)
  ) {

    categoryCell.clearContent();

    sheet
      .getRange(row, COL_ARTICLE)
      .clearContent()
      .clearDataValidations();
  }
}


/************************************************
 * DROPDOWN СТАТТІ
 ************************************************/

function applyArticleDropdownForRow_(sheet, row) {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const dictSheet = ss.getSheetByName('Довідник');

  if (!dictSheet) return;

  const typeValue =
    clean_(
      sheet
        .getRange(row, COL_TYPE)
        .getDisplayValue()
    );

  const categoryValue =
    clean_(
      sheet
        .getRange(row, COL_CATEGORY)
        .getDisplayValue()
    );

  const articleCell =
    sheet.getRange(row, COL_ARTICLE);

  const currentArticle =
    clean_(
      articleCell.getDisplayValue()
    );

  if (!typeValue || !categoryValue) {

    articleCell.clearDataValidations();

    return;
  }

  let options = [];


  /**********************************************
   * Доходи
   **********************************************/
  if (typeValue === 'Доходи') {
    options =
      getIncomeArticles_(
        dictSheet,
        categoryValue
      );
  }


  /**********************************************
   * Витрати
   **********************************************/
  if (typeValue === 'Витрати') {
    options =
      getExpenseArticles_(
        dictSheet,
        categoryValue
      );
  }


  /**********************************************
   * Інкасація
   **********************************************/
  if (typeValue === 'Інкасація') {
    options = ['Внутрішній трансфер'];
  }


  if (!options.length) {

    articleCell.clearDataValidations();

    return;
  }


  const rule = SpreadsheetApp
    .newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(false)
    .build();

  articleCell.setDataValidation(rule);


  if (
    currentArticle &&
    !options.includes(currentArticle)
  ) {
    articleCell.clearContent();
  }
  dashboardIncomeDetailsHandleEdit_(e);

  dashboardIncomeSectorHandleEdit_(e);
}


/************************************************
 * КАТЕГОРІЇ ДОХОДІВ
 ************************************************/

function getIncomeCategories_(dictSheet) {

  const data = getDictCD_(dictSheet);

  const options = [];

  let inIncomeBlock = false;

  for (const row of data) {

    const name = row.name;
    const code = row.code;

    const lower = name.toLowerCase();

    if (!name) continue;

    if (
      lower.includes('статті доходу')
    ) {
      inIncomeBlock = true;
      continue;
    }

    if (
      inIncomeBlock &&
      lower.includes('статті витрат')
    ) {
      inIncomeBlock = false;
      continue;
    }

    if (
      inIncomeBlock &&
      name &&
      code
    ) {
      options.push(name);
    }
  }

  return unique_(options);
}


/************************************************
 * КАТЕГОРІЇ ВИТРАТ
 ************************************************/

function getExpenseCategories_(dictSheet) {

  const data = getDictCD_(dictSheet);

  const options = [];

  let inExpenses = false;

  for (let i = 0; i < data.length; i++) {

    const name = data[i].name;
    const code = data[i].code;

    const lower = name.toLowerCase();

    if (!name) continue;

    // ВАЖЛИВО:
    // службовим маркером є тільки заголовок блоку "Статті витрат..."
    // а не будь-яка категорія зі словом "витрати"
    if (lower.includes('статті витрат')) {
      inExpenses = true;
      continue;
    }

    if (!inExpenses) continue;

    if (
      name &&
      !code
    ) {

      const hasItemsBelow =
        hasItemsUntilNextHeader_(data, i);

      if (hasItemsBelow) {
        options.push(name);
      }
    }
  }

  return unique_(options);
}

/************************************************
 * СТАТТІ ДОХОДІВ
 ************************************************/

function getIncomeArticles_(
  dictSheet,
  categoryValue
 ) {

  const serviceOptions =
    getServiceOptionsFromDictionary_(
      dictSheet,
      categoryValue
    );

  if (serviceOptions.length) {
    return serviceOptions;
  }

  return [categoryValue];
}


/************************************************
 * СТАТТІ ВИТРАТ
 ************************************************/

function getExpenseArticles_(
  dictSheet,
  categoryValue
) {

  return getGroupOptionsFromGreenBlocks_(
    dictSheet,
    categoryValue
  );
}


/************************************************
 * ПОСЛУГИ
 ************************************************/

/************************************************
 * СТАТТІ ДОХОДІВ І ТОВАРНІ НАЙМЕНУВАННЯ
 *
 * Джерело:
 * Довідник!C:E до останнього заповненого рядка.
 *
 * C — категорія;
 * D — код, необов’язковий;
 * E — назва статті / товару / послуги.
 ************************************************/

function getServiceOptionsFromDictionary_(
  dictSheet,
  selectedValue
 ) {
  if (!dictSheet) {
    return [];
  }

  const lastRow =
    dictSheet.getLastRow();

  if (lastRow < 1) {
    return [];
  }

  const selected =
    clean_(
      selectedValue
    ).toLowerCase();

  if (!selected) {
    return [];
  }

  const data =
    dictSheet
      .getRange(
        1,
        3,
        lastRow,
        3
      )
      .getDisplayValues();

  const options =
    data
      .filter(function(row) {
        const category =
          clean_(
            row[0]
          ).toLowerCase();

        const name =
          clean_(
            row[2]
          );

        /*
         * Код у колонці D може бути порожнім.
         * Обов’язкові лише категорія і назва.
         */
        return (
          category === selected &&
          Boolean(name)
        );
      })
      .map(function(row) {
        return clean_(
          row[2]
        );
      });

  return unique_(
    options
  );
}


/************************************************
 * СТАТТІ З БЛОКІВ
 ************************************************/

function getGroupOptionsFromGreenBlocks_(
  dictSheet,
  selectedValue
) {

  const data = getDictCD_(dictSheet);

  const selected =
    clean_(selectedValue).toLowerCase();

  const options = [];

  let foundGroup = false;

  for (const row of data) {

    const name = row.name;
    const code = row.code;

    if (!name) continue;

    if (
      name.toLowerCase() === selected &&
      !code
    ) {
      foundGroup = true;
      continue;
    }

    if (
      foundGroup &&
      name &&
      !code
    ) break;

    if (
      foundGroup &&
      name &&
      code
    ) {
      options.push(name);
    }
  }

  return unique_(options);
}


/************************************************
 * ПЕРЕВІРКА ГРУП
 ************************************************/

function hasItemsUntilNextHeader_(
  data,
  startIndex
) {

  for (
    let i = startIndex + 1;
    i < data.length;
    i++
  ) {

    const name = data[i].name;
    const code = data[i].code;

    if (!name) continue;

    if (name && !code) return false;

    if (name && code) return true;
  }

  return false;
}


/************************************************
 * ДАНІ ДОВІДНИКА
 ************************************************/

function getDictCD_(dictSheet) {

  const lastRow = dictSheet.getLastRow();

  if (lastRow < 1) return [];

  return dictSheet
    .getRange(1, 3, lastRow, 2)
    .getDisplayValues()
    .map(r => ({
      name: clean_(r[0]),
      code: clean_(r[1])
    }));
}


/************************************************
 * CLEAN
 ************************************************/

function clean_(value) {

  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


/************************************************
 * UNIQUE
 ************************************************/

function unique_(arr) {

  return [
    ...new Set(
      arr.filter(v => clean_(v) !== '')
    )
  ];
}


/************************************************
 * КОЛЬОРИ ТИПІВ
 ************************************************/

function applyTypeColorsForRow_(
  sheet,
  row,
  force
) {

  const typeCell =
    sheet.getRange(row, COL_TYPE);

  const typeValue =
    clean_(typeCell.getDisplayValue());

  const currentColor =
    typeCell.getBackground();

  const colors = {
    'Доходи': '#d9ead3',
    'Витрати': '#f4cccc',
    'Інкасація': '#fff2cc'
  };

  if (!colors[typeValue]) {

    if (force) {
      typeCell.setBackground(null);
    }

    return;
  }

  if (
    !force &&
    currentColor &&
    currentColor !== '#ffffff'
  ) {
    return;
  }

  typeCell.setBackground(colors[typeValue]);
}


/************************************************
 * НАРАХУВАННЯ
 ************************************************/

function applyAccrualMonthValidationAndHighlight_() {

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const monthOptions = [
    '01.2026',
    '02.2026',
    '03.2026',
    '04.2026',
    '05.2026',
    '06.2026',
    '07.2026',
    '08.2026',
    '09.2026',
    '10.2026',
    '11.2026',
    '12.2026'
  ];

  const dropdownRule =
    SpreadsheetApp
      .newDataValidation()
      .requireValueInList(monthOptions, true)
      .setAllowInvalid(false)
      .build();

  ss.getSheets().forEach(sheet => {

    if (
      !sheet.getName().startsWith('Рух коштів')
    ) return;

    const lastRow = Math.max(
      sheet.getLastRow(),
      CASHFLOW_START_ROW + CASHFLOW_ROWS_BUFFER
    );

    const rowsCount =
      lastRow - CASHFLOW_START_ROW + 1;

    const accrualRange =
      sheet.getRange(
        CASHFLOW_START_ROW,
        COL_ACCRUAL_MONTH,
        rowsCount,
        1
      );

    accrualRange.setDataValidation(dropdownRule);

    const existingRules =
      sheet.getConditionalFormatRules();

    const filteredRules =
      existingRules.filter(rule => {

        return !rule
          .getRanges()
          .some(range =>

            range.getColumn() === COL_ACCRUAL_MONTH &&
            range.getRow() === CASHFLOW_START_ROW
          );
      });

    const highlightRule =
      SpreadsheetApp
        .newConditionalFormatRule()
        .whenFormulaSatisfied(
          '=AND($M10<>"";$N10="")'
        )
        .setBackground('#f4cccc')
        .setRanges([accrualRange])
        .build();

    sheet.setConditionalFormatRules([
      ...filteredRules,
      highlightRule
    ]);
  });
}
function auditCosmeticDirectoryDropdown() {
  const spreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();

  const dictionarySheet =
    spreadsheet.getSheetByName(
      'Довідник'
    );

  if (!dictionarySheet) {
    throw new Error(
      'Не знайдено лист «Довідник».'
    );
  }

  const names =
    getIncomeArticles_(
      dictionarySheet,
      'Косметичні засоби'
    );

  const result = {
    ok:
      true,

    category:
      'Косметичні засоби',

    namesCount:
      names.length,

    lastNames:
      names.slice(
        -15
      ),

    businessValuesChanged:
      false
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  SpreadsheetApp
    .getActive()
    .toast(
      'Знайдено найменувань: ' +
      names.length,
      'Аудит довідника',
      8
    );

  return result;
}