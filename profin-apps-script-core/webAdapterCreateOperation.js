/****************************************************
 * PROFIN OS
 * WEB ADAPTER — CREATE OPERATION
 * --------------------------------------------------
 * PATCH 37
 *
 * Thin adapter only.
 *
 * This file DOES NOT reimplement:
 * - operation ID generation;
 * - validation;
 * - FEFO/FIFO;
 * - inventory receipt/issue;
 * - vaccine accruals;
 * - package accruals;
 * - rollback;
 * - client tags.
 *
 * All business rules remain in the existing
 * Apps Script domain core (inputOperations.js
 * and related domain modules).
 *
 * PATCH 37:
 * - keeps trusted workbook routing;
 * - keeps ScriptLock;
 * - keeps legacy domain core;
 * - accepts legacy domain return formats;
 * - DOES NOT generate operationId itself;
 * - requires operationId produced by domain core;
 * - distinguishes explicit domain failure from
 *   legacy undefined/null returns.
 ****************************************************/


var PROFIN_WEB_CREATE_OPERATION_VERSION =
  'PROFIN_WEB_CREATE_OPERATION_PATCH_37_2026';


/****************************************************
 * ENTRY POINT
 ****************************************************/

function profinWebAdapterCreateOperation_(
  request,
  trustedRoute
) {
  if (
    !request ||
    !request.payload ||
    typeof request.payload !== 'object' ||
    Array.isArray(request.payload)
  ) {
    throw profinWebAdapterError_(
      400,
      'CREATE_OPERATION_PAYLOAD_REQUIRED',
      'Не передано дані операції.',
      'request.payload must be an object.',
      false
    );
  }


  var rawOperation =
    request.payload.operation;


  if (
    !rawOperation ||
    typeof rawOperation !== 'object' ||
    Array.isArray(rawOperation)
  ) {
    throw profinWebAdapterError_(
      400,
      'CREATE_OPERATION_REQUIRED',
      'Не передано операцію для проведення.',
      'payload.operation must be an object.',
      false
    );
  }


  if (
    !trustedRoute ||
    !trustedRoute.spreadsheet
  ) {
    throw profinWebAdapterError_(
      500,
      'TRUSTED_WORKBOOK_REQUIRED',
      'Не вдалося визначити активну річну таблицю.',
      'trustedRoute.spreadsheet is missing.',
      false
    );
  }


  var data =
    profinWebAdapterNormalizeOperation_(
      rawOperation,
      request,
      trustedRoute
    );


  profinWebAdapterAssertWebOperationScenario_(
    data,
    rawOperation
  );


  profinWebAdapterResolveExistingPatient_(
    trustedRoute.spreadsheet,
    data
  );


  profinWebAdapterAssertReferenceValues_(
    trustedRoute.spreadsheet,
    data
  );


  var previousSpreadsheet =
    SpreadsheetApp.getActiveSpreadsheet();


  var executionLock =
    LockService.getScriptLock();


  var actor =
    'WEB:' +
    String(request.context.userId || '') +
    ' [' +
    String(request.context.role || '') +
    ']';


  var locked =
    false;


  try {
    /*
     * Existing domain helpers still use
     * SpreadsheetApp.getActiveSpreadsheet().
     *
     * Therefore PATCH 37 activates ONLY the
     * already verified trusted annual workbook
     * for this server execution.
     */
    SpreadsheetApp.setActiveSpreadsheet(
      trustedRoute.spreadsheet
    );


    locked =
      executionLock.tryLock(
        30000
      );


    if (!locked) {
      throw profinWebAdapterError_(
        409,
        'OPERATION_EXECUTION_BUSY',
        'Інша операція вже проводиться. Повторіть спробу.',
        'ScriptLock was not acquired within 30000 ms.',
        true
      );
    }


    if (
      typeof setProfinWebOperationActorOverride_ ===
        'function'
    ) {
      setProfinWebOperationActorOverride_(
        actor
      );
    }


    if (
      typeof postInputOperationCore_ !==
        'function'
    ) {
      throw profinWebAdapterError_(
        500,
        'DOMAIN_CREATE_OPERATION_MISSING',
        'Доменне ядро проведення операцій недоступне.',
        'postInputOperationCore_ is not defined.',
        false
      );
    }


    /************************************************
     * PATCH 37
     * DOMAIN CORE EXECUTION
     ************************************************/

    var rawDomainResult;


    try {
      /*
       * trustedRoute.spreadsheet is already active.
       *
       * postInputOperationCore_ is legacy domain core
       * and may use one of several return contracts.
       *
       * Supported legacy results:
       *
       * undefined / null + data.id
       * true             + data.id
       * string ID
       * number ID
       * { operationId: ... }
       * { id: ... }
       * { ok: true, ... }
       * { success: true, ... }
       *
       * Explicit failures:
       *
       * false
       * { ok: false }
       * { success: false }
       */
      rawDomainResult =
        postInputOperationCore_(
          data,
          {
            mode:
              'WEB',

            spreadsheet:
              trustedRoute.spreadsheet
          }
        );

    } catch (domainError) {
      console.log(
        '[PATCH37_DOMAIN_EXCEPTION] ' +
        String(
          domainError &&
          domainError.message
            ? domainError.message
            : domainError
        )
      );


      throw domainError;
    }


    var result =
      profinWebAdapterNormalizeDomainOperationResult_(
        rawDomainResult,
        data
      );


    console.log(
      '[PATCH37_DOMAIN_RESULT] ' +
      JSON.stringify({
        rawType:
          typeof rawDomainResult,

        rawWasNull:
          rawDomainResult === null,

        explicitFailure:
          result.explicitFailure === true,

        operationId:
          result.operationId,

        dataId:
          profinWebAdapterClean_(
            data.id
          ),

        confirmed:
          result.ok === true
      })
    );


    /*
     * Domain core explicitly reported failure.
     */
    if (
      result.explicitFailure === true
    ) {
      throw profinWebAdapterError_(
        409,
        'DOMAIN_OPERATION_REJECTED',
        'Операцію відхилено доменним ядром.',
        'postInputOperationCore_ explicitly returned failure.',
        false
      );
    }


    /*
     * IMPORTANT:
     *
     * Web adapter DOES NOT generate operationId.
     *
     * It only accepts ID produced by the
     * existing domain core.
     */
    if (
      !result.operationId
    ) {
      throw profinWebAdapterError_(
        409,
        'DOMAIN_OPERATION_ID_MISSING',
        'Доменне ядро не повернуло ідентифікатор проведеної операції.',
        (
          'postInputOperationCore_ finished without a usable operationId. ' +
          'rawResultType=' +
          typeof rawDomainResult +
          '; data.id=' +
          String(
            profinWebAdapterClean_(
              data.id
            ) || '<empty>'
          )
        ),
        false
      );
    }


    /************************************************
     * SUCCESS RESPONSE
     ************************************************/

    return {
      version:
        PROFIN_WEB_CREATE_OPERATION_VERSION,

      operationId:
        String(
          result.operationId
        ),

      type:
        String(
          result.type ||
          data.type ||
          ''
        ),

      category:
        String(
          result.category ||
          data.category ||
          ''
        ),

      article:
        String(
          result.article ||
          data.article ||
          ''
        ),

      amount:
        Number(
          typeof result.amount !== 'undefined' &&
          result.amount !== ''
            ? result.amount
            : (
                data.amount ||
                0
              )
        ),

      warnings:
        Array.isArray(
          result.warnings
        )
          ? result.warnings
          : [],

      inventoryReceiptWritten:
        result.inventoryReceiptWritten ===
          true,

      vaccineRegistryWritten:
        result.vaccineRegistryWritten ===
          true,

      inventoryIssueWritten:
        result.inventoryIssueWritten ===
          true,

      inventoryIssue:
        profinWebAdapterSanitizeInventoryIssueResult_(
          result.inventoryIssue
        ),

      status:
        'OK'
    };

  } catch (error) {
    if (
      error &&
      error.profinStatus
    ) {
      throw error;
    }


    throw profinWebAdapterError_(
      409,
      'DOMAIN_OPERATION_REJECTED',
      'Операцію не проведено.',
      error && error.message
        ? error.message
        : String(error),
      false
    );

  } finally {
    if (
      typeof clearProfinWebOperationActorOverride_ ===
        'function'
    ) {
      clearProfinWebOperationActorOverride_();
    }


    if (locked) {
      try {
        executionLock.releaseLock();

      } catch (error) {
        console.log(
          'PATCH 37: failed to release ScriptLock: ' +
          String(
            error && error.message
              ? error.message
              : error
          )
        );
      }
    }


    if (
      previousSpreadsheet &&
      previousSpreadsheet.getId() !==
        trustedRoute.spreadsheet.getId()
    ) {
      try {
        SpreadsheetApp.setActiveSpreadsheet(
          previousSpreadsheet
        );

      } catch (error) {
        console.log(
          'PATCH 37: failed to restore active spreadsheet: ' +
          String(
            error && error.message
              ? error.message
              : error
          )
        );
      }
    }
  }
}


/****************************************************
 * NORMALIZATION
 ****************************************************/

function profinWebAdapterNormalizeOperation_(
  raw,
  request,
  trustedRoute
) {
  var date =
    profinWebAdapterParseDomainDate_(
      raw.date,
      true,
      'date'
    );


  if (
    date.getFullYear() !==
      Number(request.context.activeYear) ||
    date.getFullYear() !==
      Number(trustedRoute.info.year)
  ) {
    throw profinWebAdapterError_(
      409,
      'OPERATION_YEAR_MISMATCH',
      'Дата операції не належить активному обліковому року.',
      'Operation year differs from trusted active year.',
      false
    );
  }


  var data = {
    date:
      date,

    account:
      profinWebAdapterClean_(
        raw.account
      ),

    transferTo:
      profinWebAdapterClean_(
        raw.transferTo
      ),

    type:
      profinWebAdapterClean_(
        raw.type
      ),

    category:
      profinWebAdapterClean_(
        raw.category
      ),

    article:
      profinWebAdapterClean_(
        raw.article
      ),

    doctor:
      profinWebAdapterClean_(
        raw.doctor
      ),

    patient:
      '',

    patientId:
      profinWebAdapterClean_(
        raw.patientId
      ),

    unitPrice:
      profinWebAdapterNumberOrBlank_(
        raw.unitPrice
      ),

    quantity:
      profinWebAdapterNumberOrBlank_(
        raw.quantity
      ),

    amount:
      profinWebAdapterNumberOrBlank_(
        raw.amount
      ),

    comment:
      profinWebAdapterClean_(
        raw.comment
      ),

    id:
      '',

    packageStart:
      profinWebAdapterParseDomainDate_(
        raw.packageStart,
        false,
        'packageStart'
      ),

    packageDuration:
      profinWebAdapterNumberOrBlank_(
        raw.packageDuration
      ),

    packageMonthlyAmount:
      profinWebAdapterNumberOrBlank_(
        raw.packageMonthlyAmount
      ),

    packageAccrualStart:
      profinWebAdapterParseDomainDate_(
        raw.packageAccrualStart,
        false,
        'packageAccrualStart'
      ),

    vaccineName:
      profinWebAdapterClean_(
        raw.vaccineName ||
        raw.article
      ),

    vaccinePatient:
      '',

    vaccineQty:
      profinWebAdapterNumberOrBlank_(
        typeof raw.vaccineQty !==
          'undefined'
          ? raw.vaccineQty
          : raw.quantity
      ),

    vaccineCost:
      profinWebAdapterNumberOrBlank_(
        raw.vaccineCost
      ),

    vaccineSeries:
      profinWebAdapterClean_(
        raw.vaccineSeries
      ),

    vaccineUseDate:
      '',

    storedVaccineId:
      profinWebAdapterClean_(
        raw.storedVaccineId
      ),

    assetName:
      profinWebAdapterClean_(
        raw.assetName
      ),

    assetCategory:
      profinWebAdapterClean_(
        raw.assetCategory
      ),

    assetAmortization:
      profinWebAdapterNumberOrBlank_(
        raw.assetAmortization
      ),

    assetStartDate:
      profinWebAdapterParseDomainDate_(
        raw.assetStartDate,
        false,
        'assetStartDate'
      ),

    inventoryName:
      profinWebAdapterClean_(
        raw.inventoryName
      ),

    inventorySeries:
      profinWebAdapterClean_(
        raw.inventorySeries
      ),

    inventoryExpiryDate:
      profinWebAdapterParseDomainDate_(
        raw.inventoryExpiryDate,
        false,
        'inventoryExpiryDate'
      ),

    inventorySupplier:
      profinWebAdapterClean_(
        raw.inventorySupplier
      ),

    inventoryMinimumStock:
      ''
  };


  if (
    data.type === 'Вакцина' &&
    data.category ===
      'Продаж і використання'
  ) {
    data.vaccineUseDate =
      data.date;
  }


  if (
    typeof getInventoryTypeFromOperation_ ===
      'function'
  ) {
    var inventoryType =
      getInventoryTypeFromOperation_(
        data
      );


    if (
      inventoryType &&
      typeof getDefaultInventoryMinimumStock_ ===
        'function'
    ) {
      data.inventoryMinimumStock =
        getDefaultInventoryMinimumStock_(
          inventoryType
        );
    }
  }


  return data;
}


/****************************************************
 * WEB-SAFE SCENARIOS
 ****************************************************/

function profinWebAdapterAssertWebOperationScenario_(
  data,
  rawOperation
) {
  if (
    rawOperation.newClient ||
    rawOperation.pendingNewClient
  ) {
    throw profinWebAdapterError_(
      409,
      'WEB_NEW_CLIENT_NOT_ENABLED',
      'Створення нового клієнта через веб буде підключено окремим сценарієм.',
      'PATCH 37 accepts existing patientId only.',
      false
    );
  }


  if (
    data.type === 'Актив'
  ) {
    throw profinWebAdapterError_(
      409,
      'WEB_ASSET_NOT_ENABLED',
      'Операції з активами через веб ще не підключені.',
      'Existing asset core still reads the input sheet directly.',
      false
    );
  }


  if (
    data.type === 'Вакцина' &&
    data.category ===
      'Зміна статусу'
  ) {
    throw profinWebAdapterError_(
      409,
      'WEB_VACCINE_STATUS_NOT_ENABLED',
      'Зміна статусу вакцини через веб ще не підключена.',
      'Existing vaccine status core still reads input-sheet cells directly.',
      false
    );
  }
}


/****************************************************
 * EXISTING PATIENT RESOLUTION
 ****************************************************/

function profinWebAdapterResolveExistingPatient_(
  spreadsheet,
  data
) {
  var patientId =
    profinWebAdapterClean_(
      data.patientId
    );


  if (!patientId) {
    data.patient =
      '';

    data.vaccinePatient =
      '';

    return;
  }


  var clientsSheet =
    spreadsheet.getSheetByName(
      'Клієнтська база'
    );


  if (!clientsSheet) {
    throw profinWebAdapterError_(
      409,
      'CLIENT_DIRECTORY_MISSING',
      'Не знайдено клієнтську базу.',
      'Sheet "Клієнтська база" is missing.',
      false
    );
  }


  var rowNumber =
    typeof findClientRowById_ ===
      'function'
      ? findClientRowById_(
          clientsSheet,
          patientId
        )
      : 0;


  if (!rowNumber) {
    throw profinWebAdapterError_(
      409,
      'CLIENT_NOT_FOUND',
      'Обраного клієнта не знайдено.',
      'patientId not found: ' +
        patientId,
      false
    );
  }


  var row =
    clientsSheet
      .getRange(
        rowNumber,
        1,
        1,
        4
      )
      .getValues()[0];


  var name =
    profinWebAdapterClean_(
      row[2]
    );


  if (!name) {
    throw profinWebAdapterError_(
      409,
      'CLIENT_NAME_MISSING',
      'У картці клієнта відсутнє ім’я.',
      'Client name is empty for patientId=' +
        patientId,
      false
    );
  }


  var birthDateText =
    typeof formatClientBirthDate_ ===
      'function'
      ? formatClientBirthDate_(
          row[3]
        )
      : profinWebAdapterFormatDateFallback_(
          row[3]
        );


  data.patient =
    name +
    ' · ' +
    birthDateText;


  data.vaccinePatient =
    data.patient;
}


/****************************************************
 * REFERENCE VALUES
 ****************************************************/

function profinWebAdapterAssertReferenceValues_(
  spreadsheet,
  data
) {
  if (
    data.account &&
    typeof getAccountList_ ===
      'function'
  ) {
    var accounts =
      getAccountList_();


    if (
      accounts.indexOf(
        data.account
      ) === -1
    ) {
      throw profinWebAdapterError_(
        409,
        'INVALID_ACCOUNT',
        'Рахунок потрібно обрати з системного списку.',
        'Unknown account: ' +
          data.account,
        false
      );
    }
  }


  if (
    data.transferTo &&
    typeof getAccountList_ ===
      'function'
  ) {
    var transferAccounts =
      getAccountList_();


    if (
      transferAccounts.indexOf(
        data.transferTo
      ) === -1
    ) {
      throw profinWebAdapterError_(
        409,
        'INVALID_TRANSFER_ACCOUNT',
        'Рахунок зарахування потрібно обрати з системного списку.',
        'Unknown transferTo account: ' +
          data.transferTo,
        false
      );
    }
  }


  if (
    data.doctor &&
    typeof getDoctors_ ===
      'function'
  ) {
    var dictionarySheet =
      spreadsheet.getSheetByName(
        'Довідник'
      );


    var doctors =
      getDoctors_(
        dictionarySheet
      );


    if (
      doctors.indexOf(
        data.doctor
      ) === -1
    ) {
      throw profinWebAdapterError_(
        409,
        'INVALID_DOCTOR',
        'Лікаря потрібно обрати з системного довідника.',
        'Unknown doctor: ' +
          data.doctor,
        false
      );
    }
  }
}


/****************************************************
 * DATE / NUMBER HELPERS
 ****************************************************/

function profinWebAdapterParseDomainDate_(
  value,
  required,
  fieldName
) {
  if (
    value === '' ||
    value === null ||
    typeof value === 'undefined'
  ) {
    if (required) {
      throw profinWebAdapterError_(
        400,
        'OPERATION_DATE_REQUIRED',
        'Не вказано дату операції.',
        'Missing date field: ' +
          fieldName,
        false
      );
    }


    return '';
  }


  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(
      value.getTime()
    )
  ) {
    return value;
  }


  var text =
    String(value).trim();


  var match =
    text.match(
      /^(\d{4})-(\d{2})-(\d{2})$/
    );


  if (!match) {
    throw profinWebAdapterError_(
      400,
      'INVALID_OPERATION_DATE',
      'Некоректний формат дати.',
      fieldName +
        ' must use YYYY-MM-DD.',
      false
    );
  }


  var year =
    Number(
      match[1]
    );


  var month =
    Number(
      match[2]
    );


  var day =
    Number(
      match[3]
    );


  var parsed =
    new Date(
      year,
      month - 1,
      day
    );


  if (
    parsed.getFullYear() !==
      year ||
    parsed.getMonth() !==
      month - 1 ||
    parsed.getDate() !==
      day
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_OPERATION_DATE',
      'Некоректна календарна дата.',
      'Invalid calendar date in ' +
        fieldName +
        ': ' +
        text,
      false
    );
  }


  return parsed;
}


function profinWebAdapterNumberOrBlank_(
  value
) {
  if (
    value === '' ||
    value === null ||
    typeof value === 'undefined'
  ) {
    return '';
  }


  var numberValue =
    Number(
      value
    );


  if (
    !isFinite(
      numberValue
    )
  ) {
    return value;
  }


  return numberValue;
}


function profinWebAdapterClean_(
  value
) {
  return String(
    value || ''
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


function profinWebAdapterFormatDateFallback_(
  value
) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(
      value.getTime()
    )
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      'dd.MM.yyyy'
    );
  }


  return (
    profinWebAdapterClean_(
      value
    ) ||
    'дата не вказана'
  );
}


/****************************************************
 * PATCH 37
 * LEGACY DOMAIN RESULT NORMALIZER
 ****************************************************/

function profinWebAdapterNormalizeDomainOperationResult_(
  rawResult,
  data
) {
  var normalized = {
    ok:
      false,

    explicitFailure:
      false,

    operationId:
      '',

    type:
      '',

    category:
      '',

    article:
      '',

    amount:
      '',

    warnings:
      [],

    inventoryReceiptWritten:
      false,

    vaccineRegistryWritten:
      false,

    inventoryIssueWritten:
      false,

    inventoryIssue:
      null
  };


  /**************************************************
   * EXPLICIT PRIMITIVE FAILURE
   **************************************************/

  if (
    rawResult === false
  ) {
    normalized.explicitFailure =
      true;

    return normalized;
  }


  /**************************************************
   * STRING / NUMBER AS LEGACY OPERATION ID
   **************************************************/

  if (
    typeof rawResult ===
      'string' ||
    typeof rawResult ===
      'number'
  ) {
    normalized.operationId =
      profinWebAdapterClean_(
        rawResult
      );
  }


  /**************************************************
   * OBJECT RESULT
   **************************************************/

  if (
    rawResult &&
    typeof rawResult ===
      'object' &&
    !Array.isArray(
      rawResult
    )
  ) {
    /*
     * Absence of "ok" is NOT failure.
     *
     * Only an explicit false is treated
     * as domain rejection.
     */
    if (
      rawResult.ok === false ||
      rawResult.success === false
    ) {
      normalized.explicitFailure =
        true;

      return normalized;
    }


    normalized.operationId =
      profinWebAdapterClean_(
        rawResult.operationId ||
        rawResult.id
      );


    normalized.type =
      profinWebAdapterClean_(
        rawResult.type
      );


    normalized.category =
      profinWebAdapterClean_(
        rawResult.category
      );


    normalized.article =
      profinWebAdapterClean_(
        rawResult.article
      );


    if (
      typeof rawResult.amount !==
        'undefined'
    ) {
      normalized.amount =
        rawResult.amount;
    }


    normalized.warnings =
      Array.isArray(
        rawResult.warnings
      )
        ? rawResult.warnings
        : [];


    normalized.inventoryReceiptWritten =
      rawResult.inventoryReceiptWritten ===
        true;


    normalized.vaccineRegistryWritten =
      rawResult.vaccineRegistryWritten ===
        true;


    normalized.inventoryIssueWritten =
      rawResult.inventoryIssueWritten ===
        true;


    normalized.inventoryIssue =
      rawResult.inventoryIssue ||
      null;
  }


  /**************************************************
   * LEGACY MUTATED DATA OBJECT
   **************************************************/

  /*
   * Existing core may assign generated operation ID
   * directly into the object passed to it.
   *
   * Web adapter does NOT generate an ID.
   * It only reads an ID produced by domain core.
   */
  if (
    !normalized.operationId &&
    data
  ) {
    normalized.operationId =
      profinWebAdapterClean_(
        data.operationId ||
        data.id
      );
  }


  /**************************************************
   * CONFIRMATION
   **************************************************/

  normalized.ok =
    normalized.explicitFailure !==
      true &&
    Boolean(
      normalized.operationId
    );


  return normalized;
}


/****************************************************
 * RESPONSE SANITIZER
 ****************************************************/

function profinWebAdapterSanitizeInventoryIssueResult_(
  value
) {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return null;
  }


  return {
    ok:
      value.ok ===
        true,

    requiresIssue:
      value.requiresIssue ===
        true,

    inventoryType:
      String(
        value.inventoryType ||
        ''
      ),

    inventoryName:
      String(
        value.inventoryName ||
        ''
      ),

    operationId:
      String(
        value.operationId ||
        ''
      ),

    movementIds:
      Array.isArray(
        value.movementIds
      )
        ? value.movementIds.map(
            function(item) {
              return String(
                item
              );
            }
          )
        : [],

    totalCost:
      Number(
        value.totalCost ||
        0
      ),

    averageUnitCost:
      Number(
        value.averageUnitCost ||
        0
      ),

    userMessage:
      String(
        value.userMessage ||
        ''
      )
  };
}