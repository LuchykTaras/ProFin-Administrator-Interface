/****************************************************
 * PROFIN OS — LINKED ENGINE, КРОК 2
 *
 * Автономний dry-run.
 * Нічого не записує і не змінює.
 ****************************************************/

function previewLinkedStoredVaccineEngineStep2() {
  const CONFIG = {
    version: '2.0-dry-run',

    inputSheetName:
      'Ввід операцій',

    registrySheetName:
      'Облік вакцин',

    stockSheetName:
      'Склад медичних запасів',

    movementSheetName:
      'Рух складу',

    storedVaccineCell:
      'D13',

    newStatusCell:
      'F13',

    allowedStatuses: [
      'Використано',
      'Списано'
    ],

    sourceMovementTypes: [
      'Передача на зберігання',
      'Передано на зберігання'
    ],

    resultMovementTypes: [
      'Використання зі зберігання',
      'Списання'
    ],

    tolerance:
      0.000001
  };

  /*
   * Локальні допоміжні функції.
   */
  function clean(value) {
    return String(
      value == null
        ? ''
        : value
    )
      .replace(/\u00A0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalize(value) {
    return clean(
      value
    ).toLowerCase();
  }

  function toNumber(value) {
    if (
      typeof value ===
      'number'
    ) {
      return Number.isFinite(
        value
      )
        ? value
        : 0;
    }

    const normalized =
      clean(value)
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');

    const number =
      Number(
        normalized
      );

    return Number.isFinite(
      number
    )
      ? number
      : 0;
  }

  function roundMoney(value) {
    return Math.round(
      (
        toNumber(value) +
        Number.EPSILON
      ) * 100
    ) / 100;
  }

  function extractVaccineId(
    selectedValue,
    note
  ) {
    const rawNote =
      String(
        note || ''
      ).trim();

    /*
     * Старий формат примітки:
     * ID вакцини: VAC-...
     */
    const labeledMatch =
      rawNote.match(
        /ID вакцини:\s*([^\r\n]+)/i
      );

    if (
      labeledMatch &&
      labeledMatch[1]
    ) {
      return clean(
        labeledMatch[1]
      );
    }

    /*
     * Новий формат примітки:
     * тільки ID.
     */
    const normalizedNote =
      clean(
        rawNote
      );

    if (
      normalizedNote &&
      normalizedNote.indexOf('|') ===
        -1
    ) {
      return normalizedNote;
    }

    /*
     * Резервно беремо ID зі значення D13.
     */
    return clean(
      String(
        selectedValue || ''
      ).split('|')[0]
    );
  }

  const ss =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const inputSheet =
    ss.getSheetByName(
      CONFIG.inputSheetName
    );

  const registrySheet =
    ss.getSheetByName(
      CONFIG.registrySheetName
    );

  const stockSheet =
    ss.getSheetByName(
      CONFIG.stockSheetName
    );

  const movementSheet =
    ss.getSheetByName(
      CONFIG.movementSheetName
    );

  const missingSheets = [];

  if (!inputSheet) {
    missingSheets.push(
      CONFIG.inputSheetName
    );
  }

  if (!registrySheet) {
    missingSheets.push(
      CONFIG.registrySheetName
    );
  }

  if (!stockSheet) {
    missingSheets.push(
      CONFIG.stockSheetName
    );
  }

  if (!movementSheet) {
    missingSheets.push(
      CONFIG.movementSheetName
    );
  }

  if (missingSheets.length) {
    throw new Error(
      'Не знайдено листи: ' +
      missingSheets.join(', ')
    );
  }

  /*
   * Читаємо вибір із форми.
   */
  const selectedCell =
    inputSheet.getRange(
      CONFIG.storedVaccineCell
    );

  const vaccineId =
    extractVaccineId(
      selectedCell.getDisplayValue(),
      selectedCell.getNote()
    );

  if (!vaccineId) {
    throw new Error(
      'У D13 не визначено ID вакцини.'
    );
  }

  const newStatus =
    clean(
      inputSheet
        .getRange(
          CONFIG.newStatusCell
        )
        .getDisplayValue()
    );

  if (
    !CONFIG.allowedStatuses.includes(
      newStatus
    )
  ) {
    throw new Error(
      'У F13 потрібно вибрати «Використано» або «Списано».'
    );
  }

  /*
   * Знаходимо вакцину в "Облік вакцин".
   * Читаємо A:M.
   */
  const registryLastRow =
    registrySheet.getLastRow();

  if (registryLastRow < 2) {
    throw new Error(
      'У листі "Облік вакцин" немає записів.'
    );
  }

  const registryValues =
    registrySheet
      .getRange(
        2,
        1,
        registryLastRow - 1,
        13
      )
      .getValues();

  const registryIndex =
    registryValues.findIndex(
      function(row) {
        return (
          clean(
            row[0]
          ) ===
          vaccineId
        );
      }
    );

  if (registryIndex === -1) {
    throw new Error(
      'Не знайдено вакцину: ' +
      vaccineId
    );
  }

  const registryRow =
    registryValues[
      registryIndex
    ];

  const vaccine = {
    registryRow:
      registryIndex + 2,

    vaccineId:
      clean(
        registryRow[0]
      ),

    saleId:
      clean(
        registryRow[1]
      ),

    vaccineName:
      clean(
        registryRow[3]
      ),

    storedCost:
      toNumber(
        registryRow[4]
      ),

    currentStatus:
      clean(
        registryRow[5]
      ),

    lotId:
      clean(
        registryRow[9]
      ),

    series:
      clean(
        registryRow[10]
      ),

    expiryDate:
      registryRow[11],

    sourceMovementId:
      clean(
        registryRow[12]
      ),

    newStatus:
      newStatus
  };

  if (
    vaccine.currentStatus !==
    'На зберіганні'
  ) {
    throw new Error(
      'Вакцина вже не перебуває на зберіганні. ' +
      'Поточний статус: ' +
      vaccine.currentStatus
    );
  }

  /*
   * LEGACY — немає ані партії, ані руху.
   */
  if (
    !vaccine.lotId &&
    !vaccine.sourceMovementId
  ) {
    const legacyResult = {
      ok:
        false,

      canWrite:
        false,

      test:
        'previewLinkedStoredVaccineEngineStep2',

      version:
        CONFIG.version,

      classification:
        'LEGACY_UNLINKED',

      reason:
        'Історичний запис не має ID партії та первинного складського руху.',

      vaccine:
        vaccine,

      businessValuesChanged:
        false,

      rowsAppended:
        0,

      cellsWritten:
        0
    };

    Logger.log(
      JSON.stringify(
        legacyResult,
        null,
        2
      )
    );

    return legacyResult;
  }

  /*
   * Частковий зв’язок.
   */
  if (
    !vaccine.lotId ||
    !vaccine.sourceMovementId
  ) {
    const brokenResult = {
      ok:
        false,

      canWrite:
        false,

      test:
        'previewLinkedStoredVaccineEngineStep2',

      version:
        CONFIG.version,

      classification:
        'BROKEN_LINK',

      reason:
        'Заповнено лише частину складського зв’язку J:M.',

      vaccine:
        vaccine,

      businessValuesChanged:
        false,

      rowsAppended:
        0,

      cellsWritten:
        0
    };

    Logger.log(
      JSON.stringify(
        brokenResult,
        null,
        2
      )
    );

    return brokenResult;
  }

  /*
   * Читаємо журнал рухів A:L.
   */
  const movementLastRow =
    movementSheet.getLastRow();

  if (movementLastRow < 2) {
    throw new Error(
      'У листі "Рух складу" немає записів.'
    );
  }

  const movementValues =
    movementSheet
      .getRange(
        2,
        1,
        movementLastRow - 1,
        12
      )
      .getValues();

  /*
   * Пошук лише за точним ID із колонки M.
   */
  const sourceIndex =
    movementValues.findIndex(
      function(row) {
        return (
          clean(
            row[0]
          ) ===
          vaccine.sourceMovementId
        );
      }
    );

  if (sourceIndex === -1) {
    const missingMovementResult = {
      ok:
        false,

      canWrite:
        false,

      test:
        'previewLinkedStoredVaccineEngineStep2',

      version:
        CONFIG.version,

      classification:
        'BROKEN_LINK',

      reason:
        'Не знайдено первинний рух ' +
        vaccine.sourceMovementId,

      vaccine:
        vaccine,

      businessValuesChanged:
        false,

      rowsAppended:
        0,

      cellsWritten:
        0
    };

    Logger.log(
      JSON.stringify(
        missingMovementResult,
        null,
        2
      )
    );

    return missingMovementResult;
  }

  const sourceRow =
    movementValues[
      sourceIndex
    ];

  const sourceMovement = {
    row:
      sourceIndex + 2,

    movementId:
      clean(
        sourceRow[0]
      ),

    operationId:
      clean(
        sourceRow[1]
      ),

    inventoryName:
      clean(
        sourceRow[4]
      ),

    lotId:
      clean(
        sourceRow[5]
      ),

    movementType:
      clean(
        sourceRow[6]
      ),

    quantity:
      toNumber(
        sourceRow[7]
      ),

    unitCost:
      toNumber(
        sourceRow[8]
      ),

    totalCost:
      toNumber(
        sourceRow[9]
      )
  };

  const normalizedSourceTypes =
    CONFIG.sourceMovementTypes.map(
      function(value) {
        return normalize(
          value
        );
      }
    );

  const checks = {
    sourceMovementIdMatches:
      sourceMovement.movementId ===
      vaccine.sourceMovementId,

    operationIdMatches:
      sourceMovement.operationId ===
      vaccine.saleId,

    lotIdMatches:
      sourceMovement.lotId ===
      vaccine.lotId,

    vaccineNameMatches:
      normalize(
        sourceMovement.inventoryName
      ) ===
      normalize(
        vaccine.vaccineName
      ),

    movementTypeCorrect:
      normalizedSourceTypes.includes(
        normalize(
          sourceMovement.movementType
        )
      ),

    sourceQuantityPositive:
      sourceMovement.quantity >
      CONFIG.tolerance,

    unitCostMatches:
      Math.abs(
        sourceMovement.unitCost -
        vaccine.storedCost
      ) <= 0.01
  };

  /*
   * Стабільний ID майбутньої синхронізації.
   */
  const syncOperationId =
    'VST|' +
    vaccine.saleId +
    '|' +
    vaccine.vaccineId;

  const duplicateMovementRows = [];

  movementValues.forEach(
    function(row, index) {
      if (
        clean(
          row[1]
        ) ===
        syncOperationId
      ) {
        duplicateMovementRows.push(
          index + 2
        );
      }
    }
  );

  checks.noExactDuplicate =
    duplicateMovementRows.length ===
    0;

  /*
   * Рахуємо вже перекласифіковані одиниці
   * цього продажу і цієї партії.
   */
  const salePrefix =
    'VST|' +
    vaccine.saleId +
    '|';

  const normalizedResultTypes =
    CONFIG.resultMovementTypes.map(
      function(value) {
        return normalize(
          value
        );
      }
    );

  const relatedResultMovementRows = [];

  let alreadyReclassified = 0;

  movementValues.forEach(
    function(row, index) {
      const operationId =
        clean(
          row[1]
        );

      const lotId =
        clean(
          row[5]
        );

      const movementType =
        normalize(
          row[6]
        );

      if (
        operationId.startsWith(
          salePrefix
        ) &&
        lotId ===
          vaccine.lotId &&
        normalizedResultTypes.includes(
          movementType
        )
      ) {
        alreadyReclassified +=
          toNumber(
            row[7]
          );

        relatedResultMovementRows.push(
          index + 2
        );
      }
    }
  );

  const remainingStoredQuantity =
    sourceMovement.quantity -
    alreadyReclassified;

  checks.remainingQuantitySufficient =
    remainingStoredQuantity +
      CONFIG.tolerance >=
    1;

  /*
   * Знаходимо точну партію у складі.
   * Читаємо A:Q.
   */
  const stockLastRow =
    stockSheet.getLastRow();

  const stockValues =
    stockLastRow >= 2
      ? stockSheet
          .getRange(
            2,
            1,
            stockLastRow - 1,
            17
          )
          .getValues()
      : [];

  const stockIndex =
    stockValues.findIndex(
      function(row) {
        return (
          clean(
            row[0]
          ) ===
          vaccine.lotId
        );
      }
    );

  let stockRecord = null;

  if (stockIndex !== -1) {
    const stockRow =
      stockValues[
        stockIndex
      ];

    stockRecord = {
      row:
        stockIndex + 2,

      lotId:
        clean(
          stockRow[0]
        ),

      inventoryName:
        clean(
          stockRow[3]
        ),

      unitCost:
        toNumber(
          stockRow[9]
        ),

      soldOrUsed:
        toNumber(
          stockRow[11]
        ),

      transferredToStorage:
        toNumber(
          stockRow[12]
        ),

      writtenOff:
        toNumber(
          stockRow[13]
        ),

      currentBalance:
        toNumber(
          stockRow[14]
        ),

      minimumStock:
        toNumber(
          stockRow[15]
        ),

      lotStatus:
        clean(
          stockRow[16]
        )
    };
  }

  checks.stockLotExists =
    Boolean(
      stockRecord
    );

  checks.stockNameMatches =
    Boolean(
      stockRecord
    ) &&
    normalize(
      stockRecord.inventoryName
    ) ===
    normalize(
      vaccine.vaccineName
    );

  checks.stockUnitCostMatches =
    Boolean(
      stockRecord
    ) &&
    Math.abs(
      stockRecord.unitCost -
      sourceMovement.unitCost
    ) <= 0.01;

  checks.stockStoredCounterSufficient =
    Boolean(
      stockRecord
    ) &&
    stockRecord.transferredToStorage +
      CONFIG.tolerance >=
    1;

  const failedChecks =
    Object.keys(
      checks
    ).filter(
      function(key) {
        return (
          checks[key] !==
          true
        );
      }
    );

  const movementType =
    newStatus ===
    'Використано'
      ? 'Використання зі зберігання'
      : 'Списання';

  let expectedStockAfter = null;

  if (stockRecord) {
    expectedStockAfter = {
      soldOrUsed:
        stockRecord.soldOrUsed +
        (
          newStatus ===
          'Використано'
            ? 1
            : 0
        ),

      transferredToStorage:
        stockRecord
          .transferredToStorage -
        1,

      writtenOff:
        stockRecord.writtenOff +
        (
          newStatus ===
          'Списано'
            ? 1
            : 0
        ),

      currentBalance:
        stockRecord.currentBalance
    };
  }

  const result = {
    ok:
      failedChecks.length ===
      0,

    canWrite:
      failedChecks.length ===
      0,

    test:
      'previewLinkedStoredVaccineEngineStep2',

    version:
      CONFIG.version,

    classification:
      failedChecks.length
        ? 'BROKEN_LINK'
        : 'LINKED_EXACT',

    reason:
      failedChecks.length
        ? 'Не пройдено перевірки: ' +
          failedChecks.join(', ')
        : 'Нове LINKED-ядро підтвердило точний план.',

    syncOperationId:
      syncOperationId,

    vaccine:
      vaccine,

    movementType:
      movementType,

    quantity:
      1,

    unitCost:
      sourceMovement.unitCost,

    totalCost:
      roundMoney(
        sourceMovement.unitCost
      ),

    sourceMovement:
      sourceMovement,

    alreadyReclassified:
      alreadyReclassified,

    remainingStoredQuantity:
      remainingStoredQuantity,

    stockBefore:
      stockRecord,

    expectedStockAfter:
      expectedStockAfter,

    checks:
      checks,

    failedChecks:
      failedChecks,

    duplicateMovementRows:
      duplicateMovementRows,

    relatedResultMovementRows:
      relatedResultMovementRows,

    businessValuesChanged:
      false,

    rowsAppended:
      0,

    cellsWritten:
      0
  };

  Logger.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}