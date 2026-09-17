import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  db
} from "@/lib/server/db";

import {
  getOperationFormSchema
} from "@/lib/server/operation-form-schema";

import {
  hasPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";


export const runtime =
  "nodejs";


export const dynamic =
  "force-dynamic";


type DomainAdapterStatus =
  | "OK"
  | "NOT_CONNECTED"
  | "ERROR";


export async function GET(
  request:
    Request
) {
  const requestId =
    getRequestId(
      request
    );


  try {
    /*
     * Увесь trusted context
     * отримуємо виключно
     * із server-side session.
     *
     * Browser не може передати:
     *
     * projectId
     * locationId
     * activeYear
     * spreadsheetId
     * role
     */
    const context =
      await requireSessionContext();


    /*
     * Реальна перевірка
     * control-plane PostgreSQL.
     */
    const sql =
      db();


    await sql`
      SELECT 1
    `;


    /*
     * PATCH 39
     *
     * Реальна server-side перевірка
     * Apps Script domain adapter.
     *
     * Не hardcode:
     *
     * domainCommandsReady = true
     *
     * Замість цього використовуємо
     * той самий domain flow,
     * через який уже працює
     * форма операції:
     *
     * Next.js server
     *      ↓
     * getOperationFormSchema()
     *      ↓
     * signed adapter
     *      ↓
     * Apps Script
     *      ↓
     * getOperationFormSchemaWeb
     */
    let domainAdapterStatus:
      DomainAdapterStatus =
        "NOT_CONNECTED";


    let domainCommandsReady =
      false;


    try {
      const domainSchema =
        await getOperationFormSchema({
          requestId,

          context,

          requestedOperationType:
            null,

          requestedCategory:
            null,

          requestedArticle:
            null
        });


      /*
       * Якщо Apps Script реально
       * відповів і повернув
       * server-driven schema,
       * domain adapter вважаємо
       * доступним.
       */
      if (
        domainSchema &&
        Array.isArray(
          domainSchema.operationTypes
        )
      ) {
        domainAdapterStatus =
          "OK";

        domainCommandsReady =
          true;
      }

    } catch (
      domainError
    ) {
      /*
       * Відмова domain adapter
       * НЕ повинна ламати весь
       * bootstrap.
       *
       * Користувач все одно повинен
       * отримати session/context,
       * але UI покаже, що domain
       * тимчасово недоступний.
       */
      console.error(
        "[INTERFACE_BOOTSTRAP_DOMAIN_CHECK_FAILED]",
        {
          requestId,
          error:
            domainError
        }
      );


      domainAdapterStatus =
        "ERROR";


      domainCommandsReady =
        false;
    }


    return apiOk(
      requestId,

      {
        context: {
          userId:
            context.userId,

          displayName:
            context.displayName,

          role:
            context.role,

          projectId:
            context.projectId,

          projectName:
            context.projectName,

          locationId:
            context.locationId,

          locationName:
            context.locationName,

          activeYear:
            context.activeYear,

          timezone:
            context.timezone,

          locale:
            context.locale,

          sessionExpiresAt:
            context.expiresAt
        },


        permissions: {
          operationCreate:
            hasPermission(
              context,
              "operation:create"
            ),

          journalRead:
            hasPermission(
              context,
              "journal:read"
            ),

          inventoryRead:
            hasPermission(
              context,
              "inventory:read"
            ),

          correctionRequest:
            hasPermission(
              context,
              "correction:request"
            ),

          cancellationRequest:
            hasPermission(
              context,
              "cancellation:request"
            )
        },


        services: {
          api:
            "OK" as const,

          database:
            "OK" as const,

          /*
           * PATCH 39
           *
           * Значення тепер формується
           * реальною перевіркою
           * Apps Script adapter.
           */
          domainAdapter:
            domainAdapterStatus,

          checkedAt:
            new Date()
              .toISOString()
        },


        /*
         * PATCH 39
         *
         * Більше НЕ hardcoded false.
         *
         * true тільки якщо
         * getOperationFormSchema()
         * реально отримав domain schema.
         */
        domainCommandsReady:
          domainCommandsReady
      },

      "Інтерфейсний контекст отримано.",

      "INTERFACE_BOOTSTRAP"
    );

  } catch (
    error
  ) {
    return apiFromError(
      requestId,
      error
    );
  }
}