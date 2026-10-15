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
  OutgoingTransferItem,
  TransferOutboxResult
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
      (route) => route.direction === "OUTGOING"
    );

    const items: OutgoingTransferItem[] = [];

    for (const option of routes) {
      const transferRoute = await resolveTrustedTransferRoute(
        context,
        option.routeId,
        "OUTGOING"
      );

      const response = await callAppsScriptAdapter<
        {
          transferRoute: typeof transferRoute;
        },
        {
          result?: {
            items: Omit<OutgoingTransferItem, "routeId">[];
          };
        }
      >({
        requestId,
        command: "getTransferOutbox",
        context,
        payload: {
          transferRoute
        }
      });

      const outgoingItems = response.data?.result?.items;

      if (!Array.isArray(outgoingItems)) {
        throw new AppError({
          status: 502,
          code: "TRANSFER_OUTBOX_INVALID",
          userMessage:
            "Некоректна відповідь журналу передач."
        });
      }

      for (const item of outgoingItems) {
        if (
          typeof item.transferId !== "string" ||
          !item.transferId
        ) {
          throw new AppError({
            status: 502,
            code: "TRANSFER_OUTBOX_INVALID",
            userMessage:
              "Некоректний ID відправленої передачі."
          });
        }

        items.push({
          ...item,
          routeId: option.routeId
        });
      }
    }

    const result: TransferOutboxResult = {
      checkedAt: new Date().toISOString(),
      items
    };

    return apiOk(
      requestId,
      result,
      "Відправлені передачі отримано.",
      "TRANSFER_OUTBOX"
    );
  } catch (error) {
    return apiFromError(requestId, error);
  }
}