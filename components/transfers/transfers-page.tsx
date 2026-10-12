"use client";

import {
  ArrowLeftRight,
  Boxes,
  Building2,
  ShieldCheck
} from "lucide-react";


type TransfersPageProps = {
  active:
    boolean;
};


export function TransfersPage({
  active
}: TransfersPageProps) {
  if (
    !active
  ) {
    return null;
  }


  return (
    <section
      className=
        "transfers-page"
    >
      <div
        className=
          "transfers-page-header"
      >
        <div>
          <span
            className=
              "transfers-eyebrow"
          >
            INVENTORY TRANSFERS
          </span>

          <h2>
            Переміщення
          </h2>

          <p>
            Контроль міжфілійних переміщень
            товарів і складських партій.
          </p>
        </div>


        <div
          className=
            "transfers-header-icon"
          aria-hidden=
            "true"
        >
          <ArrowLeftRight
            size={26}
          />
        </div>
      </div>


      <div
        className=
          "transfers-overview-grid"
      >
        <article
          className=
            "transfers-overview-card"
        >
          <span
            className=
              "transfers-overview-icon"
          >
            <Boxes
              size={20}
            />
          </span>

          <div>
            <span>
              Складські партії
            </span>

            <strong>
              Без mock-даних
            </strong>

            <small>
              Реальні позиції будуть
              отримуватися з чинного
              domain core.
            </small>
          </div>
        </article>


        <article
          className=
            "transfers-overview-card"
        >
          <span
            className=
              "transfers-overview-icon"
          >
            <Building2
              size={20}
            />
          </span>

          <div>
            <span>
              Маршрут переміщення
            </span>

            <strong>
              Server-side context
            </strong>

            <small>
              Філії та дозволені маршрути
              не визначаються у frontend.
            </small>
          </div>
        </article>


        <article
          className=
            "transfers-overview-card"
        >
          <span
            className=
              "transfers-overview-icon"
          >
            <ShieldCheck
              size={20}
            />
          </span>

          <div>
            <span>
              Контроль операції
            </span>

            <strong>
              Domain controlled
            </strong>

            <small>
              Статуси, дозволи та переходи
              визначає backend.
            </small>
          </div>
        </article>
      </div>


      <section
        className=
          "transfers-workspace"
      >
        <div
          className=
            "transfers-workspace-heading"
        >
          <div>
            <span
              className=
                "transfers-section-label"
            >
              TRANSFER WORKSPACE
            </span>

            <h3>
              Міжфілійні переміщення
            </h3>
          </div>
        </div>


        <div
          className=
            "transfers-empty-state"
        >
          <span
            className=
              "transfers-empty-icon"
          >
            <ArrowLeftRight
              size={30}
            />
          </span>

          <strong>
            Робоча область переміщень готова
          </strong>

          <p>
            На наступних кроках тут зʼявляться
            вкладки «Вихідні / Вхідні» та
            серверні дії для переміщень.
          </p>
        </div>
      </section>
    </section>
  );
}