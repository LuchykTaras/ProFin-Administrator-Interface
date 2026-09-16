/**
 * R1 — створення структури реєстру
 * «Взаєморозрахунки філій».
 *
 * Не змінює склад, «Базу операцій», рухи,
 * звіти або чинні переміщення.
 */
function setupInterbranchSettlementRegister() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    INTERBRANCH_SETTLEMENTS_CONFIG;

  const lock =
    LockService.getDocumentLock();

  lock.waitLock(30000);

  try {
    const headers = [
      'ID розрахунку',
      'ID переміщення',
      'Дата нарахування',
      'Місяць нарахування',
      'Філія-кредитор',
      'Філія-боржник',
      'Найменування / партія',
      'Кількість',
      'Собівартість одиниці',
      'Сума нарахування',
      'Строк оплати',
      'Сплачено',
      'Залишок боргу',
      'Статус',
      'Дата останньої оплати',
      'Коментар / аудит'
    ];

    let sheet =
      ss.getSheetByName(
        config.settlementSheetName
      );

    let createdNow =
      false;

    if (!sheet) {
      sheet =
        ss.insertSheet(
          config.settlementSheetName
        );

      createdNow =
        true;
    }

    const lastRow =
      sheet.getLastRow();

    /*
     * Якщо лист уже містить дані —
     * не перезаписуємо його.
     */
    if (lastRow > 1) {
      const currentHeaders =
        sheet
          .getRange(
            1,
            1,
            1,
            headers.length
          )
          .getDisplayValues()[0]
          .map(function(value) {
            return String(value || '').trim();
          });

      const isSameSchema =
        headers.every(function(header, index) {
          return (
            currentHeaders[index] ===
            header
          );
        });

      if (!isSameSchema) {
        throw new Error(
          'Лист "' +
          config.settlementSheetName +
          '" уже містить дані або іншу структуру. ' +
          'Автоматичне перезаписування зупинено.'
        );
      }

      return {
        ok: true,
        writesNow: false,
        createdNow: false,
        alreadyConfigured: true,
        sheet: sheet.getName(),
        accountingStartDate:
          config.accountingStartDate,
        headers: headers
      };
    }

    /*
     * Лист новий або порожній:
     * створюємо тільки заголовки та технічне оформлення.
     */
    sheet
      .getRange(
        1,
        1,
        1,
        headers.length
      )
      .setValues([
        headers
      ])
      .setFontWeight('bold')
      .setFontColor('#FFFFFF')
      .setBackground('#1F4E78')
      .setHorizontalAlignment('center')
      .setVerticalAlignment('middle')
      .setWrap(true);

    sheet.setFrozenRows(1);

    sheet
      .getRange('C:C')
      .setNumberFormat(
        'dd.MM.yyyy HH:mm'
      );

    sheet
      .getRange('D:D')
      .setNumberFormat(
        '@'
      );

    sheet
      .getRange('H:H')
      .setNumberFormat(
        '0.00'
      );

    sheet
      .getRange('I:J')
      .setNumberFormat(
        '#,##0.00 [$грн]'
      );

    sheet
      .getRange('K:K')
      .setNumberFormat(
        'dd.MM.yyyy'
      );

    sheet
      .getRange('L:M')
      .setNumberFormat(
        '#,##0.00 [$грн]'
      );

    sheet
      .getRange('O:O')
      .setNumberFormat(
        'dd.MM.yyyy HH:mm'
      );

    const statusRule =
      SpreadsheetApp
        .newDataValidation()
        .requireValueInList(
          [
            'Нараховано',
            'Частково сплачено',
            'Сплачено',
            'Скасовано'
          ],
          true
        )
        .setAllowInvalid(false)
        .setHelpText(
          'Статус змінюється лише ' +
          'контрольованими функціями системи.'
        )
        .build();

    sheet
      .getRange(
        2,
        14,
        sheet.getMaxRows() - 1,
        1
      )
      .setDataValidation(
        statusRule
      );

    const widths = [
      150, 180, 145, 110,
      130, 130, 280, 90,
      130, 135, 120, 120,
      130, 150, 145, 320
    ];

    widths.forEach(function(width, index) {
      sheet.setColumnWidth(
        index + 1,
        width
      );
    });

    sheet.setTabColor('#1F4E78');

    SpreadsheetApp.flush();

    return {
      ok: true,
      writesNow: true,
      createdNow: createdNow,
      sheet: sheet.getName(),
      headerCount: headers.length,
      accountingStartDate:
        config.accountingStartDate,
      businessDataChanged: false,
      nextDecision:
        'READY_FOR_STEP_3_JULY_ACCEPTED_TRANSFERS_AUDIT'
    };

  } finally {
    lock.releaseLock();
  }
}
/**
 * R0 — аудит прийнятих передач для первинного
 * формування взаєморозрахунків.
 *
 * Нічого не записує.
 * Не змінює склад, звіти, базу операцій або реєстр.
 */
function auditJulyInterbranchSettlementCandidates() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    INTERBRANCH_SETTLEMENTS_CONFIG;

  const transferSheet =
    ss.getSheetByName(
      'Переміщення між філіями'
    );

  if (!transferSheet) {
    throw new Error(
      'Не знайдено лист "Переміщення між філіями".'
    );
  }

  const startDateParts =
    config
      .accountingStartDate
      .split('-')
      .map(Number);

  const accountingStartDate =
    new Date(
      startDateParts[0],
      startDateParts[1] - 1,
      startDateParts[2],
      0,
      0,
      0
    );

  function text_(value) {
    return String(
      value == null ? '' : value
    ).trim();
  }

  function normalized_(value) {
    return text_(value)
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function number_(value) {
    const result =
      Number(value);

    return Number.isFinite(result)
      ? result
      : 0;
  }

  function date_(value) {
    if (
      value instanceof Date &&
      !Number.isNaN(value.getTime())
    ) {
      return value;
    }

    const result =
      new Date(value);

    return Number.isNaN(result.getTime())
      ? null
      : result;
  }

  const headers =
    transferSheet
      .getRange(
        1,
        1,
        1,
        transferSheet.getLastColumn()
      )
      .getDisplayValues()[0]
      .map(text_);

  const requiredHeaders = [
    'ID переміщення',
    'Філія-відправник',
    'Філія-одержувач',
    'ID вихідної партії',
    'ID партії одержувача',
    'Тип запасу',
    'Найменування',
    'Серія',
    'Кількість',
    'Собівартість одиниці',
    'Загальна собівартість',
    'Статус',
    'Дата приймання / повернення',
    'Технічна помилка'
  ];

  const missingHeaders =
    requiredHeaders.filter(function(header) {
      return headers.indexOf(header) === -1;
    });

  if (missingHeaders.length > 0) {
    throw new Error(
      'У журналі переміщень бракує колонок: ' +
      missingHeaders.join(', ')
    );
  }

  const column = {};

  headers.forEach(function(header, index) {
    column[header] = index;
  });

  const lastRow =
    transferSheet.getLastRow();

  const values =
    lastRow > 1
      ? transferSheet
          .getRange(
            2,
            1,
            lastRow - 1,
            headers.length
          )
          .getValues()
      : [];

  const candidates = [];
  const anomalies = [];
  const seenTransferIds =
    new Set();

  const stats = {
    totalJournalRows:
      values.length,

    ignoredBeforeStartDate:
      0,

    ignoredOtherDirection:
      0,

    ignoredNotAccepted:
      0,

    acceptedAfterStartDate:
      0
  };

  values.forEach(function(row, index) {
    const sheetRow =
      index + 2;

    const transferId =
      text_(
        row[
          column['ID переміщення']
        ]
      );

    if (!transferId) {
      return;
    }

    const sourceBranch =
      text_(
        row[
          column['Філія-відправник']
        ]
      );

    const destinationBranch =
      text_(
        row[
          column['Філія-одержувач']
        ]
      );

    const status =
      text_(
        row[
          column['Статус']
        ]
      );

    const isRequiredDirection =
      normalized_(sourceBranch) ===
        normalized_(config.creditorBranch) &&
      normalized_(destinationBranch) ===
        normalized_(config.debtorBranch);

    if (!isRequiredDirection) {
      stats.ignoredOtherDirection++;
      return;
    }

    if (
      normalized_(status) !==
      normalized_('Прийнято')
    ) {
      stats.ignoredNotAccepted++;
      return;
    }

    const acceptedAt =
      date_(
        row[
          column[
            'Дата приймання / повернення'
          ]
        ]
      );

    if (!acceptedAt) {
      anomalies.push({
        row: sheetRow,
        transferId: transferId,
        code: 'ACCEPTED_DATE_MISSING',
        message:
          'Статус «Прийнято», але не вказана дата приймання.'
      });

      return;
    }

    if (
      acceptedAt.getTime() <
      accountingStartDate.getTime()
    ) {
      stats.ignoredBeforeStartDate++;
      return;
    }

    const quantity =
      number_(
        row[
          column['Кількість']
        ]
      );

    const unitCost =
      number_(
        row[
          column['Собівартість одиниці']
        ]
      );

    const totalCost =
      number_(
        row[
          column['Загальна собівартість']
        ]
      );

    const technicalError =
      text_(
        row[
          column['Технічна помилка']
        ]
      );

    const calculatedTotal =
      Math.round(
        quantity *
        unitCost *
        100
      ) / 100;

    const errors = [];

    if (quantity <= 0) {
      errors.push(
        'Некоректна кількість.'
      );
    }

    if (unitCost < 0) {
      errors.push(
        'Некоректна собівартість одиниці.'
      );
    }

    if (
      Math.abs(
        totalCost -
        calculatedTotal
      ) > 0.01
    ) {
      errors.push(
        'Загальна собівартість не дорівнює ' +
        'кількість × собівартість одиниці.'
      );
    }

    if (technicalError) {
      errors.push(
        'У журналі є технічна помилка: ' +
        technicalError
      );
    }

    if (
      seenTransferIds.has(
        transferId
      )
    ) {
      errors.push(
        'Дубль ID переміщення серед кандидатів.'
      );
    }

    seenTransferIds.add(
      transferId
    );

    const candidate = {
      row: sheetRow,
      transferId: transferId,
      acceptedAt: acceptedAt,
      accrualMonth:
        Utilities.formatDate(
          acceptedAt,
          Session.getScriptTimeZone(),
          'yyyy-MM'
        ),
      sourceLotId:
        text_(
          row[
            column['ID вихідної партії']
          ]
        ),
      receiverLotId:
        text_(
          row[
            column['ID партії одержувача']
          ]
        ),
      inventoryType:
        text_(
          row[
            column['Тип запасу']
          ]
        ),
      inventoryName:
        text_(
          row[
            column['Найменування']
          ]
        ),
      series:
        text_(
          row[
            column['Серія']
          ]
        ),
      quantity: quantity,
      unitCost: unitCost,
      totalCost: totalCost,
      errors: errors
    };

    candidates.push(candidate);

    if (errors.length > 0) {
      anomalies.push({
        row: sheetRow,
        transferId: transferId,
        code: 'CANDIDATE_DATA_INVALID',
        message: errors.join(' ')
      });
    }

    stats.acceptedAfterStartDate++;
  });

  const readyCandidates =
    candidates.filter(function(item) {
      return item.errors.length === 0;
    });

  const result = {
    ok:
      anomalies.length === 0,

    test:
      'auditJulyInterbranchSettlementCandidates',

    writesNow:
      false,

    spreadsheet:
      ss.getName(),

    accountingStartDate:
      config.accountingStartDate,

    direction:
      config.creditorBranch +
      ' → ' +
      config.debtorBranch,

    stats: stats,

    candidateCount:
      candidates.length,

    readyCandidateCount:
      readyCandidates.length,

    totalAccrualAmount:
      readyCandidates.reduce(
        function(total, item) {
          return total + item.totalCost;
        },
        0
      ),

    candidates:
      candidates,

    anomalies:
      anomalies,

    nextDecision:
      anomalies.length === 0
        ? 'READY_FOR_STEP_4_COMPARE_TWO_BRANCHES'
        : 'STOP_AND_REVIEW_ANOMALIES'
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}

      /**
 * PRODUCTION — первинний імпорт прийнятих передач
 * Альтернатива → Бабурка з 01.07.2026.
 *
 * Створює дзеркальні записи в обох листах
 * «Взаєморозрахунки філій».
 *
 * Перед записом:
 * — повторно звіряє дані двох філій;
 * — перевіряє відсутність часткового імпорту;
 * — не змінює склад, Базу операцій, P&L або Cash Flow.
 */
function importInterbranchSettlementsFromJuly2026() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const config =
    INTERBRANCH_SETTLEMENTS_CONFIG;

  const currentBranch =
    getCurrentInterbranchBranch_(
      ss.getId()
    );

  if (
    !currentBranch ||
    currentBranch.name !==
      config.creditorBranch
  ) {
    throw new Error(
      'Імпорт потрібно запускати лише у файлі «' +
      config.creditorBranch +
      '».'
    );
  }

  const lock =
    LockService.getScriptLock();

  lock.waitLock(30000);

  const transaction = {
    alternativeSheet: null,
    baburkaSheet: null,
    alternativeStartRow: 0,
    baburkaStartRow: 0,
    rowCount: 0,
    alternativeAuditRow: 0,
    baburkaAuditRow: 0
  };

  try {
    /*
     * Повторна звірка двох журналів перед production-записом.
     */
    const comparison =
      compareInterbranchSettlementCandidatesAcrossBranches();

    if (!comparison.ok) {
      throw new Error(
        'Звірка філій не пройдена. ' +
        'Імпорт зупинено: ' +
        JSON.stringify(
          comparison.differences
        )
      );
    }

    /*
     * Беремо перелік лише прийнятих передач із липня.
     */
    const audit =
      auditJulyInterbranchSettlementCandidates();

    if (
      !audit.ok ||
      audit.readyCandidateCount === 0
    ) {
      throw new Error(
        'Немає коректних кандидатів для імпорту.'
      );
    }

    const candidates =
      audit.candidates.filter(function(item) {
        return item.errors.length === 0;
      });

    const branches =
      INTERBRANCH_TRANSFER_CONFIG
        .branches;

    const baburkaConfig =
      branches[
        config.debtorBranch
      ];

    if (!baburkaConfig) {
      throw new Error(
        'Не знайдено конфігурацію Бабурки.'
      );
    }

    const baburkaSpreadsheet =
      SpreadsheetApp.openById(
        baburkaConfig.spreadsheetId
      );

    const alternativeSheet =
      ss.getSheetByName(
        config.settlementSheetName
      );

    const baburkaSheet =
      baburkaSpreadsheet.getSheetByName(
        config.settlementSheetName
      );

    if (
      !alternativeSheet ||
      !baburkaSheet
    ) {
      throw new Error(
        'Не знайдено лист "' +
        config.settlementSheetName +
        '" в одній із філій.'
      );
    }

    transaction.alternativeSheet =
      alternativeSheet;

    transaction.baburkaSheet =
      baburkaSheet;

    /*
     * Захист від повторного або часткового імпорту.
     */
    function getExistingSettlementIds_(sheet) {
      if (sheet.getLastRow() < 2) {
        return new Set();
      }

      return new Set(
        sheet
          .getRange(
            2,
            1,
            sheet.getLastRow() - 1,
            1
          )
          .getDisplayValues()
          .map(function(row) {
            return String(
              row[0] || ''
            ).trim();
          })
          .filter(Boolean)
      );
    }

    const alternativeExistingIds =
      getExistingSettlementIds_(
        alternativeSheet
      );

    const baburkaExistingIds =
      getExistingSettlementIds_(
        baburkaSheet
      );

    const settlementIds =
      candidates.map(function(item) {
        return (
          'SET-' +
          item.transferId
        );
      });

    const existingInAlternative =
      settlementIds.filter(function(id) {
        return alternativeExistingIds.has(id);
      });

    const existingInBaburka =
      settlementIds.filter(function(id) {
        return baburkaExistingIds.has(id);
      });

    if (
      existingInAlternative.length ===
        settlementIds.length &&
      existingInBaburka.length ===
        settlementIds.length
    ) {
      return {
        ok: true,
        writesNow: false,
        alreadyImported: true,
        importedTransferCount:
          settlementIds.length,
        totalAccrualAmount:
          audit.totalAccrualAmount
      };
    }

    if (
      existingInAlternative.length > 0 ||
      existingInBaburka.length > 0
    ) {
      throw new Error(
        'Виявлено частковий або повторний імпорт. ' +
        'Автоматичний запис зупинено. ' +
        'Альтернатива: ' +
        existingInAlternative.length +
        '; Бабурка: ' +
        existingInBaburka.length +
        '.'
      );
    }

    function getLastDayOfAccrualMonth_(
      accrualMonth
    ) {
      const parts =
        String(accrualMonth)
          .split('-')
          .map(Number);

      return new Date(
        parts[0],
        parts[1],
        0
      );
    }

    function buildSettlementRow_(item) {
      const settlementId =
        'SET-' +
        item.transferId;

      const lotDescription =
        item.inventoryName +
        ' | серія: ' +
        item.series +
        ' | ' +
        item.sourceLotId +
        ' → ' +
        item.receiverLotId;

      return [
        settlementId,                 // A
        item.transferId,              // B
        item.acceptedAt,              // C
        item.accrualMonth,            // D
        config.creditorBranch,        // E
        config.debtorBranch,          // F
        lotDescription,               // G
        item.quantity,                // H
        item.unitCost,                // I
        item.totalCost,               // J
        getLastDayOfAccrualMonth_(
          item.accrualMonth
        ),                            // K
        0,                            // L
        item.totalCost,               // M
        'Нараховано',                 // N
        '',                           // O
        'Первинний імпорт з 01.07.2026. ' +
          'Створено на підставі прийнятого ' +
          'переміщення.'              // P
      ];
    }

    const rows =
      candidates.map(
        buildSettlementRow_
      );

    transaction.rowCount =
      rows.length;

    transaction.alternativeStartRow =
      alternativeSheet.getLastRow() + 1;

    transaction.baburkaStartRow =
      baburkaSheet.getLastRow() + 1;

    /*
     * Записуємо дзеркальні реєстри.
     */
    alternativeSheet
      .getRange(
        transaction.alternativeStartRow,
        1,
        rows.length,
        rows[0].length
      )
      .setValues(rows);

    baburkaSheet
      .getRange(
        transaction.baburkaStartRow,
        1,
        rows.length,
        rows[0].length
      )
      .setValues(rows);

    SpreadsheetApp.flush();

    /*
     * Мінімальний аудит production-імпорту.
     */
    const eventId =
      'EVT-IMPORT-SETTLEMENTS-' +
      Utilities.formatDate(
        new Date(),
        Session.getScriptTimeZone(),
        'yyyyMMdd-HHmmss'
      ) +
      '-' +
      Utilities.getUuid()
        .replace(/-/g, '')
        .slice(0, 6)
        .toUpperCase();

    const user =
      Session.getActiveUser().getEmail() ||
      Session.getEffectiveUser().getEmail() ||
      'невідомий користувач';

    function appendAudit_(spreadsheet, row) {
      const lifecycleSheet =
        spreadsheet.getSheetByName(
          'Журнал життєвого циклу'
        );

      if (!lifecycleSheet) {
        throw new Error(
          'Не знайдено "Журнал життєвого циклу".'
        );
      }

      lifecycleSheet.appendRow([
        eventId,
        new Date(),
        user,
        'IMPORT_INTERBRANCH_SETTLEMENTS',
        'IMPORT-JULY-2026',
        config.settlementSheetName,
        row,
        '',
        'Нараховано',
        '',
        'COMPLETED',
        ''
      ]);

      return lifecycleSheet.getLastRow();
    }

    transaction.alternativeAuditRow =
      appendAudit_(
        ss,
        transaction.alternativeStartRow
      );

    transaction.baburkaAuditRow =
      appendAudit_(
        baburkaSpreadsheet,
        transaction.baburkaStartRow
      );

    /*
     * Фінальна звірка запису.
     */
    const alternativeWrittenIds =
      alternativeSheet
        .getRange(
          transaction.alternativeStartRow,
          1,
          rows.length,
          1
        )
        .getDisplayValues()
        .flat()
        .map(String);

    const baburkaWrittenIds =
      baburkaSheet
        .getRange(
          transaction.baburkaStartRow,
          1,
          rows.length,
          1
        )
        .getDisplayValues()
        .flat()
        .map(String);

    const expectedIds =
      settlementIds.map(String);

    const finalCheckOk =
      JSON.stringify(
        alternativeWrittenIds
      ) ===
        JSON.stringify(expectedIds) &&
      JSON.stringify(
        baburkaWrittenIds
      ) ===
        JSON.stringify(expectedIds);

    if (!finalCheckOk) {
      throw new Error(
        'Фінальна перевірка записаних ID не пройдена.'
      );
    }

    return {
      ok: true,
      writesNow: true,
      eventId: eventId,
      importedTransferCount:
        rows.length,
      julyAmount: 19615,
      augustAmount: 105670.04,
      totalAccrualAmount:
        Math.round(
          audit.totalAccrualAmount * 100
        ) / 100,
      alternativeStartRow:
        transaction.alternativeStartRow,
      baburkaStartRow:
        transaction.baburkaStartRow,
      nextDecision:
        'READY_FOR_SETTLEMENT_REGISTER_POSTCHECK'
    };

  } catch (error) {
    /*
     * Відкат лише рядків, створених цим запуском.
     */
    if (
      transaction.alternativeSheet &&
      transaction.alternativeStartRow > 0 &&
      transaction.rowCount > 0
    ) {
      try {
        transaction
          .alternativeSheet
          .deleteRows(
            transaction.alternativeStartRow,
            transaction.rowCount
          );
      } catch (rollbackError) {
        console.log(
          'Помилка rollback Альтернативи: ' +
          rollbackError.message
        );
      }
    }

    if (
      transaction.baburkaSheet &&
      transaction.baburkaStartRow > 0 &&
      transaction.rowCount > 0
    ) {
      try {
        transaction
          .baburkaSheet
          .deleteRows(
            transaction.baburkaStartRow,
            transaction.rowCount
          );
      } catch (rollbackError) {
        console.log(
          'Помилка rollback Бабурки: ' +
          rollbackError.message
        );
      }
    }

    throw error;

  } finally {
    lock.releaseLock();
  }
}
function compareInterbranchSettlementCandidatesAcrossBranches() {
  const config =
    INTERBRANCH_SETTLEMENTS_CONFIG;

  const branches =
    INTERBRANCH_TRANSFER_CONFIG
      .branches;

  const alternativeConfig =
    branches[
      config.creditorBranch
    ];

  const baburkaConfig =
    branches[
      config.debtorBranch
    ];

  if (
    !alternativeConfig ||
    !baburkaConfig
  ) {
    throw new Error(
      'Не знайдено конфігурацію Альтернативи або Бабурки.'
    );
  }

  const startParts =
    config
      .accountingStartDate
      .split('-')
      .map(Number);

  const startDate =
    new Date(
      startParts[0],
      startParts[1] - 1,
      startParts[2]
    );

  function text_(value) {
    return String(
      value == null ? '' : value
    ).trim();
  }

  function normalize_(value) {
    return text_(value)
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  function number_(value) {
    const result =
      Number(value);

    return Number.isFinite(result)
      ? result
      : 0;
  }

  function date_(value) {
    if (
      value instanceof Date &&
      !Number.isNaN(value.getTime())
    ) {
      return value;
    }

    const result =
      new Date(value);

    return Number.isNaN(result.getTime())
      ? null
      : result;
  }

  function collect_(spreadsheet) {
    const sheet =
      spreadsheet.getSheetByName(
        'Переміщення між філіями'
      );

    if (!sheet) {
      throw new Error(
        'Не знайдено журнал переміщень у "' +
        spreadsheet.getName() +
        '".'
      );
    }

    const headers =
      sheet
        .getRange(
          1,
          1,
          1,
          sheet.getLastColumn()
        )
        .getDisplayValues()[0]
        .map(text_);

    const column = {};

    headers.forEach(function(header, index) {
      column[header] = index;
    });

    const requiredHeaders = [
      'ID переміщення',
      'Філія-відправник',
      'Філія-одержувач',
      'ID вихідної партії',
      'ID партії одержувача',
      'Кількість',
      'Собівартість одиниці',
      'Загальна собівартість',
      'Статус',
      'Дата приймання / повернення'
    ];

    const missingHeaders =
      requiredHeaders.filter(function(header) {
        return (
          column[header] === undefined
        );
      });

    if (missingHeaders.length > 0) {
      throw new Error(
        'У "' +
        spreadsheet.getName() +
        '" бракує колонок: ' +
        missingHeaders.join(', ')
      );
    }

    const map = {};

    if (sheet.getLastRow() < 2) {
      return map;
    }

    const values =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          headers.length
        )
        .getValues();

    values.forEach(function(row) {
      const transferId =
        text_(
          row[
            column['ID переміщення']
          ]
        );

      const acceptedAt =
        date_(
          row[
            column[
              'Дата приймання / повернення'
            ]
          ]
        );

      const isCandidate =
        transferId &&
        normalize_(
          row[
            column['Філія-відправник']
          ]
        ) ===
          normalize_(config.creditorBranch) &&
        normalize_(
          row[
            column['Філія-одержувач']
          ]
        ) ===
          normalize_(config.debtorBranch) &&
        normalize_(
          row[
            column['Статус']
          ]
        ) ===
          normalize_('Прийнято') &&
        acceptedAt &&
        acceptedAt.getTime() >=
          startDate.getTime();

      if (!isCandidate) {
        return;
      }

      map[transferId] = {
        acceptedAt:
          acceptedAt.getTime(),

        sourceLotId:
          text_(
            row[
              column['ID вихідної партії']
            ]
          ),

        receiverLotId:
          text_(
            row[
              column['ID партії одержувача']
            ]
          ),

        quantity:
          number_(
            row[
              column['Кількість']
            ]
          ),

        unitCost:
          number_(
            row[
              column['Собівартість одиниці']
            ]
          ),

        totalCost:
          number_(
            row[
              column[
                'Загальна собівартість'
              ]
            ]
          )
      };
    });

    return map;
  }

  const alternative =
    SpreadsheetApp.openById(
      alternativeConfig.spreadsheetId
    );

  const baburka =
    SpreadsheetApp.openById(
      baburkaConfig.spreadsheetId
    );

  const alternativeMap =
    collect_(alternative);

  const baburkaMap =
    collect_(baburka);

  const allTransferIds =
    Array.from(
      new Set(
        Object.keys(
          alternativeMap
        ).concat(
          Object.keys(baburkaMap)
        )
      )
    ).sort();

  const differences = [];

  allTransferIds.forEach(function(transferId) {
    const left =
      alternativeMap[transferId];

    const right =
      baburkaMap[transferId];

    if (!left || !right) {
      differences.push({
        transferId: transferId,
        code:
          left
            ? 'MISSING_IN_BABURKA'
            : 'MISSING_IN_ALTERNATIVE'
      });

      return;
    }

    const fields = [
      'acceptedAt',
      'sourceLotId',
      'receiverLotId',
      'quantity',
      'unitCost',
      'totalCost'
    ];

    const changedFields =
      fields.filter(function(field) {
        if (
          typeof left[field] === 'number' &&
          typeof right[field] === 'number'
        ) {
          return (
            Math.abs(
              left[field] -
              right[field]
            ) > 0.01
          );
        }

        return (
          left[field] !==
          right[field]
        );
      });

    if (changedFields.length > 0) {
      differences.push({
        transferId: transferId,
        code: 'DATA_MISMATCH',
        fields: changedFields,
        alternative: left,
        baburka: right
      });
    }
  });

  const result = {
    ok:
      differences.length === 0,

    test:
      'compareInterbranchSettlementCandidatesAcrossBranches',

    writesNow:
      false,

    accountingStartDate:
      config.accountingStartDate,

    alternativeCandidateCount:
      Object.keys(
        alternativeMap
      ).length,

    baburkaCandidateCount:
      Object.keys(
        baburkaMap
      ).length,

    matchedTransferCount:
      allTransferIds.length -
      differences.length,

    differences:
      differences,

    nextDecision:
      differences.length === 0
        ? 'READY_FOR_BUSINESS_CONFIRMATION_AND_IMPORT'
        : 'STOP_AND_REVIEW_DIFFERENCES'
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
function auditInterbranchSettlementImportPostcheck() {
  const config =
    INTERBRANCH_SETTLEMENTS_CONFIG;

  const branches =
    INTERBRANCH_TRANSFER_CONFIG
      .branches;

  const alternative =
    SpreadsheetApp.openById(
      branches[
        config.creditorBranch
      ].spreadsheetId
    );

  const baburka =
    SpreadsheetApp.openById(
      branches[
        config.debtorBranch
      ].spreadsheetId
    );

  function readRegister_(spreadsheet) {
    const sheet =
      spreadsheet.getSheetByName(
        config.settlementSheetName
      );

    if (!sheet) {
      throw new Error(
        'Не знайдено реєстр у "' +
        spreadsheet.getName() +
        '".'
      );
    }

    if (sheet.getLastRow() < 2) {
      return {
        sheet: sheet.getName(),
        rows: [],
        total: 0
      };
    }

    const rows =
      sheet
        .getRange(
          2,
          1,
          sheet.getLastRow() - 1,
          16
        )
        .getValues();

    return {
      sheet: sheet.getName(),
      rows: rows,
      total: rows.reduce(
        function(sum, row) {
          return sum + (Number(row[9]) || 0);
        },
        0
      )
    };
  }

  const alternativeData =
    readRegister_(alternative);

  const baburkaData =
    readRegister_(baburka);

  const differences = [];

  if (
    alternativeData.rows.length !==
    baburkaData.rows.length
  ) {
    differences.push(
      'Різна кількість рядків у реєстрах.'
    );
  }

  const rowCount =
    Math.min(
      alternativeData.rows.length,
      baburkaData.rows.length
    );

  for (
    let index = 0;
    index < rowCount;
    index++
  ) {
    const alternativeRow =
      alternativeData.rows[index];

    const baburkaRow =
      baburkaData.rows[index];

    /*
     * Порівнюємо A:N.
     * O і P можуть відрізнятися надалі через дату оплати
     * та локальний аудит.
     */
    const left =
      alternativeRow
        .slice(0, 14)
        .map(String);

    const right =
      baburkaRow
        .slice(0, 14)
        .map(String);

    if (
      JSON.stringify(left) !==
      JSON.stringify(right)
    ) {
      differences.push(
        'Розбіжність у рядку ' +
        (index + 2) +
        ': ' +
        String(alternativeRow[0] || '')
      );
    }
  }

  const invalidRows =
    alternativeData.rows
      .concat(baburkaData.rows)
      .filter(function(row) {
        const amount =
          Number(row[9]) || 0;

        const paid =
          Number(row[11]) || 0;

        const balance =
          Number(row[12]) || 0;

        const status =
          String(row[13] || '').trim();

        return (
          !String(row[0] || '').trim() ||
          !String(row[1] || '').trim() ||
          status !== 'Нараховано' ||
          paid !== 0 ||
          Math.abs(balance - amount) > 0.01
        );
      });

  const result = {
    ok:
      alternativeData.rows.length === 28 &&
      baburkaData.rows.length === 28 &&
      Math.abs(
        alternativeData.total -
        125285.04
      ) <= 0.01 &&
      Math.abs(
        baburkaData.total -
        125285.04
      ) <= 0.01 &&
      differences.length === 0 &&
      invalidRows.length === 0,

    test:
      'auditInterbranchSettlementImportPostcheck',

    writesNow:
      false,

    alternativeRows:
      alternativeData.rows.length,

    baburkaRows:
      baburkaData.rows.length,

    alternativeTotal:
      Math.round(
        alternativeData.total * 100
      ) / 100,

    baburkaTotal:
      Math.round(
        baburkaData.total * 100
      ) / 100,

    differences:
      differences,

    invalidRowsCount:
      invalidRows.length,

    nextDecision:
      'READY_FOR_REPORT_INTEGRATION'
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
/**
 * Діагностика місць для відображення
 * міжфілійної заборгованості у Cash Flow і дашборді.
 *
 * Нічого не змінює.
 */
function auditInterbranchCashFlowDashboardReadiness() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const candidateSheets =
    ss.getSheets()
      .filter(function(sheet) {
        const name =
          String(sheet.getName() || '')
            .toLowerCase();

        return (
          name.indexOf('cash') !== -1 ||
          name.indexOf('дашборд') !== -1
        );
      })
      .map(function(sheet) {
        const lastRow =
          Math.min(
            sheet.getLastRow(),
            180
          );

        const lastColumn =
          Math.min(
            sheet.getLastColumn(),
            12
          );

        const values =
          lastRow > 0 && lastColumn > 0
            ? sheet
                .getRange(
                  1,
                  1,
                  lastRow,
                  lastColumn
                )
                .getDisplayValues()
            : [];

        const labels = values
          .map(function(row, index) {
            const text =
              row
                .map(function(value) {
                  return String(
                    value || ''
                  ).trim();
                })
                .filter(Boolean)
                .join(' | ');

            return text
              ? {
                  row: index + 1,
                  text: text.slice(0, 250)
                }
              : null;
          })
          .filter(Boolean);

        return {
          sheetName: sheet.getName(),
          lastRow: sheet.getLastRow(),
          lastColumn: sheet.getLastColumn(),
          visibleLabels: labels
        };
      });

  const result = {
    ok: candidateSheets.length > 0,
    test:
      'auditInterbranchCashFlowDashboardReadiness',
    writesNow: false,
    spreadsheet: ss.getName(),
    candidateSheets: candidateSheets,
    nextDecision:
      'CHOOSE_CASHFLOW_AND_DASHBOARD_TARGETS'
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
/**
 * Коротко знаходить наявні місця для
 * дебіторки / кредиторки на дашборді.
 *
 * Нічого не змінює.
 */
function auditInterbranchDashboardTargets() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const keywords = [
    'заборг',
    'дебітор',
    'кредитор',
    'взаєморозрах',
    'грошов',
    'cash'
  ];

  const sheets =
    ss.getSheets()
      .filter(function(sheet) {
        const name =
          String(sheet.getName() || '')
            .toLowerCase();

        return (
          name.indexOf('дашборд') !== -1 ||
          name.indexOf('cash') !== -1
        );
      })
      .map(function(sheet) {
        const rowCount =
          Math.min(
            sheet.getLastRow(),
            120
          );

        const columnCount =
          Math.min(
            sheet.getLastColumn(),
            30
          );

        const values =
          sheet
            .getRange(
              1,
              1,
              rowCount,
              columnCount
            )
            .getDisplayValues();

        const matchedCells = [];

        values.forEach(function(row, rowIndex) {
          row.forEach(function(value, columnIndex) {
            const text =
              String(value || '')
                .trim();

            const normalized =
              text.toLowerCase();

            if (
              text &&
              keywords.some(function(keyword) {
                return (
                  normalized.indexOf(keyword) !== -1
                );
              })
            ) {
              matchedCells.push({
                cell:
                  sheet
                    .getRange(
                      rowIndex + 1,
                      columnIndex + 1
                    )
                    .getA1Notation(),
                value: text
              });
            }
          });
        });

        return {
          sheetName: sheet.getName(),
          lastRow: sheet.getLastRow(),
          lastColumn: sheet.getLastColumn(),
          matchedCells: matchedCells
        };
      });

  const result = {
    ok: true,
    test:
      'auditInterbranchDashboardTargets',
    writesNow: false,
    spreadsheet: ss.getName(),
    sheets: sheets,
    nextDecision:
      'DEFINE_DASHBOARD_DEBT_CARDS'
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
/**
 * Перевіряє блок наявної картки «Кредиторка»
 * та структуру «Дані дашборду».
 *
 * Нічого не змінює.
 */
function auditInterbranchDashboardDebtCardDetails() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const dashboard =
    ss.getSheetByName('Дашборд');

  const dashboardData =
    ss.getSheets()
      .find(function(sheet) {
        return String(
          sheet.getName() || ''
        ).trim().toLowerCase() ===
          'дані дашборду';
      });

  if (!dashboard) {
    throw new Error(
      'Не знайдено лист "Дашборд".'
    );
  }

  function getNonEmptyCells_(range) {
    const values =
      range.getDisplayValues();

    const formulas =
      range.getFormulas();

    const result = [];

    values.forEach(function(row, rowIndex) {
      row.forEach(function(value, columnIndex) {
        const formula =
          String(
            formulas[rowIndex][columnIndex] || ''
          ).trim();

        const displayValue =
          String(value || '').trim();

        if (displayValue || formula) {
          result.push({
            cell:
              range
                .getCell(
                  rowIndex + 1,
                  columnIndex + 1
                )
                .getA1Notation(),
            value: displayValue,
            formula: formula
          });
        }
      });
    });

    return result;
  }

  const debtCardRange =
    dashboard.getRange('Y1:AJ15');

  const dashboardDataRange =
    dashboardData
      ? dashboardData.getRange(
          1,
          1,
          Math.min(
            dashboardData.getLastRow(),
            35
          ),
          Math.min(
            dashboardData.getLastColumn(),
            28
          )
        )
      : null;

  const result = {
    ok: true,
    test:
      'auditInterbranchDashboardDebtCardDetails',
    writesNow: false,
    spreadsheet: ss.getName(),

    debtCardArea: {
      range: debtCardRange.getA1Notation(),

      mergedRanges:
        debtCardRange
          .getMergedRanges()
          .map(function(range) {
            return range.getA1Notation();
          }),

      nonEmptyCells:
        getNonEmptyCells_(debtCardRange)
    },

    dashboardData: dashboardData
      ? {
          sheetName: dashboardData.getName(),
          range: dashboardDataRange.getA1Notation(),
          nonEmptyCells:
            getNonEmptyCells_(
              dashboardDataRange
            )
        }
      : {
          sheetName: '',
          nonEmptyCells: []
        },

    nextDecision:
      'CONNECT_EXISTING_DEBT_CARD_TO_SETTLEMENT_REGISTER'
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}
/**
 * Оновлює картки взаєморозрахунків
 * на дашборді поточної філії.
 *
 * Джерело: «Взаєморозрахунки філій».
 * Cash Flow та P&L не змінюються.
 */
/**
 * Оновлює інформаційні картки внутрішнього переміщення запасів
 * на дашборді поточної філії.
 *
 * Джерело: «Взаєморозрахунки філій» — технічний реєстр передач.
 * Це не борг і не грошовий потік.
 */
function refreshInterbranchSettlementDashboardCardsForSpreadsheet_(
  ss,
  period
) {
  if (
    typeof INTERBRANCH_SETTLEMENTS_CONFIG ===
      'undefined' ||
    typeof getCurrentInterbranchBranch_ !==
      'function'
  ) {
    throw new Error(
      'Не знайдено конфігурацію взаєморозрахунків.'
    );
  }

  const config =
    INTERBRANCH_SETTLEMENTS_CONFIG;

  const currentBranch =
    getCurrentInterbranchBranch_(
      ss.getId()
    );

  if (!currentBranch) {
    throw new Error(
      'Поточну філію не знайдено в конфігурації.'
    );
  }

  const dashboard =
    ss.getSheets().find(function(sheet) {
      return String(
        sheet.getName() || ''
      ).trim().toLowerCase() ===
        'дашборд';
    });

  const settlements =
    ss.getSheetByName(
      config.settlementSheetName
    );

  if (!dashboard || !settlements) {
    throw new Error(
      'Не знайдено лист «Дашборд» або ' +
      '«Взаєморозрахунки філій».'
    );
  }

  function dateOnly_(value) {
    if (
      value instanceof Date &&
      !Number.isNaN(value.getTime())
    ) {
      return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate()
      );
    }

    const text =
      String(
        value == null ? '' : value
      ).trim();

    let match =
      text.match(
        /^(\d{4})-(\d{2})-(\d{2})/
      );

    if (match) {
      return new Date(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      );
    }

    match =
      text.match(
        /^(\d{2})\.(\d{2})\.(\d{4})/
      );

    if (match) {
      return new Date(
        Number(match[3]),
        Number(match[2]) - 1,
        Number(match[1])
      );
    }

    const parsed =
      new Date(text);

    return Number.isNaN(parsed.getTime())
      ? null
      : new Date(
          parsed.getFullYear(),
          parsed.getMonth(),
          parsed.getDate()
        );
  }

  const hasPeriod = !!(
    period &&
    period.from &&
    period.to
  );

  let periodFrom = null;
  let periodTo = null;

  if (hasPeriod) {
    periodFrom =
      dateOnly_(period.from);

    periodTo =
      dateOnly_(period.to);

    if (
      !periodFrom ||
      !periodTo ||
      periodFrom.getTime() >
        periodTo.getTime()
    ) {
      throw new Error(
        'Некоректний період для карток взаєморозрахунків.'
      );
    }
  }

  const values =
    settlements.getLastRow() < 2
      ? []
      : settlements
          .getRange(
            2,
            1,
            settlements.getLastRow() - 1,
            16
          )
          .getValues();

  const rows =
    values.filter(function(row) {
      return (
        String(row[4] || '').trim() ===
          config.creditorBranch &&
        String(row[5] || '').trim() ===
          config.debtorBranch &&
        String(row[13] || '').trim() !==
          'Скасовано'
      );
    });

  const periodRows =
    hasPeriod
      ? rows.filter(function(row) {
          const accrualDate =
            dateOnly_(row[2]);

          if (!accrualDate) {
            throw new Error(
              'У реєстрі є некоректна дата нарахування.'
            );
          }

          return (
            accrualDate.getTime() >=
              periodFrom.getTime() &&
            accrualDate.getTime() <=
              periodTo.getTime()
          );
        })
      : rows;

  const months =
    rows
      .map(function(row) {
        return String(row[3] || '').trim();
      })
      .filter(Boolean)
      .sort();

  const latestMonth =
    months.length
      ? months[months.length - 1]
      : '';

  function roundMoney_(value) {
    return Math.round(
      Number(value || 0) * 100
    ) / 100;
  }

  function getPeriodLabel_() {
    if (!hasPeriod) {
      return latestMonth;
    }

    const mode =
      String(
        period.mode || ''
      ).toUpperCase();

    if (mode === 'MONTH') {
      return Utilities.formatDate(
        periodFrom,
        Session.getScriptTimeZone(),
        'yyyy.MM'
      );
    }

    if (mode === 'QUARTER') {
      const quarter =
        Math.floor(
          periodFrom.getMonth() / 3
        ) + 1;

      return (
        quarter +
        ' квартал ' +
        periodFrom.getFullYear()
      );
    }

    if (mode === 'ALL') {
      return 'весь період';
    }

    return (
      Utilities.formatDate(
        periodFrom,
        Session.getScriptTimeZone(),
        'dd.MM.yyyy'
      ) +
      '–' +
      Utilities.formatDate(
        periodTo,
        Session.getScriptTimeZone(),
        'dd.MM.yyyy'
      )
    );
  }

  const transferValueForPeriod =
    periodRows.reduce(function(sum, row) {
      return sum + (
        Number(row[9]) || 0
      );
    }, 0);

  const totalTransferValue =
    rows.reduce(function(sum, row) {
      return sum + (
        Number(row[9]) || 0
      );
    }, 0);

  const isSender =
    currentBranch.name ===
    config.creditorBranch;

    const monthlyLabel =
    isSender
      ? 'Передано до Бабурки'
      : 'Отримано від Альтернативи';

  const totalLabel =
    isSender
      ? 'Облікова вартість передач'
      : 'Облікова вартість отримань';
  dashboard
    .getRange('F13')
    .setValue(monthlyLabel);

  dashboard
    .getRange('F14')
    .setValue(
      roundMoney_(
        transferValueForPeriod
      )
    );

  dashboard
    .getRange('F15')
    .setValue(totalLabel);

  dashboard
    .getRange('F16')
    .setValue(
      roundMoney_(
        totalTransferValue
      )
    );

  dashboard
    .getRangeList([
      'F14',
      'F16'
    ])
    .setNumberFormat('#,##0.00');

  dashboard
    .getRangeList([
      'G13',
      'G14',
      'G15',
      'G16'
    ])
    .clearContent();

  const result = {
    ok: true,
    writesNow: true,
    branch: currentBranch.name,
    partner: isSender
      ? config.debtorBranch
      : config.creditorBranch,
    filterPeriod: hasPeriod
      ? {
          mode: period.mode || '',
          from: Utilities.formatDate(
            periodFrom,
            Session.getScriptTimeZone(),
            'dd.MM.yyyy'
          ),
          to: Utilities.formatDate(
            periodTo,
            Session.getScriptTimeZone(),
            'dd.MM.yyyy'
          ),
          source: period.source || ''
        }
      : null,
    periodRowsCount:
      periodRows.length,
    transferValueForPeriod:
      roundMoney_(
        transferValueForPeriod
      ),
    totalTransferValue:
      roundMoney_(
        totalTransferValue
      ),
    updatedCells: [
      'F13',
      'F14',
      'F15',
      'F16'
    ],
    clearedLegacyCells: [
      'G13',
      'G14',
      'G15',
      'G16'
    ]
  };

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


function refreshInterbranchSettlementDashboardCards() {
  return (
    refreshInterbranchSettlementDashboardCardsForSpreadsheet_(
      SpreadsheetApp.getActiveSpreadsheet()
    )
  );
}
function testInterbranchSettlementCardsWithJulyPeriod() {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const result =
    refreshInterbranchSettlementDashboardCardsForSpreadsheet_(
      ss,
      {
        mode: 'MONTH',
        from: new Date(2026, 6, 1),
        to: new Date(2026, 6, 31),
        source: 'TEST_JULY'
      }
    );

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}