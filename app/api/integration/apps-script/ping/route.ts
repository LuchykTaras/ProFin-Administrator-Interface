import type {
  AppsScriptPingData,
  AppsScriptPingPayload
} from "@/lib/contracts/apps-script-adapter";

import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

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


    const adapterResponse =
      await callAppsScriptAdapter<
        AppsScriptPingPayload,
        AppsScriptPingData
      >({
        requestId,

        command:
          "ping",

        context,

        payload: {
          source:
            "NEXTJS"
        }
      });


    return apiOk(
      requestId,

      {
        transport:
          "OK",

        adapter:
          adapterResponse.data
      },

      "Зв'язок з Apps Script adapter встановлено.",

      "APPS_SCRIPT_TRANSPORT_OK"
    );
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}