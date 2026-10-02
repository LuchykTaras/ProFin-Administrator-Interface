import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  assertPermission
} from "@/lib/server/rbac";

import {
  getOperationFormSchema
} from "@/lib/server/operation-form-schema";

import {
  requireSessionContext
} from "@/lib/server/session";


export const runtime =
  "nodejs";


export const dynamic =
  "force-dynamic";


export async function GET(
  request:
    Request
) {
  const requestId =
    getRequestId(
      request
    );


  try {
    const context =
      await requireSessionContext();


    assertPermission(
      context,
      "operation:create"
    );


    const url =
      new URL(
        request.url
      );


    /*
     * PATCH 37.3
     *
     * Browser передає тільки
     * поточний стан бізнес-тригерів:
     *
     * type
     *   ↓
     * category
     *   ↓
     * article
     *   ↓
     * dependent fields
     *
     * Browser НЕ визначає:
     *
     * projectId
     * locationId
     * activeYear
     * spreadsheetId
     *
     * Вони залишаються trusted
     * server-side context.
     */


    const requestedOperationType =
      url.searchParams.get(
        "type"
      );


    const requestedCategory =
      url.searchParams.get(
        "category"
      );


      const requestedArticle =
    url.searchParams.get(
      "article"
    );


  /*
   * PATCH 49 — FORM SCHEMA SPLIT
   *
   * Порожній initial request для Каси
   * потребує тільки operationTypes.
   *
   * Щойно вибрано operationType /
   * category / article — потрібна
   * повна domain schema.
   */
    const requestedMode =
    url.searchParams
      .get(
        "mode"
      )
      ?.trim()
      .toLowerCase();


  const schemaMode =
    requestedMode ===
      "full"
      ? "FULL"
      : requestedMode ===
          "light"
        ? "LIGHT"
        : (
            requestedOperationType ||
            requestedCategory ||
            requestedArticle
              ? "FULL"
              : "LIGHT"
          );


    const schema =
    await getOperationFormSchema({
      requestId:
        requestId,

      context:
        context,

      requestedOperationType:
        requestedOperationType,

      requestedCategory:
        requestedCategory,

      requestedArticle:
        requestedArticle,

      schemaMode:
        schemaMode,

      /*
       * Той самий race-control,
       * який ми вже зробили
       * для Journal.
       */
      signal:
        request.signal
    });


    return apiOk(
      requestId,

      schema,

      "Контракт форми операції отримано з доменного ядра.",

      "OPERATION_FORM_SCHEMA"
    );

  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}