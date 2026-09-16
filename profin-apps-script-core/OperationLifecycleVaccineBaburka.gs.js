/**
 * ============================================================
 * КОНТРОЛЬОВАНЕ СКАСУВАННЯ ВАКЦИН — БАБУРКА
 * ============================================================
 *
 * Не видаляє рядки фізично:
 * - змінює статус операції на «Скасовано»;
 * - скасовує лише її записи в «Облік вакцин»;
 * - створює сторнувальні складські рухи;
 * - повертає залишки партій;
 * - не змінює upstream та peer-операції;
 * - записує подію в журнал;
 * - автоматично відкочує зміни при помилці.
 *
 * Залежності:
 * - buildOperationLifecyclePlanById_()
 * - attachLifecycleRelationRolesBaburka_()
 * - clean_()
 */

const VACCINE_CANCEL_CONFIG_BABURKA = {
  baseSheet: 'База операцій',
  stockSheet: 'Склад медичних запасів',
  movementSheet: 'Рух складу',
  registrySheet: 'Облік вакцин',
  accrualSheet: 'Нарахування',
  auditSheet: 'Журнал життєвого циклу',

  postedStatus: 'Проведено',
  cancelledStatus: 'Скасовано',

  tolerance: 0.000001
};


/**
 * ЄДИНИЙ КРИТИЧНИЙ DRY-RUN.
 *
 * Нічого не записує.
 */
function previewVaccineCancellationStep4Baburka() {
  const operationId = 'VAC-20260811-271';

  const plan =
    buildVaccineCancellationPlanBaburka_(
      operationId
    );

  const result = {
    ok:
      plan.blockers.length === 0,

    test:
      'previewVaccineCancellationStep4Baburka',

    writesNow:
      false,

    operationId:
      operationId,

    operationKind:
      plan.operationKind,

    currentStatus:
      plan.currentStatus,

    ownOperationIds:
      plan.ownOperationIds,

    untouchedUpstreamOperationIds:
      plan.untouchedUpstreamOperationIds,

    untouchedPeerOperationIds:
      plan.untouchedPeerOperationIds,

    baseChange:
      plan.baseChange,

    registryChanges:
      plan.registryChanges,

    stockChanges:
      plan.stockChanges,

    reversalMovements:
      plan.reversalMovements,

    excludedAccrualRows:
      plan.excludedAccrualRows,

    blockers:
      plan.blockers,

    checksum:
      plan.checksum,

    readyForExecution:
      plan.blockers.length === 0
  };

  console.log(
    'OL4_VACCINE_CANCEL_PLAN: ' +
    JSON.stringify(result)
  );

  return result;
}


/**
 * ФОРМУЄ ПЛАН СКАСУВАННЯ ВАКЦИНИ.
 *
 * Нічого не змінює.
 */
function buildVaccineCancellationPlanBaburka_(
  operationId
) {
  const id =
    clean_(operationId);

  if (!id) {
    throw new Error(
      'ID операції не передано.'
    );
  }

  const universalPlan =
    buildOperationLifecyclePlanById_(
      id
    );

  const relationPlan =
    attachLifecycleRelationRolesBaburka_(
      universalPlan
    ) || universalPlan;

  const scope =
    relationPlan.executionScope || {};

  const own =
    scope.own || {};

  const upstream =
    scope.upstream || {};

  const peer =
    scope.peer || {};

  const blockers = [];

  if (
    relationPlan.operationKind !==
    'VACCINE_OPERATION'
  ) {
    blockers.push(
      'NOT_VACCINE_OPERATION'
    );
  }

  if (
    !Array.isArray(own.baseRows) ||
    own.baseRows.length !== 1
  ) {
    blockers.push(
      'BASE_ROW_COUNT_INVALID'
    );
  }

  const ss =
    SpreadsheetApp.getActiveSpreadsheet();

  const sheets =
    getVaccineCancellationSheetsBaburka_(
      ss
    );

  const baseRow =
    own.baseRows &&
    own.baseRows.length
      ? own.baseRows[0]
      : 0;

  const currentStatus =
    baseRow
      ? clean_(
          sheets.base
            .getRange(baseRow, 30)
            .getDisplayValue()
        )
      : '';

  if (
    currentStatus !==
    VACCINE_CANCEL_CONFIG_BABURKA
      .postedStatus
  ) {
    blockers.push(
      'BASE_STATUS_NOT_POSTED'
    );
  }

  const movementRows =
    uniqueVaccineCancelNumbersBaburka_(
      own.movementRows || []
    );

  if (!movementRows.length) {
    blockers.push(
      'OWN_MOVEMENTS_NOT_FOUND'
    );
  }

  const movementRecords =
    movementRows.map(
      function(row) {
        const raw =
          sheets.movement
            .getRange(
              row,
              1,
              1,
              12
            )
            .getValues()[0];

        const movementId =
          clean_(raw[0]);

        const movementOperationId =
          clean_(raw[1]);

        const movementType =
          clean_(raw[6]);

        const lotId =
          clean_(raw[5]);

        const quantity =
          vaccineCancelNumberBaburka_(
            raw[7]
          );

        const totalCost =
          vaccineCancelNumberBaburka_(
            raw[9]
          );

        if (
          !movementId ||
          !movementOperationId ||
          !lotId ||
          quantity <= 0
        ) {
          blockers.push(
            'INVALID_MOVEMENT_ROW_' +
            row
          );
        }

        if (
          movementId.indexOf('REV|') === 0
        ) {
          blockers.push(
            'REVERSAL_ALREADY_PRESENT'
          );
        }

        if (
          !isSupportedVaccineCancelMovementBaburka_(
            movementType
          )
        ) {
          blockers.push(
            'UNSUPPORTED_MOVEMENT_TYPE_' +
            movementType
          );
        }

        return {
          row:
            row,

          movementId:
            movementId,

          operationId:
            movementOperationId,

          date:
            raw[2],

          inventoryType:
            clean_(raw[3]),

          inventoryName:
            clean_(raw[4]),

          lotId:
            lotId,

          movementType:
            movementType,

          quantity:
            quantity,

          unitCost:
            vaccineCancelNumberBaburka_(
              raw[8]
            ),

          totalCost:
            totalCost
        };
      }
    );

  /*
   * Поточний стан складських партій.
   */
  const stockByLot = {};

  uniqueVaccineCancelNumbersBaburka_(
    upstream.stockRows || []
  ).forEach(
    function(row) {
      const raw =
        sheets.stock
          .getRange(
            row,
            1,
            1,
            28
          )
          .getValues()[0];

      const lotId =
        clean_(raw[0]);

      if (!lotId) {
        return;
      }

      stockByLot[lotId] = {
        row:
          row,

        lotId:
          lotId,

        received:
          vaccineCancelNumberBaburka_(
            raw[8]
          ),

        soldOrUsed:
          vaccineCancelNumberBaburka_(
            raw[11]
          ),

        stored:
          vaccineCancelNumberBaburka_(
            raw[12]
          ),

        writtenOff:
          vaccineCancelNumberBaburka_(
            raw[13]
          ),

        currentBalance:
          vaccineCancelNumberBaburka_(
            raw[14]
          ),

        minimumStock:
          vaccineCancelNumberBaburka_(
            raw[15]
          ),

        currentStatus:
          clean_(raw[16]),

        transferred:
          vaccineCancelNumberBaburka_(
            raw[27]
          )
      };
    }
  );

  movementRecords.forEach(
    function(movement) {
      if (
        !stockByLot[movement.lotId]
      ) {
        blockers.push(
          'STOCK_LOT_NOT_FOUND_' +
          movement.lotId
        );
      }
    }
  );

  /*
   * Розраховуємо стан партій після скасування.
   */
  const stockAfterByLot = {};

  Object.keys(
    stockByLot
  ).forEach(
    function(lotId) {
      stockAfterByLot[lotId] =
        Object.assign(
          {},
          stockByLot[lotId]
        );
    }
  );

  movementRecords.forEach(
    function(movement) {
      const state =
        stockAfterByLot[
          movement.lotId
        ];

      if (!state) {
        return;
      }

      applyVaccineMovementReversalToStockBaburka_(
        state,
        movement
      );
    }
  );

  const stockChanges =
    Object.keys(
      stockAfterByLot
    ).map(
      function(lotId) {
        const before =
          stockByLot[lotId];

        const after =
          stockAfterByLot[lotId];

        after.status =
          resolveVaccineCancelLotStatusBaburka_(
            after.currentBalance,
            after.minimumStock
          );

        const expectedBalance =
          after.received -
          after.soldOrUsed -
          after.stored -
          after.writtenOff -
          after.transferred;

        const counters = [
          after.soldOrUsed,
          after.stored,
          after.writtenOff,
          after.currentBalance,
          expectedBalance
        ];

        if (
          counters.some(
            function(value) {
              return (
                value <
                -VACCINE_CANCEL_CONFIG_BABURKA
                  .tolerance
              );
            }
          )
        ) {
          blockers.push(
            'NEGATIVE_STOCK_AFTER_' +
            lotId
          );
        }

        if (
          Math.abs(
            after.currentBalance -
            expectedBalance
          ) >
          VACCINE_CANCEL_CONFIG_BABURKA
            .tolerance
        ) {
          blockers.push(
            'STOCK_EQUATION_FAILED_' +
            lotId
          );
        }

        return {
          row:
            before.row,

          lotId:
            lotId,

          before: {
            soldOrUsed:
              before.soldOrUsed,

            stored:
              before.stored,

            writtenOff:
              before.writtenOff,

            currentBalance:
              before.currentBalance,

            status:
              before.currentStatus
          },

          after: {
            soldOrUsed:
              after.soldOrUsed,

            stored:
              after.stored,

            writtenOff:
              after.writtenOff,

            currentBalance:
              after.currentBalance,

            status:
              after.status
          },

          expectedBalance:
            expectedBalance,

          balanceOk:
            Math.abs(
              after.currentBalance -
              expectedBalance
            ) <=
            VACCINE_CANCEL_CONFIG_BABURKA
              .tolerance
        };
      }
    );

  /*
   * Записи реєстру вакцин.
   */
  const registryRows =
    uniqueVaccineCancelNumbersBaburka_(
      own.registryRows || []
    );

  const registryChanges =
    registryRows.map(
      function(row) {
        const values =
          sheets.registry
            .getRange(
              row,
              1,
              1,
              9
            )
            .getDisplayValues()[0];

        const saleId =
          clean_(values[1]);

        if (saleId !== id) {
          blockers.push(
            'FOREIGN_REGISTRY_ROW_' +
            row
          );
        }

        return {
          row:
            row,

          vaccineId:
            clean_(values[0]),

          saleId:
            saleId,

          before:
            clean_(values[5]),

          after:
            VACCINE_CANCEL_CONFIG_BABURKA
              .cancelledStatus
        };
      }
    );

  if (!registryChanges.length) {
    blockers.push(
      'OWN_REGISTRY_ROWS_NOT_FOUND'
    );
  }

  /*
   * Нарахування не видаляються.
   * P&L має виключити їх через статус базової операції.
   */
  const excludedAccrualRows =
    uniqueVaccineCancelNumbersBaburka_(
      own.accrualRows || []
    );

  excludedAccrualRows.forEach(
    function(row) {
      const accrualOperationId =
        clean_(
          sheets.accrual
            .getRange(row, 1)
            .getDisplayValue()
        );

      if (
        accrualOperationId !== id
      ) {
        blockers.push(
          'FOREIGN_ACCRUAL_ROW_' +
          row
        );
      }
    }
  );

  /*
   * Сторнувальні рухи.
   *
   * Тип руху залишається тим самим,
   * але кількість і сума від’ємні.
   */
  const reversalMovements =
    movementRecords.map(
      function(item) {
        return {
          originalRow:
            item.row,

          originalMovementId:
            item.movementId,

          operationId:
            item.operationId,

          lotId:
            item.lotId,

          movementType:
            item.movementType,

          quantity:
            -Math.abs(
              item.quantity
            ),

          totalCost:
            -Math.abs(
              item.totalCost
            )
        };
      }
    );

  const checksumPayload = {
    operationId:
      id,

    operationKind:
      relationPlan.operationKind,

    relationChecksum:
      relationPlan.relationChecksum || '',

    currentStatus:
      currentStatus,

    movementRecords:
      movementRecords,

    stockChanges:
      stockChanges,

    registryChanges:
      registryChanges,

    excludedAccrualRows:
      excludedAccrualRows,

    blockers:
      uniqueVaccineCancelStringsBaburka_(
        blockers
      )
  };

  return {
    ok:
      true,

    writesNow:
      false,

    operationId:
      id,

    operationKind:
      relationPlan.operationKind,

    currentStatus:
      currentStatus,

    baseChange: {
      row:
        baseRow,

      statusCell:
        baseRow
          ? 'AD' + baseRow
          : '',

      before:
        currentStatus,

      after:
        VACCINE_CANCEL_CONFIG_BABURKA
          .cancelledStatus
    },

    ownOperationIds:
      own.operationIds || [],

    untouchedUpstreamOperationIds:
      upstream.operationIds || [],

    untouchedPeerOperationIds:
      peer.rootOperationIds ||
      peer.operationIds ||
      [],

    movementRecords:
      movementRecords,

    registryChanges:
      registryChanges,

    stockChanges:
      stockChanges,

    reversalMovements:
      reversalMovements,

    excludedAccrualRows:
      excludedAccrualRows,

    blockers:
      uniqueVaccineCancelStringsBaburka_(
        blockers
      ),

    checksum:
      hashVaccineLifecycleBaburka_(
        checksumPayload
      )
  };
}
/**
 * ВИРОБНИЧИЙ ВИКОНАВЕЦЬ.
 *
 * Не запускати вручну.
 * Викликається з контрольованого меню
 * після підтвердження користувача.
 */
function executeVaccineCancellationBaburka_(
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

  let auditRow = 0;
  let eventId = '';
  let snapshot = null;
  let reversalStartRow = 0;

  try {
    /*
     * Повторна перевірка безпосередньо перед записом.
     */
    const plan =
      buildVaccineCancellationPlanBaburka_(
        operationId
      );

    if (plan.blockers.length) {
      throw new Error(
        'Скасування заблоковано: ' +
        plan.blockers.join(', ')
      );
    }

    if (
      !expectedChecksum ||
      plan.checksum !== expectedChecksum
    ) {
      throw new Error(
        'Дані змінилися після preview. ' +
        'Потрібен новий план.'
      );
    }

    eventId =
      buildVaccineCancelEventIdBaburka_();

    snapshot =
      snapshotVaccineCancellationBaburka_(
        sheets,
        plan
      );

    auditRow =
      sheets.audit.getLastRow() + 1;

    /*
     * PREPARED-подія журналу.
     */
    sheets.audit
      .getRange(
        auditRow,
        1,
        1,
        12
      )
      .setValues([[
        eventId,
        new Date(),
        getVaccineCancelUserBaburka_(),
        'CANCEL_VACCINE',
        plan.operationId,
        'База операцій + склад + вакцини',
        plan.baseChange.row,
        plan.baseChange.before,
        plan.baseChange.after,
        plan.checksum,
        'PREPARED',
        ''
      ]]);

    /*
     * 1. Скасовуємо базову операцію.
     */
    sheets.base
      .getRange(
        plan.baseChange.row,
        30
      )
      .setValue(
        VACCINE_CANCEL_CONFIG_BABURKA
          .cancelledStatus
      );

    /*
     * 2. Скасовуємо власні одиниці вакцин.
     */
    plan.registryChanges.forEach(
      function(change) {
        const range =
          sheets.registry.getRange(
            change.row,
            6,
            1,
            4
          );

        const values =
          range.getValues()[0];

        values[0] =
          VACCINE_CANCEL_CONFIG_BABURKA
            .cancelledStatus;

        const currentComment =
          clean_(values[3]);

        const cancellationNote =
          'Скасовано з операцією ' +
          plan.operationId;

        if (
          currentComment.indexOf(
            cancellationNote
          ) === -1
        ) {
          values[3] =
            (
              currentComment
                ? currentComment + ' | '
                : ''
            ) +
            cancellationNote;
        }

        range.setValues([
          values
        ]);
      }
    );

    /*
     * 3. Відновлюємо складські лічильники.
     */
    plan.stockChanges.forEach(
      function(change) {
        const minimumStock =
          sheets.stock
            .getRange(
              change.row,
              16
            )
            .getValue();

        sheets.stock
          .getRange(
            change.row,
            12,
            1,
            6
          )
          .setValues([[
            change.after.soldOrUsed,
            change.after.stored,
            change.after.writtenOff,
            change.after.currentBalance,
            minimumStock,
            change.after.status
          ]]);
      }
    );

    /*
     * 4. Додаємо сторнувальні рухи.
     */
    reversalStartRow =
      sheets.movement.getLastRow() + 1;

    const userEmail =
      getVaccineCancelUserBaburka_();

    const reversalRows =
      plan.movementRecords.map(
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

            userEmail,
            new Date()
          ];
        }
      );

    sheets.movement
      .getRange(
        reversalStartRow,
        1,
        reversalRows.length,
        12
      )
      .setValues(
        reversalRows
      );

    SpreadsheetApp.flush();

    /*
     * 5. Фінальна технічна перевірка.
     */
    verifyVaccineCancellationBaburka_(
      sheets,
      plan,
      reversalStartRow
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
      ok:
        true,

      writesNow:
        true,

      operationId:
        plan.operationId,

      eventId:
        eventId,

      baseRow:
        plan.baseChange.row,

      stockRows:
        plan.stockChanges.map(
          function(item) {
            return item.row;
          }
        ),

      registryRows:
        plan.registryChanges.map(
          function(item) {
            return item.row;
          }
        ),

      reversalMovementRows:
        reversalRows.map(
          function(_, index) {
            return (
              reversalStartRow +
              index
            );
          }
        ),

      excludedAccrualRows:
        plan.excludedAccrualRows,

      untouchedUpstreamOperationIds:
        plan.untouchedUpstreamOperationIds,

      untouchedPeerOperationIds:
        plan.untouchedPeerOperationIds,

      auditRow:
        auditRow,

      auditResult:
        'COMPLETED'
    };

  } catch (error) {
    let rollbackCompleted =
      false;

    try {
      if (snapshot) {
        restoreVaccineCancellationSnapshotBaburka_(
          sheets,
          snapshot,
          reversalStartRow
        );

        rollbackCompleted =
          true;
      }

    } catch (rollbackError) {
      rollbackCompleted =
        false;
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
        error && error.message
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
 * ЗАСТОСОВУЄ ЗВОРОТНУ ДІЮ РУХУ
 * ДО РОЗРАХУНКОВОГО СТАНУ ПАРТІЇ.
 */
function applyVaccineMovementReversalToStockBaburka_(
  state,
  movement
) {
  const quantity =
    Math.abs(
      movement.quantity
    );

  if (
    movement.movementType ===
    'Продаж і використання'
  ) {
    state.soldOrUsed -=
      quantity;

    state.currentBalance +=
      quantity;

    return;
  }

  if (
    movement.movementType ===
    'Передано на зберігання'
  ) {
    state.stored -=
      quantity;

    state.currentBalance +=
      quantity;

    return;
  }

  if (
    movement.movementType ===
    'Використання зі зберігання'
  ) {
    state.soldOrUsed -=
      quantity;

    state.stored +=
      quantity;

    return;
  }

  if (
    movement.movementType ===
    'Списання зі зберігання'
  ) {
    state.writtenOff -=
      quantity;

    state.stored +=
      quantity;

    return;
  }

  if (
    movement.movementType ===
    'Списання'
  ) {
    state.writtenOff -=
      quantity;

    state.currentBalance +=
      quantity;
  }
}


/**
 * ДОЗВОЛЕНІ ТИПИ СКЛАДСЬКИХ РУХІВ.
 */
function isSupportedVaccineCancelMovementBaburka_(
  movementType
) {
  return [
    'Продаж і використання',
    'Передано на зберігання',
    'Використання зі зберігання',
    'Списання зі зберігання',
    'Списання'
  ].indexOf(
    clean_(movementType)
  ) !== -1;
}


/**
 * ОТРИМУЄ ОБОВ’ЯЗКОВІ ЛИСТИ.
 */
function getVaccineCancellationSheetsBaburka_(
  ss
) {
  const config =
    VACCINE_CANCEL_CONFIG_BABURKA;

  const result = {
    base:
      ss.getSheetByName(
        config.baseSheet
      ),

    stock:
      ss.getSheetByName(
        config.stockSheet
      ),

    movement:
      ss.getSheetByName(
        config.movementSheet
      ),

    registry:
      ss.getSheetByName(
        config.registrySheet
      ),

    accrual:
      ss.getSheetByName(
        config.accrualSheet
      ),

    audit:
      ss.getSheetByName(
        config.auditSheet
      )
  };

  Object.keys(
    result
  ).forEach(
    function(key) {
      if (!result[key]) {
        throw new Error(
          'Не знайдено обов’язковий лист: ' +
          key
        );
      }
    }
  );

  return result;
}


/**
 * ЗНІМОК ДАНИХ ПЕРЕД ЗАПИСОМ.
 */
function snapshotVaccineCancellationBaburka_(
  sheets,
  plan
) {
  return {
    baseRow:
      plan.baseChange.row,

    baseStatus:
      sheets.base
        .getRange(
          plan.baseChange.row,
          30
        )
        .getValue(),

    stock:
      plan.stockChanges.map(
        function(change) {
          return {
            row:
              change.row,

            values:
              sheets.stock
                .getRange(
                  change.row,
                  12,
                  1,
                  6
                )
                .getValues()[0]
          };
        }
      ),

    registry:
      plan.registryChanges.map(
        function(change) {
          return {
            row:
              change.row,

            values:
              sheets.registry
                .getRange(
                  change.row,
                  6,
                  1,
                  4
                )
                .getValues()[0]
          };
        }
      ),

    reversalCount:
      plan.movementRecords.length
  };
}


/**
 * АВТОМАТИЧНИЙ ВІДКАТ ПРИ ПОМИЛЦІ.
 */
function restoreVaccineCancellationSnapshotBaburka_(
  sheets,
  snapshot,
  reversalStartRow
) {
  snapshot.stock.forEach(
    function(item) {
      sheets.stock
        .getRange(
          item.row,
          12,
          1,
          6
        )
        .setValues([
          item.values
        ]);
    }
  );

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

  if (
    reversalStartRow &&
    snapshot.reversalCount
  ) {
    sheets.movement
      .getRange(
        reversalStartRow,
        1,
        snapshot.reversalCount,
        12
      )
      .clearContent();
  }

  /*
   * Статус базової операції відновлюємо останнім.
   */
  if (snapshot.baseRow) {
    sheets.base
      .getRange(
        snapshot.baseRow,
        30
      )
      .setValue(
        snapshot.baseStatus
      );
  }

  SpreadsheetApp.flush();
}
/**
 * ФІНАЛЬНА ПЕРЕВІРКА ЗАПИСУ.
 */
function verifyVaccineCancellationBaburka_(
  sheets,
  plan,
  reversalStartRow
) {
  const status =
    clean_(
      sheets.base
        .getRange(
          plan.baseChange.row,
          30
        )
        .getDisplayValue()
    );

  if (
    status !==
    VACCINE_CANCEL_CONFIG_BABURKA
      .cancelledStatus
  ) {
    throw new Error(
      'BASE_STATUS_VERIFY_FAILED'
    );
  }

  plan.registryChanges.forEach(
    function(change) {
      const current =
        clean_(
          sheets.registry
            .getRange(
              change.row,
              6
            )
            .getDisplayValue()
        );

      if (
        current !==
        VACCINE_CANCEL_CONFIG_BABURKA
          .cancelledStatus
      ) {
        throw new Error(
          'REGISTRY_VERIFY_FAILED_' +
          change.row
        );
      }
    }
  );

  plan.stockChanges.forEach(
    function(change) {
      const values =
        sheets.stock
          .getRange(
            change.row,
            12,
            1,
            6
          )
          .getValues()[0];

      const actual = [
        values[0],
        values[1],
        values[2],
        values[3]
      ].map(
        vaccineCancelNumberBaburka_
      );

      const expected = [
        change.after.soldOrUsed,
        change.after.stored,
        change.after.writtenOff,
        change.after.currentBalance
      ];

      expected.forEach(
        function(value, index) {
          if (
            Math.abs(
              actual[index] -
              value
            ) >
            VACCINE_CANCEL_CONFIG_BABURKA
              .tolerance
          ) {
            throw new Error(
              'STOCK_VERIFY_FAILED_' +
              change.lotId
            );
          }
        }
      );
    }
  );

  const reversalIds =
    sheets.movement
      .getRange(
        reversalStartRow,
        1,
        plan.movementRecords.length,
        1
      )
      .getDisplayValues()
      .flat();

  if (
    reversalIds.some(
      function(value) {
        return (
          clean_(value)
            .indexOf('REV|') !== 0
        );
      }
    )
  ) {
    throw new Error(
      'REVERSAL_MOVEMENT_VERIFY_FAILED'
    );
  }
}


/**
 * СТАТУС ПАРТІЇ ПІСЛЯ ВІДНОВЛЕННЯ.
 */
function resolveVaccineCancelLotStatusBaburka_(
  balance,
  minimumStock
) {
  if (
    typeof resolveInventoryLotStatus_ ===
    'function'
  ) {
    return resolveInventoryLotStatus_(
      balance,
      minimumStock
    );
  }

  if (
    balance <=
    VACCINE_CANCEL_CONFIG_BABURKA
      .tolerance
  ) {
    return 'Закрита';
  }

  if (
    minimumStock > 0 &&
    balance <= minimumStock
  ) {
    return 'Низький залишок';
  }

  return 'Активна';
}


/**
 * ID ПОДІЇ СКАСУВАННЯ.
 */
function buildVaccineCancelEventIdBaburka_() {
  return (
    'EVT-CANCEL-VAC-' +
    Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    Utilities.getUuid()
      .replace(/-/g, '')
      .slice(0, 6)
      .toUpperCase()
  );
}


/**
 * ПОТОЧНИЙ КОРИСТУВАЧ.
 */
function getVaccineCancelUserBaburka_() {
  return (
    typeof getSafeUserEmail_ ===
    'function'
  )
    ? getSafeUserEmail_()
    : Session
        .getActiveUser()
        .getEmail();
}


/**
 * CHECKSUM ПЛАНУ.
 */
function hashVaccineLifecycleBaburka_(
  value
) {
  const bytes =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm
        .SHA_256,
      JSON.stringify(value),
      Utilities.Charset.UTF_8
    );

  return bytes
    .map(
      function(byte) {
        const normalized =
          byte < 0
            ? byte + 256
            : byte;

        return (
          '0' +
          normalized.toString(16)
        ).slice(-2);
      }
    )
    .join('');
}


/**
 * БЕЗПЕЧНЕ ЧИСЛО.
 */
function vaccineCancelNumberBaburka_(
  value
) {
  const number =
    Number(value || 0);

  return Number.isFinite(number)
    ? number
    : 0;
}


/**
 * УНІКАЛЬНІ НОМЕРИ РЯДКІВ.
 */
function uniqueVaccineCancelNumbersBaburka_(
  values
) {
  return Array.from(
    new Set(
      (values || [])
        .map(Number)
        .filter(
          function(value) {
            return (
              Number.isFinite(value) &&
              value > 0
            );
          }
        )
    )
  ).sort(
    function(a, b) {
      return a - b;
    }
  );
}


/**
 * УНІКАЛЬНІ ТЕКСТОВІ ЗНАЧЕННЯ.
 */
function uniqueVaccineCancelStringsBaburka_(
  values
) {
  return Array.from(
    new Set(
      (values || [])
        .filter(Boolean)
    )
  );
}
/**
 * ============================================================
 * ЄДИНИЙ НАСКРІЗНИЙ TEST-VAC ТЕСТ
 * ============================================================
 *
 * Створює ізольовані TEST-* рядки, виконує скасування,
 * перевіряє результат і завжди прибирає тестові дані.
 * Реальні операції не змінює.
 */
function testVaccineCancellationEndToEndBaburka() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheets =
    getVaccineCancellationSheetsBaburka_(ss);

  const now = new Date();

  const suffix =
    Utilities.formatDate(
      now,
      Session.getScriptTimeZone(),
      'yyyyMMdd-HHmmss'
    ) +
    '-' +
    Utilities.getUuid()
      .replace(/-/g, '')
      .slice(0, 6)
      .toUpperCase();

  const operationId =
    'TEST-VAC-' + suffix;

  const receiptId =
    'TEST-L-' + suffix;

  const lotId =
    receiptId + '-LOT-1';

  const movementId =
    operationId + '-MOV-OUT-1';

  const vaccineName =
    'TEST вакцина lifecycle';

  const user =
    getVaccineCancelUserBaburka_();

  let execution = null;
  let testError = null;
  let result = null;

  try {
    /*
     * 1. Тестова операція у Базі.
     */
    appendVaccineCancelTestRowBaburka_(
      sheets.base,
      [
        operationId,
        'Каса, грн',
        '',
        now,
        100,
        2,
        200,
        '',
        'TEST пацієнт',
        'Вакцина',
        'Продаж і використання',
        vaccineName,
        'TEST E2E lifecycle',
        now,
        now,
        'Вакцина',
        '', '', '', '',
        vaccineName,
        2,
        now,
        50,
        '',
        '', '', '', '',
        'Проведено',
        now,
        now,
        user
      ]
    );

    /*
     * 2. Тестова партія складу.
     */
    appendVaccineCancelTestRowBaburka_(
      sheets.stock,
      [
        lotId,
        receiptId,
        'Вакцина',
        vaccineName,
        'TEST-SERIES',
        new Date(2030, 0, 1),
        now,
        'TEST',
        2,
        50,
        100,
        2,
        0,
        0,
        0,
        10,
        'Закрита',
        user,
        now,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        0
      ]
    );

    /*
     * 3. Тестовий складський рух.
     */
    appendVaccineCancelTestRowBaburka_(
      sheets.movement,
      [
        movementId,
        operationId,
        now,
        'Вакцина',
        vaccineName,
        lotId,
        'Продаж і використання',
        2,
        50,
        100,
        user,
        now
      ]
    );

    /*
     * 4. Дві тестові одиниці у реєстрі.
     */
    [1, 2].forEach(
      function(index) {
        appendVaccineCancelTestRowBaburka_(
          sheets.registry,
          [
            operationId + '-V' + index,
            operationId,
            'TEST пацієнт',
            vaccineName,
            50,
            'Використано',
            now,
            now,
            'TEST E2E lifecycle',
            lotId,
            'TEST-SERIES',
            new Date(2030, 0, 1),
            movementId,
            user,
            now
          ]
        );
      }
    );

    /*
     * 5. Тестове нарахування.
     */
    appendVaccineCancelTestRowBaburka_(
      sheets.accrual,
      [
        operationId,
        'Вакцина',
        now,
        'Продаж і використання',
        vaccineName,
        -100,
        'TEST пацієнт',
        'TEST E2E lifecycle',
        user,
        now
      ]
    );

    SpreadsheetApp.flush();

    /*
     * 6. Dry-run тестової операції.
     */
    const preview =
      buildVaccineCancellationPlanBaburka_(
        operationId
      );

    if (preview.blockers.length) {
      throw new Error(
        'TEST_PREVIEW_BLOCKED: ' +
        preview.blockers.join(', ')
      );
    }

    /*
     * 7. Реальне скасування лише TEST-* операції.
     */
    execution =
      executeVaccineCancellationBaburka_(
        operationId,
        preview.checksum
      );

    /*
     * 8. Фінальна перевірка.
     */
    const baseRow =
      findVaccineCancelTestRowBaburka_(
        sheets.base,
        1,
        operationId
      );

    const stockRow =
      findVaccineCancelTestRowBaburka_(
        sheets.stock,
        1,
        lotId
      );

    if (!baseRow || !stockRow) {
      throw new Error(
        'TEST_ROWS_NOT_FOUND_AFTER_EXECUTION'
      );
    }

    const baseStatus =
      clean_(
        sheets.base
          .getRange(baseRow, 30)
          .getDisplayValue()
      );

    const stockValues =
      sheets.stock
        .getRange(
          stockRow,
          12,
          1,
          4
        )
        .getValues()[0]
        .map(
          vaccineCancelNumberBaburka_
        );

    const firstRegistryRow =
      findVaccineCancelTestRowBaburka_(
        sheets.registry,
        2,
        operationId
      );

    if (!firstRegistryRow) {
      throw new Error(
        'TEST_REGISTRY_ROWS_NOT_FOUND'
      );
    }

    const registryStatuses =
      sheets.registry
        .getRange(
          firstRegistryRow,
          6,
          2,
          1
        )
        .getDisplayValues()
        .flat()
        .map(clean_);

    const checks = {
      baseCancelled:
        baseStatus === 'Скасовано',

      soldRestored:
        stockValues[0] === 0,

      storedUnchanged:
        stockValues[1] === 0,

      writtenOffUnchanged:
        stockValues[2] === 0,

      balanceRestored:
        stockValues[3] === 2,

      registryCancelled:
        registryStatuses.length === 2 &&
        registryStatuses.every(
          function(status) {
            return status === 'Скасовано';
          }
        ),

      reversalCreated:
        execution
          .reversalMovementRows
          .length === 1,

      auditCompleted:
        execution.auditResult ===
        'COMPLETED'
    };

    const failedChecks =
      Object.keys(checks).filter(
        function(key) {
          return checks[key] !== true;
        }
      );

    if (failedChecks.length) {
      throw new Error(
        'TEST_VERIFY_FAILED: ' +
        failedChecks.join(', ')
      );
    }

    result = {
      ok: true,

      test:
        'testVaccineCancellationEndToEndBaburka',

      writesNow:
        true,

      testDataOnly:
        true,

      operationId:
        operationId,

      checks:
        checks,

      failedChecks:
        [],

      executionEventId:
        execution.eventId,

      cleanupRequired:
        true
    };

  } catch (error) {
    testError = error;

  } finally {
    /*
     * Виконується навіть після помилки.
     */
    const cleanup =
      cleanupVaccineCancellationTestBaburka_(
        sheets,
        operationId,
        lotId
      );

    if (result) {
      result.cleanup =
        cleanup;

      result.cleanupRequired =
        false;

      result.testRowsRemaining =
        cleanup.testRowsRemaining;

      if (
        cleanup.testRowsRemaining !== 0
      ) {
        result.ok =
          false;

        result.failedChecks = [
          'TEST_CLEANUP_FAILED'
        ];
      }
    }
  }

  if (testError) {
    throw new Error(
      String(
        testError &&
        testError.message
          ? testError.message
          : testError
      ) +
      ' | TEST rows cleanup attempted'
    );
  }

  console.log(
    'OL4_VACCINE_E2E: ' +
    JSON.stringify(result)
  );

  return result;
}


function appendVaccineCancelTestRowBaburka_(
  sheet,
  values
) {
  const row =
    sheet.getLastRow() + 1;

  sheet
    .getRange(
      row,
      1,
      1,
      values.length
    )
    .setValues([
      values
    ]);

  return row;
}


function findVaccineCancelTestRowBaburka_(
  sheet,
  column,
  value
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < 1) {
    return 0;
  }

  const expected =
    clean_(value);

  const values =
    sheet
      .getRange(
        1,
        column,
        lastRow,
        1
      )
      .getDisplayValues()
      .flat();

  const index =
    values.findIndex(
      function(current) {
        return (
          clean_(current) ===
          expected
        );
      }
    );

  return index === -1
    ? 0
    : index + 1;
}


function cleanupVaccineCancellationTestBaburka_(
  sheets,
  operationId,
  lotId
) {
  const cleanupCounts = {
    base:
      clearVaccineCancelTestRowsBaburka_(
        sheets.base,
        1,
        function(value) {
          return value === operationId;
        },
        33
      ),

    stock:
      clearVaccineCancelTestRowsBaburka_(
        sheets.stock,
        1,
        function(value) {
          return value === lotId;
        },
        28
      ),

    movement:
      clearVaccineCancelTestRowsBaburka_(
        sheets.movement,
        2,
        function(value) {
          return (
            value === operationId ||
            value.indexOf(
              'VST|' +
              operationId +
              '|'
            ) === 0
          );
        },
        12
      ),

    registry:
      clearVaccineCancelTestRowsBaburka_(
        sheets.registry,
        2,
        function(value) {
          return value === operationId;
        },
        15
      ),

    accrual:
      clearVaccineCancelTestRowsBaburka_(
        sheets.accrual,
        1,
        function(value) {
          return value === operationId;
        },
        10
      ),

    audit:
      clearVaccineCancelTestRowsBaburka_(
        sheets.audit,
        5,
        function(value) {
          return value === operationId;
        },
        12
      )
  };

  SpreadsheetApp.flush();

  const testRowsRemaining =
    countVaccineCancelTestRowsBaburka_(
      sheets.base,
      1,
      operationId
    ) +
    countVaccineCancelTestRowsBaburka_(
      sheets.stock,
      1,
      lotId
    ) +
    countVaccineCancelTestRowsBaburka_(
      sheets.movement,
      2,
      operationId
    ) +
    countVaccineCancelTestRowsBaburka_(
      sheets.registry,
      2,
      operationId
    ) +
    countVaccineCancelTestRowsBaburka_(
      sheets.accrual,
      1,
      operationId
    ) +
    countVaccineCancelTestRowsBaburka_(
      sheets.audit,
      5,
      operationId
    );

  return {
    clearedRows:
      cleanupCounts,

    testRowsRemaining:
      testRowsRemaining
  };
}


function clearVaccineCancelTestRowsBaburka_(
  sheet,
  column,
  matcher,
  width
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < 1) {
    return 0;
  }

  const values =
    sheet
      .getRange(
        1,
        column,
        lastRow,
        1
      )
      .getDisplayValues()
      .flat();

  let cleared = 0;

  values.forEach(
    function(value, index) {
      const normalized =
        clean_(value);

      if (!matcher(normalized)) {
        return;
      }

      sheet
        .getRange(
          index + 1,
          1,
          1,
          width
        )
        .clearContent();

      cleared++;
    }
  );

  return cleared;
}


function countVaccineCancelTestRowsBaburka_(
  sheet,
  column,
  value
) {
  const lastRow =
    sheet.getLastRow();

  if (lastRow < 1) {
    return 0;
  }

  const expected =
    clean_(value);

  return sheet
    .getRange(
      1,
      column,
      lastRow,
      1
    )
    .getDisplayValues()
    .flat()
    .filter(
      function(current) {
        return (
          clean_(current) ===
          expected
        );
      }
    )
    .length;
}


/**
 * UI-обробник вакцинної операції
 * для наявного меню скасування.
 */
function handleControlledVaccineCancellationBaburka_(
  operationId,
  details
) {
  const ui =
    SpreadsheetApp.getUi();

  const plan =
    buildVaccineCancellationPlanBaburka_(
      operationId
    );

  if (plan.blockers.length) {
    throw new Error(
      'Скасування вакцинної операції заблоковано:\n' +
      plan.blockers.join('\n')
    );
  }

  const stockLines =
    plan.stockChanges.map(
      function(change) {
        return (
          '• ' +
          change.lotId +
          ': залишок ' +
          change.before.currentBalance +
          ' → ' +
          change.after.currentBalance
        );
      }
    );

  const confirmationText = [
    'Підтвердити скасування вакцинної операції?',
    '',
    'ID: ' + operationId,
    'Дата: ' +
      (details.date || 'не вказано'),
    'Вакцина: ' +
      (details.article || 'не вказано'),
    'Пацієнт: ' +
      (details.patient || 'не вказано'),
    'Сума: ' +
      (details.amount || '0'),
    '',
    'Буде змінено:',
    '• База операцій: Проведено → Скасовано;',
    '• Облік вакцин: ' +
      plan.registryChanges.length +
      ' записи;',
    '• Сторнувальні рухи складу: ' +
      plan.reversalMovements.length +
      ';',
    '• Нарахування будуть виключені: ' +
      plan.excludedAccrualRows.length +
      '.',
    '',
    'Зміни залишків:',
    stockLines.join('\n'),
    '',
    'Джерельні партії та інші продажі не змінюються.',
    'Рядки фізично не видаляються.'
  ].join('\n');

  const confirmation =
    ui.alert(
      'Контрольоване скасування вакцини',
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
    executeVaccineCancellationBaburka_(
      operationId,
      plan.checksum
    );

  /*
   * Поки ManualDeletionGuard ще не відновлений,
   * відсутність функції не повинна ламати скасування.
   */
  if (
    typeof refreshDeletionGuardAfterSystemWriteBaburka_ ===
    'function'
  ) {
    refreshDeletionGuardAfterSystemWriteBaburka_();
  }

  ui.alert(
    'Вакцинну операцію скасовано',
    'ID: ' +
      operationId +
      '\n' +
      'Відновлено партій: ' +
      result.stockRows.length +
      '\n' +
      'Скасовано одиниць вакцин: ' +
      result.registryRows.length +
      '\n' +
      'Подія журналу: ' +
      result.eventId,
    ui.ButtonSet.OK
  );

  return result;
}