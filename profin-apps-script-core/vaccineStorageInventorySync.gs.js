/****************************************************
 * VACCINE STORAGE → INVENTORY SYNC
 * ПАТЧ 1 — DRY RUN
 * --------------------------------------------------
 * Перевіряє можливість синхронізації:
 *
 * На зберіганні → Використано / Списано
 *
 * Нічого не записує.
 ****************************************************/

const VACCINE_STORAGE_SYNC_CONFIG = Object.freeze({
  registrySheetName: 'Облік вакцин',
  movementSheetName: 'Рух складу',

  sourceMovementTypes: Object.freeze([
    'Передача на зберігання',
    'Передано на зберігання'
  ]),

  resultingMovementTypes: Object.freeze([
    'Використання зі зберігання',
    'Списання'
  ]),

  quantityPerVaccine: 1,
  tolerance: 0.000001
});


/****************************************************
 * РУЧНИЙ DRY RUN ІЗ ФОРМИ
 ****************************************************/

function previewStoredVaccineInventorySyncFromInput() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(INPUT_SHEET_NAME);

  const registrySheet =
    ss.getSheetByName(
      VACCINE_STORAGE_SYNC_CONFIG.registrySheetName
    );

  if (!inputSheet) {
    throw new Error('Не знайдено лист "Ввід операцій"');
  }

  if (!registrySheet) {
    throw new Error('Не знайдено лист "Облік вакцин"');
  }

  const selected =
    vaccineStorageSyncClean_(
      inputSheet
        .getRange(INPUT.storedVaccine)
        .getDisplayValue()
    );

  const vaccineId =
    vaccineStorageSyncClean_(
      inputSheet
        .getRange(INPUT.storedVaccine)
        .getNote()
    ) ||
    vaccineStorageSyncClean_(
      selected.split('|')[0]
    );

  const newStatus =
    vaccineStorageSyncClean_(
      inputSheet
        .getRange(INPUT.newStatus)
        .getDisplayValue()
    ) ||
    vaccineStorageSyncClean_(
      inputSheet
        .getRange(INPUT.article)
        .getDisplayValue()
    );

  if (!vaccineId) {
    throw new Error(
      'Не визначено ID вакцини для сухого тесту'
    );
  }

  if (!['Використано', 'Списано'].includes(newStatus)) {
    throw new Error(
      'Оберіть статус "Використано" або "Списано"'
    );
  }

  const vaccine =
    getStoredVaccineRegistryRecord_(
      registrySheet,
      vaccineId
    );

  const plan =
    buildStoredVaccineInventorySyncPlan_({
      vaccineId: vaccine.vaccineId,
      saleId: vaccine.saleId,
      vaccineName: vaccine.vaccineName,
      currentStatus: vaccine.status,
      newStatus: newStatus
    });

  Logger.log(
    JSON.stringify(
      plan,
      null,
      2
    )
  );

  SpreadsheetApp.getActive().toast(
    plan.ok
      ? 'Dry run пройдено. Склад не змінено.'
      : 'Синхронізація неможлива. Перевірте журнал.',
    'Вакцини / Склад',
    8
  );

  return plan;
}


/****************************************************
 * ЧИТАННЯ ОДНІЄЇ ВАКЦИНИ З РЕЄСТРУ
 ****************************************************/

function getStoredVaccineRegistryRecord_(
  sheet,
  vaccineId
) {
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'У листі "Облік вакцин" немає записів'
    );
  }

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        9
      )
      .getValues();

  const index =
    values.findIndex(
      function(row) {
        return (
          vaccineStorageSyncClean_(row[0]) ===
          vaccineStorageSyncClean_(vaccineId)
        );
      }
    );

  if (index === -1) {
    throw new Error(
      'Вакцину не знайдено: ' + vaccineId
    );
  }

  const row = values[index];

  return {
    sheetRow: index + 2,
    vaccineId: vaccineStorageSyncClean_(row[0]),
    saleId: vaccineStorageSyncClean_(row[1]),
    patient: vaccineStorageSyncClean_(row[2]),
    vaccineName: vaccineStorageSyncClean_(row[3]),
    storedCost: vaccineStorageSyncNumber_(row[4]),
    status: vaccineStorageSyncClean_(row[5]),
    plannedDate: row[6],
    actualDate: row[7],
    comment: vaccineStorageSyncClean_(row[8])
  };
}


/****************************************************
 * ПОБУДОВА ПЛАНУ ПЕРЕКЛАСИФІКАЦІЇ
 ****************************************************/

function buildStoredVaccineInventorySyncPlan_(
  vaccine
) {
  if (!vaccine) {
    throw new Error(
      'Не передано дані вакцини'
    );
  }

  if (!vaccine.saleId) {
    throw new Error(
      'У вакцини немає ID первинного продажу'
    );
  }

  if (!vaccine.vaccineId) {
    throw new Error(
      'Не визначено ID одиниці вакцини'
    );
  }

  if (!vaccine.vaccineName) {
    throw new Error(
      'Не визначено назву вакцини'
    );
  }

  if (vaccine.currentStatus !== 'На зберіганні') {
    throw new Error(
      'Вакцина вже не має статусу "На зберіганні". ' +
      'Поточний статус: ' +
      vaccine.currentStatus
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const movementSheet =
    ss.getSheetByName(
      VACCINE_STORAGE_SYNC_CONFIG.movementSheetName
    );

  if (!movementSheet) {
    throw new Error(
      'Не знайдено лист "Рух складу"'
    );
  }

  const lastRow =
    movementSheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'У листі "Рух складу" немає рухів'
    );
  }

  const movements =
    movementSheet
      .getRange(
        2,
        1,
        lastRow - 1,
        12
      )
      .getValues();

  const expectedSaleId =
    vaccineStorageSyncClean_(
      vaccine.saleId
    );

  const expectedVaccine =
    vaccineStorageSyncNormalize_(
      vaccine.vaccineName
    );

  const sourceTypes =
    VACCINE_STORAGE_SYNC_CONFIG
      .sourceMovementTypes
      .map(vaccineStorageSyncNormalize_);

  /*
   * Первинні рухи "Продаж на зберігання".
   */
  const sourceMovements = [];

  movements.forEach(
    function(row, index) {
      const operationId =
        vaccineStorageSyncClean_(row[1]); // B

      const vaccineName =
        vaccineStorageSyncNormalize_(row[4]); // E

      const movementType =
        vaccineStorageSyncNormalize_(row[6]); // G

      if (operationId !== expectedSaleId) return;
      if (vaccineName !== expectedVaccine) return;
      if (!sourceTypes.includes(movementType)) return;

      sourceMovements.push({
        movementRow: index + 2,
        movementId:
          vaccineStorageSyncClean_(row[0]),
        operationId: operationId,
        date: row[2],
        inventoryType:
          vaccineStorageSyncClean_(row[3]),
        vaccineName:
          vaccineStorageSyncClean_(row[4]),
        lotId:
          vaccineStorageSyncClean_(row[5]),
        movementType:
          vaccineStorageSyncClean_(row[6]),
        quantity:
          vaccineStorageSyncNumber_(row[7]),
        unitCost:
          vaccineStorageSyncNumber_(row[8]),
        totalCost:
          vaccineStorageSyncNumber_(row[9])
      });
    }
  );

  if (!sourceMovements.length) {
    return {
      ok: false,
      canWrite: false,
      vaccineId: vaccine.vaccineId,
      saleId: vaccine.saleId,
      vaccineName: vaccine.vaccineName,
      reason:
        'Не знайдено первинного складського руху ' +
        '"Передача на зберігання". ' +
        'Ймовірно, продаж був проведений у ручному або історичному режимі.',
      noCellsWritten: true
    };
  }

  /*
   * Майбутній стабільний ID складської синхронізації.
   */
  const syncOperationId =
    buildStoredVaccineSyncOperationId_(
      vaccine.saleId,
      vaccine.vaccineId
    );

  const duplicateExists =
    movements.some(
      function(row) {
        return (
          vaccineStorageSyncClean_(row[1]) ===
          syncOperationId
        );
      }
    );

  if (duplicateExists) {
    return {
      ok: true,
      canWrite: false,
      alreadySynced: true,
      syncOperationId: syncOperationId,
      vaccineId: vaccine.vaccineId,
      saleId: vaccine.saleId,
      vaccineName: vaccine.vaccineName,
      reason:
        'Для цієї одиниці вакцини вже існує складська синхронізація.',
      noCellsWritten: true
    };
  }

  /*
   * Рахуємо, скільки одиниць первинного продажу
   * вже було використано або списано.
   */
  const saleSyncPrefix =
    buildStoredVaccineSyncPrefix_(
      vaccine.saleId
    );

  const resultingTypes =
    VACCINE_STORAGE_SYNC_CONFIG
      .resultingMovementTypes
      .map(vaccineStorageSyncNormalize_);

  const alreadyReclassifiedByLot = {};

  movements.forEach(
    function(row) {
      const operationId =
        vaccineStorageSyncClean_(row[1]);

      const movementType =
        vaccineStorageSyncNormalize_(row[6]);

      if (!operationId.startsWith(saleSyncPrefix)) return;
      if (!resultingTypes.includes(movementType)) return;

      const lotId =
        vaccineStorageSyncClean_(row[5]);

      const quantity =
        vaccineStorageSyncNumber_(row[7]);

      alreadyReclassifiedByLot[lotId] =
        (
          alreadyReclassifiedByLot[lotId] || 0
        ) + quantity;
    }
  );

  let quantityToAllocate =
    VACCINE_STORAGE_SYNC_CONFIG
      .quantityPerVaccine;

  const allocations = [];

  sourceMovements.forEach(
    function(source) {
      if (
        quantityToAllocate <=
        VACCINE_STORAGE_SYNC_CONFIG.tolerance
      ) {
        return;
      }

      const alreadyReclassified =
        alreadyReclassifiedByLot[
          source.lotId
        ] || 0;

      const remainingStored =
        Math.max(
          0,
          source.quantity -
          alreadyReclassified
        );

      if (
        remainingStored <=
        VACCINE_STORAGE_SYNC_CONFIG.tolerance
      ) {
        return;
      }

      const quantity =
        Math.min(
          remainingStored,
          quantityToAllocate
        );

      allocations.push({
        lotId: source.lotId,
        sourceMovementId:
          source.movementId,
        quantity: quantity,
        unitCost: source.unitCost,
        totalCost:
          vaccineStorageSyncRoundMoney_(
            quantity * source.unitCost
          ),
        storedBefore:
          remainingStored,
        storedAfter:
          remainingStored - quantity
      });

      quantityToAllocate -= quantity;
    }
  );

  if (
    quantityToAllocate >
    VACCINE_STORAGE_SYNC_CONFIG.tolerance
  ) {
    return {
      ok: false,
      canWrite: false,
      vaccineId: vaccine.vaccineId,
      saleId: vaccine.saleId,
      vaccineName: vaccine.vaccineName,
      sourceMovements: sourceMovements,
      reason:
        'У первинних складських рухах недостатньо ' +
        'нереалізованої кількості на зберіганні.',
      noCellsWritten: true
    };
  }

  const totalCost =
    vaccineStorageSyncRoundMoney_(
      allocations.reduce(
        function(sum, item) {
          return sum + item.totalCost;
        },
        0
      )
    );

  return {
    ok: true,
    canWrite: true,
    alreadySynced: false,

    syncOperationId: syncOperationId,

    vaccineId: vaccine.vaccineId,
    saleId: vaccine.saleId,
    vaccineName: vaccine.vaccineName,

    fromStatus: vaccine.currentStatus,
    toStatus: vaccine.newStatus,

    movementType:
      vaccine.newStatus === 'Використано'
        ? 'Використання зі зберігання'
        : 'Списання',

    quantity:
      VACCINE_STORAGE_SYNC_CONFIG
        .quantityPerVaccine,

    totalCost: totalCost,
    allocations: allocations,

    currentBalanceMustChange: false,
    noCellsWritten: true
  };
}


/****************************************************
 * СТАБІЛЬНІ ID
 ****************************************************/

function buildStoredVaccineSyncPrefix_(
  saleId
) {
  return (
    'VST|' +
    vaccineStorageSyncClean_(saleId) +
    '|'
  );
}


function buildStoredVaccineSyncOperationId_(
  saleId,
  vaccineId
) {
  return (
    buildStoredVaccineSyncPrefix_(saleId) +
    vaccineStorageSyncClean_(vaccineId)
  );
}


/****************************************************
 * HELPERS
 ****************************************************/

function vaccineStorageSyncClean_(
  value
) {
  return String(
    value == null ? '' : value
  )
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}


function vaccineStorageSyncNormalize_(
  value
) {
  return vaccineStorageSyncClean_(
    value
  ).toLowerCase();
}


function vaccineStorageSyncNumber_(
  value
) {
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const text =
    vaccineStorageSyncClean_(value)
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : 0;
}


function vaccineStorageSyncRoundMoney_(
  value
) {
  return Math.round(
    (
      vaccineStorageSyncNumber_(value) +
      Number.EPSILON
    ) * 100
  ) / 100;
}
/****************************************************
 * РЕАЛЬНА СИНХРОНІЗАЦІЯ:
 *
 * На зберіганні → Використано / Списано
 *
 * Виконує:
 * 1. перекласифікацію складських лічильників;
 * 2. створення інформаційного руху;
 * 3. не змінює поточний залишок повторно;
 * 4. виконує відкат при помилці.
 ****************************************************/
function executeStoredVaccineInventorySync_(
  vaccine,
  actualDate
) {
  const plan =
    buildStoredVaccineInventorySyncPlan_(
      vaccine
    );

  if (
    !plan ||
    plan.ok !== true
  ) {
    throw new Error(
      plan && plan.reason
        ? plan.reason
        : 'Не вдалося сформувати складський план зміни статусу'
    );
  }

  /*
   * Захист від повторного проведення.
   */
  if (
    plan.alreadySynced === true
  ) {
    return {
      ok: true,
      alreadySynced: true,
      syncOperationId:
        plan.syncOperationId,
      plan:
        plan,
      stockSnapshot: [],
      movementRows: []
    };
  }

  if (
    plan.canWrite !== true
  ) {
    throw new Error(
      plan.reason ||
      'Складська синхронізація недоступна'
    );
  }

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const stockSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .STOCK_SHEET_NAME
    );

  const movementSheet =
    ss.getSheetByName(
      VACCINE_STORAGE_SYNC_CONFIG
        .movementSheetName
    );

  if (!stockSheet) {
    throw new Error(
      'Не знайдено лист "' +
      INVENTORY_CONFIG
        .STOCK_SHEET_NAME +
      '"'
    );
  }

  if (!movementSheet) {
    throw new Error(
      'Не знайдено лист "' +
      VACCINE_STORAGE_SYNC_CONFIG
        .movementSheetName +
      '"'
    );
  }

  const normalizedDate =
    actualDate instanceof Date &&
    !isNaN(
      actualDate.getTime()
    )
      ? actualDate
      : new Date();

  /*
   * Групуємо кількість за партіями.
   */
  const quantityByLot = {};

  plan.allocations.forEach(
    function(allocation) {
      const lotId =
        vaccineStorageSyncClean_(
          allocation.lotId
        );

      quantityByLot[lotId] =
        (
          quantityByLot[lotId] || 0
        ) +
        vaccineStorageSyncNumber_(
          allocation.quantity
        );
    }
  );

  const stockSnapshot = [];
  const lotRows = {};

  Object.keys(
    quantityByLot
  ).forEach(
    function(lotId) {
      const row =
        findStoredVaccineStockRowByLotId_(
          stockSheet,
          lotId
        );

      if (!row) {
        throw new Error(
          'Не знайдено складську партію "' +
          lotId +
          '"'
        );
      }

      lotRows[lotId] =
        row;

      /*
       * Зберігаємо L:Q:
       * L Продано / використано
       * M Передано на зберігання
       * N Списано
       * O Поточний залишок
       * P Мінімальний залишок
       * Q Статус
       */
      stockSnapshot.push({
        row:
          row,

        values:
          stockSheet
            .getRange(
              row,
              12,
              1,
              6
            )
            .getValues()[0]
      });
    }
  );

  const movementRows = [];

  try {
    /****************************************************
     * 1. ПЕРЕКЛАСИФІКАЦІЯ ЛІЧИЛЬНИКІВ
     ****************************************************/

    Object.keys(
      quantityByLot
    ).forEach(
      function(lotId) {
        const row =
          lotRows[lotId];

        const quantity =
          vaccineStorageSyncNumber_(
            quantityByLot[lotId]
          );

        const values =
          stockSheet
            .getRange(
              row,
              12,
              1,
              6
            )
            .getValues()[0];

        let soldOrUsed =
          vaccineStorageSyncNumber_(
            values[0]
          );

        let stored =
          vaccineStorageSyncNumber_(
            values[1]
          );

        let writtenOff =
          vaccineStorageSyncNumber_(
            values[2]
          );

        const currentBalance =
          vaccineStorageSyncNumber_(
            values[3]
          );

        const minimumStock =
          vaccineStorageSyncNumber_(
            values[4]
          );

        if (
          stored +
          VACCINE_STORAGE_SYNC_CONFIG
            .tolerance <
          quantity
        ) {
          throw new Error(
            'У партії "' +
            lotId +
            '" недостатньо вакцин зі статусом "Передано на зберігання". ' +
            'Потрібно: ' +
            quantity +
            ', доступно: ' +
            stored
          );
        }

        /*
         * Забираємо одиницю з категорії
         * "Передано на зберігання".
         */
        stored =
          stored -
          quantity;

        if (
          plan.toStatus ===
          'Використано'
        ) {
          soldOrUsed =
            soldOrUsed +
            quantity;
        }

        if (
          plan.toStatus ===
          'Списано'
        ) {
          writtenOff =
            writtenOff +
            quantity;
        }

        stockSheet
          .getRange(
            row,
            12,
            1,
            3
          )
          .setValues([
            [
              soldOrUsed,
              stored,
              writtenOff
            ]
          ]);

        /*
         * O — поточний залишок —
         * не змінюємо повторно.
         */
        stockSheet
          .getRange(
            row,
            17
          )
          .setValue(
            resolveInventoryLotStatus_(
              currentBalance,
              minimumStock
            )
          );
      }
    );

    /****************************************************
     * 2. ІНФОРМАЦІЙНІ РУХИ СКЛАДУ
     ****************************************************/

    plan.allocations.forEach(
      function(allocation, index) {
        const targetRow =
          findNextInventoryDataRow_(
            movementSheet
          );

        const movementId =
          plan.syncOperationId +
          '-MOV-' +
          (index + 1);

        const userEmail =
          typeof getSafeUserEmail_ ===
            'function'
            ? getSafeUserEmail_()
            : '';

        const quantity =
          vaccineStorageSyncNumber_(
            allocation.quantity
          );

        const unitCost =
          vaccineStorageSyncNumber_(
            allocation.unitCost
          );

        const totalCost =
          vaccineStorageSyncRoundMoney_(
            allocation.totalCost
          );

        const rowData = [
          movementId,              // A ID руху
          plan.syncOperationId,    // B ID операції синхронізації
          normalizedDate,          // C Дата
          'Вакцина',               // D Тип запасу
          plan.vaccineName,        // E Найменування
          allocation.lotId,        // F ID партії
          plan.movementType,       // G Тип руху
          quantity,                // H Кількість
          unitCost,                // I Собівартість одиниці
          totalCost,               // J Загальна собівартість
          userEmail,               // K Користувач
          new Date()               // L Дата і час створення
        ];

        movementSheet
          .getRange(
            targetRow,
            1,
            1,
            rowData.length
          )
          .setValues([
            rowData
          ]);

        movementSheet
          .getRange(
            targetRow,
            3
          )
          .setNumberFormat(
            'dd.MM.yyyy'
          );

        movementSheet
          .getRange(
            targetRow,
            8
          )
          .setNumberFormat(
            '#,##0'
          );

        movementSheet
          .getRange(
            targetRow,
            9,
            1,
            2
          )
          .setNumberFormat(
            '#,##0.00'
          );

        movementSheet
          .getRange(
            targetRow,
            12
          )
          .setNumberFormat(
            'dd.MM.yyyy HH:mm:ss'
          );

        movementRows.push(
          targetRow
        );
      }
    );

    SpreadsheetApp.flush();

    return {
      ok: true,

      alreadySynced: false,

      syncOperationId:
        plan.syncOperationId,

      movementType:
        plan.movementType,

      movementRows:
        movementRows,

      stockSnapshot:
        stockSnapshot,

      plan:
        plan
    };

  } catch (error) {
    /*
     * Видаляємо створені рухи.
     */
    movementRows
      .slice()
      .reverse()
      .forEach(
        function(row) {
          try {
            clearInventoryMovementRow_(
              row
            );
          } catch (cleanupError) {
            Logger.log(
              'Не очищено рух зміни статусу, рядок ' +
              row +
              ': ' +
              cleanupError.message
            );
          }
        }
      );

    /*
     * Відновлюємо L:Q.
     */
    restoreInventoryIssueRows_(
      stockSheet,
      stockSnapshot
    );

    SpreadsheetApp.flush();

    throw new Error(
      'Складську зміну статусу не проведено. ' +
      'Попередній стан відновлено. Причина: ' +
      (
        error &&
        error.message
          ? error.message
          : String(error)
      )
    );
  }
}


/****************************************************
 * ПОШУК РЯДКА ПАРТІЇ ЗА ID
 ****************************************************/
function findStoredVaccineStockRowByLotId_(
  sheet,
  lotId
) {
  if (!sheet) {
    return 0;
  }

  const expected =
    vaccineStorageSyncClean_(
      lotId
    );

  if (!expected) {
    return 0;
  }

  const lastRow =
    sheet.getLastRow();

  if (lastRow < 2) {
    return 0;
  }

  const values =
    sheet
      .getRange(
        2,
        1,
        lastRow - 1,
        1
      )
      .getDisplayValues()
      .flat();

  const index =
    values.findIndex(
      function(value) {
        return (
          vaccineStorageSyncClean_(
            value
          ) ===
          expected
        );
      }
    );

  return index === -1
    ? 0
    : index + 2;
}


/****************************************************
 * ВІДКАТ СКЛАДСЬКОЇ ЗМІНИ СТАТУСУ
 ****************************************************/
function rollbackStoredVaccineInventorySync_(
  result
) {
  if (
    !result ||
    result.alreadySynced === true
  ) {
    return;
  }

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const stockSheet =
    ss.getSheetByName(
      INVENTORY_CONFIG
        .STOCK_SHEET_NAME
    );

  const movementSheet =
    ss.getSheetByName(
      VACCINE_STORAGE_SYNC_CONFIG
        .movementSheetName
    );

  if (
    movementSheet &&
    result.syncOperationId
  ) {
    clearInventoryRowsByValue_(
      movementSheet,
      2,
      result.syncOperationId,
      INVENTORY_CONFIG
        .MOVEMENT_HEADERS
        .length
    );
  }

  if (
    stockSheet &&
    Array.isArray(
      result.stockSnapshot
    ) &&
    result.stockSnapshot.length
  ) {
    restoreInventoryIssueRows_(
      stockSheet,
      result.stockSnapshot
    );
  }

  SpreadsheetApp.flush();
}