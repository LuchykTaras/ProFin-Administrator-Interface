/********************************************************
 * ProFin OS — клієнтський dropdown у «Ввід операцій»
 * Патч 1: побудова та оновлення списку пацієнтів у B10.
 *
 * Джерело: «Клієнтська база»
 * Заголовки: рядок 4
 * Дані: з рядка 5
 ********************************************************/

const PROF_IN_CLIENTS_CONFIG = {
  inputSheetName: 'Ввід операцій',
  clientsSheetName: 'Клієнтська база',
  serviceSheetName: '__ProFin_Службові_списки',

  patientCellA1: 'B10',
  clientsHeaderRow: 4,
  clientsFirstDataRow: 5,

  clientIdColumn: 1,       // A — ID клієнта
  clientNameColumn: 3,     // C — ПІБ клієнта
  birthDateColumn: 4,      // D — Дата народження

  newClientOption: '➕ Новий клієнт'
};


/**
 * Запустити один раз після вставлення патчу.
 *
 * Надалі цю ж функцію викликатиме модуль створення нового
 * клієнта — щоб оновити dropdown у B10.
 */
function setupPatientDropdown() {
  refreshPatientDropdown_();

  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Dropdown «Пацієнт» у B10 оновлено.',
    'ProFin OS',
    5
  );
}


/**
 * Оновлює технічний список пацієнтів і строгий dropdown B10.
 * Призначена також для виклику після створення нового клієнта.
 */
function refreshPatientDropdown_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const config = PROF_IN_CLIENTS_CONFIG;

  const inputSheet = ss.getSheetByName(config.inputSheetName);
  const clientsSheet = ss.getSheetByName(config.clientsSheetName);

  if (!inputSheet) {
    throw new Error(
      'Не знайдено лист «' + config.inputSheetName + '».'
    );
  }

  if (!clientsSheet) {
    throw new Error(
      'Не знайдено лист «' + config.clientsSheetName + '».'
    );
  }

  validateClientBaseStructure_(clientsSheet);

  const serviceSheet = getOrCreateProFinServiceSheet_(ss);

  const patientRows = buildPatientDropdownRows_(clientsSheet);

  serviceSheet.clearContents();

  serviceSheet.getRange(1, 1, 1, 2).setValues([[
    'Відображення у dropdown',
    'ID клієнта'
  ]]);

  serviceSheet.getRange(2, 1, patientRows.length, 2)
    .setValues(patientRows);

  const dropdownRange = serviceSheet.getRange(
    2,
    1,
    patientRows.length,
    1
  );

  const validationRule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(dropdownRange, true)
    .setAllowInvalid(false)
    .setHelpText(
      'Оберіть пацієнта зі списку або пункт «➕ Новий клієнт».'
    )
    .build();

  inputSheet
    .getRange(config.patientCellA1)
    .setDataValidation(validationRule);

  serviceSheet.hideSheet();
}


/**
 * Перевіряє критичну структуру «Клієнтської бази».
 * Не змінює жодних даних.
 */
function validateClientBaseStructure_(clientsSheet) {
  const config = PROF_IN_CLIENTS_CONFIG;

  const headers = clientsSheet
    .getRange(config.clientsHeaderRow, 1, 1, 4)
    .getDisplayValues()[0]
    .map(function(value) {
      return String(value).trim();
    });

  const expectedHeaders = [
    'ID клієнта',
    'Зовнішній CRM ID',
    'ПІБ клієнта',
    'Дата народження'
  ];

  expectedHeaders.forEach(function(expectedHeader, index) {
    if (headers[index] !== expectedHeader) {
      throw new Error(
        'Некоректна структура листа «Клієнтська база». ' +
        'У рядку ' + config.clientsHeaderRow +
        ', колонці ' + String.fromCharCode(65 + index) +
        ' очікується заголовок «' + expectedHeader + '».'
      );
    }
  });
}


/**
 * Формує рядки для технічного списку:
 * [відображення в B10, ID клієнта].
 */
function buildPatientDropdownRows_(clientsSheet) {
  const config = PROF_IN_CLIENTS_CONFIG;
  const lastRow = clientsSheet.getLastRow();

  const result = [];
  const usedLabels = {};

  if (lastRow >= config.clientsFirstDataRow) {
    const rowsCount = lastRow - config.clientsFirstDataRow + 1;

    const clientValues = clientsSheet
      .getRange(
        config.clientsFirstDataRow,
        config.clientIdColumn,
        rowsCount,
        config.birthDateColumn
      )
      .getValues();

    clientValues.forEach(function(row) {
      const clientId = String(
        row[config.clientIdColumn - 1] || ''
      ).trim();

      const clientName = String(
        row[config.clientNameColumn - 1] || ''
      ).trim();

      const birthDate = formatClientBirthDate_(
        row[config.birthDateColumn - 1]
      );

      if (!clientId || !clientName) {
        return;
      }

      const label = clientName + ' · ' + birthDate;

      /*
       * Однаковий ПІБ + однакова дата народження не прибираються
       * з бази. У dropdown лишається один видимий варіант.
       *
       * Відображення дублікатів і подальший вибір конкретного ID
       * буде окремим наступним патчем логіки B10.
       */
      if (!usedLabels[label]) {
        result.push([label, clientId]);
        usedLabels[label] = true;
      }
    });
  }

  result.sort(function(a, b) {
    return a[0].localeCompare(b[0], 'uk');
  });

   return [[
    config.newClientOption,
    ''
  ]].concat(result);
}

/**
 * Форматує дату для відображення у dropdown.
 * Телефон, CRM ID та інші персональні дані не виводяться.
 */
function formatClientBirthDate_(value) {
  if (!value) {
    return 'дата не вказана';
  }

  if (Object.prototype.toString.call(value) === '[object Date]' &&
      !isNaN(value.getTime())) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'dd.MM.yyyy'
    );
  }

  return String(value).trim();
}


/**
 * Повертає технічний лист або створює його за потреби.
 */
function getOrCreateProFinServiceSheet_(ss) {
  const config = PROF_IN_CLIENTS_CONFIG;
  let serviceSheet = ss.getSheetByName(config.serviceSheetName);

  if (!serviceSheet) {
    serviceSheet = ss.insertSheet(config.serviceSheetName);
  }

  return serviceSheet;
}