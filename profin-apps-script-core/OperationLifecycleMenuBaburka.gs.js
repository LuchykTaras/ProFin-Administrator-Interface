/**
 * Вхідна функція меню контрольованого скасування.
 */
function openControlledOperationCancellationBaburka(
  preselectedOperationId
 ) {
  const ui = SpreadsheetApp.getUi();
  try {
    let enteredId = clean_(preselectedOperationId);

if (!enteredId) {
  const prompt = ui.prompt(
    'Скасування операції',
    'Введіть точний ID операції.\n\n' +
      'Рядок не видалятиметься фізично. ' +
      'Після підтвердження статус зміниться на "Скасовано".',
    ui.ButtonSet.OK_CANCEL
  );

  if (
    prompt.getSelectedButton() !==
    ui.Button.OK
  ) {
    return {
      ok: false,
      writesNow: false,
      cancelledByUser: true
    };
  }

  enteredId = clean_(
    prompt.getResponseText()
  );
}

if (!enteredId) {
  throw new Error(
    'ID операції не введено.'
  );
 }

 const operationId =
  resolveLifecycleRootOperationIdBaburka_(
    enteredId
  );

   /*
 * Міжфілійне переміщення скасовуємо
 * окремим складським сценарієм.
 */
 if (
  operationId.indexOf('TRF-') === 0
 ) {
  return cancelAcceptedInterbranchTransferByKnownId_(
    operationId
  );
 }
 const lifecycle =
  analyzeOperationById_(
    operationId,
    {
      branch: 'Бабурка'
    }
  );

    if (!lifecycle.baseRows.length) {
      throw new Error(
        'Операцію з ID "' +
          operationId +
          '" не знайдено в "Базі операцій".'
      );
    }

    if (
      lifecycle.baseRows.length !== 1
    ) {
      throw new Error(
        'Знайдено кілька рядків із таким ID. ' +
          'Скасування заблоковано.'
      );
    }

    const ss =
      SpreadsheetApp.getActiveSpreadsheet();

    const baseSheet =
      ss.getSheetByName(
        'База операцій'
      );

    const baseRow =
      lifecycle.baseRows[0];

    const values =
      baseSheet
        .getRange(
          baseRow,
          1,
          1,
          33
        )
        .getDisplayValues()[0];

    const details = {
      id:
        clean_(values[0]),

      account:
        clean_(values[1]),

      date:
        clean_(values[3]),

      amount:
        clean_(values[6]),

      doctor:
        clean_(values[7]),

      patient:
        clean_(values[8]),

      type:
        clean_(values[9]),

      category:
        clean_(values[10]),

      article:
        clean_(values[11]),

      comment:
        clean_(values[12]),

      status:
        clean_(values[29])
    };

    if (
      details.status !==
      'Проведено'
    ) {
      throw new Error(
        'Операцію не можна скасувати.\n' +
          'Поточний статус: ' +
          (
            details.status ||
            'порожній'
          )
      );
    }

    /*
     * Вакцинна операція.
     */
    if (
      details.type ===
      'Вакцина'
    ) {
      return (
        handleControlledVaccineCancellationBaburka_(
          operationId,
          details
        )
      );
    }

    /*
 * Визначаємо, чи L-* справді є складським надходженням.
 *
 * Старі фінансові закупки також можуть мати ID L-*,
 * але не створювати партію та рух складу.
 */
 const isPurchaseId =
  operationId.indexOf('L-') === 0;

 const hasInventoryDependencies =
  Boolean(
    (lifecycle.stockRows || []).length ||
    (lifecycle.movementRows || []).length ||
    (lifecycle.lotIds || []).length
  );

 const isFinancialOnlyPurchase =
  isPurchaseId &&
  !hasInventoryDependencies;

 /*
 * Лише реальне складське надходження
 * передаємо у каскадний складський обробник.
 */
 if (
  isPurchaseId &&
  hasInventoryDependencies
 ) {
  return (
    handleControlledInventoryReceiptCancellationBaburka_(
      operationId,
      details
    )
  );
 }
    /*
     * Звичайна фінансова операція.
     */
    if (
  !isFinancialOnlyPurchase &&
  lifecycle.status !==
    'SAFE_SIMPLE_CANDIDATE'
 ) {
      const dependencies =
        lifecycle.dependentOperationIds.length
          ? lifecycle.dependentOperationIds.join(', ')
          : 'виявлено пов’язані облікові записи';

      throw new Error(
        'Автоматичне скасування заблоковано.\n\n' +
          'Залежності:\n' +
          dependencies
      );
    }

    const confirmationText = [
      'Підтвердити скасування операції?',
      '',
      'ID: ' + details.id,
      'Дата: ' + (details.date || 'не вказано'),
      'Сума: ' + (details.amount || '0'),
      'Рахунок: ' + (details.account || 'не вказано'),
      'Тип: ' + (details.type || 'не вказано'),
      'Категорія: ' + (details.category || 'не вказано'),
      'Стаття: ' + (details.article || 'не вказано'),
      'Пацієнт: ' + (details.patient || 'не вказано'),
      '',
      'Після підтвердження:',
      '• статус стане "Скасовано";',
      '• операція буде виключена зі звітів;',
      '• дія буде записана в журнал;',
      '• рядок фізично не видалятиметься.'
    ].join('\n');

    const confirmation =
      ui.alert(
        'Контрольоване скасування',
        confirmationText,
        ui.ButtonSet.YES_NO
      );

    if (
      confirmation !==
      ui.Button.YES
    ) {
      return {
        ok: false,
        writesNow: false,
        cancelledByUser: true,
        operationId: operationId
      };
    }

    const result =
      executeControlledSimpleCancellationBaburka_(
        operationId,
        lifecycle.checksum
      );

    refreshDeletionGuardAfterSystemWriteBaburka_();

    ui.alert(
      'Операцію скасовано',
      'ID: ' +
        operationId +
        '\nРядок: ' +
        result.baseRow +
        '\nСтатус: Проведено → Скасовано\n' +
        'Подія журналу: ' +
        result.eventId,
      ui.ButtonSet.OK
    );

    return result;

  } catch (error) {
    const message =
      String(
        error &&
        error.message
          ? error.message
          : error
      );

    ui.alert(
      'Скасування не виконано',
      message,
      ui.ButtonSet.OK
    );

    return {
      ok: false,
      writesNow: false,
      error: message
    };
  }
}
/**
 * ОДНОРАЗОВА ПЕРЕВІРКА АНАЛІЗАТОРА В "АЛЬТЕРНАТИВІ".
 *
 * Нічого не змінює.
 */
/**
 * Перетворює ID руху складу або дочірній ID
 * на кореневий ID операції з «Бази операцій».
 */
function resolveLifecycleRootOperationIdBaburka_(
  enteredId
) {
  const id = clean_(enteredId);

  if (!id) {
    throw new Error(
      'ID операції не введено.'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    ss.getSheetByName(
      'База операцій'
    );

  if (!baseSheet) {
    throw new Error(
      'Не знайдено лист "База операцій".'
    );
  }

  /*
   * Спочатку перевіряємо, чи це вже кореневий ID.
   */
  const baseLastRow =
    baseSheet.getLastRow();

  if (baseLastRow >= 10) {
    const baseIds =
      baseSheet
        .getRange(
          10,
          1,
          baseLastRow - 9,
          1
        )
        .getDisplayValues();

    const baseFound =
      baseIds.some(
        function(row) {
          return clean_(row[0]) === id;
        }
      );

    if (baseFound) {
      return id;
    }
  }

  /*
   * Якщо введено ID руху, знаходимо в колонці B
   * пов’язаний ID операції.
   */
  const movementSheet =
    ss.getSheetByName(
      'Рух складу'
    );

  if (movementSheet) {
    const movementLastRow =
      movementSheet.getLastRow();

    if (movementLastRow >= 2) {
      const movements =
        movementSheet
          .getRange(
            2,
            1,
            movementLastRow - 1,
            2
          )
          .getDisplayValues();

      for (
        let index = 0;
        index < movements.length;
        index++
      ) {
        const movementId =
          clean_(
            movements[index][0]
          );

        if (movementId !== id) {
          continue;
        }

        const relatedOperationId =
          clean_(
            movements[index][1]
          );

        if (!relatedOperationId) {
          throw new Error(
            'Для руху "' +
              id +
              '" не вказано ID операції.'
          );
        }

        return normalizeLifecycleChildOperationIdBaburka_(
          relatedOperationId
        );
      }
    }
  }

  /*
   * Резервне очищення стандартного суфікса руху.
   */
  const normalizedId =
    id.replace(
      /-MOV-(?:IN|OUT|REVERSAL)(?:-[A-Z0-9]+)*$/i,
      ''
    );

  return normalizeLifecycleChildOperationIdBaburka_(
    normalizedId
  );
}


/**
 * Перетворює дочірній VST-ID на кореневий VAC-ID.
 */
function normalizeLifecycleChildOperationIdBaburka_(
  operationId
) {
  const id =
    clean_(operationId);

  if (id.indexOf('VST|') === 0) {
    const parts =
      id.split('|');

    if (
      parts.length >= 2 &&
      clean_(parts[1])
    ) {
      return clean_(parts[1]);
    }
  }

  return id;
}
function cancelLastActiveOperationBaburka() {
  const ui = SpreadsheetApp.getUi();

  try {
    const ss =
      SpreadsheetApp.getActiveSpreadsheet();

    const baseSheet =
      ss.getSheetByName('База операцій');

    if (!baseSheet) {
      throw new Error(
        'Не знайдено лист «База операцій».'
      );
    }

    const lastRow = baseSheet.getLastRow();

    if (lastRow < 2) {
      throw new Error(
        'У «Базі операцій» немає проведених операцій.'
      );
    }

    const rows = baseSheet
      .getRange(
        2,
        1,
        lastRow - 1,
        33
      )
      .getDisplayValues();

    let operationId = '';

    for (let index = rows.length - 1; index >= 0; index--) {
      const row = rows[index];

      const id = clean_(row[0]);
      const status = clean_(row[29]);

      if (
        id &&
        status === 'Проведено' &&
        id.toLowerCase().indexOf('test') === -1
      ) {
        operationId = id;
        break;
      }
    }

    if (!operationId) {
      throw new Error(
        'Не знайдено активної проведеної операції ' +
          'для скасування.'
      );
    }

    return openControlledOperationCancellationBaburka(
      operationId
    );

  } catch (error) {
    const message = String(
      error && error.message
        ? error.message
        : error
    );

    ui.alert(
      'Скасування не виконано',
      message,
      ui.ButtonSet.OK
    );

    return {
      ok: false,
      writesNow: false,
      error: message
    };
  }
}