/****************************************************
 * PROFIN OS
 * WEB ADAPTER TRANSPORT
 * --------------------------------------------------
 * PATCH 30
 *
 * Next.js -> Apps Script transport.
 *
 * PATCH 30:
 * - HMAC-SHA256 verification
 * - shared secret is stored only in
 *   Script Properties / Next.js env
 *
 * На цьому етапі дозволена
 * ТІЛЬКИ команда ping.
 *
 * Replay protection -> PATCH 31.
 * Idempotency -> PATCH 32.
 ****************************************************/


var PROFIN_WEB_ADAPTER_PROTOCOL_VERSION =
  'PROFIN_APPS_SCRIPT_ADAPTER_V1';


var PROFIN_WEB_ADAPTER_VERSION =
  'PROFIN_APPS_SCRIPT_WEB_ADAPTER_PATCH_30_2026';


/****************************************************
 * PUBLIC WEB APP ENTRYPOINT
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
     * 1. Базовий transport envelope.
     */
    profinWebAdapterValidateEnvelope_(
      request
    );


    /*
     * 2. PATCH 30:
     * HMAC-SHA256 verification.
     *
     * scheme / keyId / signature /
     * canonical body перевіряються
     * централізовано в
     * webAdapterSecurity.js.
     */
    profinWebAdapterVerifyHmac_(
      request
    );


    /*
     * До PATCH 31/32/33/34
     * write-команди не дозволяємо.
     */
    if (
      request.command !==
      'ping'
    ) {
      throw profinWebAdapterError_(
        403,
        'COMMAND_NOT_ENABLED',
        'Ця команда ще не дозволена через вебадаптер.',
        'PATCH 30 allows only signed ping before replay/idempotency/schema protection.',
        false
      );
    }


    var result =
      profinWebAdapterHandlePing_(
        request
      );


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
        'APPS_SCRIPT_PING_OK',

      userMessage:
        'Apps Script adapter доступний.',

      technicalMessage:
        null,

      data:
        result,

      retryable:
        false
    });

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
            : String(error),

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
      error.message,
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
 * BASE ENVELOPE VALIDATION
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


  if (
    !request.clientVersion ||
    typeof request.clientVersion !==
      'string'
  ) {
    throw profinWebAdapterError_(
      400,
      'CLIENT_VERSION_REQUIRED',
      'Відсутня версія клієнта.',
      'clientVersion must be a non-empty string.',
      false
    );
  }


  if (
    !request.requestId ||
    typeof request.requestId !==
      'string'
  ) {
    throw profinWebAdapterError_(
      400,
      'REQUEST_ID_REQUIRED',
      'Відсутній requestId.',
      'requestId must be a non-empty string.',
      false
    );
  }


  if (
    !request.command ||
    typeof request.command !==
      'string'
  ) {
    throw profinWebAdapterError_(
      400,
      'COMMAND_REQUIRED',
      'Не вказано команду.',
      'command must be a non-empty string.',
      false
    );
  }


  if (
    !request.sentAt ||
    typeof request.sentAt !==
      'string'
  ) {
    throw profinWebAdapterError_(
      400,
      'SENT_AT_REQUIRED',
      'Не вказано час створення команди.',
      'sentAt must be provided.',
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
      'context must be a JSON object.',
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
   * PATCH 32 ще не активний,
   * тому поки вимагаємо null.
   */
  if (
    request.idempotencyKey !==
      null
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_PATCH_30_IDEMPOTENCY_KEY',
      'Некоректний transport contract.',
      'PATCH 30 expects idempotencyKey=null.',
      false
    );
  }


  /*
   * PATCH 30:
   * auth вже НЕ NONE.
   *
   * На transport-рівні перевіряємо
   * тільки наявність правильного
   * HMAC envelope.
   *
   * Повна криптографічна перевірка
   * виконується webAdapterSecurity.js.
   */
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
      'PATCH 30 requires auth.scheme=HMAC-SHA256.',
      false
    );
  }
}


/****************************************************
 * FIELD VALIDATION HELPER
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
      'INVALID_CONTEXT_FIELD',
      'Некоректний контекст команди.',
      'Missing context field: ' +
        key,
      false
    );
  }
}


/****************************************************
 * PING
 ****************************************************/

function profinWebAdapterHandlePing_(
  request
) {
  /*
   * Нічого в таблицю не пишемо.
   * Domain core не запускаємо.
   */

  return {
    adapter:
      'PROFIN_APPS_SCRIPT_WEB_ADAPTER',

    adapterVersion:
      PROFIN_WEB_ADAPTER_VERSION,

    security:
      'HMAC-SHA256',

    status:
      'OK',

    receivedAt:
      new Date()
        .toISOString()
  };
}


/****************************************************
 * ERROR FACTORY
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
 * ERROR -> RESPONSE
 ****************************************************/

function profinWebAdapterFailure_(
  requestId,
  error
) {
  var status =
    error &&
    error.profinStatus
      ? Number(
          error.profinStatus
        )
      : 500;


  var code =
    error &&
    error.profinCode
      ? String(
          error.profinCode
        )
      : 'APPS_SCRIPT_INTERNAL_ERROR';


  var userMessage =
    error &&
    error.profinUserMessage
      ? String(
          error.profinUserMessage
        )
      : 'Внутрішня помилка Apps Script adapter.';


  var technicalMessage =
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
        );


  return {
    protocolVersion:
      PROFIN_WEB_ADAPTER_PROTOCOL_VERSION,

    requestId:
      requestId,

    ok:
      false,

    status:
      status,

    code:
      code,

    userMessage:
      userMessage,

    technicalMessage:
      technicalMessage,

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
 * JSON RESPONSE
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