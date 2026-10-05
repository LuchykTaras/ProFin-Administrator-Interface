import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  assertPermission
} from "@/lib/server/rbac";

import {
  getClientBirthdays
} from "@/lib/server/client-birthdays";

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
      "journal:read"
    );


    const url =
      new URL(
        request.url
      );


    const rawDays =
      url.searchParams.get(
        "days"
      );


    const parsedDays =
      rawDays === null
        ? 7
        : Number(
            rawDays
          );


    const daysAhead =
      Number.isFinite(
        parsedDays
      )
        ? Math.max(
            0,
            Math.min(
              31,
              Math.floor(
                parsedDays
              )
            )
          )
        : 7;


    const birthdays =
      await getClientBirthdays({
        requestId:
          requestId,

        context:
          context,

        daysAhead:
          daysAhead,

        signal:
          request.signal
      });


    return apiOk(
      requestId,
      birthdays,
      "Список іменинників отримано.",
      "CLIENT_BIRTHDAYS"
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