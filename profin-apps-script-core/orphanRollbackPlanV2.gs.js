/**
 * ORPHAN ROLLBACK — КРОК 2, РОЗШИРЕНИЙ DRY-RUN
 * ------------------------------------------------------------
 * Нічого не записує.
 *
 * Для погодженого білого списку показує:
 * — які рядки будуть очищені;
 * — які партії складу зачіпаються;
 * — точну зміну L:Q «було → стане»;
 * — чи можна видалити сирітське надходження;
 * — чи немає непогоджених рухів тієї самої партії.
 */

const ORPHAN_ROLLBACK_V2_CONFIG = Object.freeze({
  sheets: Object.freeze({
    base: 'База операцій',
    stock: 'Склад медичних запасів',
    movement: 'Рух складу',
    registry: 'Облік вакцин',
    accrual: 'Нарахування',
    transfers: 'Переміщення між філіями',
    assets: 'Активи'
  }),

  branches: Object.freeze({
    alternative: Object.freeze({
      label: 'Альтернатива',

      approvedIds: Object.freeze([
        'L-20260723-154',
        'VAC-20260602-361',
        'VAC-20260603-666',
        'VAC-20260604-614',
        'VAC-20260725-932',
        'VAC-20260805-956'
      ]),

      protectedIds: Object.freeze([]),

      returnedTransferCleanupIds:
        Object.freeze([])
    }),

    baburka: Object.freeze({
      label: 'Бабурка',

      approvedIds: Object.freeze([
        'L-20260723-829',
        'L-20260728-233',
        'L-20260728-888',
        'L-20260806-563',

        'TRF-ALT-BAB-20260811-162227-87E327',
        'TRF-ALT-BAB-20260811-165147-1743BD',

        'VAC-20260612-414',
        'VAC-20260624-849',
        'VAC-20260713-977',
        'VAC-20260717-221',
        'VAC-20260806-711',
        'VAC-20260811-260',
        'VAC-20260811-313',
        'VAC-20260811-351',
        'VAC-20260811-772',
        'VAC-20260811-796'
      ]),

      protectedIds: Object.freeze([
        'L-20260723-472',
        'L-20260728-667',
        'L-20260806-541'
      ]),

      returnedTransferCleanupIds:
        Object.freeze([
          'TRF-ALT-BAB-20260811-162227-87E327',
          'TRF-ALT-BAB-20260811-165147-1743BD'
        ])
    })
  }),

  tolerance: 0.000001,

  stockColumns: Object.freeze({
    lotId: 0,                  // A
    receiptOperationId: 1,    // B
    received: 8,               // I
    soldOrUsed: 11,            // L
    stored: 12,                // M
    writtenOff: 13,            // N
    currentBalance: 14,        // O
    minimumStock: 15,          // P
    status: 16,                // Q
    transferredToBranches: 27  // AB
  })
});


/**
 * ГОЛОВНИЙ РОЗШИРЕНИЙ DRY-RUN.
 *
 * Нічого не записує.
 */
function previewApprovedOrphanRollbackPlanV2() {
  const config =
    ORPHAN_ROLLBACK_V2_CONFIG;

  const spreadsheet =
    SpreadsheetApp
      .getActiveSpreadsheet();

  const branch =
    resolveOrphanRollbackV2Branch_(
      spreadsheet.getName()
    );

  const sheets =
    getOrphanRollbackV2Sheets_(
      spreadsheet
    );

  const baseIds =
    readOrphanRollbackV2IdSet_(
      sheets.base,
      1,
      2
    );

  const transferIds =
    readOrphanRollbackV2IdSet_(
      sheets.transfers,
      1,
      2
    );

  const stockRows =
    readOrphanRollbackV2Rows_(
      sheets.stock
    );

  const movementRows =
    readOrphanRollbackV2Rows_(
      sheets.movement
    );

  const registryRows =
    readOrphanRollbackV2Rows_(
      sheets.registry
    );

  const accrualRows =
    readOrphanRollbackV2Rows_(
      sheets.accrual
    );

  const assetRows =
    sheets.assets
      ? readOrphanRollbackV2Rows_(
          sheets.assets
        )
      : [];

  const approvedSet =
    new Set(
      branch.approvedIds
    );

  const returnedTransferSet =
    new Set(
      branch
        .returnedTransferCleanupIds
    );

  const operations =
    branch.approvedIds.map(
      function(operationId) {
        return (
          buildOrphanRollbackV2OperationPlan_({
            operationId:
              operationId,

            baseIds:
              baseIds,

            transferIds:
              transferIds,

            stockRows:
              stockRows,

            movementRows:
              movementRows,

            registryRows:
              registryRows,

            accrualRows:
              accrualRows,

            assetRows:
              assetRows,

            approvedSet:
              approvedSet,

            returnedTransferSet:
              returnedTransferSet
          })
        );
      }
    );

  const stockSimulation =
    buildOrphanRollbackV2StockSimulation_(
      operations,
      stockRows,
      movementRows,
      approvedSet,
      returnedTransferSet
    );

  operations.forEach(
    function(operation) {
      operation.stockChanges =
        stockSimulation
          .changes
          .filter(
            function(change) {
              return (
                change.operationIds
                  .indexOf(
                    operation.operationId
                  ) !== -1
              );
            }
          )
          .map(
            function(change) {
              return change.lotId;
            }
          );

      const relatedFailures =
        stockSimulation
          .failures
          .filter(
            function(failure) {
              return (
                failure.operationIds
                  .indexOf(
                    operation.operationId
                  ) !== -1
              );
            }
          );

      relatedFailures.forEach(
        function(failure) {
          operation.errors.push(
            failure.message
          );
        }
      );

      operation.safeToRollback =
        operation.errors.length === 0 &&
        operation.evidenceCount > 0;

      operation.status =
        operation.safeToRollback
          ? 'READY_FOR_CONTROLLED_ROLLBACK'
          : 'BLOCKED';
    }
  );

  const protectedChecks =
    branch.protectedIds.map(
      function(operationId) {
        return {
          operationId:
            operationId,

          existsInBase:
            baseIds.has(
              operationId
            ),

          stockRows:
            findOrphanRollbackV2Rows_(
              stockRows,
              1,
              operationId,
              3
            ),

          movementRows:
            findOrphanRollbackV2MovementRowsByRoot_(
              movementRows,
              operationId
            )
              .map(
                function(item) {
                  return item.row;
                }
              ),

          action:
            'KEEP_PROTECTED'
        };
      }
    );

  const readyCount =
    operations.filter(
      function(operation) {
        return (
          operation.safeToRollback
        );
      }
    ).length;

  const result = {
    ok: true,

    test:
      'previewApprovedOrphanRollbackPlanV2',

    writesNow:
      false,

    spreadsheetName:
      spreadsheet.getName(),

    branch:
      branch.label,

    approvedOperationCount:
      operations.length,

    readyOperationCount:
      readyCount,

    blockedOperationCount:
      operations.length -
      readyCount,

    affectedStockLotCount:
      stockSimulation
        .changes
        .length,

    protectedOperationCount:
      protectedChecks.length,

    operations:
      operations,

    stockChanges:
      stockSimulation.changes,

    protectedOperations:
      protectedChecks
  };

  Logger.log(
    'SUMMARY_V2: ' +
    JSON.stringify({
      ok:
        result.ok,

      test:
        result.test,

      writesNow:
        false,

      branch:
        result.branch,

      approvedOperationCount:
        result
          .approvedOperationCount,

      readyOperationCount:
        result
          .readyOperationCount,

      blockedOperationCount:
        result
          .blockedOperationCount,

      affectedStockLotCount:
        result
          .affectedStockLotCount,

      protectedOperationCount:
        result
          .protectedOperationCount
    })
  );

  operations.forEach(
    function(operation) {
      Logger.log(
        'ROLLBACK_PLAN: ' +
        JSON.stringify({
          operationId:
            operation.operationId,

          status:
            operation.status,

          action:
            operation.action,

          accrualRows:
            operation.accrualRows,

          registryRows:
            operation.registryRows,

          movementRows:
            operation.movementRows,

          stockReceiptRows:
            operation.stockReceiptRows,

          assetRows:
            operation.assetRows,

          stockChanges:
            operation.stockChanges,

          errors:
            operation.errors
        })
      );
    }
  );

  stockSimulation
    .changes
    .forEach(
      function(change) {
        Logger.log(
          'STOCK_CHANGE: ' +
          JSON.stringify(
            change
          )
        );
      }
    );

  protectedChecks.forEach(
    function(item) {
      Logger.log(
        'PROTECTED: ' +
        JSON.stringify(
          item
        )
      );
    }
  );

  return result;
}


/**
 * Визначає філію за назвою файла.
 */
function resolveOrphanRollbackV2Branch_(
  spreadsheetName
) {
  const name =
    normalizeOrphanRollbackV2_(
      spreadsheetName
    )
      .toLowerCase();

  if (
    name.indexOf(
      'бабурка'
    ) !== -1
  ) {
    return (
      ORPHAN_ROLLBACK_V2_CONFIG
        .branches
        .baburka
    );
  }

  if (
    name.indexOf(
      'альтернатива'
    ) !== -1
  ) {
    return (
      ORPHAN_ROLLBACK_V2_CONFIG
        .branches
        .alternative
    );
  }

  throw new Error(
    'Невідома таблиця «' +
    spreadsheetName +
    '». Dry-run дозволений лише ' +
    'для Альтернативи або Бабурки.'
  );
}


/**
 * Отримує потрібні листи.
 */
function getOrphanRollbackV2Sheets_(
  spreadsheet
) {
  const names =
    ORPHAN_ROLLBACK_V2_CONFIG
      .sheets;

  const result = {};

  Object.keys(
    names
  ).forEach(
    function(key) {
      result[key] =
        spreadsheet.getSheetByName(
          names[key]
        );
    }
  );

  [
    'base',
    'stock',
    'movement',
    'registry',
    'accrual',
    'transfers'
  ].forEach(
    function(key) {
      if (
        !result[key]
      ) {
        throw new Error(
          'Не знайдено лист «' +
          names[key] +
          '».'
        );
      }
    }
  );

  return result;
}


/**
 * Формує план однієї операції.
 */
function buildOrphanRollbackV2OperationPlan_(
  context
) {
  const operationId =
    context.operationId;

  const isReturnedTransferCleanup =
    context
      .returnedTransferSet
      .has(
        operationId
      );

  const accrualRows =
    findOrphanRollbackV2Rows_(
      context.accrualRows,
      0,
      operationId,
      2
    );

  const registryRows =
    findOrphanRollbackV2Rows_(
      context.registryRows,
      1,
      operationId,
      2
    );

  const movementMatches =
    findOrphanRollbackV2MovementRowsByRoot_(
      context.movementRows,
      operationId
    );

  const stockReceiptRows =
    findOrphanRollbackV2Rows_(
      context.stockRows,
      1,
      operationId,
      3
    );

  const assetRows =
    findOrphanRollbackV2Rows_(
      context.assetRows,
      9,
      operationId,
      3
    );

  const evidenceCount =
    accrualRows.length +
    registryRows.length +
    movementMatches.length +
    stockReceiptRows.length +
    assetRows.length;

  const errors = [];

  if (
    context.baseIds.has(
      operationId
    )
  ) {
    errors.push(
      'ID уже існує у «Базі операцій».'
    );
  }

  if (
    !evidenceCount
  ) {
    errors.push(
      'Не знайдено жодного похідного запису.'
    );
  }

  if (
    operationId.indexOf(
      'TRF-'
    ) === 0 &&
    !isReturnedTransferCleanup
  ) {
    errors.push(
      'TRF не входить до підтвердженого ' +
      'списку повернених переміщень.'
    );
  }

  if (
    isReturnedTransferCleanup &&
    context.transferIds.has(
      operationId
    )
  ) {
    errors.push(
      'TRF досі підтверджується локальним ' +
      'листом «Переміщення між філіями».'
    );
  }

  return {
    operationId:
      operationId,

    action:
      isReturnedTransferCleanup
        ? 'CLEAR_RETURNED_TRANSFER_PLACEHOLDER'
        : (
            stockReceiptRows.length
              ? 'ROLLBACK_ORPHAN_RECEIPT'
              : 'ROLLBACK_ORPHAN_DERIVATIVES'
          ),

    isReturnedTransferCleanup:
      isReturnedTransferCleanup,

    evidenceCount:
      evidenceCount,

    accrualRows:
      accrualRows,

    registryRows:
      registryRows,

    movementRows:
      movementMatches.map(
        function(item) {
          return item.row;
        }
      ),

    stockReceiptRows:
      stockReceiptRows,

    assetRows:
      assetRows,

    movementDetails:
      movementMatches,

    stockChanges:
      [],

    errors:
      errors,

    safeToRollback:
      false,

    status:
      'PENDING_STOCK_SIMULATION'
  };
}


/**
 * Моделює зворотні зміни складу.
 */
function buildOrphanRollbackV2StockSimulation_(
  operations,
  stockRows,
  movementRows,
  approvedSet,
  returnedTransferSet
) {
  const config =
    ORPHAN_ROLLBACK_V2_CONFIG;

  const columns =
    config.stockColumns;

  const stockByLot = {};
  const changesByLot = {};
  const failures = [];

  /*
   * Індекс складських партій.
   */
  for (
    let index = 2;
    index < stockRows.length;
    index++
  ) {
    const lotId =
      normalizeOrphanRollbackV2_(
        stockRows[index][
          columns.lotId
        ]
      );

    if (
      !lotId
    ) {
      continue;
    }

    if (
      stockByLot[lotId]
    ) {
      failures.push({
        operationIds: [],

        message:
          'Дубль складської партії «' +
          lotId +
          '».'
      });

      continue;
    }

    stockByLot[lotId] = {
      row:
        index + 1,

      values:
        stockRows[index]
    };
  }

  /*
   * Моделюємо зворотні зміни
   * для складських рухів.
   */
  operations.forEach(
    function(operation) {
      operation
        .movementDetails
        .forEach(
          function(movement) {
            const movementType =
              movement.movementType;

            const lotId =
              movement.lotId;

            const quantity =
              numberOrphanRollbackV2_(
                movement.quantity
              );

            if (
              !lotId ||
              quantity <=
                config.tolerance
            ) {
              operation.errors.push(
                'Рух ' +
                movement.row +
                ' не містить коректної ' +
                'партії або кількості.'
              );

              return;
            }

            /*
             * Надходження та очікування
             * приймання не відкочуються
             * через лічильники L:Q.
             */
            if (
              movementType ===
                'Надходження' ||
              movementType ===
                'Очікування приймання'
            ) {
              return;
            }

            if (
              !stockByLot[lotId]
            ) {
              operation.errors.push(
                'Для руху ' +
                movement.row +
                ' не знайдено партію «' +
                lotId +
                '».'
              );

              return;
            }

            if (
              !changesByLot[lotId]
            ) {
              changesByLot[lotId] =
                createOrphanRollbackV2StockChange_(
                  lotId,
                  stockByLot[lotId]
                );
            }

            const change =
              changesByLot[lotId];

            if (
              change.operationIds
                .indexOf(
                  operation.operationId
                ) === -1
            ) {
              change.operationIds.push(
                operation.operationId
              );
            }

            /*
             * Первинний продаж або використання:
             * L зменшується, O збільшується.
             */
            if (
              movementType ===
                'Продаж і використання' ||
              movementType ===
                'Продаж'
            ) {
              change
                .delta
                .soldOrUsed -=
                  quantity;

              change
                .delta
                .currentBalance +=
                  quantity;

            /*
             * Первинна передача на зберігання:
             * M зменшується, O збільшується.
             */
            } else if (
              movementType ===
                'Передано на зберігання'
            ) {
              change
                .delta
                .stored -=
                  quantity;

              change
                .delta
                .currentBalance +=
                  quantity;

            /*
             * Використання зі зберігання:
             * L зменшується, M відновлюється.
             * O не змінюється повторно.
             */
            } else if (
              movementType ===
                'Використання зі зберігання'
            ) {
              change
                .delta
                .soldOrUsed -=
                  quantity;

              change
                .delta
                .stored +=
                  quantity;

            /*
             * Списання.
             */
            } else if (
              movementType ===
                'Списання'
            ) {
              if (
                movement.isVst
              ) {
                change
                  .delta
                  .writtenOff -=
                    quantity;

                change
                  .delta
                  .stored +=
                    quantity;

              } else {
                change
                  .delta
                  .writtenOff -=
                    quantity;

                change
                  .delta
                  .currentBalance +=
                    quantity;
              }

            } else {
              operation.errors.push(
                'Непідтримуваний тип руху «' +
                movementType +
                '», рядок ' +
                movement.row +
                '.'
              );
            }
          }
        );
    }
  );

  /*
   * Визначаємо партії надходжень,
   * які після відкату мають бути очищені.
   */
  const receiptLotOwner = {};

  operations.forEach(
    function(operation) {
      operation
        .stockReceiptRows
        .forEach(
          function(rowNumber) {
            const row =
              stockRows[
                rowNumber - 1
              ];

            const lotId =
              normalizeOrphanRollbackV2_(
                row[
                  columns.lotId
                ]
              );

            if (
              !lotId
            ) {
              operation.errors.push(
                'Складський рядок ' +
                rowNumber +
                ' не містить ID партії.'
              );

              return;
            }

            receiptLotOwner[lotId] =
              operation.operationId;

            if (
              !changesByLot[lotId]
            ) {
              changesByLot[lotId] =
                createOrphanRollbackV2StockChange_(
                  lotId,
                  stockByLot[lotId]
                );
            }

            const change =
              changesByLot[lotId];

            change.deleteReceiptRow =
              true;

            if (
              change.operationIds
                .indexOf(
                  operation.operationId
                ) === -1
            ) {
              change.operationIds.push(
                operation.operationId
              );
            }
          }
        );
    }
  );

  /*
   * Перевіряємо, чи партію надходження
   * не використовує непогоджена операція.
   */
  Object.keys(
    receiptLotOwner
  ).forEach(
    function(lotId) {
      const ownerId =
        receiptLotOwner[lotId];

      const ownerOperation =
        operations.find(
          function(operation) {
            return (
              operation.operationId ===
              ownerId
            );
          }
        );

      for (
        let index = 1;
        index < movementRows.length;
        index++
      ) {
        const movementLotId =
          normalizeOrphanRollbackV2_(
            movementRows[index][5]
          );

        if (
          movementLotId !== lotId
        ) {
          continue;
        }

        const technicalId =
          normalizeOrphanRollbackV2_(
            movementRows[index][1]
          );

        const rootId =
          getOrphanRollbackV2RootId_(
            technicalId
          );

        if (
          !technicalId ||
          technicalId === ownerId
        ) {
          continue;
        }

        if (
          !approvedSet.has(
            rootId
          )
        ) {
          ownerOperation.errors.push(
            'Партія «' +
              lotId +
              '» має непогоджений рух ' +
              technicalId +
              ' у рядку ' +
              (index + 1) +
              '.'
          );
        }
      }
    }
  );

  /*
   * Фінальний розрахунок «було → стане».
   */
  const changes =
    Object.keys(
      changesByLot
    )
      .sort()
      .map(
        function(lotId) {
          const change =
            changesByLot[lotId];

          const after = {
            soldOrUsed:
              roundOrphanRollbackV2_(
                change
                  .before
                  .soldOrUsed +
                change
                  .delta
                  .soldOrUsed
              ),

            stored:
              roundOrphanRollbackV2_(
                change
                  .before
                  .stored +
                change
                  .delta
                  .stored
              ),

            writtenOff:
              roundOrphanRollbackV2_(
                change
                  .before
                  .writtenOff +
                change
                  .delta
                  .writtenOff
              ),

            currentBalance:
              roundOrphanRollbackV2_(
                change
                  .before
                  .currentBalance +
                change
                  .delta
                  .currentBalance
              ),

            minimumStock:
              change
                .before
                .minimumStock,

            status:
              ''
          };

          after.status =
            resolveOrphanRollbackV2StockStatus_(
              after.currentBalance,
              after.minimumStock
            );

          change.after =
            after;

          const negativeFields =
            [
              'soldOrUsed',
              'stored',
              'writtenOff',
              'currentBalance'
            ]
              .filter(
                function(key) {
                  return (
                    after[key] <
                    -config.tolerance
                  );
                }
              );

          if (
            negativeFields.length
          ) {
            failures.push({
              operationIds:
                change
                  .operationIds
                  .slice(),

              message:
                'Партія «' +
                lotId +
                '» після симуляції має ' +
                'від’ємні поля: ' +
                negativeFields.join(', ') +
                '.'
            });
          }

          const expectedBalance =
            roundOrphanRollbackV2_(
              change.received -
              after.soldOrUsed -
              after.stored -
              after.writtenOff -
              change
                .transferredToBranches
            );

          change
            .expectedBalanceFromCounters =
              expectedBalance;

          change.balanceReconciled =
            Math.abs(
              expectedBalance -
              after.currentBalance
            ) <=
            config.tolerance;

          if (
            !change.balanceReconciled
          ) {
            failures.push({
              operationIds:
                change
                  .operationIds
                  .slice(),

              message:
                'Партія «' +
                lotId +
                '» не сходиться після симуляції: ' +
                'очікуваний залишок ' +
                expectedBalance +
                ', розрахований ' +
                after.currentBalance +
                '.'
            });
          }

          /*
           * Надходження можна очистити,
           * тільки якщо після відкату
           * всі його одиниці знову вільні.
           */
          if (
            change.deleteReceiptRow
          ) {
            const cleanReceipt =
              Math.abs(
                after.soldOrUsed
              ) <= config.tolerance &&
              Math.abs(
                after.stored
              ) <= config.tolerance &&
              Math.abs(
                after.writtenOff
              ) <= config.tolerance &&
              Math.abs(
                after.currentBalance -
                change.received
              ) <= config.tolerance &&
              Math.abs(
                change
                  .transferredToBranches
              ) <= config.tolerance;

            change
              .receiptRowCanBeCleared =
                cleanReceipt;

            /*
             * Для поверненого TRF
             * перевіряємо, що залишковий
             * рядок одержувача вже порожній.
             */
            const ownerId =
              receiptLotOwner[lotId];

            if (
              returnedTransferSet.has(
                ownerId
              )
            ) {
              const returnedPlaceholderIsEmpty =
                Math.abs(
                  change
                    .before
                    .soldOrUsed
                ) <= config.tolerance &&
                Math.abs(
                  change
                    .before
                    .stored
                ) <= config.tolerance &&
                Math.abs(
                  change
                    .before
                    .writtenOff
                ) <= config.tolerance &&
                Math.abs(
                  change
                    .before
                    .currentBalance
                ) <= config.tolerance;

              change
                .receiptRowCanBeCleared =
                  returnedPlaceholderIsEmpty;
            }

            if (
              !change
                .receiptRowCanBeCleared
            ) {
              failures.push({
                operationIds:
                  change
                    .operationIds
                    .slice(),

                message:
                  'Партію «' +
                  lotId +
                  '» не можна очистити ' +
                  'після симуляції.'
              });
            }
          }

          return {
            lotId:
              change.lotId,

            stockRow:
              change.stockRow,

            operationIds:
              change.operationIds,

            deleteReceiptRow:
              change
                .deleteReceiptRow,

            before:
              change.before,

            delta:
              change.delta,

            after:
              change.after,

            transferredToBranches:
              change
                .transferredToBranches,

            expectedBalanceFromCounters:
              change
                .expectedBalanceFromCounters,

            balanceReconciled:
              change
                .balanceReconciled,

            receiptRowCanBeCleared:
              change
                .receiptRowCanBeCleared
          };
        }
      );

  return {
    changes:
      changes,

    failures:
      failures
  };
}


/**
 * Створює модель однієї партії.
 */
function createOrphanRollbackV2StockChange_(
  lotId,
  stockRecord
) {
  const columns =
    ORPHAN_ROLLBACK_V2_CONFIG
      .stockColumns;

  const values =
    stockRecord.values;

  return {
    lotId:
      lotId,

    stockRow:
      stockRecord.row,

    operationIds: [],

    deleteReceiptRow:
      false,

    received:
      numberOrphanRollbackV2_(
        values[
          columns.received
        ]
      ),

    transferredToBranches:
      numberOrphanRollbackV2_(
        values.length >
          columns
            .transferredToBranches
          ? values[
              columns
                .transferredToBranches
            ]
          : 0
      ),

    before: {
      soldOrUsed:
        numberOrphanRollbackV2_(
          values[
            columns.soldOrUsed
          ]
        ),

      stored:
        numberOrphanRollbackV2_(
          values[
            columns.stored
          ]
        ),

      writtenOff:
        numberOrphanRollbackV2_(
          values[
            columns.writtenOff
          ]
        ),

      currentBalance:
        numberOrphanRollbackV2_(
          values[
            columns.currentBalance
          ]
        ),

      minimumStock:
        numberOrphanRollbackV2_(
          values[
            columns.minimumStock
          ]
        ),

      status:
        normalizeOrphanRollbackV2_(
          values[
            columns.status
          ]
        )
    },

    delta: {
      soldOrUsed: 0,
      stored: 0,
      writtenOff: 0,
      currentBalance: 0
    },

    after:
      null,

    receiptRowCanBeCleared:
      null
  };
}


/**
 * Шукає всі складські рухи
 * первинної операції та її VST.
 */
function findOrphanRollbackV2MovementRowsByRoot_(
  rows,
  operationId
) {
  const result = [];

  for (
    let index = 1;
    index < rows.length;
    index++
  ) {
    const technicalId =
      normalizeOrphanRollbackV2_(
        rows[index][1]
      );

    if (
      !technicalId
    ) {
      continue;
    }

    const rootId =
      getOrphanRollbackV2RootId_(
        technicalId
      );

    if (
      rootId === operationId
    ) {
      result.push({
        row:
          index + 1,

        movementId:
          normalizeOrphanRollbackV2_(
            rows[index][0]
          ),

        technicalOperationId:
          technicalId,

        rootOperationId:
          rootId,

        isVst:
          technicalId.indexOf(
            'VST|'
          ) === 0,

        inventoryName:
          normalizeOrphanRollbackV2_(
            rows[index][4]
          ),

        lotId:
          normalizeOrphanRollbackV2_(
            rows[index][5]
          ),

        movementType:
          normalizeOrphanRollbackV2_(
            rows[index][6]
          ),

        quantity:
          numberOrphanRollbackV2_(
            rows[index][7]
          ),

        unitCost:
          numberOrphanRollbackV2_(
            rows[index][8]
          ),

        totalCost:
          numberOrphanRollbackV2_(
            rows[index][9]
          )
      });
    }
  }

  return result;
}


/**
 * Для VST повертає ID батьківського VAC.
 */
function getOrphanRollbackV2RootId_(
  technicalId
) {
  const id =
    normalizeOrphanRollbackV2_(
      technicalId
    );

  if (
    id.indexOf(
      'VST|'
    ) === 0
  ) {
    const parts =
      id.split('|');

    return (
      parts.length >= 2
        ? normalizeOrphanRollbackV2_(
            parts[1]
          )
        : ''
    );
  }

  return id;
}


/**
 * Пошук точного значення
 * у масиві рядків.
 */
function findOrphanRollbackV2Rows_(
  rows,
  zeroBasedColumn,
  value,
  firstDataRow
) {
  const expected =
    normalizeOrphanRollbackV2_(
      value
    );

  const result = [];

  for (
    let index =
      firstDataRow - 1;
    index < rows.length;
    index++
  ) {
    if (
      normalizeOrphanRollbackV2_(
        rows[index][
          zeroBasedColumn
        ]
      ) === expected
    ) {
      result.push(
        index + 1
      );
    }
  }

  return result;
}


/**
 * Читає весь робочий діапазон листа.
 */
function readOrphanRollbackV2Rows_(
  sheet
) {
  const lastRow =
    sheet.getLastRow();

  const lastColumn =
    sheet.getLastColumn();

  if (
    lastRow < 1 ||
    lastColumn < 1
  ) {
    return [];
  }

  return sheet
    .getRange(
      1,
      1,
      lastRow,
      lastColumn
    )
    .getValues();
}


/**
 * Читає унікальні ID.
 */
function readOrphanRollbackV2IdSet_(
  sheet,
  column,
  firstDataRow
) {
  const result =
    new Set();

  const lastRow =
    sheet.getLastRow();

  if (
    lastRow < firstDataRow
  ) {
    return result;
  }

  sheet
    .getRange(
      firstDataRow,
      column,
      lastRow -
        firstDataRow +
        1,
      1
    )
    .getDisplayValues()
    .flat()
    .forEach(
      function(value) {
        const id =
          normalizeOrphanRollbackV2_(
            value
          );

        if (
          id
        ) {
          result.add(
            id
          );
        }
      }
    );

  return result;
}


/**
 * Перераховує статус партії.
 */
function resolveOrphanRollbackV2StockStatus_(
  balance,
  minimumStock
) {
  const tolerance =
    ORPHAN_ROLLBACK_V2_CONFIG
      .tolerance;

  if (
    balance <= tolerance
  ) {
    return 'Закрита';
  }

  if (
    minimumStock > tolerance &&
    balance <=
      minimumStock +
      tolerance
  ) {
    return 'Низький залишок';
  }

  return 'Активна';
}


/**
 * Нормалізація тексту.
 */
function normalizeOrphanRollbackV2_(
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


/**
 * Перетворення значення у число.
 */
function numberOrphanRollbackV2_(
  value
) {
  if (
    typeof value === 'number'
  ) {
    return (
      Number.isFinite(value)
        ? value
        : 0
    );
  }

  const text =
    normalizeOrphanRollbackV2_(
      value
    )
      .replace(
        /\s/g,
        ''
      )
      .replace(
        ',',
        '.'
      )
      .replace(
        /[^\d.-]/g,
        ''
      );

  const number =
    Number(text);

  return (
    Number.isFinite(number)
      ? number
      : 0
  );
}


/**
 * Округлення службових розрахунків.
 */
function roundOrphanRollbackV2_(
  value
) {
  return (
    Math.round(
      (
        numberOrphanRollbackV2_(
          value
        ) +
        Number.EPSILON
      ) *
      1000000
    ) /
    1000000
  );
}