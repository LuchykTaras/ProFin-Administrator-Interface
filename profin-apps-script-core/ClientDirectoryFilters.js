/****************************************************
 * ProFin OS — динамічні фільтри клієнтської бази
 *
 * Фільтри:
 * C3 — дитина;
 * D3 — дата народження;
 * G3 — лікар.
 ****************************************************/

const CLIENT_DIRECTORY_FILTER_CONFIG = {
  sheetName: 'Клієнтська база',

  filterClientCellA1: 'C3',
  filterBirthDateCellA1: 'D3',
  filterDoctorCellA1: 'G3',

  headerRow: 4,
  firstDataRow: 5,

  clientNameColumn: 3,  // C
  birthDateColumn: 4,   // D
  doctorColumn: 7,      // G

  serviceSheetName: '__ProFin_Фільтри_клієнтів'
};


/**
 * Запустити один раз після вставлення модуля.
 */
function setupClientDirectoryFilters() {
  refreshClientDirectoryFilterSources_();
  applyClientDirectoryFilters_();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Динамічні фільтри клієнтської бази налаштовано.',
    'ProFin OS',
    5
  );
}


/**
 * Обробляє зміну одного з трьох фільтрів.
 */
function handleClientDirectoryFilterEdit_(e) {
  if (!e || !e.range) {
    return false;
  }

  const config = CLIENT_DIRECTORY_FILTER_CONFIG;
  const sheet = e.range.getSheet();

  if (sheet.getName() !== config.sheetName) {
    return false;
  }

  const editedA1 = e.range.getA1Notation();

  /*
   * H3 — прапорець «Очистити фільтр».
   * Після очищення він сам повертається у вимкнений стан.
   */
  if (editedA1 === 'H3') {
    if (e.range.getValue() === true) {
      sheet.getRange(config.filterClientCellA1).clearContent();
      sheet.getRange(config.filterBirthDateCellA1).clearContent();
      sheet.getRange(config.filterDoctorCellA1).clearContent();

      e.range.setValue(false);

      applyClientDirectoryFilters_();
    }

    return true;
  }

  if (
    editedA1 !== config.filterClientCellA1 &&
    editedA1 !== config.filterBirthDateCellA1 &&
    editedA1 !== config.filterDoctorCellA1
  ) {
    return false;
  }

  applyClientDirectoryFilters_();

  return true;
}


/**
 * Формує динамічні джерела dropdown.
 * Формули автоматично бачать усі нові рядки бази.
 */
function refreshClientDirectoryFilterSources_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = CLIENT_DIRECTORY_FILTER_CONFIG;

  const clientsSheet = ss.getSheetByName(config.sheetName);

  if (!clientsSheet) {
    throw new Error('Не знайдено лист «Клієнтська база».');
  }

  let serviceSheet = ss.getSheetByName(
    config.serviceSheetName
  );

  if (!serviceSheet) {
    serviceSheet = ss.insertSheet(
      config.serviceSheetName
    );
  }

  /*
   * У базі вже понад 3 700 клієнтів.
   * Додаємо запас, щоб динамічні списки мали куди розгортатися.
   */
  const requiredRows = Math.max(
    clientsSheet.getLastRow() + 1000,
    10000
  );

  if (serviceSheet.getMaxRows() < requiredRows) {
    serviceSheet.insertRowsAfter(
      serviceSheet.getMaxRows(),
      requiredRows - serviceSheet.getMaxRows()
    );
  }

  serviceSheet.clearContents();

  serviceSheet.getRange('A1:C1').setValues([[
    'Діти',
    'Дати народження',
    'Лікарі'
  ]]);

    serviceSheet.getRange('A2').setFormula(
    '=SORT(UNIQUE(FILTER(\'Клієнтська база\'!C5:C;' +
    '\'Клієнтська база\'!C5:C<>"")))'
  );

  serviceSheet.getRange('B2').setFormula(
    '=SORT(UNIQUE(FILTER(\'Клієнтська база\'!D5:D;' +
    '\'Клієнтська база\'!D5:D<>"")))'
  );

  serviceSheet.getRange('C2').setFormula(
    '=SORT(UNIQUE(FILTER(\'Клієнтська база\'!G5:G;' +
    '\'Клієнтська база\'!G5:G<>"")))'
  );

  serviceSheet.getRange('B:B')
    .setNumberFormat('dd.MM.yyyy');

  const clientValidation =
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(
        serviceSheet.getRange('A2:A'),
        true
      )
      .setAllowInvalid(true)
      .build();

  const doctorValidation =
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(
        serviceSheet.getRange('C2:C'),
        true
      )
      .setAllowInvalid(true)
      .build();

  clientsSheet
    .getRange(config.filterClientCellA1)
    .setDataValidation(clientValidation);

  clientsSheet
    .getRange(config.filterBirthDateCellA1)
    .clearDataValidations()
    .setNumberFormat('@')
    .setNote(
      'Введіть рік (наприклад, 2008) або дату (30.03.2008).'
    );

  clientsSheet
    .getRange(config.filterDoctorCellA1)
    .setDataValidation(doctorValidation);

  serviceSheet.hideSheet();
}


/**
 * Застосовує фільтри до всіх фактичних рядків клієнтської бази.
 */
function applyClientDirectoryFilters_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = CLIENT_DIRECTORY_FILTER_CONFIG;
  const sheet = ss.getSheetByName(config.sheetName);

  if (!sheet) {
    throw new Error('Не знайдено лист «Клієнтська база».');
  }

  const lastRow = Math.max(
    sheet.getLastRow(),
    config.firstDataRow
  );

  const lastColumn = sheet.getLastColumn();
  const targetRange = sheet.getRange(
    config.headerRow,
    1,
    lastRow - config.headerRow + 1,
    lastColumn
  );

  let filter = sheet.getFilter();

  if (filter) {
    const currentRange = filter.getRange();

    if (
      currentRange.getRow() !== config.headerRow ||
      currentRange.getNumRows() !== targetRange.getNumRows() ||
      currentRange.getNumColumns() !== targetRange.getNumColumns()
    ) {
      filter.remove();
      filter = null;
    }
  }

  if (!filter) {
    filter = targetRange.createFilter();
  }

  applyClientDirectoryTextFilter_(
    filter,
    config.clientNameColumn,
    sheet.getRange(config.filterClientCellA1)
      .getDisplayValue()
  );

  applyClientDirectoryDateFilter_(
    filter,
    config.birthDateColumn,
    sheet.getRange(config.filterBirthDateCellA1)
      .getValue()
  );

  applyClientDirectoryTextFilter_(
    filter,
    config.doctorColumn,
    sheet.getRange(config.filterDoctorCellA1)
      .getDisplayValue()
  );
}


function applyClientDirectoryTextFilter_(
  filter,
  column,
  value
) {
  const text = String(value || '').trim();

  if (!text) {
    filter.removeColumnFilterCriteria(column);
    return;
  }

  const criteria = SpreadsheetApp
    .newFilterCriteria()
    .whenTextEqualTo(text)
    .build();

  filter.setColumnFilterCriteria(
    column,
    criteria
  );
}


function applyClientDirectoryDateFilter_(
  filter,
  column,
  value
) {
  const config = CLIENT_DIRECTORY_FILTER_CONFIG;
  const text = String(value || '').trim();

  if (!text) {
    filter.removeColumnFilterCriteria(column);
    return;
  }

  let formula = '';

  if (/^\d{4}$/.test(text)) {
    formula =
      '=YEAR($D' +
      config.firstDataRow +
      ')=' +
      text;
  } else {
    const match = text.match(
      /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/
    );

    if (!match) {
      filter.removeColumnFilterCriteria(column);
      return;
    }

    const day = Number(match[1]);
    const month = Number(match[2]);
    const year = Number(match[3]);

    formula =
      '=INT($D' +
      config.firstDataRow +
      ')=DATE(' +
      year + ',' +
      month + ',' +
      day +
      ')';
  }

  const criteria = SpreadsheetApp
    .newFilterCriteria()
    .whenFormulaSatisfied(formula)
    .build();

  filter.setColumnFilterCriteria(
    column,
    criteria
  );
}