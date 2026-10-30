import "server-only";

import {
  CLIENT_DIRECTORY_CONTRACT_VERSION
} from "@/lib/contracts/client-directory";
import type {
  ClientDirectoryData,
  ClientDirectoryItem
} from "@/lib/contracts/client-directory";
import { callAppsScriptAdapter } from "@/lib/server/apps-script-transport";
import { AppError } from "@/lib/server/errors";
import type { SessionContext } from "@/lib/server/session";

type DirectoryParams = {
  requestId: string;
  context: SessionContext;
  query: string;
  offset: number;
  limit: number;
  signal: AbortSignal;
};

type AdapterResult = { result?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null &&
    !Array.isArray(value);
}

function clientReadError(code: string): never {
  throw new AppError({
    status: 502,
    code,
    userMessage: "Джерело повернуло некоректну клієнтську базу.",
    retryable: false
  });
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function parseItem(value: unknown): ClientDirectoryItem {
  if (!isRecord(value) || typeof value.clientId !== "string" ||
      !value.clientId.trim() || typeof value.displayName !== "string" ||
      !value.displayName.trim() ||
      !nullableString(value.birthDate) ||
      !nullableString(value.phone) ||
      !nullableString(value.guardianName) ||
      !nullableString(value.doctorName) ||
      !nullableString(value.tag) ||
      (value.birthDate !== null &&
       !/^\d{4}-\d{2}-\d{2}$/.test(value.birthDate))) {
    clientReadError("CLIENT_DIRECTORY_ITEM_INVALID");
  }
  return {
    clientId: value.clientId,
    displayName: value.displayName,
    birthDate: value.birthDate,
    phone: value.phone,
    guardianName: value.guardianName,
    doctorName: value.doctorName,
    tag: value.tag
  };
}

export async function getClientDirectory(
  params: DirectoryParams
): Promise<ClientDirectoryData> {
  const response = await callAppsScriptAdapter<
    { q: string; offset: number; limit: number }, AdapterResult
  >({
    requestId: params.requestId,
    command: "getClientsWeb",
    context: params.context,
    payload: {
      q: params.query,
      offset: params.offset,
      limit: params.limit
    },
    idempotencyKey: null,
    signal: params.signal
  });

  const value = response.data?.result;
  if (!isRecord(value) ||
      value.version !== CLIENT_DIRECTORY_CONTRACT_VERSION ||
      value.sourceSheet !== "Клієнтська база" ||
      value.locationId !== params.context.locationId ||
      typeof value.checkedAt !== "string" ||
      value.query !== params.query.trim() ||
      value.offset !== params.offset ||
      value.limit !== params.limit ||
      typeof value.total !== "number" ||
      !Number.isSafeInteger(value.total) ||
      (value.total as number) < 0 ||
      !Array.isArray(value.items) ||
      value.items.length > params.limit ||
      (value.total as number) < value.items.length) {
    clientReadError("CLIENT_DIRECTORY_RESULT_INVALID");
  }

  const items = value.items.map(parseItem);
  if (new Set(items.map(item => item.clientId)).size !== items.length) {
    clientReadError("CLIENT_DIRECTORY_DUPLICATE_ID");
  }
  if (params.offset < value.total && items.length === 0) {
    clientReadError("CLIENT_DIRECTORY_PAGE_MISSING");
  }

  return {
    version: CLIENT_DIRECTORY_CONTRACT_VERSION,
    sourceSheet: "Клієнтська база",
    locationId: params.context.locationId,
    checkedAt: value.checkedAt,
    query: params.query.trim(),
    offset: params.offset,
    limit: params.limit,
    total: value.total as number,
    items
  };
}
