import "server-only";

import {
  CLIENT_BIRTHDAYS_CONTRACT_VERSION
} from "@/lib/contracts/clients";

import type {
  ClientBirthdayItem,
  ClientBirthdaysData
} from "@/lib/contracts/clients";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  AppError
} from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";


type GetClientBirthdaysParams = {
  requestId:
    string;

  context:
    SessionContext;

  daysAhead:
    number;

  signal?:
    AbortSignal;
};


type ClientBirthdaysPayload = {
  days:
    number;
};


type ClientBirthdaysAdapterData = {
  result:
    unknown;
};


function isRecord(
  value:
    unknown
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}


function parseBirthdayItem(
  value:
    unknown
): ClientBirthdayItem {
  if (
    !isRecord(
      value
    ) ||
    typeof value.clientId !==
      "string" ||
    typeof value.name !==
      "string" ||
    typeof value.birthDate !==
      "string" ||
    (
      value.doctor !== null &&
      typeof value.doctor !==
        "string"
    ) ||
    typeof value.nextBirthday !==
      "string" ||
    typeof value.daysUntil !==
      "number" ||
    typeof value.ageTurning !==
      "number"
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_CLIENT_BIRTHDAY_ITEM",

      userMessage:
        "Сервер повернув некоректні дані іменинників.",

      technicalMessage:
        "Apps Script birthday item does not match ClientBirthdayItem.",

      retryable:
        false
    });
  }


  return {
    clientId:
      value.clientId,

    name:
      value.name,

    birthDate:
      value.birthDate,

    doctor:
      value.doctor,

    nextBirthday:
      value.nextBirthday,

    daysUntil:
      value.daysUntil,

    ageTurning:
      value.ageTurning
  };
}


function parseBirthdaysResult(
  value:
    unknown
): ClientBirthdaysData {
  if (
    !isRecord(
      value
    ) ||
    value.version !==
      CLIENT_BIRTHDAYS_CONTRACT_VERSION ||
    value.sourceSheet !==
      "Клієнтська база" ||
    typeof value.checkedAt !==
      "string" ||
    typeof value.timezone !==
      "string" ||
    typeof value.daysAhead !==
      "number" ||
    typeof value.todayCount !==
      "number" ||
    typeof value.total !==
      "number" ||
    !Array.isArray(
      value.items
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_CLIENT_BIRTHDAYS_RESULT",

      userMessage:
        "Сервер повернув некоректну відповідь.",

      technicalMessage:
        "Apps Script result does not match PROFIN_CLIENT_BIRTHDAYS_V1.",

      retryable:
        false
    });
  }


  const items =
    value.items.map(
      parseBirthdayItem
    );


  return {
    version:
      CLIENT_BIRTHDAYS_CONTRACT_VERSION,

    sourceSheet:
      "Клієнтська база",

    checkedAt:
      value.checkedAt,

    timezone:
      value.timezone,

    daysAhead:
      value.daysAhead,

    todayCount:
      value.todayCount,

    total:
      items.length,

    items:
      items
  };
}


export async function getClientBirthdays(
  params:
    GetClientBirthdaysParams
): Promise<ClientBirthdaysData> {
  const response =
    await callAppsScriptAdapter<
      ClientBirthdaysPayload,
      ClientBirthdaysAdapterData
    >({
      requestId:
        params.requestId,

      command:
        "getClientBirthdaysWeb",

      context:
        params.context,

      payload: {
        days:
          params.daysAhead
      },

      idempotencyKey:
        null,

      signal:
        params.signal
    });


  const data =
    response.data;


  if (
    !data ||
    !isRecord(
      data
    ) ||
    !(
      "result" in
      data
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "CLIENT_BIRTHDAYS_RESULT_MISSING",

      userMessage:
        "Сервер не повернув список іменинників.",

      technicalMessage:
        "Apps Script response.data.result is missing.",

      retryable:
        true
    });
  }


  return parseBirthdaysResult(
    data.result
  );
}