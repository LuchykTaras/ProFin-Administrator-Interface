"use client";

import {
  FormEvent,
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
  const [
    password,
    setPassword
  ] =
    useState("");


  const [
    confirmPassword,
    setConfirmPassword
  ] =
    useState("");


  const [
    loading,
    setLoading
  ] =
    useState(false);


  const [
    error,
    setError
  ] =
    useState("");


  async function activate(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();


    if (!token) {
      setError(
        "Відсутній токен запрошення."
      );

      return;
    }


    if (
      password.length < 8
    ) {
      setError(
        "Пароль повинен містити щонайменше 8 символів."
      );

      return;
    }


    if (
      password !==
      confirmPassword
    ) {
      setError(
        "Паролі не збігаються."
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
            method:
              "POST",

            headers: {
              "content-type":
                "application/json"
            },

            body:
              JSON.stringify({
                token,
                password
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


      /*
       * API вже створив HttpOnly session cookie.
       *
       * Тому після activation одразу переходимо
       * в основний інтерфейс ProFin OS.
       */
      window.location.href =
        "/";

    } catch {
      setError(
        "Не вдалося підключитися до сервера."
      );

    } finally {
      setLoading(false);
    }
  }


  if (
    !token
  ) {
    return (
      <main
        style={{
          minHeight:
            "100vh",

          display:
            "grid",

          placeItems:
            "center",

          background:
            "#f5f7f7",

          padding:
            24
        }}
      >
        <section
          style={{
            maxWidth:
              440,

            width:
              "100%",

            padding:
              32,

            background:
              "#ffffff",

            borderRadius:
              20,

            border:
              "1px solid #e3e8e6"
          }}
        >
          <h1>
            ProFin OS
          </h1>

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
        minHeight:
          "100vh",

        display:
          "grid",

        placeItems:
          "center",

        background:
          "#f5f7f7",

        padding:
          24
      }}
    >
      <section
        style={{
          maxWidth:
            440,

          width:
            "100%",

          padding:
            32,

          background:
            "#ffffff",

          borderRadius:
            20,

          border:
            "1px solid #e3e8e6",

          boxShadow:
            "0 20px 60px rgba(0,0,0,0.08)"
        }}
      >
        <div
          style={{
            marginBottom:
              28
          }}
        >
          <div
            style={{
              color:
                "#079875",

              fontSize:
                13,

              fontWeight:
                800,

              letterSpacing:
                "0.12em",

              textTransform:
                "uppercase",

              marginBottom:
                8
            }}
          >
            ProFin OS
          </div>


          <h1
            style={{
              margin:
                0,

              fontSize:
                28,

              lineHeight:
                1.2,

              color:
                "#102922"
            }}
          >
            Активація доступу
          </h1>


          <p
            style={{
              marginTop:
                12,

              marginBottom:
                0,

              color:
                "#687a74",

              lineHeight:
                1.5
            }}
          >
            Створіть пароль для
            постійного входу в
            ProFin OS.
          </p>
        </div>


        <form
          onSubmit={
            activate
          }
        >
          <label
            htmlFor="password"
            style={{
              display:
                "block",

              marginBottom:
                8,

              fontWeight:
                700,

              color:
                "#19352d"
            }}
          >
            Новий пароль
          </label>


          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={loading}
            onChange={
              event =>
                setPassword(
                  event.target.value
                )
            }
            placeholder="Мінімум 8 символів"
            style={{
              width:
                "100%",

              minHeight:
                48,

              boxSizing:
                "border-box",

              border:
                "1px solid #d8e1de",

              borderRadius:
                12,

              padding:
                "0 14px",

              fontSize:
                16,

              outline:
                "none",

              marginBottom:
                18
            }}
          />


          <label
            htmlFor="confirmPassword"
            style={{
              display:
                "block",

              marginBottom:
                8,

              fontWeight:
                700,

              color:
                "#19352d"
            }}
          >
            Повторіть пароль
          </label>


          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={
              confirmPassword
            }
            disabled={
              loading
            }
            onChange={
              event =>
                setConfirmPassword(
                  event.target.value
                )
            }
            placeholder="Повторіть пароль"
            style={{
              width:
                "100%",

              minHeight:
                48,

              boxSizing:
                "border-box",

              border:
                "1px solid #d8e1de",

              borderRadius:
                12,

              padding:
                "0 14px",

              fontSize:
                16,

              outline:
                "none",

              marginBottom:
                18
            }}
          />


          {error && (
            <div
              role="alert"
              style={{
                marginBottom:
                  18,

                padding:
                  12,

                borderRadius:
                  10,

                background:
                  "#fff1f1",

                color:
                  "#a32929",

                lineHeight:
                  1.4
              }}
            >
              {error}
            </div>
          )}


          <button
            type="submit"
            disabled={
              loading
            }
            style={{
              width:
                "100%",

              minHeight:
                50,

              border:
                0,

              borderRadius:
                12,

              background:
                loading
                  ? "#8fcdbd"
                  : "#079875",

              color:
                "#ffffff",

              fontSize:
                16,

              fontWeight:
                700,

              cursor:
                loading
                  ? "default"
                  : "pointer"
            }}
          >
            {loading
              ? "Активація..."
              : "Створити пароль і активувати"}
          </button>
        </form>


        <p
          style={{
            marginTop:
              20,

            marginBottom:
              0,

            fontSize:
              13,

            lineHeight:
              1.5,

            color:
              "#7b8b86"
          }}
        >
          Після активації це
          invitation-посилання більше
          не можна буде використати
          повторно.
        </p>
      </section>
    </main>
  );
}