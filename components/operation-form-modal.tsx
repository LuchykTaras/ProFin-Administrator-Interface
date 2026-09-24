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
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  getApiErrorMessage
} from "@/lib/client/api-client";

import {
  clearOperationFormSchemaCache,
  createOperation,
  getOperationFormSchema,
  prefetchOperationFormSchemas
} from "@/lib/client/operations-api";

import type {
  CreateOperationInput,
  CreateOperationResult,
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


type SchemaSelection = {
  operationType:
    string | null;

  category:
    string | null;

  article:
    string | null;
};


/*
 * PATCH 41
 *
 * Перетворення ключів
 * server-driven форми
 * у write-contract.
 *
 * Важливо:
 *
 * schema:
 *   patient
 *
 * create operation:
 *   patientId
 */
const CREATE_OPERATION_FIELD_MAP = {
  date:
    "date",

  account:
    "account",

  transferTo:
    "transferTo",

  type:
    "type",

  category:
    "category",

  article:
    "article",

  doctor:
    "doctor",

  patient:
    "patientId",

  unitPrice:
    "unitPrice",

  quantity:
    "quantity",

  amount:
    "amount",

  comment:
    "comment",

  packageStart:
    "packageStart",

  packageDuration:
    "packageDuration",

  packageMonthlyAmount:
    "packageMonthlyAmount",

  packageAccrualStart:
    "packageAccrualStart",

  vaccineName:
    "vaccineName",

  vaccinePatient:
    "patientId",

  vaccineQty:
    "vaccineQty",

  vaccineCost:
    "vaccineCost",

  vaccineSeries:
    "vaccineSeries",

  storedVaccineId:
    "storedVaccineId",

  assetName:
    "assetName",

  assetCategory:
    "assetCategory",

  assetAmortization:
    "assetAmortization",

  assetStartDate:
    "assetStartDate",

  inventoryName:
    "inventoryName",

  inventorySeries:
    "inventorySeries",

  inventoryExpiryDate:
    "inventoryExpiryDate",

  inventorySupplier:
    "inventorySupplier"
} as const;


/*
 * Поля, які повинні
 * передаватися числами.
 */
const NUMERIC_OPERATION_FIELDS =
  new Set<string>([
    "unitPrice",
    "quantity",
    "amount",
    "packageMonthlyAmount",
    "vaccineQty",
    "vaccineCost",
    "assetAmortization"
  ]);


/*
 * PATCH 41
 *
 * Формуємо payload ТІЛЬКИ
 * з полів поточного
 * видимого domain-сценарію.
 *
 * Це критично.
 *
 * Наприклад:
 *
 * Доходи
 *   НЕ отримують:
 *
 *   assetName
 *   assetCategory
 *   vaccineName
 *   inventoryName
 *
 * навіть якщо domain schema
 * раніше мала defaultValue
 * для інших сценаріїв.
 *
 * Trusted context:
 *
 * projectId
 * locationId
 * activeYear
 * spreadsheetId
 * actor
 * role
 *
 * browser НЕ передає.
 */
function buildCreateOperationInput(
  draft:
    OperationDraft,

  schema:
    OperationFormSchema,

  initialOperationType:
    string | null
): CreateOperationInput {
  const operation:
    Record<
      string,
      unknown
    > =
    {};


  /*
   * Збираємо лише ключі полів,
   * які реально належать
   * до поточної видимої schema.
   */
  const activeFieldKeys =
    new Set<string>();


  for (
    const section
    of schema.sections
  ) {
    if (
      !section.visible
    ) {
      continue;
    }


    for (
      const field
      of section.fields
    ) {
      if (
        !field.visible
      ) {
        continue;
      }


      activeFieldKeys.add(
        field.key
      );
    }
  }


  for (
    const [
      draftKey,
      operationKey
    ]
    of Object.entries(
      CREATE_OPERATION_FIELD_MAP
    )
  ) {
    /*
     * Поле не належить
     * до активного сценарію.
     *
     * У POST його
     * НЕ передаємо.
     */
    if (
      !activeFieldKeys.has(
        draftKey
      )
    ) {
      continue;
    }


    const rawValue =
      draft[
        draftKey as keyof
          OperationDraft
      ];


    if (
      rawValue ===
        undefined ||
      rawValue ===
        null ||
      rawValue ===
        ""
    ) {
      continue;
    }


    if (
      NUMERIC_OPERATION_FIELDS.has(
        operationKey
      )
    ) {
      const normalizedValue =
        typeof rawValue ===
          "string"
          ? rawValue
              .replace(
                ",",
                "."
              )
              .trim()
          : rawValue;


      const numericValue =
        Number(
          normalizedValue
        );


      if (
        Number.isFinite(
          numericValue
        )
      ) {
        operation[
          operationKey
        ] =
          numericValue;

        continue;
      }
    }


    operation[
      operationKey
    ] =
      rawValue;
  }


  /*
   * Якщо type не знаходиться
   * в draft, використовуємо
   * тип, з якого була
   * відкрита модалка.
   */
  if (
    !operation.type &&
    initialOperationType
  ) {
    operation.type =
      initialOperationType;
  }


  return operation as
    CreateOperationInput;
}


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
  onChange,
  locked = false
}: {
  field:
    OperationFormField;

  value:
    string;

  onChange:
    (
      value: string
    ) => void;

  locked?:
    boolean;
}) {
  const disabled =
    locked ||
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
                disabled &&
                !locked
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
  onFieldChange,
  locked = false
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

  locked?:
    boolean;
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

                    locked={
                      locked
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


  const [
    submitting,
    setSubmitting
  ] =
    useState(
      false
    );


  const [
    submitError,
    setSubmitError
  ] =
    useState(
      ""
    );


  const [
    submitResult,
    setSubmitResult
  ] =
    useState<
      CreateOperationResult |
      null
    >(
      null
    );


  const [
    submitReplayed,
    setSubmitReplayed
  ] =
    useState(
      false
    );


  /*
   * Захист від race condition
   * між schema-запитами.
   */
  const schemaRequestSequence =
    useRef(
      0
    );


  /*
   * Один idempotency key
   * на одну версію draft.
   */
  const idempotencyKeyRef =
    useRef<
      string |
      null
    >(
      null
    );


  const loadSchemaForSelection =
    useCallback(
      async (
        selection:
          SchemaSelection,

        signal?:
          AbortSignal
      ) => {
        const requestSequence =
          ++schemaRequestSequence.current;


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
                selection.operationType,

              category:
                selection.category,

              article:
                selection.article,

              signal
            });


          if (
            signal?.aborted ||
            requestSequence !==
              schemaRequestSequence.current
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
            signal?.aborted ||
            requestSequence !==
              schemaRequestSequence.current
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
            !signal?.aborted &&
            requestSequence ===
              schemaRequestSequence.current
          ) {
            setLoading(
              false
            );
          }
        }
      },
      []
    );


  /*
   * При відкритті нової модалки
   * очищаємо стан попередньої.
   */
  useEffect(
    () => {
      if (
        !open
      ) {
        return;
      }


      /*
       * Не показуємо schema попередньої модалки
       * під час першого READ нового сценарію.
       * Якщо PATCH 45 cache прогрітий, нова schema
       * підставиться практично одразу.
       */
      setSchema(
        null
      );


      setError(
        ""
      );


      setDraft(
        {}
      );


      setSubmitError(
        ""
      );


      setSubmitResult(
        null
      );


      setSubmitReplayed(
        false
      );


      setSubmitting(
        false
      );


      idempotencyKeyRef.current =
        null;
    },
    [
      open,
      initialOperationType
    ]
  );


  /*
   * INITIAL SCHEMA.
   */
  useEffect(
    () => {
      if (
        !open
      ) {
        return;
      }


      const controller =
        new AbortController();


      void loadSchemaForSelection(
        {
          operationType:
            initialOperationType,

          category:
            null,

          article:
            null
        },

        controller.signal
      );


      return () => {
        controller.abort();
      };
    },
    [
      open,
      reloadKey,
      initialOperationType,
      loadSchemaForSelection
    ]
  );


  /*
   * PATCH 45 — прогрів наступного server-driven рівня.
   *
   * Нічого не вираховуємо у React:
   * лише заздалегідь викликаємо той самий
   * GET /api/operations/form-schema для options,
   * які вже повернув domain core.
   */
  useEffect(
    () => {
      if (
        !open ||
        !schema ||
        loading ||
        error
      ) {
        return;
      }


      const operationType =
        String(
          draft.type ??
          initialOperationType ??
          ""
        )
          .trim();


      if (!operationType) {
        return;
      }


      const category =
        String(
          draft.category ??
          ""
        )
          .trim();


      const article =
        String(
          draft.article ??
          ""
        )
          .trim();


      const fields =
        schema.sections.flatMap(
          section =>
            section.fields
        );


      if (!category) {
        const categoryField =
          fields.find(
            field =>
              field.key ===
                "category"
          );


        const options =
          categoryField?.options ??
          [];


        if (options.length) {
          void prefetchOperationFormSchemas(
            options
              .slice(0, 10)
              .map(
                option => ({
                  operationType,
                  category:
                    option.value,
                  article:
                    null
                })
              ),
            2
          );
        }


        return;
      }


      if (!article) {
        const articleField =
          fields.find(
            field =>
              field.key ===
                "article"
          );


        const options =
          articleField?.options ??
          [];


        if (options.length) {
          void prefetchOperationFormSchemas(
            options
              .slice(0, 8)
              .map(
                option => ({
                  operationType,
                  category,
                  article:
                    option.value
                })
              ),
            2
          );
        }
      }
    },
    [
      open,
      schema,
      loading,
      error,
      draft.type,
      draft.category,
      draft.article,
      initialOperationType
    ]
  );


  /*
   * Нова schema не повинна
   * стирати вже введені поля.
   */
  useEffect(
    () => {
      if (
        !schema
      ) {
        return;
      }


      setDraft(
        current => {
          const nextDraft:
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
                Object.prototype
                  .hasOwnProperty.call(
                    current,
                    field.key
                  )
              ) {
                nextDraft[
                  field.key
                ] =
                  current[
                    field.key
                  ];

                continue;
              }


              if (
                field.defaultValue !==
                undefined
              ) {
                nextDraft[
                  field.key
                ] =
                  field.defaultValue;
              }
            }
          }


          return nextDraft;
        }
      );
    },
    [
      schema
    ]
  );


  /*
   * ESC закриває форму,
   * але не під час POST.
   */
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
      onClose,
      submitting
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


  /*
   * Перевіряємо required-поля.
   */
  const requiredFieldsComplete =
    useMemo(
      () => {
        for (
          const section
          of visibleSections
        ) {
          for (
            const field
            of section.fields
          ) {
            if (
              !field.visible ||
              !field.required
            ) {
              continue;
            }


            const value =
              draft[
                field.key
              ] ??
              field.defaultValue ??
              "";


            if (
              String(
                value
              )
                .trim() ===
              ""
            ) {
              return false;
            }
          }
        }


        return true;
      },
      [
        visibleSections,
        draft
      ]
    );


  if (
    !open
  ) {
    return null;
  }


  /*
   * type
   *   ↓
   * category
   *   ↓
   * article
   *
   * викликають dependent schema.
   */
  function changeField(
    field:
      OperationFormField,

    value:
      string
  ) {
    if (
      submitting
    ) {
      return;
    }


    /*
     * Будь-яка зміна draft
     * означає нову операцію,
     * тому старий idempotency key
     * більше не використовуємо.
     */
    idempotencyKeyRef.current =
      null;


    setSubmitError(
      ""
    );


    setSubmitResult(
      null
    );


    setSubmitReplayed(
      false
    );


    const nextDraft:
      OperationDraft = {
        ...draft,

        [field.key]:
          value
      };


    if (
      field.key ===
      "type"
    ) {
      nextDraft.category =
        "";

      nextDraft.article =
        "";
    }


    if (
      field.key ===
      "category"
    ) {
      nextDraft.article =
        "";
    }


    setDraft(
      nextDraft
    );


    if (
      field.key !==
        "type" &&
      field.key !==
        "category" &&
      field.key !==
        "article"
    ) {
      return;
    }


    const operationType =
      (
        field.key ===
          "type"
          ? value
          : String(
              nextDraft.type ??
              initialOperationType ??
              ""
            )
      )
        .trim() ||
      null;


    const category =
      String(
        nextDraft.category ??
        ""
      )
        .trim() ||
      null;


    const article =
      String(
        nextDraft.article ??
        ""
      )
        .trim() ||
      null;


    void loadSchemaForSelection({
      operationType,
      category,
      article
    });
  }


  const canSubmit =
    Boolean(
      domainReady &&
      schema?.canSubmit &&
      requiredFieldsComplete &&
      !loading &&
      !submitting &&
      !submitResult
    );


  /*
   * PATCH 41
   *
   * Фактичне проведення.
   */
  async function submitOperation() {
    if (
      !canSubmit ||
      submitting ||
      !schema
    ) {
      return;
    }


    setSubmitting(
      true
    );


    setSubmitError(
      ""
    );


    /*
     * Один key на одну
     * незмінену версію draft.
     */
    if (
      !idempotencyKeyRef.current
    ) {
      idempotencyKeyRef.current =
        `profin-web-${crypto.randomUUID()}`;
    }


    try {
      /*
       * PATCH 41:
       *
       * Передаємо schema
       * у builder.
       *
       * Тепер builder знає,
       * які поля реально
       * належать до поточного
       * domain-сценарію.
       */
      const operation =
        buildCreateOperationInput(
          draft,
          schema,
          initialOperationType
        );


      const result =
        await createOperation({
          operation,

          idempotencyKey:
            idempotencyKeyRef.current
        });


      setSubmitResult(
        result.operation
      );


      setSubmitReplayed(
        result.idempotencyReplayed
      );

    } catch (
      submitOperationError
    ) {
      /*
       * Не робимо console.error
       * для очікуваної API-відмови,
       * щоб Next dev overlay
       * не перекривав форму.
       *
       * Помилку показуємо
       * безпосередньо у UI.
       */
      setSubmitError(
        getApiErrorMessage(
          submitOperationError,

          "Не вдалося провести операцію."
        )
      );

    } finally {
      setSubmitting(
        false
      );
    }
  }


  return (
    <div
      className=
        "operation-modal-backdrop"

      role=
        "presentation"

      onMouseDown={
        event => {
          if (
            submitting
          ) {
            return;
          }


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

            disabled={
              submitting
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
            !schema &&
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
            loading &&
            schema &&
            !error &&
            (
              <div
                className=
                  "operation-schema-refresh-bar"

                role=
                  "status"

                aria-live=
                  "polite"
              >
                <LoaderCircle
                  className=
                    "operation-schema-spinner"

                  size={18}
                />

                <span>
                  Оновлюємо залежні поля з domain schema…
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
                    () => {
                      clearOperationFormSchemaCache();

                      setReloadKey(
                        value =>
                          value + 1
                      );
                    }
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
            submitError &&
            (
              <div
                className=
                  "operation-schema-state operation-schema-error"
              >
                <AlertTriangle
                  size={28}
                />

                <strong>
                  Операцію не проведено
                </strong>

                <span>
                  {
                    submitError
                  }
                </span>
              </div>
            )
          }


          {
            submitResult &&
            (
              <div
                className=
                  "operation-schema-state"
              >
                <CheckCircle2
                  size={30}
                />

                <strong>
                  Операцію проведено
                </strong>

                <span>
                  ID операції:{" "}
                  {
                    submitResult
                      .operationId
                  }
                </span>


                {
                  submitReplayed &&
                  (
                    <small>
                      Сервер повернув
                      уже проведену
                      операцію за тим
                      самим idempotency key.
                    </small>
                  )
                }
              </div>
            )
          }


          {
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

                        locked={
                          loading ||
                          submitting ||
                          Boolean(
                            submitResult
                          )
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
                submitResult ||
                canSubmit
                  ? "operation-state-dot ready"
                  : "operation-state-dot"
              }
            />


            {
              submitResult
                ? `Операцію проведено — ${submitResult.operationId}`
                : submitError
                  ? "Помилка проведення"
                  : submitting
                    ? "Проводимо операцію…"
                    : schema?.unavailableReason ??
                      (
                        canSubmit
                          ? "Форма готова"
                          : loading
                            ? "Оновлення domain schema"
                            : !requiredFieldsComplete
                              ? "Заповніть обов’язкові поля"
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

              disabled={
                submitting
              }
            >
              {
                submitResult
                  ? "Закрити"
                  : "Скасувати"
              }
            </button>


            <button
              type="button"

              className=
                "operation-primary-button"

              disabled={
                !canSubmit
              }

              onClick={
                submitOperation
              }
            >
              {
                submitting
                  ? (
                      <LoaderCircle
                        className=
                          "operation-schema-spinner"

                        size={18}
                      />
                    )
                  : (
                      <Save
                        size={18}
                      />
                    )
              }


              {
                submitResult
                  ? "Проведено"
                  : submitting
                    ? "Проводимо…"
                    : "Провести операцію"
              }
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}