/**
 * PROFIN OS — CORE ЖИТТЄВОГО ЦИКЛУ, БАБУРКА
 * Виробничі функції без меню, preview та тестів.
 */

function executeControlledSimpleCancellationBaburka_(
  operationId,
  expectedChecksum
) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const baseSheet =
    ss.getSheetByName('База операцій');

  const auditSheet =
    ss.getSheetByName(
      'Журнал життєвого циклу'
    );

  if (!baseSheet || !auditSheet) {
    throw new Error(
      'Не знайдено "База операцій" або журнал.'
    );
  }

  const lock =
    LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Документ змінює інший користувач. ' +
      'Повторіть спробу пізніше.'
    );
  }

  let statusCell = null;
  let statusBefore = '';
  let auditRow = 0;
  let statusChanged = false;

  try {
    const lifecycle =
      analyzeOperationById_(
        operationId,
        {
          branch: 'Бабурка'
        }
      );

    if (
      lifecycle.status !==
        'SAFE_SIMPLE_CANDIDATE' ||
      lifecycle.baseRows.length !== 1
    ) {
      throw new Error(
        'Стан операції змінився або з’явилися залежності.'
      );
    }

    if (
      lifecycle.checksum !==
      expectedChecksum
    ) {
      throw new Error(
        'Операція змінилася після попереднього перегляду. ' +
        'Скасування зупинено.'
      );
    }

    const baseRow =
      lifecycle.baseRows[0];

    statusCell =
      baseSheet.getRange(
        baseRow,
        30
      );

    statusBefore =
      clean_(
        statusCell.getDisplayValue()
      );

    if (
      statusBefore !==
      'Проведено'
    ) {
      throw new Error(
        'Поточний статус більше не дорівнює "Проведено".'
      );
    }

    const eventId =
      'EVT-CANCEL-' +
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

    const userEmail =
      typeof getSafeUserEmail_ ===
      'function'
        ? getSafeUserEmail_()
        : Session
            .getActiveUser()
            .getEmail();

    auditRow =
      auditSheet.getLastRow() + 1;

    auditSheet
      .getRange(
        auditRow,
        1,
        1,
        12
      )
      .setValues([[
        eventId,
        new Date(),
        userEmail,
        'CANCEL',
        operationId,
        'База операцій',
        baseRow,
        statusBefore,
        'Скасовано',
        lifecycle.checksum,
        'PREPARED',
        ''
      ]]);

    SpreadsheetApp.flush();

    statusCell.setValue(
      'Скасовано'
    );

    SpreadsheetApp.flush();

    statusChanged = true;

    const statusAfter =
      clean_(
        statusCell.getDisplayValue()
      );

    if (
      statusAfter !==
      'Скасовано'
    ) {
      throw new Error(
        'Не вдалося підтвердити новий статус.'
      );
    }

    auditSheet
      .getRange(
        auditRow,
        11
      )
      .setValue(
        'COMPLETED'
      );

    SpreadsheetApp.flush();

    return {
      ok: true,
      writesNow: true,
      operationId:
        operationId,
      eventId:
        eventId,
      baseRow:
        baseRow,
      statusBefore:
        statusBefore,
      statusAfter:
        statusAfter,
      auditRow:
        auditRow,
      reportsRegeneratedNow:
        false
    };

  } catch (error) {
    let rollbackCompleted =
      false;

    if (
      statusChanged &&
      statusCell &&
      statusBefore
    ) {
      try {
        statusCell.setValue(
          statusBefore
        );

        SpreadsheetApp.flush();

        rollbackCompleted =
          clean_(
            statusCell
              .getDisplayValue()
          ) === statusBefore;

      } catch (rollbackError) {
        rollbackCompleted =
          false;
      }
    }

    if (auditRow) {
      try {
        auditSheet
          .getRange(
            auditRow,
            11
          )
          .setValue(
            rollbackCompleted
              ? 'FAILED_ROLLED_BACK'
              : 'FAILED_ROLLBACK_REQUIRED'
          );

      } catch (auditError) {
        // Основна помилка залишається пріоритетною.
      }
    }

    throw new Error(
      String(
        error &&
        error.message
          ? error.message
          : error
      ) +
      ' | rollbackCompleted=' +
      rollbackCompleted
    );

  } finally {
    lock.releaseLock();
  }
}


/**
 * Формує універсальний план залежностей операції.
 * Нічого не записує.
 */
function buildOperationLifecyclePlanById_(
  operationId,
  options
) {
  const id =
    ol2Normalize_(operationId);

  if (!id) {
    throw new Error(
      'Не передано ID операції.'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  analyzeOperationById_(
    id,
    options || {
      branch: 'Бабурка'
    }
  );

  const sheets = {
    base:
      ss.getSheetByName(
        'База операцій'
      ),

    stock:
      ss.getSheetByName(
        'Склад медичних запасів'
      ),

    movement:
      ss.getSheetByName(
        'Рух складу'
      ),

    registry:
      ss.getSheetByName(
        'Облік вакцин'
      ),

    accrual:
      ss.getSheetByName(
        'Нарахування'
      ),

    transfer:
      ss.getSheetByName(
        'Переміщення між філіями'
      ),

    assets:
      ss.getSheetByName(
        'Активи'
      )
  };

  const baseRows =
    sheets.base
      ? ol2ReadRows_(
          sheets.base,
          10,
          33
        )
      : [];

  const stockRows =
    sheets.stock
      ? ol2ReadRows_(
          sheets.stock,
          3,
          28
        )
      : [];

  const movementRows =
    sheets.movement
      ? ol2ReadRows_(
          sheets.movement,
          2,
          12
        )
      : [];

  const registryRows =
    sheets.registry
      ? ol2ReadRows_(
          sheets.registry,
          2,
          15
        )
      : [];

  const accrualRows =
    sheets.accrual
      ? ol2ReadRows_(
          sheets.accrual,
          2,
          10
        )
      : [];

  const transferRows =
    sheets.transfer
      ? ol2ReadRows_(
          sheets.transfer,
          2,
          18
        )
      : [];

  const assetRows =
    sheets.assets
      ? ol2ReadRows_(
          sheets.assets,
          3,
          12
        )
      : [];

  const directBaseRows =
    ol2Where_(
      baseRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[0]
          ) === id
        );
      }
    );

  const baseValues =
    directBaseRows.length === 1
      ? directBaseRows[0].values
      : [];

  const type =
    ol2Normalize_(
      baseValues[9]
    );

  const category =
    ol2Normalize_(
      baseValues[10]
    );

  const article =
    ol2Normalize_(
      baseValues[11]
    );

  const currentStatus =
    ol2Normalize_(
      baseValues[29]
    );

  const directMovements =
    ol2Where_(
      movementRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[1]
          ) === id
        );
      }
    );

  const directStockRows =
    ol2Where_(
      stockRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[1]
          ) === id
        );
      }
    );

  const directTransferRows =
    ol2Where_(
      transferRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[0]
          ) === id
        );
      }
    );

  const lotIds =
    ol2Unique_(
      directStockRows
        .map(function(row) {
          return ol2Normalize_(
            row.values[0]
          );
        })
        .concat(
          directMovements.map(
            function(row) {
              return ol2Normalize_(
                row.values[5]
              );
            }
          ),

          directTransferRows.reduce(
            function(result, row) {
              result.push(
                ol2Normalize_(
                  row.values[4]
                )
              );

              result.push(
                ol2Normalize_(
                  row.values[5]
                )
              );

              return result;
            },
            []
          )
        )
    );

  const relatedStockRows =
    ol2Where_(
      stockRows,
      function(row) {
        return (
          lotIds.indexOf(
            ol2Normalize_(
              row.values[0]
            )
          ) !== -1
        );
      }
    );

  const relatedMovements =
    ol2Where_(
      movementRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[1]
          ) === id ||

          lotIds.indexOf(
            ol2Normalize_(
              row.values[5]
            )
          ) !== -1
        );
      }
    );

  const movementIds =
    ol2Unique_(
      relatedMovements.map(
        function(row) {
          return ol2Normalize_(
            row.values[0]
          );
        }
      )
    );

  const dependentOperationIds =
    ol2Unique_(
      relatedMovements
        .map(function(row) {
          return ol2Normalize_(
            row.values[1]
          );
        })
        .filter(function(value) {
          return (
            value &&
            value !== id
          );
        })
    );

  const allRelatedOperationIds =
    ol2Unique_(
      [id].concat(
        dependentOperationIds
      )
    );

  const relatedRegistryRows =
    ol2Where_(
      registryRows,
      function(row) {
        return (
          allRelatedOperationIds
            .indexOf(
              ol2Normalize_(
                row.values[1]
              )
            ) !== -1 ||

          lotIds.indexOf(
            ol2Normalize_(
              row.values[9]
            )
          ) !== -1 ||

          movementIds.indexOf(
            ol2Normalize_(
              row.values[12]
            )
          ) !== -1
        );
      }
    );

  const relatedAccrualRows =
    ol2Where_(
      accrualRows,
      function(row) {
        const accrualId =
          ol2Normalize_(
            row.values[0]
          );

        return allRelatedOperationIds
          .some(function(relatedId) {
            return (
              accrualId ===
                relatedId ||

              accrualId.indexOf(
                'VST|' +
                relatedId +
                '|'
              ) === 0
            );
          });
      }
    );

  const relatedTransferRows =
    ol2Where_(
      transferRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[0]
          ) === id ||

          lotIds.indexOf(
            ol2Normalize_(
              row.values[4]
            )
          ) !== -1 ||

          lotIds.indexOf(
            ol2Normalize_(
              row.values[5]
            )
          ) !== -1
        );
      }
    );

  const relatedAssetRows =
    ol2Where_(
      assetRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[9]
          ) === id
        );
      }
    );

  const stockChecks =
    relatedStockRows.map(
      function(row) {
        const received =
          ol2Number_(
            row.values[8]
          );

        const soldOrUsed =
          ol2Number_(
            row.values[11]
          );

        const stored =
          ol2Number_(
            row.values[12]
          );

        const writtenOff =
          ol2Number_(
            row.values[13]
          );

        const currentBalance =
          ol2Number_(
            row.values[14]
          );

        const transferred =
          ol2Number_(
            row.values[27]
          );

        const expectedBalance =
          received -
          soldOrUsed -
          stored -
          writtenOff -
          transferred;

        return {
          row:
            row.row,

          lotId:
            ol2Normalize_(
              row.values[0]
            ),

          received:
            received,

          soldOrUsed:
            soldOrUsed,

          stored:
            stored,

          writtenOff:
            writtenOff,

          transferred:
            transferred,

          currentBalance:
            currentBalance,

          expectedBalance:
            expectedBalance,

          balanceOk:
            Math.abs(
              currentBalance -
              expectedBalance
            ) <= 0.000001
        };
      }
    );

  let operationKind =
    'UNKNOWN';

  if (
    directTransferRows.length ||
    id.indexOf('TRF-') === 0
  ) {
    operationKind =
      'INTERBRANCH_TRANSFER';

  } else if (
    relatedAssetRows.length ||
    type === 'Актив'
  ) {
    operationKind =
      'ASSET';

  } else if (
    type === 'Пакет'
  ) {
    operationKind =
      'PACKAGE';

  } else if (
    directStockRows.length ||
    id.indexOf('L-') === 0
  ) {
    operationKind =
      'INVENTORY_RECEIPT';

  } else if (
    type === 'Вакцина' ||
    relatedRegistryRows.length ||
    directMovements.length
  ) {
    operationKind =
      'VACCINE_OPERATION';

  } else if (
    directBaseRows.length === 1
  ) {
    operationKind =
      'SIMPLE_FINANCIAL';
  }

  const affectedSheets = [];

  if (directBaseRows.length) {
    affectedSheets.push(
      'База операцій'
    );
  }

  if (relatedStockRows.length) {
    affectedSheets.push(
      'Склад медичних запасів'
    );
  }

  if (relatedMovements.length) {
    affectedSheets.push(
      'Рух складу'
    );
  }

  if (relatedRegistryRows.length) {
    affectedSheets.push(
      'Облік вакцин'
    );
  }

  if (relatedAccrualRows.length) {
    affectedSheets.push(
      'Нарахування'
    );
  }

  if (relatedTransferRows.length) {
    affectedSheets.push(
      'Переміщення між філіями'
    );
  }

  if (relatedAssetRows.length) {
    affectedSheets.push(
      'Активи'
    );
  }

  const blockers = [];

  if (
    !directBaseRows.length &&
    !directTransferRows.length &&
    !directStockRows.length
  ) {
    blockers.push(
      'OPERATION_NOT_FOUND'
    );
  }

  if (
    directBaseRows.length > 1
  ) {
    blockers.push(
      'DUPLICATE_BASE_ID'
    );
  }

  if (
    directBaseRows.length === 1 &&
    currentStatus !== 'Проведено'
  ) {
    blockers.push(
      'CURRENT_STATUS_NOT_POSTED'
    );
  }

  if (
    stockChecks.some(
      function(check) {
        return !check.balanceOk;
      }
    )
  ) {
    blockers.push(
      'STOCK_BALANCE_MISMATCH'
    );
  }

  if (
    operationKind ===
      'INVENTORY_RECEIPT' &&
    dependentOperationIds.length
  ) {
    blockers.push(
      'DOWNSTREAM_REASSIGNMENT_REQUIRED'
    );
  }

  if (
    operationKind !==
    'SIMPLE_FINANCIAL'
  ) {
    blockers.push(
      'TYPE_HANDLER_NOT_IMPLEMENTED'
    );
  }

  const fingerprint = {
    id:
      id,

    operationKind:
      operationKind,

    base:
      directBaseRows,

    stock:
      relatedStockRows,

    movements:
      relatedMovements,

    registry:
      relatedRegistryRows,

    accruals:
      relatedAccrualRows,

    transfers:
      relatedTransferRows,

    assets:
      relatedAssetRows
  };

  return {
    ok:
      true,

    writesNow:
      false,

    operationId:
      id,

    operationKind:
      operationKind,

    baseType:
      type,

    baseCategory:
      category,

    baseArticle:
      article,

    currentStatus:
      currentStatus,

    dependencyTree: {
      baseRows:
        ol2RowNumbers_(
          directBaseRows
        ),

      stockRows:
        ol2RowNumbers_(
          relatedStockRows
        ),

      movementRows:
        ol2RowNumbers_(
          relatedMovements
        ),

      registryRows:
        ol2RowNumbers_(
          relatedRegistryRows
        ),

      accrualRows:
        ol2RowNumbers_(
          relatedAccrualRows
        ),

      transferRows:
        ol2RowNumbers_(
          relatedTransferRows
        ),

      assetRows:
        ol2RowNumbers_(
          relatedAssetRows
        ),

      lotIds:
        lotIds,

      movementIds:
        movementIds,

      dependentOperationIds:
        dependentOperationIds
    },

    stockChecks:
      stockChecks,

    allStockBalancesValid:
      stockChecks.every(
        function(check) {
          return check.balanceOk;
        }
      ),

    affectedSheets:
      affectedSheets,

    proposedActions:
      buildLifecycleProposedActionsBaburka_(
        operationKind,
        dependentOperationIds
      ),

    blockers:
      blockers,

    readyForCurrentExecution:
      operationKind ===
        'SIMPLE_FINANCIAL' &&
      blockers.length === 0,

    readyForHandlerDevelopment:
      blockers.indexOf(
        'STOCK_BALANCE_MISMATCH'
      ) === -1 &&
      blockers.indexOf(
        'OPERATION_NOT_FOUND'
      ) === -1,

    checksum:
      ol2Checksum_(
        fingerprint
      )
  };
}


/**
 * Повертає перелік дій для типу операції.
 */
function buildLifecycleProposedActionsBaburka_(
  operationKind,
  dependentIds
) {
  const actions = {
    SIMPLE_FINANCIAL: [
      'MARK_BASE_CANCELLED',
      'EXCLUDE_FROM_REPORTS',
      'WRITE_AUDIT_EVENT'
    ],

    VACCINE_OPERATION: [
      'MARK_BASE_CANCELLED',
      'CREATE_REVERSAL_STOCK_MOVEMENTS',
      'RESTORE_LOT_BALANCES',
      'MARK_VACCINE_REGISTRY_CANCELLED',
      'EXCLUDE_RELATED_ACCRUALS',
      'WRITE_AUDIT_EVENT'
    ],

    INVENTORY_RECEIPT: [
      'MARK_BASE_CANCELLED',
      'REVERSE_RECEIPT_MOVEMENT',
      'MARK_STOCK_LOT_CANCELLED',
      'RECALCULATE_STOCK_BALANCE',

      dependentIds.length
        ? 'REASSIGN_OR_CASCADE_DOWNSTREAM_OPERATIONS'
        : 'NO_DOWNSTREAM_OPERATIONS',

      'WRITE_AUDIT_EVENT'
    ],

    PACKAGE: [
      'MARK_BASE_CANCELLED',
      'CANCEL_PACKAGE_ACCRUAL_SCHEDULE'
    ],

    ASSET: [
      'MARK_BASE_CANCELLED',
      'MARK_ASSET_CANCELLED'
    ],

    INTERBRANCH_TRANSFER: [
      'BUILD_TWO_BRANCH_PLAN',
      'REVERSE_SOURCE_MOVEMENT',
      'REVERSE_DESTINATION_RECEIPT'
    ],

    UNKNOWN: [
      'MANUAL_CLASSIFICATION_REQUIRED'
    ]
  };

  return (
    actions[operationKind] ||
    actions.UNKNOWN
  );
}


/**
 * Визначає власні, дочірні, upstream,
 * peer та downstream-залежності.
 */
function attachLifecycleRelationRolesBaburka_(
  plan
) {
  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const id =
    plan.operationId;

  const kind =
    plan.operationKind;

  const stockSheet =
    ss.getSheetByName(
      'Склад медичних запасів'
    );

  const movementSheet =
    ss.getSheetByName(
      'Рух складу'
    );

  const registrySheet =
    ss.getSheetByName(
      'Облік вакцин'
    );

  const accrualSheet =
    ss.getSheetByName(
      'Нарахування'
    );

  const transferSheet =
    ss.getSheetByName(
      'Переміщення між філіями'
    );

  const stockRows =
    stockSheet
      ? ol2ReadRows_(
          stockSheet,
          3,
          28
        )
      : [];

  const movementRows =
    movementSheet
      ? ol2ReadRows_(
          movementSheet,
          2,
          12
        )
      : [];

  const registryRows =
    registrySheet
      ? ol2ReadRows_(
          registrySheet,
          2,
          15
        )
      : [];

  const accrualRows =
    accrualSheet
      ? ol2ReadRows_(
          accrualSheet,
          2,
          10
        )
      : [];

  const transferRows =
    transferSheet
      ? ol2ReadRows_(
          transferSheet,
          2,
          18
        )
      : [];

  const generatedChildIds =
    ol2Unique_(
      movementRows
        .map(function(row) {
          return ol2Normalize_(
            row.values[1]
          );
        })
        .concat(
          registryRows.map(
            function(row) {
              return ol2Normalize_(
                row.values[1]
              );
            }
          ),

          accrualRows.map(
            function(row) {
              return ol2Normalize_(
                row.values[0]
              );
            }
          )
        )
        .filter(
          function(candidateId) {
            return (
              candidateId.indexOf(
                'VST|' +
                id +
                '|'
              ) === 0
            );
          }
        )
    );

  const ownOperationIds =
    ol2Unique_(
      [id].concat(
        generatedChildIds
      )
    );

  const createdStockRows =
    ol2Where_(
      stockRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[1]
          ) === id
        );
      }
    );

  const directTransferRows =
    ol2Where_(
      transferRows,
      function(row) {
        return (
          ol2Normalize_(
            row.values[0]
          ) === id
        );
      }
    );

  const ownMovementRows =
    ol2Where_(
      movementRows,
      function(row) {
        return (
          ownOperationIds.indexOf(
            ol2Normalize_(
              row.values[1]
            )
          ) !== -1
        );
      }
    );

  let sourceLotIds =
    ol2Unique_(
      createdStockRows
        .map(function(row) {
          return ol2Normalize_(
            row.values[0]
          );
        })
        .concat(
          ownMovementRows.map(
            function(row) {
              return ol2Normalize_(
                row.values[5]
              );
            }
          )
        )
    );

  if (
    kind ===
    'INTERBRANCH_TRANSFER'
  ) {
    const localLotIds =
      ol2Unique_(
        stockRows.map(
          function(row) {
            return ol2Normalize_(
              row.values[0]
            );
          }
        )
      );

    const candidates =
      directTransferRows.reduce(
        function(result, row) {
          result.push(
            ol2Normalize_(
              row.values[4]
            )
          );

          result.push(
            ol2Normalize_(
              row.values[5]
            )
          );

          return result;
        },
        []
      );

    sourceLotIds =
      ol2Unique_(
        sourceLotIds.concat(
          candidates.filter(
            function(lotId) {
              return (
                localLotIds.indexOf(
                  lotId
                ) !== -1
              );
            }
          )
        )
      );
  }

  const sourceStockRows =
    ol2Where_(
      stockRows,
      function(row) {
        return (
          sourceLotIds.indexOf(
            ol2Normalize_(
              row.values[0]
            )
          ) !== -1
        );
      }
    );

  const upstreamOperationIds =
    ol2Unique_(
      sourceStockRows
        .map(function(row) {
          return ol2Normalize_(
            row.values[1]
          );
        })
        .filter(
          function(sourceId) {
            return (
              sourceId &&
              ownOperationIds.indexOf(
                sourceId
              ) === -1
            );
          }
        )
    );

  const sameLotMovements =
    ol2Where_(
      movementRows,
      function(row) {
        return (
          sourceLotIds.indexOf(
            ol2Normalize_(
              row.values[5]
            )
          ) !== -1
        );
      }
    );

  const otherLotOperationIds =
    ol2Unique_(
      sameLotMovements
        .map(function(row) {
          return ol2Normalize_(
            row.values[1]
          );
        })
        .filter(
          function(otherId) {
            return (
              otherId &&
              ownOperationIds.indexOf(
                otherId
              ) === -1 &&
              upstreamOperationIds.indexOf(
                otherId
              ) === -1
            );
          }
        )
    );

  let downstreamOperationIds = [];
  let peerOperationIds = [];

  if (
    kind ===
      'INVENTORY_RECEIPT' ||
    kind ===
      'INTERBRANCH_TRANSFER'
  ) {
    downstreamOperationIds =
      otherLotOperationIds;

  } else if (
    kind ===
    'VACCINE_OPERATION'
  ) {
    peerOperationIds =
      otherLotOperationIds;
  }

  function rootIds_(
    ids
  ) {
    return ol2Unique_(
      ids.map(
        function(value) {
          if (
            value.indexOf(
              'VST|'
            ) === 0
          ) {
            const parts =
              value.split('|');

            return (
              parts.length > 1
                ? parts[1]
                : value
            );
          }

          return value;
        }
      )
    );
  }

  const ownMovementIds =
    ol2Unique_(
      ownMovementRows.map(
        function(row) {
          return ol2Normalize_(
            row.values[0]
          );
        }
      )
    );

  const ownRegistryRows =
    ol2Where_(
      registryRows,
      function(row) {
        return (
          ownOperationIds.indexOf(
            ol2Normalize_(
              row.values[1]
            )
          ) !== -1 ||

          ownMovementIds.indexOf(
            ol2Normalize_(
              row.values[12]
            )
          ) !== -1
        );
      }
    );

  const ownAccrualRows =
    ol2Where_(
      accrualRows,
      function(row) {
        const accrualId =
          ol2Normalize_(
            row.values[0]
          );

        return ownOperationIds
          .some(function(ownId) {
            return (
              accrualId === ownId ||

              accrualId.indexOf(
                'VST|' +
                ownId +
                '|'
              ) === 0
            );
          });
      }
    );

  const executionScope = {
    own: {
      operationIds:
        ownOperationIds,

      baseRows:
        plan.dependencyTree
          .baseRows,

      movementRows:
        ol2RowNumbers_(
          ownMovementRows
        ),

      registryRows:
        ol2RowNumbers_(
          ownRegistryRows
        ),

      accrualRows:
        ol2RowNumbers_(
          ownAccrualRows
        ),

      transferRows:
        ol2RowNumbers_(
          directTransferRows
        )
    },

    child: {
      operationIds:
        generatedChildIds
    },

    upstream: {
      operationIds:
        upstreamOperationIds,

      lotIds:
        sourceLotIds,

      stockRows:
        ol2RowNumbers_(
          sourceStockRows
        )
    },

    peer: {
      operationIds:
        peerOperationIds,

      rootOperationIds:
        rootIds_(
          peerOperationIds
        )
    },

    downstream: {
      operationIds:
        downstreamOperationIds,

      rootOperationIds:
        rootIds_(
          downstreamOperationIds
        )
    }
  };

  plan.rawDependencyTree =
    plan.dependencyTree;

  plan.executionScope =
    executionScope;

  plan.relationChecksum =
    ol2Checksum_({
      originalPlanChecksum:
        plan.checksum,

      executionScope:
        executionScope,

      ownMovements:
        ownMovementRows,

      sourceStock:
        sourceStockRows,

      directTransfers:
        directTransferRows
    });

  return plan;
}