/****************************************************
 * PROFIN OS
 * WEB ADAPTER IDEMPOTENCY
 * --------------------------------------------------
 * PATCH 32
 *
 * Transport-level idempotency infrastructure.
 *
 * ВАЖЛИВО:
 * - requestId = nonce PATCH 31
 * - idempotencyKey = бізнес-ключ повтору PATCH 32
 *
 * Це різні речі.
 ****************************************************/


var PROFIN_WEB_ADAPTER_IDEMPOTENCY_VERSION =
  'PROFIN_WEB_ADAPTER_IDEMPOTENCY_PATCH_32_2026';


var PROFIN_WEB_ADAPTER_IDEMPOTENCY_PREFIX =
  'PROFIN_WEB_IDEMPOTENCY_';


/*
 * Результат completed-команди тримаємо 24 години.
 */
var PROFIN_WEB_ADAPTER_IDEMPOTENCY_TTL_MS =
  24 * 60 * 60 * 1000;


/*
 * PENDING-запис не повинен висіти вічно.
 */
var PROFIN_WEB_ADAPTER_IDEMPOTENCY_PENDING_TTL_MS =
  5 * 60 * 1000;


/****************************************************
 * MAIN WRAPPER
 ****************************************************/

function profinWebAdapterExecuteIdempotent_(
  request,
  handler
) {
  if (
    !request ||
    typeof request !== 'object'
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_IDEMPOTENCY_REQUEST',
      'Некоректний idempotency-запит.',
      'PATCH 32 expected request object.',
      false
    );
  }


  if (
    typeof handler !== 'function'
  ) {
    throw profinWebAdapterError_(
      500,
      'INVALID_IDEMPOTENCY_HANDLER',
      'Внутрішня помилка вебадаптера.',
      'PATCH 32 handler must be a function.',
      false
    );
  }


  profinWebAdapterValidateIdempotencyKey_(
    request.idempotencyKey
  );


  var fingerprint =
    profinWebAdapterBuildIdempotencyFingerprint_(
      request
    );


  var storageKey =
    profinWebAdapterBuildIdempotencyStorageKey_(
      request.idempotencyKey
    );


  var reservation =
    profinWebAdapterReserveIdempotency_(
      storageKey,
      fingerprint
    );


  /*
   * Команда вже була успішно виконана.
   */
  if (
    reservation.mode ===
      'CACHED'
  ) {
    return {
      replayed:
        true,

      idempotencyKey:
        request.idempotencyKey,

      result:
        reservation.result
    };
  }


  try {
    var result =
      handler();


    profinWebAdapterCompleteIdempotency_(
      storageKey,
      fingerprint,
      result
    );


    return {
      replayed:
        false,

      idempotencyKey:
        request.idempotencyKey,

      result:
        result
    };

  } catch (error) {
    /*
     * Поки domain write-команд ще немає,
     * невдалу reservation прибираємо.
     *
     * PATCH 34 додатково зв'яже
     * idempotencyKey із реальною операцією.
     */
    profinWebAdapterReleaseIdempotency_(
      storageKey,
      fingerprint
    );


    throw error;
  }
}


/****************************************************
 * KEY VALIDATION
 ****************************************************/

function profinWebAdapterValidateIdempotencyKey_(
  key
) {
  if (
    typeof key !== 'string' ||
    !key.trim()
  ) {
    throw profinWebAdapterError_(
      400,
      'IDEMPOTENCY_KEY_REQUIRED',
      'Відсутній ключ захисту від повторного проведення.',
      'PATCH 32 requires idempotencyKey.',
      false
    );
  }


  var normalized =
    key.trim();


  if (
    normalized.length < 16 ||
    normalized.length > 200
  ) {
    throw profinWebAdapterError_(
      400,
      'INVALID_IDEMPOTENCY_KEY',
      'Некоректний idempotency key.',
      'idempotencyKey length must be between 16 and 200 characters.',
      false
    );
  }


  return true;
}


/****************************************************
 * RESERVATION
 ****************************************************/

function profinWebAdapterReserveIdempotency_(
  storageKey,
  fingerprint
) {
  var lock =
    LockService.getScriptLock();


  var locked =
    false;


  try {
    locked =
      lock.tryLock(
        5000
      );


    if (
      !locked
    ) {
      throw profinWebAdapterError_(
        503,
        'IDEMPOTENCY_GUARD_BUSY',
        'Захист від повторного проведення тимчасово зайнятий.',
        'Could not acquire PATCH 32 script lock.',
        true
      );
    }


    var properties =
      PropertiesService
        .getScriptProperties();


    var nowMs =
      Date.now();


    var existingRaw =
      properties.getProperty(
        storageKey
      );


    if (
      existingRaw
    ) {
      var existing =
        profinWebAdapterParseIdempotencyRecord_(
          existingRaw
        );


      /*
       * Прострочений запис видаляємо.
       */
      if (
        existing.expiresAt <=
          nowMs
      ) {
        properties.deleteProperty(
          storageKey
        );

        existing =
          null;
      }


      if (
        existing
      ) {
        /*
         * Один ключ не можна використати
         * для іншої команди / payload.
         */
        if (
          existing.fingerprint !==
            fingerprint
        ) {
          throw profinWebAdapterError_(
            409,
            'IDEMPOTENCY_KEY_CONFLICT',
            'Цей idempotency key уже використаний для іншої команди.',
            'Same idempotencyKey was reused with a different request fingerprint.',
            false
          );
        }


        if (
          existing.status ===
            'DONE'
        ) {
          return {
            mode:
              'CACHED',

            result:
              existing.result
          };
        }


        if (
          existing.status ===
            'PENDING'
        ) {
          throw profinWebAdapterError_(
            409,
            'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            'Ця команда вже виконується.',
            'A request with the same idempotencyKey is currently in progress.',
            true
          );
        }
      }
    }


    var pendingRecord = {
      version:
        PROFIN_WEB_ADAPTER_IDEMPOTENCY_VERSION,

      status:
        'PENDING',

      fingerprint:
        fingerprint,

      createdAt:
        nowMs,

      expiresAt:
        nowMs +
        PROFIN_WEB_ADAPTER_IDEMPOTENCY_PENDING_TTL_MS,

      result:
        null
    };


    properties.setProperty(
      storageKey,
      JSON.stringify(
        pendingRecord
      )
    );


    profinWebAdapterCleanupExpiredIdempotency_(
      properties,
      nowMs,
      storageKey
    );


    return {
      mode:
        'EXECUTE'
    };

  } finally {
    if (
      locked
    ) {
      lock.releaseLock();
    }
  }
}


/****************************************************
 * COMPLETE
 ****************************************************/

function profinWebAdapterCompleteIdempotency_(
  storageKey,
  fingerprint,
  result
) {
  var lock =
    LockService.getScriptLock();


  var locked =
    false;


  try {
    locked =
      lock.tryLock(
        5000
      );


    if (
      !locked
    ) {
      throw profinWebAdapterError_(
        503,
        'IDEMPOTENCY_COMPLETE_BUSY',
        'Не вдалося завершити idempotency-запис.',
        'Could not acquire lock while completing idempotency record.',
        true
      );
    }


    var properties =
      PropertiesService
        .getScriptProperties();


    var nowMs =
      Date.now();


    var completedRecord = {
      version:
        PROFIN_WEB_ADAPTER_IDEMPOTENCY_VERSION,

      status:
        'DONE',

      fingerprint:
        fingerprint,

      createdAt:
        nowMs,

      expiresAt:
        nowMs +
        PROFIN_WEB_ADAPTER_IDEMPOTENCY_TTL_MS,

      result:
        result
    };


    properties.setProperty(
      storageKey,
      JSON.stringify(
        completedRecord
      )
    );


    return true;

  } finally {
    if (
      locked
    ) {
      lock.releaseLock();
    }
  }
}


/****************************************************
 * RELEASE FAILED RESERVATION
 ****************************************************/

function profinWebAdapterReleaseIdempotency_(
  storageKey,
  fingerprint
) {
  var lock =
    LockService.getScriptLock();


  var locked =
    false;


  try {
    locked =
      lock.tryLock(
        5000
      );


    if (
      !locked
    ) {
      return false;
    }


    var properties =
      PropertiesService
        .getScriptProperties();


    var raw =
      properties.getProperty(
        storageKey
      );


    if (
      !raw
    ) {
      return true;
    }


    var record;


    try {
      record =
        JSON.parse(
          raw
        );
    } catch (error) {
      properties.deleteProperty(
        storageKey
      );

      return true;
    }


    if (
      record.status ===
        'PENDING' &&
      record.fingerprint ===
        fingerprint
    ) {
      properties.deleteProperty(
        storageKey
      );
    }


    return true;

  } finally {
    if (
      locked
    ) {
      lock.releaseLock();
    }
  }
}


/****************************************************
 * FINGERPRINT
 ****************************************************/

function profinWebAdapterBuildIdempotencyFingerprint_(
  request
) {
  /*
   * requestId і sentAt навмисно НЕ входять.
   *
   * Retry має новий requestId,
   * але той самий idempotencyKey.
   */
  var canonical = {
    protocolVersion:
      request.protocolVersion,

    command:
      request.command,

    context:
      request.context,

    payload:
      request.payload
  };


  var stable =
    profinWebAdapterStableStringify_(
      canonical
    );


  var digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      stable,
      Utilities.Charset.UTF_8
    );


  return digest
    .map(
      function(byteValue) {
        var value =
          byteValue;


        if (
          value < 0
        ) {
          value +=
            256;
        }


        return (
          '0' +
          value.toString(16)
        ).slice(-2);
      }
    )
    .join('');
}


/****************************************************
 * STORAGE KEY
 ****************************************************/

function profinWebAdapterBuildIdempotencyStorageKey_(
  idempotencyKey
) {
  var digest =
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      idempotencyKey,
      Utilities.Charset.UTF_8
    );


  var hex =
    digest
      .map(
        function(byteValue) {
          var value =
            byteValue;


          if (
            value < 0
          ) {
            value +=
              256;
          }


          return (
            '0' +
            value.toString(16)
          ).slice(-2);
        }
      )
      .join('');


  return (
    PROFIN_WEB_ADAPTER_IDEMPOTENCY_PREFIX +
    hex
  );
}


/****************************************************
 * RECORD PARSER
 ****************************************************/

function profinWebAdapterParseIdempotencyRecord_(
  raw
) {
  try {
    var record =
      JSON.parse(
        raw
      );


    if (
      !record ||
      typeof record !==
        'object'
    ) {
      throw new Error(
        'Invalid record object.'
      );
    }


    return record;

  } catch (error) {
    throw profinWebAdapterError_(
      500,
      'INVALID_IDEMPOTENCY_RECORD',
      'Пошкоджено службовий idempotency-запис.',
      error.message,
      false
    );
  }
}


/****************************************************
 * CLEANUP
 ****************************************************/

function profinWebAdapterCleanupExpiredIdempotency_(
  properties,
  nowMs,
  currentKey
) {
  var all =
    properties.getProperties();


  var deleted =
    0;


  var maxDelete =
    25;


  Object.keys(
    all
  ).some(
    function(key) {
      if (
        deleted >=
          maxDelete
      ) {
        return true;
      }


      if (
        key ===
          currentKey
      ) {
        return false;
      }


      if (
        key.indexOf(
          PROFIN_WEB_ADAPTER_IDEMPOTENCY_PREFIX
        ) !== 0
      ) {
        return false;
      }


      var record;


      try {
        record =
          JSON.parse(
            all[key]
          );
      } catch (error) {
        properties.deleteProperty(
          key
        );

        deleted++;

        return false;
      }


      if (
        !record.expiresAt ||
        Number(
          record.expiresAt
        ) <=
          nowMs
      ) {
        properties.deleteProperty(
          key
        );

        deleted++;
      }


      return false;
    }
  );
}


/****************************************************
 * INFO
 ****************************************************/

function profinWebAdapterIdempotencyInfo_() {
  return {
    version:
      PROFIN_WEB_ADAPTER_IDEMPOTENCY_VERSION,

    completedTtlMs:
      PROFIN_WEB_ADAPTER_IDEMPOTENCY_TTL_MS,

    pendingTtlMs:
      PROFIN_WEB_ADAPTER_IDEMPOTENCY_PENDING_TTL_MS
  };
}