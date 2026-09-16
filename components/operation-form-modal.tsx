"use client";

import {
  AlertTriangle,
  Boxes,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  Package,
  RefreshCw,
  Save,
  Syringe,
  X
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState
} from "react";

import {
  getApiErrorMessage
} from "@/lib/client/api-client";

import {
  getOperationFormSchema
} from "@/lib/client/operations-api";

import type {
  OperationDraft,
  OperationFormField,
  OperationFormSchema,
  OperationFormSection
} from "@/lib/contracts/operations";


type OperationFormModalProps = {
  open: boolean;

  domainReady: boolean;

  initialOperationType:
    string | null;

  onClose:
    () => void;
};


function ConditionalIcon({
  id
}: {
  id:
    OperationFormSection["id"];
}) {
  if (
    id ===
    "package"
  ) {
    return (
      <Package
        size={20}
      />
    );
  }


  if (
    id ===
      "vaccine" ||
    id ===
      "vaccine-status"
  ) {
    return (
      <Syringe
        size={20}
      />
    );
  }


  if (
    id ===
    "inventory"
  ) {
    return (
      <Boxes
        size={20}
      />
    );
  }


  return (
    <BriefcaseBusiness
      size={20}
    />
  );
}


function FieldControl({
  field,
  value,
  onChange
}: {
  field:
    OperationFormField;

  value:
    string;

  onChange:
    (
      value: string
    ) => void;
}) {
  const disabled =
    !field.enabled;


  if (
    field.kind ===
      "select" ||
    field.kind ===
      "entity-select"
  ) {
    const options =
      field.options ??
      [];


    return (
      <div
        className=
          "operation-select-shell"
      >
        <select
          value={
            value
          }

          disabled={
            disabled
          }

          onChange={
            event =>
              onChange(
                event
                  .target
                  .value
              )
          }
        >
          <option value="">
            {
              field.placeholder ??
              (
                disabled
                  ? "Очікує domain schema"
                  : "Оберіть значення"
              )
            }
          </option>


          {
            options.map(
              option => (
                <option
                  key={
                    option.value
                  }

                  value={
                    option.value
                  }
                >
                  {
                    option.label
                  }
                </option>
              )
            )
          }
        </select>


        <ChevronDown
          size={16}
        />
      </div>
    );
  }


  if (
    field.kind ===
    "textarea"
  ) {
    return (
      <textarea
        value={
          value
        }

        disabled={
          disabled
        }

        placeholder={
          field.placeholder
        }

        onChange={
          event =>
            onChange(
              event
                .target
                .value
            )
        }
      />
    );
  }


  if (
    field.kind ===
    "readonly"
  ) {
    return (
      <div
        className=
          "operation-input-shell"
      >
        <input
          value={
            value
          }

          readOnly

          disabled

          placeholder={
            field.placeholder ??
            "Заповнюється автоматично"
          }
        />
      </div>
    );
  }


  return (
    <div
      className={
        field.kind ===
          "date"
          ? "operation-input-shell with-icon"
          : "operation-input-shell"
      }
    >
      {
        field.kind ===
          "date" &&
        (
          <CalendarDays
            size={16}
          />
        )
      }


      <input
        type={
          field.kind ===
            "number"
            ? "number"
            : field.kind ===
                "date"
              ? "date"
              : "text"
        }

        value={
          value
        }

        disabled={
          disabled
        }

        placeholder={
          field.placeholder
        }

        step={
          field.kind ===
            "number"
            ? "0.01"
            : undefined
        }

        onChange={
          event =>
            onChange(
              event
                .target
                .value
            )
        }
      />
    </div>
  );
}


function FormSection({
  section,
  draft,
  onFieldChange
}: {
  section:
    OperationFormSection;

  draft:
    OperationDraft;

  onFieldChange:
    (
      field:
        OperationFormField,

      value:
        string
    ) => void;
}) {
  const fields =
    section
      .fields
      .filter(
        field =>
          field.visible
      );


  return (
    <section
      className=
        "operation-form-section"
    >
      <div
        className=
          "operation-section-heading"
      >
        <div>
          <h3>
            {
              section.title
            }
          </h3>

          {
            section.description &&
            (
              <p>
                {
                  section.description
                }
              </p>
            )
          }
        </div>


        <span
          className=
            "operation-section-badge"
        >
          {
            fields.length
          }

          {" "}

          полів
        </span>
      </div>


      <div
        className=
          "operation-fields-grid"
      >
        {
          fields.map(
            field => {
              const rawValue =
                draft[
                  field.key
                ];


              const value =
                rawValue ===
                  undefined ||
                rawValue ===
                  null
                  ? ""
                  : String(
                      rawValue
                    );


              return (
                <label
                  key={
                    field.key
                  }

                  className={
                    field.kind ===
                      "textarea"
                      ? "operation-field operation-field-full"
                      : "operation-field"
                  }
                >
                  <span>
                    {
                      field.label
                    }


                    {
                      field.required &&
                      (
                        <b
                          className=
                            "operation-required-mark"
                        >
                          *
                        </b>
                      )
                    }
                  </span>


                  <FieldControl
                    field={
                      field
                    }

                    value={
                      value
                    }

                    onChange={
                      nextValue =>
                        onFieldChange(
                          field,
                          nextValue
                        )
                    }
                  />


                  {
                    field.source ===
                      "DOMAIN" &&
                    (
                      <small>
                        Джерело: domain schema
                      </small>
                    )
                  }
                </label>
              );
            }
          )
        }
      </div>
    </section>
  );
}


export function OperationFormModal({
  open,
  domainReady,
  initialOperationType,
  onClose
}: OperationFormModalProps) {
  const [
    schema,
    setSchema
  ] =
    useState<
      OperationFormSchema |
      null
    >(
      null
    );


  const [
    draft,
    setDraft
  ] =
    useState<
      OperationDraft
    >(
      {}
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


  const [
    reloadKey,
    setReloadKey
  ] =
    useState(
      0
    );


  useEffect(
    () => {
      if (
        !open
      ) {
        return;
      }


      const controller =
        new AbortController();


      async function loadSchema() {
        setLoading(
          true
        );

        setError(
          ""
        );


        try {
          const nextSchema =
            await getOperationFormSchema({
              operationType:
                initialOperationType,

              signal:
                controller.signal
            });


          if (
            controller
              .signal
              .aborted
          ) {
            return;
          }


          setSchema(
            nextSchema
          );
        } catch (
          loadError
        ) {
          if (
            controller
              .signal
              .aborted
          ) {
            return;
          }


          console.error(
            loadError
          );


          setSchema(
            null
          );


          setError(
            getApiErrorMessage(
              loadError,

              "Не вдалося отримати структуру форми."
            )
          );
        } finally {
          if (
            !controller
              .signal
              .aborted
          ) {
            setLoading(
              false
            );
          }
        }
      }


      void loadSchema();


      return () => {
        controller.abort();
      };
    },
    [
      open,
      reloadKey,
      initialOperationType
    ]
  );


  useEffect(
    () => {
      if (
        !schema
      ) {
        return;
      }


      const defaults:
        OperationDraft =
        {};


      for (
        const section
        of schema.sections
      ) {
        for (
          const field
          of section.fields
        ) {
          if (
            field.defaultValue !==
            undefined
          ) {
            defaults[
              field.key
            ] =
              field.defaultValue;
          }
        }
      }


      setDraft(
        defaults
      );
    },
    [
      schema
    ]
  );


  useEffect(
    () => {
      if (
        !open
      ) {
        return;
      }


      function handleKeyDown(
        event:
          KeyboardEvent
      ) {
        if (
          event.key ===
          "Escape"
        ) {
          onClose();
        }
      }


      document.addEventListener(
        "keydown",
        handleKeyDown
      );


      document.body.style.overflow =
        "hidden";


      return () => {
        document.removeEventListener(
          "keydown",
          handleKeyDown
        );


        document.body.style.overflow =
          "";
      };
    },
    [
      open,
      onClose
    ]
  );


  const visibleSections =
    useMemo(
      () =>
        schema
          ?.sections
          .filter(
            section =>
              section.visible
          ) ??
        [],
      [
        schema
      ]
    );


  const pendingSections =
    useMemo(
      () =>
        schema
          ?.sections
          .filter(
            section =>
              !section.visible &&
              section.domainControlled
          ) ??
        [],
      [
        schema
      ]
    );


  if (
    !open
  ) {
    return null;
  }


  function changeField(
    field:
      OperationFormField,

    value:
      string
  ) {
    setDraft(
      current => ({
        ...current,

        [field.key]:
          value
      })
    );
  }


  const canSubmit =
    Boolean(
      domainReady &&
      schema?.canSubmit
    );


  return (
    <div
      className=
        "operation-modal-backdrop"

      role=
        "presentation"

      onMouseDown={
        event => {
          if (
            event.target ===
            event.currentTarget
          ) {
            onClose();
          }
        }
      }
    >
      <section
        className=
          "operation-modal"

        role=
          "dialog"

        aria-modal=
          "true"

        aria-labelledby=
          "operation-modal-title"
      >
        <header
          className=
            "operation-modal-header"
        >
          <div>
            <span
              className=
                "operation-modal-eyebrow"
            >
              ProFin OS
            </span>


            <h2
              id=
                "operation-modal-title"
            >
              {
                initialOperationType
                  ? `Нова операція — ${initialOperationType}`
                  : "Нова операція"
              }
            </h2>


            <p>
              Структура форми
              завантажується через
              server API.
            </p>
          </div>


          <button
            type="button"

            className=
              "operation-modal-close"

            onClick={
              onClose
            }

            aria-label=
              "Закрити"
          >
            <X
              size={21}
            />
          </button>
        </header>


        {
          !domainReady &&
          (
            <div
              className=
                "operation-domain-warning"
            >
              <AlertTriangle
                size={19}
              />

              <div>
                <strong>
                  Domain adapter ще
                  не підключений
                </strong>

                <span>
                  Тип операції вже
                  передано серверу.
                  Категорії, статті,
                  залежні поля,
                  перевірки та
                  проведення будуть
                  визначатися domain core.
                </span>
              </div>
            </div>
          )
        }


        <div
          className=
            "operation-modal-body"
        >
          {
            loading &&
            (
              <div
                className=
                  "operation-schema-state"
              >
                <LoaderCircle
                  className=
                    "operation-schema-spinner"

                  size={28}
                />

                <strong>
                  Завантаження
                  структури форми
                </strong>

                <span>
                  Отримуємо дозволений
                  server-side contract…
                </span>
              </div>
            )
          }


          {
            !loading &&
            error &&
            (
              <div
                className=
                  "operation-schema-state operation-schema-error"
              >
                <AlertTriangle
                  size={28}
                />

                <strong>
                  Форму не вдалося
                  завантажити
                </strong>

                <span>
                  {
                    error
                  }
                </span>

                <button
                  type="button"

                  className=
                    "operation-schema-retry"

                  onClick={
                    () =>
                      setReloadKey(
                        value =>
                          value + 1
                      )
                  }
                >
                  <RefreshCw
                    size={16}
                  />

                  Спробувати ще раз
                </button>
              </div>
            )
          }


          {
            !loading &&
            !error &&
            schema &&
            (
              <>
                {
                  visibleSections.map(
                    section => (
                      <FormSection
                        key={
                          section.id
                        }

                        section={
                          section
                        }

                        draft={
                          draft
                        }

                        onFieldChange={
                          changeField
                        }
                      />
                    )
                  )
                }


                {
                  pendingSections.length >
                    0 &&
                  (
                    <section
                      className=
                        "operation-form-section"
                    >
                      <div
                        className=
                          "operation-section-heading"
                      >
                        <div>
                          <h3>
                            Умовні блоки
                          </h3>

                          <p>
                            Їх видимість
                            визначатиме
                            domain schema.
                          </p>
                        </div>
                      </div>


                      <div
                        className=
                          "operation-condition-grid"
                      >
                        {
                          pendingSections.map(
                            section => (
                              <article
                                key={
                                  section.id
                                }

                                className=
                                  "operation-condition-card"
                              >
                                <div
                                  className=
                                    "operation-condition-icon"
                                >
                                  <ConditionalIcon
                                    id={
                                      section.id
                                    }
                                  />
                                </div>


                                <div>
                                  <strong>
                                    {
                                      section.title
                                    }
                                  </strong>

                                  <p>
                                    {
                                      section.description
                                    }
                                  </p>

                                  <ul>
                                    {
                                      section.fields.map(
                                        field => (
                                          <li
                                            key={
                                              field.key
                                            }
                                          >
                                            {
                                              field.label
                                            }
                                          </li>
                                        )
                                      )
                                    }
                                  </ul>
                                </div>


                                <span
                                  className=
                                    "operation-waiting-badge"
                                >
                                  Очікує schema
                                </span>
                              </article>
                            )
                          )
                        }
                      </div>
                    </section>
                  )
                }


                <section
                  className=
                    "operation-contract-note"
                >
                  <CheckCircle2
                    size={19}
                  />

                  <div>
                    <strong>
                      Форма server-driven
                    </strong>

                    <span>
                      React не визначає
                      FEFO, категорії,
                      статті, залежності
                      або результат
                      проведення.
                    </span>
                  </div>
                </section>
              </>
            )
          }
        </div>


        <footer
          className=
            "operation-modal-footer"
        >
          <div
            className=
              "operation-footer-state"
          >
            <span
              className={
                canSubmit
                  ? "operation-state-dot ready"
                  : "operation-state-dot"
              }
            />

            {
              schema?.unavailableReason ??
              (
                canSubmit
                  ? "Форма готова"
                  : "Очікує domain adapter"
              )
            }
          </div>


          <div
            className=
              "operation-footer-actions"
          >
            <button
              type="button"

              className=
                "operation-secondary-button"

              onClick={
                onClose
              }
            >
              Скасувати
            </button>


            <button
              type="button"

              className=
                "operation-primary-button"

              disabled={
                !canSubmit
              }
            >
              <Save
                size={18}
              />

              Провести операцію
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}