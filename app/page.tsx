"use client";

import Image
  from "next/image";

import {
  Activity,
  AlertTriangle,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  Database,
  FileSpreadsheet,
  LogOut,
  Menu,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserRound,
  Users,
  WalletCards
} from "lucide-react";

import {
  useEffect,
  useState
} from "react";

import type {
  ComponentType,
  ReactNode
} from "react";

import {
  OperationFormModal
} from "@/components/operation-form-modal";

import {
  getApiErrorMessage
} from "@/lib/client/api-client";

import {
  logoutSession
} from "@/lib/client/auth-api";

import {
  getInterfaceBootstrap
} from "@/lib/client/interface-api";

import {
  getOperationFormSchema,
  prefetchOperationFormSchema,
  prefetchOperationFormSchemas
} from "@/lib/client/operations-api";

import type {
  InterfaceBootstrapData,
  InterfaceServiceStatus
} from "@/lib/contracts/interface";

import type {
  OperationTypeOption
} from "@/lib/contracts/operations";


type NavKey =
  | "cash"
  | "journal"
  | "inventory"
  | "shift-close"
  | "clients"
  | "account";


type StatusTone =
  | "ok"
  | "warning"
  | "error"
  | "neutral";


type IconComponent =
  ComponentType<{
    size?: number;
    strokeWidth?: number;
  }>;


const navItems: Array<{
  key: NavKey;
  label: string;
  icon: IconComponent;
}> = [
  {
    key:
      "cash",

    label:
      "Каса",

    icon:
      WalletCards
  },

  {
    key:
      "journal",

    label:
      "Журнал операцій",

    icon:
      ClipboardList
  },

  {
    key:
      "inventory",

    label:
      "Склад",

    icon:
      Boxes
  },

  {
    key:
      "shift-close",

    label:
      "Закриття зміни",

    icon:
      ClipboardCheck
  },

  {
    key:
      "clients",

    label:
      "База клієнтів",

    icon:
      Users
  },

  {
    key:
      "account",

    label:
      "Мій кабінет",

    icon:
      UserRound
  }
];


const roleLabels = {
  CASHIER:
    "Касир",

  SENIOR_ADMIN:
    "Старший адміністратор",

  OWNER:
    "Власник",

  SYSTEM:
    "Системний сервіс"
} as const;


function AppLogo() {
  return (
    <div
      className="brand"

      style={{
        display:
          "flex",

        flexDirection:
          "column",

        alignItems:
          "flex-start",

        justifyContent:
          "center",

        gap:
          4,

        minHeight:
          86
      }}
    >
      <Image
        src=
          "/profin-logo.png"

        alt=
          "ProFin"

        width={
          180
        }

        height={
          70
        }

        priority

        style={{
          width:
            "155px",

          height:
            "auto",

          objectFit:
            "contain",

          mixBlendMode:
            "screen"
        }}
      />

      <span
        style={{
          fontSize:
            10,

          opacity:
            0.62,

          letterSpacing:
            "0.08em"
        }}
      >
        PROFIN OS
      </span>
    </div>
  );
}


function StatusPill({
  children,
  tone = "ok"
}: {
  children:
    ReactNode;

  tone?:
    StatusTone;
}) {
  return (
    <span
      className={
        `status-pill status-${tone}`
      }
    >
      <span
        className=
          "status-dot"
      />

      {
        children
      }
    </span>
  );
}


function MetricCard({
  icon: Icon,
  label,
  value,
  helper,
  accent = "green"
}: {
  icon:
    IconComponent;

  label:
    string;

  value:
    string;

  helper:
    string;

  accent?:
    "green" |
    "orange" |
    "red" |
    "blue";
}) {
  return (
    <article
      className={
        `metric-card accent-${accent}`
      }
    >
      <div
        className=
          "metric-label"
      >
        <Icon
          size={19}
        />

        <span>
          {
            label
          }
        </span>
      </div>

      <strong>
        {
          value
        }
      </strong>

      <span
        className=
          "metric-helper"
      >
        {
          helper
        }
      </span>
    </article>
  );
}


function QuickAction({
  icon: Icon,
  title,
  subtitle,
  tone,
  disabled = false,
  onClick,
  onIntent
}: {
  icon:
    IconComponent;

  title:
    string;

  subtitle:
    string;

  tone:
    string;

  disabled?:
    boolean;

  onClick?:
    () => void;

  onIntent?:
    () => void;
}) {
  return (
    <button
      type="button"

      className=
        "quick-action"

      disabled={
        disabled
      }

      onClick={
        onClick
      }

      onPointerEnter={
        onIntent
      }

      onFocus={
        onIntent
      }
    >
      <span
        className={
          `quick-icon ${tone}`
        }
      >
        <Icon
          size={24}
        />
      </span>

      <strong>
        {
          title
        }
      </strong>

      <span>
        {
          subtitle
        }
      </span>
    </button>
  );
}


function formatDate(
  date: Date,
  timezone: string
) {
  return new Intl
    .DateTimeFormat(
      "uk-UA",
      {
        timeZone:
          timezone,

        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric"
      }
    )
    .format(
      date
    );
}


function formatDateTime(
  value: string,
  timezone: string
) {
  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "—";
  }


  return new Intl
    .DateTimeFormat(
      "uk-UA",
      {
        timeZone:
          timezone,

        day:
          "2-digit",

        month:
          "2-digit",

        year:
          "numeric",

        hour:
          "2-digit",

        minute:
          "2-digit"
      }
    )
    .format(
      date
    );
}


function serviceTone(
  status:
    InterfaceServiceStatus
): StatusTone {
  if (
    status ===
    "OK"
  ) {
    return "ok";
  }


  if (
    status ===
    "NOT_CONNECTED"
  ) {
    return "warning";
  }


  return "error";
}


export default function Home() {
  const [
    active,
    setActive
  ] =
    useState<NavKey>(
      "cash"
    );


  const [
    operationModalOpen,
    setOperationModalOpen
  ] =
    useState(
      false
    );


  const [
    selectedOperationType,
    setSelectedOperationType
  ] =
    useState<
      string |
      null
    >(
      null
    );


  const [
    operationTypes,
    setOperationTypes
  ] =
    useState<
      OperationTypeOption[]
    >(
      []
    );


  const [
    operationTypesLoading,
    setOperationTypesLoading
  ] =
    useState(
      true
    );


  const [
    operationTypesError,
    setOperationTypesError
  ] =
    useState(
      ""
    );


  const [
    domainAdapterStatus,
    setDomainAdapterStatus
  ] =
    useState<
      InterfaceServiceStatus
    >(
      "NOT_CONNECTED"
    );


  const [
    bootstrap,
    setBootstrap
  ] =
    useState<
      InterfaceBootstrapData |
      null
    >(
      null
    );


  const [
    loading,
    setLoading
  ] =
    useState(
      true
    );


  const [
    loggingOut,
    setLoggingOut
  ] =
    useState(
      false
    );


  const [
    error,
    setError
  ] =
    useState(
      ""
    );


  useEffect(
    () => {
      const controller =
        new AbortController();


      async function loadBootstrap() {
        try {
          const data =
            await getInterfaceBootstrap(
              controller.signal
            );


          if (
            controller
              .signal
              .aborted
          ) {
            return;
          }


          setBootstrap(
            data
          );
        } catch (
         loadError
        ) {
       if (
    controller
      .signal
      .aborted
     ) {
    return;
  }


      console.error(
      loadError
      );


  const message =
    getApiErrorMessage(
      loadError,

      "Не вдалося отримати контекст інтерфейсу."
    );


      if (
      message ===
    "Сесія відсутня або завершилася."
     ) {
    window.location.replace(
      "/login"
     );

     return;
  }


     setError(
      message
     );
    }
        
        finally {
          if (
            !controller
              .signal
              .aborted
          ) {
            setLoading(
              false
            );
          }
        }
      }


      void loadBootstrap();


      return () => {
        controller.abort();
      };
    },
    []
  );


  useEffect(
    () => {
      if (
        !bootstrap
      ) {
        return;
      }


      if (
        !bootstrap
          .permissions
          .operationCreate
      ) {
        setOperationTypes(
          []
        );

        setDomainAdapterStatus(
          "NOT_CONNECTED"
        );

        setOperationTypesLoading(
          false
        );

        return;
      }


      const controller =
        new AbortController();


      async function loadOperationTypes() {
        setOperationTypesLoading(
          true
        );

        setOperationTypesError(
          ""
        );

        setDomainAdapterStatus(
          "NOT_CONNECTED"
        );


        try {
          const schema =
            await getOperationFormSchema({
              signal:
                controller.signal
            });


          if (
            controller
              .signal
              .aborted
          ) {
            return;
          }


          const enabledTypes =
            schema.operationTypes.filter(
              item =>
                item.enabled
            );


          setOperationTypes(
            enabledTypes
          );


          setDomainAdapterStatus(
            "OK"
          );


          /*
           * PATCH 45 — READ-only warmup.
           *
           * Після отримання базової schema
           * прогріваємо перший рівень кожного
           * доступного типу максимум двома
           * паралельними запитами.
           *
           * Бізнес-логіка не дублюється:
           * кожна schema як і раніше приходить
           * з Apps Script domain core.
           */
          void prefetchOperationFormSchemas(
            enabledTypes.map(
              item => ({
                operationType:
                  item.value,

                category:
                  null,

                article:
                  null
              })
            ),
            2
          );
        } catch (
          loadError
        ) {
          if (
            controller
              .signal
              .aborted
          ) {
            return;
          }


          console.error(
            loadError
          );


          setOperationTypes(
            []
          );


          setDomainAdapterStatus(
            "ERROR"
          );


          setOperationTypesError(
            getApiErrorMessage(
              loadError,

              "Не вдалося отримати доступні типи операцій."
            )
          );
        } finally {
          if (
            !controller
              .signal
              .aborted
          ) {
            setOperationTypesLoading(
              false
            );
          }
        }
      }


      void loadOperationTypes();


      return () => {
        controller.abort();
      };
    },
    [
      bootstrap
    ]
  );


  async function logout() {
    if (
      loggingOut
    ) {
      return;
    }


    setLoggingOut(
      true
    );

    setError(
      ""
    );


    try {
      await logoutSession();


     window.location.href = "/login";
    } catch (
      logoutError
    ) {
      console.error(
        logoutError
      );


      setError(
        getApiErrorMessage(
          logoutError,

          "Не вдалося завершити сесію."
        )
      );
    } finally {
      setLoggingOut(
        false
      );
    }
  }


  if (
    loading
  ) {
    return (
      <main
        className=
          "bootstrap-state"
      >
        <div
          className=
            "bootstrap-card"
        >
          <Activity
            size={28}
          />

          <h1>
            ProFin OS
          </h1>

          <p>
            Завантажуємо
            дозволений контекст
            сесії…
          </p>
        </div>
      </main>
    );
  }


  if (
    error ||
    !bootstrap
  ) {
    return (
      <main
        className=
          "bootstrap-state"
      >
        <div
          className=
            "bootstrap-card error"
        >
          <AlertTriangle
            size={28}
          />

          <h1>
            Доступ недоступний
          </h1>

          <p>
            {
              error ||
              "Сесія відсутня або завершилася."
            }
          </p>

          <small>
          Для продовження роботи
          увійдіть у свій обліковий
          запис через сторінку входу.
          
          Якщо проблема повторюється,
          зверніться до адміністратора
          ProFin OS.
          </small>
        </div>
      </main>
    );
  }


  const context =
    bootstrap.context;


  const roleLabel =
    roleLabels[
      context.role
    ];


  const avatarLetter =
    context
      .displayName
      .trim()
      .charAt(0)
      .toUpperCase() ||
    "П";


  const currentDate =
    formatDate(
      new Date(),
      context.timezone
    );


  const domainReady =
    bootstrap
      .domainCommandsReady ||
    domainAdapterStatus ===
      "OK";


  const domainUnavailableText =
    "Очікує domain adapter";


  return (
    <div
      className=
        "app-shell"
    >
      <aside
        className=
          "sidebar"
      >
        <AppLogo />


        <nav
          className=
            "nav"
        >
          {
            navItems.map(
              ({
                key,
                label,
                icon: Icon
              }) => (
                <button
                  type="button"

                  key={
                    key
                  }

                  onClick={
                    () =>
                      setActive(
                        key
                      )
                  }

                  className={
                    active === key
                      ? "nav-item active"
                      : "nav-item"
                  }
                >
                  <Icon
                    size={20}
                    strokeWidth={2}
                  />

                  <span>
                    {
                      label
                    }
                  </span>
                </button>
              )
            )
          }
        </nav>


        <div
          className=
            "session-card"
        >
          <div
            className=
              "session-title"
          >
            <ShieldCheck
              size={18}
            />

            <strong>
              Сесія активна
            </strong>
          </div>

          <span>
            Діє до:
          </span>

          <span>
            {
              formatDateTime(
                context
                  .sessionExpiresAt,

                context
                  .timezone
              )
            }
          </span>
        </div>


        <div
          className=
            "sidebar-footer"
        >
          <span>
            ProFin OS 2026
          </span>

          <span>
            Administrator Interface
          </span>
        </div>
      </aside>


      <main
        className=
          "main"
      >
        <header
          className=
            "topbar"
        >
          <div
            className=
              "topbar-title"
          >
            <button
              type="button"

              className=
                "icon-button mobile-menu"

              aria-label=
                "Меню"
            >
              <Menu
                size={21}
              />
            </button>

            <h1>
              {
                navItems.find(
                  item =>
                    item.key ===
                    active
                )?.label ??
                "Каса"
              }
            </h1>
          </div>


          <div
            className=
              "topbar-controls"
          >
            <div
              className=
                "selector selector-locked"
            >
              <Building2
                size={17}
              />

              <span>
                Філія:{" "}
                {
                  context
                    .locationName
                }
              </span>
            </div>


            <div
              className=
                "selector selector-locked"
            >
              <CalendarDays
                size={17}
              />

              <span>
                {
                  currentDate
                }
              </span>
            </div>


            <button
              type="button"

              className=
                "bell"

              aria-label=
                "Повідомлення"
            >
              <Bell
                size={20}
              />
            </button>


            <button
              type="button"

              className=
                "profile"
            >
              <span
                className=
                  "avatar"
              >
                {
                  avatarLetter
                }
              </span>

              <span>
                <strong>
                  {
                    context
                      .displayName
                  }
                </strong>

                <small>
                  {
                    roleLabel
                  }
                </small>
              </span>
            </button>
          </div>
        </header>


        {
          active ===
            "cash" &&
          (
            <div
              className=
                "dashboard"
            >
              {
                !domainReady &&
                (
                  <section
                    className=
                      "integration-banner"
                  >
                    <AlertTriangle
                      size={18}
                    />

                    <div>
                      <strong>
                        Доменне ядро ще
                        не підключене
                        до вебінтерфейсу
                      </strong>

                      <span>
                        Контекст сесії
                        вже працює.
                        Реальні
                        операції не
                        підміняються
                        mock-даними.
                      </span>
                    </div>
                  </section>
                )
              }


              <section
                className=
                  "metric-grid"
              >
                <MetricCard
                  icon={
                    ClipboardList
                  }

                  label=
                    "Операцій сьогодні"

                  value="—"

                  helper={
                    domainUnavailableText
                  }
                />


                <MetricCard
                  icon={
                    ClipboardCheck
                  }

                  label=
                    "Очікують дії"

                  value="—"

                  helper={
                    domainUnavailableText
                  }

                  accent=
                    "orange"
                />


                <MetricCard
                  icon={
                    Boxes
                  }

                  label=
                    "Переміщення"

                  value="—"

                  helper={
                    domainUnavailableText
                  }

                  accent=
                    "blue"
                />


                <MetricCard
                  icon={
                    AlertTriangle
                  }

                  label=
                    "Низький залишок"

                  value="—"

                  helper={
                    domainUnavailableText
                  }

                  accent=
                    "red"
                />
              </section>


              <section
                className=
                  "quick-section card"
              >
                <div
                  className=
                    "section-heading"
                >
                  <h2>
                    Швидкі дії
                  </h2>
                </div>


                {
                  operationTypesLoading &&
                  (
                    <div
                      className=
                        "data-empty-state compact"
                    >
                      <Activity
                        size={24}
                      />

                      <strong>
                        Завантажуємо
                        типи операцій
                      </strong>
                    </div>
                  )
                }


                {
                  !operationTypesLoading &&
                  operationTypesError &&
                  (
                    <div
                      className=
                        "data-empty-state compact"
                    >
                      <AlertTriangle
                        size={24}
                      />

                      <strong>
                        Не вдалося
                        отримати типи
                        операцій
                      </strong>

                      <span>
                        {
                          operationTypesError
                        }
                      </span>
                    </div>
                  )
                }


                {
                  !operationTypesLoading &&
                  !operationTypesError &&
                  (
                    <>
                      <div
                        className=
                          "quick-grid"

                        style={{
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(190px, 1fr))"
                        }}
                      >
                        {
                          operationTypes.map(
                            operationType => (
                              <QuickAction
                                key={
                                  operationType.value
                                }

                                icon={
                                  Plus
                                }

                                title={
                                  operationType.label
                                }

                                subtitle=
                                  "Відкрити форму"

                                tone=
                                  "green"

                                onIntent={
                                  () => {
                                    void prefetchOperationFormSchema({
                                      operationType:
                                        operationType.value,

                                      category:
                                        null,

                                      article:
                                        null
                                    });
                                  }
                                }

                                onClick={
                                  () => {
                                    /*
                                     * Повторний виклик безпечний:
                                     * PATCH 45 dedupe приєднає
                                     * модалку до вже запущеного
                                     * READ-запиту замість дубля.
                                     */
                                    void prefetchOperationFormSchema({
                                      operationType:
                                        operationType.value,

                                      category:
                                        null,

                                      article:
                                        null
                                    });

                                    setSelectedOperationType(
                                      operationType.value
                                    );

                                    setOperationModalOpen(
                                      true
                                    );
                                  }
                                }
                              />
                            )
                          )
                        }
                      </div>


                      <div
                      className=
                      "cash-cancel-action"

                      style={{
                      width:
                     "min(280px, 100%)",

                     marginTop:
                     14
                     }}
                      >
                        <QuickAction
                          icon={
                            RotateCcw
                          }

                          title=
                            "Скасувати операцію"

                          subtitle={
                            bootstrap
                              .permissions
                              .cancellationRequest
                              ? (
                                  domainReady
                                    ? "Скасувати проведену операцію"
                                    : "Очікує domain adapter"
                                )
                              : "Недостатньо прав"
                          }

                          tone=
                            "red"

                          disabled={
                            !bootstrap
                              .permissions
                              .cancellationRequest ||
                            !domainReady
                          }
                        />
                      </div>
                    </>
                  )
                }
              </section>


              <div
                className=
                  "content-grid"
              >
                <section
                  className=
                    "card operations-card"
                >
                  <div
                    className=
                      "section-heading"
                  >
                    <div>
                      <h2>
                        Останні операції
                      </h2>

                      <p>
                        Поточна
                        дозволена
                        локація
                      </p>
                    </div>
                  </div>


                  <div
                    className=
                      "data-empty-state"
                  >
                    <ClipboardList
                      size={26}
                    />

                    <strong>
                      Журнал ще не
                      підключений
                    </strong>

                    <span>
                      Дані з «Бази
                      операцій»
                      зʼявляться через
                      дозволений
                      server API.
                    </span>
                  </div>
                </section>


                <aside
                  className=
                    "right-column"
                >
                  <section
                    className=
                      "card inventory-card"
                  >
                    <div
                      className=
                        "section-heading compact"
                    >
                      <h2>
                        Склад —
                        оперативні
                        залишки
                      </h2>
                    </div>

                    <div
                      className=
                        "data-empty-state compact"
                    >
                      <Boxes
                        size={26}
                      />

                      <strong>
                        Склад ще не
                        підключений
                      </strong>

                      <span>
                        Партії та FEFO
                        будуть отримані
                        із чинного
                        domain core.
                      </span>
                    </div>
                  </section>


                  <section
                    className=
                      "card notifications"
                  >
                    <div
                      className=
                        "section-heading compact"
                    >
                      <h2>
                        Стан інтеграції
                      </h2>
                    </div>

                    <div
                      className=
                        "integration-list"
                    >
                      <StatusPill
                        tone="ok"
                      >
                        Server API
                      </StatusPill>

                      <StatusPill
                        tone="ok"
                      >
                        Control-plane DB
                      </StatusPill>

                      <StatusPill
                        tone={
                          serviceTone(
                            domainAdapterStatus
                          )
                        }
                      >
                        Apps Script adapter
                      </StatusPill>
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          )
        }


        {
          active !==
            "cash" &&
          (
            <section
              className=
                "placeholder-page card"
            >
              <div
                className=
                  "placeholder-icon"
              >
                {
                  active ===
                    "journal"
                    ? (
                        <ClipboardList
                          size={34}
                        />
                      )
                    : active ===
                        "inventory"
                      ? (
                          <Boxes
                            size={34}
                          />
                        )
                      : active ===
                          "shift-close"
                        ? (
                            <ClipboardCheck
                              size={34}
                            />
                          )
                        : active ===
                            "clients"
                          ? (
                              <Users
                                size={34}
                              />
                            )
                          : (
                              <UserRound
                                size={34}
                              />
                            )
                }
              </div>


              <span
                className=
                  "eyebrow"
              >
                Server-side context
              </span>


              <h2>
                {
                  navItems.find(
                    item =>
                      item.key ===
                      active
                  )?.label
                }
              </h2>


              {
                active ===
                  "journal" &&
                (
                  <p>
                    Тут буде журнал
                    проведених операцій,
                    пошук, фільтри та
                    дозволені дії.
                  </p>
                )
              }


              {
                active ===
                  "inventory" &&
                (
                  <p>
                    Тут буде склад:
                    пошук, переміщення,
                    вхідні переміщення,
                    приймання,
                    повернення та
                    дозволені
                    коригування.
                  </p>
                )
              }


              {
                active ===
                  "shift-close" &&
                (
                  <p>
                    Тут буде сценарій
                    перевірки та
                    закриття робочої
                    зміни.
                  </p>
                )
              }


              {
                active ===
                  "clients" &&
                (
                  <p>
                    Тут буде база
                    клієнтів: пошук,
                    список та картка
                    клієнта.
                  </p>
                )
              }


              {
                active ===
                  "account" &&
                (
                  <div
                    className=
                      "access-card"
                  >
                    <div>
                      <span>
                        Користувач
                      </span>

                      <strong>
                        {
                          context
                            .displayName
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Роль
                      </span>

                      <strong>
                        {
                          roleLabel
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Локація
                      </span>

                      <strong>
                        {
                          context
                            .locationName
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Проєкт
                      </span>

                      <strong>
                        {
                          context
                            .projectName
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Активний рік
                      </span>

                      <strong>
                        {
                          context
                            .activeYear
                        }
                      </strong>
                    </div>

                    <div>
                      <span>
                        Сесія
                      </span>

                      <StatusPill>
                        Активна
                      </StatusPill>
                    </div>

                    <button
                      type="button"

                      className=
                        "danger-button"

                      onClick={
                        logout
                      }

                      disabled={
                        loggingOut
                      }
                    >
                      <LogOut
                        size={18}
                      />

                      {
                        loggingOut
                          ? "Вихід…"
                          : "Вийти"
                      }
                    </button>
                  </div>
                )
              }
            </section>
          )
        }


        <footer
          className=
            "system-footer"
        >
          <div
            className=
              "footer-segment"
          >
            <span
              className=
                "footer-label"
            >
              Підключення
            </span>

            <div
              className=
                "footer-items"
            >
              <StatusPill
                tone="ok"
              >
                <Database
                  size={14}
                />

                API / DB
              </StatusPill>

              <StatusPill
                tone={
                  serviceTone(
                    domainAdapterStatus
                  )
                }
              >
                <FileSpreadsheet
                  size={14}
                />

                Apps Script adapter
              </StatusPill>
            </div>
          </div>


          <div
            className=
              "footer-segment"
          >
            <span
              className=
                "footer-label"
            >
              Поточний контекст
            </span>

            <strong>
              {
                context.projectName
              }

              {" — "}

              {
                context.locationName
              }
            </strong>

            <small>
              Рік:{" "}
              {
                context.activeYear
              }
            </small>
          </div>


          <div
            className=
              "footer-segment"
          >
            <span
              className=
                "footer-label"
            >
              Стан системи
            </span>

            <StatusPill
              tone={
                domainReady
                  ? "ok"
                  : "warning"
              }
            >
              {
                domainReady
                  ? "Доменні команди доступні"
                  : "Очікує domain adapter"
              }
            </StatusPill>
          </div>
        </footer>


        <OperationFormModal
          open={
            operationModalOpen
          }

          domainReady={
            domainReady
          }

          initialOperationType={
            selectedOperationType
          }

          onClose={
            () => {
              setOperationModalOpen(
                false
              );

              setSelectedOperationType(
                null
              );
            }
          }
        />
      </main>
    </div>
  );
}