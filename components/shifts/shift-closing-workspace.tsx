"use client";

import { useEffect, useRef, useState } from "react";

import {
  apiRequest,
  getApiErrorMessage
} from "@/lib/client/api-client";

import { ShiftReports } from "@/components/shifts/shift-reports";

import {
  ShiftGoogleValidation
} from "@/components/shifts/shift-google-validation";

import type {
  ShiftReportSubmissionDraft
} from "@/lib/contracts/shift-report-submission";

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
  label: "Загальні візити (унікальні клієнти)",
  unit: "COUNT"
},
  { key: "paidConsultations", label: "Платні консультації ProFin", unit: "COUNT" },
  { key: "vaccinesSold", label: "Продані вакцини", unit: "COUNT" },
  { key: "vaccinesAdministered", label: "Зроблені вакцинації", unit: "COUNT" },
  { key: "packagesSold", label: "Продані пакети", unit: "COUNT" },
  { key: "newClients", label: "Нові клієнти", unit: "COUNT" }
] as const;


type FinancialAccount = {
  name: string;
  opening: number | null;
  receipts: number;
  payouts: number;
  transferIn: number;
  transferOut: number;
};

type FinancialSnapshot = {
  date: string;
  revision: string;
  initialBalancesRequired: boolean;
  metrics: Array<{
    key: string;
    auto: number;
  }>;
  accounts: FinancialAccount[];
};

type SecureReadData = {
  decision: "READ_ONLY";
  identityLinkVerified: true;
  appsScriptAclVerified: true;
  snapshot: FinancialSnapshot;
  canSubmit: false;
};

type ShiftAclData = {
  decision: "PASS";
  isOwner: boolean;
  identityLinkVerified: true;
  appsScriptAclVerified: true;
  canSubmit: false;
};


const ACCOUNTS = [
  { key: "cash", name: "Каса, грн", title: "Каса" },
  { key: "abank", name: "Рахунок А-Банк, грн", title: "А-Банк" },
  { key: "mono", name: "Рахунок Моно, грн", title: "Моно" },
    { key: "safe", name: "Сейф", title: "Сейф" }
] as const;

function formatValue(
  value: number,
  unit: "UAH" | "COUNT"
): string {
  const precision = unit === "UAH" ? 2 : 0;

  const formatted = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  }).format(value);

  return unit === "UAH"
    ? `${formatted} грн`
    : formatted;
}

function metricValue(
  snapshot: FinancialSnapshot | null,
  key: string,
  unit: "UAH" | "COUNT"
): string {
  const value = snapshot?.metrics.find(
    item => item.key === key
  )?.auto;

  return typeof value === "number" &&
    Number.isFinite(value)
    ? formatValue(value, unit)
    : "—";
}

function accountValue(
  snapshot: FinancialSnapshot | null,
  name: string,
  field: keyof Omit<FinancialAccount, "name">
): string {
  const value = snapshot?.accounts.find(
    item => item.name === name
  )?.[field];

  return typeof value === "number" &&
    Number.isFinite(value)
    ? formatValue(value, "UAH")
    : "—";
}

function ShiftClosingForm({
  branch,
  administrator
}: Pick<Props, "branch" | "administrator">) {
  
  const [shiftDate, setShiftDate] = useState("");
  const [comment, setComment] = useState("");
  const [checking, setChecking] = useState(false);


const [snapshot, setSnapshot] =
  useState<FinancialSnapshot | null>(null);

const [kpiEntries, setKpiEntries] = useState<
  Record<string, {
    mode: "CONFIRMED" | "CORRECTED";
    actual: string;
    comment: string;
  }>
>({});

const [accountEntries, setAccountEntries] = useState<
  Record<string, {
    actualEnd: string;
    comment: string;
  }>
>({});

const [validationStatus, setValidationStatus] =
  useState("");

const [
  verifiedDraftFingerprint,
  setVerifiedDraftFingerprint
] = useState<string | null>(null);

const [officialReportSent, setOfficialReportSent] =
  useState(false);

const [openingEntries, setOpeningEntries] =
  useState<Record<string, string>>({});

const [confirmInitialBalances, setConfirmInitialBalances] =
  useState(false);

const [ownerVerified, setOwnerVerified] =
  useState(false);

const [readStatus, setReadStatus] = useState(
  "Оберіть дату для завантаження фінансових даних."
);


  const activeRequest = useRef<AbortController | null>(
    null
  );

    useEffect(() => {
    return () => activeRequest.current?.abort();
  }, []);

  
const completedKpis = KPI.filter(metric => {
  if (!snapshot) return false;

  const entry = kpiEntries[metric.key];

  const auto = snapshot.metrics.find(
    item => item.key === metric.key
  )?.auto;

  if (
    !entry ||
    typeof auto !== "number" ||
    !Number.isFinite(auto)
  ) {
    return false;
  }

  if (entry.mode === "CONFIRMED") {
    return (
      entry.actual.trim() !== "" &&
      Number(entry.actual) === auto
    );
  }

  const value = entry.actual.trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return false;
  }

  const actual = Number(value);

  return (
    Number.isFinite(actual) &&
    actual >= 0 &&
    (metric.unit === "UAH" || Number.isInteger(actual)) &&
    entry.comment.trim().length > 0
  );
}).length;


function parseOpeningBalance(
  raw: string | undefined
): number | null {
  const value = raw?.trim() ?? "";

  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const amount = Number(value);

  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 1e10
  ) {
    return null;
  }

  return amount;
}

function buildReportDraft():
  ShiftReportSubmissionDraft | null {

  if (
    !snapshot ||
    snapshot.date !== shiftDate ||
    checking ||
    completedKpis !== KPI.length
  ) {
    return null;
  }

  const metrics =
    {} as ShiftReportSubmissionDraft["metrics"];

  for (const metric of KPI) {
    const entry = kpiEntries[metric.key];

    const auto = snapshot.metrics.find(
      item => item.key === metric.key
    )?.auto;

    if (
      !entry ||
      typeof auto !== "number" ||
      !Number.isFinite(auto)
    ) {
      return null;
    }

    const raw = entry.actual.trim();

    if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
      return null;
    }

    const actual = Number(raw);

    if (
      !Number.isFinite(actual) ||
      actual < 0 ||
      actual > 1e10
    ) {
      return null;
    }

    if (
      metric.unit === "COUNT" &&
      !Number.isInteger(actual)
    ) {
      return null;
    }

    if (
      entry.mode === "CONFIRMED" &&
      actual !== auto
    ) {
      return null;
    }

    if (
      entry.mode === "CORRECTED" &&
      !entry.comment.trim()
    ) {
      return null;
    }

    metrics[metric.key] = {
      actual,
      comment: entry.comment.trim()
    };
  }

  const accounts =
    {} as ShiftReportSubmissionDraft["accounts"];

  for (const account of ACCOUNTS) {
    const entry = accountEntries[account.name];

    const raw = entry?.actualEnd.trim() ?? "";

    if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) {
      return null;
    }

    const actualEnd = Number(raw);

    if (
      !Number.isFinite(actualEnd) ||
      Math.abs(actualEnd) > 1e10
    ) {
      return null;
    }

    if (
      (account.key === "cash" ||
        account.key === "safe") &&
      actualEnd < 0
    ) {
      return null;
    }

    accounts[account.name] = {
      actualEnd,
      comment: entry?.comment.trim() ?? ""
    };
  }

  const draft: ShiftReportSubmissionDraft = {
    date: shiftDate,
    revision: snapshot.revision,
    metrics,
    accounts,
    comment: comment.trim()
  };

  if (!snapshot.initialBalancesRequired) {
    return draft;
  }

  const initialBalances =
    {} as NonNullable<
      ShiftReportSubmissionDraft["initialBalances"]
    >;

  for (const account of ACCOUNTS) {
    const opening = parseOpeningBalance(
      openingEntries[account.name]
    );

    if (opening === null) {
      return null;
    }

    initialBalances[account.name] = opening;
  }

  if (
    !ownerVerified ||
    !confirmInitialBalances
  ) {
    return null;
  }

  return {
    ...draft,
    initialBalances,
    confirmInitialBalances: true
  };
}

const draftCandidate = buildReportDraft();

const draftFingerprint = draftCandidate
  ? JSON.stringify(draftCandidate)
  : null;

const draftReady = draftCandidate !== null;

const submitReady =
  draftFingerprint !== null &&
  verifiedDraftFingerprint === draftFingerprint &&
  !officialReportSent;


function checkFormLocally() {
  if (!snapshot || snapshot.date !== shiftDate) {
    setValidationStatus(
      "Спочатку завантажте актуальні фінансові дані."
    );
    return;
  }

  if (completedKpis !== KPI.length) {
    setValidationStatus(
      `Опрацьовано ${completedKpis} із ${KPI.length} KPI.`
    );
    return;
  }

  const invalidAccount = ACCOUNTS.find(account => {
    const value =
      accountEntries[account.name]?.actualEnd?.trim();

    if (
      !value ||
      !/^-?\d+(?:\.\d{1,2})?$/.test(value)
    ) {
      return true;
    }

    const amount = Number(value);

    return (
      !Number.isFinite(amount) ||
      Math.abs(amount) > 1e10 ||
      (
        (account.key === "cash" ||
          account.key === "safe") &&
        amount < 0
      )
    );
  });

  if (invalidAccount) {
    setValidationStatus(
      `Перевірте фактичний залишок: ${invalidAccount.title}.`
    );
    return;
  }

  if (snapshot.initialBalancesRequired) {
  const missingOpening = ACCOUNTS.find(
    account =>
      parseOpeningBalance(
        openingEntries[account.name]
      ) === null
  );

  if (missingOpening) {
    setValidationStatus(
      `Введіть початковий залишок: ${missingOpening.title}.`
    );
    return;
  }

  if (!ownerVerified) {
    setValidationStatus(
      "Початкові залишки введено. Для першого офіційного звіту потрібне затвердження власником."
    );
    return;
  }

  if (!confirmInitialBalances) {
    setValidationStatus(
      "Власник має підтвердити початкові залишки."
    );
    return;
  }
}

setValidationStatus(
  draftReady
    ? "Анкета заповнена. Можна виконати захищену Google-перевірку."
    : "Перевірте заповнення анкети."
);
}

async function checkServerRead() {

  if (!shiftDate) {
    setReadStatus("Спочатку оберіть дату зміни.");
    return;
  }

  activeRequest.current?.abort();

  const controller = new AbortController();
  activeRequest.current = controller;

setSnapshot(null);
setKpiEntries({});
setAccountEntries({});
setOpeningEntries({});
setConfirmInitialBalances(false);
setOwnerVerified(false);
setVerifiedDraftFingerprint(null);
setOfficialReportSent(false);
setValidationStatus("");
setChecking(true);
setReadStatus("Завантаження фінансових даних ProFin…");

  try {
    const response = await apiRequest<SecureReadData>(
      `/api/shifts/reports/secure-read?date=${encodeURIComponent(shiftDate)}&mode=snapshot`,
      {
        method: "GET",
        signal: controller.signal
      }
    );

    if (controller.signal.aborted) return;

    const result = response.data;
    const data = result?.snapshot;

    if (
      response.code !== "R3_BAB_READ_ONLY" ||
      result?.decision !== "READ_ONLY" ||
      result.identityLinkVerified !== true ||
      result.appsScriptAclVerified !== true ||
      result.canSubmit !== false ||
      !data ||
      data.date !== shiftDate ||
      !/^[a-f0-9]{64}$/.test(data.revision) ||
      !Array.isArray(data.metrics) ||
      !Array.isArray(data.accounts) ||
      data.metrics.length !== KPI.length ||
      data.accounts.length !== ACCOUNTS.length ||
      !KPI.every(item =>
        data.metrics.some(metric => metric.key === item.key)
      ) ||
      !ACCOUNTS.every(item =>
        data.accounts.some(account => account.name === item.name)
      )
    ) {
      throw new Error(
        "Фінансовий SNAPSHOT не пройшов перевірку."
      );
    }

    
let isVerifiedOwner = false;

if (data.initialBalancesRequired) {
  try {
    const acl = await apiRequest<ShiftAclData>(
      `/api/shifts/reports/secure-read?date=${encodeURIComponent(shiftDate)}&mode=acl`,
      {
        method: "GET",
        signal: controller.signal
      }
    );

    isVerifiedOwner =
      acl.code === "R3_BAB_ACL_PASS" &&
      acl.data?.decision === "PASS" &&
      acl.data.isOwner === true &&
      acl.data.identityLinkVerified === true &&
      acl.data.appsScriptAclVerified === true &&
      acl.data.canSubmit === false;
  } catch {
    isVerifiedOwner = false;
  }
}

if (controller.signal.aborted) return;

setOwnerVerified(isVerifiedOwner);
setSnapshot(data);

setReadStatus(
  "Отримано 7 KPI та 4 рахунки. Режим: тільки читання."
);

  } catch (error) {
    if (!controller.signal.aborted) {
      setSnapshot(null);
      setReadStatus(
        getApiErrorMessage(
          error,
          "Не вдалося завантажити фінансові дані."
        )
      );
    }
  } finally {
    if (activeRequest.current === controller) {
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
setSnapshot(null);
setKpiEntries({});
setAccountEntries({});
setOpeningEntries({});
setConfirmInitialBalances(false);
setOwnerVerified(false);
setVerifiedDraftFingerprint(null);
setOfficialReportSent(false);
setValidationStatus("");

setShiftDate(event.target.value);
  setComment("");

  setReadStatus(
    "Завантажте фінансові дані для обраної дати."
  );
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
  {snapshot ? (
    <>
      R3-04 · Захищені фінансові дані отримано.
      {" "}
      Revision:
      {" "}
      <code title={snapshot.revision}>
        {snapshot.revision.slice(0, 12)}…
      </code>
      {snapshot.initialBalancesRequired &&
        " Початкові залишки потребують підтвердження власника."}
      {" "}
      Подання звіту заблоковано.
    </>
  ) : (
    <>
      R3-04 · Фінансові дані ще не завантажені.
      Підтвердження та подання звіту заблоковані.
    </>
  )}
</div>
          </div>
        </section>

        <div className={styles.sections}>
          <div className={styles.sectionHeading}>
            <h2>01 / Звірка показників</h2>
            <span className={styles.progress}>
  {completedKpis} із 7 опрацьовано
</span>
          </div>
          <div className={styles.progressTrack}>
            <div
  className={styles.progressBar}
  style={{
    width: `${(completedKpis / KPI.length) * 100}%`
  }}
/>
          </div>

          {KPI.map((metric, index) => (
            <div className={styles.card} key={metric.key}>
              <div className={styles.cardTop}>
                <h3 className={styles.cardTitle}>
                  {index + 1}. {metric.label}
                </h3>
                <span className={styles.statusPill}>
               {snapshot ? "Завантажено" : "Не перевірено"}
              </span>
              </div>
              <div className={styles.eyebrow}>За даними ProFin</div>
             <div className={styles.metricAuto}>
             {metricValue(snapshot, metric.key, metric.unit)}
             </div>
              
<div className={styles.actions}>
  <button
    type="button"
    disabled={!snapshot || checking}
    onClick={() => {
      const auto = snapshot?.metrics.find(
        item => item.key === metric.key
      )?.auto;

      if (typeof auto !== "number") return;

      setKpiEntries(previous => ({
        ...previous,
        [metric.key]: {
          mode: "CONFIRMED",
          actual: String(auto),
          comment: ""
        }
      }));

      setValidationStatus("");
    }}
  >
    ✓ Підтверджую
  </button>

  <button
    type="button"
    disabled={!snapshot || checking}
    onClick={() => {
      const auto = snapshot?.metrics.find(
        item => item.key === metric.key
      )?.auto;

      if (typeof auto !== "number") return;

      setKpiEntries(previous => ({
        ...previous,
        [metric.key]: {
          mode: "CORRECTED",
          actual: String(auto),
          comment: previous[metric.key]?.comment ?? ""
        }
      }));

      setValidationStatus("");
    }}
  >
    ✎ Коригувати
  </button>
</div>

<div
  className={styles.editFields}
  hidden={kpiEntries[metric.key]?.mode !== "CORRECTED"}
>
  <label htmlFor={`kpi_${metric.key}`}>
    Фактичне значення
  </label>

  <input
    id={`kpi_${metric.key}`}
    type="number"
    min="0"
    step={metric.unit === "UAH" ? "0.01" : "1"}
    value={kpiEntries[metric.key]?.actual ?? ""}
    disabled={!snapshot}
    onChange={event => {
      setKpiEntries(previous => ({
        ...previous,
        [metric.key]: {
          mode: "CORRECTED",
          actual: event.target.value,
          comment: previous[metric.key]?.comment ?? ""
        }
      }));

      setValidationStatus("");
    }}
  />

  <label htmlFor={`knote_${metric.key}`}>
    Причина коригування
  </label>

  <textarea
    id={`knote_${metric.key}`}
    rows={2}
    maxLength={500}
    value={kpiEntries[metric.key]?.comment ?? ""}
    placeholder="Опишіть причину відхилення"
    disabled={!snapshot}
    onChange={event => {
      setKpiEntries(previous => ({
        ...previous,
        [metric.key]: {
          mode: "CORRECTED",
          actual: previous[metric.key]?.actual ?? "",
          comment: event.target.value
        }
      }));

      setValidationStatus("");
    }}
  />
</div>

            </div>
          ))}

          <div className={styles.banner}>ЗВІРКА РАХУНКІВ ЗА ЗМІНУ</div>
          <p className={styles.note}>
          Надходження, виплати та перекази отримано з фінансового ядра.
          Підсумковий залишок не обчислюємо в браузері.
          Початкові залишки підтверджує власник.
          </p>

          
<div
  className={styles.card}
  hidden={!snapshot?.initialBalancesRequired}
>
  <strong>
    Початкові залишки для першого офіційного звіту
  </strong>

  <p className={styles.note}>
    Адміністратор і власник можуть ввести залишки
    чотирьох рахунків. Офіційне підтвердження
    виконує власник.
  </p>

  <div className={styles.initialGrid}>
    {ACCOUNTS.map(account => (
      <div key={account.key}>
        <label htmlFor={`initial_${account.key}`}>
          {account.name}
        </label>

        <input
          id={`initial_${account.key}`}
          type="number"
          step="0.01"
          min="0"
          placeholder="Введіть початковий залишок"
          value={openingEntries[account.name] ?? ""}
          disabled={!snapshot || checking}
          onChange={event => {
            setOpeningEntries(previous => ({
              ...previous,
              [account.name]: event.target.value
            }));

            setConfirmInitialBalances(false);
            setValidationStatus("");
          }}
        />
      </div>
    ))}
  </div>

  <label className={styles.confirmLine}>
    <input
      type="checkbox"
      checked={confirmInitialBalances}
      disabled={
        !snapshot ||
        checking ||
        !ownerVerified
      }
      onChange={event => {
        setConfirmInitialBalances(
          event.target.checked
        );

        setValidationStatus("");
      }}
    />

    Підтверджую початкові залишки
    всіх чотирьох рахунків
  </label>

  {!ownerVerified && (
    <p className={styles.note} role="status">
      Початкові залишки можна заповнити,
      але для офіційного затвердження
      потрібна роль OWNER.
      Введені значення поки не зберігаються
      на сервері.
    </p>
  )}
</div>


          {ACCOUNTS.map(account => (
            <div className={`${styles.card} ${styles.account}`} key={account.key}>
              <div className={styles.cardTop}>
                <h3 className={styles.accountTitle}>{account.title}</h3>
                <span className={styles.statusPill}>Не перевірено</span>
              </div>
              <div className={styles.accountBalanceRow}>
                {([
               { label: "На початок", field: "opening" },
               { label: "Надходження", field: "receipts" },
               { label: "Виплати", field: "payouts" }
               ] as const).map(item => (
               <div key={item.field}>
               <div className={styles.accountSmallLabel}>
               {item.label}
               </div>
              <div className={styles.accountSmallValue}>
  {item.field === "opening" &&
  snapshot?.initialBalancesRequired
    ? (() => {
        const value = parseOpeningBalance(
          openingEntries[account.name]
        );

        return value === null
          ? "—"
          : formatValue(value, "UAH");
      })()
    : accountValue(
        snapshot,
        account.name,
        item.field
      )}
</div>
           </div>
           ))}
              </div>
              <p className={styles.note}>
              Перекази: +
              {accountValue(snapshot, account.name, "transferIn")}
              {" / −"}
              {accountValue(snapshot, account.name, "transferOut")}
              </p>
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
    min={
      account.key === "cash" ||
      account.key === "safe"
        ? "0"
        : undefined
    }
    step="0.01"
    value={accountEntries[account.name]?.actualEnd ?? ""}
    disabled={!snapshot || checking}
    placeholder="Введіть значення"
    onChange={event => {
      setAccountEntries(previous => ({
        ...previous,
        [account.name]: {
          actualEnd: event.target.value,
          comment: previous[account.name]?.comment ?? ""
        }
      }));

      setValidationStatus("");
    }}
  />

  <label htmlFor={`anote_${account.key}`}>
    Коментар / причина розбіжності
  </label>

  <textarea
    id={`anote_${account.key}`}
    rows={2}
    maxLength={500}
    value={accountEntries[account.name]?.comment ?? ""}
    placeholder="За потреби опишіть розбіжність"
    disabled={!snapshot || checking}
    onChange={event => {
      setAccountEntries(previous => ({
        ...previous,
        [account.name]: {
          actualEnd: previous[account.name]?.actualEnd ?? "",
          comment: event.target.value
        }
      }));

      setValidationStatus("");
    }}
  />

  <p className={styles.note}>
    Збіг та розбіжність перевірить фінансовий сервер.
  </p>
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
  <button
    type="button"
    className={styles.btnDark}
    disabled={!snapshot || checking}
    onClick={checkFormLocally}
  >
    Перевірити заповнення
  </button>

  {draftReady && !submitReady && !officialReportSent && (
  <ShiftGoogleValidation
    key={snapshot?.revision}
    date={shiftDate}
    mode="VALIDATE"
    getDraft={buildReportDraft}
    onResult={result => {
      const passed =
        result.http === 200 &&
        result.code === "SHIFT_PREVALIDATION_OK" &&
        result.decision === "READ_ONLY_VALIDATION" &&
        result.draftFingerprint === draftFingerprint;

      setVerifiedDraftFingerprint(
        passed ? result.draftFingerprint : null
      );

      setValidationStatus(
        passed
          ? "Серверна перевірка успішна. Можна подавати звіт."
          : `Перевірку відхилено: ${result.code}.`
      );
    }}
  />
)}

  <span
    className={styles.conclusion}
    role="status"
  >
    {validationStatus}
  </span>
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

  {submitReady ? (
    <ShiftGoogleValidation
      key={`submit-${snapshot?.revision}`}
      date={shiftDate}
      mode="SUBMIT"
      buttonClassName={styles.btnGreen}
      getDraft={buildReportDraft}
      onResult={result => {
        if (
          result.http === 200 &&
          result.code === "SHIFT_REPORT_SUBMITTED" &&
          result.decision === "SUBMITTED"
        ) {
          setOfficialReportSent(true);

          setValidationStatus(
            `Звіт подано: ${result.reportId ?? ""}.`
          );
        } else {
          setValidationStatus(
            `Подання відхилено: ${result.code} (HTTP ${result.http}).`
          );
        }
      }}
    />
  ) : (
    <button
      type="button"
      className={styles.btnGreen}
      disabled
    >
      {officialReportSent
        ? "Звіт подано"
        : "Подати звіт"}
    </button>
  )}
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
