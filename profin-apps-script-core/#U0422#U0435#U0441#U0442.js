function auditReceivedLotsFromAlternativeForCOGS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const transferSheet = ss.getSheetByName(
    'Переміщення між філіями'
  );

  const stockSheet = ss.getSheetByName(
    'Склад медичних запасів'
  );

  if (!transferSheet || !stockSheet) {
    throw new Error(
      'Не знайдено лист «Переміщення між філіями» або «Склад медичних запасів».'
    );
  }

  const transferRows = transferSheet
    .getDataRange()
    .getValues();

  const stockRows = stockSheet
    .getDataRange()
    .getValues();

  const transferHeaders = transferRows.shift();
  const stockHeaders = stockRows.shift();

  function column_(headers, name) {
    const index = headers.indexOf(name);

    if (index === -1) {
      throw new Error('Не знайдено колонку: ' + name);
    }

    return index;
  }

  const tSourceBranch = column_(
    transferHeaders,
    'Філія-відправник'
  );

  const tReceiverBranch = column_(
    transferHeaders,
    'Філія-одержувач'
  );

  const tReceiverLot = column_(
    transferHeaders,
    'ID партії одержувача'
  );

  const tName = column_(
    transferHeaders,
    'Найменування'
  );

  const tQuantity = column_(
    transferHeaders,
    'Кількість'
  );

  const tUnitCost = column_(
    transferHeaders,
    'Собівартість одиниці'
  );

  const tTotalCost = column_(
    transferHeaders,
    'Загальна собівартість'
  );

  const tStatus = column_(
    transferHeaders,
    'Статус'
  );

  const sLotId = column_(stockHeaders, 'ID партії');
  const sCurrentBalance = column_(
    stockHeaders,
    'Поточний залишок'
  );

  const stockByLotId = new Map();

  stockRows.forEach(function(row) {
    stockByLotId.set(
      String(row[sLotId] || '').trim(),
      Number(row[sCurrentBalance]) || 0
    );
  });

  const receivedLots = transferRows
    .filter(function(row) {
      return (
        String(row[tSourceBranch] || '').trim() ===
          'Альтернатива' &&
        String(row[tReceiverBranch] || '').trim() ===
          'Бабурка' &&
        String(row[tStatus] || '').trim() ===
          'Прийнято'
      );
    })
        .map(function(row) {
      const receiverLotId = String(
        row[tReceiverLot] || ''
      ).trim();

      const currentBalance =
        stockByLotId.get(receiverLotId) || 0;

      return {
        receiverLotId: receiverLotId,
        product: String(row[tName] || '').trim(),
        receivedQuantity: Number(row[tQuantity]) || 0,
        unitCost: Number(row[tUnitCost]) || 0,
        totalCost: Number(row[tTotalCost]) || 0,
        currentBalance: currentBalance,
        eligibleForFutureCOGS:
          Boolean(receiverLotId) &&
          currentBalance > 0
      };
    });

  const result = {
    ok: true,
    test: 'auditReceivedLotsFromAlternativeForCOGS',
    writesNow: false,
    receivedLotCount: receivedLots.length,
    lotsWithBalance: receivedLots.filter(function(item) {
      return item.currentBalance > 0;
    }).length,
    totalReceivedCost: receivedLots.reduce(function(sum, item) {
      return sum + item.totalCost;
    }, 0),
    lots: receivedLots
  };

const report = {
  ok: result.ok,
  test: result.test,
  writesNow: result.writesNow,
  zeroBalanceLotsCount: result.zeroBalanceLotsCount,
  cogsConfirmedCount: result.cogsConfirmedCount,
  missingCOGSCandidateCount:
    result.missingCOGSCandidateCount,
  possibleDuplicateCOGSCount:
    result.possibleDuplicateCOGSCount,
  noSaleUseMovementCount:
    result.noSaleUseMovementCount,
  exceptions: result.lots
    .filter(function(lot) {
      return (
        lot.status !==
        'COGS_ПІДТВЕРДЖЕНО_ДІЙ_НЕ_ПОТРІБНО'
      );
    })
    .map(function(lot) {
      return {
        receiverLotId: lot.receiverLotId,
        product: lot.product,
        receivedQuantity: lot.receivedQuantity,
        receivedTotalCost: lot.receivedTotalCost,
        allMovementTypes: lot.allMovementTypes,
        issueQuantity: lot.issueQuantity,
        issueCost: lot.issueCost,
        linkedVaccineRecordCount:
          lot.linkedVaccineRecordCount,
        recordedCOGS: lot.recordedCOGS,
        difference: lot.difference,
        status: lot.status
      };
    })
};

console.log(JSON.stringify(report, null, 2));

return result;
}
/**
 * КРОК 2. READ-ONLY.
 * Шукає, де в Бабурці згадуються прийняті від Альтернативи партії,
 * які вже не мають залишку.
 *
 * Нічого не створює, не оновлює і не перераховує.
 * Потрібна як карта зв'язків перед точним аудитом COGS.
 */
function auditZeroBalanceReceivedLotsReferences() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const baseAudit = auditReceivedLotsFromAlternativeForCOGS();

  const targetLots = baseAudit.lots.filter(function(lot) {
    return (
      Boolean(lot.receiverLotId) &&
      Number(lot.currentBalance) === 0
    );
  });

  const targetLotIds = new Set(
    targetLots.map(function(lot) {
      return lot.receiverLotId;
    })
  );

  const excludedSheets = new Set([
    'Переміщення між філіями',
    'Склад медичних запасів'
  ]);

  const referencesByLotId = {};

  targetLots.forEach(function(lot) {
    referencesByLotId[lot.receiverLotId] = {
      receiverLotId: lot.receiverLotId,
      product: lot.product,
      receivedQuantity: lot.receivedQuantity,
      unitCost: lot.unitCost,
      totalCost: lot.totalCost,
      currentBalance: lot.currentBalance,
      references: []
    };
  });

  function normalize_(value) {
    return String(value || '').trim();
  }

  function compactRow_(headers, row) {
    const result = {};

    headers.forEach(function(header, index) {
      const key = normalize_(header);
      const value = row[index];

      if (key && value !== '' && value !== null) {
        result[key] = value;
      }
    });

    return result;
  }

  ss.getSheets().forEach(function(sheet) {
    const sheetName = sheet.getName();

    if (excludedSheets.has(sheetName)) {
      return;
    }

    const values = sheet.getDataRange().getValues();

    if (values.length < 2) {
      return;
    }

    const headers = values[0].map(normalize_);

    values.slice(1).forEach(function(row, offset) {
      const matchedLotIds = [];

      row.forEach(function(cell) {
        const value = normalize_(cell);

        if (targetLotIds.has(value)) {
          matchedLotIds.push(value);
        }
      });

      Array.from(new Set(matchedLotIds)).forEach(function(lotId) {
        referencesByLotId[lotId].references.push({
          sheetName: sheetName,
          rowNumber: offset + 2,
          headers: headers,
          row: compactRow_(headers, row)
        });
      });
    });
  });

  const lots = Object.keys(referencesByLotId).map(function(lotId) {
    const item = referencesByLotId[lotId];

    return {
      receiverLotId: item.receiverLotId,
      product: item.product,
      receivedQuantity: item.receivedQuantity,
      unitCost: item.unitCost,
      totalCost: item.totalCost,
      currentBalance: item.currentBalance,
      referencesFound: item.references.length,
      references: item.references
    };
  });

  const result = {
    ok: true,
    test: 'auditZeroBalanceReceivedLotsReferences',
    writesNow: false,
    sourceAudit: baseAudit.test,
    zeroBalanceLotsCount: lots.length,
    lotsWithoutAnyReference: lots.filter(function(item) {
      return item.referencesFound === 0;
    }).length,
    lotsWithReferences: lots.filter(function(item) {
      return item.referencesFound > 0;
    }).length,
    lots: lots
  };

  console.log(
  JSON.stringify(
    {
      test: result.test,
      cogsConfirmedCount: result.cogsConfirmedCount,
      missingCOGSCandidateCount:
        result.missingCOGSCandidateCount,
      possibleDuplicateCOGSCount:
        result.possibleDuplicateCOGSCount,
      noSaleUseMovementCount:
        result.noSaleUseMovementCount,
      exceptions: result.lots.filter(function(lot) {
        return (
          lot.status !==
          'COGS_ПІДТВЕРДЖЕНО_ДІЙ_НЕ_ПОТРІБНО'
        );
      })
    },
    null,
    2
  )
);

  return result;
}
/**
 * КРОК 3. READ-ONLY.
 * Звіряє вибуття партій з нульовим залишком із записами
 * «Облік вакцин» за ID складського руху та собівартістю.
 *
 * НІЧОГО НЕ ЗАПИСУЄ І НЕ ПЕРЕРАХОВУЄ.
 */
function auditZeroBalanceReceivedLotsCOGS() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const stockMovementSheet = ss.getSheetByName('Рух складу');
  const vaccineSheet = ss.getSheetByName('Облік вакцин');

  if (!stockMovementSheet || !vaccineSheet) {
    throw new Error(
      'Не знайдено лист «Рух складу» або «Облік вакцин».'
    );
  }

  const baseAudit = auditReceivedLotsFromAlternativeForCOGS();

  const targetLots = baseAudit.lots.filter(function(lot) {
    return (
      Boolean(lot.receiverLotId) &&
      Number(lot.currentBalance) === 0
    );
  });

  const movementRows = stockMovementSheet
    .getDataRange()
    .getValues();

  const vaccineRows = vaccineSheet
    .getDataRange()
    .getValues();

  const movementHeaders = movementRows.shift();
  const vaccineHeaders = vaccineRows.shift();

  function column_(headers, name) {
    const index = headers.indexOf(name);

    if (index === -1) {
      throw new Error('Не знайдено колонку: ' + name);
    }

    return index;
  }

  function text_(value) {
    return String(value || '').trim();
  }

  function number_(value) {
    return Number(value) || 0;
  }

  function round_(value) {
    return Math.round((Number(value) || 0) * 100) / 100;
  }

  const mMovementId = column_(movementHeaders, 'ID руху');
  const mLotId = column_(movementHeaders, 'ID партії');
  const mMovementType = column_(movementHeaders, 'Тип руху');
  const mQuantity = column_(movementHeaders, 'Кількість');
  const mUnitCost = column_(
    movementHeaders,
    'Собівартість одиниці'
  );
  const mTotalCost = column_(
    movementHeaders,
    'Загальна собівартість'
  );

  const vSaleId = column_(vaccineHeaders, 'ID продажу');
  const vLotId = column_(vaccineHeaders, 'ID партії');
  const vMovementId = column_(
    vaccineHeaders,
    'ID складського руху'
  );
  const vStatus = column_(vaccineHeaders, 'Статус');
  const vCost = column_(vaccineHeaders, 'Собівартість');

  const targetLotIds = new Set(
    targetLots.map(function(lot) {
      return lot.receiverLotId;
    })
  );

  const movementsByLotId = new Map();
  const vaccinesByLotId = new Map();

  targetLots.forEach(function(lot) {
    movementsByLotId.set(lot.receiverLotId, []);
    vaccinesByLotId.set(lot.receiverLotId, []);
  });

  movementRows.forEach(function(row, offset) {
    const lotId = text_(row[mLotId]);

    if (!targetLotIds.has(lotId)) {
      return;
    }

    movementsByLotId.get(lotId).push({
      rowNumber: offset + 2,
      movementId: text_(row[mMovementId]),
      movementType: text_(row[mMovementType]),
      quantity: number_(row[mQuantity]),
      unitCost: number_(row[mUnitCost]),
      totalCost: number_(row[mTotalCost])
    });
  });

  vaccineRows.forEach(function(row, offset) {
    const lotId = text_(row[vLotId]);

    if (!targetLotIds.has(lotId)) {
      return;
    }

    vaccinesByLotId.get(lotId).push({
      rowNumber: offset + 2,
      saleId: text_(row[vSaleId]),
      movementId: text_(row[vMovementId]),
      status: text_(row[vStatus]),
      cost: number_(row[vCost])
    });
  });

  const lots = targetLots.map(function(lot) {
    const allMovements = movementsByLotId.get(lot.receiverLotId) || [];
    const allVaccineRows = vaccinesByLotId.get(lot.receiverLotId) || [];

    const issueMovements = allMovements.filter(function(movement) {
      return movement.movementType === 'Продаж і використання';
    });

    const issueMovementIds = new Set(
      issueMovements
        .map(function(movement) {
          return movement.movementId;
        })
        .filter(Boolean)
    );

    const linkedVaccineRows = allVaccineRows.filter(function(vaccine) {
      return issueMovementIds.has(vaccine.movementId);
    });

    const issueQuantity = round_(
      issueMovements.reduce(function(sum, movement) {
        return sum + movement.quantity;
      }, 0)
    );

    const issueCost = round_(
      issueMovements.reduce(function(sum, movement) {
        return sum + movement.totalCost;
      }, 0)
    );

    const recordedCOGS = round_(
      linkedVaccineRows.reduce(function(sum, vaccine) {
        return sum + vaccine.cost;
      }, 0)
    );

    const difference = round_(issueCost - recordedCOGS);

    let status;

    if (issueMovements.length === 0) {
      status = 'НЕМАЄ_РУХУ_ПРОДАЖ_ВИКОРИСТАННЯ';
    } else if (Math.abs(difference) <= 0.01) {
      status = 'COGS_ПІДТВЕРДЖЕНО_ДІЙ_НЕ_ПОТРІБНО';
    } else if (difference > 0.01) {
      status = 'КАНДИДАТ_НА_ВІДСУТНЄ_COGS';
    } else {
      status = 'ПЕРЕВІРИТИ_МОЖЛИВИЙ_ДУБЛЬ_COGS';
    }

    return {
      receiverLotId: lot.receiverLotId,
      product: lot.product,
      receivedQuantity: lot.receivedQuantity,
      receivedTotalCost: round_(lot.totalCost),
      currentBalance: lot.currentBalance,

      allMovementTypes: Array.from(
        new Set(
          allMovements.map(function(movement) {
            return movement.movementType;
          })
        )
      ),

      issueMovementCount: issueMovements.length,
      issueQuantity: issueQuantity,
      issueCost: issueCost,

      linkedVaccineRecordCount: linkedVaccineRows.length,
      recordedCOGS: recordedCOGS,
      difference: difference,
      status: status,

      issueMovements: issueMovements,
      linkedVaccineRows: linkedVaccineRows
    };
  });

  const result = {
    ok: true,
    test: 'auditZeroBalanceReceivedLotsCOGS',
    writesNow: false,
    zeroBalanceLotsCount: lots.length,

    cogsConfirmedCount: lots.filter(function(lot) {
      return lot.status === 'COGS_ПІДТВЕРДЖЕНО_ДІЙ_НЕ_ПОТРІБНО';
    }).length,

    missingCOGSCandidateCount: lots.filter(function(lot) {
      return lot.status === 'КАНДИДАТ_НА_ВІДСУТНЄ_COGS';
    }).length,

    possibleDuplicateCOGSCount: lots.filter(function(lot) {
      return lot.status === 'ПЕРЕВІРИТИ_МОЖЛИВИЙ_ДУБЛЬ_COGS';
    }).length,

    noSaleUseMovementCount: lots.filter(function(lot) {
      return lot.status === 'НЕМАЄ_РУХУ_ПРОДАЖ_ВИКОРИСТАННЯ';
    }).length,

    lots: lots
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
/**
 * КРОК 4. READ-ONLY.
 * Показує лише партії від Альтернативи з нульовим залишком,
 * які не мають стандартного руху «Продаж і використання».
 *
 * Не змінює жодних даних.
 */
function auditSpecialZeroBalanceLotPaths() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const transferSheet = ss.getSheetByName(
    'Переміщення між філіями'
  );
  const stockSheet = ss.getSheetByName(
    'Склад медичних запасів'
  );
  const movementSheet = ss.getSheetByName('Рух складу');
  const vaccineSheet = ss.getSheetByName('Облік вакцин');

  if (
    !transferSheet ||
    !stockSheet ||
    !movementSheet ||
    !vaccineSheet
  ) {
    throw new Error(
      'Не знайдено один із потрібних листів для аудиту.'
    );
  }

  function column_(headers, name) {
    const index = headers.indexOf(name);

    if (index === -1) {
      throw new Error('Не знайдено колонку: ' + name);
    }

    return index;
  }

  function text_(value) {
    return String(value || '').trim();
  }

  function number_(value) {
    return Number(value) || 0;
  }

  const transferRows = transferSheet
    .getDataRange()
    .getValues();
  const stockRows = stockSheet
    .getDataRange()
    .getValues();
  const movementRows = movementSheet
    .getDataRange()
    .getValues();
  const vaccineRows = vaccineSheet
    .getDataRange()
    .getValues();

  const transferHeaders = transferRows.shift();
  const stockHeaders = stockRows.shift();
  const movementHeaders = movementRows.shift();
  const vaccineHeaders = vaccineRows.shift();

  const tSource = column_(
    transferHeaders,
    'Філія-відправник'
  );
  const tReceiver = column_(
    transferHeaders,
    'Філія-одержувач'
  );
  const tLotId = column_(
    transferHeaders,
    'ID партії одержувача'
  );
  const tProduct = column_(
    transferHeaders,
    'Найменування'
  );
  const tQuantity = column_(
    transferHeaders,
    'Кількість'
  );
  const tStatus = column_(transferHeaders, 'Статус');

  const sLotId = column_(stockHeaders, 'ID партії');
  const sBalance = column_(
    stockHeaders,
    'Поточний залишок'
  );

  const mLotId = column_(movementHeaders, 'ID партії');
  const mId = column_(movementHeaders, 'ID руху');
  const mOperationId = column_(
    movementHeaders,
    'ID операції'
  );
  const mType = column_(movementHeaders, 'Тип руху');
  const mQuantity = column_(
    movementHeaders,
    'Кількість'
  );
  const mTotalCost = column_(
    movementHeaders,
    'Загальна собівартість'
  );

  const vLotId = column_(vaccineHeaders, 'ID партії');
  const vSaleId = column_(vaccineHeaders, 'ID продажу');
  const vMovementId = column_(
    vaccineHeaders,
    'ID складського руху'
  );
  const vStatus = column_(vaccineHeaders, 'Статус');
  const vCost = column_(vaccineHeaders, 'Собівартість');

  const balanceByLotId = new Map();

  stockRows.forEach(function(row) {
    balanceByLotId.set(
      text_(row[sLotId]),
      number_(row[sBalance])
    );
  });

  const targetLots = transferRows
    .filter(function(row) {
      const lotId = text_(row[tLotId]);

      return (
        text_(row[tSource]) === 'Альтернатива' &&
        text_(row[tReceiver]) === 'Бабурка' &&
        text_(row[tStatus]) === 'Прийнято' &&
        lotId &&
        number_(balanceByLotId.get(lotId)) === 0
      );
    })
    .map(function(row) {
      return {
        receiverLotId: text_(row[tLotId]),
        product: text_(row[tProduct]),
        receivedQuantity: number_(row[tQuantity])
      };
    });

  const targetLotIds = new Set(
    targetLots.map(function(item) {
      return item.receiverLotId;
    })
  );

  const movementsByLotId = new Map();
  const vaccinesByLotId = new Map();

  targetLots.forEach(function(item) {
    movementsByLotId.set(item.receiverLotId, []);
    vaccinesByLotId.set(item.receiverLotId, []);
  });

  movementRows.forEach(function(row, offset) {
    const lotId = text_(row[mLotId]);

    if (!targetLotIds.has(lotId)) {
      return;
    }

    movementsByLotId.get(lotId).push({
      rowNumber: offset + 2,
      movementId: text_(row[mId]),
      operationId: text_(row[mOperationId]),
      type: text_(row[mType]),
      quantity: number_(row[mQuantity]),
      totalCost: number_(row[mTotalCost])
    });
  });

  vaccineRows.forEach(function(row, offset) {
    const lotId = text_(row[vLotId]);

    if (!targetLotIds.has(lotId)) {
      return;
    }

    vaccinesByLotId.get(lotId).push({
      rowNumber: offset + 2,
      saleId: text_(row[vSaleId]),
      movementId: text_(row[vMovementId]),
      status: text_(row[vStatus]),
      cost: number_(row[vCost])
    });
  });

  const specialLots = targetLots
    .map(function(lot) {
      const movements =
        movementsByLotId.get(lot.receiverLotId) || [];

      const hasStandardIssue = movements.some(function(movement) {
        return movement.type === 'Продаж і використання';
      });

      return {
        receiverLotId: lot.receiverLotId,
        product: lot.product,
        receivedQuantity: lot.receivedQuantity,
        hasStandardIssue: hasStandardIssue,
        movements: movements,
        vaccineRecords:
          vaccinesByLotId.get(lot.receiverLotId) || []
      };
    })
    .filter(function(lot) {
      return !lot.hasStandardIssue;
    });

  const result = {
    ok: true,
    test: 'auditSpecialZeroBalanceLotPaths',
    writesNow: false,
    specialLotsCount: specialLots.length,
    specialLots: specialLots
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
/**
 * READ-ONLY.
 * Пошук усіх робочих згадок історично незв'язаної партії Тетраксиму.
 * Нічого не створює та не змінює.
 */
function auditLegacyUnlinkedTetraksymLot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const targetLotId =
    'TRF-ALT-BAB-20260811-131325-FA9A92-LOT-IN';

  const targetTransferId =
    'TRF-ALT-BAB-20260811-131325-FA9A92';

  const excludedSheets = new Set([
    '_SYSTEM_DELETION_BACKUP'
  ]);

  function text_(value) {
    return String(value || '').trim();
  }

  function compactRow_(headers, row) {
    const result = {};

    headers.forEach(function(header, index) {
      const key = text_(header);
      const value = row[index];

      if (key && value !== '' && value !== null) {
        result[key] = value;
      }
    });

    return result;
  }

  const matches = [];

  ss.getSheets().forEach(function(sheet) {
    if (excludedSheets.has(sheet.getName())) {
      return;
    }

    const rows = sheet.getDataRange().getValues();

    if (rows.length < 2) {
      return;
    }

    const headers = rows[0];

    rows.slice(1).forEach(function(row, offset) {
      const containsTarget = row.some(function(cell) {
        const value = text_(cell);

        return (
          value === targetLotId ||
          value === targetTransferId
        );
      });

      if (!containsTarget) {
        return;
      }

      matches.push({
        sheetName: sheet.getName(),
        rowNumber: offset + 2,
        row: compactRow_(headers, row)
      });
    });
  });

  const result = {
    ok: true,
    test: 'auditLegacyUnlinkedTetraksymLot',
    writesNow: false,
    targetLotId: targetLotId,
    targetTransferId: targetTransferId,
    matchesCount: matches.length,
    matches: matches
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
/**
 * READ-ONLY.
 * Трасування операції, яка була пов'язана з rollback партії Тетраксиму.
 * Нічого не створює, не відновлює та не змінює.
 */
function auditTetraksymRollbackOperationTrace() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const targets = [
    'TRF-ALT-BAB-20260811-131325-FA9A92-LOT-IN',
    'TRF-ALT-BAB-20260811-131325-FA9A92',
    'VAC-20260811-772',
    'VAC-20260811-772-MOV-OUT-1'
  ];

  function text_(value) {
    return String(value || '').trim();
  }

  function compactRow_(headers, row) {
    const result = {};

    headers.forEach(function(header, index) {
      const key = text_(header) || ('Колонка ' + (index + 1));
      const value = row[index];

      if (value !== '' && value !== null) {
        result[key] = value;
      }
    });

    return result;
  }

  const matches = [];

  ss.getSheets().forEach(function(sheet) {
    if (sheet.getName() === '_SYSTEM_DELETION_BACKUP') {
      return;
    }

    const rows = sheet.getDataRange().getValues();

    if (rows.length < 2) {
      return;
    }

    const headers = rows[0];

    rows.slice(1).forEach(function(row, offset) {
      const matchedTargets = [];

      row.forEach(function(cell) {
        const value = text_(cell);

        targets.forEach(function(target) {
          if (value === target || value.indexOf(target) !== -1) {
            matchedTargets.push(target);
          }
        });
      });

      const uniqueTargets = Array.from(new Set(matchedTargets));

      if (uniqueTargets.length === 0) {
        return;
      }

      matches.push({
        sheetName: sheet.getName(),
        rowNumber: offset + 2,
        matchedTargets: uniqueTargets,
        row: compactRow_(headers, row)
      });
    });
  });

  const result = {
    ok: true,
    test: 'auditTetraksymRollbackOperationTrace',
    writesNow: false,
    targets: targets,
    matchesCount: matches.length,
    matches: matches
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
/**
 * READ-ONLY.
 * Трасування чинного продажу Тетраксиму 11.08.2026.
 * Нічого не створює та не виправляє.
 */
function auditActiveTetraksymSale788() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const targets = [
    'VAC-20260811-788',
    'Тетраксим',
    'Y3C54D4'
  ];

  function text_(value) {
    return String(value || '').trim();
  }

  function compactRow_(headers, row) {
    const result = {};

    headers.forEach(function(header, index) {
      const key = text_(header) || ('Колонка ' + (index + 1));
      const value = row[index];

      if (value !== '' && value !== null) {
        result[key] = value;
      }
    });

    return result;
  }

  const prioritySheets = new Set([
    'База операцій',
    'Облік вакцин',
    'Рух складу',
    'Склад медичних запасів',
    'Переміщення між філіями',
    'Нарахування'
  ]);

  const matches = [];

  ss.getSheets().forEach(function(sheet) {
    if (!prioritySheets.has(sheet.getName())) {
      return;
    }

    const rows = sheet.getDataRange().getValues();

    if (rows.length < 2) {
      return;
    }

    const headers = rows[0];

    rows.slice(1).forEach(function(row, offset) {
      const rowText = row
        .map(text_)
        .join(' | ');

      const hasSaleId = rowText.indexOf('VAC-20260811-788') !== -1;
      const hasTetraksym = rowText.indexOf('Тетраксим') !== -1;
      const hasSeries = rowText.indexOf('Y3C54D4') !== -1;

      if (!hasSaleId && !(hasTetraksym && hasSeries)) {
        return;
      }

      matches.push({
        sheetName: sheet.getName(),
        rowNumber: offset + 2,
        matchedBy: {
          saleId: hasSaleId,
          product: hasTetraksym,
          series: hasSeries
        },
        row: compactRow_(headers, row)
      });
    });
  });

  const result = {
    ok: true,
    test: 'auditActiveTetraksymSale788',
    writesNow: false,
    saleId: 'VAC-20260811-788',
    matchesCount: matches.length,
    matches: matches
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
/**
 * DRY-RUN.
 * План відновлення 2 доз Тетраксиму після скасованої
 * операції VAC-20260811-772.
 *
 * НІЧОГО НЕ ЗАПИСУЄ.
 */
function previewRestoreCancelledTetraksymTransferLot() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const transferId =
    'TRF-ALT-BAB-20260811-131325-FA9A92';

  const lotId =
    transferId + '-LOT-IN';

  const settlementId =
    'SET-' + transferId;

  const cancelledOperationId =
    'VAC-20260811-772';

   
  function text_(value) {
    return String(value || '').trim();
  }

  function number_(value) {
    return Number(value) || 0;
  }

  function column_(headers, name) {
    const index = headers.indexOf(name);

    if (index === -1) {
      throw new Error('Не знайдено колонку: ' + name);
    }

    return index;
  }

  function readSheet_(name) {
    const sheet = ss.getSheetByName(name);

    if (!sheet) {
      throw new Error('Не знайдено лист: ' + name);
    }

    const rows = sheet.getDataRange().getValues();
    const headers = rows.shift();

    return {
      sheet: sheet,
      headers: headers,
      rows: rows
    };
  }

  function rowContains_(row, target) {
    return row.some(function(cell) {
      const value = text_(cell);

      return (
        value === target ||
        value.indexOf(target) !== -1
      );
    });
  }

  const transferData = readSheet_(
    'Переміщення між філіями'
  );
  const settlementData = readSheet_(
    'Взаєморозрахунки філій'
  );
  const stockData = readSheet_(
    'Склад медичних запасів'
  );
  const movementData = readSheet_('Рух складу');
  const baseData = readSheet_('База операцій');
  const accrualData = readSheet_('Нарахування');

  const tTransferId = column_(
    transferData.headers,
    'ID переміщення'
  );
  const tReceiverLotId = column_(
    transferData.headers,
    'ID партії одержувача'
  );
  const tType = column_(
    transferData.headers,
    'Тип запасу'
  );
  const tProduct = column_(
    transferData.headers,
    'Найменування'
  );
  const tSeries = column_(
    transferData.headers,
    'Серія'
  );
  const tExpiry = column_(
    transferData.headers,
    'Термін придатності'
  );
  const tQuantity = column_(
    transferData.headers,
    'Кількість'
  );
  const tUnitCost = column_(
    transferData.headers,
    'Собівартість одиниці'
  );
  const tTotalCost = column_(
    transferData.headers,
    'Загальна собівартість'
  );
  const tStatus = column_(
    transferData.headers,
    'Статус'
  );
  const tUser = column_(
    transferData.headers,
    'Хто прийняв / повернув'
  );
  const tAcceptedAt = column_(
    transferData.headers,
    'Дата приймання / повернення'
  );

  const sLotId = column_(
    stockData.headers,
    'ID партії'
  );
  const tCreatedAt = column_(
  transferData.headers,
  'Дата створення'
 ); 
  const transferRows = transferData.rows
    .map(function(row, offset) {
      return {
        rowNumber: offset + 2,
        row: row
      };
    })
    .filter(function(item) {
      return (
        text_(item.row[tTransferId]) === transferId
      );
    });

  const transfer =
    transferRows.length === 1
      ? transferRows[0]
      : null;

  const settlementRows =
    settlementData.rows.filter(function(row) {
      return rowContains_(row, settlementId);
    });

  const existingStockRows =
    stockData.rows.filter(function(row) {
      return text_(row[sLotId]) === lotId;
    });

  const activeMovementRows =
    movementData.rows.filter(function(row) {
      return rowContains_(row, lotId);
    });

  const activeBaseOperationRows =
    baseData.rows.filter(function(row) {
      return rowContains_(
        row,
        cancelledOperationId
      );
    });

  const activeAccrualRows =
    accrualData.rows.filter(function(row) {
      return rowContains_(
        row,
        cancelledOperationId
      );
    });

  const transferStatus =
    transfer
      ? text_(transfer.row[tStatus])
      : '';

  const quantity =
    transfer
      ? number_(transfer.row[tQuantity])
      : 0;

  const unitCost =
    transfer
      ? number_(transfer.row[tUnitCost])
      : 0;

  const totalCost =
    transfer
      ? number_(transfer.row[tTotalCost])
      : 0;

  const checks = {
    exactlyOneTransfer:
      transferRows.length === 1,

    transferIsAccepted:
      transferStatus === 'Прийнято',

    receiverLotIdMatches:
      Boolean(transfer) &&
      text_(transfer.row[tReceiverLotId]) === lotId,

    quantityIsTwo:
      quantity === 2,

    unitCostIs1000:
      unitCost === 1000,

    totalCostIs2000:
      totalCost === 2000,

    exactlyOneSettlement:
      settlementRows.length === 1,

    stockLotIsAbsent:
      existingStockRows.length === 0,

    activeLotMovementsAreAbsent:
      activeMovementRows.length === 0,

    cancelledBaseOperationIsAbsent:
      activeBaseOperationRows.length === 0,

    cancelledAccrualIsAbsent:
      activeAccrualRows.length === 0
  };

  const readyForRepair = Object.keys(checks)
    .every(function(key) {
      return checks[key] === true;
    });

  const proposedStockRecord = transfer
    ? {
        'ID партії': lotId,
        'ID операції надходження': transferId,
        'Тип запасу': text_(transfer.row[tType]),
        'Найменування': text_(transfer.row[tProduct]),
        'Серія': text_(transfer.row[tSeries]),
        'Термін придатності':
          transfer.row[tExpiry],
        'Дата надходження':
          new Date('2026-07-21T21:00:00.000Z'),
        'Постачальник': '',
        'Прийнято': quantity,
        'Собівартість одиниці': unitCost,
        'Загальна закупівельна вартість':
          totalCost,
        'Продано / використано': 0,
        'Передано на зберігання': 0,
        'Списано': 0,
        'Поточний залишок': quantity,
        'Мінімальний залишок (поріг для попередження)': 10,
        'Статус': 'Низький залишок',
        'Користувач': text_(transfer.row[tUser]),
        'Дата і час створення':
            transfer.row[tCreatedAt],
        'ID переміщення': transferId,
        'Філія-відправник': 'Альтернатива',
        'Філія-одержувач': 'Бабурка',
        'Кількість переміщення': quantity,
        'Статус переміщення': 'Прийнято',
        'Дата та час переміщення':
       transfer.row[tCreatedAt],
        'Користувач переміщення':
          text_(transfer.row[tUser]),
        'Передано у філії': 0
      }
    : null;

  const result = {
    ok: true,
    test:
      'previewRestoreCancelledTetraksymTransferLot',
    writesNow: false,
    readyForRepair: readyForRepair,
    transferId: transferId,
    lotId: lotId,
    cancelledOperationId:
      cancelledOperationId,
    checks: checks,
    proposedActions: readyForRepair
      ? [
          'RESTORE_OPEN_STOCK_LOT',
          'DO_NOT_RESTORE_CANCELLED_OPERATION',
          'DO_NOT_CREATE_COGS',
          'KEEP_EXISTING_SETTLEMENT'
        ]
      : [],
    proposedStockRecord:
      proposedStockRecord
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
/**
 * CONTROLLED WRITE.
 * Відновлює лише відкриту складську партію Тетраксиму.
 *
 * Не відновлює скасовану операцію.
 * Не створює COGS.
 * Не змінює взаєморозрахунок.
 * Має автоматичний rollback щойно створеного рядка.
 */
function repairCancelledTetraksymTransferLot() {
  const lock = LockService.getDocumentLock();

  lock.waitLock(30000);

  let stockSheet = null;
  let createdRowNumber = null;

  try {
    const plan =
      previewRestoreCancelledTetraksymTransferLot();

    if (!plan.readyForRepair) {
      throw new Error(
        'Repair заблоковано: preview не пройшов усі перевірки.'
      );
    }

    stockSheet = SpreadsheetApp
      .getActiveSpreadsheet()
      .getSheetByName('Склад медичних запасів');

    if (!stockSheet) {
      throw new Error(
        'Не знайдено лист «Склад медичних запасів».'
      );
    }

    const data = stockSheet
      .getDataRange()
      .getValues();

    const headers = data[0];

    function column_(name) {
      const index = headers.indexOf(name);

      if (index === -1) {
        throw new Error(
          'Не знайдено колонку: ' + name
        );
      }

      return index;
    }

    function text_(value) {
      return String(value || '').trim();
    }

    const lotColumn = column_('ID партії');
    const acceptedColumn = column_('Прийнято');
    const soldColumn = column_(
      'Продано / використано'
    );
    const balanceColumn = column_(
      'Поточний залишок'
    );

    const existingRows = data
      .map(function(row, index) {
        return {
          row: row,
          rowNumber: index + 1
        };
      })
      .filter(function(item) {
        return (
          item.rowNumber > 1 &&
          text_(item.row[lotColumn]) ===
            plan.lotId
        );
      });

    if (existingRows.length !== 0) {
      throw new Error(
        'Партія вже існує. Запис заблоковано.'
      );
    }

    const record = plan.proposedStockRecord;

    const newRow = headers.map(function(header) {
      return Object.prototype.hasOwnProperty.call(
        record,
        header
      )
        ? record[header]
        : '';
    });

    stockSheet.appendRow(newRow);

    createdRowNumber =
      stockSheet.getLastRow();

    SpreadsheetApp.flush();

    const verifyValues = stockSheet
      .getDataRange()
      .getValues();

    const verifyRows = verifyValues
      .map(function(row, index) {
        return {
          row: row,
          rowNumber: index + 1
        };
      })
      .filter(function(item) {
        return (
          item.rowNumber > 1 &&
          text_(item.row[lotColumn]) ===
            plan.lotId
        );
      });

    if (verifyRows.length !== 1) {
      throw new Error(
        'Post-check: знайдено не рівно один рядок партії.'
      );
    }

    const restoredRow = verifyRows[0].row;

    const postChecks = {
      exactlyOneRestoredRow:
        verifyRows.length === 1,

      correctAcceptedQuantity:
        Number(restoredRow[acceptedColumn]) === 2,

      correctSoldQuantity:
        Number(restoredRow[soldColumn]) === 0,

      correctCurrentBalance:
        Number(restoredRow[balanceColumn]) === 2
    };

    const postCheckPassed = Object.keys(postChecks)
      .every(function(key) {
        return postChecks[key] === true;
      });

    if (!postCheckPassed) {
      throw new Error(
        'Post-check не пройшов: ' +
        JSON.stringify(postChecks)
      );
    }

    const result = {
      ok: true,
      test: 'repairCancelledTetraksymTransferLot',
      writesNow: true,
      rollbackPerformed: false,
      restoredLotId: plan.lotId,
      restoredRowNumber:
        verifyRows[0].rowNumber,
      restoredQuantity: 2,
      restoredBalance: 2,
      cogsCreated: false,
      settlementChanged: false,
      cancelledOperationRestored: false,
      postChecks: postChecks
    };

    console.log(JSON.stringify(result, null, 2));

    return result;

  } catch (error) {
    let rollbackPerformed = false;

    if (stockSheet && createdRowNumber) {
      const values = stockSheet
        .getDataRange()
        .getValues();

      const headers = values[0];
      const lotColumn =
        headers.indexOf('ID партії');

      if (lotColumn !== -1) {
        const row =
          values[createdRowNumber - 1];

        const isOurRow =
          row &&
          String(row[lotColumn] || '').trim() ===
            'TRF-ALT-BAB-20260811-131325-FA9A92-LOT-IN';

        if (isOurRow) {
          stockSheet.deleteRow(createdRowNumber);
          rollbackPerformed = true;
        }
      }
    }

    const result = {
      ok: false,
      test: 'repairCancelledTetraksymTransferLot',
      writesNow: true,
      rollbackPerformed: rollbackPerformed,
      error: error.message
    };

    console.log(JSON.stringify(result, null, 2));

    throw new Error(JSON.stringify(result));

  } finally {
    lock.releaseLock();
  }
}