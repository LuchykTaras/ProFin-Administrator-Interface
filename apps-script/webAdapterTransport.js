/*
 * PROFIN OS — BABURKA
 *
 * WEB ADAPTER TRANSPORT
 *
 * PATCH A8.3 — CLIENT CREATE
 *
 * HMAC + Replay Protection
 * Trusted Annual Route
 * Schema Guard
 * Idempotency
 *
 * PRODUCTION — BABURKA
 *
 * Client creation writes remain disabled
 * until explicit production activation.
 */

/****************************************************
 * PROFIN OS
 * WEB ADAPTER TRANSPORT
 * --------------------------------------------------
 * PATCH 37.4
 *
 * 29 transport
 * 30 HMAC
 * 31 replay / nonce
 * 32 idempotency
 * 33 trusted annual route + schema guard
 * 34 createOperationWeb
 * 37.4 getOperationFormSchemaWeb
 ****************************************************/


var PROFIN_WEB_ADAPTER_PROTOCOL_VERSION =
  'PROFIN_APPS_SCRIPT_ADAPTER_V1';


var PROFIN_WEB_ADAPTER_VERSION =
  'PROFIN_APPS_SCRIPT_WEB_ADAPTER_PATCH_61_71_BAB_PROD_READ_2026';

var PROFIN_WEB_ADAPTER_BUILD_ID =
  'PROFIN_WEB_ADAPTER_BAB_PROD_READ_2026_10_26';


/****************************************************
 * ENTRYPOINT
 ****************************************************/

function doPost(e) {
  var requestId =
    Utilities.getUuid();


  try {
    var request =
      profinWebAdapterParseRequest_(
        e
      );


    if (
      request.requestId &&
      typeof request.requestId ===
        'string'
    ) {
      requestId =
        request.requestId;
    }


    /*
     * 1. STRUCTURE
     */
    profinWebAdapterValidateEnvelope_(
      request
    );


    /*
     * 2. HMAC
     */
    profinWebAdapterVerifyHmac_(
      request
    );


    /*
     * 3. REPLAY PROTECTION
     */
    profinWebAdapterAssertFreshRequest_(
      request
    );


    /*
     * 4. PATCH 33
     *
     * HMAC уже перевірено,
     * отже annualRoute є signed context.
     */
    var trustedRoute =
      profinWebAdapterResolveTrustedAnnualRoute_(
        request
      );


    /*
     * 5. SCHEMA GUARD
     */
   var schemaInfo =
  profinWebAdapterAssertCoreSchema_(
    trustedRoute.spreadsheet
  );


/**************************************************
 * R3-03D BABURKA FINANCIAL READ / ACL CHECK
 * The HMAC, nonce, annual route and schema were
 * verified above. This branch NEVER submits.
 **************************************************/
if (request.command === 'getShiftFinancialSnapshot') {
  if (typeof profinR3BabSecureRead_ !== 'function') {
    throw profinWebAdapterError_(
      503, 'R3_BAB_SECURE_READ_NOT_INSTALLED',
      'Financial read handler unavailable.',
      'profinR3BabSecureRead_ missing.', false
    );
  }
  var r3BabResult = profinR3BabSecureRead_(request, trustedRoute);
  return profinWebAdapterSuccessResponse_(requestId, {
    result: r3BabResult,
    status: 'OK',
    receivedAt: new Date().toISOString()
  });
}

/**************************************************
 * PATCH 61.71
 * BABURKA PRODUCTION READ-ONLY COMMANDS
 **************************************************/

if (
  request.command === 'getOperationJournal' ||
  request.command === 'getClientBirthdaysWeb'
) {
  var handler61_71 =
    request.command === 'getOperationJournal'
      ? (
          typeof profinWebAdapterGetOperationJournal61_71_ ===
            'function'
            ? profinWebAdapterGetOperationJournal61_71_
            : null
        )
      : (
    typeof profinWebAdapterGetClientBirthdays61_71 ===
      'function'
      ? profinWebAdapterGetClientBirthdays61_71
      : null
  );

  if (!handler61_71) {
    throw profinWebAdapterError_(
      503,
      'BAB_PROD_READ_HANDLER_MISSING_61_71',
      'Модуль читання тимчасово недоступний.',
      'Signed read-only handler is not installed.',
      false
    );
  }

  var result61_71 =
    handler61_71(
      request,
      trustedRoute
    );

  return profinWebAdapterSuccessResponse_(
    requestId,
    {
      result: result61_71,
      status: 'OK',
      receivedAt: new Date().toISOString()
    }
  );
}

/**************************************************
 * PATCH A
 * BABURKA CLIENT DIRECTORY
 * READ ONLY
 **************************************************/

if (request.command === 'getClientsWeb') {

  if (
    typeof profinWebAdapterGetClientsBab2026 !==
    'function'
  ) {
    throw profinWebAdapterError_(
      503,
      'CLIENT_DIRECTORY_HANDLER_MISSING_A',
      'Модуль клієнтської бази не підключений.',
      'profinWebAdapterGetClientsBab2026 is missing.',
      false
    );
  }

  var directoryResultA =
    profinWebAdapterGetClientsBab2026(
      request,
      trustedRoute
    );

  return profinWebAdapterSuccessResponse_(
    requestId,
    {
      result: directoryResultA,
      status: 'OK',
      receivedAt: new Date().toISOString()
    }
  );
}

/**************************************************
 * PATCH A8.3
 * BABURKA PRODUCTION CLIENT CREATE
 *
 * HMAC, replay protection, trusted annual route
 * and schema guard were verified above.
 **************************************************/

if (request.command === 'createClientWeb') {

  if (
    typeof profinWebAdapterCreateClientA83_ !==
    'function'
  ) {
    throw profinWebAdapterError_(
      503,
      'A83_HANDLER_MISSING',
      'Модуль створення клієнтів не підключено.',
      'profinWebAdapterCreateClientA83_ missing.',
      false
    );
  }

  var createClientResultA83 =
    profinWebAdapterCreateClientA83_(
      request,
      trustedRoute
    );

  return profinWebAdapterSuccessResponse_(
    requestId,
    {
      result: createClientResultA83,
      status: 'OK',
      receivedAt: new Date().toISOString()
    }
  );
}


/**************************************************
 * PATCH BAB-INVENTORY-READ-V1
 *
 * BABURKA PRODUCTION
 * READ-ONLY INVENTORY
 *
 * No writes.
 * No transfer commands.
 * No changes to Cash or Journal.
 **************************************************/

if (
  request.command === 'getInventory'
) {
  if (
  typeof profinWebAdapterGetInventoryBab2026 !==
    'function'
) {
  throw profinWebAdapterError_(
    503,
    'BAB_INVENTORY_READ_HANDLER_MISSING',
    'Модуль читання складу не підключено.',
    'profinWebAdapterGetInventoryBab2026 is missing.',
    false
  );
}

var inventoryReadResult =
  profinWebAdapterGetInventoryBab2026(
    request,
    trustedRoute
  );

  return profinWebAdapterSuccessResponse_(
    requestId,
    {
      result: inventoryReadResult,
      status: 'OK',
      receivedAt: new Date().toISOString()
    }
  );
}


/*
 * PATCH G5.8.91
 * READ-ONLY TRANSFER PLAN
 */
if (request.command === 'previewTransfer') {
  if (
    typeof profinWebAdapterPreviewTransferReadOnly_ !==
    'function'
  ) {
    throw profinWebAdapterError_(
      503,
      'TRANSFER_PLAN_HANDLER_MISSING',
      'Модуль планування не підключено.',
      'Missing read-only transfer planner.',
      false
    );
  }

  var planReadOnly =
    profinWebAdapterPreviewTransferReadOnly_(
      request,
      trustedRoute
    );

  return profinWebAdapterSuccessResponse_(
    requestId,
    {
      result: planReadOnly,
      status: 'OK',
      receivedAt: new Date().toISOString()
    }
  );
}

/*
 * BABURKA TRANSFER INBOX — READ ONLY
 */
if (request.command === 'getTransferInbox') {
  if (
    typeof profinWebAdapterGetTransferInboxBab2026_ !==
    'function'
  ) {
    throw profinWebAdapterError_(
      503,
      'BAB_TRANSFER_INBOX_HANDLER_MISSING',
      'Модуль вхідних переміщень не підключено.',
      'Missing Baburka inbox reader.',
      false
    );
  }

    const inbox =
    profinWebAdapterGetTransferInboxBab2026_(
      request,
      trustedRoute
    );

  return profinWebAdapterSuccessResponse_(
    requestId,
    {
      result: inbox,
      status: 'OK',
      receivedAt: new Date().toISOString()
    }
  );
}

/*
 * PATCH 14.4
 * BABURKA TRANSFER OUTBOX — READ ONLY
 */
if (request.command === 'getTransferOutbox') {
  if (
    typeof profinWebAdapterGetTransferOutboxBab2026_ !==
    'function'
  ) {
    throw profinWebAdapterError_(
      503,
      'BAB_TRANSFER_OUTBOX_HANDLER_MISSING',
      'Модуль відправлених переміщень не підключено.',
      'Missing profinWebAdapterGetTransferOutboxBab2026_.',
      false
    );
  }

  var outbox =
    profinWebAdapterGetTransferOutboxBab2026_(
      request,
      trustedRoute
    );

  if (!outbox || !Array.isArray(outbox.items)) {
    throw profinWebAdapterError_(
      502,
      'BAB_TRANSFER_OUTBOX_INVALID_RESULT',
      'Некоректна відповідь журналу відправлених переміщень.',
      'getTransferOutbox must return an object with items array.',
      false
    );
  }

  return profinWebAdapterSuccessResponse_(
    requestId,
    {
      result: outbox,
      status: 'OK',
      receivedAt: new Date().toISOString()
    }
  );
}

    if (
      request.command ===
        'ping'
    ) {
      return profinWebAdapterSuccessResponse_(
        requestId,
        {
          transport:
            'OK',

          adapter:
            'PROFIN_APPS_SCRIPT_WEB_ADAPTER',

          adapterVersion:
            PROFIN_WEB_ADAPTER_VERSION,

          security:
            'HMAC-SHA256',

          replayProtection:
            'SIGNED_NONCE',

          replay:
            profinWebAdapterReplayInfo_(),

          idempotency:
            profinWebAdapterIdempotencyInfo_(),

          annualRoute:
            trustedRoute.info,

          schema:
            schemaInfo,

          status:
            'OK',

          receivedAt:
            new Date()
              .toISOString()
        }
      );
    }


    /**************************************************
     * PATCH 37.4
     * READ-ONLY OPERATION FORM SCHEMA
     **************************************************/

    if (
      request.command ===
        'getOperationFormSchemaWeb'
    ) {
      if (
        typeof profinWebAdapterGetOperationFormSchema_ !==
          'function'
      ) {
        throw profinWebAdapterError_(
          500,
          'DOMAIN_FORM_SCHEMA_MISSING',
          'Доменний контракт форми операції недоступний.',
          'profinWebAdapterGetOperationFormSchema_ is not defined.',
          false
        );
      }


      var operationFormSchema =
        profinWebAdapterGetOperationFormSchema_(
          request,
          trustedRoute
        );


      return profinWebAdapterSuccessResponse_(
        requestId,
        {
          transport:
            'OK',

          adapter:
            'PROFIN_APPS_SCRIPT_WEB_ADAPTER',

          adapterVersion:
            PROFIN_WEB_ADAPTER_VERSION,

          security:
            'HMAC-SHA256',

          replayProtection:
            'SIGNED_NONCE',

          replay:
            profinWebAdapterReplayInfo_(),

          idempotency:
            profinWebAdapterIdempotencyInfo_(),

          annualRoute:
            trustedRoute.info,

          schema:
            schemaInfo,

          result:
            operationFormSchema,

          status:
            'OK',

          receivedAt:
            new Date()
              .toISOString()
        }
      );
    }


    /*
     * PATCH 32 IDEMPOTENCY PROBE
     */
    if (
      request.command ===
        'idempotencyProbe'
    ) {
      var wrapped =
        profinWebAdapterExecuteIdempotent_(
          request,
          function() {
            return {
              probe:
                'OK',

              executionId:
                Utilities.getUuid(),

              executedAt:
                new Date()
                  .toISOString()
            };
          }
        );


      return profinWebAdapterSuccessResponse_(
        requestId,
        {
          transport:
            'OK',

          adapter:
            'PROFIN_APPS_SCRIPT_WEB_ADAPTER',

          adapterVersion:
            PROFIN_WEB_ADAPTER_VERSION,

          security:
            'HMAC-SHA256',

          replayProtection:
            'SIGNED_NONCE',

          replay:
            profinWebAdapterReplayInfo_(),

          idempotency:
            profinWebAdapterIdempotencyInfo_(),

          annualRoute:
            trustedRoute.info,

          schema:
            schemaInfo,

          idempotencyReplayed:
            wrapped.replayed,

          idempotencyKey:
            wrapped.idempotencyKey,

          result:
            wrapped.result,

          status:
            'OK',

          receivedAt:
            new Date()
              .toISOString()
        }
      );
    }


    /*
     * PATCH 34
     *
     * Реальна domain command:
     * createOperationWeb
     *
     * Бізнес-логіка залишається
     * у domain core.
     */
    if (
      request.command ===
        'createOperationWeb'
    ) {
      var createOperationWrapped =
        profinWebAdapterExecuteIdempotent_(
          request,
          function() {
            return profinWebAdapterCreateOperation_(
              request,
              trustedRoute
            );
          }
        );


      return profinWebAdapterSuccessResponse_(
        requestId,
        {
          transport:
            'OK',

          adapter:
            'PROFIN_APPS_SCRIPT_WEB_ADAPTER',

          adapterVersion:
            PROFIN_WEB_ADAPTER_VERSION,

          security:
            'HMAC-SHA256',

          replayProtection:
            'SIGNED_NONCE',

          replay:
            profinWebAdapterReplayInfo_(),

          idempotency:
            profinWebAdapterIdempotencyInfo_(),

          annualRoute:
            trustedRoute.info,

          schema:
            schemaInfo,

          idempotencyReplayed:
            createOperationWrapped.replayed,

          idempotencyKey:
            createOperationWrapped.idempotencyKey,

          result:
            createOperationWrapped.result,

          status:
            'OK',

          receivedAt:
            new Date()
              .toISOString()
        }
      );
    }

        /**************************************************
     * PATCH 35 — OPERATIONAL COMMANDS
     **************************************************/

    var operationalHandler = null;

    if (
      request.command ===
        'cancelOperation'
    ) {
      if (
        typeof profinWebAdapterCancelOperation_ !==
          'function'
      ) {
        throw profinWebAdapterError_(
          500,
          'CANCEL_OPERATION_ADAPTER_MISSING',
          'Команда скасування тимчасово недоступна.',
          'profinWebAdapterCancelOperation_ is not defined.',
          false
        );
      }

      operationalHandler =
        profinWebAdapterCancelOperation_;
    }

    if (
      request.command ===
        'createTransfer'
    ) {
      if (
        typeof profinWebAdapterCreateTransfer_ !==
          'function'
      ) {
        throw profinWebAdapterError_(
          500,
          'CREATE_TRANSFER_ADAPTER_MISSING',
          'Команда переміщення тимчасово недоступна.',
          'profinWebAdapterCreateTransfer_ is not defined.',
          false
        );
      }

      operationalHandler =
        profinWebAdapterCreateTransfer_;
    }

    if (
      request.command ===
        'acceptTransfer'
    ) {
      if (
        typeof profinWebAdapterAcceptTransfer_ !==
          'function'
      ) {
        throw profinWebAdapterError_(
          500,
          'ACCEPT_TRANSFER_ADAPTER_MISSING',
          'Команда приймання переміщення тимчасово недоступна.',
          'profinWebAdapterAcceptTransfer_ is not defined.',
          false
        );
      }

      operationalHandler =
        profinWebAdapterAcceptTransfer_;
    }

    if (
      request.command ===
        'closeShift'
    ) {
      if (
        typeof profinWebAdapterCloseShift_ !==
          'function'
      ) {
        throw profinWebAdapterError_(
          500,
          'CLOSE_SHIFT_ADAPTER_MISSING',
          'Команда закриття зміни тимчасово недоступна.',
          'profinWebAdapterCloseShift_ is not defined.',
          false
        );
      }

      operationalHandler =
        profinWebAdapterCloseShift_;
    }

    if (operationalHandler) {
      var operationalWrapped =
        profinWebAdapterExecuteIdempotent_(
          request,
          function() {
            return operationalHandler(
              request,
              trustedRoute
            );
          }
        );

      return profinWebAdapterSuccessResponse_(
        requestId,
        {
          transport:
            'OK',

          adapter:
            'PROFIN_APPS_SCRIPT_WEB_ADAPTER',

          adapterVersion:
            PROFIN_WEB_ADAPTER_VERSION,

          security:
            'HMAC-SHA256',

          replayProtection:
            'SIGNED_NONCE',

          replay:
            profinWebAdapterReplayInfo_(),

          idempotency:
            profinWebAdapterIdempotencyInfo_(),

          annualRoute:
            trustedRoute.info,

          schema:
            schemaInfo,

          idempotencyReplayed:
            operationalWrapped.replayed,

          idempotencyKey:
            operationalWrapped.idempotencyKey,

          result:
            operationalWrapped.result,

          status:
            'OK',

          receivedAt:
            new Date()
              .toISOString()
        }
      );
    }

    /*
     * Інші domain commands
     * підключаються окремими roadmap patches.
     */
    var unknownCommand =
      String(request.command || '');

    console.error(
      '[PROFIN_COMMAND_NOT_ENABLED] ' +
      JSON.stringify({
        adapterBuildId:
          PROFIN_WEB_ADAPTER_BUILD_ID,
        commandJson:
          JSON.stringify(unknownCommand),
        commandType:
          typeof request.command,
        commandLength:
          unknownCommand.length,
        commandCharCodes:
          unknownCommand.split('').map(
            function(character) {
              return character.charCodeAt(0);
            }
          )
      })
    );

    throw profinWebAdapterError_(
      403,
      'COMMAND_NOT_ENABLED',
      'Ця команда ще не дозволена через вебадаптер.',
      'Command is not enabled: ' +
        String(
          request.command || ''
        ),
      false
    );

  } catch (error) {
    console.error(
      JSON.stringify({
        scope:
          'PROFIN_WEB_ADAPTER',

        requestId:
          requestId,

        message:
          error &&
          error.message
            ? error.message
            : String(
                error
              ),

        stack:
          error &&
          error.stack
            ? error.stack
            : null
      })
    );


    return profinWebAdapterJson_(
      profinWebAdapterFailure_(
        requestId,
        error
      )
    );
  }
}


/****************************************************
 * REQUEST PARSER
 ****************************************************/

function profinWebAdapterParseRequest_(e) {
  if (
    !e ||
    !e.postData ||
    typeof e.postData.contents !==
      'string' ||
    !e.postData.contents
  ) {
    throw profinWebAdapterError_(
      400,
      'EMPTY_REQUEST_BODY',
      'Порожній запит до Apps Script adapter.',
      'e.postData.contents is missing.',
      false
    );
  }


  var parsed;


  try {
    parsed =
      JSON.parse(
        e.postData.contents
      );

  } catch (error) {
    throw profinWebAdapterError_(
      400,
      'INVALID_JSON',
      'Некоректний JSON-запит.',
      error &&
      error.message
        ? error.message
        : 'JSON parse failed.',
      false
    );
  }


  if (
    !parsed ||
    typeof parsed !==
      'object' ||
    Array.isArray(
      parsed
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_REQUEST_ENVELOPE',
      'Некоректний формат запиту.',
      'Request body must be a JSON object.',
      false
    );
  }


  return parsed;
}


/****************************************************
 * ENVELOPE
 ****************************************************/

function profinWebAdapterValidateEnvelope_(
  request
) {
  if (
    request.protocolVersion !==
      PROFIN_WEB_ADAPTER_PROTOCOL_VERSION
  ) {
    throw profinWebAdapterError_(
      400,
      'PROTOCOL_VERSION_MISMATCH',
      'Несумісна версія протоколу вебадаптера.',
      'Expected ' +
        PROFIN_WEB_ADAPTER_PROTOCOL_VERSION +
        ', got ' +
        String(
          request.protocolVersion
        ),
      false
    );
  }


  profinWebAdapterRequireString_(
    request,
    'clientVersion'
  );


  profinWebAdapterRequireString_(
    request,
    'requestId'
  );


  profinWebAdapterRequireString_(
    request,
    'command'
  );


  profinWebAdapterRequireString_(
    request,
    'sentAt'
  );


  profinWebAdapterRequireString_(
    request,
    'nonce'
  );


  if (
    !/^[0-9a-fA-F]{32}$/.test(
      request.nonce
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_NONCE',
      'Некоректний nonce запиту.',
      'nonce must contain 32 hexadecimal characters.',
      false
    );
  }


  if (
    !request.context ||
    typeof request.context !==
      'object' ||
    Array.isArray(
      request.context
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'CONTEXT_REQUIRED',
      'Відсутній контекст команди.',
      'context must be an object.',
      false
    );
  }


  profinWebAdapterRequireString_(
    request.context,
    'projectId'
  );


  profinWebAdapterRequireString_(
    request.context,
    'locationId'
  );


  profinWebAdapterRequireString_(
    request.context,
    'userId'
  );


  profinWebAdapterRequireString_(
    request.context,
    'role'
  );


  profinWebAdapterRequireString_(
    request.context,
    'timezone'
  );


  profinWebAdapterRequireString_(
    request.context,
    'locale'
  );


  if (
    typeof request.context.activeYear !==
      'number' ||
    !isFinite(
      request.context.activeYear
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'ACTIVE_YEAR_REQUIRED',
      'Відсутній активний обліковий рік.',
      'context.activeYear must be a number.',
      false
    );
  }


  /*
   * PATCH 33.
   */
  if (
    !request.context.annualRoute ||
    typeof request.context.annualRoute !==
      'object' ||
    Array.isArray(
      request.context.annualRoute
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'ANNUAL_ROUTE_REQUIRED',
      'Відсутній серверний маршрут активного року.',
      'context.annualRoute is required.',
      false
    );
  }


  if (
    typeof request.payload ===
      'undefined'
  ) {
    throw profinWebAdapterError_(
      400,
      'PAYLOAD_REQUIRED',
      'Відсутній payload команди.',
      'payload property is required.',
      false
    );
  }


  /*
   * PATCH 32.
   *
   * Idempotency потрібна тільки
   * для write-команд.
   */
  if (
    profinWebAdapterCommandRequiresIdempotency_(
      request.command
    )
  ) {
    profinWebAdapterValidateIdempotencyKey_(
      request.idempotencyKey
    );

  } else {
    if (
      request.idempotencyKey !==
        null
    ) {
      throw profinWebAdapterError_(
        400,
        'UNEXPECTED_IDEMPOTENCY_KEY',
        'Некоректний transport contract.',
        'Read-only command expects idempotencyKey=null.',
        false
      );
    }
  }


  if (
    !request.auth ||
    typeof request.auth !==
      'object' ||
    Array.isArray(
      request.auth
    )
  ) {
    throw profinWebAdapterError_(
      401,
      'HMAC_AUTH_REQUIRED',
      'Відсутній захищений підпис команди.',
      'auth object is required.',
      false
    );
  }


  if (
    request.auth.scheme !==
      'HMAC-SHA256'
  ) {
    throw profinWebAdapterError_(
      401,
      'HMAC_REQUIRED',
      'Команда не має допустимого HMAC-підпису.',
      'Expected auth.scheme=HMAC-SHA256.',
      false
    );
  }


  profinWebAdapterRequireString_(
    request.auth,
    'keyId'
  );


  profinWebAdapterRequireString_(
    request.auth,
    'signature'
  );


  return true;
}


/****************************************************
 * IDEMPOTENCY COMMAND POLICY
 ****************************************************/

function profinWebAdapterCommandRequiresIdempotency_(
  command
) {
  return [
  'idempotencyProbe',
  'createClientWeb',
  'createOperationWeb',
  'createTransfer',
    'acceptTransfer',
    'cancelOperation',
    'requestCorrection',
    'closeShift'
  ].indexOf(
    String(
      command
    )
  ) !==
    -1;
}


/****************************************************
 * STRING HELPER
 ****************************************************/

function profinWebAdapterRequireString_(
  object,
  key
) {
  if (
    !object ||
    typeof object[key] !==
      'string' ||
    !object[key].trim()
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_REQUIRED_FIELD',
      'Некоректний transport contract.',
      'Missing or empty field: ' +
        key,
      false
    );
  }


  return true;
}


/****************************************************
 * SUCCESS
 ****************************************************/

function profinWebAdapterSuccessResponse_(
  requestId,
  data
) {
  return profinWebAdapterJson_({
    protocolVersion:
      PROFIN_WEB_ADAPTER_PROTOCOL_VERSION,

    adapterBuildId:
      PROFIN_WEB_ADAPTER_BUILD_ID,

    requestId:
      requestId,

    ok:
      true,

    status:
      200,

    code:
      'APPS_SCRIPT_TRANSPORT_OK',

    userMessage:
      'Вебзв’язок з Apps Script adapter встановлено.',

    technicalMessage:
      null,

    data:
      data,

    retryable:
      false
  });
}


/****************************************************
 * ERROR
 ****************************************************/

function profinWebAdapterError_(
  status,
  code,
  userMessage,
  technicalMessage,
  retryable
) {
  var error =
    new Error(
      technicalMessage ||
      userMessage
    );


  error.profinStatus =
    status;


  error.profinCode =
    code;


  error.profinUserMessage =
    userMessage;


  error.profinTechnicalMessage =
    technicalMessage ||
    null;


  error.profinRetryable =
    Boolean(
      retryable
    );


  return error;
}


/****************************************************
 * FAILURE
 ****************************************************/

function profinWebAdapterFailure_(
  requestId,
  error
) {
  return {
    protocolVersion:
      PROFIN_WEB_ADAPTER_PROTOCOL_VERSION,

    adapterBuildId:
      PROFIN_WEB_ADAPTER_BUILD_ID,

    requestId:
      requestId,

    ok:
      false,

    status:
      error &&
      error.profinStatus
        ? Number(
            error.profinStatus
          )
        : 500,

    code:
      error &&
      error.profinCode
        ? String(
            error.profinCode
          )
        : 'APPS_SCRIPT_INTERNAL_ERROR',

    userMessage:
      error &&
      error.profinUserMessage
        ? String(
            error.profinUserMessage
          )
        : 'Внутрішня помилка Apps Script adapter.',

    technicalMessage:
      error &&
      error.profinTechnicalMessage
        ? String(
            error.profinTechnicalMessage
          )
        : (
            error &&
            error.message
              ? String(
                  error.message
                )
              : null
          ),

    data:
      null,

    retryable:
      Boolean(
        error &&
        error.profinRetryable
      )
  };
}


/****************************************************
 * JSON
 ****************************************************/

function profinWebAdapterJson_(
  value
) {
  return ContentService
    .createTextOutput(
      JSON.stringify(
        value
      )
    )
    .setMimeType(
      ContentService
        .MimeType
        .JSON
    );
}