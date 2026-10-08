import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  createId
} from "@/lib/server/crypto";

import {
  db
} from "@/lib/server/db";

import {
  AppError
} from "@/lib/server/errors";

import {
  listSessionRouteOptions
} from "@/lib/server/registry";

import {
  requireSessionContext
} from "@/lib/server/session";


export const runtime =
  "nodejs";


export const dynamic =
  "force-dynamic";


type UnknownRecord =
  Record<
    string,
    unknown
  >;


function isRecord(
  value: unknown
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}


export async function POST(
  request: Request
) {
  const requestId =
    getRequestId(
      request
    );


  try {
    /*
     * Поточна session є
     * єдиним trusted source
     * user/project/location.
     */
    const context =
      await requireSessionContext();


    const body =
      await request
        .json()
        .catch(
          () => null
        );


    /*
     * Browser має право
     * передати тільки locationId.
     *
     * spreadsheetId,
     * projectId,
     * routeMode,
     * Apps Script URL
     * browser НЕ контролює.
     */
    if (
      !isRecord(
        body
      )
    ) {
      throw new AppError({
        status:
          400,

        code:
          "INVALID_LOCATION_SWITCH_BODY",

        userMessage:
          "Некоректний запит перемикання філії.",

        retryable:
          false
      });
    }


    const bodyKeys =
      Object.keys(
        body
      );


    if (
      bodyKeys.length !==
        1 ||
      bodyKeys[0] !==
        "locationId"
    ) {
      throw new AppError({
        status:
          400,

        code:
          "INVALID_LOCATION_SWITCH_FIELDS",

        userMessage:
          "Запит перемикання філії містить недозволені поля.",

        technicalMessage:
          `Body keys: ${bodyKeys.join(
            ", "
          )}.`,

        retryable:
          false
      });
    }


    const requestedLocationId =
      typeof body.locationId ===
        "string"
        ? body.locationId
            .trim()
        : "";


    if (
      !requestedLocationId
    ) {
      throw new AppError({
        status:
          400,

        code:
          "LOCATION_ID_REQUIRED",

        userMessage:
          "Не вибрано філію.",

        retryable:
          false
      });
    }


    /*
     * Отримуємо тільки ті маршрути,
     * до яких цей user реально
     * має доступ через user_locations.
     *
     * Додатково registry вже
     * перевіряє route_mode/status.
     */
    const availableRoutes =
      await listSessionRouteOptions(
        context
      );


    const target =
      availableRoutes.find(
        item =>
          item.locationId ===
            requestedLocationId
      );


    if (
      !target
    ) {
      throw new AppError({
        status:
          403,

        code:
          "LOCATION_SWITCH_FORBIDDEN",

        userMessage:
          "Ця філія недоступна для вашого облікового запису.",

        retryable:
          false
      });
    }


    /*
     * Якщо користувач вибрав
     * вже активну філію —
     * нічого в session не переписуємо.
     */
    if (
      target.locationId ===
        context.locationId
    ) {
      return apiOk(
        requestId,

        {
          locationId:
            target.locationId,

          locationName:
            target.locationName,

          financialYear:
            target.financialYear,

          routeMode:
            target.routeMode,

          routeStatus:
            target.routeStatus
        },

        "Філія вже активна.",

        "LOCATION_ALREADY_ACTIVE"
      );
    }


    const sql =
      db();


    const eventId =
      createId(
        "evt"
      );


    await sql.begin(
      async transaction => {
        /*
         * Змінюємо ТІЛЬКИ
         * location_id поточної session.
         *
         * Нову session не створюємо.
         */
        const updated =
          await transaction`
            UPDATE sessions

            SET
              location_id =
                ${target.locationId},

              last_seen_at =
                NOW()

            WHERE
              session_id =
                ${context.sessionId}

              AND user_id =
                ${context.userId}

              AND project_id =
                ${context.projectId}

              AND revoked_at
                IS NULL

              AND expires_at >
                NOW()

            RETURNING
              session_id
          `;


        if (
          updated.length !==
            1
        ) {
          throw new AppError({
            status:
              409,

            code:
              "SESSION_SWITCH_CONFLICT",

            userMessage:
              "Не вдалося змінити активну філію. Оновіть сторінку та повторіть спробу.",

            retryable:
              true
          });
        }


        /*
         * PATCH 50 audit.
         *
         * Фіксуємо:
         * звідки → куди
         * перемкнулась session.
         */
        await transaction`
          INSERT INTO audit_events (
            event_id,
            request_id,
            actor_user_id,
            actor_role,
            project_id,
            location_id,
            financial_year,
            action,
            target_type,
            target_id,
            before_snapshot,
            after_snapshot,
            result
          )
          VALUES (
            ${eventId},
            ${requestId},
            ${context.userId},
            ${context.role},
            ${context.projectId},
            ${target.locationId},
            ${context.activeYear},
            'SESSION_LOCATION_SWITCH',
            'SESSION',
            ${context.sessionId},
            ${JSON.stringify({
              locationId:
                context.locationId,

              locationName:
                context.locationName
            })}::jsonb,
            ${JSON.stringify({
              locationId:
                target.locationId,

              locationName:
                target.locationName,

              routeMode:
                target.routeMode,

              routeStatus:
                target.routeStatus
            })}::jsonb,
            'COMPLETED'
          )
        `;
      }
    );


    return apiOk(
      requestId,

      {
        locationId:
          target.locationId,

        locationName:
          target.locationName,

        financialYear:
          target.financialYear,

        routeMode:
          target.routeMode,

        routeStatus:
          target.routeStatus
      },

      "Активну філію змінено.",

      "LOCATION_SWITCHED"
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