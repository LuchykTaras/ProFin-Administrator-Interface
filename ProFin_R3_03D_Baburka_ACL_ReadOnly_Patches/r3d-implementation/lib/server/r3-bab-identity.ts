import "server-only";

import { db } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import { resolveAppsScriptAnnualRoute } from "@/lib/server/apps-script-route";
import { assertPermission } from "@/lib/server/rbac";
import type { SessionContext } from "@/lib/server/session";

const BAB_SPREADSHEET_ID =
  "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw";

export type R3BabVerifiedIdentity = {
  googleSub: string;
  googleEmail: string;
};

type LinkRow = R3BabVerifiedIdentity & {
  sharedSubject: boolean;
  sharedEmail: boolean;
};

export async function requireR3BabVerifiedIdentity(
  context: SessionContext,
  date: string
): Promise<R3BabVerifiedIdentity> {
  assertPermission(context, "shift:read");

  if (
    context.projectId !== "demo-project" ||
    context.locationId !== "main" ||
    context.activeYear !== 2026 ||
    !["OWNER", "SENIOR_ADMIN"].includes(context.role)
  ) {
    throw new AppError({
      status: 403,
      code: "R3_BAB_ROLE_OR_BRANCH_DENIED",
      userMessage: "Financial report access denied."
    });
  }

  const route = await resolveAppsScriptAnnualRoute(context, date);
  if (
    route.projectId !== "demo-project" ||
    route.locationId !== "main" ||
    route.year !== 2026 ||
    route.routeMode !== "PRODUCTION" ||
    route.status !== "ACTIVE" ||
    route.spreadsheetId !== BAB_SPREADSHEET_ID
  ) {
    throw new AppError({
      status: 403,
      code: "R3_BAB_PRODUCTION_ROUTE_DENIED",
      userMessage: "Financial report route denied."
    });
  }

  const rows = await db()`
    SELECT
      l.google_sub AS "googleSub",
      l.google_email AS "googleEmail",
      EXISTS (
        SELECT 1
        FROM public.profin_google_identity_links other
        WHERE other.project_id = l.project_id
          AND other.google_sub = l.google_sub
          AND other.user_id <> l.user_id
          AND other.revoked_at IS NULL
      ) AS "sharedSubject",
      EXISTS (
        SELECT 1
        FROM public.profin_google_identity_links other
        WHERE other.project_id = l.project_id
          AND lower(other.google_email) = lower(l.google_email)
          AND other.user_id <> l.user_id
          AND other.revoked_at IS NULL
      ) AS "sharedEmail"
    FROM public.profin_google_identity_links l
    WHERE l.project_id = ${context.projectId}
      AND l.user_id = ${context.userId}
      AND l.revoked_at IS NULL
    LIMIT 2
  `;

  const link = rows[0] as LinkRow | undefined;
  if (
    rows.length !== 1 ||
    !link ||
    link.sharedSubject !== false ||
    link.sharedEmail !== false ||
    typeof link.googleSub !== "string" ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(link.googleSub) ||
    typeof link.googleEmail !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(link.googleEmail.trim()) ||
    link.googleEmail.length > 320
  ) {
    throw new AppError({
      status: 403,
      code: "R3_BAB_GOOGLE_LINK_NOT_VERIFIED",
      userMessage: "Google identity link is missing or conflicting."
    });
  }

  return {
    googleSub: link.googleSub,
    googleEmail: link.googleEmail.trim().toLowerCase()
  };
}
