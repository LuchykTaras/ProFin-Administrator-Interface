/****************************************************
 * PROFIN OS
 * WEB ADAPTER SECURITY
 * --------------------------------------------------
 * PATCH 31
 *
 * Security:
 * - HMAC-SHA256
 * - canonical request V1
 * - signed timestamp
 * - nonce
 * - replay protection
 ****************************************************/


var PROFIN_WEB_ADAPTER_HMAC_SCHEME =
  'HMAC-SHA256';


var PROFIN_WEB_ADAPTER_HMAC_SECRET_PROPERTY =
  'PROFIN_WEB_ADAPTER_HMAC_SECRET';


var PROFIN_WEB_ADAPTER_HMAC_KEY_ID_PROPERTY =
  'PROFIN_WEB_ADAPTER_HMAC_KEY_ID';


var PROFIN_HMAC_CANONICAL_VERSION =
  'PROFIN-HMAC-V1';


var PROFIN_WEB_ADAPTER_CLOCK_SKEW_SECONDS =
  300;


var PROFIN_WEB_ADAPTER_NONCE_TTL_SECONDS =
  600;


var PROFIN_WEB_ADAPTER_NONCE_PREFIX =
  'PROFIN_WEB_NONCE_';


/****************************************************
 * SCALAR NORMALIZATION
 *
 * MUST MATCH Next.js canonicalScalar().
 ****************************************************/

function profinWebAdapterCanonicalScalar_(
  value
) {
  if (
    value === null ||
    typeof value ===
      'undefined'
  ) {
    return '';
  }


  return String(
    value
  );
}


/****************************************************
 * HMAC VERIFICATION
 ****************************************************/

function profinWebAdapterVerifyHmac_(
  request
) {
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
      'request.auth is missing.',
      false
    );
  }


  if (
    request.auth.scheme !==
    PROFIN_WEB_ADAPTER_HMAC_SCHEME
  ) {
    throw profinWebAdapterError_(
      401,
      'INVALID_HMAC_SCHEME',
      'Некоректний тип підпису команди.',
      'Expected auth.scheme=' +
        PROFIN_WEB_ADAPTER_HMAC_SCHEME +
        '.',
      false
    );
  }


  if (
    typeof request.auth.keyId !==
      'string' ||
    !request.auth.keyId.trim()
  ) {
    throw profinWebAdapterError_(
      401,
      'HMAC_KEY_ID_REQUIRED',
      'Відсутній ідентифікатор ключа.',
      'auth.keyId is required.',
      false
    );
  }


  if (
    typeof request.auth.signature !==
      'string' ||
    !/^[a-f0-9]{64}$/i.test(
      request.auth.signature
    )
  ) {
    throw profinWebAdapterError_(
      401,
      'INVALID_HMAC_SIGNATURE_FORMAT',
      'Некоректний формат підпису команди.',
      'auth.signature must be a 64-character SHA-256 hex digest.',
      false
    );
  }


  var properties =
    PropertiesService
      .getScriptProperties();


  var secret =
    properties.getProperty(
      PROFIN_WEB_ADAPTER_HMAC_SECRET_PROPERTY
    );


  var expectedKeyId =
    properties.getProperty(
      PROFIN_WEB_ADAPTER_HMAC_KEY_ID_PROPERTY
    );


  if (
    !secret
  ) {
    throw profinWebAdapterError_(
      500,
      'HMAC_SECRET_NOT_CONFIGURED',
      'Apps Script HMAC ще не налаштований.',
      'Missing Script Property: ' +
        PROFIN_WEB_ADAPTER_HMAC_SECRET_PROPERTY +
        '.',
      false
    );
  }


  secret =
    String(
      secret
    ).trim();


  expectedKeyId =
    expectedKeyId === null
      ? ''
      : String(
          expectedKeyId
        ).trim();


  if (
    secret.length <
    32
  ) {
    throw profinWebAdapterError_(
      500,
      'HMAC_SECRET_TOO_SHORT',
      'Apps Script HMAC налаштований некоректно.',
      'HMAC secret must contain at least 32 characters.',
      false
    );
  }


  if (
    !expectedKeyId
  ) {
    throw profinWebAdapterError_(
      500,
      'HMAC_KEY_ID_NOT_CONFIGURED',
      'Apps Script HMAC key ID ще не налаштований.',
      'Missing Script Property: ' +
        PROFIN_WEB_ADAPTER_HMAC_KEY_ID_PROPERTY +
        '.',
      false
    );
  }


  if (
    String(
      request.auth.keyId
    ).trim() !==
    expectedKeyId
  ) {
    throw profinWebAdapterError_(
      401,
      'UNKNOWN_HMAC_KEY_ID',
      'Невідомий ключ підпису.',
      'Received keyId does not match configured keyId.',
      false
    );
  }


  var canonicalString =
    profinWebAdapterBuildCanonicalString_(
      request
    );


  var expectedSignature =
    profinWebAdapterComputeHmacHex_(
      canonicalString,
      secret
    );


  var receivedSignature =
    String(
      request.auth.signature
    )
      .trim()
      .toLowerCase();


  if (
    !profinWebAdapterConstantTimeEquals_(
      expectedSignature,
      receivedSignature
    )
  ) {
    throw profinWebAdapterError_(
      401,
      'INVALID_HMAC_SIGNATURE',
      'Підпис команди не пройшов перевірку.',
      'HMAC-SHA256 signature mismatch.',
      false
    );
  }


  return true;
}


/****************************************************
 * CANONICAL STRING
 *
 * MUST MATCH:
 *
 * lib/server/apps-script-signing.ts
 * buildAppsScriptCanonicalString()
 ****************************************************/

function profinWebAdapterBuildCanonicalString_(
  request
) {
  var context =
    request.context ||
    {};


  var payloadCanonical =
    profinWebAdapterStableStringify_(
      request.payload
    );


  return [
    PROFIN_HMAC_CANONICAL_VERSION,

    profinWebAdapterCanonicalScalar_(
      request.protocolVersion
    ),

    profinWebAdapterCanonicalScalar_(
      request.clientVersion
    ),

    profinWebAdapterCanonicalScalar_(
      request.requestId
    ),

    profinWebAdapterCanonicalScalar_(
      request.command
    ),

    profinWebAdapterCanonicalScalar_(
      request.sentAt
    ),

    profinWebAdapterCanonicalScalar_(
      request.nonce
    ),

    profinWebAdapterCanonicalScalar_(
      context.projectId
    ),

    profinWebAdapterCanonicalScalar_(
      context.locationId
    ),

    profinWebAdapterCanonicalScalar_(
      context.activeYear
    ),

    profinWebAdapterCanonicalScalar_(
      context.userId
    ),

    profinWebAdapterCanonicalScalar_(
      context.role
    ),

    profinWebAdapterCanonicalScalar_(
      context.timezone
    ),

    profinWebAdapterCanonicalScalar_(
      context.locale
    ),

    profinWebAdapterCanonicalScalar_(
      request.idempotencyKey
    ),

    payloadCanonical
  ].join(
    '\n'
  );
}


/****************************************************
 * STABLE JSON
 *
 * MUST MATCH Next.js stableStringify().
 ****************************************************/

function profinWebAdapterStableStringify_(
  value
) {
  if (
    value === null
  ) {
    return 'null';
  }


  var type =
    typeof value;


  if (
    type ===
    'string'
  ) {
    return JSON.stringify(
      value
    );
  }


  if (
    type ===
      'number' ||
    type ===
      'boolean'
  ) {
    return JSON.stringify(
      value
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    var arrayParts =
      [];


    for (
      var i = 0;
      i < value.length;
      i++
    ) {
      arrayParts.push(
        profinWebAdapterStableStringify_(
          value[i]
        )
      );
    }


    return (
      '[' +
      arrayParts.join(',') +
      ']'
    );
  }


  if (
    type ===
    'object'
  ) {
    var keys =
      Object
        .keys(
          value
        )
        .filter(
          function(key) {
            return (
              typeof value[key] !==
              'undefined'
            );
          }
        )
        .sort();


    var parts =
      [];


    for (
      var k = 0;
      k < keys.length;
      k++
    ) {
      var key =
        keys[k];


      parts.push(
        JSON.stringify(
          key
        ) +
        ':' +
        profinWebAdapterStableStringify_(
          value[key]
        )
      );
    }


    return (
      '{' +
      parts.join(',') +
      '}'
    );
  }


  throw profinWebAdapterError_(
    400,
    'HMAC_CANONICALIZATION_FAILED',
    'Не вдалося перевірити підпис команди.',
    'Unsupported canonical value type: ' +
      type +
      '.',
    false
  );
}


/****************************************************
 * HMAC SHA256 UTF-8
 ****************************************************/

function profinWebAdapterComputeHmacHex_(
  canonicalString,
  secret
) {
  var messageBytes =
    Utilities
      .newBlob(
        String(
          canonicalString
        ),
        'text/plain; charset=utf-8'
      )
      .getBytes();


  var keyBytes =
    Utilities
      .newBlob(
        String(
          secret
        ),
        'text/plain; charset=utf-8'
      )
      .getBytes();


  var bytes =
    Utilities
      .computeHmacSha256Signature(
        messageBytes,
        keyBytes
      );


  var hex =
    '';


  for (
    var i = 0;
    i < bytes.length;
    i++
  ) {
    var normalized =
      (
        bytes[i] +
        256
      ) %
      256;


    var part =
      normalized
        .toString(
          16
        );


    if (
      part.length ===
      1
    ) {
      part =
        '0' +
        part;
    }


    hex +=
      part;
  }


  return hex
    .toLowerCase();
}


/****************************************************
 * CONSTANT TIME COMPARE
 ****************************************************/

function profinWebAdapterConstantTimeEquals_(
  left,
  right
) {
  if (
    typeof left !==
      'string' ||
    typeof right !==
      'string'
  ) {
    return false;
  }


  var maxLength =
    Math.max(
      left.length,
      right.length
    );


  var difference =
    left.length ^
    right.length;


  for (
    var i = 0;
    i < maxLength;
    i++
  ) {
    var leftCode =
      i < left.length
        ? left.charCodeAt(
            i
          )
        : 0;


    var rightCode =
      i < right.length
        ? right.charCodeAt(
            i
          )
        : 0;


    difference |=
      leftCode ^
      rightCode;
  }


  return difference ===
    0;
}


/****************************************************
 * TIMESTAMP
 ****************************************************/

function profinWebAdapterValidateTimestamp_(
  sentAt
) {
  if (
    typeof sentAt !==
      'string' ||
    !sentAt
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_SENT_AT',
      'Некоректний час створення команди.',
      'sentAt must be an ISO timestamp.',
      false
    );
  }


  var requestTime =
    new Date(
      sentAt
    ).getTime();


  if (
    !isFinite(
      requestTime
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_SENT_AT',
      'Некоректний час створення команди.',
      'sentAt cannot be parsed as a valid date.',
      false
    );
  }


  var difference =
    Math.abs(
      new Date().getTime() -
      requestTime
    );


  if (
    difference >
    PROFIN_WEB_ADAPTER_CLOCK_SKEW_SECONDS *
      1000
  ) {
    throw profinWebAdapterError_(
      401,
      'REQUEST_TIMESTAMP_OUT_OF_WINDOW',
      'Час підписаної команди вже недійсний.',
      'Signed request is outside allowed clock window.',
      false
    );
  }


  return true;
}


/****************************************************
 * NONCE FORMAT
 ****************************************************/

function profinWebAdapterValidateNonce_(
  nonce
) {
  if (
    typeof nonce !==
      'string' ||
    !/^[a-f0-9]{32}$/i.test(
      nonce
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_NONCE',
      'Некоректний одноразовий ідентифікатор команди.',
      'nonce must contain exactly 32 hexadecimal characters.',
      false
    );
  }


  return true;
}


/****************************************************
 * NONCE REPLAY PROTECTION
 ****************************************************/

function profinWebAdapterConsumeNonce_(
  nonce
) {
  var lock =
    LockService
      .getScriptLock();


  try {
    lock.waitLock(
      5000
    );
  } catch (
    error
  ) {
    throw profinWebAdapterError_(
      503,
      'NONCE_LOCK_UNAVAILABLE',
      'Сервіс перевірки повторних запитів тимчасово зайнятий.',
      error &&
      error.message
        ? error.message
        : String(
            error
          ),
      true
    );
  }


  try {
    var cache =
      CacheService
        .getScriptCache();


    var key =
      PROFIN_WEB_ADAPTER_NONCE_PREFIX +
      String(
        nonce
      ).toLowerCase();


    var existing =
      cache.get(
        key
      );


    if (
      existing !==
      null
    ) {
      throw profinWebAdapterError_(
        409,
        'REPLAY_DETECTED',
        'Повторне використання підписаної команди заборонено.',
        'Nonce has already been consumed.',
        false
      );
    }


    cache.put(
      key,
      '1',
      PROFIN_WEB_ADAPTER_NONCE_TTL_SECONDS
    );
  } finally {
    lock.releaseLock();
  }


  return true;
}


/****************************************************
 * FULL SECURITY CHECK
 ****************************************************/

function profinWebAdapterVerifyReplayProtection_(
  request
) {
  profinWebAdapterValidateTimestamp_(
    request.sentAt
  );


  profinWebAdapterValidateNonce_(
    request.nonce
  );


  profinWebAdapterConsumeNonce_(
    request.nonce
  );


  return true;
}