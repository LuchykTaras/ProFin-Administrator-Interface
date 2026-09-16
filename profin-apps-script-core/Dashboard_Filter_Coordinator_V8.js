/**
 * ============================================================
 * ProFin OS 2026
 * DASHBOARD FILTER COORDINATOR V8
 *
 * Єдине committed-state глобального фільтра.
 *
 * НЕ створює:
 * - onEdit
 * - onOpen
 * - trigger
 * - chart
 *
 * DRAFT:
 *   E5 / E6 / F5 / F6
 *
 * COMMITTED:
 *   DocumentProperties
 *
 * SYNCHRONIZATION:
 *   ScriptLock + revisions
 * ============================================================
 */

const DASHBOARD_FILTER_COORDINATOR_V8_CFG =
  Object.freeze({

    version:
      'DASHBOARD_FILTER_COORDINATOR_V8_2026_08_14',

    properties: {

      committedState:
        'PROFIN_DASH_FILTER_STATE_V8',

      globalRevision:
        'PROFIN_DASH_FILTER_GLOBAL_REVISION_V8',

      expenseLocalRevision:
        'PROFIN_DASH_EXPENSE_LOCAL_REVISION_V8',

      /*
       * Compatibility mirror.
       */
      legacyGlobalActive:
        'PROFIN_DASH_GLOBAL_FILTER_ACTIVE'
    },

    lockTimeoutMs:
      30000
  });


/**
 * ============================================================
 * ONE-TIME BOOTSTRAP
 * ============================================================
 *
 * Запустити ОДИН РАЗ після додавання цього файла.
 */
function dashboardFilterCoordinatorV8BootstrapOnce() {

  const cfg =
    DASHBOARD_FILTER_COORDINATOR_V8_CFG;

  const lock =
    LockService.getScriptLock();

  lock.waitLock(
    cfg.lockTimeoutMs
  );

  try {

    const existing =
      dashboardFilterCoordinatorReadCommittedState_();

    if (
      existing.initialized === true
    ) {

      const result = {
        ok: true,
        mode: 'ALREADY_INITIALIZED',
        state: existing,
        noCellsWritten: true,
        noChartsModified: true,
        noTriggersModified: true
      };

      Logger.log(
        'dashboardFilterCoordinatorV8BootstrapOnce: ' +
        JSON.stringify(
          result,
          null,
          2
        )
      );

      return result;
    }


    const ss =
      SpreadsheetApp.getActiveSpreadsheet();

    const dashboardSheet =
      ss.getSheetByName(
        'Дашборд'
      );

    if (!dashboardSheet) {
      throw new Error(
        'Не знайдено лист "Дашборд".'
      );
    }


    const fromRange =
      ss.getRangeByName(
        'DASH_DATE_FROM'
      ) ||
      dashboardSheet.getRange(
        'E5'
      );


    const toRange =
      ss.getRangeByName(
        'DASH_DATE_TO'
      ) ||
      dashboardSheet.getRange(
        'E6'
      );


    const properties =
      PropertiesService
        .getDocumentProperties();


    const legacyActive =
      properties.getProperty(
        cfg.properties.legacyGlobalActive
      ) === '1';


    const from =
      dashboardFilterCoordinatorDateOnly_(
        fromRange.getValue()
      );


    const to =
      dashboardFilterCoordinatorDateOnly_(
        toRange.getValue()
      );


    let state;


    if (
      legacyActive &&
      from &&
      to
    ) {

      state =
        dashboardFilterCoordinatorWriteState_({
          active: true,
          mode: 'LEGACY_RANGE',
          from: from,
          to: to,
          source: 'BOOTSTRAP_LEGACY_E5_E6'
        });

    } else {

      state =
        dashboardFilterCoordinatorWriteState_({
          active: false,
          mode: 'FULL_HISTORY',
          from: null,
          to: null,
          source: 'BOOTSTRAP_INACTIVE'
        });
    }


    const result = {
      ok: true,
      mode: 'BOOTSTRAPPED',
      state: state,
      noCellsWritten: true,
      noChartsModified: true,
      noTriggersModified: true
    };


    Logger.log(
      'dashboardFilterCoordinatorV8BootstrapOnce: ' +
      JSON.stringify(
        result,
        null,
        2
      )
    );


    return result;

  } finally {

    lock.releaseLock();
  }
}


/**
 * ============================================================
 * READ COMMITTED GLOBAL STATE
 * ============================================================
 */
function dashboardFilterCoordinatorReadCommittedState_() {

  const cfg =
    DASHBOARD_FILTER_COORDINATOR_V8_CFG;

  const properties =
    PropertiesService
      .getDocumentProperties();


  const raw =
    properties.getProperty(
      cfg.properties.committedState
    );


  const fallbackRevision =
    dashboardFilterCoordinatorReadGlobalRevision_();


  if (!raw) {

    return {
      initialized: false,
      active: false,
      mode: null,
      fromMs: null,
      toMs: null,
      source: null,
      revision: fallbackRevision,
      appliedAtMs: null
    };
  }


  let parsed;

  try {

    parsed =
      JSON.parse(
        raw
      );

  } catch (error) {

    throw new Error(
      'Пошкоджено PROFIN_DASH_FILTER_STATE_V8: ' +
      error.message
    );
  }


  return {

    initialized:
      true,

    active:
      parsed.active === true,

    mode:
      parsed.mode || null,

    fromMs:
      parsed.fromMs === null ||
      parsed.fromMs === undefined
        ? null
        : (
            Number.isFinite(
              Number(
                parsed.fromMs
              )
            )
              ? Number(
                  parsed.fromMs
                )
              : null
          ),

    toMs:
      parsed.toMs === null ||
      parsed.toMs === undefined
        ? null
        : (
            Number.isFinite(
              Number(
                parsed.toMs
              )
            )
              ? Number(
                  parsed.toMs
                )
              : null
          ),

    source:
      parsed.source || null,

    revision:
      Number.isFinite(
        Number(
          parsed.revision
        )
      )
        ? Number(
            parsed.revision
          )
        : fallbackRevision,

    appliedAtMs:
      Number.isFinite(
        Number(
          parsed.appliedAtMs
        )
      )
        ? Number(
            parsed.appliedAtMs
          )
        : null
  };
}


/**
 * ============================================================
 * COMMIT GLOBAL FILTER
 *
 * CALLER повинен вже володіти ScriptLock,
 * якщо виклик іде з dashboardGlobalFilterApply().
 * ============================================================
 */
function dashboardFilterCoordinatorCommitGlobal_(
  period
) {

  if (
    !period ||
    !period.from ||
    !period.to
  ) {

    throw new Error(
      'FILTER V8: не передано коректний глобальний період.'
    );
  }


  const from =
    dashboardFilterCoordinatorDateOnly_(
      period.from
    );


  const to =
    dashboardFilterCoordinatorDateOnly_(
      period.to
    );


  if (
    !from ||
    !to
  ) {

    throw new Error(
      'FILTER V8: from/to не є валідними датами.'
    );
  }


  if (
    from.getTime() >
    to.getTime()
  ) {

    throw new Error(
      'FILTER V8: дата початку більша за дату завершення.'
    );
  }


  return dashboardFilterCoordinatorWriteState_({
    active: true,

    mode:
      period.mode ||
      'RANGE',

    from:
      from,

    to:
      to,

    source:
      period.source ||
      'GLOBAL_FILTER'
  });
}


/**
 * ============================================================
 * COMMIT CLEAR
 * ============================================================
 */
function dashboardFilterCoordinatorCommitClear_() {

  return dashboardFilterCoordinatorWriteState_({
    active: false,
    mode: 'FULL_HISTORY',
    from: null,
    to: null,
    source: 'GLOBAL_CLEAR'
  });
}


/**
 * ============================================================
 * PRIVATE STATE WRITER
 * ============================================================
 */
function dashboardFilterCoordinatorWriteState_(
  input
) {

  const cfg =
    DASHBOARD_FILTER_COORDINATOR_V8_CFG;


  const properties =
    PropertiesService
      .getDocumentProperties();


  const previousRevision =
    dashboardFilterCoordinatorReadGlobalRevision_();


  const nextRevision =
    previousRevision + 1;


  const state = {

    schemaVersion:
      'V8',

    active:
      input.active === true,

    mode:
      input.mode || null,

    fromMs:
      input.from
        ? input.from.getTime()
        : null,

    toMs:
      input.to
        ? input.to.getTime()
        : null,

    source:
      input.source || null,

    revision:
      nextRevision,

    appliedAtMs:
      Date.now()
  };


  properties.setProperty(
    cfg.properties.committedState,
    JSON.stringify(
      state
    )
  );


  properties.setProperty(
    cfg.properties.globalRevision,
    String(
      nextRevision
    )
  );


  /*
   * Compatibility mirror.
   */
  properties.setProperty(
    cfg.properties.legacyGlobalActive,
    state.active
      ? '1'
      : '0'
  );


  return dashboardFilterCoordinatorReadCommittedState_();
}


/**
 * ============================================================
 * GLOBAL REVISION
 * ============================================================
 */
function dashboardFilterCoordinatorReadGlobalRevision_() {

  const value =
    PropertiesService
      .getDocumentProperties()
      .getProperty(
        DASHBOARD_FILTER_COORDINATOR_V8_CFG
          .properties
          .globalRevision
      );


  const revision =
    Number(
      value
    );


  return Number.isFinite(
    revision
  )
    ? revision
    : 0;
}


/**
 * ============================================================
 * EXPENSE LOCAL REVISION
 * ============================================================
 */
function dashboardFilterCoordinatorReadExpenseLocalRevision_() {

  const value =
    PropertiesService
      .getDocumentProperties()
      .getProperty(
        DASHBOARD_FILTER_COORDINATOR_V8_CFG
          .properties
          .expenseLocalRevision
      );


  const revision =
    Number(
      value
    );


  return Number.isFinite(
    revision
  )
    ? revision
    : 0;
}


/**
 * Викликати тільки під ScriptLock.
 */
function dashboardFilterCoordinatorBumpExpenseLocalRevision_() {

  const cfg =
    DASHBOARD_FILTER_COORDINATOR_V8_CFG;


  const next =
    dashboardFilterCoordinatorReadExpenseLocalRevision_() +
    1;


  PropertiesService
    .getDocumentProperties()
    .setProperty(
      cfg.properties.expenseLocalRevision,
      String(
        next
      )
    );


  return next;
}


/**
 * ============================================================
 * COMMITTED PERIOD
 * ============================================================
 */
function dashboardFilterCoordinatorCommittedPeriod_() {

  const state =
    dashboardFilterCoordinatorReadCommittedState_();


  if (
    !state.initialized ||
    !state.active
  ) {

    return null;
  }


  if (
    !Number.isFinite(
      state.fromMs
    ) ||
    !Number.isFinite(
      state.toMs
    )
  ) {

    throw new Error(
      'FILTER V8: active state не містить fromMs/toMs.'
    );
  }


  return {

    mode:
      state.mode,

    from:
      new Date(
        state.fromMs
      ),

    to:
      new Date(
        state.toMs
      ),

    source:
      'COMMITTED_FILTER_V8',

    revision:
      state.revision
  };
}


/**
 * ============================================================
 * STEP 1 DRY RUN
 * READ ONLY
 * ============================================================
 */
function dashboardFilterCoordinatorStateDryRun() {

  const committed =
    dashboardFilterCoordinatorReadCommittedState_();


  let draftPeriod =
    null;


  let draftError =
    null;


  if (
    typeof dashboardGlobalFilterContext_ ===
      'function' &&
    typeof dashboardGlobalFilterResolveApplyPeriod_ ===
      'function'
  ) {

    try {

      draftPeriod =
        dashboardGlobalFilterResolveApplyPeriod_(
          dashboardGlobalFilterContext_()
        );

    } catch (error) {

      draftError =
        error.message;
    }
  }


  const committedPeriod =
    committed.active
      ? {
          mode:
            committed.mode,

          from:
            committed.fromMs
              ? new Date(
                  committed.fromMs
                )
              : null,

          to:
            committed.toMs
              ? new Date(
                  committed.toMs
                )
              : null,

          source:
            committed.source
        }
      : null;


  const result = {

    ok:
      committed.initialized === true,

    mode:
      'FILTER_STATE_V8_DRY_RUN',

    committed:
      committed,

    draft:
      draftPeriod
        ? {
            mode:
              draftPeriod.mode,

            from:
              draftPeriod.from,

            to:
              draftPeriod.to,

            source:
              draftPeriod.source
          }
        : null,

    draftError:
      draftError,

    samePeriod:
      dashboardFilterCoordinatorPeriodsEqual_(
        committedPeriod,
        draftPeriod
      ),

    noCellsWritten:
      true,

    noChartsModified:
      true,

    noTriggersModified:
      true
  };


  Logger.log(
    'dashboardFilterCoordinatorStateDryRun: ' +
    JSON.stringify(
      result,
      null,
      2
    )
  );


  return result;
}


/**
 * ============================================================
 * PERIOD EQUALITY
 * ============================================================
 */
function dashboardFilterCoordinatorPeriodsEqual_(
  first,
  second
) {

  if (
    !first &&
    !second
  ) {

    return true;
  }


  if (
    !first ||
    !second
  ) {

    return false;
  }


  if (
    !first.from ||
    !first.to ||
    !second.from ||
    !second.to
  ) {

    return false;
  }


  return (
    first.from.getTime() ===
      second.from.getTime() &&

    first.to.getTime() ===
      second.to.getTime()
  );
}


/**
 * ============================================================
 * DATE ONLY
 * ============================================================
 */
function dashboardFilterCoordinatorDateOnly_(
  value
) {

  if (
    Object.prototype.toString.call(
      value
    ) !== '[object Date]' ||
    isNaN(
      value.getTime()
    )
  ) {

    return null;
  }


  return new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  );
}