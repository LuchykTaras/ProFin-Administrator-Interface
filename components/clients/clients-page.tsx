"use client";

import {
  CalendarDays,
  ChevronRight,
  ContactRound,
  Phone,
  Search,
  UserPlus,
  UserRound,
  Users,
  X
} from "lucide-react";

import {
  useMemo,
  useState
} from "react";


export type ClientListItemUi = {
  clientId:
    string;

  displayName:
    string;

  birthDate?:
    string | null;

  phone?:
    string | null;

  guardianName?:
    string | null;

  doctorName?:
    string | null;

  tag?:
    string | null;
};


type ClientsPageProps = {
  active:
    boolean;

  clients?:
    ClientListItemUi[];

  loading?:
    boolean;

  error?:
    string;

  canCreateClient?:
    boolean;

  onCreateClient?:
    () => void;
};


function formatBirthDate(
  value:
    string | null | undefined
): string {
  if (
    !value
  ) {
    return "—";
  }


  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value
    );


  if (
    !match
  ) {
    return value;
  }


  return [
    match[3],
    match[2],
    match[1]
  ].join(
    "."
  );
}


export function ClientsPage({
  active,
  clients = [],
  loading = false,
  error = "",
  canCreateClient = false,
  onCreateClient
}: ClientsPageProps) {
  const [
    searchQuery,
    setSearchQuery
  ] =
    useState(
      ""
    );


  const [
    selectedClientId,
    setSelectedClientId
  ] =
    useState<
      string | null
    >(
      null
    );


  const selectedClient =
    useMemo(
      () => {
        if (
          !selectedClientId
        ) {
          return null;
        }


        return (
          clients.find(
            client =>
              client.clientId ===
              selectedClientId
          ) ??
          null
        );
      },
      [
        clients,
        selectedClientId
      ]
    );


  const filteredClients =
    useMemo(
      () => {
        const normalizedQuery =
          searchQuery
            .trim()
            .toLocaleLowerCase(
              "uk-UA"
            );


        if (
          !normalizedQuery
        ) {
          return clients;
        }


        return clients.filter(
          client => {
            const searchable =
              [
                client.displayName,
                client.clientId,
                client.phone,
                client.guardianName,
                client.doctorName,
                client.tag
              ]
                .filter(
                  Boolean
                )
                .join(
                  " "
                )
                .toLocaleLowerCase(
                  "uk-UA"
                );


            return searchable.includes(
              normalizedQuery
            );
          }
        );
      },
      [
        clients,
        searchQuery
      ]
    );


  if (
    !active
  ) {
    return null;
  }


  return (
    <section
      className=
        "clients-page"
    >
      <div
        className=
          "clients-page-header"
      >
        <div>
          <span
            className=
              "clients-eyebrow"
          >
            CLIENTS
          </span>


          <div
            className=
              "clients-title-row"
          >
            <Users
              size={24}
            />


            <h2>
              База клієнтів
            </h2>
          </div>


          <p>
            Пошук, список та картка клієнта
            поточної дозволеної філії.
          </p>
        </div>


        <button
          type=
            "button"

          className=
            "clients-create-button"

          disabled={
            !canCreateClient
          }

          onClick={
            onCreateClient
          }
        >
          <UserPlus
            size={18}
          />

          <span>
            Новий клієнт
          </span>
        </button>
      </div>


      <div
        className=
          "clients-toolbar"
      >
        <div
          className=
            "clients-search"
        >
          <Search
            size={18}
          />


          <input
            type=
              "search"

            value={
              searchQuery
            }

            placeholder=
              "Пошук за ПІБ, телефоном або clientId…"

            onChange={
              event => {
                setSearchQuery(
                  event.target.value
                );
              }
            }
          />


          {
            searchQuery &&
            (
              <button
                type=
                  "button"

                className=
                  "clients-search-clear"

                aria-label=
                  "Очистити пошук"

                onClick={
                  () => {
                    setSearchQuery(
                      ""
                    );
                  }
                }
              >
                <X
                  size={15}
                />
              </button>
            )
          }
        </div>


        <div
          className=
            "clients-count"
        >
          <Users
            size={16}
          />

          <strong>
            {
              filteredClients.length
            }
          </strong>

          <span>
            клієнтів
          </span>
        </div>
      </div>


      {
        error &&
        (
          <div
            className=
              "clients-state clients-state-error"
          >
            <strong>
              Не вдалося отримати базу клієнтів
            </strong>

            <span>
              {
                error
              }
            </span>
          </div>
        )
      }


      {
        loading &&
        !error &&
        (
          <div
            className=
              "clients-state"
          >
            <Users
              size={28}
            />

            <strong>
              Завантажуємо клієнтів…
            </strong>

            <span>
              Очікуємо дані дозволеної
              поточної філії.
            </span>
          </div>
        )
      }


      {
        !loading &&
        !error &&
        clients.length ===
          0 &&
        (
          <div
            className=
              "clients-state"
          >
            <ContactRound
              size={30}
            />

            <strong>
              База клієнтів поки недоступна
            </strong>

            <span>
              UI уже готовий.
              Список зʼявиться після
              підключення дозволеного
              джерела даних клієнтів.
            </span>
          </div>
        )
      }


      {
        !loading &&
        !error &&
        clients.length >
          0 &&
        (
          <div
            className=
              "clients-layout"
          >
            <div
              className=
                "clients-list-card"
            >
              <div
                className=
                  "clients-list-head"
              >
                <span>
                  Клієнт
                </span>

                <span>
                  Дата народження
                </span>

                <span>
                  Телефон
                </span>

                <span>
                  Лікар
                </span>

                <span
                  aria-hidden=
                    "true"
                />
              </div>


              <div
                className=
                  "clients-list"
              >
                {
                  filteredClients.length ===
                    0
                    ? (
                        <div
                          className=
                            "clients-list-empty"
                        >
                          <Search
                            size={24}
                          />

                          <strong>
                            Нічого не знайдено
                          </strong>

                          <span>
                            Змініть пошуковий запит.
                          </span>
                        </div>
                      )
                    : filteredClients.map(
                        client => (
                          <button
                            type=
                              "button"

                            key={
                              client.clientId
                            }

                            className={
                              selectedClientId ===
                                client.clientId
                                ? "clients-list-row active"
                                : "clients-list-row"
                            }

                            onClick={
                              () => {
                                setSelectedClientId(
                                  client.clientId
                                );
                              }
                            }
                          >
                            <span
                              className=
                                "clients-person"
                            >
                              <span
                                className=
                                  "clients-person-icon"
                              >
                                <UserRound
                                  size={17}
                                />
                              </span>


                              <span>
                                <strong>
                                  {
                                    client.displayName
                                  }
                                </strong>

                                <small>
                                  {
                                    client.tag ||
                                    client.clientId
                                  }
                                </small>
                              </span>
                            </span>


                            <span>
                              {
                                formatBirthDate(
                                  client.birthDate
                                )
                              }
                            </span>


                            <span>
                              {
                                client.phone ||
                                "—"
                              }
                            </span>


                            <span>
                              {
                                client.doctorName ||
                                "—"
                              }
                            </span>


                            <ChevronRight
                              size={17}
                            />
                          </button>
                        )
                      )
                }
              </div>
            </div>


            <aside
              className=
                "client-details-card"
            >
              {
                selectedClient
                  ? (
                      <>
                        <div
                          className=
                            "client-details-header"
                        >
                          <span
                            className=
                              "client-details-avatar"
                          >
                            <UserRound
                              size={24}
                            />
                          </span>


                          <div>
                            <strong>
                              {
                                selectedClient.displayName
                              }
                            </strong>

                            <span>
                              Картка клієнта
                            </span>
                          </div>
                        </div>


                        <div
                          className=
                            "client-details-grid"
                        >
                          <div
                            className=
                              "client-detail-row"
                          >
                            <span>
                              Client ID
                            </span>

                            <code>
                              {
                                selectedClient.clientId
                              }
                            </code>
                          </div>


                          <div
                            className=
                              "client-detail-row"
                          >
                            <span>
                              <CalendarDays
                                size={15}
                              />

                              Дата народження
                            </span>

                            <strong>
                              {
                                formatBirthDate(
                                  selectedClient.birthDate
                                )
                              }
                            </strong>
                          </div>


                          <div
                            className=
                              "client-detail-row"
                          >
                            <span>
                              <Phone
                                size={15}
                              />

                              Телефон
                            </span>

                            <strong>
                              {
                                selectedClient.phone ||
                                "—"
                              }
                            </strong>
                          </div>


                          <div
                            className=
                              "client-detail-row"
                          >
                            <span>
                              Довірена особа
                            </span>

                            <strong>
                              {
                                selectedClient.guardianName ||
                                "—"
                              }
                            </strong>
                          </div>


                          <div
                            className=
                              "client-detail-row"
                          >
                            <span>
                              Лікар
                            </span>

                            <strong>
                              {
                                selectedClient.doctorName ||
                                "—"
                              }
                            </strong>
                          </div>


                          <div
                            className=
                              "client-detail-row"
                          >
                            <span>
                              Тег
                            </span>

                            <strong>
                              {
                                selectedClient.tag ||
                                "—"
                              }
                            </strong>
                          </div>
                        </div>
                      </>
                    )
                  : (
                      <div
                        className=
                          "client-details-empty"
                      >
                        <ContactRound
                          size={30}
                        />

                        <strong>
                          Виберіть клієнта
                        </strong>

                        <span>
                          Картка відкриється тут
                          без переходу на іншу сторінку.
                        </span>
                      </div>
                    )
              }
            </aside>
          </div>
        )
      }
    </section>
  );
}