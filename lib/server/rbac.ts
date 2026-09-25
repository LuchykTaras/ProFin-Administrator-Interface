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


const CASHIER_PERMISSIONS =
  new Set<Permission>([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request",
    "transfer:create",
    "transfer:accept",
    "shift:close"
  ]);


const SENIOR_ADMIN_PERMISSIONS =
  new Set<Permission>([
    "operation:create",
    "journal:read",
    "inventory:read",
    "correction:request",
    "cancellation:request",
    "transfer:create",
    "transfer:accept",
    "shift:close"
  ]);


const OWNER_PERMISSIONS =
  new Set<Permission>([
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
  ]);


const SYSTEM_PERMISSIONS =
  new Set<Permission>([
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
  ]);


const ROLE_PERMISSIONS:
Record<
  UserRole,
  ReadonlySet<Permission>
> = {
  CASHIER:
    CASHIER_PERMISSIONS,

  SENIOR_ADMIN:
    SENIOR_ADMIN_PERMISSIONS,

  OWNER:
    OWNER_PERMISSIONS,

  SYSTEM:
    SYSTEM_PERMISSIONS
};


/*
 * ============================================================
 * hasPermission
 *
 * Безпечна перевірка конкретного permission.
 * ============================================================
 */
export function hasPermission(
  context: SessionContext,
  permission: Permission
): boolean {
  const permissions =
    ROLE_PERMISSIONS[
      context.role
    ];


  if (!permissions) {
    return false;
  }


  return permissions.has(
    permission
  );
}


/*
 * ============================================================
 * assertPermission
 *
 * Використовується серверними page/API routes.
 *
 * Якщо права немає —
 * повертаємо 403 через AppError.
 * ============================================================
 */
export function assertPermission(
  context: SessionContext,
  permission: Permission
): void {
  if (
    hasPermission(
      context,
      permission
    )
  ) {
    return;
  }


  throw new AppError({
    status:
      403,

    code:
      "FORBIDDEN",

    userMessage:
      "Недостатньо прав для цієї дії."
  });
}


/*
 * ============================================================
 * canManageUsers
 *
 * Допоміжна функція для серверного коду.
 *
 * OWNER / SYSTEM -> true
 * SENIOR_ADMIN   -> false
 * CASHIER        -> false
 * ============================================================
 */
export function canManageUsers(
  context: SessionContext
): boolean {
  return hasPermission(
    context,
    "users:manage"
  );
}