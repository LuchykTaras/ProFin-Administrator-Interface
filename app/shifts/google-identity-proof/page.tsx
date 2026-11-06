"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Challenge = {
  clientId: string;
  nonce: string;
};

type GoogleAPI = {
  accounts: {
    id: {
      initialize: (params: {
        client_id: string;
        nonce: string;
        auto_select: boolean;
        callback: (value: { credential: string }) => void;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: { theme: string; size: string; text: string }
      ) => void;
    };
  };
};

export default function GoogleIdentityProofPage() {
  const target = useRef<HTMLDivElement>(null);
  const [sdkReady, setSdkReady] = useState(false);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [message, setMessage] = useState("Підготовка перевірки...");

  useEffect(() => {
    if (!sdkReady) return;
    let cancelled = false;
    fetch("/api/shifts/google-identity-proof", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    })
      .then(async response => {
        const json = await response.json();
        if (!response.ok || !json.ok) throw new Error(json.userMessage || "Помилка перевірки.");
        return json.data as Challenge;
      })
      .then(data => { if (!cancelled) setChallenge(data); })
      .catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [sdkReady]);

  useEffect(() => {
    if (!challenge || !target.current) return;
    const google = (window as Window & { google?: GoogleAPI }).google;
    if (!google) return;

    google.accounts.id.initialize({
      client_id: challenge.clientId,
      nonce: challenge.nonce,
      auto_select: false,
      callback: async response => {
        setMessage("Перевірка Google ID token...");
        try {
          const result = await fetch("/api/shifts/google-identity-proof", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response.credential })
          });
          const json = await result.json();
          setMessage(`${json.code}: ${json.userMessage}`);
        } catch {
          setMessage("Не вдалося завершити перевірку.");
        }
      }
    });
    target.current.replaceChildren();
    google.accounts.id.renderButton(target.current, {
      theme: "outline",
      size: "large",
      text: "continue_with"
    });
    setMessage("Оберіть Google-акаунт для одноразової перевірки.");
  }, [challenge]);

  return (
    <main style={{ maxWidth: 640, margin: "48px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>ProFin OS — перевірка Google-ідентичності</h1>
      <p>Тільки локальний тест. KPI, рахунки та подання звіту недоступні.</p>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onReady={() => setSdkReady(true)}
        onError={() => setMessage("Не вдалося завантажити Google Identity Services.")}
      />
      <div ref={target} />
      <p role="status" aria-live="polite">{message}</p>
      <button type="button" onClick={() => window.location.reload()}>
        Повторити перевірку
      </button>
    </main>
  );
}
