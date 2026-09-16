/**
 * ============================================================
 * КОРЕКЦІЯ СОБІВАРТОСТІ ЗАКУПКИ
 * УНІВЕРСАЛЬНА ВЕРСІЯ: БАБУРКА + АЛЬТЕРНАТИВА
 * ============================================================
 *
 * Підтримує закупки L-*.
 *
 * Сценарії:
 * 1. Фінансова закупка без складської партії:
 *    змінює лише "Базу операцій".
 *
 * 2. Закупка зі складськими партіями:
 *    оновлює:
 *    - Базу операцій;
 *    - Склад медичних запасів;
 *    - Рух складу;
 *    - Облік вакцин;
 *    - залежні вакцинації;
 *    - Нарахування.
 *
 * 3. Якщо товар досі переданий в іншу філію:
 *    корекція блокується до оформлення повернення.
 *
 * Кількість і складські залишки не змінюються.
 */


/**
 * Сумісна функція для чинного меню.
 */
function openPurchaseCostCorrectionBaburka(
  preselectedOperationId
 ) {
  return openPurchaseCostCorrectionUniversal_(
    preselectedOperationId
  );
 }


/**
 * Додаткова сумісна назва для "Альтернативи".
 */
function openPurchaseCostCorrectionAlternative(
  preselectedOperationId
 ) {
  return openPurchaseCostCorrectionUniversal_(
    preselectedOperationId
  );
 }


/**
 * Головна функція меню.
 */
function openPurchaseCostCorrectionUniversal_(
  preselectedOperationId
 ) {
  const ui = SpreadsheetApp.getUi();

  try {
    let enteredId =
  purchaseCostText_(preselectedOperationId);

if (!enteredId) {
  const idPrompt = ui.prompt(
    'Корекція собівартості закупки',
    'Введіть ID закупки у форматі L-*.\n\n' +
      'Можна також вставити ID руху виду L-...-MOV-IN-1.',
    ui.ButtonSet.OK_CANCEL
  );

  if (
    idPrompt.getSelectedButton() !==
    ui.Button.OK
  ) {
    return {
      ok: false,
      writesNow: false,
      cancelledByUser: true
    };
  }

  enteredId =
    purchaseCostText_(
      idPrompt.getResponseText()
    );
}

    const operationId =
      normalizePurchaseOperationId_(enteredId);

    if (
      !operationId ||
      operationId.indexOf('L-') !== 0
    ) {
      throw new Error(
        'Не вдалося визначити ID закупки.\n' +
        'ID повинен починатися з L-.'
      );
    }

    const state =
      buildPurchaseCostCorrectionStateBaburka_(
        operationId
      );

    if (state.outstandingTransferred > 0) {
      ui.alert(
        'Спочатку поверніть товар',
        [
          'Для закупки ' + operationId +
            ' є товар, переданий в іншу філію.',
          '',
          'Передано і ще не повернуто: ' +
            state.outstandingTransferred + ' од.',
          '',
          'Пов’язані переміщення:',
          state.transferOperationIds.join('\n') ||
            'ID переміщення не визначено',
          '',
          'Спочатку оформіть і прийміть зворотне ' +
            'переміщення, а потім повторіть корекцію.'
        ].join('\n'),
        ui.ButtonSet.OK
      );

      return {
        ok: false,
        writesNow: false,
        operationId: operationId,
        returnTransferRequired: true,
        transferredQuantity:
          state.outstandingTransferred
      };
    }

    if (state.blockers.length) {
      throw new Error(
        formatPurchaseCostBlockers_(
          state.blockers
        )
      );
    }

    const modeText =
      state.financialOnly
        ? '\n\nЦе фінансова закупка без складської партії. ' +
          'Буде змінено лише запис у "Базі операцій".'
        : '\n\nЗміни будуть передані в усі знайдені залежності.';

    const costPrompt = ui.prompt(
      'Нова собівартість закупки',
      'Філія: ' + state.branchName + '\n' +
        'ID: ' + operationId + '\n' +
        'Поточна собівартість одиниці: ' +
        state.currentUnitCost +
        modeText +
        '\n\nВведіть нову собівартість одиниці.',
      ui.ButtonSet.OK_CANCEL
    );

    if (costPrompt.getSelectedButton() !== ui.Button.OK) {
      return {
        ok: false,
        writesNow: false,
        cancelledByUser: true
      };
    }

    const newUnitCost =
      parsePurchaseCostNumberBaburka_(
        costPrompt.getResponseText()
      );

    if (
      !Number.isFinite(newUnitCost) ||
      newUnitCost <= 0
    ) {
      throw new Error(
        'Собівартість повинна бути числом, більшим за 0.'
      );
    }

    if (
      purchaseCostNumbersEqualBaburka_(
        newUnitCost,
        state.currentUnitCost
      )
    ) {
      ui.alert(
        'Змін немає',
        'Нова собівартість дорівнює поточній.',
        ui.ButtonSet.OK
      );

      return {
        ok: false,
        writesNow: false,
        noChanges: true
      };
    }

    const plan =
      buildPurchaseCostWritePlanBaburka_(
        state,
        newUnitCost
      );

    if (plan.blockers.length) {
      throw new Error(
        formatPurchaseCostBlockers_(
          plan.blockers
        )
      );
    }

    const reasonPrompt = ui.prompt(
      'Причина корекції',
      'Коротко вкажіть причину зміни собівартості.',
      ui.ButtonSet.OK_CANCEL
    );

    if (
      reasonPrompt.getSelectedButton() !==
      ui.Button.OK
    ) {
      return {
        ok: false,
        writesNow: false,
        cancelledByUser: true
      };
    }

    const reason = purchaseCostText_(
      reasonPrompt.getResponseText()
    );

    if (!reason) {
      throw new Error(
        'Причину корекції не вказано.'
      );
    }

    const confirmationLines = [
      'Філія: ' + state.branchName,
      'ID закупки: ' + operationId,
      '',
      'Собівартість одиниці:',
      state.currentUnitCost + ' → ' + newUnitCost,
      '',
      'Сума закупки:',
      state.currentAmount +
        ' → ' +
        plan.newPurchaseAmount,
      '',
      'Буде оновлено:',
      '• База операцій: 1 запис',
      '• партії складу: ' +
        state.stockItems.length,
      '• рухи складу: ' +
        state.movementItems.length,
      '• записи реєстру вакцин: ' +
        state.targetRegistryItems.length,
      '• залежні вакцинації: ' +
        state.affectedSaleIds.length,
      '• нарахування: ' +
        plan.accrualChangeCount,
      '',
      'Кількість і залишки товару не змінюються.',
      'Причина: ' + reason
    ];

    if (state.financialOnly) {
      confirmationLines.splice(
        7,
        0,
        '',
        'Закупка не має складської партії.',
        'Буде змінено лише фінансовий запис.'
      );
    }

    if (state.warnings.length) {
      confirmationLines.push(
        '',
        'Примітки:',
        state.warnings
          .map(function(warning) {
            return '• ' + warning;
          })
          .join('\n')
      );
    }

    const confirmation = ui.alert(
      'Підтвердити корекцію',
      confirmationLines.join('\n'),
      ui.ButtonSet.YES_NO
    );

    if (confirmation !== ui.Button.YES) {
      return {
        ok: false,
        writesNow: false,
        cancelledByUser: true
      };
    }

    const result =
      executePurchaseCostCorrectionBaburka_(
        state,
        plan,
        reason
      );

    ui.alert(
      'Собівартість закупки скориговано',
      'ID: ' + operationId +
        '\nНова собівартість: ' +
        newUnitCost +
        '\nЗмінено клітинок: ' +
        result.changedCellCount +
        '\nПодія журналу: ' +
        result.eventId,
      ui.ButtonSet.OK
    );

    return result;

  } catch (error) {
    const message = String(
      error && error.message
        ? error.message
        : error
    );

    ui.alert(
      'Корекцію не виконано',
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
 * Нормалізує ID, вставлений адміністратором.
 */
function normalizePurchaseOperationId_(value) {
  let id = purchaseCostText_(value);

  id = id
    .replace(/-MOV-OUT-\d+$/i, '')
    .replace(/-MOV-IN-\d+$/i, '')
    .replace(/-MOV-\d+$/i, '')
    .replace(/-LOT-\d+$/i, '');

  return id;
}


/**
 * Збирає закупку та всі доступні залежності.
 */
function buildPurchaseCostCorrectionStateBaburka_(
  operationId
) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    ss.getSheetByName('База операцій');

  const stockSheet =
    ss.getSheetByName('Склад медичних запасів');

  if (!baseSheet) {
    throw new Error(
      'Не знайдено лист "База операцій".'
    );
  }

  const baseData =
    readPurchaseCostRowsBaburka_(
      baseSheet,
      10,
      33
    );

  const baseMatches = baseData.filter(
    function(item) {
      return (
        purchaseCostText_(item.values[0]) ===
        operationId
      );
    }
  );

  const baseItem =
    baseMatches.length === 1
      ? baseMatches[0]
      : null;

  const blockers = [];
  const warnings = [];

  if (baseMatches.length === 0) {
    blockers.push('PURCHASE_NOT_FOUND');
  }

  if (baseMatches.length > 1) {
    blockers.push('DUPLICATE_PURCHASE_ID');
  }

  if (!baseItem) {
    return {
      operationId: operationId,
      branchName:
        getPurchaseCostBranchName_(),
      baseItem: null,
      stockItems: [],
      lotIds: [],
      movementItems: [],
      targetRegistryItems: [],
      allAffectedRegistryItems: [],
      affectedSaleIds: [],
      vaccineBaseItems: [],
      accrualItems: [],
      transferOperationIds: [],
      outstandingTransferred: 0,
      financialOnly: true,
      currentUnitCost: 0,
      currentQuantity: 0,
      currentAmount: 0,
      blockers: blockers,
      warnings: warnings,
      checksum:
        hashPurchaseCostBaburka_({
          operationId: operationId,
          baseMatches: baseMatches.length
        })
    };
  }

  const status =
    purchaseCostText_(baseItem.values[29]);

  if (status === 'Скасовано') {
    blockers.push('PURCHASE_ALREADY_CANCELLED');
  }

  const currentQuantity =
    Number(baseItem.values[5]) || 0;

  if (!(currentQuantity > 0)) {
    blockers.push('PURCHASE_QUANTITY_INVALID');
  }

  /*
   * Спочатку читаємо лише склад.
   * Якщо партій немає, інші великі листи
   * не читаються — це пришвидшує роботу.
   */
  const stockData = stockSheet
    ? readPurchaseCostRowsBaburka_(
        stockSheet,
        3,
        Math.min(
          Math.max(stockSheet.getLastColumn(), 28),
          stockSheet.getMaxColumns()
        )
      )
    : [];

  const stockItems = stockData.filter(
    function(item) {
      return (
        purchaseCostText_(item.values[1]) ===
        operationId
      );
    }
  );

  const lotIds =
    uniquePurchaseCostStringsBaburka_(
      stockItems.map(function(item) {
        return item.values[0];
      })
    );

  /*
   * Відсутність партії не є помилкою.
   */
  if (!stockItems.length) {
    warnings.push(
      'Фінансова закупка без складської партії'
    );

    const payload = {
      operationId: operationId,
      base:
        purchaseCostBaseFingerprintBaburka_(
          baseItem
        ),
      financialOnly: true
    };

    return {
      operationId: operationId,
      branchName:
        getPurchaseCostBranchName_(),
      baseItem: baseItem,
      stockItems: [],
      lotIds: [],
      movementItems: [],
      targetRegistryItems: [],
      allAffectedRegistryItems: [],
      affectedSaleIds: [],
      vaccineBaseItems: [],
      accrualItems: [],
      transferOperationIds: [],
      outstandingTransferred: 0,
      financialOnly: true,
      currentUnitCost:
        Number(baseItem.values[4]) || 0,
      currentQuantity:
        currentQuantity,
      currentAmount:
        Number(baseItem.values[6]) || 0,
      blockers:
        uniquePurchaseCostStringsBaburka_(
          blockers
        ),
      warnings: warnings,
      checksum:
        hashPurchaseCostBaburka_(payload)
    };
  }

  const movementSheet =
    ss.getSheetByName('Рух складу');

  const registrySheet =
    ss.getSheetByName('Облік вакцин');

  const accrualSheet =
    ss.getSheetByName('Нарахування');

  if (!movementSheet) {
    blockers.push('MOVEMENT_SHEET_NOT_FOUND');
  }

  if (!registrySheet) {
    blockers.push('REGISTRY_SHEET_NOT_FOUND');
  }

  if (!accrualSheet) {
    blockers.push('ACCRUAL_SHEET_NOT_FOUND');
  }

  const movementData = movementSheet
    ? readPurchaseCostRowsBaburka_(
        movementSheet,
        2,
        12
      )
    : [];

  const registryData = registrySheet
    ? readPurchaseCostRowsBaburka_(
        registrySheet,
        2,
        15
      )
    : [];

  const accrualData = accrualSheet
    ? readPurchaseCostRowsBaburka_(
        accrualSheet,
        2,
        10
      )
    : [];

  const movementItems =
    movementData.filter(
      function(item) {
        return (
          lotIds.indexOf(
            purchaseCostText_(
              item.values[5]
            )
          ) !== -1
        );
      }
    );

  const targetRegistryItems =
    registryData.filter(
      function(item) {
        return (
          lotIds.indexOf(
            purchaseCostText_(
              item.values[9]
            )
          ) !== -1
        );
      }
    );

  const affectedSaleIds =
    uniquePurchaseCostStringsBaburka_(
      targetRegistryItems.map(
        function(item) {
          return item.values[1];
        }
      )
    );

  const allAffectedRegistryItems =
    registryData.filter(
      function(item) {
        return (
          affectedSaleIds.indexOf(
            purchaseCostText_(
              item.values[1]
            )
          ) !== -1
        );
      }
    );

  const vaccineBaseItems =
    baseData.filter(
      function(item) {
        return (
          affectedSaleIds.indexOf(
            purchaseCostText_(
              item.values[0]
            )
          ) !== -1
        );
      }
    );

  const accrualItems =
    accrualData.filter(
      function(item) {
        const accrualId =
          purchaseCostText_(
            item.values[0]
          );

        return affectedSaleIds.some(
          function(saleId) {
            return (
              accrualId === saleId ||
              accrualId.indexOf(
                'VST|' + saleId + '|'
              ) === 0
            );
          }
        );
      }
    );

  const transferOperationIds =
    uniquePurchaseCostStringsBaburka_(
      movementItems
        .map(function(item) {
          return item.values[1];
        })
        .filter(function(id) {
          return (
            purchaseCostText_(id)
              .indexOf('TRF-') === 0
          );
        })
    );

  /*
   * AB = 28 колонка = index 27.
   * Поточна кількість, передана між філіями.
   */
  const outstandingTransferred =
    stockItems.reduce(
      function(total, item) {
        return total + Math.max(
          Number(item.values[27]) || 0,
          0
        );
      },
      0
    );

  if (outstandingTransferred > 0) {
    blockers.push('RETURN_TRANSFER_REQUIRED');
  }

  /*
   * Відсутній історичний базовий рядок вакцинації
   * не блокує зміну закупки.
   * Реєстр і нарахування все одно оновляться.
   */
  affectedSaleIds.forEach(
    function(saleId) {
      const baseCount =
        vaccineBaseItems.filter(
          function(item) {
            return (
              purchaseCostText_(
                item.values[0]
              ) === saleId
            );
          }
        ).length;

      if (baseCount === 0) {
        warnings.push(
          'Не знайдено базовий рядок вакцинації ' +
            saleId
        );
      }

      if (baseCount > 1) {
        blockers.push(
          'DUPLICATE_VACCINE_BASE_' +
            saleId
        );
      }
    }
  );

  const payload = {
    operationId: operationId,

    base:
      purchaseCostBaseFingerprintBaburka_(
        baseItem
      ),

    stock:
      stockItems.map(
        purchaseCostStockFingerprintBaburka_
      ),

    movement:
      movementItems.map(
        purchaseCostMovementFingerprintBaburka_
      ),

    registry:
      allAffectedRegistryItems.map(
        purchaseCostRegistryFingerprintBaburka_
      ),

    accrual:
      accrualItems.map(
        purchaseCostAccrualFingerprintBaburka_
      ),

    vaccineBase:
      vaccineBaseItems.map(
        purchaseCostBaseFingerprintBaburka_
      ),

    outstandingTransferred:
      outstandingTransferred
  };

  return {
    operationId: operationId,
    branchName:
      getPurchaseCostBranchName_(),
    baseItem: baseItem,
    stockItems: stockItems,
    lotIds: lotIds,
    movementItems: movementItems,
    targetRegistryItems:
      targetRegistryItems,
    allAffectedRegistryItems:
      allAffectedRegistryItems,
    affectedSaleIds:
      affectedSaleIds,
    vaccineBaseItems:
      vaccineBaseItems,
    accrualItems: accrualItems,
    transferOperationIds:
      transferOperationIds,
    outstandingTransferred:
      outstandingTransferred,
    financialOnly: false,
    currentUnitCost:
      Number(baseItem.values[4]) || 0,
    currentQuantity:
      currentQuantity,
    currentAmount:
      Number(baseItem.values[6]) || 0,
    blockers:
      uniquePurchaseCostStringsBaburka_(
        blockers
      ),
    warnings:
      uniquePurchaseCostStringsBaburka_(
        warnings
      ),
    checksum:
      hashPurchaseCostBaburka_(payload)
  };
}


/**
 * Формує точний план запису.
 */
function buildPurchaseCostWritePlanBaburka_(
  state,
  newUnitCost
) {
  const blockers = [];
  const changes = [];

  const amountSign =
    state.currentAmount < 0 ? -1 : 1;

  const newPurchaseAmount =
    amountSign *
    state.currentQuantity *
    newUnitCost;

  /*
   * База операцій:
   * E — собівартість одиниці;
   * G — сума закупки.
   */
  addPurchaseCostChangeBaburka_(
    changes,
    'База операцій',
    state.baseItem.row,
    5,
    state.baseItem.values[4],
    newUnitCost,
    'Собівартість закупки'
  );

  addPurchaseCostChangeBaburka_(
    changes,
    'База операцій',
    state.baseItem.row,
    7,
    state.baseItem.values[6],
    newPurchaseAmount,
    'Сума закупки'
  );

  /*
   * Для фінансової закупки план завершено.
   */
  if (state.financialOnly) {
    return {
      newUnitCost: newUnitCost,
      newPurchaseAmount:
        newPurchaseAmount,
      changes:
        deduplicatePurchaseCostChangesBaburka_(
          changes,
          blockers
        ),
      accrualChangeCount: 0,
      blockers: blockers
    };
  }

  /*
   * Склад:
   * J — собівартість одиниці;
   * K — загальна вартість партії.
   */
  state.stockItems.forEach(
    function(item) {
      const received =
        Number(item.values[8]) || 0;

      addPurchaseCostChangeBaburka_(
        changes,
        'Склад медичних запасів',
        item.row,
        10,
        item.values[9],
        newUnitCost,
        'Собівартість партії'
      );

      addPurchaseCostChangeBaburka_(
        changes,
        'Склад медичних запасів',
        item.row,
        11,
        item.values[10],
        received * newUnitCost,
        'Вартість партії'
      );
    }
  );

  /*
   * Рух складу:
   * I — собівартість;
   * J — загальна собівартість руху.
   */
  state.movementItems.forEach(
    function(item) {
      const quantity =
        Number(item.values[7]) || 0;

      addPurchaseCostChangeBaburka_(
        changes,
        'Рух складу',
        item.row,
        9,
        item.values[8],
        newUnitCost,
        'Собівартість руху'
      );

      addPurchaseCostChangeBaburka_(
        changes,
        'Рух складу',
        item.row,
        10,
        item.values[9],
        quantity * newUnitCost,
        'Сума руху'
      );
    }
  );

  /*
   * Реєстр вакцин:
   * E — собівартість одиниці.
   */
  state.targetRegistryItems.forEach(
    function(item) {
      addPurchaseCostChangeBaburka_(
        changes,
        'Облік вакцин',
        item.row,
        5,
        item.values[4],
        newUnitCost,
        'Собівартість вакцини'
      );
    }
  );

  const registryAfterByRow = {};

  state.allAffectedRegistryItems.forEach(
    function(item) {
      const lotId =
        purchaseCostText_(
          item.values[9]
        );

      registryAfterByRow[item.row] =
        state.lotIds.indexOf(lotId) !== -1
          ? newUnitCost
          : Number(item.values[4]) || 0;
    }
  );

  /*
   * Перерахунок залежних вакцинацій.
   */
  state.affectedSaleIds.forEach(
    function(saleId) {
      const saleRegistry =
        state.allAffectedRegistryItems
          .filter(function(item) {
            return (
              purchaseCostText_(
                item.values[1]
              ) === saleId
            );
          })
          .sort(function(a, b) {
            return a.row - b.row;
          });

      const costs = saleRegistry.map(
        function(item) {
          return registryAfterByRow[
            item.row
          ];
        }
      );

      if (!costs.length) {
        blockers.push(
          'REGISTRY_NOT_FOUND_' +
            saleId
        );
        return;
      }

      const costSum = costs.reduce(
        function(total, value) {
          return total + value;
        },
        0
      );

      const averageCost =
        costSum / costs.length;

      const saleBase =
        state.vaccineBaseItems.find(
          function(item) {
            return (
              purchaseCostText_(
                item.values[0]
              ) === saleId
            );
          }
        );

      /*
       * X бази = середня собівартість вакцинації.
       * Для історичних операцій рядок може бути відсутній.
       */
      if (saleBase) {
        addPurchaseCostChangeBaburka_(
          changes,
          'База операцій',
          saleBase.row,
          24,
          saleBase.values[23],
          averageCost,
          'Собівартість вакцинації'
        );
      }

      const parentAccruals =
        state.accrualItems
          .filter(function(item) {
            return (
              purchaseCostText_(
                item.values[0]
              ) === saleId
            );
          })
          .sort(function(a, b) {
            return a.row - b.row;
          });

      const childAccruals =
        state.accrualItems
          .filter(function(item) {
            return (
              purchaseCostText_(
                item.values[0]
              ).indexOf(
                'VST|' + saleId + '|'
              ) === 0
            );
          })
          .sort(function(a, b) {
            return a.row - b.row;
          });

      if (parentAccruals.length === 1) {
        addPurchaseCostChangeBaburka_(
          changes,
          'Нарахування',
          parentAccruals[0].row,
          6,
          parentAccruals[0].values[5],
          -costSum,
          'Собівартість вакцинації'
        );

      } else if (
        parentAccruals.length ===
        costs.length
      ) {
        parentAccruals.forEach(
          function(item, index) {
            addPurchaseCostChangeBaburka_(
              changes,
              'Нарахування',
              item.row,
              6,
              item.values[5],
              -costs[index],
              'Собівартість вакцинації'
            );
          }
        );

      } else if (parentAccruals.length > 0) {
        blockers.push(
          'AMBIGUOUS_ACCRUALS_' +
            saleId
        );
      }

      childAccruals.forEach(
        function(item) {
          const accrualId =
            purchaseCostText_(
              item.values[0]
            );

          const prefix =
            'VST|' + saleId + '|';

          const vaccineId =
            accrualId.slice(
              prefix.length
            );

          const registryItem =
            saleRegistry.find(
              function(registryRow) {
                return (
                  purchaseCostText_(
                    registryRow.values[0]
                  ) === vaccineId
                );
              }
            );

          if (!registryItem) {
            blockers.push(
              'CHILD_REGISTRY_NOT_FOUND_' +
                accrualId
            );
            return;
          }

          addPurchaseCostChangeBaburka_(
            changes,
            'Нарахування',
            item.row,
            6,
            item.values[5],
            -registryAfterByRow[
              registryItem.row
            ],
            'Собівартість використання зі зберігання'
          );
        }
      );
    }
  );

  const finalChanges =
    deduplicatePurchaseCostChangesBaburka_(
      changes,
      blockers
    );

  return {
    newUnitCost: newUnitCost,
    newPurchaseAmount:
      newPurchaseAmount,
    changes: finalChanges,
    accrualChangeCount:
      finalChanges.filter(
        function(change) {
          return (
            change.sheet ===
            'Нарахування'
          );
        }
      ).length,
    blockers:
      uniquePurchaseCostStringsBaburka_(
        blockers
      )
  };
}


/**
 * Виконує корекцію з блокуванням і відкатом.
 */
function executePurchaseCostCorrectionBaburka_(
  state,
  plan,
  reason
) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(15000)) {
    throw new Error(
      'Документ зараз змінює інший користувач. ' +
      'Повторіть через кілька секунд.'
    );
  }

  let auditSheet = null;
  let auditRow = 0;
  let snapshot = [];

  try {
    const current =
      buildPurchaseCostCorrectionStateBaburka_(
        state.operationId
      );

    if (current.blockers.length) {
      throw new Error(
        formatPurchaseCostBlockers_(
          current.blockers
        )
      );
    }

    if (current.checksum !== state.checksum) {
      throw new Error(
        'Дані операції змінилися після відкриття вікна. ' +
        'Запустіть корекцію повторно.'
      );
    }

    const currentPlan =
      buildPurchaseCostWritePlanBaburka_(
        current,
        plan.newUnitCost
      );

    if (currentPlan.blockers.length) {
      throw new Error(
        formatPurchaseCostBlockers_(
          currentPlan.blockers
        )
      );
    }

    auditSheet =
      ensurePurchaseCostAuditSheetBaburka_();

    const eventId =
      createPurchaseCostEventIdBaburka_();

    snapshot = currentPlan.changes.map(
      function(change) {
        const sheet =
          ss.getSheetByName(change.sheet);

        if (!sheet) {
          throw new Error(
            'Не знайдено лист "' +
              change.sheet + '".'
          );
        }

        return {
          sheet: change.sheet,
          row: change.row,
          col: change.col,
          before:
            sheet
              .getRange(
                change.row,
                change.col
              )
              .getValue()
        };
      }
    );

    auditRow = auditSheet.getLastRow() + 1;

    auditSheet
      .getRange(
        auditRow,
        1,
        1,
        15
      )
      .setValues([[
        eventId,
        new Date(),
        getPurchaseCostUserBaburka_(),
        'CORRECT_PURCHASE_COST',
        state.operationId,
        current.financialOnly
          ? 'База операцій'
          : 'База + Склад + Рух + Вакцини + Нарахування',
        state.baseItem.row,
        purchaseCostText_(
          state.baseItem.values[29]
        ),
        purchaseCostText_(
          state.baseItem.values[29]
        ),
        state.checksum,
        'PREPARED',
        '',
        limitPurchaseCostAuditTextBaburka_(
          JSON.stringify(snapshot)
        ),
        limitPurchaseCostAuditTextBaburka_(
          JSON.stringify({
            branch: current.branchName,
            newUnitCost:
              plan.newUnitCost,
            newPurchaseAmount:
              plan.newPurchaseAmount,
            changeCount:
              currentPlan.changes.length
          })
        ),
        reason
      ]]);

    currentPlan.changes.forEach(
      function(change) {
        ss
          .getSheetByName(change.sheet)
          .getRange(
            change.row,
            change.col
          )
          .setValue(change.after);
      }
    );

    SpreadsheetApp.flush();

    const failedWrites =
      currentPlan.changes.filter(
        function(change) {
          const actual =
            ss
              .getSheetByName(
                change.sheet
              )
              .getRange(
                change.row,
                change.col
              )
              .getValue();

          return !purchaseCostValuesEqualBaburka_(
            actual,
            change.after
          );
        }
      );

    if (failedWrites.length) {
      throw new Error(
        'Фінальна перевірка запису не пройдена. ' +
        'Зміни буде відкочено.'
      );
    }

    auditSheet
      .getRange(auditRow, 11)
      .setValue('COMPLETED');

    if (
      typeof refreshDeletionGuardAfterSystemWriteBaburka_ ===
      'function'
    ) {
      refreshDeletionGuardAfterSystemWriteBaburka_();
    }

    const result = {
      ok: true,
      writesNow: true,
      branch: current.branchName,
      operationId: state.operationId,
      eventId: eventId,
      oldUnitCost:
        state.currentUnitCost,
      newUnitCost:
        plan.newUnitCost,
      changedCellCount:
        currentPlan.changes.length,
      affectedVaccineOperations:
        current.affectedSaleIds,
      financialOnly:
        current.financialOnly,
      reportsRegeneratedNow: false
    };

    console.log(
      'PURCHASE_COST_CORRECTED: ' +
        JSON.stringify(result)
    );

    return result;

  } catch (error) {
    snapshot
      .slice()
      .reverse()
      .forEach(function(item) {
        try {
          ss
            .getSheetByName(item.sheet)
            .getRange(
              item.row,
              item.col
            )
            .setValue(item.before);
        } catch (rollbackError) {
          console.log(
            'PURCHASE_COST_ROLLBACK_ERROR: ' +
              rollbackError.message
          );
        }
      });

    SpreadsheetApp.flush();

    if (auditSheet && auditRow) {
      auditSheet
        .getRange(auditRow, 11)
        .setValue(
          'FAILED_ROLLED_BACK'
        );
    }

    throw error;

  } finally {
    lock.releaseLock();
  }
}


/**
 * Додає зміну до плану.
 */
function addPurchaseCostChangeBaburka_(
  changes,
  sheet,
  row,
  col,
  before,
  after,
  label
) {
  if (
    purchaseCostValuesEqualBaburka_(
      before,
      after
    )
  ) {
    return;
  }

  changes.push({
    sheet: sheet,
    row: row,
    col: col,
    before: before,
    after: after,
    label: label
  });
}


/**
 * Прибирає дублікати змін.
 */
function deduplicatePurchaseCostChangesBaburka_(
  changes,
  blockers
) {
  const byCell = {};

  changes.forEach(function(change) {
    const key =
      change.sheet +
      '|' +
      change.row +
      '|' +
      change.col;

    if (
      byCell[key] &&
      !purchaseCostValuesEqualBaburka_(
        byCell[key].after,
        change.after
      )
    ) {
      blockers.push(
        'CONFLICTING_CHANGE_' + key
      );
      return;
    }

    byCell[key] = change;
  });

  return Object.keys(byCell).map(
    function(key) {
      return byCell[key];
    }
  );
}


/**
 * Пакетне читання листа.
 */
function readPurchaseCostRowsBaburka_(
  sheet,
  startRow,
  width
) {
  if (!sheet) {
    return [];
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) {
    return [];
  }

  const safeWidth = Math.min(
    width,
    sheet.getMaxColumns()
  );

  return sheet
    .getRange(
      startRow,
      1,
      lastRow - startRow + 1,
      safeWidth
    )
    .getValues()
    .map(function(values, index) {
      return {
        row: startRow + index,
        values: values
      };
    });
}


/**
 * Створює або доповнює журнал.
 */
function ensurePurchaseCostAuditSheetBaburka_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet =
    ss.getSheetByName(
      'Журнал життєвого циклу'
    );

  if (!sheet) {
    sheet = ss.insertSheet(
      'Журнал життєвого циклу'
    );
  }

  const headers = [
    'ID події',
    'Дата і час',
    'Користувач',
    'Дія',
    'ID операції',
    'Лист',
    'Рядок',
    'Статус до',
    'Статус після',
    'Checksum до зміни',
    'Результат',
    'ID події відкату',
    'Знімок до',
    'Зміни після',
    'Причина'
  ];

  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      headers.length -
        sheet.getMaxColumns()
    );
  }

  sheet
    .getRange(
      1,
      1,
      1,
      headers.length
    )
    .setValues([headers]);

  return sheet;
}


/**
 * Контрольні дані базової операції.
 */
function purchaseCostBaseFingerprintBaburka_(
  item
) {
  return [
    item.row,
    item.values[0],
    item.values[4],
    item.values[5],
    item.values[6],
    item.values[23],
    item.values[29]
  ];
}


/**
 * Контрольні дані партії.
 */
function purchaseCostStockFingerprintBaburka_(
  item
) {
  return [
    item.row,
    item.values[0],
    item.values[1],
    item.values[8],
    item.values[9],
    item.values[10],
    item.values[27]
  ];
}


/**
 * Контрольні дані руху.
 */
function purchaseCostMovementFingerprintBaburka_(
  item
) {
  return [
    item.row,
    item.values[0],
    item.values[1],
    item.values[5],
    item.values[7],
    item.values[8],
    item.values[9]
  ];
}


/**
 * Контрольні дані реєстру вакцин.
 */
function purchaseCostRegistryFingerprintBaburka_(
  item
) {
  return [
    item.row,
    item.values[0],
    item.values[1],
    item.values[4],
    item.values[5],
    item.values[9],
    item.values[12]
  ];
}


/**
 * Контрольні дані нарахування.
 */
function purchaseCostAccrualFingerprintBaburka_(
  item
) {
  return [
    item.row,
    item.values[0],
    item.values[5],
    item.values[7]
  ];
}


/**
 * SHA-256 контрольної суми.
 */
function hashPurchaseCostBaburka_(value) {
  return Utilities
    .computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(value),
      Utilities.Charset.UTF_8
    )
    .map(function(byte) {
      return (
        '0' +
        (
          (byte + 256) %
          256
        ).toString(16)
      ).slice(-2);
    })
    .join('');
}


/**
 * Перетворює введене значення у число.
 */
function parsePurchaseCostNumberBaburka_(
  value
) {
  const text = purchaseCostText_(value)
    .replace(/\s/g, '')
    .replace(',', '.');

  const number = Number(text);

  return Number.isFinite(number)
    ? number
    : NaN;
}


/**
 * Порівняння чисел.
 */
function purchaseCostNumbersEqualBaburka_(
  left,
  right
) {
  return Math.abs(
    (Number(left) || 0) -
    (Number(right) || 0)
  ) <= 0.000001;
}


/**
 * Порівняння значень.
 */
function purchaseCostValuesEqualBaburka_(
  left,
  right
) {
  if (
    typeof left === 'number' ||
    typeof right === 'number'
  ) {
    return purchaseCostNumbersEqualBaburka_(
      left,
      right
    );
  }

  return String(
    left == null ? '' : left
  ) === String(
    right == null ? '' : right
  );
}


/**
 * Унікальні непорожні тексти.
 */
function uniquePurchaseCostStringsBaburka_(
  values
) {
  return Array.from(
    new Set(
      (values || [])
        .map(purchaseCostText_)
        .filter(Boolean)
    )
  );
}


/**
 * Текст без зайвих пробілів.
 */
function purchaseCostText_(value) {
  return String(
    value == null ? '' : value
  ).trim();
}


/**
 * Автоматичне визначення філії.
 */
function getPurchaseCostBranchName_() {
  const name =
    SpreadsheetApp
      .getActiveSpreadsheet()
      .getName();

  return name
    .toLowerCase()
    .indexOf('бабурка') !== -1
      ? 'Бабурка'
      : 'Альтернатива';
}


/**
 * ID події журналу.
 */
function createPurchaseCostEventIdBaburka_() {
  return (
    'EVT-CORRECT-PURCHASE-COST-' +
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
      .toUpperCase()
  );
}


/**
 * Користувач, який виконав зміну.
 */
function getPurchaseCostUserBaburka_() {
  return (
    Session.getActiveUser().getEmail() ||
    Session.getEffectiveUser().getEmail() ||
    'невідомий користувач'
  );
}


/**
 * Обмеження розміру запису журналу.
 */
function limitPurchaseCostAuditTextBaburka_(
  value
) {
  return String(value || '').slice(
    0,
    45000
  );
}


/**
 * Зрозуміле пояснення технічних блокувань.
 */
function formatPurchaseCostBlockers_(
  blockers
) {
  const messages = {
    PURCHASE_NOT_FOUND:
      'Закупку з таким ID не знайдено в "Базі операцій".',

    DUPLICATE_PURCHASE_ID:
      'У "Базі операцій" знайдено кілька рядків із цим ID.',

    PURCHASE_ALREADY_CANCELLED:
      'Закупка вже має статус "Скасовано".',

    PURCHASE_QUANTITY_INVALID:
      'У закупці не вказано коректну кількість.',

    RETURN_TRANSFER_REQUIRED:
      'Частина товару перебуває в іншій філії. ' +
      'Спочатку потрібно оформити повернення.',

    MOVEMENT_SHEET_NOT_FOUND:
      'Не знайдено лист "Рух складу".',

    REGISTRY_SHEET_NOT_FOUND:
      'Не знайдено лист "Облік вакцин".',

    ACCRUAL_SHEET_NOT_FOUND:
      'Не знайдено лист "Нарахування".'
  };

  return (blockers || [])
    .map(function(code) {
      if (messages[code]) {
        return '• ' + messages[code];
      }

      if (
        code.indexOf(
          'DUPLICATE_VACCINE_BASE_'
        ) === 0
      ) {
        return (
          '• Знайдено дублікати вакцинації: ' +
          code.replace(
            'DUPLICATE_VACCINE_BASE_',
            ''
          )
        );
      }

      if (
        code.indexOf(
          'AMBIGUOUS_ACCRUALS_'
        ) === 0
      ) {
        return (
          '• Неоднозначна структура нарахувань вакцинації: ' +
          code.replace(
            'AMBIGUOUS_ACCRUALS_',
            ''
          )
        );
      }

      return '• ' + code;
    })
    .join('\n');
}
function openControlledOperationCorrectionBaburka() {
  const ui = SpreadsheetApp.getUi();

  const prompt = ui.prompt(
    'Внести корективи по ID',
    'Введіть точний ID операції.',
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

  const operationId =
    clean_(prompt.getResponseText());

  if (!operationId) {
    throw new Error(
      'ID операції не введено.'
    );
  }

  if (
    operationId.indexOf('L-') === 0
  ) {
    return openPurchaseCostCorrectionBaburka(
      operationId
    );
  }

  if (
    operationId.indexOf('TRF-') === 0
  ) {
    throw new Error(
      'Корекція міжфілійного переміщення ' +
      'виконується окремим складським сценарієм.'
    );
  }

  throw new Error(
    'Для цього типу операції корекція ще не доступна.'
  );
}


function openControlledOperationCorrectionAlternative() {
  return openControlledOperationCorrectionBaburka();
}
function auditAugust25VaccineReceiptQuantityCorrection() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const targets = [
    {
      operationId: 'L-20260825-507',
      product: 'Гексаксим',
      lotId: 'L-20260825-507-LOT-1',
      oldQuantity: 10,
      newQuantity: 15,
      unitCost: 1683.14
    },
    {
      operationId: 'L-20260825-191',
      product: 'Ваксньюванс',
      lotId: 'L-20260825-191-LOT-1',
      oldQuantity: 15,
      newQuantity: 10,
      unitCost: 2322.4
    }
  ];

  const baseSheet = ss.getSheetByName(
    'База операцій'
  );
  const stockSheet = ss.getSheetByName(
    'Склад медичних запасів'
  );
  const movementSheet = ss.getSheetByName(
    'Рух складу'
  );

  if (!baseSheet || !stockSheet || !movementSheet) {
    throw new Error(
      'Не знайдено один із листів: «База операцій», ' +
        '«Склад медичних запасів», «Рух складу».'
    );
  }

  const baseRows = baseSheet
    .getRange(
      2,
      1,
      baseSheet.getLastRow() - 1,
      33
    )
    .getValues();

  const stockRows = stockSheet
    .getRange(
      3,
      1,
      stockSheet.getLastRow() - 2,
      29
    )
    .getValues();

  const movementRows = movementSheet
    .getRange(
      2,
      1,
      movementSheet.getLastRow() - 1,
      12
    )
    .getValues();

  function getOne_(rows, predicate, label) {
    const matches = rows.filter(predicate);

    if (matches.length !== 1) {
      throw new Error(
        label +
          ': очікувався 1 запис, знайдено ' +
          matches.length + '.'
      );
    }

    return matches[0];
  }

  const result = targets.map(function(target) {
    const baseRow = getOne_(
      baseRows,
      function(row) {
        return row[0] === target.operationId;
      },
      'База операцій ' + target.operationId
    );

    const stockRow = getOne_(
      stockRows,
      function(row) {
        return row[0] === target.lotId &&
          row[1] === target.operationId;
      },
      'Складська партія ' + target.lotId
    );

    const receiptMovement = getOne_(
      movementRows,
      function(row) {
        return row[1] === target.operationId &&
          row[5] === target.lotId &&
          row[6] === 'Надходження';
      },
      'Рух надходження ' + target.operationId
    );

    const dependentMovements = movementRows.filter(
      function(row) {
        return row[5] === target.lotId &&
          row[1] !== target.operationId;
      }
    );

    const checks = {
      productMatches:
        stockRow[3] === target.product,
      baseQuantityMatches:
        Number(baseRow[5]) === target.oldQuantity,
      baseVaccineQuantityMatches:
        Number(baseRow[21]) === target.oldQuantity,
      unitCostMatches:
        Number(baseRow[4]) === target.unitCost &&
        Number(stockRow[9]) === target.unitCost &&
        Number(receiptMovement[8]) === target.unitCost,
      stockQuantityMatches:
        Number(stockRow[8]) === target.oldQuantity,
      movementQuantityMatches:
        Number(receiptMovement[7]) === target.oldQuantity
    };

    const failedChecks = Object.keys(checks).filter(
      function(key) {
        return !checks[key];
      }
    );

    return {
      operationId: target.operationId,
      product: target.product,
      lotId: target.lotId,
      currentQuantity: target.oldQuantity,
      correctedQuantity: target.newQuantity,
      correctedPurchaseAmount:
        -(target.newQuantity * target.unitCost),
      expectedNewStockBalance:
        Number(stockRow[14]) +
        (target.newQuantity - target.oldQuantity),
      dependentMovements: dependentMovements.map(
        function(row) {
          return {
            id: row[0],
            operationId: row[1],
            type: row[6],
            quantity: row[7]
          };
        }
      ),
      checks: checks,
      safeToExecute:
        failedChecks.length === 0,
      failedChecks: failedChecks
    };
  });

  const audit = {
    ok: result.every(function(item) {
      return item.safeToExecute;
    }),
    writesNow: false,
    action:
      'AUDIT_RECEIPT_QUANTITY_CORRECTION',
    items: result
  };

  console.log(JSON.stringify(audit, null, 2));

  return audit;
}
function executeAugust25VaccineReceiptQuantityCorrection() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Таблиця зайнята іншою операцією. ' +
        'Повторіть запуск через хвилину.'
    );
  }

  const targets = [
    {
      operationId: 'L-20260825-507',
      product: 'Гексаксим',
      lotId: 'L-20260825-507-LOT-1',
      oldQuantity: 10,
      newQuantity: 15,
      unitCost: 1683.14
    },
    {
      operationId: 'L-20260825-191',
      product: 'Ваксньюванс',
      lotId: 'L-20260825-191-LOT-1',
      oldQuantity: 15,
      newQuantity: 10,
      unitCost: 2322.4
    }
  ];

  try {
    const baseSheet = ss.getSheetByName(
      'База операцій'
    );
    const stockSheet = ss.getSheetByName(
      'Склад медичних запасів'
    );
    const movementSheet = ss.getSheetByName(
      'Рух складу'
    );
    const auditSheet = ss.getSheetByName(
      'Журнал життєвого циклу'
    );

    if (
      !baseSheet ||
      !stockSheet ||
      !movementSheet ||
      !auditSheet
    ) {
      throw new Error(
        'Не знайдено один із потрібних листів.'
      );
    }

    function findOneRow_(
      sheet,
      startRow,
      width,
      predicate,
      label
    ) {
      const values = sheet
        .getRange(
          startRow,
          1,
          sheet.getLastRow() - startRow + 1,
          width
        )
        .getValues();

      const indexes = [];

      values.forEach(function(row, index) {
        if (predicate(row)) {
          indexes.push(index);
        }
      });

      if (indexes.length !== 1) {
        throw new Error(
          label +
            ': очікувався 1 запис, знайдено ' +
            indexes.length + '.'
        );
      }

      return {
        rowNumber: startRow + indexes[0],
        values: values[indexes[0]]
      };
    }

    function getLotStatus_(balance, threshold) {
      if (balance <= 0) {
        return 'Закрита';
      }

      if (balance <= threshold) {
        return 'Низький залишок';
      }

      return 'Активна';
    }

    const prepared = targets.map(function(target) {
      const base = findOneRow_(
        baseSheet,
        2,
        33,
        function(row) {
          return row[0] === target.operationId;
        },
        'База операцій ' + target.operationId
      );

      const stock = findOneRow_(
        stockSheet,
        3,
        29,
        function(row) {
          return row[0] === target.lotId &&
            row[1] === target.operationId;
        },
        'Складська партія ' + target.lotId
      );

      const movement = findOneRow_(
        movementSheet,
        2,
        12,
        function(row) {
          return row[1] === target.operationId &&
            row[5] === target.lotId &&
            row[6] === 'Надходження';
        },
        'Рух надходження ' + target.operationId
      );

      const checks = [
        base.values[5] === target.oldQuantity,
        base.values[21] === target.oldQuantity,
        base.values[4] === target.unitCost,
        stock.values[3] === target.product,
        stock.values[8] === target.oldQuantity,
        stock.values[9] === target.unitCost,
        movement.values[7] === target.oldQuantity,
        movement.values[8] === target.unitCost
      ];

      if (checks.indexOf(false) !== -1) {
        throw new Error(
          'Дані змінилися після сухої перевірки: ' +
            target.operationId +
            '. Корекцію зупинено.'
        );
      }

      const difference =
        target.newQuantity - target.oldQuantity;

      const newBalance =
        Number(stock.values[14]) + difference;

      if (newBalance < 0) {
        throw new Error(
          'Після корекції утворюється від’ємний залишок: ' +
            target.operationId + '.'
        );
      }

      return {
        target: target,
        base: base,
        stock: stock,
        movement: movement,
        newAmount:
          target.newQuantity * target.unitCost,
        newBalance: newBalance,
        newStatus: getLotStatus_(
          newBalance,
          Number(stock.values[15])
        )
      };
    });

    const snapshots = prepared.map(function(item) {
      return {
        base: item.base.values,
        stock: item.stock.values,
        movement: item.movement.values
      };
    });

    const auditStartRow = auditSheet.getLastRow() + 1;

    try {
      prepared.forEach(function(item) {
        const quantity = item.target.newQuantity;
        const amount = item.newAmount;

        baseSheet
          .getRange(item.base.rowNumber, 6)
          .setValue(quantity);

        baseSheet
          .getRange(item.base.rowNumber, 7)
          .setValue(-amount);

        baseSheet
          .getRange(item.base.rowNumber, 22)
          .setValue(quantity);

        stockSheet
          .getRange(item.stock.rowNumber, 9)
          .setValue(quantity);

        stockSheet
          .getRange(item.stock.rowNumber, 11)
          .setValue(amount);

        stockSheet
          .getRange(item.stock.rowNumber, 15)
          .setValue(item.newBalance);

        stockSheet
          .getRange(item.stock.rowNumber, 17)
          .setValue(item.newStatus);

        movementSheet
          .getRange(item.movement.rowNumber, 8)
          .setValue(quantity);

        movementSheet
          .getRange(item.movement.rowNumber, 10)
          .setValue(amount);
      });

      const now = new Date();
      const actor =
        Session.getActiveUser().getEmail() ||
        'невідомий користувач';

      const auditRows = prepared.map(function(item) {
        return [
          'EVT-CORRECT-RECEIPT-QTY-' +
            item.target.operationId +
            '-' +
            now.getTime(),
          now,
          actor,
          'CORRECT_RECEIPT_QUANTITY',
          item.target.operationId,
          'База операцій | Склад медичних запасів | Рух складу',
          'База: ' + item.base.rowNumber +
            '; Склад: ' + item.stock.rowNumber +
            '; Рух: ' + item.movement.rowNumber,
          'Кількість: ' +
            item.target.oldQuantity +
            '; сума: ' +
            (item.target.oldQuantity *
              item.target.unitCost),
          'Кількість: ' +
            item.target.newQuantity +
            '; сума: ' +
            item.newAmount,
          item.target.lotId,
          'Успішно. Залишок партії: ' +
            item.newBalance,
          ''
        ];
      });

      auditSheet
        .getRange(
          auditStartRow,
          1,
          auditRows.length,
          12
        )
        .setValues(auditRows);

      SpreadsheetApp.flush();
    } catch (error) {
      prepared.forEach(function(item, index) {
        baseSheet
          .getRange(
            item.base.rowNumber,
            1,
            1,
            33
          )
          .setValues([snapshots[index].base]);

        stockSheet
          .getRange(
            item.stock.rowNumber,
            1,
            1,
            29
          )
          .setValues([snapshots[index].stock]);

        movementSheet
          .getRange(
            item.movement.rowNumber,
            1,
            1,
            12
          )
          .setValues([snapshots[index].movement]);
      });

      if (auditSheet.getLastRow() >= auditStartRow) {
        auditSheet.deleteRows(
          auditStartRow,
          auditSheet.getLastRow() -
            auditStartRow +
            1
        );
      }

      SpreadsheetApp.flush();

      throw error;
    }

    const result = {
      ok: true,
      writesNow: true,
      action: 'CORRECT_RECEIPT_QUANTITY',
      corrected: prepared.map(function(item) {
        return {
          operationId: item.target.operationId,
          product: item.target.product,
          quantity: item.target.newQuantity,
          purchaseAmount: -item.newAmount,
          currentStockBalance: item.newBalance,
          stockStatus: item.newStatus
        };
      })
    };

    console.log(JSON.stringify(result, null, 2));

    return result;
  } finally {
    lock.releaseLock();
  }
}
function verifyAugust25VaccineReceiptQuantityCorrection() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const targets = [
    {
      operationId: 'L-20260825-507',
      product: 'Гексаксим',
      lotId: 'L-20260825-507-LOT-1',
      quantity: 15,
      unitCost: 1683.14,
      expectedBalance: 10,
      expectedDependentQuantity: 5
    },
    {
      operationId: 'L-20260825-191',
      product: 'Ваксньюванс',
      lotId: 'L-20260825-191-LOT-1',
      quantity: 10,
      unitCost: 2322.4,
      expectedBalance: 5,
      expectedDependentQuantity: 5
    }
  ];

  const baseSheet = ss.getSheetByName(
    'База операцій'
  );
  const stockSheet = ss.getSheetByName(
    'Склад медичних запасів'
  );
  const movementSheet = ss.getSheetByName(
    'Рух складу'
  );

  if (!baseSheet || !stockSheet || !movementSheet) {
    throw new Error(
      'Не знайдено потрібні листи для звірки.'
    );
  }

  function round_(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function findOne_(rows, predicate, label) {
    const matches = rows.filter(predicate);

    if (matches.length !== 1) {
      throw new Error(
        label +
          ': очікувався 1 запис, знайдено ' +
          matches.length + '.'
      );
    }

    return matches[0];
  }

  const baseRows = baseSheet
    .getRange(
      2,
      1,
      baseSheet.getLastRow() - 1,
      33
    )
    .getValues();

  const stockRows = stockSheet
    .getRange(
      3,
      1,
      stockSheet.getLastRow() - 2,
      29
    )
    .getValues();

  const movementRows = movementSheet
    .getRange(
      2,
      1,
      movementSheet.getLastRow() - 1,
      12
    )
    .getValues();

  const items = targets.map(function(target) {
    const base = findOne_(
      baseRows,
      function(row) {
        return row[0] === target.operationId;
      },
      'База операцій ' + target.operationId
    );

    const stock = findOne_(
      stockRows,
      function(row) {
        return row[0] === target.lotId;
      },
      'Складська партія ' + target.lotId
    );

    const receipt = findOne_(
      movementRows,
      function(row) {
        return row[1] === target.operationId &&
          row[5] === target.lotId &&
          row[6] === 'Надходження';
      },
      'Рух надходження ' + target.operationId
    );

    const dependentMovements = movementRows.filter(
      function(row) {
        return row[5] === target.lotId &&
          row[1] !== target.operationId;
      }
    );

    const dependentQuantity = dependentMovements.reduce(
      function(total, row) {
        return total + Number(row[7]);
      },
      0
    );

    const expectedAmount =
      round_(target.quantity * target.unitCost);

    const checks = {
      baseQuantity:
        Number(base[5]) === target.quantity,
      baseVaccineQuantity:
        Number(base[21]) === target.quantity,
      basePurchaseAmount:
        round_(base[6]) === -expectedAmount,
      stockReceived:
        Number(stock[8]) === target.quantity,
      stockPurchaseAmount:
        round_(stock[10]) === expectedAmount,
      stockBalance:
        Number(stock[14]) === target.expectedBalance,
      receiptMovementQuantity:
        Number(receipt[7]) === target.quantity,
      receiptMovementAmount:
        round_(receipt[9]) === expectedAmount,
      dependentQuantityUnchanged:
        dependentQuantity ===
          target.expectedDependentQuantity
    };

    return {
      operationId: target.operationId,
      product: target.product,
      lotId: target.lotId,
      quantity: target.quantity,
      stockBalance: stock[14],
      dependentQuantity: dependentQuantity,
      dependentMovements: dependentMovements.map(
        function(row) {
          return {
            operationId: row[1],
            type: row[6],
            quantity: row[7]
          };
        }
      ),
      checks: checks,
      verified: Object.keys(checks).every(function(key) {
        return checks[key];
      })
    };
  });

  const result = {
    ok: items.every(function(item) {
      return item.verified;
    }),
    writesNow: false,
    action: 'VERIFY_RECEIPT_QUANTITY_CORRECTION',
    items: items
  };

  console.log(JSON.stringify(result, null, 2));

  return result;
}
function openVaccinePurchaseQuantityCorrection() {
  const ui = SpreadsheetApp.getUi();

  const idPrompt = ui.prompt(
    'Корекція кількості закупівлі вакцини',
    'Введіть точний ID закупівлі у форматі L-*.',
    ui.ButtonSet.OK_CANCEL
  );

  if (idPrompt.getSelectedButton() !== ui.Button.OK) {
    return {
      ok: false,
      writesNow: false,
      cancelledByUser: true
    };
  }

  const operationId = String(
    idPrompt.getResponseText() || ''
  ).trim();

  if (
    !operationId ||
    operationId.indexOf('L-') !== 0
  ) {
    throw new Error(
      'Введіть коректний ID закупівлі, що починається з L-.'
    );
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet = ss.getSheetByName(
    'База операцій'
  );
  const stockSheet = ss.getSheetByName(
    'Склад медичних запасів'
  );
  const movementSheet = ss.getSheetByName(
    'Рух складу'
  );
  const auditSheet = ss.getSheetByName(
    'Журнал життєвого циклу'
  );

  if (
    !baseSheet ||
    !stockSheet ||
    !movementSheet ||
    !auditSheet
  ) {
    throw new Error(
      'Не знайдено один із потрібних листів.'
    );
  }

  function findOne_(sheet, startRow, width, predicate, label) {
    const rows = sheet
      .getRange(
        startRow,
        1,
        sheet.getLastRow() - startRow + 1,
        width
      )
      .getValues();

    const matches = [];

    rows.forEach(function(row, index) {
      if (predicate(row)) {
        matches.push({
          rowNumber: startRow + index,
          values: row
        });
      }
    });

    if (matches.length !== 1) {
      throw new Error(
        label +
          ': очікувався 1 запис, знайдено ' +
          matches.length + '.'
      );
    }

    return matches[0];
  }

  function money_(value) {
    return Math.round(Number(value) * 100) / 100;
  }

  function getLotStatus_(balance, threshold) {
    if (balance <= 0) {
      return 'Закрита';
    }

    if (balance <= threshold) {
      return 'Низький залишок';
    }

    return 'Активна';
  }

  const base = findOne_(
    baseSheet,
    2,
    33,
    function(row) {
      return row[0] === operationId;
    },
    'Закупка в «Базі операцій»'
  );

  if (
    base.values[9] !== 'Витрати' ||
    base.values[11] !== 'Закупка вакцин' ||
    base.values[29] !== 'Проведено'
  ) {
    throw new Error(
      'Це не активна операція закупівлі вакцин.'
    );
  }

  const stock = findOne_(
    stockSheet,
    3,
    29,
    function(row) {
      return row[1] === operationId;
    },
    'Складська партія закупки'
  );

  const movement = findOne_(
    movementSheet,
    2,
    12,
    function(row) {
      return row[1] === operationId &&
        row[5] === stock.values[0] &&
        row[6] === 'Надходження';
    },
    'Рух надходження'
  );

  const oldQuantity = Number(base.values[5]);
  const unitCost = Number(base.values[4]);
  const currentBalance = Number(stock.values[14]);

  const checks = [
    oldQuantity > 0,
    Number(base.values[21]) === oldQuantity,
    Number(stock.values[8]) === oldQuantity,
    Number(movement.values[7]) === oldQuantity,
    Number(stock.values[9]) === unitCost,
    Number(movement.values[8]) === unitCost,
    money_(base.values[6]) ===
      -money_(oldQuantity * unitCost),
    money_(stock.values[10]) ===
      money_(oldQuantity * unitCost),
    money_(movement.values[9]) ===
      money_(oldQuantity * unitCost)
  ];

  if (checks.indexOf(false) !== -1) {
    throw new Error(
      'У первинних записах закупки є розбіжність. ' +
        'Корекцію заблоковано.'
    );
  }

  const dependentMovements = movementSheet
    .getRange(
      2,
      1,
      movementSheet.getLastRow() - 1,
      12
    )
    .getValues()
    .filter(function(row) {
      return row[5] === stock.values[0] &&
        row[1] !== operationId;
    });

  const quantityPrompt = ui.prompt(
    'Корекція кількості закупівлі',
    [
      'Вакцина: ' + stock.values[3],
      'Серія: ' + (stock.values[4] || 'не вказано'),
      'Поточна кількість: ' + oldQuantity,
      'Поточний залишок: ' + currentBalance,
      'Пов’язаних рухів: ' +
        dependentMovements.length,
      '',
      'Введіть правильну кількість.'
    ].join('\n'),
    ui.ButtonSet.OK_CANCEL
  );

  if (
    quantityPrompt.getSelectedButton() !== ui.Button.OK
  ) {
    return {
      ok: false,
      writesNow: false,
      cancelledByUser: true
    };
  }

  const newQuantity = Number(
    String(quantityPrompt.getResponseText())
      .trim()
      .replace(',', '.')
  );

  if (
    !Number.isInteger(newQuantity) ||
    newQuantity <= 0
  ) {
    throw new Error(
      'Кількість має бути цілим числом більше нуля.'
    );
  }

  if (newQuantity === oldQuantity) {
    ui.alert(
      'Змін немає',
      'Введено поточну кількість. ' +
        'Корекцію не виконано.',
      ui.ButtonSet.OK
    );

    return {
      ok: true,
      writesNow: false,
      unchanged: true,
      operationId: operationId
    };
  }

  const difference = newQuantity - oldQuantity;
  const newBalance = currentBalance + difference;

  if (newBalance < 0) {
    throw new Error(
      'Корекція неможлива: нова кількість менша, ' +
        'ніж уже використано або передано з партії.'
    );
  }

  const newAmount = money_(newQuantity * unitCost);

  const confirmed = ui.alert(
    'Підтвердити корекцію?',
    [
      'Вакцина: ' + stock.values[3],
      'ID закупівлі: ' + operationId,
      '',
      'Кількість: ' +
        oldQuantity +
        ' → ' +
        newQuantity,
      'Сума закупки: ' +
        money_(base.values[6]) +
        ' → ' +
        -newAmount,
      'Залишок партії: ' +
        currentBalance +
        ' → ' +
        newBalance,
      '',
      'Передачі, зберігання та продажі не зміняться.',
      'Дію буде записано в журнал.'
    ].join('\n'),
    ui.ButtonSet.YES_NO
  );

  if (confirmed !== ui.Button.YES) {
    return {
      ok: false,
      writesNow: false,
      cancelledByUser: true
    };
  }

  const lock = LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Таблиця зайнята іншою операцією. ' +
        'Повторіть спробу через хвилину.'
    );
  }

  try {
    const latestBase = baseSheet
      .getRange(base.rowNumber, 1, 1, 33)
      .getValues()[0];

    const latestStock = stockSheet
      .getRange(stock.rowNumber, 1, 1, 29)
      .getValues()[0];

    const latestMovement = movementSheet
      .getRange(movement.rowNumber, 1, 1, 12)
      .getValues()[0];

    if (
      latestBase[0] !== operationId ||
      Number(latestBase[5]) !== oldQuantity ||
      latestStock[0] !== stock.values[0] ||
      Number(latestStock[8]) !== oldQuantity ||
      Number(latestMovement[7]) !== oldQuantity
    ) {
      throw new Error(
        'Дані змінилися під час корекції. ' +
          'Повторіть дію.'
      );
    }

    const auditStartRow = auditSheet.getLastRow() + 1;

    try {
      baseSheet
        .getRange(base.rowNumber, 6)
        .setValue(newQuantity);

      baseSheet
        .getRange(base.rowNumber, 7)
        .setValue(-newAmount);

      baseSheet
        .getRange(base.rowNumber, 22)
        .setValue(newQuantity);

      stockSheet
        .getRange(stock.rowNumber, 9)
        .setValue(newQuantity);

      stockSheet
        .getRange(stock.rowNumber, 11)
        .setValue(newAmount);

      stockSheet
        .getRange(stock.rowNumber, 15)
        .setValue(newBalance);

      stockSheet
        .getRange(stock.rowNumber, 17)
        .setValue(
          getLotStatus_(
            newBalance,
            Number(stock.values[15])
          )
        );

      movementSheet
        .getRange(movement.rowNumber, 8)
        .setValue(newQuantity);

      movementSheet
        .getRange(movement.rowNumber, 10)
        .setValue(newAmount);

      const now = new Date();
      const actor =
        Session.getActiveUser().getEmail() ||
        'невідомий користувач';

      auditSheet.appendRow([
        'EVT-CORRECT-RECEIPT-QTY-' +
          operationId +
          '-' +
          now.getTime(),
        now,
        actor,
        'CORRECT_RECEIPT_QUANTITY',
        operationId,
        'База операцій | Склад медичних запасів | Рух складу',
        'База: ' + base.rowNumber +
          '; Склад: ' + stock.rowNumber +
          '; Рух: ' + movement.rowNumber,
        'Кількість: ' + oldQuantity +
          '; сума: ' + money_(base.values[6]),
        'Кількість: ' + newQuantity +
          '; сума: ' + -newAmount,
        stock.values[0],
        'Успішно. Залишок партії: ' +
          newBalance,
        ''
      ]);

      SpreadsheetApp.flush();
    } catch (error) {
      baseSheet
        .getRange(base.rowNumber, 1, 1, 33)
        .setValues([latestBase]);

      stockSheet
        .getRange(stock.rowNumber, 1, 1, 29)
        .setValues([latestStock]);

      movementSheet
        .getRange(movement.rowNumber, 1, 1, 12)
        .setValues([latestMovement]);

      if (auditSheet.getLastRow() >= auditStartRow) {
        auditSheet.deleteRows(
          auditStartRow,
          auditSheet.getLastRow() - auditStartRow + 1
        );
      }

      SpreadsheetApp.flush();

      throw error;
    }

    ui.alert(
      'Корекцію виконано',
      [
        'Вакцина: ' + stock.values[3],
        'Кількість: ' +
          oldQuantity +
          ' → ' +
          newQuantity,
        'Новий залишок: ' + newBalance
      ].join('\n'),
      ui.ButtonSet.OK
    );

    return {
      ok: true,
      writesNow: true,
      operationId: operationId,
      oldQuantity: oldQuantity,
      newQuantity: newQuantity,
      newBalance: newBalance
    };
  } finally {
    lock.releaseLock();
  }
}