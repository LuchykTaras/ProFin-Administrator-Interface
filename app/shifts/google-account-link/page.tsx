"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type ApiData<T> = { ok: boolean; code?: string; userMessage?: string; data?: T };
type Challenge = { clientId: string; nonce: string; challengeId: string };
type RequestItem = { requestId: string; userId: string; userName: string; role: string; googleEmail: string; expiresAt: string };
type LinkItem = { linkId: string; userId: string; userName: string; role: string; googleEmail: string; linkedAt: string };
type CurrentLink = { googleEmail: string; linkedAt: string } | null;
type CurrentStatus = { link: CurrentLink; pendingRequest: { requestId: string; expiresAt: string } | null };
type OwnerData = { pendingRequests: RequestItem[]; activeLinks: LinkItem[] };
type GoogleApi = {
  accounts: { id: {
    initialize: (config: {
      client_id: string;
      nonce: string;
      auto_select: boolean;
      callback: (value: { credential: string }) => void;
    }) => void;
    renderButton: (el: HTMLElement, options: { theme: string; size: string; text: string }) => void;
  } };
};

async function callApi<T>(url: string, payload?: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    credentials: "same-origin",
    cache: "no-store"
  });
  const json = await res.json() as ApiData<T>;
  if (!res.ok || !json.ok || !json.data) {
    throw new Error(`${json.code || "ERROR"}: ${json.userMessage || "Запит не виконано."}`);
  }
  return json.data;
}

export default function GoogleAccountLinkPage() {
  const target = useRef<HTMLDivElement>(null);
  const passwordRef = useRef("");
  const [sdkReady, setSdkReady] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [password, setPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [current, setCurrent] = useState<CurrentStatus | null>(null);
  const [owner, setOwner] = useState<OwnerData | null>(null);

  useEffect(() => { passwordRef.current = password; }, [password]);

  const refresh = useCallback(async () => {
    try {
      setCurrent(await callApi<CurrentStatus>("/api/auth/google-links"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Помилка доступу.");
    }
    try {
      setOwner(await callApi<OwnerData>("/api/admin/google-links"));
    } catch {
      setOwner(null);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function start() {
    if (!sdkReady) { setMessage("Google SDK ще завантажується."); return; }
    if (password.length < 8) { setMessage("Уведи чинний пароль ProFin для підтвердження."); return; }
    setBusy(true);
    setMessage("Створення одноразового запиту...");
    try {
      const next = await callApi<Challenge>("/api/auth/google-links", { action: "challenge" });
      setChallenge(next);
      setMessage("Вибери свій справжній Google-акаунт.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Помилка створення перевірки.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!challenge || !sdkReady || !target.current) return;
    const google = (window as Window & { google?: GoogleApi }).google;
    if (!google) { setMessage("Google SDK недоступний."); return; }
    google.accounts.id.initialize({
      client_id: challenge.clientId,
      nonce: challenge.nonce,
      auto_select: false,
      callback: async result => {
        setBusy(true);
        setMessage("Перевірка Google-особи та пароля ProFin...");
        try {
          await callApi("/api/auth/google-links", {
            action: "request",
            challengeId: challenge.challengeId,
            nonce: challenge.nonce,
            credential: result.credential,
            password: passwordRef.current
          });
          setMessage("Заявку створено. Потрібне підтвердження власника.");
          setPassword("");
          passwordRef.current = "";
          await refresh();
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Помилка прив’язки.");
        } finally {
          setChallenge(null);
          if (target.current) target.current.replaceChildren();
          setBusy(false);
        }
      }
    });
    target.current.replaceChildren();
    google.accounts.id.renderButton(target.current, { theme: "outline", size: "large", text: "continue_with" });
  }, [challenge, sdkReady, refresh]);

  async function review(action: "approve" | "reject" | "revoke", id: string) {
    if (!ownerPassword) { setMessage("Уведи пароль власника для підтвердження."); return; }
    if (action !== "approve" && reason.trim().length < 10) {
      setMessage("Для відхилення або відкликання потрібна причина від 10 символів."); return;
    }
    if (!window.confirm(`Підтвердити дію ${action} для цього Google-акаунту?`)) return;
    setBusy(true);
    try {
      await callApi("/api/admin/google-links", {
        action, id, password: ownerPassword, reason
      });
      setMessage(`Дія ${action} виконана. Перевір аудит.`);
      setOwnerPassword("");
      setReason("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не вдалося обробити заявку.");
    } finally {
      setBusy(false);
    }
  }

  const card: CSSProperties = { padding: 16, border: "1px solid #d8e3e0", borderRadius: 12, background: "#fff", marginBottom: 18 };
  const button: CSSProperties = { padding: "8px 12px", marginRight: 8, marginTop: 8, cursor: "pointer" };
  const input: CSSProperties = { display: "block", width: "100%", maxWidth: 440, padding: 9, marginTop: 8, marginBottom: 8 };

  return (
    <main style={{ maxWidth: 800, margin: "32px auto", padding: 20, fontFamily: "sans-serif", color: "#19333b" }}>
      <h1>ProFin OS · Прив’язка Google-акаунту</h1>
      <p>Постійний зв’язок із ProFin, без зміни email і ролі. Фінансове читання та подання звітів цим кроком не активуються.</p>
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onReady={() => setSdkReady(true)} onError={() => setMessage("Не вдалося завантажити Google SDK.")} />
      <section style={card}>
        <h2>Мій Google-акаунт</h2>
        <p>Активна прив’язка: {current?.link?.googleEmail ?? "відсутня"}</p>
        <p>Заявка: {current?.pendingRequest ? "очікує власника" : "відсутня"}</p>
        <label htmlFor="profin-password">Чинний пароль ProFin для повторної перевірки</label>
        <input id="profin-password" type="password" autoComplete="current-password" style={input} value={password} onChange={e => setPassword(e.target.value)} />
        <button style={button} onClick={() => void start()} disabled={busy || Boolean(current?.link) || Boolean(current?.pendingRequest)}>Створити запит Google</button>
        {challenge && <div ref={target} style={{ marginTop: 12 }} />}
        <button style={button} onClick={() => void refresh()} disabled={busy}>Оновити стан</button>
      </section>
      {owner && <section style={card}>
        <h2>Погодження власника</h2>
        <p>Звіряй користувача, роль і Google-пошту перед підтвердженням. Повторна перевірка пароля власника обов’язкова.</p>
        <label htmlFor="owner-password">Пароль власника</label>
        <input id="owner-password" type="password" autoComplete="current-password" style={input} value={ownerPassword} onChange={e => setOwnerPassword(e.target.value)} />
        <label htmlFor="review-reason">Причина відхилення / відкликання</label>
        <input id="review-reason" style={input} value={reason} onChange={e => setReason(e.target.value)} placeholder="Обов’язкова для відхилення та відкликання" />
        <h3>Заявки ({owner.pendingRequests.length})</h3>
        {owner.pendingRequests.map(item => <div key={item.requestId} style={{ borderTop: "1px solid #eee", padding: "12px 0" }}>
          <strong>{item.userName}</strong> — {item.role} — {item.googleEmail}
          <div><button style={button} disabled={busy} onClick={() => void review("approve", item.requestId)}>Підтвердити</button>
          <button style={button} disabled={busy} onClick={() => void review("reject", item.requestId)}>Відхилити</button></div>
        </div>)}
        <h3>Активні прив’язки ({owner.activeLinks.length})</h3>
        {owner.activeLinks.map(item => <div key={item.linkId} style={{ borderTop: "1px solid #eee", padding: "12px 0" }}>
          <strong>{item.userName}</strong> — {item.role} — {item.googleEmail}
          <div><button style={button} disabled={busy} onClick={() => void review("revoke", item.linkId)}>Відкликати та завершити сесії</button></div>
        </div>)}
      </section>}
      <p role="status" aria-live="polite">{message}</p>
    </main>
  );
}
