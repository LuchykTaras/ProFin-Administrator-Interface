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
  | "project:manage"
  | "year:manage"
  | "users:manage";


const ROLE_PERMISSIONS:
Record<UserRole, ReadonlySet<Permission>> = {
  CASHIER: new Set([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request"
  ]),

  SENIOR_ADMIN: new Set([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request"
  ]),

  OWNER: new Set([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request",
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
    "project:manage",
    "year:manage",
    "users:manage"
  ])
};


export function assertPermission(
  context: SessionContext,
  permission: Permission
): void {
  const allowed =
    ROLE_PERMISSIONS[
      context.role
    ].has(permission);

  if (!allowed) {
    throw new AppError({
      status: 403,
      code: "FORBIDDEN",
      userMessage:
        "Недостатньо прав для цієї дії."
    });
  }
}