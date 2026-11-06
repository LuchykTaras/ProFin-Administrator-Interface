
"use client";

import { useEffect, useRef, useState } from "react";

import {
  apiRequest,
  getApiErrorMessage
} from "@/lib/client/api-client";

import { ShiftReports } from "@/components/shifts/shift-reports";

import styles from "./shift-closing-workspace.module.css";

type Props = {
  active: boolean;
  activeYear: number;
  contextKey: string;
  branch: string;
  administrator: string;
};

const KPI = [
  { key: "dailyReceipts", label: "Надходження за день, грн", unit: "UAH" },
  {
  key: "uniqueClients",
  label: "Унікальні клієнти за день",
  unit: "COUNT"
},
  { key: "paidConsultations", label: "Платні консультації ProFin", unit: "COUNT" },
  { key: "vaccinesSold", label: "Продані вакцини", unit: "COUNT" },
  { key: "vaccinesAdministered", label: "Зроблені вакцинації", unit: "COUNT" },
  { key: "packagesSold", label: "Продані пакети", unit: "COUNT" },
  { key: "newClients", label: "Нові клієнти", unit: "COUNT" }
] as const;


type ShiftPreviewProbe = {
  date: string;
  transport: "OK";
  snapshotAvailable: false;
  snapshotStatus: "UNVERIFIED_EXTERNAL_CONTRACT";
  metrics: null;
  accounts: null;
  canSubmit: false;
};


const ACCOUNTS = [
  { key: "cash", name: "Каса, грн", title: "Каса" },
  { key: "abank", name: "Рахунок А-Банк, грн", title: "А-Банк" },
  { key: "mono", name: "Рахунок Моно, грн", title: "Моно" },
  { key: "safe", name: "Сейф", title: "Сейф" }
] as const;

function ShiftClosingForm({
  branch,
  administrator
}: Pick<Props, "branch" | "administrator">) {
  
  const [shiftDate, setShiftDate] = useState("");
  const [comment, setComment] = useState("");
  const [checking, setChecking] = useState(false);

  const [readStatus, setReadStatus] = useState(
    "Оберіть дату для перевірки з'єднання."
  );

  const activeRequest = useRef<AbortController | null>(
    null
  );

  useEffect(() => {
    return () => activeRequest.current?.abort();
  }, []);

  async function checkServerRead() {
    if (!shiftDate) {
      setReadStatus("Спочатку оберіть дату зміни.");
      return;
    }

    activeRequest.current?.abort();

    const controller = new AbortController();
    activeRequest.current = controller;

    setChecking(true);
    setReadStatus("Перевірка захищеного з'єднання…");

    try {
      const response = await apiRequest<ShiftPreviewProbe>(
        `/api/shifts/preview?date=${encodeURIComponent(shiftDate)}`,
        {
          method: "GET",
          signal: controller.signal
        }
      );

      if (controller.signal.aborted) return;

      setReadStatus(
        response.data?.transport === "OK" &&
        response.data.snapshotAvailable === false
          ? "Apps Script доступний. Контракт читання 7 KPI та 4 рахунків ще не підтверджено."
          : "Snapshot не перевірено. Значення недоступні."
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setReadStatus(
          getApiErrorMessage(
            error,
            "Не вдалося перевірити доступність Apps Script."
          )
        );
      }
    } finally {
      if (!controller.signal.aborted) {
        setChecking(false);
        activeRequest.current = null;
      }
    }
  }

  return (

    <div className={styles.canvas}>
      <div className={styles.shell}>
        <section className={styles.surface}>
          <header className={styles.mast}>
            <h1>PROFIN OS · ЗАКРИТТЯ ЗМІНИ</h1>
            <p>{branch}</p>
          </header>

          <div className={styles.summary}>
            <div className={styles.metadata}>
              <div>
                <label className={styles.fieldLabel} htmlFor="shiftDate">
                  Дата зміни
                </label>
                <input
                  id="shiftDate"
                  type="date"
                  value={shiftDate}
                                    onChange={event => {
                    activeRequest.current?.abort();
                    activeRequest.current = null;
                    setChecking(false);
                    setReadStatus(
                      "Оберіть дату для перевірки з'єднання."
                    );
                    setShiftDate(event.target.value);
                    setComment("");
                  }}
                  aria-label="Дата зміни"
                />
              </div>
              <div>
                <label className={styles.fieldLabel} htmlFor="administrator">
                  Адміністратор
                </label>
                <input
                  id="administrator"
                  value={administrator}
                  readOnly
                  aria-label="Авторизований адміністратор"
                />
              </div>
              <div>
                <div className={styles.fieldLabel}>Дата та час подання</div>
                <div className={styles.value}>—</div>
              </div>
              <div>
                <div className={styles.fieldLabel}>Статус звіту</div>
                <span className={styles.statusPill}>Не перевірено</span>
              </div>
            </div>

            <div className={styles.rule} />
            <p className={styles.explain}>
              Далі — сім показників, звірка чотирьох рахунків,
              розбіжності та коментар адміністратора.
            </p>
            <div className={styles.controlbar}>
                            <button
                type="button"
                className={styles.btnDark}
                disabled={!shiftDate || checking}
                onClick={() => void checkServerRead()}
              >
                ↻ Завантажити дані ProFin
              </button>
              <span
                className={styles.statusLine}
                role="status"
                aria-live="polite"
              >
                {readStatus}
              </span>
            </div>
            <div className={styles.warn} role="status">
            R1-01 перевіряє тільки захищене з'єднання. Дані 7 KPI і 4 рахунків
              недоступні без затвердженої зовнішньої команди. Підтвердження
              та подання залишаються заблокованими.
            </div>
          </div>
        </section>

        <div className={styles.sections}>
          <div className={styles.sectionHeading}>
            <h2>01 / Звірка показників</h2>
            <span className={styles.progress}>0 із 7 підтверджено</span>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressBar} style={{ width: "0%" }} />
          </div>

          {KPI.map((metric, index) => (
            <div className={styles.card} key={metric.key}>
              <div className={styles.cardTop}>
                <h3 className={styles.cardTitle}>
                  {index + 1}. {metric.label}
                </h3>
                <span className={styles.statusPill}>Не перевірено</span>
              </div>
              <div className={styles.eyebrow}>За даними ProFin</div>
              <div className={styles.metricAuto}>—</div>
              <div className={styles.actions}>
                <button type="button" disabled>✓ Підтверджую</button>
                <button type="button" disabled>✎ Коригувати</button>
              </div>
              <div className={styles.editFields} hidden>
                <label htmlFor={`kpi_${metric.key}`}>Фактичне значення</label>
                <input
                  id={`kpi_${metric.key}`}
                  type="number"
                  min="0"
                  step={metric.unit === "UAH" ? "0.01" : "1"}
                  placeholder="Введіть значення"
                  disabled
                />
                <label htmlFor={`knote_${metric.key}`}>Причина коригування</label>
                <textarea
                  id={`knote_${metric.key}`}
                  rows={2}
                  maxLength={500}
                  placeholder="Опишіть причину відхилення"
                  disabled
                />
              </div>
            </div>
          ))}

          <div className={styles.banner}>ЗВІРКА РАХУНКІВ ЗА ЗМІНУ</div>
          <p className={styles.note}>
            Показники нижче надходять із ProFin OS. Розрахунковий залишок
            повертає тільки сервер Apps Script.
          </p>

          <div className={styles.card} hidden>
            <strong>Початкові залишки для першого офіційного звіту</strong>
            <p className={styles.note}>
              Не беріть їх із тестових записів. Підтвердити стартові залишки
              може тільки власник.
            </p>
            <div className={styles.initialGrid}>
              {ACCOUNTS.map(account => (
                <div key={account.key}>
                  <label htmlFor={`initial_${account.key}`}>{account.name}</label>
                  <input
                    id={`initial_${account.key}`}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Введіть значення"
                    disabled
                  />
                </div>
              ))}
            </div>
            <label className={styles.confirmLine}>
              <input type="checkbox" disabled />
              Підтверджую початкові залишки всіх чотирьох рахунків
            </label>
          </div>

          {ACCOUNTS.map(account => (
            <div className={`${styles.card} ${styles.account}`} key={account.key}>
              <div className={styles.cardTop}>
                <h3 className={styles.accountTitle}>{account.title}</h3>
                <span className={styles.statusPill}>Не перевірено</span>
              </div>
              <div className={styles.accountBalanceRow}>
                {[
                  "На початок",
                  "Надходження",
                  "Виплати"
                ].map(label => (
                  <div key={label}>
                    <div className={styles.accountSmallLabel}>{label}</div>
                    <div className={styles.accountSmallValue}>—</div>
                  </div>
                ))}
              </div>
              <p className={styles.note}>Перекази: +— / −—</p>
              <div className={styles.accountExpected}>
                <span>Залишок за ProFin</span>
                <strong>—</strong>
              </div>
              <div className={styles.accountEntry}>
                <label htmlFor={`actual_${account.key}`}>
                  Фактичний залишок на кінець зміни, грн
                </label>
                <input
                  id={`actual_${account.key}`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Введіть значення"
                  disabled
                />
                <label className={styles.confirmLine}>
                  <input type="checkbox" disabled />
                  Підтверджую збіг із ProFin
                </label>
                <div className={styles.correction} hidden>
                  <label htmlFor={`anote_${account.key}`}>
                    Коментар / причина коригування
                  </label>
                  <textarea
                    id={`anote_${account.key}`}
                    rows={2}
                    maxLength={500}
                    placeholder="Причина розбіжності"
                    disabled
                  />
                </div>
              </div>
            </div>
          ))}

          <div className={styles.controlbar}>
            <button type="button" disabled>Розрахувати залишки ProFin</button>
          </div>

          <section className={`${styles.surface} ${styles.commentPanel}`}>
            <h2>Коментар адміністратора та висновок</h2>
            <label className={styles.fieldLabel} htmlFor="comment">
              Коментар адміністратора
            </label>
            <textarea
              id="comment"
              rows={3}
              maxLength={2000}
              placeholder="За потреби опишіть особливості зміни"
              value={comment}
              onChange={event => setComment(event.target.value)}
            />
            <div className={styles.controlbar}>
              <button type="button" className={styles.btnDark} disabled>
                Перевірити звіт
              </button>
              <span className={styles.conclusion} />
            </div>
            <p className={styles.note}>
              За наявності коригувань потрібна причина. Підсумковий статус
              і всі різниці визначає сервер. Перевірка не записує звіт.
            </p>
          </section>
        </div>

        <footer className={styles.foot}>
          <span className={styles.note}>
            7 показників · 4 рахунки · єдиний серверний запис
          </span>
          <button type="button" className={styles.btnGreen} disabled>
            Подати звіт
          </button>
        </footer>
      </div>
    </div>
  );
}

export function ShiftClosingWorkspace({
  active,
  activeYear,
  contextKey,
  branch,
  administrator
}: Props) {
  const [tab, setTab] = useState<"form" | "history">("form");

  return (
    <section className={styles.workspace}>
      <div className={styles.workspaceTabs} role="tablist" aria-label="Закриття зміни">
        <button
          type="button"
          role="tab"
          id="shift-form-tab"
          aria-selected={tab === "form"}
          aria-controls="shift-form-panel"
          className={tab === "form" ? styles.tabActive : styles.tab}
          onClick={() => setTab("form")}
        >
          Подати щоденний звіт
        </button>
        <button
          type="button"
          role="tab"
          id="shift-history-tab"
          aria-selected={tab === "history"}
          aria-controls="shift-history-panel"
          className={tab === "history" ? styles.tabActive : styles.tab}
          onClick={() => setTab("history")}
        >
          Історія звітів
        </button>
      </div>
      <div
        id="shift-form-panel"
        role="tabpanel"
        aria-labelledby="shift-form-tab"
        hidden={tab !== "form"}
      >
        {tab === "form" && (
          <ShiftClosingForm
            key={contextKey}
            branch={branch}
            administrator={administrator}
          />
        )}
      </div>
      <div
        id="shift-history-panel"
        role="tabpanel"
        aria-labelledby="shift-history-tab"
        hidden={tab !== "history"}
      >
        {tab === "history" && (
          <ShiftReports
            active={active}
            activeYear={activeYear}
            contextKey={contextKey}
          />
        )}
      </div>
    </section>
  );
}
