/****************************************************
 * PROFIN OS — МІЖФІЛІЙНЕ ПЕРЕМІЩЕННЯ
 * КРОК 1. КОНФІГУРАЦІЯ ТА СУХИЙ АУДИТ
 *
 * Модуль:
 * — визначає поточну філію;
 * — відкриває обидві таблиці;
 * — перевіряє робочі листи;
 * — перевіряє заголовки;
 * — не записує і не змінює жодної клітинки.
 ****************************************************/


/****************************************************
 * КОНФІГУРАЦІЯ ФІЛІЙ
 *
 * ВАЖЛИВО:
 * ID чутливі до регістру.
 * Перед запуском звірте їх з адресним рядком.
 ****************************************************/

const INTERBRANCH_TRANSFER_CONFIG =
  Object.freeze({

    version:
      '1.0',

    branches:
  Object.freeze({

    'Альтернатива':
  Object.freeze({
    code:
      'ALT',

    spreadsheetId:
      '1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8'
  }),

'Бабурка':
  Object.freeze({
    code:
      'BAB',

    spreadsheetId:
      '1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw'
  })
  }),
    sheetNames:
      Object.freeze({
        stock:
          'Склад медичних запасів',

        movement:
          'Рух складу',

        transferJournal:
          'Переміщення між філіями'
      }),

    /*
     * Структура складу A:AB.
     */
    stockHeaders:
      Object.freeze([
        'ID партії',
        'ID операції надходження',
        'Тип запасу',
        'Найменування',
        'Серія',
        'Термін придатності',
        'Дата надходження',
        'Постачальник',
        'Прийнято',
        'Собівартість одиниці',
        'Загальна закупівельна вартість',
        'Продано / використано',
        'Передано на зберігання',
        'Списано',
        'Поточний залишок',
        'Мінімальний залишок (поріг для попередження)',
        'Статус',
        'Користувач',
        'Дата і час створення',
        'ID переміщення',
        'Філія-відправник',
        'Філія-одержувач',
        'Кількість переміщення',
        'Статус переміщення',
        'Дія',
        'Дата та час переміщення',
        'Користувач переміщення',
        'Передано у філії'
      ]),

    /*
     * Структура руху складу A:L.
     */
    movementHeaders:
      Object.freeze([
        'ID руху',
        'ID операції',
        'Дата',
        'Тип запасу',
        'Найменування',
        'ID партії',
        'Тип руху',
        'Кількість',
        'Собівартість одиниці',
        'Загальна собівартість',
        'Користувач',
        'Дата і час створення'
      ]),

    /*
     * Структура журналу переміщень A:T.
     */
    transferJournalHeaders:
      Object.freeze([
        'ID переміщення',
        'Дата створення',
        'Філія-відправник',
        'Філія-одержувач',
        'ID вихідної партії',
        'ID партії одержувача',
        'Тип запасу',
        'Найменування',
        'Серія',
        'Термін придатності',
        'Кількість',
        'Собівартість одиниці',
        'Загальна собівартість',
        'Статус',
        'Хто передав',
        'Дата і час передачі',
        'Хто прийняв / повернув',
        'Дата приймання / повернення',
        'Коментар',
        'Технічна помилка'
      ])
  });


/****************************************************
 * ГОЛОВНИЙ СУХИЙ ТЕСТ
 *
 * Запускається вручну.
 * Не записує дані.
 *
 * @return {Object}
 ****************************************************/

function testInterbranchTransferReadiness() {
  const startedAt =
    new Date();

  const activeSpreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const activeSpreadsheetId =
    activeSpreadsheet.getId();

  const result = {
    ok:
      false,

    test:
      'testInterbranchTransferReadiness',

    version:
      INTERBRANCH_TRANSFER_CONFIG
        .version,

    startedAt:
      startedAt,

    finishedAt:
      null,

    activeSpreadsheetId:
      activeSpreadsheetId,

    activeSpreadsheetName:
      activeSpreadsheet.getName(),

    currentBranch:
      '',

    remoteBranch:
      '',

    branches:
      {},

    errors:
      [],

    warnings:
      [],

    writeOperationsExecuted:
      0,

    noCellsWritten:
      true
  };

  try {
    /****************************************************
     * 1. ВИЗНАЧЕННЯ ПОТОЧНОЇ ФІЛІЇ
     ****************************************************/

    const currentBranch =
      getCurrentInterbranchBranch_(
        activeSpreadsheetId
      );

    if (!currentBranch) {
      result.errors.push(
        'Поточна таблиця не знайдена в INTERBRANCH_TRANSFER_CONFIG. ' +
        'Перевірте spreadsheetId.'
      );

      return finalizeInterbranchReadinessResult_(
        result
      );
    }

    const remoteBranch =
      getRemoteInterbranchBranch_(
        currentBranch.name
      );

    if (!remoteBranch) {
      result.errors.push(
        'Не вдалося визначити іншу філію для "' +
        currentBranch.name +
        '".'
      );

      return finalizeInterbranchReadinessResult_(
        result
      );
    }

    result.currentBranch =
      currentBranch.name;

    result.remoteBranch =
      remoteBranch.name;

    /****************************************************
     * 2. ПЕРЕВІРКА КОНФІГУРАЦІЇ ID
     ****************************************************/

    if (
      currentBranch.spreadsheetId ===
      remoteBranch.spreadsheetId
    ) {
      result.errors.push(
        'Для двох філій указано однаковий spreadsheetId.'
      );

      return finalizeInterbranchReadinessResult_(
        result
      );
    }

    /****************************************************
     * 3. ПЕРЕВІРКА ОБОХ ТАБЛИЦЬ
     ****************************************************/

    Object.keys(
      INTERBRANCH_TRANSFER_CONFIG
        .branches
    ).forEach(
      function(branchName) {
        const branchConfig =
          INTERBRANCH_TRANSFER_CONFIG
            .branches[
              branchName
            ];

        const branchResult =
          inspectInterbranchBranch_(
            branchName,
            branchConfig,
            activeSpreadsheetId,
            activeSpreadsheet
          );

        result.branches[
          branchName
        ] =
          branchResult;

        if (
          Array.isArray(
            branchResult.errors
          )
        ) {
          branchResult.errors.forEach(
            function(errorMessage) {
              result.errors.push(
                branchName +
                ': ' +
                errorMessage
              );
            }
          );
        }

        if (
          Array.isArray(
            branchResult.warnings
          )
        ) {
          branchResult.warnings.forEach(
            function(warningMessage) {
              result.warnings.push(
                branchName +
                ': ' +
                warningMessage
              );
            }
          );
        }
      }
    );

    /****************************************************
     * 4. ФІНАЛЬНИЙ КОНТРОЛЬ
     ****************************************************/

    result.ok =
      result.errors.length === 0;

    return finalizeInterbranchReadinessResult_(
      result
    );

  } catch (error) {
    result.errors.push(
      getInterbranchErrorMessage_(
        error
      )
    );

    result.ok =
      false;

    return finalizeInterbranchReadinessResult_(
      result
    );
  }
}


/****************************************************
 * ВИЗНАЧЕННЯ ПОТОЧНОЇ ФІЛІЇ
 *
 * @param {string} spreadsheetId
 * @return {Object|null}
 ****************************************************/

function getCurrentInterbranchBranch_(
  spreadsheetId
) {
  const expectedId =
    String(
      spreadsheetId || ''
    ).trim();

  if (!expectedId) {
    return null;
  }

  const branches =
    INTERBRANCH_TRANSFER_CONFIG
      .branches;

  const branchNames =
    Object.keys(
      branches
    );

  for (
    let index = 0;
    index < branchNames.length;
    index++
  ) {
    const branchName =
      branchNames[index];

    const branchConfig =
      branches[
        branchName
      ];

    if (
      String(
        branchConfig
          .spreadsheetId || ''
      ).trim() ===
      expectedId
    ) {
      return {
        name:
          branchName,

        code:
          branchConfig.code,

        spreadsheetId:
          branchConfig
            .spreadsheetId
      };
    }
  }

  return null;
}


/****************************************************
 * ВИЗНАЧЕННЯ ІНШОЇ ФІЛІЇ
 *
 * @param {string} currentBranchName
 * @return {Object|null}
 ****************************************************/

function getRemoteInterbranchBranch_(
  currentBranchName
) {
  const currentName =
    String(
      currentBranchName || ''
    ).trim();

  const branches =
    INTERBRANCH_TRANSFER_CONFIG
      .branches;

  const remoteName =
    Object.keys(
      branches
    ).find(
      function(branchName) {
        return (
          branchName !==
          currentName
        );
      }
    );

  if (!remoteName) {
    return null;
  }

  return {
    name:
      remoteName,

    code:
      branches[
        remoteName
      ].code,

    spreadsheetId:
      branches[
        remoteName
      ].spreadsheetId
  };
}


/****************************************************
 * ПЕРЕВІРКА ОДНІЄЇ ФІЛІЇ
 *
 * @param {string} branchName
 * @param {Object} branchConfig
 * @param {string} activeSpreadsheetId
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
 *        activeSpreadsheet
 * @return {Object}
 ****************************************************/

function inspectInterbranchBranch_(
  branchName,
  branchConfig,
  activeSpreadsheetId,
  activeSpreadsheet
) {
  const branchResult = {
    ok:
      false,

    branch:
      branchName,

    code:
      String(
        branchConfig.code || ''
      ).trim(),

    spreadsheetId:
      String(
        branchConfig
          .spreadsheetId || ''
      ).trim(),

    spreadsheetName:
      '',

    isCurrentFile:
      false,

    accessible:
      false,

    sheets:
      {},

    errors:
      [],

    warnings:
      []
  };

  if (
    !branchResult
      .spreadsheetId
  ) {
    branchResult.errors.push(
      'Не заповнено spreadsheetId.'
    );

    return branchResult;
  }

  if (!branchResult.code) {
    branchResult.errors.push(
      'Не заповнено код філії.'
    );
  }

  try {
    const isCurrentFile =
      branchResult
        .spreadsheetId ===
      activeSpreadsheetId;

    branchResult.isCurrentFile =
      isCurrentFile;

    const spreadsheet =
      isCurrentFile
        ? activeSpreadsheet
        : SpreadsheetApp.openById(
            branchResult
              .spreadsheetId
          );

    branchResult.accessible =
      true;

    branchResult.spreadsheetName =
      spreadsheet.getName();

    /****************************************************
     * СКЛАД
     ****************************************************/

    branchResult.sheets.stock =
      checkInterbranchSheetStructure_(
        spreadsheet,
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .stock,
        INTERBRANCH_TRANSFER_CONFIG
          .stockHeaders
      );

    /****************************************************
     * РУХ СКЛАДУ
     ****************************************************/

    branchResult.sheets.movement =
      checkInterbranchSheetStructure_(
        spreadsheet,
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .movement,
        INTERBRANCH_TRANSFER_CONFIG
          .movementHeaders
      );

    /****************************************************
     * ЖУРНАЛ ПЕРЕМІЩЕНЬ
     ****************************************************/

    branchResult
      .sheets
      .transferJournal =
      checkInterbranchSheetStructure_(
        spreadsheet,
        INTERBRANCH_TRANSFER_CONFIG
          .sheetNames
          .transferJournal,
        INTERBRANCH_TRANSFER_CONFIG
          .transferJournalHeaders
      );

    Object.keys(
      branchResult.sheets
    ).forEach(
      function(sheetKey) {
        const sheetResult =
          branchResult
            .sheets[
              sheetKey
            ];

        if (
          Array.isArray(
            sheetResult.errors
          )
        ) {
          sheetResult.errors.forEach(
            function(message) {
              branchResult.errors.push(
                message
              );
            }
          );
        }

        if (
          Array.isArray(
            sheetResult.warnings
          )
        ) {
          sheetResult.warnings.forEach(
            function(message) {
              branchResult.warnings.push(
                message
              );
            }
          );
        }
      }
    );

    branchResult.ok =
      branchResult
        .errors
        .length === 0;

    return branchResult;

  } catch (error) {
    branchResult.errors.push(
      'Не вдалося відкрити або прочитати таблицю: ' +
      getInterbranchErrorMessage_(
        error
      )
    );

    branchResult.ok =
      false;

    return branchResult;
  }
}


/****************************************************
 * ПЕРЕВІРКА ЛИСТА ТА ЗАГОЛОВКІВ
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet}
 *        spreadsheet
 * @param {string} sheetName
 * @param {string[]} expectedHeaders
 * @return {Object}
 ****************************************************/

function checkInterbranchSheetStructure_(
  spreadsheet,
  sheetName,
  expectedHeaders
) {
  const result = {
    ok:
      false,

    sheetName:
      sheetName,

    exists:
      false,

    expectedColumnCount:
      expectedHeaders.length,

    actualColumnCount:
      0,

    lastRow:
      0,

    errors:
      [],

    warnings:
      []
  };

  const sheet =
    spreadsheet
      .getSheetByName(
        sheetName
      );

  if (!sheet) {
    result.errors.push(
      'Не знайдено лист "' +
      sheetName +
      '".'
    );

    return result;
  }

  result.exists =
    true;

  result.lastRow =
    sheet.getLastRow();

  if (
    sheet.getMaxColumns() <
    expectedHeaders.length
  ) {
    result.errors.push(
      'Лист "' +
      sheetName +
      '" має ' +
      sheet.getMaxColumns() +
      ' колонок, потрібно щонайменше ' +
      expectedHeaders.length +
      '.'
    );

    return result;
  }

  const actualHeaders =
    sheet
      .getRange(
        1,
        1,
        1,
        expectedHeaders.length
      )
      .getDisplayValues()[0]
      .map(
        function(value) {
          return normalizeInterbranchHeader_(
            value
          );
        }
      );

  result.actualColumnCount =
    actualHeaders.length;

  expectedHeaders.forEach(
    function(
      expectedHeader,
      index
    ) {
      const expected =
        normalizeInterbranchHeader_(
          expectedHeader
        );

      const actual =
        actualHeaders[
          index
        ];

      if (!actual) {
        result.errors.push(
          'Лист "' +
          sheetName +
          '", колонка ' +
          interbranchColumnToLetter_(
            index + 1
          ) +
          ': заголовок порожній. Очікується "' +
          expectedHeader +
          '".'
        );

        return;
      }

      if (
        actual !==
        expected
      ) {
        result.errors.push(
          'Лист "' +
          sheetName +
          '", колонка ' +
          interbranchColumnToLetter_(
            index + 1
          ) +
          ': знайдено "' +
          actualHeaders[index] +
          '", очікується "' +
          expectedHeader +
          '".'
        );
      }
    }
  );

  if (
    sheet.getLastColumn() >
    expectedHeaders.length
  ) {
    result.warnings.push(
      'Лист "' +
      sheetName +
      '" має додаткові колонки після ' +
      interbranchColumnToLetter_(
        expectedHeaders.length
      ) +
      '.'
    );
  }

  result.ok =
    result.errors.length === 0;

  return result;
}


/****************************************************
 * НОРМАЛІЗАЦІЯ ЗАГОЛОВКА
 ****************************************************/

function normalizeInterbranchHeader_(
  value
) {
  return String(
    value === null ||
    value === undefined
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


/****************************************************
 * НОМЕР КОЛОНКИ → ЛІТЕРА
 ****************************************************/

function interbranchColumnToLetter_(
  columnNumber
) {
  let number =
    Number(
      columnNumber
    ) || 0;

  let result =
    '';

  while (
    number > 0
  ) {
    const remainder =
      (
        number - 1
      ) % 26;

    result =
      String.fromCharCode(
        65 + remainder
      ) +
      result;

    number =
      Math.floor(
        (
          number - 1
        ) / 26
      );
  }

  return result;
}


/****************************************************
 * БЕЗПЕЧНИЙ ТЕКСТ ПОМИЛКИ
 ****************************************************/

function getInterbranchErrorMessage_(
  error
) {
  return String(
    error &&
    error.message
      ? error.message
      : error || 'Невідома помилка'
  );
}


/****************************************************
 * ЗАВЕРШЕННЯ ТЕСТУ
 ****************************************************/

function finalizeInterbranchReadinessResult_(
  result
) {
  result.finishedAt =
    new Date();

  result.ok =
    result.errors.length === 0;

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
      result.ok
        ? (
            'Міжфілійний модуль готовий до наступного кроку. ' +
            result.currentBranch +
            ' → ' +
            result.remoteBranch
          )
        : (
            'Аудит не пройдено. Помилок: ' +
            result.errors.length +
            '. Перевірте журнал виконання.'
          ),
      'Переміщення між філіями',
      10
    );

  return result;
}