/**
 * ============================================================
 * MANUAL DELETION GUARD — BABURKA
 * ============================================================
 *
 * Відновлює випадково очищені або видалені вручну операційні
 * рядки. Не використовує захищені діапазони та не заважає
 * виробничим скриптам працювати від імені адміністратора.
 */

const MANUAL_DELETION_GUARD_CONFIG_BABURKA = {
  backupSheet: '_SYSTEM_DELETION_BACKUP',
  auditSheet: 'Журнал життєвого циклу',

  sheets: [
    {
      name: 'База операцій',
      startRow: 10,
      width: 33,
      keyColumn: 1
    },
    {
      name: 'Склад медичних запасів',
      startRow: 3,
      width: 28,
      keyColumn: 1
    },
    {
      name: 'Рух складу',
      startRow: 2,
      width: 12,
      keyColumn: 1
    },
    {
      name: 'Облік вакцин',
      startRow: 2,
      width: 15,
      keyColumn: 1
    },
    {
      name: 'Нарахування',
      startRow: 2,
      width: 10,
      keyColumn: 1
    },
    {
      name: 'Переміщення між філіями',
      startRow: 2,
      width: 18,
      keyColumn: 1
    },
    {
      name: 'Активи',
      startRow: 3,
      width: 12,
      keyColumn: 1
    }
  ]
};


/**
 * READ-ONLY перевірка перед установленням.
 */
function previewManualDeletionGuardBaburka() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    MANUAL_DELETION_GUARD_CONFIG_BABURKA;

  const sheets =
    config.sheets.map(
      function(spec) {
        const sheet =
          ss.getSheetByName(spec.name);

        if (!sheet) {
          return {
            sheet: spec.name,
            exists: false,
            startRow: spec.startRow,
            width: spec.width,
            keyColumn: spec.keyColumn,
            dataRowCount: 0,
            keyedRowCount: 0,
            blankKeyNonEmptyRowCount: 0,
            duplicateKeyCount: 0,
            duplicateExamples: []
          };
        }

        const rows =
          mdgReadSourceRowsBaburka_(
            sheet,
            spec
          );

        const counts = {};
        let keyed = 0;
        let blankKeyNonEmpty = 0;

        rows.forEach(
          function(item) {
            const key =
              mdgCleanBaburka_(
                item.values[
                  spec.keyColumn - 1
                ]
              );

            const nonEmpty =
              item.values.some(
                function(value) {
                  return (
                    mdgCleanBaburka_(
                      value
                    ) !== ''
                  );
                }
              );

            if (key) {
              keyed++;

              counts[key] =
                (counts[key] || 0) + 1;

            } else if (nonEmpty) {
              blankKeyNonEmpty++;
            }
          }
        );

        const duplicates =
          Object.keys(counts)
            .filter(
              function(key) {
                return counts[key] > 1;
              }
            )
            .map(
              function(key) {
                return {
                  key: key,
                  occurrences:
                    counts[key]
                };
              }
            );

        return {
          sheet: spec.name,
          exists: true,
          startRow: spec.startRow,
          width: spec.width,
          keyColumn: spec.keyColumn,
          dataRowCount: rows.length,
          keyedRowCount: keyed,
          blankKeyNonEmptyRowCount:
            blankKeyNonEmpty,
          duplicateKeyCount:
            duplicates.length,
          duplicateExamples:
            duplicates.slice(0, 10)
        };
      }
    );

  const existingTriggers =
    ScriptApp.getProjectTriggers()
      .map(
        function(trigger) {
          return (
            trigger.getHandlerFunction()
          );
        }
      )
      .filter(
        function(name) {
          return (
            name ===
              'manualDeletionGuardOnEditBaburka_' ||
            name ===
              'manualDeletionGuardOnChangeBaburka_'
          );
        }
      );

  const allSheetsExist =
    sheets.every(
      function(item) {
        return item.exists;
      }
    );

  const result = {
    ok: allSheetsExist,
    test:
      'previewManualDeletionGuardBaburka',
    writesNow: false,
    spreadsheetName: ss.getName(),

    backupSheetExists:
      Boolean(
        ss.getSheetByName(
          config.backupSheet
        )
      ),

    sheets: sheets,
    existingTriggers: existingTriggers,
    recommendedKeyMode:
      'KEY_PLUS_OCCURRENCE',
    readyForGuardInstall:
      allSheetsExist
  };

  console.log(
    'DELETION_GUARD_PREVIEW: ' +
    JSON.stringify(result)
  );

  return result;
}


/**
 * Одноразове встановлення резервної копії
 * та двох тригерів.
 */
function installManualDeletionGuardBaburka() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const preview =
    previewManualDeletionGuardBaburka();

  if (!preview.readyForGuardInstall) {
    throw new Error(
      'Не всі обов’язкові листи знайдено.'
    );
  }

  const backup =
    refreshDeletionGuardAfterSystemWriteBaburka_();

  const handlers = [
    'manualDeletionGuardOnEditBaburka_',
    'manualDeletionGuardOnChangeBaburka_'
  ];

  /*
   * Не допускаємо дублювання тригерів.
   */
  ScriptApp.getProjectTriggers()
    .forEach(
      function(trigger) {
        if (
          handlers.indexOf(
            trigger.getHandlerFunction()
          ) !== -1
        ) {
          ScriptApp.deleteTrigger(
            trigger
          );
        }
      }
    );

  ScriptApp
    .newTrigger(
      'manualDeletionGuardOnEditBaburka_'
    )
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ScriptApp
    .newTrigger(
      'manualDeletionGuardOnChangeBaburka_'
    )
    .forSpreadsheet(ss)
    .onChange()
    .create();

  const result = {
    ok: true,
    test:
      'installManualDeletionGuardBaburka',
    writesNow: true,

    backupSheet:
      MANUAL_DELETION_GUARD_CONFIG_BABURKA
        .backupSheet,

    backupRecordCount:
      backup.recordCount,

    installedTriggers:
      handlers
  };

  console.log(
    'DELETION_GUARD_INSTALL: ' +
    JSON.stringify(result)
  );

  return result;
}


/**
 * Оновлює еталон після дозволеного системного запису.
 *
 * Викликається модулями скасування та коригування.
 */
function refreshDeletionGuardAfterSystemWriteBaburka_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    MANUAL_DELETION_GUARD_CONFIG_BABURKA;

  let backupSheet =
    ss.getSheetByName(
      config.backupSheet
    );

  if (!backupSheet) {
    backupSheet =
      ss.insertSheet(
        config.backupSheet
      );
  }

  const records = [];
  const snapshotTime = new Date();

  config.sheets.forEach(
    function(spec) {
      const sheet =
        ss.getSheetByName(
          spec.name
        );

      if (!sheet) {
        return;
      }

      const occurrenceByKey = {};

      mdgReadSourceRowsBaburka_(
        sheet,
        spec
      ).forEach(
        function(item) {
          const key =
            mdgCleanBaburka_(
              item.values[
                spec.keyColumn - 1
              ]
            );

          /*
           * Рядки без ключа не включаємо,
           * оскільки їх неможливо однозначно відновити.
           */
          if (!key) {
            return;
          }

          occurrenceByKey[key] =
            (
              occurrenceByKey[key] ||
              0
            ) + 1;

          records.push([
            spec.name,
            key,
            occurrenceByKey[key],
            item.row,
            spec.width,
            mdgEncodeRowBaburka_(
              item.values
            ),
            snapshotTime
          ]);
        }
      );
    }
  );

  backupSheet.clearContents();

  backupSheet
    .getRange(
      1,
      1,
      1,
      7
    )
    .setValues([[
      'Лист',
      'Ключ',
      'Повторення',
      'Початковий рядок',
      'Ширина',
      'Дані JSON',
      'Дата знімка'
    ]])
    .setFontWeight('bold');

  if (records.length) {
    backupSheet
      .getRange(
        2,
        1,
        records.length,
        7
      )
      .setValues(records);
  }

  backupSheet.hideSheet();

  const result = {
    ok: true,
    writesNow: true,
    recordCount: records.length,
    backupSheet:
      config.backupSheet
  };

  console.log(
    'DELETION_GUARD_BACKUP: ' +
    JSON.stringify(result)
  );

  return result;
}


/**
 * Реакція на ручне очищення клітинок або рядка.
 */
function manualDeletionGuardOnEditBaburka_(
  event
) {
  if (
    !event ||
    !event.range
  ) {
    return;
  }

  const sheet =
    event.range.getSheet();

  const spec =
    mdgGetSheetSpecBaburka_(
      sheet.getName()
    );

  if (!spec) {
    return;
  }

  const firstRow =
    Math.max(
      event.range.getRow(),
      spec.startRow
    );

  const lastRow =
    event.range.getLastRow();

  if (
    lastRow <
    spec.startRow
  ) {
    return;
  }

  const restored =
    mdgRestoreEditedRowsBaburka_(
      sheet,
      spec,
      firstRow,
      lastRow,
      event.range.getColumn(),
      event.range.getLastColumn()
    );

  if (restored.length) {
    mdgFinishRestorationBaburka_(
      restored
    );
  }
}


/**
 * Реакція на фізичне видалення рядків.
 */
function manualDeletionGuardOnChangeBaburka_(
  event
) {
  if (
    !event ||
    event.changeType !==
      'REMOVE_ROW'
  ) {
    return;
  }

  const restored =
    mdgRestoreMissingRowsBaburka_();

  if (restored.length) {
    mdgFinishRestorationBaburka_(
      restored
    );
  }
}


/**
 * Відновлює очищені клітинки або рядки.
 */
function mdgRestoreEditedRowsBaburka_(
  sheet,
  spec,
  firstRow,
  lastRow,
  firstColumn,
  lastColumn
) {
  const backupRecords =
    mdgLoadBackupRecordsBaburka_(
      spec.name
    );

  if (!backupRecords.length) {
    return [];
  }

  const identityMap =
    mdgBuildCurrentIdentityMapBaburka_(
      sheet,
      spec
    );

  const backupByIdentity = {};

  backupRecords.forEach(
    function(record) {
      backupByIdentity[
        record.identity
      ] = record;
    }
  );

  const restored = [];

  for (
    let row = firstRow;
    row <= lastRow;
    row++
  ) {
    const current =
      sheet
        .getRange(
          row,
          1,
          1,
          spec.width
        )
        .getValues()[0];

    const identity =
      identityMap.byRow[row] || '';

    let backup =
      identity
        ? backupByIdentity[
            identity
          ]
        : null;

    /*
     * Якщо видалено сам ключ, шукаємо
     * резервну копію за початковим рядком.
     */
    if (!backup) {
      backup =
        backupRecords.find(
          function(record) {
            return (
              record.sourceRow === row
            );
          }
        );
    }

    if (!backup) {
      continue;
    }

    let deletionDetected = false;

    const from =
      Math.max(
        firstColumn,
        1
      );

    const to =
      Math.min(
        lastColumn,
        spec.width
      );

    for (
      let column = from;
      column <= to;
      column++
    ) {
      const before =
        backup.values[
          column - 1
        ];

      const after =
        current[
          column - 1
        ];

      if (
        mdgCleanBaburka_(before) !== '' &&
        mdgCleanBaburka_(after) === ''
      ) {
        deletionDetected = true;
        break;
      }
    }

    if (!deletionDetected) {
      continue;
    }

    sheet
      .getRange(
        row,
        1,
        1,
        spec.width
      )
      .setValues([
        backup.values
      ]);

    restored.push(
      mdgRestoredRecordBaburka_(
        backup,
        row
      )
    );
  }

  SpreadsheetApp.flush();

  return restored;
}
/**
 * Відновлює фізично видалені рядки.
 */
function mdgRestoreMissingRowsBaburka_() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const restored = [];

  MANUAL_DELETION_GUARD_CONFIG_BABURKA
    .sheets
    .forEach(
      function(spec) {
        const sheet =
          ss.getSheetByName(
            spec.name
          );

        if (!sheet) {
          return;
        }

        const current =
          mdgBuildCurrentIdentityMapBaburka_(
            sheet,
            spec
          );

        const backupRecords =
          mdgLoadBackupRecordsBaburka_(
            spec.name
          );

        backupRecords.forEach(
          function(record) {
            if (
              current.byIdentity[
                record.identity
              ]
            ) {
              return;
            }

            const targetRow =
              mdgFindRestorationRowBaburka_(
                sheet,
                spec,
                record.sourceRow
              );

            sheet
              .getRange(
                targetRow,
                1,
                1,
                spec.width
              )
              .setValues([
                record.values
              ]);

            current.byIdentity[
              record.identity
            ] = targetRow;

            current.byRow[
              targetRow
            ] = record.identity;

            restored.push(
              mdgRestoredRecordBaburka_(
                record,
                targetRow
              )
            );
          }
        );
      }
    );

  SpreadsheetApp.flush();

  return restored;
}


/**
 * Визначає безпечний рядок для відновлення.
 */
function mdgFindRestorationRowBaburka_(
  sheet,
  spec,
  preferredRow
) {
  if (
    preferredRow >= spec.startRow &&
    preferredRow <= sheet.getMaxRows()
  ) {
    const preferredValues =
      sheet
        .getRange(
          preferredRow,
          1,
          1,
          spec.width
        )
        .getDisplayValues()[0];

    const preferredRowIsEmpty =
      preferredValues.every(
        function(value) {
          return value === '';
        }
      );

    if (preferredRowIsEmpty) {
      return preferredRow;
    }
  }

  const maxRows =
    sheet.getMaxRows();

  const count =
    Math.max(
      maxRows -
        spec.startRow +
        1,
      1
    );

  const keys =
    sheet
      .getRange(
        spec.startRow,
        spec.keyColumn,
        count,
        1
      )
      .getDisplayValues();

  for (
    let index = 0;
    index < keys.length;
    index++
  ) {
    if (
      !mdgCleanBaburka_(
        keys[index][0]
      )
    ) {
      return (
        spec.startRow +
        index
      );
    }
  }

  sheet.insertRowAfter(
    maxRows
  );

  return maxRows + 1;
}


/**
 * Завершує відновлення:
 * - записує подію в журнал;
 * - оновлює резервну копію;
 * - показує попередження.
 */
function mdgFinishRestorationBaburka_(
  restored
) {
  restored.forEach(
    function(item) {
      mdgWriteAuditBaburka_(
        item
      );
    }
  );

  refreshDeletionGuardAfterSystemWriteBaburka_();

  /*
   * Інстальовані тригери не гарантують показ modal alert.
   * Toast є безпечним системним повідомленням.
   */
  try {
    SpreadsheetApp
      .getActive()
      .toast(
        'Видалення заблоковано. Відновлено рядків: ' +
          restored.length,
        'Операції відновлено',
        8
      );

  } catch (error) {
    console.log(
      error.message
    );
  }
}


/**
 * Записує відновлення в журнал життєвого циклу.
 */
function mdgWriteAuditBaburka_(
  item
) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      MANUAL_DELETION_GUARD_CONFIG_BABURKA
        .auditSheet
    );

  if (!sheet) {
    return;
  }

  const eventId =
    'EVT-RESTORE-' +

    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    ) +

    '-' +

    Utilities
      .getUuid()
      .replace(/-/g, '')
      .slice(0, 6)
      .toUpperCase();

  const user =
    typeof getSafeUserEmail_ ===
    'function'
      ? getSafeUserEmail_()
      : Session
          .getActiveUser()
          .getEmail();

  sheet.appendRow([
    eventId,
    new Date(),
    user,
    'RESTORE_MANUAL_DELETION',
    item.key,
    item.sheet,
    item.restoredRow,
    'Видалено вручну',
    'Відновлено',
    item.identity,
    'COMPLETED',
    ''
  ]);
}


/**
 * Завантажує резервні записи потрібного листа.
 */
function mdgLoadBackupRecordsBaburka_(
  sheetName
) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const backup =
    ss.getSheetByName(
      MANUAL_DELETION_GUARD_CONFIG_BABURKA
        .backupSheet
    );

  if (
    !backup ||
    backup.getLastRow() < 2
  ) {
    return [];
  }

  return backup
    .getRange(
      2,
      1,
      backup.getLastRow() - 1,
      7
    )
    .getValues()
    .filter(
      function(row) {
        return (
          mdgCleanBaburka_(
            row[0]
          ) === sheetName
        );
      }
    )
    .map(
      function(row) {
        const key =
          mdgCleanBaburka_(
            row[1]
          );

        const occurrence =
          Number(
            row[2] || 0
          );

        return {
          sheet: sheetName,
          key: key,
          occurrence: occurrence,

          identity:
            key +
            '||' +
            occurrence,

          sourceRow:
            Number(
              row[3] || 0
            ),

          width:
            Number(
              row[4] || 0
            ),

          values:
            mdgDecodeRowBaburka_(
              row[5]
            )
        };
      }
    );
}


/**
 * Будує карту ключ + порядкове повторення.
 */
function mdgBuildCurrentIdentityMapBaburka_(
  sheet,
  spec
) {
  const byIdentity = {};
  const byRow = {};
  const occurrenceByKey = {};

  mdgReadSourceRowsBaburka_(
    sheet,
    spec
  ).forEach(
    function(item) {
      const key =
        mdgCleanBaburka_(
          item.values[
            spec.keyColumn - 1
          ]
        );

      if (!key) {
        return;
      }

      occurrenceByKey[key] =
        (
          occurrenceByKey[key] ||
          0
        ) + 1;

      const identity =
        key +
        '||' +
        occurrenceByKey[key];

      byIdentity[
        identity
      ] = item.row;

      byRow[
        item.row
      ] = identity;
    }
  );

  return {
    byIdentity: byIdentity,
    byRow: byRow
  };
}


/**
 * Читає робочі рядки листа.
 */
function mdgReadSourceRowsBaburka_(
  sheet,
  spec
) {
  const lastRow =
    sheet.getLastRow();

  if (
    lastRow <
    spec.startRow
  ) {
    return [];
  }

  return sheet
    .getRange(
      spec.startRow,
      1,
      lastRow -
        spec.startRow +
        1,
      spec.width
    )
    .getValues()
    .map(
      function(
        values,
        index
      ) {
        return {
          row:
            spec.startRow +
            index,

          values: values
        };
      }
    );
}


function mdgGetSheetSpecBaburka_(
  sheetName
) {
  return (
    MANUAL_DELETION_GUARD_CONFIG_BABURKA
      .sheets
      .find(
        function(spec) {
          return (
            spec.name ===
            sheetName
          );
        }
      ) ||
    null
  );
}


function mdgRestoredRecordBaburka_(
  record,
  restoredRow
) {
  return {
    sheet: record.sheet,
    key: record.key,
    identity: record.identity,
    sourceRow: record.sourceRow,
    restoredRow: restoredRow
  };
}


/**
 * Зберігає типи дат у JSON.
 */
function mdgEncodeRowBaburka_(
  values
) {
  return JSON.stringify(
    values.map(
      function(value) {
        if (
          value instanceof Date &&
          !isNaN(
            value.getTime()
          )
        ) {
          return {
            __mdgType: 'DATE',
            value:
              value.toISOString()
          };
        }

        return {
          __mdgType: 'VALUE',
          value: value
        };
      }
    )
  );
}


/**
 * Відновлює дати з резервного JSON.
 */
function mdgDecodeRowBaburka_(
  encoded
) {
  const values =
    JSON.parse(
      String(
        encoded || '[]'
      )
    );

  return values.map(
    function(item) {
      if (
        item &&
        item.__mdgType ===
          'DATE'
      ) {
        return new Date(
          item.value
        );
      }

      return item
        ? item.value
        : '';
    }
  );
}


function mdgCleanBaburka_(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}


/**
 * ЄДИНИЙ КРИТИЧНИЙ E2E-ТЕСТ.
 *
 * Створює лише TEST-* рядок,
 * перевіряє відновлення та журнал,
 * після чого прибирає тестові дані.
 */
function testManualDeletionGuardEndToEndBaburka() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheet =
    ss.getSheetByName(
      'База операцій'
    );

  const spec =
    mdgGetSheetSpecBaburka_(
      'База операцій'
    );

  const now =
    new Date();

  const testId =
    'TEST-GUARD-' +

    Utilities.formatDate(
      now,
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    ) +

    '-' +

    Utilities
      .getUuid()
      .replace(/-/g, '')
      .slice(0, 6)
      .toUpperCase();

  const row =
    sheet.getLastRow() + 1;

  const values =
    new Array(
      spec.width
    ).fill('');

  values[0] =
    testId;

  values[3] =
    now;

  values[6] =
    123.45;

  values[9] =
    'Доходи';

  values[29] =
    'Проведено';

  let result = null;

  try {
    /*
     * Створюємо тестовий рядок
     * і додаємо його до еталона.
     */
    sheet
      .getRange(
        row,
        1,
        1,
        spec.width
      )
      .setValues([
        values
      ]);

    refreshDeletionGuardAfterSystemWriteBaburka_();

    /*
     * Імітуємо ручне видалення.
     */
    sheet
      .getRange(
        row,
        1,
        1,
        spec.width
      )
      .clearContent();

    const restored =
      mdgRestoreMissingRowsBaburka_();

    if (restored.length) {
      mdgFinishRestorationBaburka_(
        restored
      );
    }

    const actual =
      sheet
        .getRange(
          row,
          1,
          1,
          spec.width
        )
        .getValues()[0];

    const auditSheet =
      ss.getSheetByName(
        MANUAL_DELETION_GUARD_CONFIG_BABURKA
          .auditSheet
      );

    let auditCreated = false;

    if (
      auditSheet &&
      auditSheet.getLastRow() >= 2
    ) {
      auditCreated =
        auditSheet
          .getRange(
            2,
            4,
            auditSheet.getLastRow() - 1,
            2
          )
          .getDisplayValues()
          .some(
            function(auditRow) {
              return (
                mdgCleanBaburka_(
                  auditRow[0]
                ) ===
                  'RESTORE_MANUAL_DELETION' &&

                mdgCleanBaburka_(
                  auditRow[1]
                ) ===
                  testId
              );
            }
          );
    }

    const checks = {
      restoredCountOne:
        restored.length === 1,

      idRestored:
        mdgCleanBaburka_(
          actual[0]
        ) === testId,

      amountRestored:
        Number(
          actual[6]
        ) === 123.45,

      statusRestored:
        mdgCleanBaburka_(
          actual[29]
        ) === 'Проведено',

      auditCreated:
        auditCreated,

      editTriggerInstalled:
        mdgTriggerExistsBaburka_(
          'manualDeletionGuardOnEditBaburka_'
        ),

      changeTriggerInstalled:
        mdgTriggerExistsBaburka_(
          'manualDeletionGuardOnChangeBaburka_'
        )
    };

    const failedChecks =
      Object.keys(checks)
        .filter(
          function(key) {
            return (
              checks[key] !== true
            );
          }
        );

    result = {
      ok:
        failedChecks.length === 0,

      test:
        'testManualDeletionGuardEndToEndBaburka',

      writesNow: true,
      testDataOnly: true,
      testId: testId,
      checks: checks,
      failedChecks: failedChecks,
      cleanupRequired: true
    };

  } finally {
    /*
     * Очищення тестового рядка.
     */
    const lastRow =
      sheet.getLastRow();

    if (
      lastRow >=
      spec.startRow
    ) {
      const ids =
        sheet
          .getRange(
            spec.startRow,
            1,
            lastRow -
              spec.startRow +
              1,
            1
          )
          .getDisplayValues();

      ids.forEach(
        function(
          item,
          index
        ) {
          if (
            mdgCleanBaburka_(
              item[0]
            ) === testId
          ) {
            sheet
              .getRange(
                spec.startRow +
                  index,
                1,
                1,
                spec.width
              )
              .clearContent();
          }
        }
      );
    }

    /*
     * Очищення тестової події журналу.
     */
    const auditSheet =
      ss.getSheetByName(
        MANUAL_DELETION_GUARD_CONFIG_BABURKA
          .auditSheet
      );

    if (
      auditSheet &&
      auditSheet.getLastRow() >= 2
    ) {
      const auditValues =
        auditSheet
          .getRange(
            2,
            5,
            auditSheet.getLastRow() - 1,
            1
          )
          .getDisplayValues();

      for (
        let index =
          auditValues.length - 1;
        index >= 0;
        index--
      ) {
        if (
          mdgCleanBaburka_(
            auditValues[index][0]
          ) === testId
        ) {
          auditSheet
            .getRange(
              index + 2,
              1,
              1,
              Math.max(
                auditSheet.getLastColumn(),
                12
              )
            )
            .clearContent();
        }
      }
    }

    refreshDeletionGuardAfterSystemWriteBaburka_();

    if (result) {
      result.cleanupRequired =
        false;

      result.testRowsRemaining =
        0;
    }
  }

  console.log(
    'DELETION_GUARD_E2E: ' +
    JSON.stringify(result)
  );

  return result;
}


function mdgTriggerExistsBaburka_(
  handlerName
) {
  return ScriptApp
    .getProjectTriggers()
    .some(
      function(trigger) {
        return (
          trigger
            .getHandlerFunction() ===
          handlerName
        );
      }
    );
}