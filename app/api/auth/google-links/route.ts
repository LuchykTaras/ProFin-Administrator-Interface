import { randomBytes } from "node:crypto";
import {
  apiFromError, apiOk, getRequestId
} from "@/lib/server/api";
import { createId, sha256 } from "@/lib/server/crypto";
import { db } from "@/lib/server/db";
import { AppError } from "@/lib/server/errors";
import {
  googleLinkConfig, requireSameOrigin, readBody, requireString,
  verifiedGoogleIdentity, disabledFinancialAccess,
  createLinkChallengeId, createLinkRequestId, noStore
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
    assertPermission(context, "shift:read");
    const sql = db();
    const [links, pending] = await Promise.all([
      sql`
        SELECT link_id AS "linkId", google_email AS "googleEmail", linked_at AS "linkedAt"
        FROM public.profin_google_identity_links
        WHERE project_id = ${context.projectId}
          AND user_id = ${context.userId} AND revoked_at IS NULL
        ORDER BY linked_at DESC LIMIT 1
      `,
      sql`
        SELECT request_id AS "requestId", status, expires_at AS "expiresAt"
        FROM public.profin_google_link_requests
        WHERE project_id = ${context.projectId}
          AND user_id = ${context.userId}
          AND status = 'PENDING' AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1
      `
    ]);
    return noStore(apiOk(requestId, {
      link: links[0] ?? null,
      pendingRequest: pending[0] ?? null,
      ...disabledFinancialAccess()
    }, "Статус Google-прив’язки отримано.", "GOOGLE_LINK_STATUS_OK"));
  } catch (error) {
    return noStore(apiFromError(requestId, error));
  }
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  try {
    const { clientId, origin } = googleLinkConfig();
    const context = await requireSessionContext();
    assertPermission(context, "shift:read");
    requireSameOrigin(request, origin);
    const body = await readBody(request);
    const action = requireString(body.action, 20);
    const sql = db();

    if (action === "challenge") {
      const nonce = randomBytes(32).toString("base64url");
      const challengeId = createLinkChallengeId();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
      await sql.begin(async tx => {
        const users = await tx`
          SELECT user_id FROM public.users
          WHERE user_id = ${context.userId} AND project_id = ${context.projectId}
            AND role = ${context.role} AND status = 'ACTIVE'
            AND revoked_at IS NULL AND password_reset_required = FALSE
          FOR UPDATE
        `;
        if (users.length !== 1) {
          throw new AppError({ status: 403, code: "USER_NOT_ELIGIBLE", userMessage: "Обліковий запис не готовий до прив’язки." });
        }
        const attempts = await tx`
          SELECT count(*)::int AS total FROM public.profin_google_link_challenges
          WHERE project_id = ${context.projectId} AND user_id = ${context.userId}
            AND created_at > NOW() - INTERVAL '15 minutes'
        `;
        if (Number(attempts[0]?.total || 0) >= 5) {
          throw new AppError({ status: 429, code: "LINK_RATE_LIMIT", userMessage: "Забагато спроб. Повторіть пізніше." });
        }
        await tx`
          INSERT INTO public.profin_google_link_challenges
            (challenge_id, project_id, user_id, session_id, nonce_hash, expires_at)
          VALUES (${challengeId}, ${context.projectId}, ${context.userId},
            ${context.sessionId}, ${sha256(nonce)}, ${expiresAt})
        `;
      });
      return noStore(apiOk(requestId, {
        clientId, challengeId, nonce,
        expiresInSeconds: 300,
        ...disabledFinancialAccess()
      }, "Google-перевірку підготовлено.", "GOOGLE_LINK_CHALLENGE_OK"));
    }

    if (action !== "request") {
      throw new AppError({ status: 400, code: "INVALID_ACTION", userMessage: "Невідома дія." });
    }

    const challengeId = requireString(body.challengeId, 100);
    const nonce = requireString(body.nonce, 100);
    const credential = requireString(body.credential, 12000);
    const password = requireString(body.password, 256);
    if (!/^[A-Za-z0-9_-]{43}$/.test(nonce) || credential.length < 100) {
      throw new AppError({ status: 400, code: "INVALID_GOOGLE_PROOF", userMessage: "Неправильний формат підтвердження." });
    }

    const consumed = await sql`
      UPDATE public.profin_google_link_challenges
      SET consumed_at = NOW()
      WHERE challenge_id = ${challengeId}
        AND nonce_hash = ${sha256(nonce)}
        AND project_id = ${context.projectId}
        AND user_id = ${context.userId}
        AND session_id = ${context.sessionId}
        AND consumed_at IS NULL AND expires_at > NOW()
      RETURNING challenge_id
    `;
    if (consumed.length !== 1) {
      throw new AppError({ status: 409, code: "LINK_CHALLENGE_USED", userMessage: "Перевірка використана або прострочена." });
    }

    const google = await verifiedGoogleIdentity(credential, nonce, clientId);
    const userRows = await sql`
      SELECT password_hash AS "passwordHash", password_reset_required AS "resetRequired"
      FROM public.users WHERE user_id = ${context.userId}
        AND project_id = ${context.projectId} AND role = ${context.role}
        AND status = 'ACTIVE' AND revoked_at IS NULL
    `;
    const user = userRows[0] as { passwordHash: string | null; resetRequired: boolean } | undefined;
    if (!user?.passwordHash || user.resetRequired || !await verifyPassword(password, user.passwordHash)) {
      throw new AppError({ status: 403, code: "PROFIN_REAUTH_FAILED", userMessage: "Не підтверджено пароль ProFin." });
    }

    const linkRequestId = createLinkRequestId();
    try {
      await sql.begin(async tx => {
        const locked = await tx`
          SELECT user_id FROM public.users
          WHERE user_id = ${context.userId} AND project_id = ${context.projectId}
            AND role = ${context.role} AND status = 'ACTIVE'
            AND revoked_at IS NULL AND password_reset_required = FALSE
          FOR UPDATE
        `;
        if (locked.length !== 1) {
          throw new AppError({ status: 403, code: "USER_NOT_ELIGIBLE", userMessage: "Користувач недоступний." });
        }
        await tx`
          UPDATE public.profin_google_link_requests SET status = 'EXPIRED'
          WHERE project_id = ${context.projectId} AND status = 'PENDING'
            AND expires_at <= NOW()
            AND (user_id = ${context.userId} OR google_sub = ${google.sub})
        `;
        const active = await tx`
          SELECT link_id FROM public.profin_google_identity_links
          WHERE project_id = ${context.projectId} AND revoked_at IS NULL
            AND (user_id = ${context.userId} OR google_sub = ${google.sub})
          LIMIT 1
        `;
        if (active.length) {
          throw new AppError({ status: 409, code: "GOOGLE_LINK_EXISTS", userMessage: "Обліковий запис уже має прив’язку." });
        }
        await tx`
          INSERT INTO public.profin_google_link_requests
            (request_id, project_id, user_id, google_sub, google_email, expires_at)
          VALUES (${linkRequestId}, ${context.projectId}, ${context.userId},
            ${google.sub}, ${google.email}, NOW() + INTERVAL '24 hours')
        `;
        await tx`
          INSERT INTO public.audit_events
            (event_id, request_id, actor_user_id, actor_role, project_id, location_id,
              financial_year, action, target_type, target_id, after_snapshot, result)
          VALUES (${createId("evt")}, ${requestId}, ${context.userId}, ${context.role},
            ${context.projectId}, ${context.locationId}, ${context.activeYear},
            'GOOGLE_LINK_REQUESTED', 'GOOGLE_IDENTITY_LINK', ${linkRequestId},
            ${JSON.stringify({ status: "PENDING", userId: context.userId })}::jsonb, 'COMPLETED')
        `;
      });
    } catch (error) {
      if ((error as { code?: string })?.code === "23505") {
        throw new AppError({ status: 409, code: "GOOGLE_LINK_REQUEST_CONFLICT", userMessage: "Прив’язку вже запитано для цього користувача або Google-акаунту." });
      }
      throw error;
    }

    return noStore(apiOk(requestId, {
      requestId: linkRequestId,
      status: "PENDING_OWNER_APPROVAL",
      ...disabledFinancialAccess()
    }, "Запит на прив’язку створено. Очікується підтвердження власника.", "GOOGLE_LINK_REQUESTED"));
  } catch (error) {
    return noStore(apiFromError(requestId, error));
  }
}
