"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  LoaderCircle,
  RefreshCw,
  Save,
  X
} from "lucide-react";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { UkrainianDatePicker } from "@/components/ukrainian-date-picker";

import {
  ApiClientError,
  getApiErrorMessage
} from "@/lib/client/api-client";

import {
  clearOperationFormSchemaCache,
  createOperation,
  getOperationFormSchema
} from "@/lib/client/operations-api";

import {
  getOperationPatientOptions
} from "@/lib/client/operation-patients-api";

import type {
  CreateOperationInput,
  CreateOperationNewClientInput,
  CreateOperationResult,
  OperationDraft,
  OperationFieldOption,
  OperationFormField,
  OperationFormSchema,
  OperationFormSection
} from "@/lib/contracts/operations";


type OperationFormModalProps = {
  open: boolean;

  domainReady: boolean;

  initialOperationType:
    string | null;

  initialNewClient?:
    boolean;

  onSuccess?:
    (
      result:
        CreateOperationResult
    ) => void;

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


type NewClientDraft = {
  name: string;

  birthDate: string;

  trustedPerson: string;

  trustedPhone: string;
};


const EMPTY_NEW_CLIENT_DRAFT:
NewClientDraft = {
  name: "",
  birthDate: "",
  trustedPerson: "",
  trustedPhone: ""
};

const CONDITIONAL_BLOCKS = [
  { id: "package", title: "Пакет" },
  { id: "vaccine", title: "Вакцина" },
  { id: "inventory", title: "Склад" },
  { id: "asset", title: "Актив" },
    { id: "vaccine-status", title: "Статус вакцини" }
] as const;

const PERF11_ENABLED =
  process.env
    .NEXT_PUBLIC_PROFIN_PARALLEL_INCOME_SCHEMA_ENABLED ===
  "true";

const PERF15_ENABLED =
  process.env
    .NEXT_PUBLIC_PROFIN_PERF15_LOCAL_INCOME_OPTIONS_ENABLED ===
  "true";


function normalizeNewClientDraft(
  draft:
    NewClientDraft
): CreateOperationNewClientInput | null {
  const name =
    draft.name.trim();

  const birthDate =
    draft.birthDate.trim();

  const trustedPerson =
    draft.trustedPerson.trim();

  const trustedPhone =
    draft.trustedPhone.trim();


  if (
    !name ||
    !trustedPerson ||
    !trustedPhone ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      birthDate
    )
  ) {
    return null;
  }


  return {
    name,
    birthDate,
    trustedPerson,
    trustedPhone
  };
}


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
    string | null,

  newClient:
    CreateOperationNewClientInput | null
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


  if (
    newClient
  ) {
    /*
     * Новий клієнт і patientId
     * одночасно передаватися
     * не повинні.
     */
    delete operation.patientId;


    operation.newClient =
      newClient;
  }


      return operation as
     CreateOperationInput;
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


      {field.kind === "date" ? (
        <UkrainianDatePicker
          value={value}
          onChange={onChange}
          disabled={disabled}
          ariaLabel={field.label}
        />
      ) : <input
        type={field.kind === "number" ? "number" : "text"}

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
      />}
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
  initialNewClient = false,
  onSuccess,
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
  newClientDraft,
  setNewClientDraft
] =
  useState<NewClientDraft>(
    EMPTY_NEW_CLIENT_DRAFT
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

  const [
    patientOptions,
    setPatientOptions
  ] = useState<OperationFieldOption[] | null>(null);

  const [
    patientOptionsLoading,
    setPatientOptionsLoading
  ] = useState(false);

  const [
    patientOptionsError,
    setPatientOptionsError
  ] = useState("");

  const [
    patientOptionsRefreshKey,
    setPatientOptionsRefreshKey
  ] = useState(0);

  const activeOperationType =
    String(
      draft.type || initialOperationType || ""
    ).trim();


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

              deferPatientOptions:
                PERF11_ENABLED &&
                selection.operationType === "Доходи",

              signal
            });


          if (
            signal?.aborted ||
            requestSequence !==
              schemaRequestSequence.current
          ) {
            return;
          }


                    if (process.env.NODE_ENV === "development") {
            console.table(
              nextSchema.sections
                .filter(section => section.id !== "basic")
                .map(section => ({
                  block: section.id,
                  active: section.visible,
                  visibleFields:
                    section.fields.filter(
                      field => field.visible
                    ).map(field => field.key).join(", "),
                  optionsCount:
                    section.fields.reduce(
                      (total, field) =>
                        total + (field.options?.length ?? 0),
                      0
                    )
                }))
            );
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


          console.warn(
         "[OPERATION_FORM_SCHEMA_LOAD_FAILED]",
          loadError);


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


setNewClientDraft(
  EMPTY_NEW_CLIENT_DRAFT
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
  initialOperationType,
  initialNewClient
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

  useEffect(() => {
    if (
      !open ||
      !PERF11_ENABLED ||
      activeOperationType !== "Доходи"
    ) {
      setPatientOptions(null);
      setPatientOptionsError("");
      setPatientOptionsLoading(false);
      return;
    }

    const controller = new AbortController();

    setPatientOptions(null);
    setPatientOptionsError("");
    setPatientOptionsLoading(true);

    void getOperationPatientOptions(controller.signal)
      .then(items => {
        if (!controller.signal.aborted) {
          setPatientOptions(items);
        }
      })
      .catch(loadError => {
        if (!controller.signal.aborted) {
          setPatientOptionsError(
            getApiErrorMessage(
              loadError,
              "Не вдалося завантажити пацієнтів."
            )
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setPatientOptionsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    open,
    activeOperationType,
    patientOptionsRefreshKey,
    reloadKey
  ]);

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


      const displaySchema = useMemo(() => {
  if (!schema) {
    return schema;
  }

  const category =
    String(draft.category ?? "").trim();

  const tree =
    PERF15_ENABLED &&
    !loading &&
    activeOperationType === "Доходи" &&
    schema.selectedOperationType === "Доходи"
      ? schema.incomeArticlesByCategory
      : null;

  const localArticles =
    tree &&
    category &&
    Object.prototype.hasOwnProperty.call(
      tree,
      category
    )
      ? tree[category]
      : null;

  if (
    !schema.patientOptionsDeferred &&
    !localArticles
  ) {
    return schema;
  }

  return {
    ...schema,
    sections: schema.sections.map(section => ({
      ...section,
      fields: section.fields.map(field => {
        if (
          field.key === "patient" &&
          schema.patientOptionsDeferred
        ) {
          return {
            ...field,
            options: patientOptions ?? [],
            enabled:
              patientOptions !== null &&
              patientOptions.length > 0
          };
        }

        if (
          field.key === "article" &&
          localArticles
        ) {
          return {
            ...field,
            options: localArticles,
            enabled: localArticles.length > 0
          };
        }

        return field;
      })
    }))
  };
}, [
  schema,
  patientOptions,
  draft.category,
  activeOperationType,
  loading
]);

  const visibleSections = useMemo(
    () =>
      displaySchema?.sections.filter(
        section =>
          section.visible &&
          section.fields.some(
            field => field.visible
          )
      ) ?? [],
    [displaySchema]
  );


const normalizedNewClient =
  useMemo(
    () =>
      initialNewClient
        ? normalizeNewClientDraft(
            newClientDraft
          )
        : null,
    [
      initialNewClient,
      newClientDraft
    ]
  );

const newClientFieldsComplete =
  !initialNewClient ||
  normalizedNewClient !==
    null;

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
 * Поля нового клієнта
 * живуть окремо від server-driven
 * OperationDraft.
 */
function changeNewClientField(
  field:
    keyof NewClientDraft,

  value:
    string
) {
  if (
    submitting
  ) {
    return;
  }


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


  setNewClientDraft(
    current => ({
      ...current,
      [field]:
        value
    })
  );
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

    const incomeTree =
      PERF15_ENABLED &&
      !loading &&
      schema?.source === "DOMAIN" &&
      schema.selectedOperationType === "Доходи" &&
      operationType === "Доходи"
        ? schema.incomeArticlesByCategory
        : null;

    const localArticles =
      incomeTree &&
      category &&
      Object.prototype.hasOwnProperty.call(
        incomeTree,
        category
      )
        ? incomeTree[category]
        : null;

    if (
      localArticles &&
      localArticles.length > 0 &&
      (
        field.key === "category" ||
        (
          field.key === "article" &&
          (
            !value ||
            localArticles.some(
              option => option.value === value
            )
          )
        )
      )
    ) {
      return;
    }

        void loadSchemaForSelection({
      operationType,
      category,
      article
    });
  }


  /*
   * PATCH A7 — MODAL DOMAIN READINESS
 *
 * Перевіряємо фактично отриману
 * server-side domain schema.
 *
 * Не запускаємо нових запитів.
 */
const modalDomainReady =
  domainReady ||
  Boolean(
    schema?.source === "DOMAIN" &&
    schema.operationTypes.some(
      item => item.enabled
    )
  );

const canSubmit =
  Boolean(
    modalDomainReady &&
    schema?.canSubmit &&
    (
      !schema.patientOptionsDeferred ||
      (
        patientOptions !== null &&
        !patientOptionsLoading &&
        !patientOptionsError &&
        displaySchema?.sections.some(
          section => section.fields.some(
            field =>
              field.key === "patient" &&
              field.visible
          )
        ) === true
      )
    ) &&
    requiredFieldsComplete &&
    newClientFieldsComplete &&
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
      !displaySchema
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
          displaySchema,
          initialOperationType,
          normalizedNewClient
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


onSuccess?.(
  result.operation
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
      const isUnconfirmedWrite =
  submitOperationError instanceof ApiClientError &&
  [
    "APPS_SCRIPT_TIMEOUT",
    "APPS_SCRIPT_NETWORK_ERROR",
    "NETWORK_ERROR",
    "INVALID_API_RESPONSE",
    "INVALID_API_ENVELOPE",
    "EMPTY_CREATE_OPERATION_RESULT"
  ].includes(submitOperationError.code);

if (isUnconfirmedWrite) {
  const requestId =
    submitOperationError.requestId;

  setSubmitError(
    "Сервер не підтвердив результат проведення. " +
    "Операція могла бути записана. " +
    "Не змінюйте форму й не створюйте нову операцію: " +
    "спочатку перевірте журнал. " +
    "Повторне натискання «Провести» використовує той самий ключ. " +
    (requestId ? `Код запиту: ${requestId}.` : "")
  );
} else {
  setSubmitError(
    getApiErrorMessage(
      submitOperationError,
      "Не вдалося провести операцію."
    )
  );
}

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
      initialNewClient
      ? "Додати нового клієнта у Базу клієнтів"
      : initialOperationType
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
        !modalDomainReady &&
        !loading &&
        !error &&
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
  !schema &&
  !error &&
  !submitResult &&
  (
    initialNewClient ? (
      <div className="operation-schema-state">
        <LoaderCircle
          className="operation-schema-spinner"
          size={28}
        />

        <strong>
          Завантаження структури форми
        </strong>

        <span>
          Отримуємо server-side contract…
        </span>
      </div>
    ) : (
      <section
        className="operation-form-section"
        aria-busy={loading}
      >
        <div className="operation-section-heading">
          <div>
            <h3>Основні дані</h3>
            <p>
              Дату та коментар можна заповнювати.
              Решта полів синхронізується із сервером.
            </p>
          </div>

          <span className="operation-section-badge">
            Завантаження
          </span>
        </div>

        <div className="operation-fields-grid">
          <label className="operation-field">
            <span>Дата операції</span>

            <div className="operation-input-shell with-icon">
              <CalendarDays size={16} />

              <UkrainianDatePicker
                value={String(draft.date ?? "")}
                ariaLabel="Дата операції"
                onChange={value => {
                  idempotencyKeyRef.current = null;

                  setDraft(current => ({
                    ...current,
                    date: value
                  }));
                }}
              />
            </div>
          </label>

          <label className="operation-field">
            <span>Тип операції</span>

            <div className="operation-input-shell">
              <input
                type="text"
                value={initialOperationType ?? ""}
                readOnly
              />
            </div>
          </label>

          {(["Рахунок", "Категорія", "Стаття"] as const)
            .map(label => (
              <label
                className="operation-field"
                key={label}
              >
                <span>{label}</span>

                <div className="operation-select-shell">
                  <select disabled defaultValue="">
                    <option value="">
                      Завантаження з сервера…
                    </option>
                  </select>

                  <ChevronDown size={16} />
                </div>
              </label>
            ))}

          <label className="operation-field operation-field-full">
            <span>Коментар</span>

            <textarea
              value={String(draft.comment ?? "")}
              placeholder="Коментар до операції"
              onChange={event => {
                idempotencyKeyRef.current = null;

                setDraft(current => ({
                  ...current,
                  comment: event.target.value
                }));
              }}
            />
          </label>
        </div>
      </section>
    )
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
            schema?.patientOptionsDeferred &&
            patientOptionsLoading &&
            (
              <div
                className="operation-schema-refresh-bar"
                role="status"
              >
                <LoaderCircle
                  className="operation-schema-spinner"
                  size={18}
                />

                <span>
                  Завантажуємо повний список пацієнтів…
                </span>
              </div>
            )
          }

          {schema?.patientOptionsDeferred &&
patientOptionsError ? (
  <div
    className="operation-schema-state operation-schema-error"
    role="alert"
  >
    <AlertTriangle size={22} />

    <span>{patientOptionsError}</span>

    <button
      type="button"
      className="operation-schema-retry"
      onClick={() =>
        setPatientOptionsRefreshKey(value => value + 1)
      }
    >
      Повторити завантаження пацієнтів
    </button>
  </div>
) : null}

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
        initialNewClient &&
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
                  Новий пацієнт
                </h3>

                <p>
                  Дані будуть використані для створення картки у «Клієнтській базі».
                </p>
              </div>

              <span
                className=
                  "operation-section-badge"
              >
                4 поля
              </span>
            </div>


            <div
              className=
                "operation-fields-grid"
            >
              <label
                className=
                  "operation-field operation-field-full"
              >
                <span>
                  ПІБ дитини

                  <b
                    className=
                      "operation-required-mark"
                  >
                    *
                  </b>
                </span>

                <div
                  className=
                    "operation-input-shell"
                >
                  <input
                    type="text"

                    value={
                      newClientDraft.name
                    }

                    disabled={
                      submitting ||
                      Boolean(
                        submitResult
                      )
                    }

                    placeholder=
                      "Наприклад: Іваненко Марія Олександрівна"

                    onChange={
                      event =>
                        changeNewClientField(
                          "name",
                          event.target.value
                        )
                    }
                  />
                </div>
              </label>


              <label
                className=
                  "operation-field"
              >
                <span>
                  Дата народження

                  <b
                    className=
                      "operation-required-mark"
                  >
                    *
                  </b>
                </span>

                <div
                  className=
                    "operation-input-shell with-icon"
                >
                  <CalendarDays
                    size={16}
                  />

                  <UkrainianDatePicker
                    value={newClientDraft.birthDate}
                    disabled={submitting || Boolean(submitResult)}
                    onChange={value => changeNewClientField("birthDate", value)}
                    ariaLabel="Дата народження"
                  />
                </div>
              </label>


              <label
                className=
                  "operation-field"
              >
                <span>
                  Довірена особа

                  <b
                    className=
                      "operation-required-mark"
                  >
                    *
                  </b>
                </span>

                <div
                  className=
                    "operation-input-shell"
                >
                  <input
                    type="text"

                    value={
                      newClientDraft.trustedPerson
                    }

                    disabled={
                      submitting ||
                      Boolean(
                        submitResult
                      )
                    }

                    placeholder=
                      "ПІБ довіреної особи"

                    onChange={
                      event =>
                        changeNewClientField(
                          "trustedPerson",
                          event.target.value
                        )
                    }
                  />
                </div>
              </label>


              <label
                className=
                  "operation-field"
              >
                <span>
                  Телефон довіреної особи

                  <b
                    className=
                      "operation-required-mark"
                  >
                    *
                  </b>
                </span>

                <div
                  className=
                    "operation-input-shell"
                >
                  <input
                    type="tel"

                    value={
                      newClientDraft.trustedPhone
                    }

                    disabled={
                      submitting ||
                      Boolean(
                        submitResult
                      )
                    }

                    placeholder=
                      "+380XXXXXXXXX"

                    onChange={
                      event =>
                        changeNewClientField(
                          "trustedPhone",
                          event.target.value
                        )
                    }
                  />
                </div>
              </label>
            </div>
          </section>
        )
      }


      {
        initialNewClient &&
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
                  Операція
                </h3>

                <p>
                  Оберіть тип операції, після чого domain core завантажить лікаря, категорію, статтю та інші потрібні поля.
                </p>
              </div>
            </div>


            <div
              className=
                "operation-fields-grid"
            >
              <label
                className=
                  "operation-field"
              >
                <span>
                  Тип операції

                  <b
                    className=
                      "operation-required-mark"
                  >
                    *
                  </b>
                </span>

                <div
                  className=
                    "operation-select-shell"
                >
                  <select
                    value={
                      String(
                        draft.type ??
                        ""
                      )
                    }

                    disabled={
                      loading ||
                      submitting ||
                      Boolean(
                        submitResult
                      )
                    }

                    onChange={
                      event => {
                        const value =
                          event.target.value;


                        idempotencyKeyRef.current =
                          null;


                        setDraft(
                          current => ({
                            ...current,

                            type:
                              value,

                            category:
                              "",

                            article:
                              ""
                          })
                        );


                        void loadSchemaForSelection({
                          operationType:
                            value.trim() ||
                            null,

                          category:
                            null,

                          article:
                            null
                        });
                      }
                    }
                  >
                    <option value="">
                      Оберіть тип операції
                    </option>

                    {
                      schema.operationTypes
                        .filter(
                          item =>
                            item.enabled
                        )
                        .map(
                          item => (
                            <option
                              key={
                                item.value
                              }

                              value={
                                item.value
                              }
                            >
                              {
                                item.label
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
              </label>
            </div>
          </section>
        )
      }


                    {
  visibleSections
    .filter(section => section.id === "basic")
    .map(section => (
      <FormSection
        key={section.id}
        section={section}
        draft={draft}
        locked={
          loading ||
          submitting ||
          Boolean(submitResult)
        }
        onFieldChange={changeField}
      />
    ))
}

<section className="operation-form-section">
  <div className="operation-section-heading">
    <div>
      <h3>Умовні блоки</h3>
      <p>
        Реальні поля та значення надходять із domain schema.
      </p>
    </div>
  </div>

  <div className="operation-condition-grid operation-condition-grid-live">
    {CONDITIONAL_BLOCKS.map(block => {
      const section = schema.sections.find(
        item => item.id === block.id
      );

      const active = Boolean(
        section?.visible &&
        section.fields.some(field => field.visible)
      );

      return (
        <div
          key={block.id}
          className="operation-condition-card operation-condition-live"
        >
          {active && section ? (
            <FormSection
              section={section}
              draft={draft}
              locked={
                loading ||
                submitting ||
                Boolean(submitResult)
              }
              onFieldChange={changeField}
            />
          ) : (
            <div className="operation-condition-inactive">
              <strong>
                {section?.title ?? block.title}
              </strong>

              <p>
                Не застосовується до цієї операції.
              </p>
            </div>
          )}
        </div>
      );
    })}
  </div>
</section>

<section
  className="operation-contract-note"
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
                            : initialNewClient &&
                          !newClientFieldsComplete
                         ? "Заповніть дані нового пацієнта"
                        : !requiredFieldsComplete
                        ? "Заповніть обов’язкові поля"
                       : initialNewClient &&
                      !String(
                     draft.type ??
                     ""
                    ).trim()
                    ? "Оберіть тип операції"
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
          ? (
          initialNewClient
          ? "Клієнта створено"
          : "Проведено"
      )
    : submitting
      ? (
          initialNewClient
            ? "Створюємо…"
            : "Проводимо…"
        )
      : (
          initialNewClient
            ? "Створити клієнта і провести"
            : "Провести операцію"
        )
}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}