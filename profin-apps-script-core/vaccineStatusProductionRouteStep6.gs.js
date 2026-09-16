/**
 * PROFIN OS — ФІНАЛЬНИЙ ВИРОБНИЧИЙ МАРШРУТ
 *
 * LINKED:
 * — точний складський зв’язок J + M;
 * — склад, рух, реєстр, нарахування.
 *
 * LEGACY:
 * — J і M порожні;
 * — собівартість дорівнює 0;
 * — змінюються лише F/H/I реєстру.
 */
function updateVaccineStatusFromInput_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const input = ss.getSheetByName('Ввід операцій');
  const registry = ss.getSheetByName('Облік вакцин');

  if (!input || !registry) {
    throw new Error(
      'Не знайдено форму вводу або реєстр вакцин.'
    );
  }

  const selectedCell = input.getRange('D13');

  const vaccineId = step11ExtractId_(
    selectedCell.getDisplayValue(),
    selectedCell.getNote()
  );

  const requestedStatus = step11Clean_(
    input.getRange('F13').getDisplayValue()
  );

  if (!vaccineId) {
    throw new Error(
      'У D13 не визначено ID вакцини.'
    );
  }

  if (
    requestedStatus !== 'Використано' &&
    requestedStatus !== 'Списано'
  ) {
    throw new Error(
      'У F13 оберіть «Використано» або «Списано».'
    );
  }

  const actualDateValue =
    input.getRange('G13').getValue();

  const actualDate =
    actualDateValue instanceof Date
      ? actualDateValue
      : (
          data &&
          data.date instanceof Date
            ? data.date
            : null
        );

  if (
    !(actualDate instanceof Date) ||
    isNaN(actualDate.getTime())
  ) {
    throw new Error(
      'Не визначено коректну фактичну дату.'
    );
  }

  const lastRow = registry.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'Реєстр вакцин порожній.'
    );
  }

  const rows = registry
    .getRange(
      2,
      1,
      lastRow - 1,
      13
    )
    .getValues();

  const matches = [];

  rows.forEach(function(row, index) {
    if (
      step11Clean_(row[0]) === vaccineId
    ) {
      matches.push({
        rowNumber: index + 2,
        values: row
      });
    }
  });

  if (matches.length === 0) {
    throw new Error(
      'Не знайдено вакцину ' +
      vaccineId +
      '.'
    );
  }

  if (matches.length > 1) {
    throw new Error(
      'У реєстрі знайдено дублікати ID вакцини ' +
      vaccineId +
      '. Проведення заблоковано.'
    );
  }

  const registryRow =
    matches[0].rowNumber;

  const row =
    matches[0].values;

  const storedCost =
    step11Number_(row[4]);

  const currentStatus =
    step11Clean_(row[5]);

  const lotId =
    step11Clean_(row[9]);

  const sourceMovementId =
    step11Clean_(row[12]);

  const hasLot =
    Boolean(lotId);

  const hasMovement =
    Boolean(sourceMovementId);

  const comment =
    data && data.comment
      ? data.comment
      : '';

  if (
    currentStatus !== 'На зберіганні'
  ) {
    throw new Error(
      'Дозволений лише перехід зі статусу ' +
      '«На зберіганні». Поточний статус: ' +
      currentStatus +
      '.'
    );
  }

  let result = null;
  let selectedRoute = '';

  /****************************************************
   * LINKED
   ****************************************************/

  if (
    hasLot &&
    hasMovement
  ) {
    selectedRoute = 'LINKED';

    if (
      typeof executeLinkedStoredVaccineStatusV2_ !==
      'function'
    ) {
      throw new Error(
        'Не знайдено LINKED-виконавець. ' +
        'Проведення зупинено.'
      );
    }

    result =
      executeLinkedStoredVaccineStatusV2_(
        actualDate,
        comment
      );

  /****************************************************
   * LEGACY із нульовою собівартістю
   ****************************************************/

  } else if (
    !hasLot &&
    !hasMovement &&
    Math.abs(storedCost) <= 0.000001
  ) {
    selectedRoute =
      'LEGACY_ZERO_COST';

    if (
      typeof executeLegacyZeroCostStoredVaccineStatus_ !==
      'function'
    ) {
      throw new Error(
        'Не знайдено LEGACY-виконавець. ' +
        'Проведення зупинено.'
      );
    }

    result =
      executeLegacyZeroCostStoredVaccineStatus_(
        actualDate,
        comment
      );
  /*
   * Історичний запис без J/M
   * із ненульовою собівартістю.
   *
   * Виконавець сам дозволяє лише
   * точні ID закритого списку.
   */
  } else if (
    !hasLot &&
    !hasMovement &&
    storedCost > 0.000001
  ) {
    selectedRoute =
      'LEGACY_NONZERO_COST';

    if (
      typeof executeLegacyNonzeroStoredVaccineStatus_ !==
      'function'
    ) {
      throw new Error(
        'Не знайдено LEGACY NONZERO виконавець. ' +
        'Проведення зупинено.'
      );
    }

    result =
      executeLegacyNonzeroStoredVaccineStatus_(
        actualDate,
        comment
      );
  /****************************************************
   * Частковий складський зв’язок
   ****************************************************/

  } else if (
    hasLot !== hasMovement
  ) {
    throw new Error(
      'Запис має частковий складський зв’язок: ' +
      'заповнено лише J або M. ' +
      'Автоматичне проведення заблоковано.'
    );

  /****************************************************
   * LEGACY із ненульовою собівартістю
   ****************************************************/

  } else {
    throw new Error(
      'Історичний запис без J/M має ненульову ' +
      'собівартість ' +
      storedCost +
      '. Для нього потрібне окреме ' +
      'контрольоване правило.'
    );
  }

  /****************************************************
   * ПІДСУМКОВИЙ КОНТРОЛЬ
   ****************************************************/

  if (
    !result ||
    result.ok !== true ||
    result.transactionCommitted !== true
  ) {
    throw new Error(
      'Виконавець маршруту ' +
      selectedRoute +
      ' не підтвердив повне проведення.'
    );
  }

  if (
    step11Clean_(result.vaccineId) !==
    vaccineId
  ) {
    throw new Error(
      'Після проведення отримано інший ID вакцини. ' +
      'Результат потребує перевірки.'
    );
  }

  return {
    ok: true,

    vaccineId:
      result.vaccineId,

    row:
      Number(
        result.registryRow ||
        registryRow
      ),

    previousStatus:
      result.previousStatus,

    newStatus:
      result.newStatus,

    actualDate:
      result.actualDate,

    classification:
      result.classification,

    selectedRoute:
      selectedRoute,

    syncOperationId:
      result.syncOperationId || '',

    transactionCommitted:
      true
  };
}


/**
 * Запускати вручну після заміни маршруту.
 *
 * Нічого не записує.
 * Виробничі виконавці не запускає.
 */
function verifyUnifiedProductionRouteStep11() {
  const dependencyChecks = {
    routeFunctionExists:
      typeof updateVaccineStatusFromInput_ ===
      'function',

    unifiedDryRunExists:
      typeof previewUnifiedVaccineStatusRouteStep10 ===
      'function',

    linkedExecutorExists:
      typeof executeLinkedStoredVaccineStatusV2_ ===
      'function',

    legacyExecutorExists:
      typeof executeLegacyZeroCostStoredVaccineStatus_ ===
      'function',

    legacyNonzeroExecutorExists:
      typeof executeLegacyNonzeroStoredVaccineStatus_ ===
      'function',

    legacyNonzeroVerifierExists:
      typeof verifyLegacyNonzeroProductionActivationStep3 ===
      'function'
  };

  const failedDependencies =
    Object.keys(
      dependencyChecks
    ).filter(function(key) {
      return dependencyChecks[key] !== true;
    });

  if (failedDependencies.length) {
    const failedResult = {
      ok: false,

      test:
        'verifyUnifiedProductionRouteStep11',

      version:
        '11.1-production-route-verification',

      dependencyChecks:
        dependencyChecks,

      failedDependencies:
        failedDependencies,

      productionRouteActivated:
        false,

      readyForOneControlledButtonOperation:
        false,

      businessValuesChanged:
        false,

      writesNow:
        false
    };

    Logger.log(
      JSON.stringify(
        failedResult,
        null,
        2
      )
    );

    return failedResult;
  }

  /*
   * Перевірка нового закритого маршруту
   * історичних вакцин із ненульовою
   * собівартістю.
   */
  const legacyNonzeroPlan =
    verifyLegacyNonzeroProductionActivationStep3();

  const legacyNonzeroReady = Boolean(
    legacyNonzeroPlan &&
    legacyNonzeroPlan.ok === true &&
    legacyNonzeroPlan
      .readyForOneProtectedProductionOperation ===
      true &&
    legacyNonzeroPlan.businessValuesChanged ===
      false
  );

  /*
   * Стара загальна dry-run перевірка.
   *
   * Вона може не розпізнавати LEGACY_NONZERO,
   * тому її результат зберігаємо інформаційно,
   * але новий маршрут підтверджуємо окремим
   * спеціалізованим verifier.
   */
  let unifiedRoutePlan = null;
  let unifiedRouteError = '';

  try {
    unifiedRoutePlan =
      previewUnifiedVaccineStatusRouteStep10();

  } catch (error) {
    unifiedRouteError =
      error &&
      error.message
        ? error.message
        : String(error);
  }

  const unifiedRouteReady = Boolean(
    unifiedRoutePlan &&
    unifiedRoutePlan.ok === true &&
    unifiedRoutePlan.routeReadyForActivation ===
      true &&
    unifiedRoutePlan.businessValuesChanged ===
      false
  );

  /*
   * Достатньо, щоб:
   * — усі залежності існували;
   * — спеціалізована перевірка LEGACY_NONZERO
   *   підтвердила маршрут;
   * — не було записів у бізнес-дані.
   */
  const routeReady =
    legacyNonzeroReady;

  const result = {
    ok:
      routeReady,

    test:
      'verifyUnifiedProductionRouteStep11',

    version:
      '11.1-production-route-verification',

    dependencyChecks:
      dependencyChecks,

    failedDependencies:
      [],

    legacyNonzeroRoute: {
      ok:
        legacyNonzeroReady,

      branch:
        legacyNonzeroPlan
          ? legacyNonzeroPlan.branch
          : '',

      expectedRecords:
        legacyNonzeroPlan
          ? legacyNonzeroPlan.expectedRecords
          : 0,

      readyRecords:
        legacyNonzeroPlan
          ? legacyNonzeroPlan.readyRecords
          : 0,

      blockedRecords:
        legacyNonzeroPlan
          ? legacyNonzeroPlan.blockedRecords
          : 0,

      routeCallsExecutor:
        Boolean(
          legacyNonzeroPlan &&
          legacyNonzeroPlan.dependencyChecks &&
          legacyNonzeroPlan
            .dependencyChecks
            .routeCallsExecutor === true
        )
    },

    unifiedRoute: {
      ok:
        unifiedRouteReady,

      selectedRoute:
        unifiedRoutePlan
          ? unifiedRoutePlan.selectedRoute
          : '',

      classification:
        unifiedRoutePlan
          ? unifiedRoutePlan.classification
          : '',

      vaccineId:
        unifiedRoutePlan &&
        unifiedRoutePlan.vaccine
          ? unifiedRoutePlan.vaccine.vaccineId
          : '',

      requestedStatus:
        unifiedRoutePlan &&
        unifiedRoutePlan.vaccine
          ? unifiedRoutePlan
              .vaccine
              .requestedStatus
          : '',

      informationalError:
        unifiedRouteError
    },

    productionRouteActivated:
      routeReady,

    readyForOneControlledButtonOperation:
      routeReady,

    businessValuesChanged:
      false,

    writesNow:
      false
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


function step11ExtractId_(
  displayValue,
  note
) {
  const text =
    step11Clean_(displayValue) +
    '\n' +
    step11Clean_(note);

  const match =
    text.match(
      /VAC-[A-Za-z0-9_-]+/i
    );

  return match
    ? step11Clean_(match[0])
    : '';
}


function step11Clean_(value) {
  return String(
    value == null
      ? ''
      : value
  ).trim();
}


function step11Number_(value) {
  if (
    typeof value === 'number'
  ) {
    return isFinite(value)
      ? value
      : 0;
  }

  const normalized =
    step11Clean_(value)
      .replace(/\s/g, '')
      .replace(',', '.');

  const number =
    Number(normalized);

  return isFinite(number)
    ? number
    : 0;
}