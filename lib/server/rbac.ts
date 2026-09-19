import "server-only";

import {
  AppError
} from "@/lib/server/errors";
import type {
  SessionContext,
  UserRole
} from "@/lib/server/session";

export type Permission =
  | "operation:create"
  | "journal:read"
  | "inventory:read"
  | "correction:request"
  | "cancellation:request"
  | "transfer:create"
  | "transfer:accept"
  | "shift:close"
  | "project:manage"
  | "year:manage"
  | "users:manage";

const ROLE_PERMISSIONS:
Record<
  UserRole,
  ReadonlySet<Permission>
> = {
  CASHIER: new Set([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request",
    "transfer:create",
    "transfer:accept",
    "shift:close"
  ]),

  SENIOR_ADMIN: new Set([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request",
    "transfer:create",
    "transfer:accept",
    "shift:close"
  ]),

  OWNER: new Set([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request",
    "transfer:create",
    "transfer:accept",
    "shift:close",
    "project:manage",
    "year:manage",
    "users:manage"
  ]),

  SYSTEM: new Set([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request",
    "transfer:create",
    "transfer:accept",
    "shift:close",
    "project:manage",
    "year:manage",
    "users:manage"
  ])
};

export function hasPermission(
  context: SessionContext,
  permission: Permission
): boolean {
  return ROLE_PERMISSIONS[
    context.role
  ].has(
    permission
  );
}

export function assertPermission(
  context: SessionContext,
  permission: Permission
): void {
  const allowed =
    hasPermission(
      context,
      permission
    );

  if (!allowed) {
    throw new AppError({
      status: 403,
      code:
        "FORBIDDEN",
      userMessage:
        "Недостатньо прав для цієї дії."
    });
  }
}