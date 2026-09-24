import type {
  CreateOperationInput,
  CreateOperationResult,
  OperationFormSchema
} from "@/lib/contracts/operations";

import {
  ApiClientError,
  apiRequest
} from "@/lib/client/api-client";


export type GetOperationFormSchemaOptions = {
  operationType?:
    string | null;

  category?:
    string | null;

  article?:
    string | null;

  signal?:
    AbortSignal;

  cacheMode?:
    "default" | "reload";
};


export type OperationFormSchemaSelection = {
  operationType?:
    string | null;

  category?:
    string | null;

  article?:
    string | null;
};


export type CreateOperationOptions = {
  operation:
    CreateOperationInput;

  idempotencyKey:
    string;

  signal?:
    AbortSignal;
};


export type CreateOperationClientResult = {
  operation:
    CreateOperationResult;

  idempotencyReplayed:
    boolean;
};


type SchemaCacheEntry = {
  schema:
    OperationFormSchema;

  expiresAt:
    number;
};


/*
 * PATCH 45 — SCHEMA PERFORMANCE
 *
 * Client-side cache only.
 *
 * Це НЕ джерело бізнес-логіки:
 * - schema як і раніше приходить тільки з server API/domain core;
 * - browser не будує category/article/fields самостійно;
 * - TTL короткий;
 * - після успішного write cache очищається;
 * - retry може примусово обійти cache через cacheMode="reload".
 */
const OPERATION_SCHEMA_CACHE_TTL_MS =
  30_000;


const operationSchemaCache =
  new Map<
    string,
    SchemaCacheEntry
  >();


const operationSchemaInflight =
  new Map<
    string,
    Promise<OperationFormSchema>
  >();


let operationSchemaCacheGeneration =
  0;


function cleanSelectionValue(
  value:
    string | null | undefined
): string {
  return value?.trim() ?? "";
}


function buildOperationSchemaCacheKey(
  options:
    OperationFormSchemaSelection
): string {
  return JSON.stringify([
    cleanSelectionValue(
      options.operationType
    ),
    cleanSelectionValue(
      options.category
    ),
    cleanSelectionValue(
      options.article
    )
  ]);
}


function buildOperationSchemaPath(
  options:
    OperationFormSchemaSelection
): string {
  const params =
    new URLSearchParams();


  if (
    options.operationType
  ) {
    params.set(
      "type",
      options.operationType
    );
  }


  if (
    options.category
  ) {
    params.set(
      "category",
      options.category
    );
  }


  if (
    options.article
  ) {
    params.set(
      "article",
      options.article
    );
  }


  const query =
    params.toString();


  return query
    ? `/api/operations/form-schema?${query}`
    : "/api/operations/form-schema";
}


function throwIfAborted(
  signal:
    AbortSignal | undefined
) {
  if (
    signal?.aborted
  ) {
    throw new DOMException(
      "The operation was aborted.",
      "AbortError"
    );
  }
}


async function fetchOperationFormSchemaFromServer(
  options:
    OperationFormSchemaSelection
): Promise<OperationFormSchema> {
  const path =
    buildOperationSchemaPath(
      options
    );


  /*
   * Навмисно не прив'язуємо мережевий fetch
   * до signal конкретної модалки.
   *
   * Якщо користувач закрив форму, вже запущений
   * READ-запит може завершитися та прогріти cache.
   * State модалки все одно захищений її AbortSignal
   * та sequence guard.
   */
  const envelope =
    await apiRequest<
      OperationFormSchema
    >(
      path,
      {
        method:
          "GET"
      }
    );


  if (
    !envelope.data
  ) {
    throw new ApiClientError({
      status:
        200,

      code:
        "EMPTY_OPERATION_FORM_SCHEMA",

      userMessage:
        "Сервер не повернув структуру форми операції.",

      requestId:
        envelope.requestId,

      retryable:
        true
    });
  }


  return envelope.data;
}


export function clearOperationFormSchemaCache() {
  operationSchemaCacheGeneration +=
    1;

  operationSchemaCache.clear();

  /*
   * Існуючі promises не скасовуємо.
   * generation guard не дозволить їм
   * повторно покласти стару schema у cache.
   */
  operationSchemaInflight.clear();
}


/*
 * READ:
 * отримання server-driven schema.
 */
export async function getOperationFormSchema(
  options:
    GetOperationFormSchemaOptions =
      {}
): Promise<OperationFormSchema> {
  throwIfAborted(
    options.signal
  );


  const selection:
    OperationFormSchemaSelection = {
      operationType:
        options.operationType ?? null,

      category:
        options.category ?? null,

      article:
        options.article ?? null
    };


  const cacheKey =
    buildOperationSchemaCacheKey(
      selection
    );


  const now =
    Date.now();


  if (
    options.cacheMode !==
      "reload"
  ) {
    const cached =
      operationSchemaCache.get(
        cacheKey
      );


    if (
      cached &&
      cached.expiresAt >
        now
    ) {
      return cached.schema;
    }


    if (cached) {
      operationSchemaCache.delete(
        cacheKey
      );
    }


    const inflight =
      operationSchemaInflight.get(
        cacheKey
      );


    if (inflight) {
      const schema =
        await inflight;

      throwIfAborted(
        options.signal
      );

      return schema;
    }
  }


  const generation =
    operationSchemaCacheGeneration;


  let requestPromise:
    Promise<OperationFormSchema>;


  requestPromise =
    fetchOperationFormSchemaFromServer(
      selection
    )
      .then(
        schema => {
          if (
            generation ===
              operationSchemaCacheGeneration
          ) {
            operationSchemaCache.set(
              cacheKey,
              {
                schema,
                expiresAt:
                  Date.now() +
                  OPERATION_SCHEMA_CACHE_TTL_MS
              }
            );
          }


          return schema;
        }
      )
      .finally(
        () => {
          if (
            operationSchemaInflight.get(
              cacheKey
            ) ===
              requestPromise
          ) {
            operationSchemaInflight.delete(
              cacheKey
            );
          }
        }
      );


  if (
    options.cacheMode !==
      "reload"
  ) {
    operationSchemaInflight.set(
      cacheKey,
      requestPromise
    );
  }


  const schema =
    await requestPromise;


  throwIfAborted(
    options.signal
  );


  return schema;
}


/*
 * Безпечне READ-only прогрівання.
 * Помилка prefetch ніколи не блокує UI:
 * звичайний loader покаже її, лише якщо
 * користувач реально відкриє цей сценарій.
 */
export async function prefetchOperationFormSchema(
  selection:
    OperationFormSchemaSelection
): Promise<void> {
  try {
    await getOperationFormSchema({
      ...selection,
      cacheMode:
        "default"
    });
  } catch {
    /* no-op */
  }
}


export async function prefetchOperationFormSchemas(
  selections:
    readonly OperationFormSchemaSelection[],

  concurrency =
    2
): Promise<void> {
  const uniqueSelections =
    Array.from(
      new Map(
        selections.map(
          selection => [
            buildOperationSchemaCacheKey(
              selection
            ),
            selection
          ]
        )
      ).values()
    );


  if (
    !uniqueSelections.length
  ) {
    return;
  }


  let cursor =
    0;


  const workerCount =
    Math.max(
      1,
      Math.min(
        concurrency,
        uniqueSelections.length
      )
    );


  async function worker() {
    while (
      cursor <
      uniqueSelections.length
    ) {
      const index =
        cursor;

      cursor +=
        1;

      await prefetchOperationFormSchema(
        uniqueSelections[index]
      );
    }
  }


  await Promise.all(
    Array.from(
      {
        length:
          workerCount
      },
      () => worker()
    )
  );
}


/*
 * PATCH 40 / PATCH 44
 *
 * WRITE:
 *
 * Browser
 *   ↓
 * POST /api/operations/create
 *   ↓
 * Next.js server
 *   ↓
 * session / RBAC
 *   ↓
 * createOperationWeb
 *   ↓
 * Apps Script domain core
 *   ↓
 * Google Sheets
 */
export async function createOperation(
  options:
    CreateOperationOptions
): Promise<CreateOperationClientResult> {
  const envelope =
    await apiRequest<
      CreateOperationClientResult
    >(
      "/api/operations/create",
      {
        method:
          "POST",

        headers: {
          "content-type":
            "application/json",

          "idempotency-key":
            options.idempotencyKey
        },

        body:
          JSON.stringify({
            operation:
              options.operation
          }),

        signal:
          options.signal
      }
    );


  if (
    !envelope.data ||
    !envelope.data.operation ||
    !envelope
      .data
      .operation
      .operationId
  ) {
    throw new ApiClientError({
      status:
        502,

      code:
        "EMPTY_CREATE_OPERATION_RESULT",

      userMessage:
        "Сервер не підтвердив проведення операції.",

      requestId:
        envelope.requestId,

      retryable:
        false
    });
  }


  /*
   * Write міг змінити пацієнтів, склад або
   * інші dependent options. Наступний READ
   * повинен знову прийти з domain core.
   */
  clearOperationFormSchemaCache();


  return envelope.data;
}
