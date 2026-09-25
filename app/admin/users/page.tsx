import {
  redirect
} from "next/navigation";

import UsersManagement from "@/components/admin/users-management";

import {
  assertPermission
} from "@/lib/server/rbac";

import {
  requireSessionContext
} from "@/lib/server/session";


export const dynamic =
  "force-dynamic";


export default async function AdminUsersPage() {
  /*
   * 1. Перевіряємо,
   *    чи користувач взагалі
   *    авторизований.
   */
  let context;

  try {
    context =
      await requireSessionContext();
  } catch {
    /*
     * Сесії немає /
     * вона завершилась.
     */
    redirect(
      "/login"
    );
  }


  /*
   * 2. Перевіряємо право
   *    users:manage.
   *
   * У поточному RBAC
   * воно доступне OWNER / SYSTEM.
   */
  try {
    assertPermission(
      context,
      "users:manage"
    );
  } catch {
    /*
     * Користувач авторизований,
     * але не має права
     * керувати доступом.
     *
     * Наприклад CASHIER.
     */
    redirect(
      "/"
    );
  }


  /*
   * 3. Лише після успішної
   *    серверної перевірки
   *    показуємо OWNER-панель.
   */
  return (
    <UsersManagement />
  );
}