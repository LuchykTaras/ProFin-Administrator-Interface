/****************************************************
 * ОДНОРАЗОВИЙ ІМПОРТ ІСТОРИЧНИХ ДАНИХ
 * Джерело: "Рух коштів Квітень", "Рух коштів Травень"
 * Призначення: "База операцій"
 ****************************************************/

function importHistoricalAprilMayToBase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const baseSheet = ss.getSheetByName('База операцій');

  if (!baseSheet) {
    throw new Error('Не знайдено лист "База операцій"');
  }

  const sources = [
    {
      sheetName: 'Рух коштів Квітень',
      prefix: 'HIST-APR'
    },
    {
      sheetName: 'Рух коштів Травень',
      prefix: 'HIST-MAY'
    }
  ];

  let imported = 0;

  sources.forEach(source => {
    const sourceSheet = ss.getSheetByName(source.sheetName);

    if (!sourceSheet) {
      Logger.log('Не знайдено лист: ' + source.sheetName);
      return;
    }

    const rows = readHistoricalCashFlowRows_(sourceSheet, source.prefix);

    if (!rows.length) {
      Logger.log('Немає даних для імпорту: ' + source.sheetName);
      return;
    }

    writeHistoricalRowsToBase_(baseSheet, rows);
    imported += rows.length;
  });

  SpreadsheetApp.getActive().toast('Імпортовано історичних рядків: ' + imported);
}

/****************************************************
 * ЧИТАЄ РЯДКИ З ІСТОРИЧНОГО ЛИСТА
 ****************************************************/
function readHistoricalCashFlowRows_(sheet, prefix) {
  const startRow = 10;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) return [];

  const data = sheet
    .getRange(startRow, 1, lastRow - startRow + 1, 17)
    .getValues();

  const result = [];

  data.forEach((row, index) => {
    const account = clean_(row[1]);        // B Рахунок
    const date = row[2];                   // C Дата транзакції
    const unitPrice = numOrBlank_(row[3]); // D Ціна за одиницю
    const quantity = numOrBlank_(row[4]);  // E Кількість
    const amount = numOrBlank_(row[5]);    // F Сума
    const doctor = clean_(row[6]);         // G Лікар
    const patient = clean_(row[7]);        // H Пацієнт
    const type = clean_(row[8]);           // I Тип
    const category = clean_(row[9]);       // J Категорія
    const article = clean_(row[10]);       // K Стаття
    const comment = clean_(row[11]);       // L Коментар

    if (!date || !amount || !type) return;

    const operationDate = date instanceof Date ? date : parseHistoricalDate_(date);

    if (!operationDate) return;

    const id = prefix + '-' +
      Utilities.formatDate(operationDate, Session.getScriptTimeZone(), 'yyyyMMdd') +
      '-' +
      String(index + 1).padStart(3, '0');

    result.push([
      id,                         // A ID
      account,                    // B Рахунок
      '',                         // C На рахунок
      operationDate,              // D Дата

      unitPrice || amount,         // E Ціна за одиницю
      quantity || 1,               // F Кількість
      Number(amount) || 0,         // G Сума

      doctor,                     // H Лікар
      patient,                    // I Пацієнт

      type,                       // J Тип
      category,                   // K Категорія
      article,                    // L Стаття
      comment || 'Імпорт історичних даних', // M Коментар

      getMonthText_(operationDate), // N Місяць виплати
      getMonthText_(operationDate), // O Місяць нарахування

      type,                       // P Тип для звітності

      '', '', '', '',              // Q:T Пакети
      '', '', '', '',              // U:X Вакцини
      '', '', '', '',              // Y:AB Активи

      'Імпортовано',               // AC Статус
      new Date(),                  // AD Дата створення
      getSafeUserEmail_()          // AE Користувач
    ]);
  });

  return result;
}

/****************************************************
 * ЗАПИС У ПЕРШИЙ ВІЛЬНИЙ РЯДОК БАЗИ
 ****************************************************/
function writeHistoricalRowsToBase_(baseSheet, rows) {
  const startRow = 10;

  const idValues = baseSheet
    .getRange(startRow, 1, Math.max(baseSheet.getMaxRows() - startRow + 1, 1), 1)
    .getDisplayValues();

  let targetRow = startRow;

  for (let i = 0; i < idValues.length; i++) {
    if (!clean_(idValues[i][0])) {
      targetRow = startRow + i;
      break;
    }
  }

  baseSheet
    .getRange(targetRow, 1, rows.length, rows[0].length)
    .setValues(rows);
}

/****************************************************
 * ДАТА ЗІ СТАРИХ ЛИСТІВ
 ****************************************************/
function parseHistoricalDate_(value) {
  if (value instanceof Date && !isNaN(value)) return value;

  const text = clean_(value);

  const match = text.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!match) return null;

  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1])
  );
}