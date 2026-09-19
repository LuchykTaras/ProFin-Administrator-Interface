import type {
  TransferRouteOption
} from "@/lib/contracts/operational-commands";

import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";
import {
  listTrustedTransferRoutes
} from "@/lib/server/operational-config";
import {
  assertPermission
} from "@/lib/server/rbac";
import {
  requireSessionContext
} from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request
) {
  const requestId =
    getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    assertPermission(
      context,
      "inventory:read"
    );

    const routes =
      await listTrustedTransferRoutes(
        context
      );

    return apiOk<{
      routes: TransferRouteOption[];
    }>(
      requestId,
      {
        routes
      },
      "Дозволені маршрути переміщення отримано.",
      "TRANSFER_ROUTES"
    );
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}