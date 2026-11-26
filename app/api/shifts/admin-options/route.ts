import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";

import {
  getShiftAdminOptions
} from "@/lib/server/shift-admin-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    assertPermission(context, "shift:close");

    if (
      context.role !== "OWNER" &&
      context.role !== "SENIOR_ADMIN"
    ) {
      throw new AppError({
        status: 403,
        code: "SHIFT_ADMIN_OPTIONS_FORBIDDEN",
        userMessage: "Недостатньо прав.",
        retryable: false
      });
    }

    const names =
      await getShiftAdminOptions(context);

    const response = apiOk(
      requestId,
      { names },
      "Список адміністраторів отримано.",
      "SHIFT_ADMIN_OPTIONS_OK"
    );

    response.headers.set(
      "Cache-Control",
      "private, no-store"
    );

    return response;
  } catch (error) {
    const response =
      apiFromError(requestId, error);

    response.headers.set(
      "Cache-Control",
      "private, no-store"
    );

    return response;
  }
}