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


export async function GET(
  request: Request
) {
  const requestId =
    getRequestId(
      request
    );

  try {
    /*
     * Увесь trusted context
     * отримуємо із server-side session.
     *
     * Нічого з URL/body тут
     * не використовується.
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
           * Це НЕ mock.
           *
           * Ми явно кажемо UI,
           * що domain adapter
           * ще не наданий backend-командою.
           */
          domainAdapter:
            "NOT_CONNECTED" as const,

          checkedAt:
            new Date()
              .toISOString()
        },


        /*
         * Стане true лише після того,
         * як backend-команда надасть
         * реально протестований:
         *
         * server
         * → signed adapter
         * → Apps Script domain core.
         *
         * Сам UI не має права
         * вирішити, що backend готовий.
         */
        domainCommandsReady:
          false
      },

      "Інтерфейсний контекст отримано.",

      "INTERFACE_BOOTSTRAP"
    );
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}