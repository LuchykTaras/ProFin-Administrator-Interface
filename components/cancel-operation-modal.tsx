"use client";

import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
  ShieldAlert,
  X
} from "lucide-react";

import {
  useEffect,
  useState
} from "react";


type CancelOperationModalProps = {
  open:
    boolean;

  submitting:
    boolean;

  error:
    string;

  successMessage:
    string;

    onClose:
    () => void;

  onResetFeedback?:
    () => void;

  onSubmit:
    (
      operationId:
        string
    ) => void;
};


type CancelStep =
  | "input"
  | "confirm";


export function CancelOperationModal({
  open,
  submitting,
  error,
  successMessage,
  onClose,
  onResetFeedback,
  onSubmit
}: CancelOperationModalProps) {
  const [
    operationId,
    setOperationId
  ] =
    useState(
      ""
    );


  const [
    step,
    setStep
  ] =
    useState<CancelStep>(
      "input"
    );


  const [
    localError,
    setLocalError
  ] =
    useState(
      ""
    );


  useEffect(
    () => {
      if (
        !open
      ) {
        setOperationId(
          ""
        );

        setStep(
          "input"
        );

        setLocalError(
          ""
        );

        return;
      }


      function handleKeyDown(
        event:
          KeyboardEvent
      ) {
        if (
          event.key ===
            "Escape" &&
          !submitting
        ) {
          onClose();
        }
      }


      document.addEventListener(
        "keydown",
        handleKeyDown
      );


      return () => {
        document.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    },
    [
      open,
      submitting,
      onClose
    ]
  );


  if (
    !open
  ) {
    return null;
  }


  const normalizedOperationId =
    operationId.trim();


  const showSuccess =
    Boolean(
      successMessage
    );


  function continueToConfirmation() {
    if (
      !normalizedOperationId
    ) {
      setLocalError(
        "Вкажіть точний ID проведеної операції."
      );

      return;
    }


    setLocalError(
      ""
    );

    setStep(
      "confirm"
    );
  }


  return (
    <div
      className=
        "cancel-modal-backdrop"

      role=
        "presentation"

      onMouseDown={
        event => {
          if (
            event.target ===
              event.currentTarget &&
            !submitting
          ) {
            onClose();
          }
        }
      }
    >
      <section
        className=
          "cancel-modal"

        role=
          "dialog"

        aria-modal=
          "true"

        aria-labelledby=
          "cancel-operation-title"
      >
        <header
          className=
            "cancel-modal-header"
        >
          <div
            className=
              "cancel-modal-heading"
          >
            <span
              className=
                "cancel-modal-icon"
            >
              <RotateCcw
                size={21}
              />
            </span>


            <div>
              <span
                className=
                  "cancel-modal-eyebrow"
              >
                OPERATION CANCELLATION
              </span>


              <h2
                id=
                  "cancel-operation-title"
              >
                Скасування операції
              </h2>


              <p>
                Проведений запис не видаляється
                фізично. Рішення та наслідки
                визначає чинна серверна логіка.
              </p>
            </div>
          </div>


          <button
            type=
              "button"

            className=
              "cancel-modal-close"

            aria-label=
              "Закрити"

            disabled={
              submitting
            }

            onClick={
              onClose
            }
          >
            <X
              size={18}
            />
          </button>
        </header>


        {
          showSuccess
            ? (
                <div
                  className=
                    "cancel-modal-success"
                >
                  <span
                    className=
                      "cancel-success-icon"
                  >
                    <CheckCircle2
                      size={30}
                    />
                  </span>


                  <strong>
                    Операцію оброблено
                  </strong>


                  <p>
                    {
                      successMessage
                    }
                  </p>


                  <button
                    type=
                      "button"

                    className=
                      "cancel-secondary-button"

                    onClick={
                      onClose
                    }
                  >
                    Закрити
                  </button>
                </div>
              )
            : (
                <>
                  <div
                    className=
                      "cancel-modal-body"
                  >
                    {
                      step ===
                        "input"
                        ? (
                            <>
                              <div
                                className=
                                  "cancel-modal-notice"
                              >
                                <ShieldAlert
                                  size={19}
                                />


                                <div>
                                  <strong>
                                    Контрольована дія
                                  </strong>

                                  <span>
                                    UI лише передає точний
                                    operationId. Дозвіл,
                                    блокування та залежності
                                    перевіряються backend.
                                  </span>
                                </div>
                              </div>


                              <label
                                className=
                                  "cancel-operation-field"
                              >
                                <span>
                                  ID операції
                                </span>


                                <input
                                  type=
                                    "text"

                                  value={
                                    operationId
                                  }

                                  autoFocus

                                  autoComplete=
                                    "off"

                                  placeholder=
                                    "Наприклад: OP-2026-..."

                                  disabled={
                                    submitting
                                  }

                                  onChange={
                                  event => {
                                  setOperationId(
                                  event.target.value
                                  );


                                  if (
                                  localError
                                  ) {
                                  setLocalError(
                                  ""
                                  );
                                  }


                                  if (
                                  error ||
                                  successMessage
                                  ) {
                                  onResetFeedback?.();
                                  }
                                }
                              }

                                  onKeyDown={
                                    event => {
                                      if (
                                        event.key ===
                                        "Enter"
                                      ) {
                                        event.preventDefault();

                                        continueToConfirmation();
                                      }
                                    }
                                  }
                                />


                                <small>
                                  Введіть точний ID уже
                                  проведеної операції.
                                </small>
                              </label>


                              {
                                localError &&
                                (
                                  <div
                                    className=
                                      "cancel-modal-error"

                                    role=
                                      "alert"
                                  >
                                    <AlertTriangle
                                      size={17}
                                    />

                                    <span>
                                      {
                                        localError
                                      }
                                    </span>
                                  </div>
                                )
                              }
                            </>
                          )
                        : (
                            <>
                              <div
                                className=
                                  "cancel-confirm-card"
                              >
                                <span
                                  className=
                                    "cancel-confirm-icon"
                                >
                                  <AlertTriangle
                                    size={24}
                                  />
                                </span>


                                <div>
                                  <span>
                                    Ви збираєтесь скасувати
                                    операцію
                                  </span>


                                  <code>
                                    {
                                      normalizedOperationId
                                    }
                                  </code>
                                </div>
                              </div>


                              <div
                                className=
                                  "cancel-confirm-warning"
                              >
                                <strong>
                                  Підтвердіть дію
                                </strong>

                                <p>
                                  Операція не буде фізично
                                  видалена. Сервер застосує
                                  чинну політику скасування,
                                  перевірить залежності та
                                  поверне фактичний результат.
                                </p>
                              </div>


                              {
                                error &&
                                (
                                  <div
                                    className=
                                      "cancel-modal-error"

                                    role=
                                      "alert"
                                  >
                                    <AlertTriangle
                                      size={17}
                                    />

                                    <span>
                                      {
                                        error
                                      }
                                    </span>
                                  </div>
                                )
                              }
                            </>
                          )
                    }
                  </div>


                  <footer
                    className=
                      "cancel-modal-footer"
                  >
                    {
                      step ===
                        "input"
                        ? (
                            <>
                              <button
                                type=
                                  "button"

                                className=
                                  "cancel-secondary-button"

                                disabled={
                                  submitting
                                }

                                onClick={
                                  onClose
                                }
                              >
                                Закрити
                              </button>


                              <button
                                type=
                                  "button"

                                className=
                                  "cancel-primary-button"

                                disabled={
                                  !normalizedOperationId ||
                                  submitting
                                }

                                onClick={
                                  continueToConfirmation
                                }
                              >
                                Продовжити
                              </button>
                            </>
                          )
                        : (
                            <>
                              <button
                                type=
                                  "button"

                                className=
                                  "cancel-secondary-button"

                                disabled={
                                  submitting
                                }

                                onClick={
                                () => {
                                setStep(
                                "input"
                                );

                            setLocalError(
                            ""
                            );

                         onResetFeedback?.();
                         }
                      }
                              >
                                <ArrowLeft
                                  size={16}
                                />

                                Назад
                              </button>


                              <button
                                type=
                                  "button"

                                className=
                                  "cancel-danger-button"

                                disabled={
                                  submitting
                                }

                                onClick={
                                  () => {
                                    onSubmit(
                                      normalizedOperationId
                                    );
                                  }
                                }
                              >
                                <RotateCcw
                                  size={16}
                                />

                                {
                                  submitting
                                    ? "Скасування…"
                                    : "Підтвердити скасування"
                                }
                              </button>
                            </>
                          )
                    }
                  </footer>
                </>
              )
        }
      </section>
    </div>
  );
}