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
  'PROFIN_APPS_SCRIPT_WEB_ADAPTER_PATCH_37_4_2026';


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


    /*
     * READ-ONLY PING
     */
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


    /*
     * Інші domain commands
     * підключаються окремими roadmap patches.
     */
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