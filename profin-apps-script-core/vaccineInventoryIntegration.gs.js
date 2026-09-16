/****************************************************
 * VACCINE INVENTORY INTEGRATION
 * --------------------------------------------------
 * Зв’язує:
 *
 * Ввід операцій
 * → База операцій
 * → Облік вакцин
 * → FEFO-вибуття
 * → Рух складу
 *
 * Колонки листа "Облік вакцин":
 * A — ID вакцини
 * B — ID продажу
 * C — Пацієнт
 * D — Вакцина
 * E — Собівартість
 * F — Статус
 * G — Планова дата
 * H — Фактична дата
 * I — Коментар
 * J — ID партії
 * K — Серія
 * L — Термін придатності
 * M — ID складського руху
 ****************************************************/

const VACCINE_INVENTORY_LINK_CONFIG = {
  registrySheetName:
    'Облік вакцин',

  startRow:
    2,

  width:
    13,

  columns: {
    vaccineId:
      1,

    saleId:
      2,

    patient:
      3,

    vaccineName:
      4,

    cost:
      5,

    status:
      6,

    plannedDate:
      7,

    actualDate:
      8,

    comment:
      9,

    lotId:
      10,

    series:
      11,

    expiryDate:
      12,

    movementId:
      13
  }
};


/****************************************************
 * ГОЛОВНА ТОЧКА ІНТЕГРАЦІЇ
 *
 * Викликати замість прямого:
 * writeInventoryIssue_(data)
 ****************************************************/
function completeVaccineInventoryIssue_(data) {
  if (!data || !data.id) {
    throw new Error(
      'Не передано дані вакцинної операції або ID операції'
    );
  }

  /*
   * 1. Проводимо FEFO-вибуття.
   */
  const issueResult =
    writeInventoryIssue_(
      data
    );

  /*
   * Операції без складського вибуття
   * повертаємо без додаткової інтеграції.
   */
  if (
    !issueResult ||
    issueResult.requiresIssue !== true
  ) {
    return issueResult;
  }

  /*
   * 2. Формуємо стабільний контракт
   * завершеного складського вибуття.
   */
  const completionPayload =
    buildInventoryIssueCompletionPayload_(
      issueResult
    );

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  let registrySheet = null;
  let registrySnapshot = [];

  try {
    registrySheet =
      ss.getSheetByName(
        VACCINE_INVENTORY_LINK_CONFIG
          .registrySheetName
      );

    if (!registrySheet) {
      throw new Error(
        'Не знайдено лист "' +
        VACCINE_INVENTORY_LINK_CONFIG
          .registrySheetName +
        '"'
      );
    }

    /*
     * 3. Знімок "Облік вакцин"
     * перед будь-якими змінами.
     */
    registrySnapshot =
      snapshotVaccineRegistryRowsByOperation_(
        registrySheet,
        data.id
      );

    /*
     * 4. Прив’язуємо FEFO-партії
     * до рядків "Облік вакцин".
     *
     * Передаємо вже нормалізований
     * completionPayload.
     */
    const registryResult =
      linkInventoryIssueToVaccineRegistry_(
        registrySheet,
        data,
        completionPayload
      );

    SpreadsheetApp.flush();

    /*
     * 5. Додаємо результат реєстру
     * до підсумкового контракту.
     */
    completionPayload.vaccineRegistry =
      registryResult;

    return completionPayload;

  } catch (error) {
    const rollbackErrors = [];

    /*
     * 6. Відкат складу і рухів.
     */
    try {
      if (
        completionPayload &&
        Array.isArray(
          completionPayload
            ._rollbackSnapshot
        ) &&
        completionPayload
          ._rollbackSnapshot
          .length
      ) {
        rollbackInventoryIssue_(
          data.id,
          completionPayload
            ._rollbackSnapshot
        );
      } else {
        rollbackErrors.push(
          'У контракті відсутній _rollbackSnapshot'
        );
      }
    } catch (rollbackError) {
      rollbackErrors.push(
        'Не вдалося відкотити склад: ' +
        rollbackError.message
      );
    }

    /*
     * 7. Відновлення "Облік вакцин".
     */
    try {
      if (
        registrySheet &&
        registrySnapshot.length
      ) {
        restoreVaccineRegistrySnapshot_(
          registrySheet,
          registrySnapshot
        );
      }
    } catch (registryRollbackError) {
      rollbackErrors.push(
        'Не вдалося відновити "Облік вакцин": ' +
        registryRollbackError.message
      );
    }

    SpreadsheetApp.flush();

    throw new Error(
      'Вакцинну операцію не завершено. ' +
      'Складське вибуття відкочено. Причина: ' +
      error.message +
      (
        rollbackErrors.length
          ? ' Додаткові помилки: ' +
            rollbackErrors.join(' | ')
          : ''
      )
    );
  }
}


/****************************************************
 * ПРИВ’ЯЗКА FEFO-АЛОКАЦІЙ
 * ДО РЯДКІВ "ОБЛІК ВАКЦИН"
 ****************************************************/
function linkInventoryIssueToVaccineRegistry_(
  sheet,
  data,
  issueResult
) {
  const operationId =
    String(
      data.id || ''
    ).trim();

  const registryRows =
    findVaccineRegistryRowsByOperation_(
      sheet,
      operationId
    );

  if (!registryRows.length) {
    throw new Error(
      'В "Облік вакцин" не знайдено записів з ID продажу "' +
      operationId +
      '"'
    );
  }

  const units =
    expandInventoryAllocationsToUnits_(
      issueResult.allocations || []
    );

  if (!units.length) {
    throw new Error(
      'FEFO-результат не містить складських алокацій'
    );
  }

  /*
   * На одну продану одиницю вакцини
   * має бути один рядок в "Облік вакцин".
   */
  if (
    registryRows.length !==
    units.length
  ) {
    throw new Error(
      'Кількість рядків у "Облік вакцин" не відповідає списаній кількості. ' +
      'Рядків: ' +
      registryRows.length +
      ', одиниць зі складу: ' +
      units.length
    );
  }

  const movementType =
    String(
      issueResult.movementType || ''
    ).trim();

  const expectedStatus =
    movementType ===
    'Передано на зберігання'
      ? 'На зберіганні'
      : 'Використано';

  const actualDate =
    normalizeVaccineInventoryDate_(
      data.date
    );

  const updatedRows = [];

  registryRows.forEach(
    function(registryRow, index) {
      const unit =
        units[index];

      const rowNumber =
        registryRow.row;

      const currentValues =
        registryRow.values;

      const currentVaccineName =
        normalizeVaccineInventoryText_(
          currentValues[
            VACCINE_INVENTORY_LINK_CONFIG
              .columns
              .vaccineName -
            1
          ]
        );

      const expectedVaccineName =
        normalizeVaccineInventoryText_(
          issueResult.vaccineName
        );

      if (
        currentVaccineName &&
        expectedVaccineName &&
        currentVaccineName !==
          expectedVaccineName
      ) {
        throw new Error(
          'Назва вакцини в "Облік вакцин" не відповідає складській партії. ' +
          'Рядок: ' +
          rowNumber
        );
      }

      verifyExistingVaccineInventoryLink_(
        currentValues,
        unit,
        rowNumber
      );

      /*
       * E — фактична собівартість партії.
       */
      sheet
        .getRange(
          rowNumber,
          VACCINE_INVENTORY_LINK_CONFIG
            .columns
            .cost
        )
        .setValue(
          unit.unitCost
        )
        .setNumberFormat(
          '#,##0.00'
        );

      /*
       * F — статус.
       */
      sheet
        .getRange(
          rowNumber,
          VACCINE_INVENTORY_LINK_CONFIG
            .columns
            .status
        )
        .setValue(
          expectedStatus
        );

      /*
       * Для продажу і використання
       * фіксуємо фактичну дату.
       *
       * Для передачі на зберігання
       * дата фактичного використання
       * залишається порожньою.
       */
      if (
        expectedStatus ===
          'Використано' &&
        actualDate
      ) {
        sheet
          .getRange(
            rowNumber,
            VACCINE_INVENTORY_LINK_CONFIG
              .columns
              .actualDate
          )
          .setValue(
            actualDate
          )
          .setNumberFormat(
            'dd.MM.yyyy'
          );
      }

      /*
       * J:M
       *
       * J — ID партії
       * K — Серія
       * L — Термін придатності
       * M — ID складського руху
       */
      sheet
        .getRange(
          rowNumber,
          VACCINE_INVENTORY_LINK_CONFIG
            .columns
            .lotId,
          1,
          4
        )
        .setValues([
          [
            unit.lotId,
            unit.series,
            unit.expiryDate || '',
            unit.movementId
          ]
        ]);

      if (unit.expiryDate) {
        sheet
          .getRange(
            rowNumber,
            VACCINE_INVENTORY_LINK_CONFIG
              .columns
              .expiryDate
          )
          .setNumberFormat(
            'dd.MM.yyyy'
          );
      }

      updatedRows.push({
        row:
          rowNumber,

        operationId:
          operationId,

        lotId:
          unit.lotId,

        series:
          unit.series,

        expiryDate:
          unit.expiryDate,

        movementId:
          unit.movementId,

        unitCost:
          unit.unitCost,

        status:
          expectedStatus
      });
    }
  );

  return {
    ok:
      true,

    operationId:
      operationId,

    movementType:
      movementType,

    rowsUpdated:
      updatedRows.length,

    rows:
      updatedRows
  };
}


/****************************************************
 * РОЗГОРТАЄ АЛОКАЦІЇ ДО ОКРЕМИХ ОДИНИЦЬ
 *
 * Наприклад:
 * партія A — 1 одиниця
 * партія B — 2 одиниці
 *
 * Результат: 3 записи для 3 рядків
 * "Облік вакцин".
 ****************************************************/
function expandInventoryAllocationsToUnits_(
  allocations
) {
  const result = [];

  (allocations || []).forEach(
    function(allocation) {
      const quantity =
        inventoryIssueNumber_(
          allocation.quantity
        );

      const roundedQuantity =
        Math.round(
          quantity
        );

      if (
        roundedQuantity <= 0 ||
        Math.abs(
          quantity -
          roundedQuantity
        ) >
          INVENTORY_ISSUE_CONFIG
            .tolerance
      ) {
        throw new Error(
          'Некоректна кількість у FEFO-алокації для партії "' +
          allocation.lotId +
          '": ' +
          quantity
        );
      }

      for (
        let i = 0;
        i < roundedQuantity;
        i++
      ) {
        result.push({
          lotId:
            String(
              allocation.lotId || ''
            ).trim(),

          series:
            String(
              allocation.series || ''
            ).trim(),

          expiryDate:
            allocation.expiryDate || '',

          movementId:
            String(
              allocation.movementId || ''
            ).trim(),

          movementRow:
            Number(
              allocation.movementRow
            ) || 0,

          unitCost:
            inventoryIssueNumber_(
              allocation.unitCost
            )
        });
      }
    }
  );

  result.forEach(
    function(unit) {
      if (!unit.lotId) {
        throw new Error(
          'У FEFO-результаті відсутній ID партії'
        );
      }

      if (!unit.movementId) {
        throw new Error(
          'У FEFO-результаті відсутній ID складського руху'
        );
      }
    }
  );

  return result;
}


/****************************************************
 * ПОШУК РЯДКІВ ЗА ID ПРОДАЖУ
 ****************************************************/
function findVaccineRegistryRowsByOperation_(
  sheet,
  operationId
) {
  const startRow =
    VACCINE_INVENTORY_LINK_CONFIG
      .startRow;

  const lastRow =
    sheet.getLastRow();

  if (lastRow < startRow) {
    return [];
  }

  const values =
    sheet
      .getRange(
        startRow,
        1,
        lastRow - startRow + 1,
        VACCINE_INVENTORY_LINK_CONFIG
          .width
      )
      .getValues();

  const expectedId =
    String(
      operationId || ''
    ).trim();

  const result = [];

  values.forEach(
    function(row, index) {
      const saleId =
        String(
          row[
            VACCINE_INVENTORY_LINK_CONFIG
              .columns
              .saleId -
            1
          ] || ''
        ).trim();

      if (
        saleId ===
        expectedId
      ) {
        result.push({
          row:
            startRow + index,

          values:
            row.slice()
        });
      }
    }
  );

  return result;
}


/****************************************************
 * ЗНІМОК РЯДКІВ ДО ІНТЕГРАЦІЇ
 ****************************************************/
function snapshotVaccineRegistryRowsByOperation_(
  sheet,
  operationId
) {
  return findVaccineRegistryRowsByOperation_(
    sheet,
    operationId
  ).map(
    function(item) {
      return {
        row:
          item.row,

        values:
          item.values.slice()
      };
    }
  );
}


/****************************************************
 * ВІДНОВЛЕННЯ РЯДКІВ ПРИ ПОМИЛЦІ
 ****************************************************/
function restoreVaccineRegistrySnapshot_(
  sheet,
  snapshot
) {
  (snapshot || []).forEach(
    function(item) {
      sheet
        .getRange(
          item.row,
          1,
          1,
          VACCINE_INVENTORY_LINK_CONFIG
            .width
        )
        .setValues([
          item.values
        ]);
    }
  );
}


/****************************************************
 * ЗАХИСТ ВІД ПЕРЕПРИВ’ЯЗКИ
 ****************************************************/
function verifyExistingVaccineInventoryLink_(
  rowValues,
  unit,
  rowNumber
) {
  const currentLotId =
    String(
      rowValues[
        VACCINE_INVENTORY_LINK_CONFIG
          .columns
          .lotId -
        1
      ] || ''
    ).trim();

  const currentSeries =
    String(
      rowValues[
        VACCINE_INVENTORY_LINK_CONFIG
          .columns
          .series -
        1
      ] || ''
    ).trim();

  const currentMovementId =
    String(
      rowValues[
        VACCINE_INVENTORY_LINK_CONFIG
          .columns
          .movementId -
        1
      ] || ''
    ).trim();

  if (
    currentLotId &&
    currentLotId !==
      unit.lotId
  ) {
    throw new Error(
      'Рядок ' +
      rowNumber +
      ' вже прив’язаний до іншої партії: "' +
      currentLotId +
      '"'
    );
  }

  if (
    currentSeries &&
    unit.series &&
    currentSeries !==
      unit.series
  ) {
    throw new Error(
      'Рядок ' +
      rowNumber +
      ' вже містить іншу серію: "' +
      currentSeries +
      '"'
    );
  }

  if (
    currentMovementId &&
    currentMovementId !==
      unit.movementId
  ) {
    throw new Error(
      'Рядок ' +
      rowNumber +
      ' вже прив’язаний до іншого складського руху: "' +
      currentMovementId +
      '"'
    );
  }
}


/****************************************************
 * ПОПАП ДЛЯ АДМІНІСТРАТОРА
 ****************************************************/
function showInventoryIssueConfirmation_(
  issueResult
) {
  if (
    !issueResult ||
    !issueResult.requiresIssue ||
    !issueResult.allocations ||
    !issueResult.allocations.length
  ) {
    return;
  }

  const title =
    issueResult.movementType ===
    'Передано на зберігання'
      ? 'Передати вакцину на зберігання'
      : 'Видати зі складу вакцину';

  const blocks = [];

  issueResult.allocations.forEach(
    function(allocation) {
      const lines = [
        'Обрано: ' +
          issueResult.vaccineName,

        'Серія: ' +
          (
            allocation.series ||
            'не вказано'
          ),

        'Термін придатності: ' +
          formatVaccineInventoryDate_(
            allocation.expiryDate
          ),

        'Собівартість: ' +
          formatVaccineInventoryMoney_(
            allocation.unitCost
          ) +
          ' грн'
      ];

      const quantity =
        inventoryIssueNumber_(
          allocation.quantity
        );

      if (quantity > 1) {
        lines.push(
          'Кількість: ' +
          quantity
        );
      }

      blocks.push(
        lines.join('\n')
      );
    }
  );

  const message =
    blocks.join(
      '\n\n'
    );

  try {
    const ui =
      SpreadsheetApp.getUi();

    ui.alert(
      title,
      message,
      ui.ButtonSet.OK
    );

  } catch (error) {
    /*
     * Якщо функція виконувалась не з UI-контексту,
     * показуємо toast замість помилки.
     */
    SpreadsheetApp
      .getActive()
      .toast(
        message,
        title,
        10
      );
  }
}


/****************************************************
 * HELPERS
 ****************************************************/
function normalizeVaccineInventoryText_(
  value
) {
  return String(
    value || ''
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ' '
    );
}


function normalizeVaccineInventoryDate_(
  value
) {
  if (
    value instanceof Date &&
    !isNaN(
      value.getTime()
    )
  ) {
    return value;
  }

  if (!value) {
    return null;
  }

  const text =
    String(
      value
    ).trim();

  const match =
    text.match(
      /^(\d{2})\.(\d{2})\.(\d{4})$/
    );

  if (!match) {
    return null;
  }

  return new Date(
    Number(
      match[3]
    ),
    Number(
      match[2]
    ) - 1,
    Number(
      match[1]
    )
  );
}


function formatVaccineInventoryDate_(
  value
) {
  const date =
    normalizeVaccineInventoryDate_(
      value
    );

  if (!date) {
    return 'не вказано';
  }

  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'dd.MM.yyyy'
  );
}


function formatVaccineInventoryMoney_(
  value
) {
  const number =
    inventoryIssueNumber_(
      value
    );

  const fixed =
    number
      .toFixed(2)
      .replace(
        '.',
        ','
      );

  return fixed.replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ' '
  );
}