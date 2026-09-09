"use client";

import {
  useState
} from "react";

type Props = {
  token: string;
};

type ActivationResponse = {
  ok: boolean;
  code: string;
  userMessage: string;
  requestId: string;
};

export default function ActivateClient({
  token
}: Props) {
  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function activate() {
    if (!token) {
      setError(
        "Відсутній токен запрошення."
      );
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response =
        await fetch(
          "/api/auth/activate",
          {
            method: "POST",
            headers: {
              "content-type":
                "application/json"
            },
            body: JSON.stringify({
              token
            })
          }
        );

      const payload =
        await response.json() as
          ActivationResponse;

      if (
        !response.ok ||
        !payload.ok
      ) {
        setError(
          payload.userMessage ??
            "Не вдалося активувати доступ."
        );
        return;
      }

      window.location.href = "/";
    } catch {
      setError(
        "Не вдалося підключитися до сервера."
      );
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f5f7f7",
          padding: 24
        }}
      >
        <section
          style={{
            maxWidth: 440,
            width: "100%",
            padding: 32,
            background: "#ffffff",
            borderRadius: 20,
            border:
              "1px solid #e3e8e6"
          }}
        >
          <h1>ProFin OS</h1>

          <p>
            Посилання запрошення
            некоректне.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f5f7f7",
        padding: 24
      }}
    >
      <section
        style={{
          maxWidth: 440,
          width: "100%",
          padding: 32,
          background: "#ffffff",
          borderRadius: 20,
          border:
            "1px solid #e3e8e6"
        }}
      >
        <h1
          style={{
            marginTop: 0
          }}
        >
          ProFin OS
        </h1>

        <h2>
          Активація доступу
        </h2>

        <p>
          Натисніть кнопку, щоб
          активувати персональну
          сесію.
        </p>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 10,
              background: "#fff1f1"
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={activate}
          style={{
            width: "100%",
            minHeight: 48,
            border: 0,
            borderRadius: 12,
            background: "#079875",
            color: "#ffffff",
            fontSize: 16,
            fontWeight: 700,
            cursor:
              loading
                ? "default"
                : "pointer"
          }}
        >
          {loading
            ? "Активація..."
            : "Активувати доступ"}
        </button>
      </section>
    </main>
  );
}