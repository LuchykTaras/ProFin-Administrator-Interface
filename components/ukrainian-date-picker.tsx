"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import styles from "./ukrainian-date-picker.module.css";

// Every calendar label is owned by the application, not the OS/Chrome locale.
// The value passed to the API always stays in ISO yyyy-MM-dd format.
const MONTHS = [
  "січень", "лютий", "березень", "квітень", "травень", "червень",
  "липень", "серпень", "вересень", "жовтень", "листопад", "грудень"
] as const;

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"] as const;
const YEARS = Array.from({ length: 201 }, (_, index) => 1900 + index);

type UkrainianDatePickerProps = {
  value: string;
  onChange: (date: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  ariaLabel?: string;
};

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

function today(): Date {
  const now = new Date();
  return utcDate(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = utcDate(year, month, day);

  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month &&
    date.getUTCDate() === day ? date : null;
}

function toIso(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

function toDisplay(value: string): string {
  const date = parseIso(value);
  return date
    ? String(date.getUTCDate()).padStart(2, "0") + "." +
      String(date.getUTCMonth() + 1).padStart(2, "0") + "." +
      date.getUTCFullYear()
    : "";
}

function fromDisplay(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const result = [
    match[3], match[2], match[1]
  ].join("-");
  return parseIso(result) ? result : null;
}

function permitted(value: string, min?: string, max?: string): boolean {
  return (!min || value >= min) && (!max || value <= max);
}

export function UkrainianDatePicker({
  value,
  onChange,
  disabled = false,
  min,
  max,
  ariaLabel = "Дата"
}: UkrainianDatePickerProps) {
  const [typed, setTyped] = useState(() => toDisplay(value));
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => parseIso(value) || today());
  const [position, setPosition] = useState({ top: 8, left: 8 });
  const [invalid, setInvalid] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setTyped(toDisplay(value));
    setInvalid(false);
  }, [value]);

  useEffect(() => {
    if (!disabled) return;
    setOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (!open) return;

    function movePanel() {
      const bounds = rootRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = Math.min(344, window.innerWidth - 16);
      const height = Math.min(400, window.innerHeight - 16);
      const below = bounds.bottom + 8;
      setPosition({
        left: Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8)),
        top: below + height <= window.innerHeight - 8
          ? below
          : Math.max(8, bounds.top - height - 8)
      });
    }

    function dismiss(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!rootRef.current?.contains(target) &&
          !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    movePanel();
    window.addEventListener("resize", movePanel);
    window.addEventListener("scroll", movePanel, true);
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("resize", movePanel);
      window.removeEventListener("scroll", movePanel, true);
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const year = view.getUTCFullYear();
  const month = view.getUTCMonth();
  const firstDay = (utcDate(year, month, 1).getUTCDay() + 6) % 7;
  const daysInMonth = utcDate(year, month + 1, 0).getUTCDate();
  const count = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  const currentIso = toIso(today());

  function choose(iso: string) {
    if (!permitted(iso, min, max)) return;
    onChange(iso);
    setTyped(toDisplay(iso));
    setInvalid(false);
    setOpen(false);
  }

  function updateTyped(text: string) {
    setTyped(text);
    setInvalid(false);
    if (text.trim() === "") {
      onChange("");
      return;
    }
    const iso = fromDisplay(text);
    if (iso && permitted(iso, min, max)) onChange(iso);
  }

  function settleTyped() {
    if (!typed.trim()) return;
    const iso = fromDisplay(typed);
    if (!iso || !permitted(iso, min, max)) {
      setInvalid(true);
      setTyped(toDisplay(value));
    }
  }

  function showCalendar() {
    if (disabled) return;
    if (!open) setView(parseIso(value) || today());
    setOpen(!open);
  }

  return (
    <div className={styles.control} ref={rootRef} lang="uk">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        lang="uk-UA"
        aria-label={ariaLabel + " (дд.мм.рррр)"}
        aria-invalid={invalid}
        className={styles.dateText}
        value={typed}
        placeholder="дд.мм.рррр"
        disabled={disabled}
        onChange={(event) => updateTyped(event.target.value)}
        onBlur={settleTyped}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "ArrowDown" && event.altKey) {
            event.preventDefault();
            showCalendar();
          }
        }}
      />
      <button
        type="button"
        className={styles.openButton}
        aria-label={"Відкрити календар: " + ariaLabel}
        aria-expanded={open}
        disabled={disabled}
        onClick={showCalendar}
      >
        <CalendarDays size={18} aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className={styles.panel}
          lang="uk-UA"
          role="dialog"
          aria-label={"Календар: " + ariaLabel}
          style={{ top: position.top, left: position.left }}
        >
          <div className={styles.heading}>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Попередній місяць"
              onClick={() => setView(utcDate(year, month - 1, 1))}
            >
              <ChevronLeft size={19} />
            </button>
            <select
              className={styles.month}
              aria-label="Місяць"
              value={month}
              onChange={(event) => setView(utcDate(year, Number(event.target.value), 1))}
            >
              {MONTHS.map((name, index) => (
                <option key={name} value={index}>
                  {name.charAt(0).toUpperCase() + name.slice(1)}
                </option>
              ))}
            </select>
            <select
              className={styles.year}
              aria-label="Рік"
              value={year}
              onChange={(event) => setView(utcDate(Number(event.target.value), month, 1))}
            >
              {YEARS.map((number) => (
                <option key={number} value={number}>{number}</option>
              ))}
            </select>
            <button
              type="button"
              className={styles.arrow}
              aria-label="Наступний місяць"
              onClick={() => setView(utcDate(year, month + 1, 1))}
            >
              <ChevronRight size={19} />
            </button>
          </div>

          <div className={styles.days} role="grid" aria-label="Дні місяця">
            {WEEKDAYS.map((weekday) => (
              <span key={weekday} className={styles.weekday}>{weekday}</span>
            ))}
            {Array.from({ length: count }, (_, i) => {
              const day = i - firstDay + 1;
              if (day < 1 || day > daysInMonth) {
                return <span key={"empty-" + i} className={styles.empty} />;
              }
              const iso = toIso(utcDate(year, month, day));
              const selected = iso === value;
              return (
                <button
                  key={iso}
                  type="button"
                  className={[
                    styles.day,
                    selected ? styles.selected : "",
                    iso === currentIso ? styles.today : ""
                  ].filter(Boolean).join(" ")}
                  aria-label={day + " " + MONTHS[month] + " " + year + " року"}
                  aria-pressed={selected}
                  disabled={!permitted(iso, min, max)}
                  onClick={() => choose(iso)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              disabled={!permitted(currentIso, min, max)}
              onClick={() => choose(currentIso)}
            >
              Сьогодні
            </button>
            <button type="button" onClick={() => {
              onChange("");
              setTyped("");
              setInvalid(false);
              setOpen(false);
            }}>
              Очистити
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
