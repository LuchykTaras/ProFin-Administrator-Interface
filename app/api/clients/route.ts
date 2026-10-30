import { apiFromError, apiOk, getRequestId } from "@/lib/server/api";
import { AppError } from "@/lib/server/errors";
import { assertPermission } from "@/lib/server/rbac";
import { requireSessionContext } from "@/lib/server/session";
import { getClientDirectory } from "@/lib/server/client-directory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const context = await requireSessionContext();
    assertPermission(context, "journal:read");

    const url = new URL(request.url);
    const allowed = new Set(["q", "offset", "limit"]);
    if ([...url.searchParams.keys()].some(key =>
          !allowed.has(key) || url.searchParams.getAll(key).length !== 1)) {
      throw new AppError({
        status: 400,
        code: "CLIENT_DIRECTORY_QUERY_FORBIDDEN",
        userMessage: "Запит клієнтської бази містить недозволені параметри."
      });
    }

    const query = (url.searchParams.get("q") || "").trim();
    const rawOffset = url.searchParams.get("offset") ?? "0";
    const rawLimit = url.searchParams.get("limit") ?? "50";
    if (query.length > 80 || !/^(0|[1-9]\d*)$/.test(rawOffset) ||
        !/^[1-9]\d*$/.test(rawLimit)) {
      throw new AppError({
        status: 400,
        code: "CLIENT_DIRECTORY_QUERY_INVALID",
        userMessage: "Некоректні параметри пошуку клієнтів."
      });
    }
    const offset = Number(rawOffset);
    const limit = Number(rawLimit);
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(limit) ||
        limit < 1 || limit > 100) {
      throw new AppError({
        status: 400,
        code: "CLIENT_DIRECTORY_PAGE_INVALID",
        userMessage: "Некоректний розмір або номер сторінки."
      });
    }

    const data = await getClientDirectory({
      requestId, context, query, offset, limit, signal: request.signal
    });
    return apiOk(requestId, data, "Клієнтську базу отримано.",
      "CLIENT_DIRECTORY_OK");
  } catch (error) {
    return apiFromError(requestId, error);
  }
}
