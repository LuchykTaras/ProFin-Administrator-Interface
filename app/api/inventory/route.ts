import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  AppError
} from "@/lib/server/errors";

import {
  getInventory
} from "@/lib/server/inventory";

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
     * Trusted context:
     *
     * projectId
     * locationId
     * activeYear
     *
     * беремо тільки
     * із server session.
     */
    const context =
      await requireSessionContext();


    /*
     * Склад дозволено читати
     * лише користувачу,
     * який має inventory:read.
     */
    if (
      !hasPermission(
        context,
        "inventory:read"
      )
    ) {
      throw new AppError({
        status:
          403,

        code:
          "INVENTORY_READ_FORBIDDEN",

        userMessage:
          "У вас немає доступу до складу.",

        technicalMessage:
          "Session does not have inventory:read permission.",

        retryable:
          false
      });
    }


    const inventory =
      await getInventory({
        requestId,

        context,

        signal:
          request.signal
      });


    return apiOk(
      requestId,

      inventory,

      "Дані складу отримано.",

      "INVENTORY_READ_SUCCESS"
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