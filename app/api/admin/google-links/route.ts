import {
  apiFromError, apiOk, getRequestId
} from "@/lib/server/api";
import { createId } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import {
  createLinkId, disabledFinancialAccess, googleLinkConfig,
  noStore, readBody, requireOwner, requireSameOrigin, requireString
} from "@/lib/server/google-link";
import { verifyPassword } from "@/lib/server/password";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    googleLinkConfig();
    const context = await requireSessionContext();
    requireOwner(context);
    assertPermission(context, "users:manage");
    const sql = db();
    const [requests, links] = await Promise.all([
      sql`
        SELECT r.request_id AS "requestId", r.user_id AS "userId",
          u.display_name AS "userName", u.role AS "role",
          r.google_email AS "googleEmail", r.expires_at AS "expiresAt"
        FROM public.profin_google_link_requests r
        JOIN public.users u ON u.user_id = r.user_id AND u.project_id = r.project_id
        WHERE r.project_id = ${context.projectId} AND r.status = 'PENDING'
          AND r.expires_at > NOW() AND u.status = 'ACTIVE' AND u.revoked_at IS NULL
        ORDER BY r.created_at DESC LIMIT 100
      `,
      sql`
        SELECT l.link_id AS "linkId", l.user_id AS "userId",
          u.display_name AS "userName", u.role AS "role",
          l.google_email AS "googleEmail", l.linked_at AS "linkedAt"
        FROM public.profin_google_identity_links l
        JOIN public.users u ON u.user_id = l.user_id AND u.project_id = l.project_id
        WHERE l.project_id = ${context.projectId} AND l.revoked_at IS NULL
        ORDER BY l.linked_at DESC LIMIT 100
      `
    ]);
    return noStore(apiOk(requestId, {
      pendingRequests: requests, activeLinks: links,
      ...disabledFinancialAccess()
    }, "Прив’язки Google отримано.", "GOOGLE_LINK_OWNER_LIST_OK"));
  } catch (error) {
    return noStore(apiFromError(requestId, error));
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { origin } = googleLinkConfig();
    const context = await requireSessionContext();
    requireOwner(context);
    assertPermission(context, "users:manage");
    requireSameOrigin(request, origin);
    const body = await readBody(request);
    const action = requireString(body.action, 20);
    if (!(["approve", "reject", "revoke"] as string[]).includes(action)) {
      throw new AppError({ status: 400, code: "INVALID_LINK_ACTION", userMessage: "Невідома дія." });
    }
    const targetId = requireString(body.id, 120);
    const password = requireString(body.password, 256);
    const reason = action === "approve"
      ? "Підтверджено власником після перевірки Google-особи"
      : requireString(body.reason, 500).trim();
    if (reason.length < 10) {
      throw new AppError({ status: 400, code: "REASON_REQUIRED", userMessage: "Потрібна причина (не менше 10 символів)." });
    }

    const sql = db();
    // Every attempt is audited before password verification; cap attempts per owner.
    await sql.begin(async tx => {
      const owner = await tx`
        SELECT user_id FROM public.users
        WHERE user_id = ${context.userId} AND project_id = ${context.projectId}
          AND role = 'OWNER' AND status = 'ACTIVE' AND revoked_at IS NULL
        FOR UPDATE
      `;
      if (owner.length !== 1) {
        throw new AppError({ status: 403, code: "OWNER_REQUIRED", userMessage: "Права власника не підтверджено." });
      }
      const attempts = await tx`
        SELECT COUNT(*)::int AS total FROM public.audit_events
        WHERE actor_user_id = ${context.userId} AND project_id = ${context.projectId}
          AND action = 'GOOGLE_LINK_OWNER_ATTEMPT'
          AND occurred_at > NOW() - INTERVAL '15 minutes'
      `;
      if (Number(attempts[0]?.total || 0) >= 5) {
        throw new AppError({ status: 429, code: "OWNER_LINK_RATE_LIMIT", userMessage: "Ліміт підтверджень перевищено. Спробуйте пізніше." });
      }
      await tx`
        INSERT INTO public.audit_events
          (event_id, request_id, actor_user_id, actor_role, project_id, location_id,
            financial_year, action, target_type, target_id, result)
        VALUES (${createId("evt")}, ${requestId}, ${context.userId}, ${context.role},
          ${context.projectId}, ${context.locationId}, ${context.activeYear},
          'GOOGLE_LINK_OWNER_ATTEMPT', 'GOOGLE_IDENTITY_LINK', ${targetId}, 'RECEIVED')
      `;
    });

    const owners = await sql`
      SELECT password_hash AS "passwordHash", password_reset_required AS "resetRequired"
      FROM public.users WHERE user_id = ${context.userId}
        AND project_id = ${context.projectId}
        AND role = 'OWNER' AND status = 'ACTIVE' AND revoked_at IS NULL
    `;
    const owner = owners[0] as { passwordHash: string | null; resetRequired: boolean } | undefined;
    if (!owner?.passwordHash || owner.resetRequired || !await verifyPassword(password, owner.passwordHash)) {
      throw new AppError({ status: 403, code: "OWNER_REAUTH_FAILED", userMessage: "Не підтверджено пароль власника." });
    }

    if (action === "revoke") {
      const changed = await sql.begin(async tx => {
        const rows = await tx`
          SELECT link_id AS "linkId", user_id AS "userId"
          FROM public.profin_google_identity_links
          WHERE link_id = ${targetId} AND project_id = ${context.projectId}
            AND revoked_at IS NULL
          FOR UPDATE
        `;
        const link = rows[0] as { linkId: string; userId: string } | undefined;
        if (!link) {
          throw new AppError({ status: 404, code: "LINK_NOT_FOUND", userMessage: "Активну прив’язку не знайдено." });
        }
        await tx`
          UPDATE public.profin_google_identity_links
          SET revoked_at = NOW(), revoked_by = ${context.userId}, revocation_reason = ${reason}
          WHERE link_id = ${targetId} AND revoked_at IS NULL
        `;
        // Revoked identity must not leave an active session behind.
        await tx`
          UPDATE public.users SET token_version = token_version + 1
          WHERE user_id = ${link.userId} AND project_id = ${context.projectId}
        `;
        await tx`
          UPDATE public.sessions SET revoked_at = NOW()
          WHERE user_id = ${link.userId} AND project_id = ${context.projectId}
            AND revoked_at IS NULL
        `;
        await tx`
          INSERT INTO public.audit_events
            (event_id, request_id, actor_user_id, actor_role, project_id, location_id,
              financial_year, action, target_type, target_id, reason, result)
          VALUES (${createId("evt")}, ${requestId}, ${context.userId}, ${context.role},
            ${context.projectId}, ${context.locationId}, ${context.activeYear},
            'GOOGLE_LINK_REVOKED', 'GOOGLE_IDENTITY_LINK', ${targetId}, ${reason}, 'COMPLETED')
        `;
        return link;
      });
      return noStore(apiOk(requestId, {
        linkId: changed.linkId, status: "REVOKED",
        sessionsRevoked: true, ...disabledFinancialAccess()
      }, "Прив’язку відкликано, сесії завершено.", "GOOGLE_LINK_REVOKED"));
    }

    let result: { status: string; userId: string };
    try {
      result = await sql.begin(async tx => {
        const rows = await tx`
          SELECT request_id AS "requestId", user_id AS "userId",
            google_sub AS "googleSub", google_email AS "googleEmail"
          FROM public.profin_google_link_requests
          WHERE request_id = ${targetId} AND project_id = ${context.projectId}
            AND status = 'PENDING' AND expires_at > NOW()
          FOR UPDATE
        `;
        const pending = rows[0] as {
          requestId: string; userId: string; googleSub: string; googleEmail: string
        } | undefined;
        if (!pending) {
          throw new AppError({ status: 409, code: "LINK_REQUEST_NOT_ACTIVE", userMessage: "Заявка вже оброблена або прострочена." });
        }
        const users = await tx`
          SELECT role FROM public.users WHERE user_id = ${pending.userId}
            AND project_id = ${context.projectId} AND status = 'ACTIVE'
            AND revoked_at IS NULL AND password_reset_required = FALSE
          FOR UPDATE
        `;
        if (users.length !== 1) {
          throw new AppError({ status: 403, code: "LINK_USER_INACTIVE", userMessage: "Користувач недоступний." });
        }
        if (
          pending.userId === context.userId &&
          (process.env.PROFIN_GOOGLE_OWNER_SELF_LINK_ENABLED !== "true" || users[0].role !== "OWNER")
        ) {
          throw new AppError({ status: 403, code: "OWNER_SELF_LINK_DISABLED", userMessage: "Самостійне підтвердження власника вимкнено." });
        }
        if (action === "approve") {
          const active = await tx`
            SELECT link_id FROM public.profin_google_identity_links
            WHERE project_id = ${context.projectId} AND revoked_at IS NULL
              AND (user_id = ${pending.userId} OR google_sub = ${pending.googleSub})
            LIMIT 1
          `;
          if (active.length) {
            throw new AppError({ status: 409, code: "GOOGLE_LINK_EXISTS", userMessage: "Виявлено іншу активну прив’язку." });
          }
          const linkId = createLinkId();
          await tx`
            INSERT INTO public.profin_google_identity_links
              (link_id, project_id, user_id, google_sub, google_email,
                request_id, linked_by)
            VALUES (${linkId}, ${context.projectId}, ${pending.userId},
              ${pending.googleSub}, ${pending.googleEmail}, ${pending.requestId}, ${context.userId})
          `;
        }
        const status = action === "approve" ? "APPROVED" : "REJECTED";
        await tx`
          UPDATE public.profin_google_link_requests
          SET status = ${status}, reviewed_at = NOW(),
            reviewed_by = ${context.userId}, review_reason = ${reason}
          WHERE request_id = ${targetId} AND status = 'PENDING'
        `;
        await tx`
          INSERT INTO public.audit_events
            (event_id, request_id, actor_user_id, actor_role, project_id, location_id,
              financial_year, action, target_type, target_id, reason, after_snapshot, result)
          VALUES (${createId("evt")}, ${requestId}, ${context.userId}, ${context.role},
            ${context.projectId}, ${context.locationId}, ${context.activeYear},
            ${action === "approve" ? "GOOGLE_LINK_APPROVED" : "GOOGLE_LINK_REJECTED"},
            'GOOGLE_IDENTITY_LINK', ${targetId}, ${reason},
            ${JSON.stringify({ status, userId: pending.userId })}::jsonb, 'COMPLETED')
        `;
        return { status, userId: pending.userId };
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new AppError({ status: 409, code: "GOOGLE_LINK_CONFLICT", userMessage: "Прив’язка вже існує." });
      }
      throw error;
    }
    return noStore(apiOk(requestId, {
      status: result.status,
      ...disabledFinancialAccess()
    }, result.status === "APPROVED" ? "Прив’язку підтверджено." : "Заявку відхилено.",
    result.status === "APPROVED" ? "GOOGLE_LINK_APPROVED" : "GOOGLE_LINK_REJECTED"));
  } catch (error) {
    return noStore(apiFromError(requestId, error));
  }
}
