"use client";

import {
  FormEvent,
  useState
} from "react";


type LoginResponse = {
  ok?:
    boolean;

  userMessage?:
    string;
};


export default function LoginPage() {
  const [
    email,
    setEmail
  ] =
    useState(
      ""
    );

  const [
    password,
    setPassword
  ] =
    useState(
      ""
    );

  const [
    loading,
    setLoading
  ] =
    useState(
      false
    );

  const [
    error,
    setError
  ] =
    useState(
      ""
    );


  async function submit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      loading
    ) {
      return;
    }

    setLoading(
      true
    );

    setError(
      ""
    );

    try {
      const response =
        await fetch(
          "/api/auth/login",
          {
            method:
              "POST",

            headers: {
              "content-type":
                "application/json"
            },

            body:
              JSON.stringify({
                email,
                password
              })
          }
        );


      const payload =
        await response
          .json()
          .catch(
            () => null
          ) as
            LoginResponse |
            null;


      if (
        !response.ok
      ) {
        setError(
          payload
            ?.userMessage ||
          "Не вдалося виконати вхід."
        );

        return;
      }


      window.location.assign(
        "/"
      );
    } catch {
      setError(
        "Не вдалося з'єднатися із сервером."
      );
    } finally {
      setLoading(
        false
      );
    }
  }


  return (
    <main
      style={{
        minHeight:
          "100vh",

        display:
          "flex",

        alignItems:
          "center",

        justifyContent:
          "center",

        padding:
          24,

        background:
          "#f4f7f5",

        fontFamily:
          "Arial, sans-serif"
      }}
    >
      <section
        style={{
          width:
            "100%",

          maxWidth:
            430,

          padding:
            32,

          border:
            "1px solid #dfe7e3",

          borderRadius:
            20,

          background:
            "#ffffff",

          boxShadow:
            "0 20px 50px rgba(0,0,0,0.08)"
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
              marginBottom:
                8,

              color:
                "#07966f",

              fontSize:
                12,

              fontWeight:
                800,

              letterSpacing:
                "0.12em"
            }}
          >
            PROFIN OS
          </div>

          <h1
            style={{
              margin:
                0,

              color:
                "#112a22",

              fontSize:
                30
            }}
          >
            Вхід
          </h1>

          <p
            style={{
              marginTop:
                10,

              color:
                "#6b7c76",

              lineHeight:
                1.5
            }}
          >
            Увійдіть у свій
            обліковий запис
            ProFin OS.
          </p>
        </div>


        <form
          onSubmit={
            submit
          }

          style={{
            display:
              "grid",

            gap:
              18
          }}
        >
          <label>
            <div
              style={{
                marginBottom:
                  7,

                fontWeight:
                  700,

                fontSize:
                  14
              }}
            >
              Електронна пошта
            </div>

            <input
              type="email"

              autoComplete=
                "email"

              required

              value={
                email
              }

              onChange={
                event =>
                  setEmail(
                    event
                      .target
                      .value
                  )
              }

              style={{
                width:
                  "100%",

                boxSizing:
                  "border-box",

                padding:
                  "13px 14px",

                border:
                  "1px solid #ccd9d4",

                borderRadius:
                  10,

                fontSize:
                  16
              }}
            />
          </label>


          <label>
            <div
              style={{
                marginBottom:
                  7,

                fontWeight:
                  700,

                fontSize:
                  14
              }}
            >
              Пароль
            </div>

            <input
              type="password"

              autoComplete=
                "current-password"

              required

              minLength={
                8
              }

              value={
                password
              }

              onChange={
                event =>
                  setPassword(
                    event
                      .target
                      .value
                  )
              }

              style={{
                width:
                  "100%",

                boxSizing:
                  "border-box",

                padding:
                  "13px 14px",

                border:
                  "1px solid #ccd9d4",

                borderRadius:
                  10,

                fontSize:
                  16
              }}
            />
          </label>


          {
            error &&
            (
              <div
                style={{
                  padding:
                    12,

                  borderRadius:
                    10,

                  background:
                    "#fff0f0",

                  color:
                    "#b42318",

                  fontSize:
                    14
                }}
              >
                {
                  error
                }
              </div>
            )
          }


          <button
            type="submit"

            disabled={
              loading
            }

            style={{
              marginTop:
                4,

              padding:
                "14px 18px",

              border:
                0,

              borderRadius:
                10,

              background:
                loading
                  ? "#9bbfb3"
                  : "#07966f",

              color:
                "#ffffff",

              fontWeight:
                800,

              fontSize:
                16,

              cursor:
                loading
                  ? "default"
                  : "pointer"
            }}
          >
            {
              loading
                ? "Вхід..."
                : "Увійти"
            }
          </button>
        </form>
      </section>
    </main>
  );
}
