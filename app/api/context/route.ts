import {
  apiFromError,
  apiOk,
  getRequestId
} from "@/lib/server/api";

import {
  requireSessionContext
} from "@/lib/server/session";


export const runtime = "nodejs";


export async function GET(
  request: Request
) {
  const requestId =
    getRequestId(request);

  try {
    const context =
      await requireSessionContext();

    return apiOk(
      requestId,
      {
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
      "Контекст сесії отримано.",
      "SESSION_CONTEXT"
    );
  } catch (error) {
    return apiFromError(
      requestId,
      error
    );
  }
}