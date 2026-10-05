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
  12000;


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
  active:
    boolean;

  onAdapterReady?:
    () => void;
};


export default function OperationJournal({
  active,
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


  /*
   * Номер поточного INITIAL / REFRESH.
   *
   * Якщо старий запит був abort,
   * він уже не зможе змінити state
   * після старту нового запиту.
   */
  const loadGenerationRef =
    useRef(
      0
    );


  /*
   * PATCH 47
   *
   * Один активний HTTP-запит Journal.
   * При виході з Journal він
   * буде скасований.
   */
  const activeRequestControllerRef =
    useRef<AbortController | null>(
      null
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
/*
       * React Strict Mode у dev:
       * setup → cleanup → setup.
       *
       * Тому при кожному setup
       * обов'язково повертаємо true.
       */

        useEffect(
    () => {
      mountedRef.current =
        true;


      return () => {
        mountedRef.current =
          false;


        activeRequestControllerRef
          .current
          ?.abort();


        activeRequestControllerRef.current =
          null;
      };
    },
    []
  );


    /*
   * PATCH 47
   * RESOURCE RACE GUARD
   *
   * Journal залишається змонтованим.
   *
   * При виході:
   * - abort поточного HTTP;
   * - зупинка polling;
   * - invalidation старого loadMonth;
   * - уже отримані rows залишаються в RAM.
   */
  useEffect(
    () => {
      if (
        active
      ) {
        return;
      }


      /*
       * Робимо всі старі loadMonth
       * неактуальними.
       */
      loadGenerationRef.current +=
        1;


      activeRequestControllerRef
        .current
        ?.abort();


      activeRequestControllerRef.current =
        null;


      pollRequestRunningRef.current =
        false;


      setPolling(
        false
      );


      setRefreshing(
        false
      );


      /*
       * Якщо INITIAL був перерваний
       * до отримання journal,
       * при поверненні дозволяємо
       * новий INITIAL.
       */
      if (
        !journalRef.current
      ) {
        initialLoadStartedRef.current =
          false;

        setLoading(
          false
        );
      }
    },
    [
      active
    ]
  );


    const requestJournal =
    useCallback(
      async (
        url:
          string
      ): Promise<OperationJournalData> => {
        /*
         * Одночасно Journal має
         * максимум один HTTP request.
         *
         * Новий request скасовує старий.
         */
        activeRequestControllerRef
          .current
          ?.abort();


        const controller =
          new AbortController();


        activeRequestControllerRef.current =
          controller;


        let timedOut =
          false;


        const timeoutId =
          window.setTimeout(
            () => {
              timedOut =
                true;

              controller.abort();
            },
            30000
          );


        try {
          const response =
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
           * Якщо Journal отримав
           * валідну відповідь,
           * Apps Script adapter працює.
           */
          onAdapterReady?.();


          return payload.data;
        } catch (
          requestError
        ) {
          if (
            requestError instanceof DOMException &&
            requestError.name ===
              "AbortError"
          ) {
            /*
             * Abort саме через timeout.
             */
            if (
              timedOut
            ) {
              throw new Error(
                "Журнал не відповів протягом 30 секунд. Спробуйте оновити ще раз."
              );
            }


            /*
             * Нормальний abort:
             *
             * Journal → Cash
             * DELTA → Refresh
             * старий request → новий request
             */
            throw requestError;
          }


          throw requestError;
        } finally {
          window.clearTimeout(
            timeoutId
          );


          /*
           * Старий request не має права
           * очистити controller нового.
           */
          if (
            activeRequestControllerRef.current ===
              controller
          ) {
            activeRequestControllerRef.current =
              null;
          }
        }
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
        const generation =
          loadGenerationRef.current +
          1;


        loadGenerationRef.current =
          generation;


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


          /*
           * Цей request уже застарів.
           */
          if (
            generation !==
              loadGenerationRef.current
          ) {
            return;
          }


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
          /*
           * Abort через перемикання
           * модулів — штатна подія.
           */
          if (
            requestError instanceof DOMException &&
            requestError.name ===
              "AbortError"
          ) {
            return;
          }


          /*
           * Старий request уже не має
           * права показувати error.
           */
          if (
            generation !==
              loadGenerationRef.current
          ) {
            return;
          }


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
          /*
           * Тільки останній актуальний
           * request може керувати spinner.
           */
          if (
            mountedRef.current &&
            generation ===
              loadGenerationRef.current
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
       * Journal прихований —
       * взагалі не займаємо
       * Apps Script ресурс.
       */
      if (
        !active
      ) {
        return;
      }


      /*
       * Якщо дані вже є —
       * повторний INITIAL
       * не потрібен.
       */
      if (
        journalRef.current
      ) {
        return;
      }


      /*
       * React Strict Mode guard.
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
      active,
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
                } catch (
          requestError
        ) {
          /*
           * При Journal → Cash
           * DELTA штатно отримує AbortError.
           *
           * Його користувачу не показуємо.
           */
          if (
            requestError instanceof DOMException &&
            requestError.name ===
              "AbortError"
          ) {
            return;
          }


          /*
           * Інші polling-помилки теж
           * залишаємо silent:
           *
           * уже завантажений Journal
           * не повинен зникати.
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
        !active ||
        !journal?.live
      ) {
        return;
      }


      /*
       * При поверненні у Journal
       * одразу робимо один DELTA.
       *
       * Повний місяць повторно
       * не завантажуємо.
       */
      void pollDelta();


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
    active,
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
            Автооновлення кожні 12 секунд
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