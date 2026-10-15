import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  listTrustedTransferRoutes,
  resolveTrustedTransferRoute
} from "@/lib/server/operational-config";

import {
  assertDedicatedTransferAdapter
} from "@/lib/server/transfer-write-policy";

import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";

import type {
  IncomingTransferItem,
  TransferInboxResult
} from "@/lib/contracts/operational-commands";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context = await requireSessionContext();

    assertPermission(context, "inventory:read");

    await assertDedicatedTransferAdapter(context);

    const routes = (
      await listTrustedTransferRoutes(context)
    ).filter(
      (route) => route.direction === "INCOMING"
    );

    const items: IncomingTransferItem[] = [];

    for (const option of routes) {
      const transferRoute = await resolveTrustedTransferRoute(
        context,
        option.routeId,
        "INCOMING"
      );

      const response = await callAppsScriptAdapter<
        {
          transferRoute: typeof transferRoute;
        },
        {
          result?: {
            items: Omit<IncomingTransferItem, "routeId">[];
          };
        }
      >({
        requestId,
        command: "getTransferInbox",
        context,
        payload: {
          transferRoute
        }
      });

      const incomingItems = response.data?.result?.items;

      if (!Array.isArray(incomingItems)) {
        throw new AppError({
          status: 502,
          code: "TRANSFER_INBOX_INVALID",
          userMessage:
            "Некоректна відповідь журналу вхідних передач."
        });
      }

      for (const item of incomingItems) {
        if (
          typeof item.transferId !== "string" ||
          !item.transferId
        ) {
          throw new AppError({
            status: 502,
            code: "TRANSFER_INBOX_INVALID",
            userMessage:
              "Дані переміщення не пройшли перевірку."
          });
        }

        items.push({
          ...item,
          routeId: option.routeId
        });
      }
    }

    items.sort((first, second) =>
      first.transferId.localeCompare(second.transferId)
    );

    const result: TransferInboxResult = {
      checkedAt: new Date().toISOString(),
      items
    };

    return apiOk(
      requestId,
      result,
      "Вхідні переміщення оновлено.",
      "TRANSFER_INBOX"
    );
  } catch (error) {
    return apiFromError(requestId, error);
  }
}