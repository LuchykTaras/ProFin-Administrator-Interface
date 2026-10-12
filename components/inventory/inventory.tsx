"use client";

import {
  AlertTriangle,
  Boxes,
  CalendarDays,
  MapPin,
  RefreshCw,
  Search
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  getApiErrorMessage
} from "@/lib/client/api-client";

import {
  getInventory
} from "@/lib/client/inventory-api";

import type {
  InventoryData
} from "@/lib/contracts/inventory";


type InventoryProps = {
  active: boolean;

  onAdapterReady?:
    () => void;
};


function formatDate(
  value:
    string | null
): string {
  if (!value) {
    return "—";
  }


  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value
    );


  if (!match) {
    return value;
  }


  return [
    match[3],
    match[2],
    match[1]
  ].join(".");
}


function formatDateTime(
  value:
    string,

  timezone:
    string
): string {
  const date =
    new Date(
      value
    );


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return value;
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


function formatQuantity(
  value:
    number
): string {
  return new Intl
    .NumberFormat(
      "uk-UA",
      {
        maximumFractionDigits:
          3
      }
    )
    .format(
      value
    );
}


export function Inventory({
  active,
  onAdapterReady
}: InventoryProps) {
  const [
    data,
    setData
  ] =
    useState<
      InventoryData | null
    >(
      null
    );


  const [
    loading,
    setLoading
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


  const [
    searchQuery,
    setSearchQuery
  ] =
    useState(
      ""
    );


  const [
    statusFilter,
    setStatusFilter
  ] =
    useState(
      ""
    );


  const [
    refreshKey,
    setRefreshKey
  ] =
    useState(
      0
    );


  useEffect(
    () => {
      if (
        !active
      ) {
        return;
      }


      const controller =
        new AbortController();


      async function loadInventory() {
        setLoading(
          true
        );


        setError(
          ""
        );


        try {
          const result =
            await getInventory(
              controller.signal
            );


          if (
            controller
              .signal
              .aborted
          ) {
            return;
          }


          setData(
            result
          );


          onAdapterReady?.();

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


          console.warn(
            "[INVENTORY_READ_ERROR]",
            getApiErrorMessage(
              loadError,
              "Не вдалося отримати дані складу."
            )
          );


          setError(
            getApiErrorMessage(
              loadError,
              "Не вдалося отримати дані складу."
            )
          );

        } finally {
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


      void loadInventory();


      return () => {
        controller.abort();
      };
    },
    [
      active,
      refreshKey,
      onAdapterReady
    ]
  );


  const statuses =
    useMemo(
      () => {
        if (
          !data
        ) {
          return [];
        }


        return Array.from(
          new Set(
            data.items
              .map(
                item =>
                  item.status
              )
              .filter(
                Boolean
              )
          )
        )
          .sort(
            (
              left,
              right
            ) =>
              left.localeCompare(
                right,
                "uk-UA"
              )
          );
      },
      [
        data
      ]
    );


  const filteredItems =
    useMemo(
      () => {
        if (
          !data
        ) {
          return [];
        }


        const normalizedSearch =
          searchQuery
            .trim()
            .toLocaleLowerCase(
              "uk-UA"
            );


        return data.items.filter(
          item => {
            if (
              statusFilter &&
              item.status !==
                statusFilter
            ) {
              return false;
            }


            if (
              !normalizedSearch
            ) {
              return true;
            }


            const searchable =
              [
                item.inventoryName,
                item.inventoryType,
                item.lotId,
                item.series,
                item.status,
                item.locationName
              ]
                .filter(
                  value =>
                    Boolean(
                      value
                    )
                )
                .join(
                  " "
                )
                .toLocaleLowerCase(
                  "uk-UA"
                );


            return searchable.includes(
              normalizedSearch
            );
          }
        );
      },
      [
        data,
        searchQuery,
        statusFilter
      ]
    );


  return (
    <section
      className=
        "inventory-module"
    >
      <div
        className=
          "inventory-module-header"
      >
        <div>
          <span
            className=
              "inventory-eyebrow"
          >
            READ-ONLY INVENTORY
          </span>


          <div
            className=
              "inventory-title-row"
          >
            <Boxes
              size={24}
            />


            <h2>
              Склад
            </h2>
          </div>


          <p>
            Партії, строки придатності,
            доступний залишок і статус
            поточної філії.
          </p>
        </div>


        <button
          type=
            "button"

          className=
            "inventory-refresh-button"

          disabled={
            loading
          }

          onClick={
            () => {
              setRefreshKey(
                value =>
                  value + 1
              );
            }
          }
        >
          <RefreshCw
            size={17}
          />

          {
            loading
              ? "Оновлення…"
              : "Оновити"
          }
        </button>
      </div>


      {
        data &&
        (
          <div
            className=
              "inventory-summary"
          >
            <div>
              <strong>
                {
                  data.total
                }
              </strong>

              <span>
                партій
              </span>
            </div>


            <div>
              <MapPin
                size={16}
              />

              <span>
                {
                  data.locationName
                }
              </span>
            </div>


            <div>
              <CalendarDays
                size={16}
              />

              <span>
                Оновлено:{" "}

                {
                  formatDateTime(
                    data.checkedAt,
                    data.timezone
                  )
                }
              </span>
            </div>
          </div>
        )
      }


      <div
        className=
          "inventory-toolbar"
      >
        <div
          className=
            "inventory-search"
        >
          <Search
            size={17}
          />

          <input
            type=
              "search"

            value={
              searchQuery
            }

            placeholder=
              "Пошук за назвою, lot-ID, серією…"

            onChange={
              event => {
                setSearchQuery(
                  event.target.value
                );
              }
            }
          />
        </div>


        <select
          className=
            "inventory-status-filter"

          value={
            statusFilter
          }

          onChange={
            event => {
              setStatusFilter(
                event.target.value
              );
            }
          }
        >
          <option
            value=""
          >
            Усі статуси
          </option>


          {
            statuses.map(
              status => (
                <option
                  key={
                    status
                  }

                  value={
                    status
                  }
                >
                  {
                    status
                  }
                </option>
              )
            )
          }
        </select>
      </div>


      {
        error &&
        (
          <div
            className=
              "inventory-error"

            role=
              "alert"
          >
            <AlertTriangle
              size={18}
            />

            <div>
              <strong>
                Не вдалося отримати склад
              </strong>

              <span>
                {
                  error
                }
              </span>
            </div>
          </div>
        )
      }


      {
        loading &&
        !data &&
        (
          <div
            className=
              "inventory-empty-state"
          >
            <RefreshCw
              size={26}
            />

            <strong>
              Завантажуємо склад…
            </strong>

            <span>
              Отримуємо партії
              поточної філії через
              server API.
            </span>
          </div>
        )
      }


      {
        !loading &&
        !error &&
        data &&
        data.items.length ===
          0 &&
        (
          <div
            className=
              "inventory-empty-state"
          >
            <Boxes
              size={28}
            />

            <strong>
              Склад порожній
            </strong>

            <span>
              Domain core не повернув
              жодної доступної партії
              для цієї філії.
            </span>
          </div>
        )
      }


      {
        data &&
        data.items.length >
          0 &&
        (
          <>
            <div
              className=
                "inventory-result-line"
            >
              Показано{" "}
              <strong>
                {
                  filteredItems.length
                }
              </strong>
              {" "}з{" "}
              <strong>
                {
                  data.items.length
                }
              </strong>
              {" "}партій
            </div>


            {
              filteredItems.length ===
                0
                ? (
                    <div
                      className=
                        "inventory-empty-state"
                    >
                      <Search
                        size={26}
                      />

                      <strong>
                        Нічого не знайдено
                      </strong>

                      <span>
                        Змініть пошук
                        або фільтр статусу.
                      </span>
                    </div>
                  )
                : (
                    <div
                      className=
                        "inventory-table-wrap"
                    >
                      <table
                        className=
                          "inventory-table"
                      >
                        <thead>
                          <tr>
                            <th>
                              Найменування
                            </th>

                            <th>
                              Тип
                            </th>

                            <th>
                              Lot ID
                            </th>

                            <th>
                              Серія
                            </th>

                            <th>
                              Строк придатності
                            </th>

                            <th>
                              Доступно
                            </th>

                            <th>
                              Статус
                            </th>

                            <th>
                              Локація
                            </th>
                          </tr>
                        </thead>


                        <tbody>
                          {
                            filteredItems.map(
                              item => (
                                <tr
                                  key={
                                    item.lotId
                                  }
                                >
                                  <td>
                                    <strong
                                      className=
                                        "inventory-item-name"
                                    >
                                      {
                                        item.inventoryName
                                      }
                                    </strong>
                                  </td>


                                  <td>
                                    {
                                      item.inventoryType ??
                                      "—"
                                    }
                                  </td>


                                  <td>
                                    <code
                                      className=
                                        "inventory-lot-id"
                                    >
                                      {
                                        item.lotId
                                      }
                                    </code>
                                  </td>


                                  <td>
                                    {
                                      item.series ??
                                      "—"
                                    }
                                  </td>


                                  <td>
                                    {
                                      formatDate(
                                        item.expiryDate
                                      )
                                    }
                                  </td>


                                  <td>
                                    <strong
                                      className=
                                        "inventory-quantity"
                                    >
                                      {
                                        formatQuantity(
                                          item.availableQuantity
                                        )
                                      }

                                      {
                                        item.unit
                                          ? ` ${item.unit}`
                                          : ""
                                      }
                                    </strong>
                                  </td>


                                  <td>
                                    <span
                                      className=
                                        "inventory-status"
                                    >
                                      {
                                        item.status
                                      }
                                    </span>
                                  </td>


                                  <td>
                                    <span
                                      className=
                                        "inventory-location"
                                    >
                                      <MapPin
                                        size={14}
                                      />

                                      {
                                        item.locationName
                                      }
                                    </span>
                                  </td>
                                </tr>
                              )
                            )
                          }
                        </tbody>
                      </table>
                    </div>
                  )
            }
          </>
        )
      }
    </section>
  );
}