import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  db
} from "@/lib/server/db";

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
     * Bootstrap відповідає тільки за те,
     * без чого сам інтерфейс не може
     * безпечно відобразитися:
     *
     * - server-side session;
     * - trusted project/location/year;
     * - control-plane DB;
     * - RBAC.
     *
     * Apps Script НЕ викликаємо тут.
     * Інакше повільний/недоступний
     * domain adapter блокує весь UI
     * на час APPS_SCRIPT_TIMEOUT_MS.
     */
    const context =
      await requireSessionContext();


    const sql =
      db();


    await sql`
      SELECT 1
    `;


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
           * Реальний status adapter
           * встановлює клієнт після
           * окремого READ-запиту schema.
           */
          domainAdapter:
            "NOT_CONNECTED" as const,

          checkedAt:
            new Date()
              .toISOString()
        },


        /*
         * Не оголошуємо domain ready
         * до фактичного успішного
         * getOperationFormSchema().
         */
        domainCommandsReady:
          false
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
