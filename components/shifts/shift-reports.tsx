
"use client";

import {
  useEffect,
  useState
} from "react";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from "lucide-react";

import {
  apiRequest,
  getApiErrorMessage
} from "@/lib/client/api-client";

import type {
  ShiftReportsData,
  ShiftReport
} from "@/lib/contracts/shift-reports";

import styles from "./shift-reports.module.css";

type Props = {
  active: boolean;
  activeYear: number;
  contextKey: string;
};

const MONTHS = [
  "Січень", "Лютий", "Березень",
  "Квітень", "Травень", "Червень",
  "Липень", "Серпень", "Вересень",
  "Жовтень", "Листопад", "Грудень"
];

const WEEKDAYS = [
  "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"
];

function daysInMonth(
  year: number,
  month: number
): number {
  return new Date(
    Date.UTC(year, month, 0)
  ).getUTCDate();
}

function weekdayOffset(
  year: number,
  month: number
): number {
  return (
    new Date(
      Date.UTC(year, month - 1, 1)
    ).getUTCDay() + 6
  ) % 7;
}

function money(value: number | null): string {
  return value === null
    ? "Немає даних"
    : new Intl.NumberFormat("uk-UA", {
        style: "currency",
        currency: "UAH",
        maximumFractionDigits: 2
      }).format(value);
}

function statusTone(status: string): string {
  if (
    status === "MATCHED" ||
    status === "Звірено"
  ) {
    return styles.matched;
  }

  if (
    status === "NEEDS_REVIEW" ||
    status === "Потребує уваги"
  ) {
    return styles.review;
  }

  return styles.unknown;
}

function reportVersion(
  report: ShiftReport
): number | null {
  const base =
    `SHIFT-${report.shiftDate.replace(/-/g, "")}`;

  if (report.shiftId === base) return 1;

  const match = new RegExp(
    `^${base}-V([0-9]{4})$`
  ).exec(report.shiftId);

  if (!match) return null;

  const value = Number(match[1]);
  return value >= 2 ? value : null;
}

function versionLabel(report: ShiftReport): string {
  const version = reportVersion(report);

  return version === null
    ? "Архівний звіт"
    : `Версія ${String(version).padStart(4, "0")}`;
}

function isLatestVersion(
  report: ShiftReport,
  reports: ShiftReport[]
): boolean {
  const version = reportVersion(report);

  if (version === null) return false;

  return !reports.some(other =>
    other.shiftDate === report.shiftDate &&
    (reportVersion(other) ?? 0) > version
  );
}

function ReportDetails({
  report,
  details,
  kpiDetails,
  reports
}: {
  report: ShiftReport;
  details: ShiftReportsData["details"];
  kpiDetails: NonNullable<ShiftReportsData["kpiDetails"]>;
  reports: ShiftReport[];
}) {
  const selectedKpis = kpiDetails.filter(
    row => String(row["ID звіту"] ?? "") === report.shiftId
  );

  return (
    <section className={styles.details}>
      <div className={styles.heading}>
        <div>
          <h3>Звіт {report.shiftId}</h3>
<p>
  {versionLabel(report)}
  {isLatestVersion(report, reports)
    ? " · Актуальна версія"
    : " · Архівна версія"}
</p>
<p>
  Дата зміни: {report.shiftDate}
            {" · "}
            Адміністратор: {report.administrator || "—"}
          </p>
        </div>

        <span
          className={`${styles.status} ${statusTone(report.status)}`}
        >
          {report.status || "Невідомий статус"}
        </span>
      </div>

      <div className={styles.metrics}>
        <div>
          <span>Надходження ProFin</span>
          <strong>{money(report.income)}</strong>
        </div>
        <div>
          <span>Розрахункова каса</span>
          <strong>{money(report.calculatedCash)}</strong>
        </div>
        <div>
          <span>Фактична каса</span>
          <strong>{money(report.actualCash)}</strong>
        </div>
        <div>
          <span>Різниця каси</span>
          <strong>{money(report.cashDifference)}</strong>
        </div>
        <div>
  <span>Нові клієнти ProFin</span>
  <strong>{report.newClients ?? "—"}</strong>
</div>
<div>
  <span>Операції для перевірки</span>
  <strong>{report.problemOperations ?? "—"}</strong>
</div>
      </div>

      <p>
        <strong>Нарахування: </strong>
        {report.accrualStatus || "Не перевірено"}
      </p>

      {report.warning && (
        <p className={styles.warning}>{report.warning}</p>
      )}

      {report.comment && (
        <p><strong>Коментар:</strong> {report.comment}</p>
      )}

      <h4>Деталізація рахунків</h4>

      {details.length === 0 ? (
        <p>Деталізацію для цього звіту не знайдено.</p>
      ) : (
        <div className={styles.detailRows}>
          {details.map((detail, index) => (
            <div
              key={`${report.shiftId}-${index}`}
              className={styles.detailRow}
            >
              {Object.entries(detail)
                .filter(([key, value]) =>
                  key !== "ID звіту" &&
                  key !== "Час подання звіту" &&
                  value !== null &&
                  value !== ""
                )
                .map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
            </div>
          
          ))}
        </div>
      )}

      <h4>Деталізація KPI</h4>

      {selectedKpis.length === 0 ? (
        <p>KPI для цієї версії не знайдено.</p>
      ) : (
        <div className={styles.detailRows}>
          {selectedKpis.map((row, index) => (
            <div
              key={`${report.shiftId}-kpi-${index}`}
              className={styles.detailRow}
            >
              {Object.entries(row)
                .filter(([key, value]) =>
                  key !== "ID звіту" &&
                  value !== null &&
                  value !== ""
                )
                .map(([key, value]) => (
                  <div key={key}>
                    <span>{key}</span>
                    <strong>{String(value)}</strong>
                  </div>
                ))}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}


export function ShiftReports({
  active,
  activeYear,
  contextKey
}: Props) {
  const today = new Date();

  const [year, setYear] = useState(activeYear);
  const [month, setMonth] = useState(
    today.getFullYear() === activeYear
      ? today.getMonth() + 1
      : 1
  );
  const [view, setView] = useState<"month" | "year">(
    "month"
  );

  const [selectedId, setSelectedId] = useState<string | null>(
    null
  );

const [focusedDate, setFocusedDate] =
  useState<string | null>(null);

  const [data, setData] = useState<ShiftReportsData | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setYear(activeYear);
    setMonth(
      new Date().getFullYear() === activeYear
        ? new Date().getMonth() + 1
        : 1
    );
    setSelectedId(null);
    setFocusedDate(null);
    setData(null);
    setError("");
  }, [activeYear, contextKey]);

  useEffect(() => {
    if (!active) return;

    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const params = new URLSearchParams({
          year: String(year),
          month: String(view === "year" ? 0 : month)
        });

        if (selectedId && view === "month") {
          params.set("shiftId", selectedId);
        }

        const response = await apiRequest<ShiftReportsData>(
          `/api/shifts/reports?${params.toString()}`,
          {
            method: "GET",
            signal: controller.signal
          }
        );

        if (!controller.signal.aborted) {
          setData(response.data);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(
            getApiErrorMessage(
              cause,
              "Не вдалося завантажити звіти."
            )
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [
    active,
    year,
    month,
    view,
    selectedId,
    refreshKey,
    contextKey
  ]);

  const goToMonth = (direction: number) => {
    let nextYear = year;
    let nextMonth = month + direction;

    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear--;
    }

    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }

    if (nextYear < 2000 || nextYear > 2100) return;

    setYear(nextYear);
    setMonth(nextMonth);
    setSelectedId(null);
    setFocusedDate(null);
  };

  const reportsByDay = new Map<string, ShiftReport[]>();

  for (const report of data?.reports ?? []) {
    const items = reportsByDay.get(report.shiftDate) ?? [];
    items.push(report);
    reportsByDay.set(report.shiftDate, items);
  }

  const visibleReports = (data?.reports ?? [])
    .filter(report =>
      !focusedDate || report.shiftDate === focusedDate
    )
    .slice()
    .sort((a, b) =>
      a.shiftDate.localeCompare(b.shiftDate) ||
      (reportVersion(a) ?? 0) -
        (reportVersion(b) ?? 0)
    );

    return (
    <section className={styles.page}>
      <div className={styles.heading}>
        <div>
          <h2>Звіт адміністратора</h2>
          <p>
            Історія закриття змін та контроль обліку
          </p>
        </div>

        <button
          type="button"
          className={styles.button}
          onClick={() => setRefreshKey(value => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={17} />
          Оновити
        </button>
      </div>

      <div className={styles.filters}>
        <label>
          Рік
          <select
            value={year}
            onChange={event => {
              setYear(Number(event.target.value));
              setSelectedId(null);
            }}
          >
            {[activeYear - 1, activeYear, activeYear + 1]
              .filter(value => value >= 2000 && value <= 2100)
              .map(value => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
        </label>

        {view === "month" && (
          <label>
            Місяць
            <select
              value={month}
              onChange={event => {
                setMonth(Number(event.target.value));
                setSelectedId(null);
              }}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index + 1}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={styles.tabs}>
          <button
            type="button"
            className={view === "month" ? styles.active : ""}
            onClick={() => {
              setView("month");
              setSelectedId(null);
            }}
          >
            Місяць
          </button>
          <button
            type="button"
            className={view === "year" ? styles.active : ""}
            onClick={() => {
              setView("year");
              setSelectedId(null);
            }}
          >
            Рік
          </button>
        </div>
      </div>

      {loading && (
        <p role="status">Завантаження звітів…</p>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!loading && !error && data && (
        <>
          {view === "month" ? (
            <>
              <div className={styles.heading}>
                <button
                  type="button"
                  onClick={() => goToMonth(-1)}
                  aria-label="Попередній місяць"
                >
                  <ChevronLeft />
                </button>

                <h3>{MONTHS[month - 1]} {year}</h3>

                <button
                  type="button"
                  onClick={() => goToMonth(1)}
                  aria-label="Наступний місяць"
                >
                  <ChevronRight />
                </button>
              </div>

              <div className={styles.calendar}>
                {WEEKDAYS.map(day => (
                  <div key={day} className={styles.weekday}>
                    {day}
                  </div>
                ))}

                {Array.from(
                  { length: weekdayOffset(year, month) },
                  (_, index) => (
                    <div key={`offset-${index}`} />
                  )
                )}

                {Array.from(
                  { length: daysInMonth(year, month) },
                  (_, index) => {
                    const day = index + 1;
                    const date =
                      `${year}-${String(month).padStart(2, "0")}` +
                      `-${String(day).padStart(2, "0")}`;

                    const items = reportsByDay.get(date) ?? [];
                    const hasReview = items.some(item =>
                      statusTone(item.status) === styles.review
                    );

                    return (
                      <button
                        type="button"
                        key={date}
                        className={`${styles.day} ${
                          items.length === 0
                            ? styles.empty
                            : hasReview
                              ? styles.review
                              : styles.matched
                        }`}
                        onClick={() => {
  setFocusedDate(date);

  setSelectedId(
    items.length === 1
      ? items[0].shiftId
      : null
  );
}}
aria-pressed={focusedDate === date}
disabled={items.length === 0}
                        title={
                          items.length
                            ? `${items.length} звіт(ів)`
                            : "Звіт відсутній"
                        }
                      >
                        <span>{day}</span>
                        {items.length > 0 && (
                          <small>{items.length} зв.</small>
                        )}
                      </button>
                    );
                  }
                )}
              </div>

              
<div className={styles.heading}>
  <h3>
    {focusedDate
      ? `Версії звітів за ${focusedDate}`
      : "Звіти за місяць"}
  </h3>

  {focusedDate && (
    <button
      type="button"
      className={styles.button}
      onClick={() => {
        setFocusedDate(null);
        setSelectedId(null);
      }}
    >
      Показати всі дати
    </button>
  )}
</div>

<div className={styles.reportList}>
  {visibleReports.length === 0 ? (
    <p>Збережених звітів не знайдено.</p>
  ) : (
    visibleReports.map(report => (
      <button
        type="button"
        key={report.shiftId}
        className={styles.reportItem}
        aria-pressed={selectedId === report.shiftId}
        title={report.shiftId}
        onClick={() => setSelectedId(report.shiftId)}
      >
        <CalendarDays size={17} />

        <span>
          {report.shiftDate}
          {" · "}
          {versionLabel(report)}
          {isLatestVersion(report, data.reports)
            ? " · Актуальна"
            : ""}
          {" · "}
          {report.administrator || "—"}
        </span>

        <span
          className={`${styles.status} ${
            statusTone(report.status)
          }`}
        >
          {report.status || "Без статусу"}
        </span>
      </button>
    ))
  )}
</div>

            </>
          ) : (
            <div className={styles.yearGrid}>
              {data.summary.months.map(item => (
                <button
                  key={item.month}
                  type="button"
                  className={styles.yearCard}
                  onClick={() => {
                    setMonth(item.month);
                    setView("month");
                  }}
                >
                  <strong>{MONTHS[item.month - 1]}</strong>
                  <span>Звітів: {item.reports}</span>
                  <span>Звірено: {item.matched}</span>
                  <span>Уваги: {item.needsReview}</span>
                </button>
              ))}
            </div>
          )}

          {data.selectedReport && (
          <ReportDetails
          report={data.selectedReport}
          details={data.details}
          kpiDetails={data.kpiDetails ?? []}
          reports={data.reports}
          />
          )}
        </>
            )}
    </section>
  );
}
