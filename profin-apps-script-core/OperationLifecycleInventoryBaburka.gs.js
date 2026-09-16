/**
 * ============================================================
 * OPERATION LIFECYCLE — INVENTORY RECEIPT — BABURKA
 * ============================================================
 *
 * Контрольовано скасовує складське надходження L-*:
 *
 * 1. Скасовує залежні вакцинні операції.
 * 2. Повертає використані залишки.
 * 3. Скасовує створені надходженням партії.
 * 4. Створює сторнувальні рухи.
 * 5. Записує одну каскадну подію в журнал.
 * 6. У разі помилки відновлює попередній стан.
 *
 * Міжфілійні переміщення блокуються до оформлення
 * зворотного переміщення між філіями.
 */


/**
 * БУДУЄ READ-ONLY ПЛАН КАСКАДНОГО СКАСУВАННЯ
 */
function buildInventoryReceiptCancellationPlanBaburka_(
  operationId
) {
  const id = clean_(operationId);

  const raw =
    buildOperationLifecyclePlanById_(id);

  const related =
    attachLifecycleRelationRolesBaburka_(
      raw
    ) || raw;

  const scope =
    related.executionScope || {};

  const own =
    scope.own || {};

  const upstream =
    scope.upstream || {};

  const downstream =
    scope.downstream || {};

  const blockers = [];

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheets =
    getVaccineCancellationSheetsBaburka_(
      ss
    );

  if (
    related.operationKind !==
    'INVENTORY_RECEIPT'
  ) {
    blockers.push(
      'NOT_INVENTORY_RECEIPT'
    );
  }

  if (
    !own.baseRows ||
    own.baseRows.length !== 1
  ) {
    blockers.push(
      'BASE_ROW_COUNT_INVALID'
    );
  }

  if (
    !upstream.stockRows ||
    !upstream.stockRows.length
  ) {
    blockers.push(
      'CREATED_STOCK_ROWS_NOT_FOUND'
    );
  }

  if (
    !own.movementRows ||
    !own.movementRows.length
  ) {
    blockers.push(
      'RECEIPT_MOVEMENT_NOT_FOUND'
    );
  }

  const baseRow =
    own.baseRows &&
    own.baseRows.length
      ? own.baseRows[0]
      : 0;

  const currentStatus =
    baseRow
      ? clean_(
          sheets.base
            .getRange(
              baseRow,
              30
            )
            .getDisplayValue()
        )
      : '';

  if (
    currentStatus !==
    'Проведено'
  ) {
    blockers.push(
      'BASE_STATUS_NOT_POSTED'
    );
  }

  /*
   * Кореневі downstream-операції.
   * VST-дочірні ID повторно не обробляються.
   */
  const childIds =
    uniqueVaccineCancelStringsBaburka_(
      downstream.rootOperationIds || []
    );

  const childPlans = [];

  childIds.forEach(
    function(childId) {
      const childRaw =
        buildOperationLifecyclePlanById_(
          childId
        );

      const childRelated =
        attachLifecycleRelationRolesBaburka_(
          childRaw
        ) || childRaw;

      /*
       * Міжфілійний трансфер не можна безпечно
       * скасувати лише в одній таблиці.
       */
      if (
        childRelated.operationKind ===
        'INTERBRANCH_TRANSFER'
      ) {
        blockers.push(
          'CROSS_BRANCH_TRANSFER_REQUIRES_SEPARATE_HANDLER_' +
            childId
        );

        return;
      }

      if (
        childRelated.operationKind !==
        'VACCINE_OPERATION'
      ) {
        blockers.push(
          'UNSUPPORTED_DOWNSTREAM_KIND_' +
            childId
        );

        return;
      }

      const vaccinePlan =
        buildVaccineCancellationPlanBaburka_(
          childId
        );

      if (
        vaccinePlan.blockers.length
      ) {
        blockers.push(
          'VACCINE_CHILD_BLOCKED_' +
            childId
        );

        return;
      }

      childPlans.push(
        vaccinePlan
      );
    }
  );

  /*
   * Партії, створені надходженням.
   */
  const createdStockRows =
    uniqueVaccineCancelNumbersBaburka_(
      upstream.stockRows || []
    );

  const createdLotIds =
    createdStockRows.map(
      function(rowNumber) {
        return clean_(
          sheets.stock
            .getRange(
              rowNumber,
              1
            )
            .getDisplayValue()
        );
      }
    );

  /*
   * Власні вхідні рухи надходження.
   */
  const receiptMovements =
    uniqueVaccineCancelNumbersBaburka_(
      own.movementRows || []
    ).map(
      function(rowNumber) {
        const values =
          sheets.movement
            .getRange(
              rowNumber,
              1,
              1,
              12
            )
            .getValues()[0];

        const record = {
          row: rowNumber,

          movementId:
            clean_(values[0]),

          operationId:
            clean_(values[1]),

          date:
            values[2],

          inventoryType:
            clean_(values[3]),

          inventoryName:
            clean_(values[4]),

          lotId:
            clean_(values[5]),

          movementType:
            clean_(values[6]),

          quantity:
            Number(
              values[7] || 0
            ),

          unitCost:
            Number(
              values[8] || 0
            ),

          totalCost:
            Number(
              values[9] || 0
            )
        };

        if (
          record.operationId !== id ||
          createdLotIds.indexOf(
            record.lotId
          ) === -1 ||
          !(record.quantity > 0)
        ) {
          blockers.push(
            'INVALID_RECEIPT_MOVEMENT_ROW_' +
              rowNumber
          );
        }

        return record;
      }
    );

  /*
   * Усі партії, які зміняться під час каскаду.
   * Вакцинна операція може використовувати кілька партій.
   */
  const affectedStockRows =
    uniqueVaccineCancelNumbersBaburka_(
      createdStockRows.concat(
        childPlans.reduce(
          function(rows, child) {
            return rows.concat(
              child.stockChanges.map(
                function(change) {
                  return change.row;
                }
              )
            );
          },
          []
        )
      )
    );

  /*
   * Поточний стан кожної зачепленої партії.
   */
  const stockStateByRow = {};

  affectedStockRows.forEach(
    function(rowNumber) {
      const values =
        sheets.stock
          .getRange(
            rowNumber,
            1,
            1,
            28
          )
          .getValues()[0];

      stockStateByRow[
        rowNumber
      ] = {
        row: rowNumber,

        lotId:
          clean_(values[0]),

        received:
          Number(
            values[8] || 0
          ),

        unitCost:
          Number(
            values[9] || 0
          ),

        totalCost:
          Number(
            values[10] || 0
          ),

        soldOrUsed:
          Number(
            values[11] || 0
          ),

        stored:
          Number(
            values[12] || 0
          ),

        writtenOff:
          Number(
            values[13] || 0
          ),

        currentBalance:
          Number(
            values[14] || 0
          ),

        minimumStock:
          Number(
            values[15] || 0
          ),

        status:
          clean_(values[16]),

        transferred:
          Number(
            values[27] || 0
          )
      };
    }
  );

  /*
   * Послідовно моделюємо повернення всіх
   * downstream-вакцинних операцій.
   */
  childPlans.forEach(
    function(child) {
      child.movementRecords.forEach(
        function(movement) {
          const stockRow =
            affectedStockRows.find(
              function(rowNumber) {
                return (
                  stockStateByRow[
                    rowNumber
                  ].lotId ===
                  movement.lotId
                );
              }
            );

          if (!stockRow) {
            blockers.push(
              'CHILD_LOT_NOT_FOUND_' +
                movement.lotId
            );

            return;
          }

          applyVaccineMovementReversalToStockBaburka_(
            stockStateByRow[
              stockRow
            ],
            movement
          );
        }
      );
    }
  );

  /*
   * Стан партій після скасування дочірніх операцій,
   * але до скасування самого надходження.
   */
  const childStockChanges =
    affectedStockRows.map(
      function(rowNumber) {
        const state =
          stockStateByRow[
            rowNumber
          ];

        state.status =
          resolveVaccineCancelLotStatusBaburka_(
            state.currentBalance,
            state.minimumStock
          );

        return Object.assign(
          {},
          state
        );
      }
    );

  /*
   * Створена надходженням партія може бути
   * скасована лише після повного повернення.
   */
  const receiptStockChanges =
    createdStockRows.map(
      function(rowNumber) {
        const state =
          stockStateByRow[
            rowNumber
          ];

        const fullyRestored =
          Math.abs(
            state.currentBalance -
            state.received
          ) <= 0.000001 &&

          Math.abs(
            state.soldOrUsed
          ) <= 0.000001 &&

          Math.abs(
            state.stored
          ) <= 0.000001 &&

          Math.abs(
            state.writtenOff
          ) <= 0.000001 &&

          Math.abs(
            state.transferred
          ) <= 0.000001;

        if (!fullyRestored) {
          blockers.push(
            'LOT_NOT_FULLY_RESTORED_' +
              state.lotId
          );
        }

        return {
          row:
            rowNumber,

          lotId:
            state.lotId,

          beforeReceiptCancellation:
            Object.assign(
              {},
              state
            ),

          after: {
            received: 0,
            totalCost: 0,
            soldOrUsed: 0,
            stored: 0,
            writtenOff: 0,
            currentBalance: 0,
            transferred: 0,
            status:
              'Скасовано'
          },

          fullyRestored:
            fullyRestored
        };
      }
    );

  const uniqueBlockers =
    uniqueVaccineCancelStringsBaburka_(
      blockers
    );

  const checksumPayload = {
    operationId:
      id,

    relationChecksum:
      related.relationChecksum,

    baseRow:
      baseRow,

    currentStatus:
      currentStatus,

    childPlans:
      childPlans.map(
        function(child) {
          return {
            operationId:
              child.operationId,

            checksum:
              child.checksum
          };
        }
      ),

    receiptMovements:
      receiptMovements,

    childStockChanges:
      childStockChanges,

    receiptStockChanges:
      receiptStockChanges,

    blockers:
      uniqueBlockers
  };

  return {
    ok:
      uniqueBlockers.length === 0,

    writesNow:
      false,

    operationId:
      id,

    operationKind:
      related.operationKind,

    baseRow:
      baseRow,

    currentStatus:
      currentStatus,

    childOperationIds:
      childPlans.map(
        function(child) {
          return child.operationId;
        }
      ),

    childPlans:
      childPlans,

    receiptMovements:
      receiptMovements,

    childStockChanges:
      childStockChanges,

    receiptStockChanges:
      receiptStockChanges,

    blockers:
      uniqueBlockers,

    checksum:
      hashVaccineLifecycleBaburka_(
        checksumPayload
      )
  };
}
/**
 * ВИКОНАННЯ КАСКАДНОГО СКАСУВАННЯ
 */
function executeInventoryReceiptCancellationBaburka_(
  operationId,
  expectedChecksum
) {
  const lock =
    LockService.getDocumentLock();

  if (!lock.tryLock(30000)) {
    throw new Error(
      'Документ зараз змінює інший користувач.'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheets =
    getVaccineCancellationSheetsBaburka_(
      ss
    );

  let plan = null;
  let snapshot = null;
  let movementStartRow = 0;
  let reversalCount = 0;
  let auditRow = 0;

  try {
    plan =
      buildInventoryReceiptCancellationPlanBaburka_(
        operationId
      );

    if (
      plan.blockers.length
    ) {
      throw new Error(
        'Скасування заблоковано: ' +
        plan.blockers.join(', ')
      );
    }

    if (
      !expectedChecksum ||
      plan.checksum !==
        expectedChecksum
    ) {
      throw new Error(
        'Дані змінилися після preview. ' +
        'Відкрийте скасування повторно.'
      );
    }

    /*
     * Рядки Бази, статус яких зміниться.
     */
    const baseRows =
      uniqueVaccineCancelNumbersBaburka_(
        [plan.baseRow].concat(
          plan.childPlans.map(
            function(child) {
              return (
                child.baseChange.row
              );
            }
          )
        )
      );

    /*
     * Рядки реєстру вакцин.
     */
    const registryRows =
      uniqueVaccineCancelNumbersBaburka_(
        plan.childPlans.reduce(
          function(rows, child) {
            return rows.concat(
              child.registryChanges.map(
                function(change) {
                  return change.row;
                }
              )
            );
          },
          []
        )
      );

    /*
     * Рядки складських партій.
     */
    const stockRows =
      uniqueVaccineCancelNumbersBaburka_(
        plan.childStockChanges.map(
          function(change) {
            return change.row;
          }
        )
      );

    /*
     * Знімок усіх значень для rollback.
     */
    snapshot = {
      base:
        baseRows.map(
          function(rowNumber) {
            return {
              row:
                rowNumber,

              value:
                sheets.base
                  .getRange(
                    rowNumber,
                    30
                  )
                  .getValue()
            };
          }
        ),

      registry:
        registryRows.map(
          function(rowNumber) {
            return {
              row:
                rowNumber,

              values:
                sheets.registry
                  .getRange(
                    rowNumber,
                    6,
                    1,
                    4
                  )
                  .getValues()[0]
            };
          }
        ),

      stock:
        stockRows.map(
          function(rowNumber) {
            return {
              row:
                rowNumber,

              values:
                sheets.stock
                  .getRange(
                    rowNumber,
                    9,
                    1,
                    9
                  )
                  .getValues()[0],

              transferred:
                sheets.stock
                  .getRange(
                    rowNumber,
                    28
                  )
                  .getValue()
            };
          }
        )
    };

    const eventId =
      'EVT-CANCEL-RECEIPT-' +

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

    ensureOperationCorrectionAuditSchemaBaburka_(
      sheets.audit
    );

    auditRow =
      sheets.audit.getLastRow() + 1;

    sheets.audit
      .getRange(
        auditRow,
        1,
        1,
        15
      )
      .setValues([[
        eventId,
        new Date(),
        getVaccineCancelUserBaburka_(),
        'CANCEL_INVENTORY_RECEIPT_CASCADE',
        plan.operationId,
        'База операцій + склад + вакцини + нарахування',
        plan.baseRow,
        'Проведено',
        'Скасовано',
        plan.checksum,
        'PREPARED',
        '',

        JSON.stringify({
          childOperationIds:
            plan.childOperationIds
        }),

        JSON.stringify({
          cancelledLots:
            plan.receiptStockChanges.map(
              function(item) {
                return item.lotId;
              }
            )
        }),

        'Каскадне скасування складського надходження'
      ]]);

    /*
     * Скасовуємо залежні вакцинні операції.
     */
    plan.childPlans.forEach(
      function(child) {
        sheets.base
          .getRange(
            child.baseChange.row,
            30
          )
          .setValue(
            'Скасовано'
          );

        child.registryChanges.forEach(
          function(change) {
            const range =
              sheets.registry
                .getRange(
                  change.row,
                  6,
                  1,
                  4
                );

            const values =
              range.getValues()[0];

            values[0] =
              'Скасовано';

            const note =
              clean_(values[3]);

            const cancelNote =
              'Скасовано каскадом ' +
              plan.operationId;

            values[3] =
              note.indexOf(
                cancelNote
              ) === -1
                ? (
                    note
                      ? note + ' | '
                      : ''
                  ) +
                  cancelNote
                : note;

            range.setValues([
              values
            ]);
          }
        );
      }
    );

    /*
     * Відновлюємо склад після скасування
     * дочірніх вакцинних операцій.
     */
    plan.childStockChanges.forEach(
      function(change) {
        sheets.stock
          .getRange(
            change.row,
            12,
            1,
            6
          )
          .setValues([[
            change.soldOrUsed,
            change.stored,
            change.writtenOff,
            change.currentBalance,
            change.minimumStock,
            change.status
          ]]);
      }
    );

    /*
     * Скасовуємо партії, створені надходженням.
     *
     * I — прийнято;
     * K — загальна закупівельна вартість;
     * L:N — використано/зберігання/списано;
     * O — залишок;
     * Q — статус;
     * AB — передано.
     */
    plan.receiptStockChanges.forEach(
      function(change) {
        const range =
          sheets.stock.getRange(
            change.row,
            9,
            1,
            9
          );

        const values =
          range.getValues()[0];

        values[0] = 0;
        values[2] = 0;
        values[3] = 0;
        values[4] = 0;
        values[5] = 0;
        values[6] = 0;
        values[8] = 'Скасовано';

        range.setValues([
          values
        ]);

        sheets.stock
          .getRange(
            change.row,
            28
          )
          .setValue(0);
      }
    );

    /*
     * Скасовуємо основне надходження.
     */
    sheets.base
      .getRange(
        plan.baseRow,
        30
      )
      .setValue(
        'Скасовано'
      );

    /*
     * Формуємо сторнувальні рухи:
     * - рухи залежних вакцин;
     * - вхідний рух надходження.
     */
    const reversalSources = [];

    plan.childPlans.forEach(
      function(child) {
        child.movementRecords.forEach(
          function(item) {
            reversalSources.push(
              item
            );
          }
        );
      }
    );

    plan.receiptMovements.forEach(
      function(item) {
        reversalSources.push(
          item
        );
      }
    );

    const reversalRows =
      reversalSources.map(
        function(item, index) {
          return [
            'REV|' +
              eventId +
              '|' +
              (index + 1),

            item.operationId,
            new Date(),
            item.inventoryType,
            item.inventoryName,
            item.lotId,
            item.movementType,

            -Math.abs(
              item.quantity
            ),

            item.unitCost,

            -Math.abs(
              item.totalCost
            ),

            getVaccineCancelUserBaburka_(),
            new Date()
          ];
        }
      );

    movementStartRow =
      sheets.movement.getLastRow() + 1;

    reversalCount =
      reversalRows.length;

    if (reversalCount) {
      sheets.movement
        .getRange(
          movementStartRow,
          1,
          reversalCount,
          12
        )
        .setValues(
          reversalRows
        );
    }

    SpreadsheetApp.flush();

    /*
     * Фінальна перевірка статусів Бази.
     */
    snapshot.base.forEach(
      function(item) {
        const mustBeCancelled =
          item.row ===
            plan.baseRow ||

          plan.childPlans.some(
            function(child) {
              return (
                child.baseChange.row ===
                item.row
              );
            }
          );

        const expected =
          mustBeCancelled
            ? 'Скасовано'
            : clean_(item.value);

        const actual =
          clean_(
            sheets.base
              .getRange(
                item.row,
                30
              )
              .getDisplayValue()
          );

        if (
          actual !== expected
        ) {
          throw new Error(
            'BASE_VERIFY_FAILED_' +
              item.row
          );
        }
      }
    );

    /*
     * Фінальна перевірка скасованих партій.
     */
    plan.receiptStockChanges.forEach(
      function(change) {
        const values =
          sheets.stock
            .getRange(
              change.row,
              9,
              1,
              9
            )
            .getValues()[0];

        if (
          Math.abs(
            Number(
              values[0] || 0
            )
          ) > 0.000001 ||

          Math.abs(
            Number(
              values[6] || 0
            )
          ) > 0.000001 ||

          clean_(values[8]) !==
            'Скасовано'
        ) {
          throw new Error(
            'RECEIPT_STOCK_VERIFY_FAILED_' +
              change.lotId
          );
        }
      }
    );

    sheets.audit
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
        plan.operationId,

      eventId:
        eventId,

      cancelledChildOperationIds:
        plan.childOperationIds,

      cancelledLotIds:
        plan.receiptStockChanges.map(
          function(item) {
            return item.lotId;
          }
        ),

      reversalMovementRows:
        reversalRows.map(
          function(
            unused,
            index
          ) {
            return (
              movementStartRow +
              index
            );
          }
        ),

      auditRow:
        auditRow,

      auditResult:
        'COMPLETED'
    };

  } catch (error) {
    let rollbackCompleted = false;

    try {
      if (snapshot) {
        /*
         * Повертаємо складські значення.
         */
        snapshot.stock.forEach(
          function(item) {
            sheets.stock
              .getRange(
                item.row,
                9,
                1,
                9
              )
              .setValues([
                item.values
              ]);

            sheets.stock
              .getRange(
                item.row,
                28
              )
              .setValue(
                item.transferred
              );
          }
        );

        /*
         * Повертаємо реєстр вакцин.
         */
        snapshot.registry.forEach(
          function(item) {
            sheets.registry
              .getRange(
                item.row,
                6,
                1,
                4
              )
              .setValues([
                item.values
              ]);
          }
        );

        /*
         * Повертаємо статуси Бази.
         */
        snapshot.base.forEach(
          function(item) {
            sheets.base
              .getRange(
                item.row,
                30
              )
              .setValue(
                item.value
              );
          }
        );

        /*
         * Очищаємо створені сторнувальні рухи.
         */
        if (
          movementStartRow &&
          reversalCount
        ) {
          sheets.movement
            .getRange(
              movementStartRow,
              1,
              reversalCount,
              12
            )
            .clearContent();
        }

        SpreadsheetApp.flush();

        rollbackCompleted = true;
      }

    } catch (rollbackError) {
      rollbackCompleted = false;

      console.error(
        rollbackError
      );
    }

    if (auditRow) {
      sheets.audit
        .getRange(
          auditRow,
          11
        )
        .setValue(
          rollbackCompleted
            ? 'FAILED_ROLLED_BACK'
            : 'FAILED_ROLLBACK_REQUIRED'
        );
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
 * UI-ОБРОБНИК ДЛЯ МЕНЮ
 */
function handleControlledInventoryReceiptCancellationBaburka_(
  operationId,
  details
) {
  const ui =
    SpreadsheetApp.getUi();

  const plan =
    buildInventoryReceiptCancellationPlanBaburka_(
      operationId
    );

  /*
   * Окремо обробляємо блокування через
   * міжфілійне переміщення.
   */
  const transferBlockers =
    plan.blockers.filter(
      function(blocker) {
        return (
          blocker.indexOf(
            'CROSS_BRANCH_TRANSFER_REQUIRES_SEPARATE_HANDLER_'
          ) === 0
        );
      }
    );

  if (transferBlockers.length) {
    const transferIds =
      transferBlockers.map(
        function(blocker) {
          return (
            '• ' +
            blocker.replace(
              'CROSS_BRANCH_TRANSFER_REQUIRES_SEPARATE_HANDLER_',
              ''
            )
          );
        }
      );

    ui.alert(
      'Спочатку поверніть товар',

      'Скасування надходження ' +
        operationId +
        ' зараз неможливе.\n\n' +

        'З цієї партії виконано міжфілійне переміщення:\n' +
        transferIds.join('\n') +

        '\n\nСпочатку оформіть і прийміть зворотне переміщення. ' +
        'Після повернення товару повторіть скасування надходження.',

      ui.ButtonSet.OK
    );

    return {
      ok: false,
      writesNow: false,
      operationId: operationId,
      cancellationBlocked: true,
      returnTransferRequired: true
    };
  }

  if (plan.blockers.length) {
    throw new Error(
      'Скасування складського надходження заблоковано:\n' +
      plan.blockers.join('\n')
    );
  }

  const lotLines =
    plan.receiptStockChanges.map(
      function(change) {
        return (
          '• ' +
          change.lotId +
          ': ' +
          change
            .beforeReceiptCancellation
            .currentBalance +
          ' → 0'
        );
      }
    );

  const childLines =
    plan.childOperationIds.length
      ? plan.childOperationIds.map(
          function(id) {
            return '• ' + id;
          }
        )
      : [
          '• залежних операцій немає'
        ];

  const confirmation =
    ui.alert(
      'Каскадне скасування надходження',

      [
        'Підтвердити каскадне скасування?',
        '',

        'ID надходження: ' +
          operationId,

        'Стаття: ' +
          (
            details.article ||
            'не вказано'
          ),

        'Сума: ' +
          (
            details.amount ||
            '0'
          ),

        '',
        'Спочатку будуть скасовані операції:',

        childLines.join('\n'),

        '',
        'Після повернення залишків будуть скасовані партії:',

        lotLines.join('\n'),

        '',
        'Рядки фізично не видаляються.',
        'Дія записується в журнал.'
      ].join('\n'),

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
    executeInventoryReceiptCancellationBaburka_(
      operationId,
      plan.checksum
    );

  /*
   * Після відновлення ManualDeletionGuard
   * його резервна копія також оновиться.
   */
  if (
    typeof refreshDeletionGuardAfterSystemWriteBaburka_ ===
    'function'
  ) {
    refreshDeletionGuardAfterSystemWriteBaburka_();
  }

  ui.alert(
    'Складське надходження скасовано',

    'ID: ' +
      operationId +
      '\n' +

      'Скасовано залежних операцій: ' +
      result
        .cancelledChildOperationIds
        .length +
      '\n' +

      'Скасовано партій: ' +
      result
        .cancelledLotIds
        .length +
      '\n' +

      'Подія журналу: ' +
      result.eventId,

    ui.ButtonSet.OK
  );

  return result;
}