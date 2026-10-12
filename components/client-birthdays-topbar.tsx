"use client";

import {
  CakeSlice,
  X
} from "lucide-react";

import {
  useEffect,
  useRef,
  useState
} from "react";

import {
  ClientBirthdays
} from "@/components/client-birthdays";


type ClientBirthdaysTopbarProps = {
  refreshKey?:
    number;
};


export function ClientBirthdaysTopbar({
  refreshKey
}: ClientBirthdaysTopbarProps) {
  const [
    open,
    setOpen
  ] =
    useState(
      false
    );


  const rootRef =
    useRef<
      HTMLDivElement | null
    >(
      null
    );


  useEffect(
    () => {
      if (
        !open
      ) {
        return;
      }


      function handlePointerDown(
        event:
          MouseEvent
      ) {
        const target =
          event.target;


        if (
          !(target instanceof Node)
        ) {
          return;
        }


        if (
          rootRef.current &&
          !rootRef.current.contains(
            target
          )
        ) {
          setOpen(
            false
          );
        }
      }


      function handleKeyDown(
        event:
          KeyboardEvent
      ) {
        if (
          event.key ===
          "Escape"
        ) {
          setOpen(
            false
          );
        }
      }


      document.addEventListener(
        "mousedown",
        handlePointerDown
      );


      document.addEventListener(
        "keydown",
        handleKeyDown
      );


      return () => {
        document.removeEventListener(
          "mousedown",
          handlePointerDown
        );


        document.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    },
    [
      open
    ]
  );


  return (
    <div
      ref={
        rootRef
      }

      className=
        "topbar-birthdays"
    >
      <button
        type=
          "button"

        className={
          open
            ? "topbar-birthdays-button active"
            : "topbar-birthdays-button"
        }

        aria-label=
          "Іменинники"

        aria-expanded={
          open
        }

        title=
          "Іменинники"

        onClick={
          () => {
            setOpen(
              value =>
                !value
            );
          }
        }
      >
        <CakeSlice
          size={19}
        />

        <span
          className=
            "topbar-birthdays-label"
        >
          Іменинники
        </span>
      </button>


      {
        open &&
        (
          <div
            className=
              "topbar-birthdays-popover"
          >
            <div
              className=
                "topbar-birthdays-popover-header"
            >
              <div>
                <strong>
                  Іменинники
                </strong>

                <span>
                  Сьогодні та найближчі дні
                </span>
              </div>


              <button
                type=
                  "button"

                className=
                  "topbar-birthdays-close"

                aria-label=
                  "Закрити іменинників"

                onClick={
                  () => {
                    setOpen(
                      false
                    );
                  }
                }
              >
                <X
                  size={17}
                />
              </button>
            </div>


            <div
              className=
                "topbar-birthdays-content"
            >
              <ClientBirthdays
                active={
                  open
                }

                refreshKey={
                  refreshKey
                }
              />
            </div>
          </div>
        )
      }
    </div>
  );
}