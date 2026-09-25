"use client";


import {
  useCallback,
  useEffect,
  useState,
  type FormEvent
} from "react";

import {
  Ban,
  CheckCircle2,
  Copy,
  KeyRound,
  Link2,
  LoaderCircle,
  LogOut,
  MapPin,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  UserPlus,
  UserRoundCheck,
  X
} from "lucide-react";


type UserLocation = {
  locationId: string;
  locationName: string;
};


type AvailableLocation = {
  locationId: string;
  locationName: string;
};


type UserItem = {
  userId: string;
  displayName: string;
  email: string;

  role:
    | "CASHIER"
    | "SENIOR_ADMIN"
    | "OWNER"
    | "SYSTEM"
    | string;

  status: string;

  passwordSet: boolean;
  passwordResetRequired: boolean;

  tokenVersion: number;

  revokedAt: string | null;

  activeSessionCount: number;

  locations: UserLocation[];

  isCurrentUser: boolean;
};


type UsersData = {
  users: UserItem[];

  total: number;

  projectId: string;

  currentUserId: string;

  availableLocations:
    AvailableLocation[];
};


type InvitationData = {
  invitationUrl: string;
};


type ApiResponse<T> = {
  requestId?: string;

  ok: boolean;

  code?: string;

  userMessage?: string;

  technicalMessage?: string;

  data?: T | null;
};


type CreateForm = {
  displayName: string;
  email: string;
  role: string;
  locationIds: string[];
};


type EditForm = {
  userId: string;
  displayName: string;
  role: string;
  locationIds: string[];
};


const roleLabels: Record<
  string,
  string
> = {
  CASHIER:
    "Касир",

  SENIOR_ADMIN:
    "Старший адміністратор",

  OWNER:
    "Власник",

  SYSTEM:
    "Системний сервіс"
};


const EMPTY_CREATE_FORM:
  CreateForm = {
    displayName:
      "",

    email:
      "",

    role:
      "CASHIER",

    locationIds:
      []
  };


async function apiRequest<T>(
  url: string,
  init?: RequestInit
) {
  const response =
    await fetch(
      url,
      {
        ...init,

        headers: {
          "content-type":
            "application/json",

          ...init?.headers
        },

        cache:
          "no-store"
      }
    );


  const body =
    await response
      .json()
      .catch(
        () => null
      ) as
        | ApiResponse<T>
        | null;


  if (
    !response.ok ||
    !body?.ok
  ) {
    throw new Error(
      body?.userMessage ||
      "Сталася внутрішня помилка. Спробуйте ще раз."
    );
  }


  return body;
}


export default function UsersManagement() {
  const [
    users,
    setUsers
  ] =
    useState<UserItem[]>(
      []
    );


  const [
    availableLocations,
    setAvailableLocations
  ] =
    useState<
      AvailableLocation[]
    >(
      []
    );


  const [
    total,
    setTotal
  ] =
    useState(
      0
    );


  const [
    loading,
    setLoading
  ] =
    useState(
      true
    );


  const [
    busyUserId,
    setBusyUserId
  ] =
    useState<
      string | null
    >(
      null
    );


  const [
    creating,
    setCreating
  ] =
    useState(
      false
    );


  const [
    savingEdit,
    setSavingEdit
  ] =
    useState(
      false
    );


  const [
    createOpen,
    setCreateOpen
  ] =
    useState(
      false
    );


  const [
    createForm,
    setCreateForm
  ] =
    useState<CreateForm>(
      EMPTY_CREATE_FORM
    );


  const [
    editForm,
    setEditForm
  ] =
    useState<
      EditForm | null
    >(
      null
    );


  const [
    message,
    setMessage
  ] =
    useState(
      ""
    );


  const [
    error,
    setError
  ] =
    useState(
      ""
    );


  const [
    invitationUrl,
    setInvitationUrl
  ] =
    useState(
      ""
    );


  const loadUsers =
    useCallback(
      async () => {
        setLoading(
          true
        );

        try {
          const response =
            await apiRequest<
              UsersData
            >(
              "/api/admin/users"
            );


          const data =
            response.data;


          setUsers(
            data?.users ||
              []
          );


          setTotal(
            data?.total ||
              0
          );


          setAvailableLocations(
            data
              ?.availableLocations ||
              []
          );

        } catch (loadError) {
          setError(
            loadError instanceof
              Error
              ? loadError.message
              : "Не вдалося отримати список користувачів."
          );

        } finally {
          setLoading(
            false
          );
        }
      },
      []
    );


  useEffect(
    () => {
      void loadUsers();
    },
    [
      loadUsers
    ]
  );


  function clearNotifications() {
    setMessage(
      ""
    );

    setError(
      ""
    );
  }


  function toggleCreateLocation(
    locationId: string
  ) {
    setCreateForm(
      current => {
        const exists =
          current.locationIds.includes(
            locationId
          );


        return {
          ...current,

          locationIds:
            exists
              ? current.locationIds.filter(
                  id =>
                    id !==
                    locationId
                )

              : [
                  ...current.locationIds,
                  locationId
                ]
        };
      }
    );
  }


  function toggleEditLocation(
    locationId: string
  ) {
    setEditForm(
      current => {
        if (!current) {
          return current;
        }


        const exists =
          current.locationIds.includes(
            locationId
          );


        return {
          ...current,

          locationIds:
            exists
              ? current.locationIds.filter(
                  id =>
                    id !==
                    locationId
                )

              : [
                  ...current.locationIds,
                  locationId
                ]
        };
      }
    );
  }


  async function createUser(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    clearNotifications();

    setCreating(
      true
    );


    try {
      const response =
        await apiRequest<
          InvitationData
        >(
          "/api/admin/users",

          {
            method:
              "POST",

            body:
              JSON.stringify(
                createForm
              )
          }
        );


      setMessage(
        response.userMessage ||
        "Користувача створено."
      );


      setInvitationUrl(
        response.data
          ?.invitationUrl ||
          ""
      );


      setCreateForm(
        EMPTY_CREATE_FORM
      );


      setCreateOpen(
        false
      );


      await loadUsers();

    } catch (createError) {
      setError(
        createError instanceof
          Error
          ? createError.message
          : "Не вдалося створити користувача."
      );

    } finally {
      setCreating(
        false
      );
    }
  }


  function startEdit(
    user: UserItem
  ) {
    clearNotifications();

    setEditForm({
      userId:
        user.userId,

      displayName:
        user.displayName,

      role:
        user.role,

      locationIds:
        user.locations.map(
          location =>
            location.locationId
        )
    });
  }


  async function saveEdit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!editForm) {
      return;
    }

    clearNotifications();

    setSavingEdit(
      true
    );


    try {
      const response =
        await apiRequest(
          "/api/admin/users",

          {
            method:
              "PATCH",

            body:
              JSON.stringify(
                editForm
              )
          }
        );


      setMessage(
        response.userMessage ||
        "Дані користувача оновлено."
      );


      setEditForm(
        null
      );


      await loadUsers();

    } catch (editError) {
      setError(
        editError instanceof
          Error
          ? editError.message
          : "Не вдалося оновити користувача."
      );

    } finally {
      setSavingEdit(
        false
      );
    }
  }


  async function resetPassword(
    user: UserItem
  ) {
    if (
      !window.confirm(
        `Встановити обов’язкову зміну пароля для користувача «${user.displayName}»?`
      )
    ) {
      return;
    }


    clearNotifications();

    setBusyUserId(
      user.userId
    );


    try {
      const response =
        await apiRequest(
          "/api/auth/password/reset",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                userId:
                  user.userId
              })
          }
        );


      setMessage(
        response.userMessage ||
        "Для користувача встановлено обов’язкову зміну пароля."
      );


      await loadUsers();

    } catch (actionError) {
      setError(
        actionError instanceof
          Error
          ? actionError.message
          : "Не вдалося скинути пароль."
      );

    } finally {
      setBusyUserId(
        null
      );
    }
  }


  async function revokeSessions(
    user: UserItem
  ) {
    if (
      !window.confirm(
        `Завершити всі активні сесії користувача «${user.displayName}»?`
      )
    ) {
      return;
    }


    clearNotifications();

    setBusyUserId(
      user.userId
    );


    try {
      const response =
        await apiRequest(
          "/api/auth/sessions/revoke-all",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                userId:
                  user.userId
              })
          }
        );


      setMessage(
        response.userMessage ||
        "Сесії користувача завершено."
      );


      await loadUsers();

    } catch (actionError) {
      setError(
        actionError instanceof
          Error
          ? actionError.message
          : "Не вдалося завершити сесії."
      );

    } finally {
      setBusyUserId(
        null
      );
    }
  }


  async function reissueInvitation(
    user: UserItem
  ) {
    clearNotifications();

    setBusyUserId(
      user.userId
    );


    try {
      const response =
        await apiRequest<
          InvitationData
        >(
          "/api/auth/invitations/reissue",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                userId:
                  user.userId
              })
          }
        );


      setMessage(
        response.userMessage ||
        "Нове invitation-посилання створено."
      );


      setInvitationUrl(
        response.data
          ?.invitationUrl ||
          ""
      );


      await loadUsers();

    } catch (actionError) {
      setError(
        actionError instanceof
          Error
          ? actionError.message
          : "Не вдалося перевидати доступ."
      );

    } finally {
      setBusyUserId(
        null
      );
    }
  }


  async function changeStatus(
    user: UserItem
  ) {
    const shouldBlock =
      user.status ===
      "ACTIVE";


    const question =
      shouldBlock
        ? `Заблокувати користувача «${user.displayName}»?\n\nУсі його активні сесії будуть завершені, а невикористані invitation-посилання анульовані.`

        : `Розблокувати користувача «${user.displayName}»?`;


    if (
      !window.confirm(
        question
      )
    ) {
      return;
    }


    clearNotifications();

    setBusyUserId(
      user.userId
    );


    try {
      const response =
        await apiRequest(
          "/api/admin/users/status",

          {
            method:
              "POST",

            body:
              JSON.stringify({
                userId:
                  user.userId,

                blocked:
                  shouldBlock
              })
          }
        );


      setMessage(
        response.userMessage ||
        (
          shouldBlock
            ? "Користувача заблоковано."
            : "Користувача розблоковано."
        )
      );


      await loadUsers();

    } catch (actionError) {
      setError(
        actionError instanceof
          Error
          ? actionError.message
          : "Не вдалося змінити статус користувача."
      );

    } finally {
      setBusyUserId(
        null
      );
    }
  }


  async function copyInvitation() {
    if (!invitationUrl) {
      return;
    }


    try {
      await navigator
        .clipboard
        .writeText(
          invitationUrl
        );


      setMessage(
        "Invitation-посилання скопійовано."
      );

    } catch {
      setError(
        "Не вдалося автоматично скопіювати посилання."
      );
    }
  }


  return (
    <main className="users-page">
      <section className="users-shell">

        <header className="page-header">
          <div>
            <div className="brand-line">
              <ShieldCheck
                size={18}
              />

              <span>
                PROFIN OS
              </span>
            </div>

            <h1>
              Керування доступом
            </h1>

            <p>
              Користувачів у проекті:{" "}
              <strong>
                {total}
              </strong>
            </p>
          </div>


          <div className="header-actions">
            <button
              type="button"

              className="primary-button"

              onClick={() => {
                clearNotifications();

                setCreateOpen(
                  current =>
                    !current
                );
              }}
            >
              <UserPlus
                size={18}
              />

              Додати користувача
            </button>


            <button
              type="button"

              className="secondary-button"

              disabled={
                loading
              }

              onClick={() => {
                clearNotifications();

                void loadUsers();
              }}
            >
              <RefreshCw
                size={18}

                className={
                  loading
                    ? "spin"
                    : ""
                }
              />

              Оновити
            </button>
          </div>
        </header>


        {message ? (
          <div className="notice success">
            <CheckCircle2
              size={19}
            />

            {message}
          </div>
        ) : null}


        {error ? (
          <div className="notice error">
            {error}
          </div>
        ) : null}


        {createOpen ? (
          <section className="editor-card">
            <div className="editor-heading">
              <div>
                <h2>
                  Додати користувача
                </h2>

                <p>
                  Після створення одразу буде сформовано первинне invitation-посилання.
                </p>
              </div>

              <button
                type="button"

                className="icon-button"

                onClick={() =>
                  setCreateOpen(
                    false
                  )
                }
              >
                <X
                  size={20}
                />
              </button>
            </div>


            <form
              onSubmit={
                createUser
              }
            >
              <div className="form-grid">

                <label>
                  <span>
                    Ім’я
                  </span>

                  <input
                    value={
                      createForm
                        .displayName
                    }

                    onChange={
                      event =>
                        setCreateForm(
                          current => ({
                            ...current,

                            displayName:
                              event
                                .target
                                .value
                          })
                        )
                    }

                    placeholder="Наприклад: Юлія Орлова"

                    required
                  />
                </label>


                <label>
                  <span>
                    Електронна пошта
                  </span>

                  <input
                    type="email"

                    value={
                      createForm
                        .email
                    }

                    onChange={
                      event =>
                        setCreateForm(
                          current => ({
                            ...current,

                            email:
                              event
                                .target
                                .value
                          })
                        )
                    }

                    placeholder="user@example.com"

                    required
                  />
                </label>


                <label>
                  <span>
                    Роль
                  </span>

                  <select
                    value={
                      createForm
                        .role
                    }

                    onChange={
                      event =>
                        setCreateForm(
                          current => ({
                            ...current,

                            role:
                              event
                                .target
                                .value
                          })
                        )
                    }
                  >
                    <option value="CASHIER">
                      Касир
                    </option>

                    <option value="SENIOR_ADMIN">
                      Старший адміністратор
                    </option>

                    <option value="OWNER">
                      Власник
                    </option>
                  </select>
                </label>

              </div>


              <LocationPicker
                locations={
                  availableLocations
                }

                selected={
                  createForm
                    .locationIds
                }

                onToggle={
                  toggleCreateLocation
                }
              />


              <div className="editor-actions">
                <button
                  className="primary-button"

                  type="submit"

                  disabled={
                    creating
                  }
                >
                  {creating ? (
                    <LoaderCircle
                      size={18}

                      className="spin"
                    />
                  ) : (
                    <UserPlus
                      size={18}
                    />
                  )}

                  Створити користувача
                </button>


                <button
                  className="secondary-button"

                  type="button"

                  onClick={() =>
                    setCreateOpen(
                      false
                    )
                  }
                >
                  Скасувати
                </button>
              </div>
            </form>
          </section>
        ) : null}


        {invitationUrl ? (
          <section className="invitation-card">
            <div className="invitation-title">
              <Link2
                size={20}
              />

              Нове invitation-посилання
            </div>

            <div className="invitation-row">
              <input
                readOnly

                value={
                  invitationUrl
                }
              />

              <button
                type="button"

                className="primary-button"

                onClick={() =>
                  void copyInvitation()
                }
              >
                <Copy
                  size={18}
                />

                Копіювати
              </button>
            </div>

            <p>
              Передайте це посилання потрібному користувачу. Raw token у базі даних не зберігається.
            </p>
          </section>
        ) : null}


        {editForm ? (
          <section className="editor-card">
            <div className="editor-heading">
              <div>
                <h2>
                  Редагування користувача
                </h2>

                <p>
                  Після зміни ролі або філій старі сесії користувача будуть завершені.
                </p>
              </div>

              <button
                type="button"

                className="icon-button"

                onClick={() =>
                  setEditForm(
                    null
                  )
                }
              >
                <X
                  size={20}
                />
              </button>
            </div>


            <form
              onSubmit={
                saveEdit
              }
            >
              <div className="form-grid">

                <label>
                  <span>
                    Ім’я
                  </span>

                  <input
                    value={
                      editForm
                        .displayName
                    }

                    onChange={
                      event =>
                        setEditForm(
                          current =>
                            current
                              ? {
                                  ...current,

                                  displayName:
                                    event
                                      .target
                                      .value
                                }
                              : current
                        )
                    }
                  />
                </label>


                <label>
                  <span>
                    Роль
                  </span>

                  <select
                    value={
                      editForm.role
                    }

                    onChange={
                      event =>
                        setEditForm(
                          current =>
                            current
                              ? {
                                  ...current,

                                  role:
                                    event
                                      .target
                                      .value
                                }
                              : current
                        )
                    }
                  >
                    <option value="CASHIER">
                      Касир
                    </option>

                    <option value="SENIOR_ADMIN">
                      Старший адміністратор
                    </option>

                    <option value="OWNER">
                      Власник
                    </option>
                  </select>
                </label>

              </div>


              <LocationPicker
                locations={
                  availableLocations
                }

                selected={
                  editForm
                    .locationIds
                }

                onToggle={
                  toggleEditLocation
                }
              />


              <div className="editor-actions">
                <button
                  className="primary-button"

                  type="submit"

                  disabled={
                    savingEdit
                  }
                >
                  {savingEdit ? (
                    <LoaderCircle
                      size={18}

                      className="spin"
                    />
                  ) : (
                    <Save
                      size={18}
                    />
                  )}

                  Зберегти зміни
                </button>


                <button
                  className="secondary-button"

                  type="button"

                  onClick={() =>
                    setEditForm(
                      null
                    )
                  }
                >
                  Скасувати
                </button>
              </div>
            </form>
          </section>
        ) : null}


        {loading &&
        users.length === 0 ? (
          <div className="loading-box">
            <LoaderCircle
              size={26}

              className="spin"
            />

            Завантажуємо користувачів...
          </div>
        ) : null}


        <div className="users-list">
          {users.map(
            user => {
              const isBusy =
                busyUserId ===
                user.userId;


              const active =
                user.status ===
                "ACTIVE";


              const adminActionsDisabled =
                user.isCurrentUser ||
                user.role ===
                  "SYSTEM" ||
                isBusy;


              return (
                <article
                  className={
                    `user-card ${
                      user.isCurrentUser
                        ? "current-user"
                        : ""
                    }`
                  }

                  key={
                    user.userId
                  }
                >
                  <div className="user-top">

                    <div className="identity">
                      <div className="avatar">
                        {getInitials(
                          user.displayName
                        )}
                      </div>

                      <div>
                        <div className="user-name-row">
                          <h2>
                            {user.displayName}
                          </h2>

                          {user.isCurrentUser ? (
                            <span className="current-badge">
                              Поточний користувач
                            </span>
                          ) : null}
                        </div>

                        <div className="email">
                          {user.email}
                        </div>

                        <div className="badges">
                          <span className="role-badge">
                            {roleLabels[
                              user.role
                            ] ||
                              user.role}
                          </span>

                          <span
                            className={
                              active
                                ? "status-badge active"
                                : "status-badge inactive"
                            }
                          >
                            {active
                              ? "Активний"
                              : "Неактивний"}
                          </span>

                          {user
                            .passwordResetRequired ? (
                            <span className="reset-badge">
                              Потрібна зміна пароля
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>


                    <div className="stats">
                      <div className="stat">
                        <span>
                          Активні сесії
                        </span>

                        <strong>
                          {
                            user
                              .activeSessionCount
                          }
                        </strong>
                      </div>

                      <div className="stat">
                        <span>
                          Token version
                        </span>

                        <strong>
                          {
                            user
                              .tokenVersion
                          }
                        </strong>
                      </div>
                    </div>
                  </div>


                  <div className="locations-line">
                    <MapPin
                      size={17}
                    />

                    {user.locations.length >
                    0
                      ? user.locations
                          .map(
                            location =>
                              location.locationName
                          )
                          .join(
                            ", "
                          )

                      : "Філії не призначені"}
                  </div>


                  <div className="action-row">

                    <button
                      type="button"

                      className="action-button reset"

                      disabled={
                        adminActionsDisabled ||
                        !active
                      }

                      onClick={() =>
                        void resetPassword(
                          user
                        )
                      }
                    >
                      <KeyRound
                        size={17}
                      />

                      Скинути пароль
                    </button>


                    <button
                      type="button"

                      className="action-button sessions"

                      disabled={
                        adminActionsDisabled ||
                        user
                          .activeSessionCount ===
                          0
                      }

                      onClick={() =>
                        void revokeSessions(
                          user
                        )
                      }
                    >
                      <LogOut
                        size={17}
                      />

                      Завершити сесії
                    </button>


                    <button
                      type="button"

                      className="action-button invitation"

                      disabled={
                        adminActionsDisabled ||
                        !active
                      }

                      onClick={() =>
                        void reissueInvitation(
                          user
                        )
                      }
                    >
                      <Link2
                        size={17}
                      />

                      Перевидати доступ
                    </button>


                    {!user.isCurrentUser &&
                    user.role !==
                      "SYSTEM" ? (
                      <button
                        type="button"

                        className="action-button edit"

                        disabled={
                          isBusy
                        }

                        onClick={() =>
                          startEdit(
                            user
                          )
                        }
                      >
                        <Pencil
                          size={17}
                        />

                        Редагувати
                      </button>
                    ) : null}


                    <button
                      type="button"

                      className={
                        active
                          ? "action-button block"
                          : "action-button unblock"
                      }

                      disabled={
                        adminActionsDisabled
                      }

                      onClick={() =>
                        void changeStatus(
                          user
                        )
                      }
                    >
                      {active ? (
                        <Ban
                          size={17}
                        />
                      ) : (
                        <UserRoundCheck
                          size={17}
                        />
                      )}

                      {active
                        ? "Заблокувати"
                        : "Розблокувати"}
                    </button>


                    {isBusy ? (
                      <LoaderCircle
                        size={20}

                        className="spin"
                      />
                    ) : null}
                  </div>


                  {user.isCurrentUser ? (
                    <div className="self-note">
                      Адмін-дії для власного профілю вимкнені
                    </div>
                  ) : null}
                </article>
              );
            }
          )}
        </div>
      </section>


      <style jsx>{`
        .users-page {
          min-height: 100vh;
          background: #f5f8f6;
          padding: 28px;
          color: #0c1916;
        }

        .users-shell {
          width: min(1240px, 100%);
          margin: 0 auto;
        }

        .page-header {
          display: flex;
          justify-content: space-between;
          gap: 24px;
          align-items: flex-start;
          margin-bottom: 24px;
        }

        .brand-line {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #009872;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.08em;
          margin-bottom: 8px;
        }

        h1 {
          margin: 0;
          font-size: 30px;
          line-height: 1.15;
        }

        .page-header p {
          margin: 8px 0 0;
          color: #65736f;
        }

        .header-actions,
        .editor-actions,
        .action-row {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
        }

        button {
          font: inherit;
        }

        .primary-button,
        .secondary-button,
        .action-button,
        .icon-button {
          border: 0;
          cursor: pointer;
          border-radius: 11px;
          font-weight: 700;
          transition:
            opacity 0.15s ease,
            transform 0.15s ease;
        }

        .primary-button,
        .secondary-button {
          min-height: 42px;
          padding: 0 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }

        .primary-button {
          background: #079875;
          color: white;
        }

        .secondary-button {
          background: white;
          color: #13201d;
          border: 1px solid #d8e0dd;
        }

        button:not(:disabled):hover {
          transform: translateY(-1px);
        }

        button:disabled {
          opacity: 0.38;
          cursor: not-allowed;
        }

        .notice {
          min-height: 48px;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 0 15px;
          border-radius: 12px;
          margin-bottom: 18px;
          font-weight: 600;
        }

        .notice.success {
          color: #007a5c;
          background: #ecfaf6;
          border: 1px solid #bfe7da;
        }

        .notice.error {
          color: #c52f26;
          background: #fff0ee;
          border: 1px solid #ffc6c1;
        }

        .editor-card,
        .invitation-card,
        .user-card {
          background: white;
          border: 1px solid #dde5e2;
          border-radius: 18px;
          box-shadow:
            0 12px 30px rgba(22, 51, 43, 0.05);
        }

        .editor-card,
        .invitation-card {
          padding: 20px;
          margin-bottom: 18px;
        }

        .editor-heading {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 18px;
        }

        .editor-heading h2 {
          margin: 0 0 5px;
          font-size: 19px;
        }

        .editor-heading p,
        .invitation-card p {
          margin: 0;
          color: #697873;
          font-size: 13px;
        }

        .icon-button {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          background: #f2f5f4;
        }

        .form-grid {
          display: grid;
          grid-template-columns:
            repeat(
              3,
              minmax(0, 1fr)
            );
          gap: 14px;
          margin-bottom: 18px;
        }

        label > span {
          display: block;
          margin-bottom: 7px;
          font-size: 13px;
          font-weight: 700;
        }

        input,
        select {
          width: 100%;
          min-height: 44px;
          box-sizing: border-box;
          border-radius: 10px;
          border: 1px solid #d5dfdc;
          background: white;
          padding: 0 12px;
          font: inherit;
          outline: none;
        }

        input:focus,
        select:focus {
          border-color: #079875;
          box-shadow:
            0 0 0 3px
            rgba(7, 152, 117, 0.1);
        }

        .invitation-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 800;
          margin-bottom: 12px;
        }

        .invitation-row {
          display: grid;
          grid-template-columns:
            minmax(0, 1fr)
            auto;
          gap: 10px;
        }

        .invitation-card p {
          margin-top: 9px;
        }

        .users-list {
          display: grid;
          gap: 16px;
        }

        .user-card {
          padding: 20px;
        }

        .user-card.current-user {
          border-color: #6fd2b6;
        }

        .user-top {
          display: flex;
          justify-content: space-between;
          gap: 24px;
        }

        .identity {
          display: flex;
          gap: 14px;
          min-width: 0;
        }

        .avatar {
          width: 46px;
          height: 46px;
          flex: 0 0 46px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          font-weight: 800;
          background: #daf5e5;
          color: #087e62;
        }

        .user-name-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
        }

        .user-name-row h2 {
          margin: 0;
          font-size: 18px;
        }

        .email {
          margin-top: 4px;
          color: #697873;
          font-size: 14px;
        }

        .badges {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 10px;
        }

        .role-badge,
        .status-badge,
        .reset-badge,
        .current-badge {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          padding: 0 9px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 800;
        }

        .role-badge {
          background: #eef2f0;
        }

        .status-badge.active,
        .current-badge {
          background: #e3f7ef;
          color: #007b5e;
        }

        .status-badge.inactive {
          background: #ffebe8;
          color: #cc3026;
        }

        .reset-badge {
          background: #fff0ce;
          color: #9a6500;
        }

        .stats {
          display: flex;
          gap: 10px;
        }

        .stat {
          min-width: 112px;
          border: 1px solid #dce4e1;
          border-radius: 12px;
          padding: 10px 12px;
        }

        .stat span {
          display: block;
          font-size: 11px;
          color: #697873;
          margin-bottom: 5px;
        }

        .stat strong {
          font-size: 18px;
        }

        .locations-line {
          margin: 18px 0;
          border-top: 1px solid #e5ebe9;
          padding-top: 16px;
          color: #65736f;
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .action-button {
          min-height: 39px;
          padding: 0 13px;
          display: inline-flex;
          gap: 7px;
          align-items: center;
        }

        .action-button.reset {
          color: #956100;
          background: #fff6e5;
        }

        .action-button.sessions {
          color: #245d9b;
          background: #eef5ff;
        }

        .action-button.invitation {
          color: #007c60;
          background: #eaf8f3;
        }

        .action-button.edit {
          color: #555d59;
          background: #f1f4f3;
        }

        .action-button.block {
          color: #c83229;
          background: #fff0ee;
        }

        .action-button.unblock {
          color: #00795d;
          background: #e8f8f2;
        }

        .self-note {
          color: #65736f;
          font-size: 13px;
          margin-top: 12px;
        }

        .loading-box {
          min-height: 160px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .spin {
          animation:
            spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform:
              rotate(360deg);
          }
        }

        @media (
          max-width: 900px
        ) {
          .form-grid {
            grid-template-columns:
              1fr;
          }

          .page-header,
          .user-top {
            flex-direction: column;
          }

          .stats {
            width: 100%;
          }

          .stat {
            flex: 1;
          }
        }

        @media (
          max-width: 600px
        ) {
          .users-page {
            padding: 16px;
          }

          .header-actions {
            width: 100%;
          }

          .header-actions button {
            flex: 1;
          }

          .invitation-row {
            grid-template-columns:
              1fr;
          }
        }
      `}</style>
    </main>
  );
}


function LocationPicker({
  locations,
  selected,
  onToggle
}: {
  locations:
    AvailableLocation[];

  selected:
    string[];

  onToggle:
    (
      locationId:
        string
    ) => void;
}) {
  return (
    <div
      style={{
        marginBottom:
          18
      }}
    >
      <div
        style={{
          display:
            "flex",

          alignItems:
            "center",

          gap:
            7,

          marginBottom:
            9,

          fontSize:
            13,

          fontWeight:
            700
        }}
      >
        <MapPin
          size={16}
        />

        Доступні філії
      </div>


      <div
        style={{
          display:
            "flex",

          flexWrap:
            "wrap",

          gap:
            9
        }}
      >
        {locations.map(
          location => {
            const checked =
              selected.includes(
                location.locationId
              );


            return (
              <label
                key={
                  location.locationId
                }

                style={{
                  display:
                    "inline-flex",

                  alignItems:
                    "center",

                  gap:
                    7,

                  minHeight:
                    38,

                  padding:
                    "0 12px",

                  border:
                    checked
                      ? "1px solid #079875"
                      : "1px solid #d8e1de",

                  borderRadius:
                    10,

                  background:
                    checked
                      ? "#e9f8f3"
                      : "#ffffff",

                  cursor:
                    "pointer"
                }}
              >
                <input
                  type="checkbox"

                  checked={
                    checked
                  }

                  onChange={() =>
                    onToggle(
                      location
                        .locationId
                    )
                  }

                  style={{
                    width:
                      16,

                    minHeight:
                      16
                  }}
                />

                <span
                  style={{
                    margin:
                      0
                  }}
                >
                  {
                    location
                      .locationName
                  }
                </span>
              </label>
            );
          }
        )}
      </div>
    </div>
  );
}


function getInitials(
  displayName: string
) {
  const parts =
    displayName
      .trim()
      .split(
        /\s+/
      )
      .filter(
        Boolean
      );


  if (
    parts.length ===
      0
  ) {
    return "?";
  }


  if (
    parts.length ===
      1
  ) {
    return parts[0]
      .slice(
        0,
        2
      )
      .toUpperCase();
  }


  return (
    parts[0][0] +
    parts[1][0]
  ).toUpperCase();
}