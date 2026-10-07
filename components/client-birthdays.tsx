"use client";

import {
  CakeSlice,
  CalendarDays,
  LoaderCircle,
  RefreshCw
} from "lucide-react";

import {
  useEffect,
  useState
} from "react";

import {
  getApiErrorMessage
} from "@/lib/client/api-client";

import {
  getClientBirthdays
} from "@/lib/client/clients-api";

import type {
  ClientBirthdaysData
} from "@/lib/contracts/clients";


type ClientBirthdaysProps = {
  active: boolean;

  refreshKey?: number;
};


function formatBirthday(
  value: string
): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value
    );


  if (
    !match
  ) {
    return value;
  }


  const date =
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      )
    );


  return new Intl
    .DateTimeFormat(
      "uk-UA",
      {
        day:
          "numeric",

        month:
          "long",

        timeZone:
          "UTC"
      }
    )
    .format(
      date
    );
}


function daysLabel(
  daysUntil: number
): string {
  if (
    daysUntil === 0
  ) {
    return "Сьогодні";
  }


  if (
    daysUntil === 1
  ) {
    return "Завтра";
  }


  return `Через ${daysUntil} дн.`;
}


export function ClientBirthdays({
  active,
  refreshKey = 0
}: ClientBirthdaysProps) {
  const [
    data,
    setData
  ] =
    useState<ClientBirthdaysData | null>(
      null
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


  useEffect(
    () => {
      if (
        !active
      ) {
        return;
      }


      const controller =
        new AbortController();


      async function load() {
        setLoading(
          true
        );

        setError(
          ""
        );


        try {
          const nextData =
            await getClientBirthdays({
              daysAhead:
                7,

              signal:
                controller.signal
            });


          if (
            controller.signal.aborted
          ) {
            return;
          }


          setData(
            nextData
          );
        } catch (
          loadError
        ) {
          if (
            controller.signal.aborted
          ) {
            return;
          }


          setError(
            getApiErrorMessage(
              loadError,
              "Не вдалося отримати іменинників."
            )
          );
        } finally {
          if (
            !controller.signal.aborted
          ) {
            setLoading(
              false
            );
          }
        }
      }


      void load();


      return () => {
        controller.abort();
      };
    },
    [
      active,
      refreshKey
    ]
  );


  return (
  <section
  className=
    "card client-birthdays"
>
  <div
    className=
      "client-birthdays-panel"
  >
    <div
      className=
        "section-heading compact client-birthdays-header"
    >
      <div
        className=
          "client-birthdays-heading-copy"
      >
        <h2>
          🎂 Іменинники
        </h2>

        <p>
          Дані з «Клієнтської бази» · сьогодні + 7 днів
        </p>
      </div>


      <span
        className=
          "client-birthdays-count"
      >
        <CakeSlice
          size={16}
        />

        {
          data
            ? data.todayCount
            : "—"
        }
      </span>
    </div>


  <div
  className=
    "client-birthdays-scroll"
>
      {
        loading &&
        !data &&
        (
          <div
            className=
              "client-birthdays-state"
          >
            <LoaderCircle
              size={22}
            />

            <span>
              Завантажуємо іменинників…
            </span>
          </div>
        )
      }


      {
        error &&
        (
          <div
            className=
              "client-birthdays-state client-birthdays-error"
          >
            <RefreshCw
              size={20}
            />

            <span>
              {error}
            </span>
          </div>
        )
      }


      {
        !loading &&
        !error &&
        data &&
        data.items.length === 0 &&
        (
          <div
            className=
              "client-birthdays-state"
          >
            <CalendarDays
              size={22}
            />

            <span>
              На найближчі 7 днів іменинників немає.
            </span>
          </div>
        )
      }


      {
        data &&
        data.items.length > 0 &&
        (
          <div
            className=
              "client-birthdays-list"
          >
            {
              data.items.map(
                item => (
                  <article
                    key={
                      `${item.clientId}-${item.nextBirthday}`
                    }

                    className=
                      "client-birthday-row"
                  >
                    <div
                      className=
                        "client-birthday-main"
                    >
                      <strong>
                        {item.name}
                      </strong>

                      <div
                        className=
                          "client-birthday-meta"
                      >
                        <span>
                          {formatBirthday(item.nextBirthday)}
                        </span>

                        <span
                          aria-hidden=
                            "true"
                        >
                          ·
                        </span>

                        <span>
                          {item.ageTurning} р.
                        </span>
                      </div>

                      {
                        item.doctor &&
                        (
                          <small>
                            Лікар: {item.doctor}
                          </small>
                        )
                      }
                    </div>


                    <span
                      className={
                        item.daysUntil === 0
                          ? "client-birthday-day today"
                          : "client-birthday-day"
                      }
                    >
                      {daysLabel(item.daysUntil)}
                    </span>
                  </article>
                )
              )
            }
          </div>
        )
      }
    </div>
  </div>
</section>
)
}