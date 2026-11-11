
"use client";

import Script from "next/script";

import {
  useCallback,
  useEffect,
  useRef,
  useState
} from "react";

import type {
  ShiftReportSubmissionDraft
} from "@/lib/contracts/shift-report-submission";

type Challenge = {
  clientId: string;
  nonce: string;
  date: string;
  issuedAt: number;
};

type GoogleCredential = {
  credential?: string;
};

type GoogleIdentityClient = {
  initialize(config: {
    client_id: string;
    nonce: string;
    callback: (response: GoogleCredential) => void;
    auto_select?: boolean;
    ux_mode?: "popup";
  }): void;

  renderButton(
    element: HTMLElement,
    options: {
      theme: string;
      size: string;
      text: string;
      locale: string;
    }
  ): void;
};

type GoogleWindow = Window & {
  google?: {
    accounts: {
      id: GoogleIdentityClient;
    };
  };
};

type ApiResponse = {
  ok: boolean;
  code: string;
  userMessage?: string;
  data?: {
    clientId?: string;
    nonce?: string;
    decision?: string;
    writePerformed?: boolean;
    reportId?: string;
  };
};

type Props = {
  date: string;
  mode?: "VALIDATE" | "SUBMIT";
  buttonClassName?: string;

  getDraft?: () =>
    | ShiftReportSubmissionDraft
    | null
    | Promise<ShiftReportSubmissionDraft | null>;

  onResult?: (result: {
    http: number;
    code: string;
    decision: string;
    draftFingerprint: string;
    reportId?: string;
  }) => void;
};

export function ShiftGoogleValidation({
  date,
  getDraft,
  onResult,
  mode = "VALIDATE",
  buttonClassName
}: Props) {
  const [scriptReady, setScriptReady] =
    useState(false);

  const [challenge, setChallenge] =
    useState<Challenge | null>(null);

  const [busy, setBusy] =
    useState(false);

  const [status, setStatus] =
    useState("");

  const buttonRef =
    useRef<HTMLDivElement>(null);

  const draftRef = useRef(getDraft);
const resultRef = useRef(onResult);
const activeDateRef = useRef(date);
const busyRef = useRef(false);

const [submitted, setSubmitted] = useState(false);

const [
  needsReconciliation,
  setNeedsReconciliation
] = useState(false);

const attemptRef = useRef<{
  body: string;
  key: string;
} | null>(null);

useEffect(() => {
  draftRef.current = getDraft;
  resultRef.current = onResult;
  activeDateRef.current = date;
}, [getDraft, onResult, date]);

  useEffect(() => {
  setChallenge(null);
  setStatus("");

  if (mode !== "SUBMIT") {
    setNeedsReconciliation(false);
    return;
  }

  try {
    const prefix = `profin-shift-pending:${date}:`;

    setNeedsReconciliation(
      Object.keys(window.sessionStorage)
        .some(key => key.startsWith(prefix))
    );
  } catch {
    setNeedsReconciliation(true);
  }
}, [date, mode]);

  const start = useCallback(async () => {
  if (busyRef.current || !date || submitted) {
  return;
}

  if (
    mode === "SUBMIT" &&
    !window.confirm(
      "Підтвердити офіційне подання звіту? " +
      "Після Google-підтвердження дані буде записано."
    )
  ) {
    return;
  }

  busyRef.current = true;
    setBusy(true);
    setChallenge(null);
    setStatus("Підготовка Google Identity...");

    try {
      const response = await fetch(
        `/api/shifts/reports/validate?date=${encodeURIComponent(date)}`,
        {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store"
        }
      );

      const result =
        await response.json() as ApiResponse;

      if (
        !response.ok ||
        result.code !== "SHIFT_GOOGLE_CHALLENGE_READY" ||
        !result.data?.clientId ||
        !result.data?.nonce
      ) {
        throw new Error(
          result.code || "GOOGLE_CHALLENGE_FAILED"
        );
      }

      if (activeDateRef.current !== date) {
        throw new Error("SHIFT_DATE_CHANGED");
      }

      setChallenge({
        clientId: result.data.clientId,
        nonce: result.data.nonce,
        date,
        issuedAt: Date.now()
      });

      setStatus(
        "Підтвердіть Google-акаунт кнопкою нижче."
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "GOOGLE_CHALLENGE_FAILED"
      );
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
      }, [date, mode, submitted, needsReconciliation]);

  const submit = useCallback(async (
    credential: string,
    current: Challenge
  ) => {
    if (busyRef.current) {
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setStatus("Сервер перевіряє Google Identity...");

    let requestDispatched = false;
    let pendingKey: string | null = null;

    try {
      if (
        activeDateRef.current !== current.date ||
        Date.now() - current.issuedAt > 170000
      ) {
        throw new Error(
          "GOOGLE_CHALLENGE_EXPIRED"
        );
      }

      if (!draftRef.current) {
        throw new Error(
          "SHIFT_FORM_DRAFT_NOT_CONNECTED"
        );
      }

      const draft = await draftRef.current();

      if (
        !draft ||
        draft.date !== current.date
      ) {
        throw new Error(
          "SHIFT_FORM_INCOMPLETE"
        );
      }


      const draftFingerprint = JSON.stringify(draft);

      const officialReport = {
  date: draft.date,
  revision: draft.revision,

  metrics: Object.fromEntries(
    Object.entries(draft.metrics).map(
      ([key, item]) => [
        key,
        {
          actual: item.actual,
          comment: item.comment ?? ""
        }
      ]
    )
  ),

  accounts: Object.fromEntries(
    Object.entries(draft.accounts).map(
      ([name, item]) => [
        name,
        {
          actualEnd: item.actualEnd,
          comment: item.comment ?? ""
        }
      ]
    )
  ),

  initialBalances: draft.initialBalances ?? {},

  confirmInitialBalances:
    draft.confirmInitialBalances === true,

  comment: draft.comment ?? ""
};

      const body =
        mode === "SUBMIT"
          ? JSON.stringify(officialReport)
          : draftFingerprint;

      let idempotencyKey: string | null = null;

      if (mode === "SUBMIT") {
        const previous = attemptRef.current;

        if (previous && previous.body !== body) {
          throw new Error(
            "SHIFT_SUBMIT_ATTEMPT_BODY_CHANGED"
          );
        }

        idempotencyKey =
          previous?.key ?? window.crypto.randomUUID();

        attemptRef.current = {
          body,
          key: idempotencyKey
        };
      }

      if (mode === "SUBMIT") {
  pendingKey =
    `profin-shift-pending:${draft.date}:${draft.revision}`;

  if (window.sessionStorage.getItem(pendingKey)) {
    setNeedsReconciliation(true);

    throw new Error(
      "SHIFT_SUBMISSION_PREVIOUS_ATTEMPT_UNRESOLVED"
    );
  }

  window.sessionStorage.setItem(
    pendingKey,
    idempotencyKey ?? ""
  );
}

requestDispatched = true;

      const response = await fetch(
        mode === "SUBMIT"
          ? "/api/shifts/reports/submit"
          : "/api/shifts/reports/validate",
        {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "x-profin-google-id-token": credential,
            ...(idempotencyKey
              ? { "idempotency-key": idempotencyKey }
              : {})
          },
          body
        }
      );

      const result =
        await response.json() as ApiResponse;

      const verified =
        response.ok &&
        result.ok === true &&
        (
          mode === "SUBMIT"
            ? (
                result.code === "SHIFT_REPORT_SUBMITTED" &&
                result.data?.decision === "SUBMITTED"
              )
            : (
                result.code === "SHIFT_PREVALIDATION_OK" &&
                result.data?.decision ===
                  "READ_ONLY_VALIDATION"
              )
        );

      if (mode === "SUBMIT") {
  if (verified) {
    if (pendingKey) {
      window.sessionStorage.removeItem(pendingKey);
    }

    setSubmitted(true);
  } else if (
    result.code === "SHIFT_SUBMIT_DISABLED" ||
    result.code === "SHIFT_WRITE_OWNER_ADMIN_DENIED" ||
    result.code === "SHIFT_WRITE_PAYLOAD_INVALID"
  ) {
    if (pendingKey) {
      window.sessionStorage.removeItem(pendingKey);
    }
  } else {
    setNeedsReconciliation(true);
  }
}

      setStatus(
        verified
          ? (
              mode === "SUBMIT"
                ? `Звіт подано: ${result.data?.reportId ?? ""}`
                : "Google-перевірка успішна."
            )
          : `${response.status}: ${result.code}`
      );

      resultRef.current?.({
        http: response.status,
        code: result.code,
        decision:
          result.data?.decision ?? "BLOCKED",
        draftFingerprint,
        reportId: result.data?.reportId
      });

    } catch (error) {
      if (mode === "SUBMIT" && requestDispatched) {
  setNeedsReconciliation(true);

  setStatus(
    "Результат подання невідомий. " +
    "Повторний запис заблоковано до звірки архіву."
  );
} else {
  setStatus(
    error instanceof Error
      ? error.message
      : "SHIFT_GOOGLE_VALIDATION_FAILED"
  );
}
            } finally {
      setChallenge(null);
      busyRef.current = false;
      setBusy(false);
    }
  }, [mode]);

  useEffect(() => {
    const element = buttonRef.current;

    if (!scriptReady || !challenge || !element) {
      return;
    }

    const google =
      (window as GoogleWindow).google?.accounts.id;

    if (!google) {
      setStatus("GOOGLE_GIS_NOT_AVAILABLE");
      return;
    }

    element.replaceChildren();

    google.initialize({
      client_id: challenge.clientId,
      nonce: challenge.nonce,
      auto_select: false,
      ux_mode: "popup",
      callback: response => {
        if (!response.credential) {
          setStatus("GOOGLE_CREDENTIAL_MISSING");
          return;
        }

        void submit(
          response.credential,
          challenge
        );
      }
    });

    google.renderButton(element, {
      theme: "outline",
      size: "large",
      text: "continue_with",
      locale: "uk"
    });

    return () => {
      element.replaceChildren();
    };
  }, [scriptReady, challenge, submit]);

  return (
    <div>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => {
          setStatus("GOOGLE_GIS_LOAD_FAILED");
        }}
      />

      <button
  type="button"
  className={buttonClassName}
  disabled={!date || busy || submitted}
  onClick={() => void start()}
>
  {submitted
  ? "Звіт подано"
  : busy
    ? "Перевіряється..."
    : mode === "SUBMIT"
      ? "Подати звіт"
      : "Перевірити звіт"}
</button>

      <div
        ref={buttonRef}
        style={{
          display: challenge && !busy
            ? "block"
            : "none",
          marginTop: 12
        }}
      />

      <div
        role="status"
        aria-live="polite"
        style={{ marginTop: 8 }}
      >
        {status}
      </div>
    </div>
  );
}
