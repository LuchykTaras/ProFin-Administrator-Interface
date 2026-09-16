/****************************************************
 * PROFIN OS
 * WEB ADAPTER REPLAY GUARD
 * --------------------------------------------------
 * PATCH 37
 *
 * Replay compatibility / orchestration layer.
 *
 * Canonical security implementation lives in:
 *
 *   webAdapterSecurity.js
 *
 * Там знаходяться:
 *
 *   profinWebAdapterValidateTimestamp_
 *   profinWebAdapterValidateNonce_
 *   profinWebAdapterConsumeNonce_
 *   profinWebAdapterVerifyReplayProtection_
 *
 * Цей файл НЕ дублює ці функції.
 *
 * Його завдання:
 *
 * 1. дати transport стабільний entry point:
 *
 *      profinWebAdapterAssertFreshRequest_
 *
 * 2. дати transport replay metadata:
 *
 *      profinWebAdapterReplayInfo_
 *
 * 3. перевірити, що canonical security API
 *    реально завантажений.
 *
 * ВАЖЛИВО:
 *
 * - nonce споживається ТІЛЬКИ один раз;
 * - CacheService тут не використовується;
 * - LockService тут не використовується;
 * - replay-перевірка тут не дублюється.
 ****************************************************/


var PROFIN_WEB_ADAPTER_REPLAY_GUARD_VERSION =
  'PROFIN_WEB_ADAPTER_REPLAY_GUARD_PATCH_37_2026';


var PROFIN_WEB_ADAPTER_REPLAY_MODE =
  'SIGNED_NONCE';


/****************************************************
 * SECURITY DEPENDENCY CHECK
 ****************************************************/

/**
 * Перевіряє, що canonical replay implementation
 * із webAdapterSecurity.js доступна.
 *
 * Це дає зрозумілу системну помилку замість:
 *
 *   "... is not defined"
 */
function profinWebAdapterReplayGuardAssertSecurityApi_() {
  if (
    typeof profinWebAdapterVerifyReplayProtection_ !==
      'function'
  ) {
    throw profinWebAdapterError_(
      500,
      'REPLAY_SECURITY_API_MISSING',
      'Модуль захисту від повторних запитів не завантажений.',
      'profinWebAdapterVerifyReplayProtection_ is not available.',
      false
    );
  }


  if (
    typeof profinWebAdapterValidateTimestamp_ !==
      'function'
  ) {
    throw profinWebAdapterError_(
      500,
      'REPLAY_TIMESTAMP_API_MISSING',
      'Модуль перевірки часу запиту не завантажений.',
      'profinWebAdapterValidateTimestamp_ is not available.',
      false
    );
  }


  if (
    typeof profinWebAdapterValidateNonce_ !==
      'function'
  ) {
    throw profinWebAdapterError_(
      500,
      'REPLAY_NONCE_API_MISSING',
      'Модуль перевірки nonce не завантажений.',
      'profinWebAdapterValidateNonce_ is not available.',
      false
    );
  }


  if (
    typeof profinWebAdapterConsumeNonce_ !==
      'function'
  ) {
    throw profinWebAdapterError_(
      500,
      'REPLAY_CONSUME_API_MISSING',
      'Модуль одноразового nonce не завантажений.',
      'profinWebAdapterConsumeNonce_ is not available.',
      false
    );
  }


  return true;
}


/****************************************************
 * TRANSPORT ENTRY POINT
 ****************************************************/

/**
 * Основний compatibility entry point,
 * який викликає webAdapterTransport.js.
 *
 * Послідовність:
 *
 * webAdapterTransport.js
 *        ↓
 * profinWebAdapterAssertFreshRequest_
 *        ↓
 * profinWebAdapterVerifyReplayProtection_
 *        ↓
 * validate timestamp
 *        ↓
 * validate nonce
 *        ↓
 * consume nonce ONE TIME
 */
function profinWebAdapterAssertFreshRequest_(
  request
) {
  if (
    !request ||
    typeof request !==
      'object' ||
    Array.isArray(
      request
    )
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_REPLAY_REQUEST',
      'Некоректний запит перевірки replay protection.',
      'Replay guard expected request object.',
      false
    );
  }


  profinWebAdapterReplayGuardAssertSecurityApi_();


  /*
   * ВАЖЛИВО:
   *
   * НЕ викликаємо тут окремо:
   *
   *   profinWebAdapterValidateTimestamp_
   *   profinWebAdapterValidateNonce_
   *   profinWebAdapterConsumeNonce_
   *
   * Бо canonical function нижче
   * вже робить усі три операції.
   */
  return profinWebAdapterVerifyReplayProtection_(
    request
  );
}


/****************************************************
 * REPLAY INFO
 ****************************************************/

/**
 * Metadata для:
 *
 *   ping
 *   idempotencyProbe
 *
 * webAdapterTransport.js використовує:
 *
 *   replay:
 *     profinWebAdapterReplayInfo_()
 *
 * Ця функція НІЧОГО не перевіряє
 * і НЕ споживає nonce.
 */
function profinWebAdapterReplayInfo_() {
  profinWebAdapterReplayGuardAssertSecurityApi_();


  return {
    version:
      PROFIN_WEB_ADAPTER_REPLAY_GUARD_VERSION,

    mode:
      PROFIN_WEB_ADAPTER_REPLAY_MODE,

    enabled:
      true,

    signedTimestamp:
      true,

    nonceRequired:
      true,

    nonceSingleUse:
      true,

    nonceFormat:
      '32_HEX',

    clockSkewSeconds:
      typeof PROFIN_WEB_ADAPTER_CLOCK_SKEW_SECONDS !==
        'undefined'
        ? Number(
            PROFIN_WEB_ADAPTER_CLOCK_SKEW_SECONDS
          )
        : null,

    nonceTtlSeconds:
      typeof PROFIN_WEB_ADAPTER_NONCE_TTL_SECONDS !==
        'undefined'
        ? Number(
            PROFIN_WEB_ADAPTER_NONCE_TTL_SECONDS
          )
        : null,

    implementation:
      'webAdapterSecurity.js',

    status:
      'OK'
  };
}


/****************************************************
 * REPLAY GUARD SELF TEST
 ****************************************************/

/**
 * Допоміжна діагностична функція.
 *
 * Не виконує replay-check,
 * не використовує nonce
 * і не змінює CacheService.
 *
 * Її можна вручну запускати
 * для перевірки цілісності модуля.
 */
function profinWebAdapterReplayGuardSelfTest_() {
  profinWebAdapterReplayGuardAssertSecurityApi_();


  return {
    ok:
      true,

    version:
      PROFIN_WEB_ADAPTER_REPLAY_GUARD_VERSION,

    mode:
      PROFIN_WEB_ADAPTER_REPLAY_MODE,

    dependencies: {
      verifyReplayProtection:
        typeof profinWebAdapterVerifyReplayProtection_ ===
          'function',

      validateTimestamp:
        typeof profinWebAdapterValidateTimestamp_ ===
          'function',

      validateNonce:
        typeof profinWebAdapterValidateNonce_ ===
          'function',

      consumeNonce:
        typeof profinWebAdapterConsumeNonce_ ===
          'function'
    },

    config: {
      clockSkewSeconds:
        typeof PROFIN_WEB_ADAPTER_CLOCK_SKEW_SECONDS !==
          'undefined'
          ? Number(
              PROFIN_WEB_ADAPTER_CLOCK_SKEW_SECONDS
            )
          : null,

      nonceTtlSeconds:
        typeof PROFIN_WEB_ADAPTER_NONCE_TTL_SECONDS !==
          'undefined'
          ? Number(
              PROFIN_WEB_ADAPTER_NONCE_TTL_SECONDS
            )
          : null
    },

    status:
      'OK'
  };
}