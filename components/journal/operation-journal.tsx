"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import type {
  OperationJournalCellValue,
  OperationJournalColumn,
  OperationJournalColumnKey,
  OperationJournalData,
  OperationJournalRow
} from "@/lib/contracts/journal";

import styles from "./operation-journal.module.css";


type ApiEnvelope<T> = {
  requestId:
    string;

  ok:
    boolean;

  code:
    string;

  userMessage:
    string;

  technicalMessage:
    string | null;

  data:
    T | null;

  retryable:
    boolean;
};


const POLLING_INTERVAL_MS =
  6000;


const CURRENCY_KEYS =
  new Set<OperationJournalColumnKey>([
    "unitPrice",
    "amount",
    "packageMonthlyAmount",
    "vaccineCost"
  ]);


function isApiEnvelope(
  value:
    unknown
): value is ApiEnvelope<OperationJournalData> {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const record =
    value as Record<string, unknown>;

  return (
    typeof record.ok === "boolean" &&
    typeof record.code === "string"
  );
}


function formatMonthLabel(
  monthKey:
    string
): string {
  const [
    rawYear,
    rawMonth
  ] =
    monthKey.split("-");

  const year =
    Number(rawYear);

  const month =
    Number(rawMonth);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month)
  ) {
    return monthKey;
  }

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        1
      )
    );

  const label =
    new Intl.DateTimeFormat(
      "uk-UA",
      {
        month:
          "long",
        year:
          "numeric",
        timeZone:
          "UTC"
      }
    ).format(
      date
    );

  return (
    label.charAt(0).toUpperCase() +
    label.slice(1)
  );
}


function formatDateValue(
  value:
    string
): string {
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


function formatNumberValue(
  value:
    number
): string {
  return new Intl.NumberFormat(
    "uk-UA",
    {
      maximumFractionDigits:
        2
    }
  ).format(
    value
  );
}


function formatCellValue(
  column:
    OperationJournalColumn,
  value:
    OperationJournalCellValue
): string {
  if (
    value === null ||
    typeof value === "undefined" ||
    value === ""
  ) {
    return "—";
  }

  if (
    column.kind === "date" &&
    typeof value === "string"
  ) {
    return formatDateValue(
      value
    );
  }

  if (
    column.kind === "number" &&
    typeof value === "number"
  ) {
    const formatted =
      formatNumberValue(
        value
      );

    if (
      CURRENCY_KEYS.has(
        column.key
      )
    ) {
      return `${formatted} грн`;
    }

    return formatted;
  }

  return String(
    value
  );
}


function getRowIdentity(
  row:
    OperationJournalRow
): string {
  const operationId =
    row.values
      .operationId;

  if (
    typeof operationId === "string" &&
    operationId.trim()
  ) {
    return `operation:${operationId.trim()}`;
  }

  return `row:${row.rowNumber}`;
}


function mergeRows(
  newerRows:
    OperationJournalRow[],
  currentRows:
    OperationJournalRow[]
): OperationJournalRow[] {
  const result:
    OperationJournalRow[] =
      [];

  const identities =
    new Set<string>();

  for (
    const row of [
      ...newerRows,
      ...currentRows
    ]
  ) {
    const identity =
      getRowIdentity(
        row
      );

    if (
      identities.has(
        identity
      )
    ) {
      continue;
    }

    identities.add(
      identity
    );

    result.push(
      row
    );
  }

  return result;
}


function shiftMonth(
  monthKey:
    string,
  offset:
    number
): string {
  const [
    rawYear,
    rawMonth
  ] =
    monthKey.split("-");

  const year =
    Number(rawYear);

  const month =
    Number(rawMonth);

  const shifted =
    new Date(
      Date.UTC(
        year,
        month - 1 + offset,
        1
      )
    );

  return [
    shifted.getUTCFullYear(),
    String(
      shifted.getUTCMonth() +
      1
    ).padStart(
      2,
      "0"
    )
  ].join("-");
}


function csvEscape(
  value:
    string
): string {
  if (
    value.includes('"') ||
    value.includes(",") ||
    value.includes("\n")
  ) {
    return `"${value.replace(
      /"/g,
      '""'
    )}"`;
  }

  return value;
}

type OperationJournalProps = {
  onAdapterReady?:
    () => void;
};


export default function OperationJournal({
  onAdapterReady
}: OperationJournalProps) {
  const [
    journal,
    setJournal
  ] =
    useState<OperationJournalData | null>(
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
    refreshing,
    setRefreshing
  ] =
    useState(
      false
    );

  const [
    error,
    setError
  ] =
    useState<string | null>(
      null
    );

  const [
    search,
    setSearch
  ] =
    useState(
      ""
    );

  const [
    typeFilter,
    setTypeFilter
  ] =
    useState(
      "ALL"
    );

  const [
    statusFilter,
    setStatusFilter
  ] =
    useState(
      "ALL"
    );

  const [
    pendingRows,
    setPendingRows
  ] =
    useState<
      OperationJournalRow[]
    >(
      []
    );

  const [
    polling,
    setPolling
  ] =
    useState(
      false
    );


  const tableContainerRef =
    useRef<HTMLDivElement | null>(
      null
    );


  const journalRef =
    useRef<OperationJournalData | null>(
      null
    );


    const pollRequestRunningRef =
    useRef(
      false
    );


  const initialLoadStartedRef =
    useRef(
      false
    );


  const mountedRef =
    useRef(
      true
    );


  useEffect(
    () => {
      journalRef.current =
        journal;
    },
    [
      journal
    ]
  );


    useEffect(
    () => {
      /*
       * React Strict Mode у dev:
       * setup → cleanup → setup.
       *
       * Тому при кожному setup
       * обов'язково повертаємо true.
       */
      mountedRef.current =
        true;


      return () => {
        mountedRef.current =
          false;
      };
    },
    []
  );


  const requestJournal =
    useCallback(
      async (
        url:
          string
      ): Promise<OperationJournalData> => {
                const controller =
          new AbortController();


        const timeoutId =
          window.setTimeout(
            () => {
              controller.abort();
            },
            30000
          );


        let response:
          Response;


        try {
          response =
            await fetch(
              url,
              {
                method:
                  "GET",

                credentials:
                  "same-origin",

                cache:
                  "no-store",

                signal:
                  controller.signal,

                headers: {
                  Accept:
                    "application/json"
                }
              }
            );
        } catch (
          requestError
        ) {
          if (
            requestError instanceof DOMException &&
            requestError.name ===
              "AbortError"
          ) {
            throw new Error(
              "Журнал не відповів протягом 30 секунд. Спробуйте оновити ще раз."
            );
          }


          throw requestError;
        } finally {
          window.clearTimeout(
            timeoutId
          );
        }


        const payload:
          unknown =
            await response.json();


        if (
          !isApiEnvelope(
            payload
          )
        ) {
          throw new Error(
            "Сервер повернув некоректну відповідь журналу."
          );
        }


        if (
          !response.ok ||
          !payload.ok ||
          !payload.data
        ) {
          throw new Error(
            payload.userMessage ||
            "Не вдалося завантажити журнал операцій."
          );
        }


        /*
         * Успішний Journal API означає,
         * що Apps Script adapter реально
         * відповів через весь server path.
         */
        onAdapterReady?.();


        return payload.data;
      },
            [
        onAdapterReady
      ]
    );


  const loadMonth =
    useCallback(
      async (
        monthKey?:
          string,
        silent =
          false
      ) => {
        if (
          silent
        ) {
          setRefreshing(
            true
          );
        } else {
          setLoading(
            true
          );
        }


        setError(
          null
        );


        try {
          const url =
            monthKey
              ? `/api/operations/journal?month=${encodeURIComponent(
                  monthKey
                )}`
              : "/api/operations/journal";


          const data =
            await requestJournal(
              url
            );


          if (
            !mountedRef.current
          ) {
            return;
          }


          setJournal(
            data
          );

          setPendingRows(
            []
          );

          setSearch(
            ""
          );

          setTypeFilter(
            "ALL"
          );

          setStatusFilter(
            "ALL"
          );
        } catch (
          requestError
        ) {
          if (
            !mountedRef.current
          ) {
            return;
          }


          setError(
            requestError instanceof Error
              ? requestError.message
              : "Не вдалося завантажити журнал операцій."
          );
        } finally {
          if (
            mountedRef.current
          ) {
            setLoading(
              false
            );

            setRefreshing(
              false
            );
          }
        }
      },
      [
        requestJournal
      ]
    );


    useEffect(
    () => {
      /*
       * Захист від подвійного INITIAL
       * у React Strict Mode.
       */
      if (
        initialLoadStartedRef.current
      ) {
        return;
      }


      initialLoadStartedRef.current =
        true;


      void loadMonth();
    },
    [
      loadMonth
    ]
  );


  const pollDelta =
    useCallback(
      async () => {
        const snapshot =
          journalRef.current;


        if (
          !snapshot ||
          !snapshot.live ||
          snapshot.latestRowNumber ===
            null ||
          pollRequestRunningRef.current ||
          document.hidden
        ) {
          return;
        }


        pollRequestRunningRef.current =
          true;

        setPolling(
          true
        );


        try {
          const delta =
            await requestJournal(
              `/api/operations/journal?afterRow=${encodeURIComponent(
                String(
                  snapshot.latestRowNumber
                )
              )}`
            );


          /*
           * Настав новий місяць.
           *
           * Старий місяць стає history,
           * а UI переключається на новий
           * current month.
           */
          if (
            delta.monthKey !==
            snapshot.monthKey
          ) {
            await loadMonth(
              undefined,
              true
            );

            return;
          }


          if (
            !mountedRef.current
          ) {
            return;
          }


          /*
           * Cursor оновлюємо навіть якщо
           * новий фізичний рядок не належить
           * поточному місяцю.
           */
          setJournal(
            current => {
              if (!current) {
                return current;
              }


              if (
                current.monthKey !==
                delta.monthKey
              ) {
                return current;
              }


              const nextBase = {
                ...current,

                latestRowNumber:
                  delta.latestRowNumber ??
                  current.latestRowNumber,

                latestOperationId:
                  delta.latestOperationId ??
                  current.latestOperationId
              };


              if (
                delta.rows.length ===
                0
              ) {
                return nextBase;
              }


              const container =
                tableContainerRef.current;


              const nearTop =
                !container ||
                container.scrollTop <
                  72;


              if (
                !nearTop
              ) {
                setPendingRows(
                  existing =>
                    mergeRows(
                      delta.rows,
                      existing
                    )
                );


                return {
                  ...nextBase,

                  monthTotal:
                    (
                      current.monthTotal ??
                      current.rows.length
                    ) +
                    delta.rows.length
                };
              }


              const mergedRows =
                mergeRows(
                  delta.rows,
                  current.rows
                );


              return {
                ...nextBase,

                rows:
                  mergedRows,

                returnedCount:
                  mergedRows.length,

                monthTotal:
                  (
                    current.monthTotal ??
                    current.rows.length
                  ) +
                  delta.rows.length
              };
            }
          );
        } catch {
          /*
           * Silent polling не ламає
           * вже завантажений журнал.
           *
           * Ручне оновлення покаже
           * користувачу помилку окремо.
           */
        } finally {
          pollRequestRunningRef.current =
            false;

          if (
            mountedRef.current
          ) {
            setPolling(
              false
            );
          }
        }
      },
      [
        loadMonth,
        requestJournal
      ]
    );


  useEffect(
    () => {
      if (
        !journal?.live
      ) {
        return;
      }


      const intervalId =
        window.setInterval(
          () => {
            void pollDelta();
          },
          POLLING_INTERVAL_MS
        );


      const handleVisibilityChange =
        () => {
          if (
            !document.hidden
          ) {
            void pollDelta();
          }
        };


      document.addEventListener(
        "visibilitychange",
        handleVisibilityChange
      );


      return () => {
        window.clearInterval(
          intervalId
        );

        document.removeEventListener(
          "visibilitychange",
          handleVisibilityChange
        );
      };
    },
    [
      journal?.live,
      pollDelta
    ]
  );


  const operationTypes =
    useMemo(
      () => {
        if (!journal) {
          return [];
        }


        return Array.from(
          new Set(
            journal.rows
              .map(
                row =>
                  row.values
                    .operationType
              )
              .filter(
                (
                  value
                ): value is string =>
                  typeof value ===
                    "string" &&
                  value.trim()
                    .length >
                    0
              )
          )
        ).sort(
          (
            left,
            right
          ) =>
            left.localeCompare(
              right,
              "uk"
            )
        );
      },
      [
        journal
      ]
    );


  const statuses =
    useMemo(
      () => {
        if (!journal) {
          return [];
        }


        return Array.from(
          new Set(
            journal.rows
              .map(
                row =>
                  row.values
                    .recordStatus
              )
              .filter(
                (
                  value
                ): value is string =>
                  typeof value ===
                    "string" &&
                  value.trim()
                    .length >
                    0
              )
          )
        ).sort(
          (
            left,
            right
          ) =>
            left.localeCompare(
              right,
              "uk"
            )
        );
      },
      [
        journal
      ]
    );


  const filteredRows =
    useMemo(
      () => {
        if (!journal) {
          return [];
        }


        const normalizedSearch =
          search
            .trim()
            .toLocaleLowerCase(
              "uk"
            );


        return journal.rows.filter(
          row => {
            if (
              typeFilter !==
                "ALL" &&
              row.values
                .operationType !==
                typeFilter
            ) {
              return false;
            }


            if (
              statusFilter !==
                "ALL" &&
              row.values
                .recordStatus !==
                statusFilter
            ) {
              return false;
            }


            if (
              !normalizedSearch
            ) {
              return true;
            }


            return Object.values(
              row.values
            ).some(
              value => {
                if (
                  value ===
                    null ||
                  typeof value ===
                    "undefined"
                ) {
                  return false;
                }


                return String(
                  value
                )
                  .toLocaleLowerCase(
                    "uk"
                  )
                  .includes(
                    normalizedSearch
                  );
              }
            );
          }
        );
      },
      [
        journal,
        search,
        statusFilter,
        typeFilter
      ]
    );


  const handleShowPending =
    () => {
      if (
        pendingRows.length ===
        0
      ) {
        return;
      }


      setJournal(
        current => {
          if (!current) {
            return current;
          }


          const mergedRows =
            mergeRows(
              pendingRows,
              current.rows
            );


          return {
            ...current,

            rows:
              mergedRows,

            returnedCount:
              mergedRows.length
          };
        }
      );


      setPendingRows(
        []
      );


      requestAnimationFrame(
        () => {
          tableContainerRef
            .current
            ?.scrollTo({
              top:
                0,
              behavior:
                "smooth"
            });
        }
      );
    };


  const handlePreviousMonth =
    () => {
      if (!journal) {
        return;
      }


      const previous =
        shiftMonth(
          journal.monthKey,
          -1
        );


      const currentYear =
        journal.monthKey.slice(
          0,
          4
        );


      if (
        !previous.startsWith(
          `${currentYear}-`
        )
      ) {
        return;
      }


      void loadMonth(
        previous
      );
    };


  const handleNextMonth =
    () => {
      if (
        !journal ||
        journal.isCurrentMonth
      ) {
        return;
      }


      const next =
        shiftMonth(
          journal.monthKey,
          1
        );


      void loadMonth(
        next
      );
    };


  const handleCurrentMonth =
    () => {
      void loadMonth();
    };


  const handleRefresh =
    () => {
      if (!journal) {
        return;
      }


      void loadMonth(
        journal.monthKey,
        true
      );
    };


  const handleExportCurrentMonth =
    () => {
      if (!journal) {
        return;
      }


      const header =
        journal.columns
          .map(
            column =>
              csvEscape(
                column.label
              )
          )
          .join(
            ","
          );


      const dataRows =
        journal.rows.map(
          row =>
            journal.columns
              .map(
                column =>
                  csvEscape(
                    formatCellValue(
                      column,
                      row.values[
                        column.key
                      ] ??
                      null
                    )
                  )
              )
              .join(
                ","
              )
        );


      const csv =
        [
          header,
          ...dataRows
        ].join(
          "\n"
        );


      const blob =
        new Blob(
          [
            "\uFEFF",
            csv
          ],
          {
            type:
              "text/csv;charset=utf-8"
          }
        );


      const url =
        URL.createObjectURL(
          blob
        );


      const anchor =
        document.createElement(
          "a"
        );


      anchor.href =
        url;

      anchor.download =
        `profin-journal-${journal.monthKey}.csv`;


      document.body.appendChild(
        anchor
      );

      anchor.click();

      anchor.remove();


      URL.revokeObjectURL(
        url
      );
    };


  if (
    loading &&
    !journal
  ) {
    return (
      <section
        className={
          styles.shell
        }
      >
        <div
          className={
            styles.loading
          }
        >
          <span
            className={
              styles.spinner
            }
          />

          <strong>
            Завантажуємо журнал операцій…
          </strong>

          <span>
            Отримуємо реальні дані з Бази операцій.
          </span>
        </div>
      </section>
    );
  }


  if (
    error &&
    !journal
  ) {
    return (
      <section
        className={
          styles.shell
        }
      >
        <div
          className={
            styles.errorState
          }
        >
          <strong>
            Не вдалося відкрити журнал
          </strong>

          <span>
            {error}
          </span>

          <button
            type="button"
            className={
              styles.primaryButton
            }
            onClick={
              () =>
                void loadMonth()
            }
          >
            Спробувати ще раз
          </button>
        </div>
      </section>
    );
  }


  if (!journal) {
    return null;
  }


  const monthNumber =
    Number(
      journal.monthKey.slice(
        5,
        7
      )
    );


  const previousDisabled =
    monthNumber ===
      1;


  return (
    <section
      className={
        styles.shell
      }
    >
      <div
        className={
          styles.header
        }
      >
        <div>
          <div
            className={
              styles.eyebrow
            }
          >
            БАЗА ОПЕРАЦІЙ
          </div>

          <div
            className={
              styles.titleRow
            }
          >
            <h2
              className={
                styles.title
              }
            >
              {formatMonthLabel(
                journal.monthKey
              )}
            </h2>

            {journal.live ? (
              <span
                className={
                  styles.liveBadge
                }
              >
                <span
                  className={
                    styles.liveDot
                  }
                />

                LIVE
              </span>
            ) : (
              <span
                className={
                  styles.historyBadge
                }
              >
                Історія
              </span>
            )}
          </div>

          <div
            className={
              styles.summary
            }
          >
            <strong>
              {journal.monthTotal ??
                journal.rows.length}
            </strong>

            {" "}
            операцій за місяць

            {polling &&
              journal.live && (
                <span
                  className={
                    styles.syncText
                  }
                >
                  • перевірка нових записів
                </span>
              )}
          </div>
        </div>


        <div
          className={
            styles.monthNavigation
          }
        >
          <button
            type="button"
            className={
              styles.iconButton
            }
            onClick={
              handlePreviousMonth
            }
            disabled={
              previousDisabled ||
              refreshing
            }
            title="Попередній місяць"
          >
            ←
          </button>

          {!journal.isCurrentMonth && (
            <button
              type="button"
              className={
                styles.currentMonthButton
              }
              onClick={
                handleCurrentMonth
              }
              disabled={
                refreshing
              }
            >
              Поточний місяць
            </button>
          )}

          <button
            type="button"
            className={
              styles.iconButton
            }
            onClick={
              handleNextMonth
            }
            disabled={
              journal.isCurrentMonth ||
              refreshing
            }
            title="Наступний місяць"
          >
            →
          </button>
        </div>
      </div>


      <div
        className={
          styles.toolbar
        }
      >
        <div
          className={
            styles.searchWrap
          }
        >
          <span
            className={
              styles.searchIcon
            }
          >
            ⌕
          </span>

          <input
            type="search"
            value={
              search
            }
            onChange={
              event =>
                setSearch(
                  event.target.value
                )
            }
            className={
              styles.searchInput
            }
            placeholder="Пошук за ID, лікарем, пацієнтом, статтею…"
          />
        </div>


        <select
          className={
            styles.select
          }
          value={
            typeFilter
          }
          onChange={
            event =>
              setTypeFilter(
                event.target.value
              )
          }
        >
          <option value="ALL">
            Усі типи
          </option>

          {operationTypes.map(
            value => (
              <option
                key={
                  value
                }
                value={
                  value
                }
              >
                {value}
              </option>
            )
          )}
        </select>


        <select
          className={
            styles.select
          }
          value={
            statusFilter
          }
          onChange={
            event =>
              setStatusFilter(
                event.target.value
              )
          }
        >
          <option value="ALL">
            Усі статуси
          </option>

          {statuses.map(
            value => (
              <option
                key={
                  value
                }
                value={
                  value
                }
              >
                {value}
              </option>
            )
          )}
        </select>


        <button
          type="button"
          className={
            styles.secondaryButton
          }
          onClick={
            handleRefresh
          }
          disabled={
            refreshing
          }
        >
          {refreshing
            ? "Оновлення…"
            : "↻ Оновити"}
        </button>


        <button
          type="button"
          className={
            styles.secondaryButton
          }
          onClick={
            handleExportCurrentMonth
          }
        >
          ↓ CSV місяця
        </button>
      </div>


      {error && (
        <div
          className={
            styles.inlineError
          }
        >
          {error}
        </div>
      )}


      {pendingRows.length >
        0 && (
        <button
          type="button"
          className={
            styles.newRowsButton
          }
          onClick={
            handleShowPending
          }
        >
          ↑ Нові операції:{" "}
          {pendingRows.length}
        </button>
      )}


      <div
        className={
          styles.resultLine
        }
      >
        Показано:

        {" "}

        <strong>
          {filteredRows.length}
        </strong>

        {" "}

        із

        {" "}

        <strong>
          {journal.rows.length}
        </strong>

        {" "}

        завантажених записів
      </div>


      <div
        ref={
          tableContainerRef
        }
        className={
          styles.tableContainer
        }
      >
        <table
          className={
            styles.table
          }
        >
          <thead>
            <tr>
              {journal.columns.map(
                column => (
                  <th
                    key={
                      column.key
                    }
                    className={
                      column.key ===
                        "operationId"
                        ? styles.stickyIdHeader
                        : undefined
                    }
                  >
                    {column.label}
                  </th>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {filteredRows.length ===
            0 ? (
              <tr>
                <td
                  colSpan={
                    journal.columns
                      .length
                  }
                  className={
                    styles.emptyCell
                  }
                >
                  Записів за вибраними умовами немає.
                </td>
              </tr>
            ) : (
              filteredRows.map(
                row => (
                  <tr
                    key={
                      getRowIdentity(
                        row
                      )
                    }
                  >
                    {journal.columns.map(
                      column => {
                        const value =
                          row.values[
                            column.key
                          ] ??
                          null;

                        return (
                          <td
                            key={
                              column.key
                            }
                            className={
                              column.key ===
                                "operationId"
                                ? styles.stickyIdCell
                                : CURRENCY_KEYS.has(
                                      column.key
                                    )
                                  ? styles.numericCell
                                  : undefined
                            }
                            title={
                              formatCellValue(
                                column,
                                value
                              )
                            }
                          >
                            {formatCellValue(
                              column,
                              value
                            )}
                          </td>
                        );
                      }
                    )}
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>


      <div
        className={
          styles.footer
        }
      >
        <span>
          Джерело:{" "}
          <strong>
            {journal.sourceSheet}
          </strong>
        </span>

        <span>
          Політика:{" "}
          <strong>
            {journal.policyVersion}
          </strong>
        </span>

        {journal.live ? (
          <span
            className={
              styles.liveFooter
            }
          >
            Автооновлення кожні 6 секунд
          </span>
        ) : (
          <span>
            Історичний місяць — автооновлення вимкнене
          </span>
        )}
      </div>
    </section>
  );
}