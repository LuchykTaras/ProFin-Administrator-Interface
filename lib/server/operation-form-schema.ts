import "server-only";

import {
  OPERATION_FORM_CONTRACT_VERSION
} from "@/lib/contracts/operations";

import type {
  OperationFieldKey,
  OperationFieldKind,
  OperationFieldOption,
  OperationFormField,
  OperationFormSchema,
  OperationFormSection,
  OperationTypeOption
} from "@/lib/contracts/operations";

import {
  callAppsScriptAdapter
} from "@/lib/server/apps-script-transport";

import {
  AppError
} from "@/lib/server/errors";

import type {
  SessionContext
} from "@/lib/server/session";


type UnknownRecord =
  Record<string, unknown>;


type GetOperationFormSchemaParams = {
  requestId:
    string;

  context:
    SessionContext;

  requestedOperationType?:
    string | null;

  requestedCategory?:
    string | null;

  requestedArticle?:
    string | null;
};


type AppsScriptOperationFormSchemaData = {
  result?:
    unknown;

  status?:
    string;
};


type DomainSection = {
  id:
    OperationFormSection["id"];

  title:
    string;

  description?:
    string;

  order:
    number;

  visible:
    boolean;

  domainControlled:
    boolean;
};


type DomainControl = {
  key:
    OperationFieldKey;

  label:
    string;

  kind:
    OperationFieldKind;

  section:
    OperationFormSection["id"];

  order:
    number;

  required:
    boolean;

  visible:
    boolean;

  enabled:
    boolean;

  placeholder?:
    string;

  defaultValue?:
    string;

  options:
    OperationFieldOption[];
};


type NormalizedDomainSchema = {
  version:
    string;

  schemaChecksum:
    string | null;

  source:
    "DOMAIN";

  domainOptionsReady:
    boolean;

  operationTypes:
    OperationTypeOption[];

  selectedOperationType:
    string | null;

  sections:
    DomainSection[];

  controls:
    DomainControl[];

  canSubmit:
    boolean;

  unavailableReason:
    string | null;
};


const ALLOWED_FIELD_KEYS:
  readonly OperationFieldKey[] = [
    "date",
    "account",
    "type",
    "category",
    "article",
    "doctor",
    "patient",
    "unitPrice",
    "quantity",
    "amount",
    "comment",
    "transferTo",
    "packageStart",
    "packageDuration",
    "packageMonthlyAmount",
    "packageAccrualStart",
    "vaccineName",
    "vaccinePatient",
    "vaccineCost",
    "vaccineSeries",
    "storedVaccineId",
    "newStatus",
    "actualDate",
    "assetName",
    "assetCategory",
    "assetAmortization",
    "assetStartDate",
    "inventoryName",
    "inventorySeries",
    "inventoryExpiryDate",
    "inventorySupplier"
  ];


const ALLOWED_FIELD_KINDS:
  readonly OperationFieldKind[] = [
    "text",
    "number",
    "date",
    "textarea",
    "select",
    "entity-select",
    "readonly"
  ];


const ALLOWED_SECTION_IDS:
  readonly OperationFormSection["id"][] = [
    "basic",
    "package",
    "vaccine",
    "inventory",
    "asset",
    "vaccine-status"
  ];


function isRecord(
  value:
    unknown
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value
    )
  );
}


function cleanOptionalString(
  value:
    unknown
): string | null {
  if (
    typeof value !==
      "string"
  ) {
    return null;
  }


  const normalized =
    value.trim();


  return normalized ||
    null;
}


function normalizeRequestedValue(
  value:
    string | null | undefined
): string | null {
  return value?.trim() ||
    null;
}


function isOperationFieldKey(
  value:
    unknown
): value is OperationFieldKey {
  return (
    typeof value ===
      "string" &&
    ALLOWED_FIELD_KEYS.includes(
      value as OperationFieldKey
    )
  );
}


function isOperationFieldKind(
  value:
    unknown
): value is OperationFieldKind {
  return (
    typeof value ===
      "string" &&
    ALLOWED_FIELD_KINDS.includes(
      value as OperationFieldKind
    )
  );
}


function isOperationSectionId(
  value:
    unknown
): value is OperationFormSection["id"] {
  return (
    typeof value ===
      "string" &&
    ALLOWED_SECTION_IDS.includes(
      value as OperationFormSection["id"]
    )
  );
}


function normalizeFieldOptions(
  value:
    unknown
): OperationFieldOption[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }


  const result:
    OperationFieldOption[] =
      [];


  const seen =
    new Set<string>();


  for (
    const item of value
  ) {
    let option:
      OperationFieldOption |
      null =
      null;


    if (
      typeof item ===
        "string"
    ) {
      const normalized =
        item.trim();


      if (
        normalized
      ) {
        option = {
          value:
            normalized,

          label:
            normalized
        };
      }
    } else if (
      isRecord(
        item
      )
    ) {
      const rawValue =
        typeof item.value ===
          "string"
          ? item.value
          : (
              typeof item.id ===
                "string"
                ? item.id
                : ""
            );


      const rawLabel =
        typeof item.label ===
          "string"
          ? item.label
          : (
              typeof item.name ===
                "string"
                ? item.name
                : rawValue
            );


      const normalizedValue =
        rawValue.trim();


      const normalizedLabel =
        rawLabel.trim();


      if (
        normalizedValue
      ) {
        option = {
          value:
            normalizedValue,

          label:
            normalizedLabel ||
            normalizedValue
        };
      }
    }


    if (
      !option ||
      seen.has(
        option.value
      )
    ) {
      continue;
    }


    seen.add(
      option.value
    );


    result.push(
      option
    );
  }


  return result;
}


function normalizeOperationTypes(
  value:
    unknown
): OperationTypeOption[] {
  const options =
    normalizeFieldOptions(
      value
    );


  return options.map(
    option => ({
      value:
        option.value,

      label:
        option.label,

      enabled:
        true,

      source:
        "DOMAIN"
    })
  );
}


function normalizeDefaultValue(
  value:
    unknown
): string | undefined {
  if (
    value === null ||
    typeof value ===
      "undefined"
  ) {
    return undefined;
  }


  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {
    return String(
      value
    );
  }


  return undefined;
}


function normalizeSections(
  value:
    unknown
): DomainSection[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_OPERATION_FORM_SECTIONS",

      userMessage:
        "Доменне ядро повернуло некоректні секції форми.",

      technicalMessage:
        "result.sections must be an array.",

      retryable:
        false
    });
  }


  const sections:
    DomainSection[] =
      [];


  const seen =
    new Set<string>();


  for (
    const rawSection of value
  ) {
    if (
      !isRecord(
        rawSection
      ) ||
      !isOperationSectionId(
        rawSection.id
      )
    ) {
      throw new AppError({
        status:
          502,

        code:
          "UNSUPPORTED_OPERATION_FORM_SECTION",

        userMessage:
          "Доменна схема містить секцію, яку вебінтерфейс ще не підтримує.",

        technicalMessage:
          `Unsupported section id: ${String(
            isRecord(
              rawSection
            )
              ? rawSection.id
              : rawSection
          )}.`,

        retryable:
          false
      });
    }


    if (
      seen.has(
        rawSection.id
      )
    ) {
      continue;
    }


    const title =
      cleanOptionalString(
        rawSection.title
      );


    if (!title) {
      throw new AppError({
        status:
          502,

        code:
          "INVALID_OPERATION_FORM_SECTION_TITLE",

        userMessage:
          "Доменне ядро повернуло некоректну назву секції форми.",

        retryable:
          false
      });
    }


    seen.add(
      rawSection.id
    );


    sections.push({
      id:
        rawSection.id,

      title,

      description:
        cleanOptionalString(
          rawSection.description
        ) ??
        undefined,

      order:
        typeof rawSection.order ===
          "number" &&
        Number.isFinite(
          rawSection.order
        )
          ? rawSection.order
          : sections.length *
            10,

      visible:
        rawSection.visible !==
          false,

      domainControlled:
        rawSection.domainControlled !==
          false
    });
  }


  return sections.sort(
    (a, b) =>
      a.order -
      b.order
  );
}


function normalizeControls(
  value:
    unknown
): DomainControl[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_OPERATION_FORM_CONTROLS",

      userMessage:
        "Доменне ядро повернуло некоректні поля форми.",

      technicalMessage:
        "result.controls must be an array.",

      retryable:
        false
    });
  }


  const controls:
    DomainControl[] =
      [];


  const seen =
    new Set<string>();


  for (
    const rawControl of value
  ) {
    if (
      !isRecord(
        rawControl
      ) ||
      !isOperationFieldKey(
        rawControl.key
      )
    ) {
      throw new AppError({
        status:
          502,

        code:
          "UNSUPPORTED_OPERATION_FORM_FIELD",

        userMessage:
          "Доменна схема містить поле, яке вебінтерфейс ще не підтримує.",

        technicalMessage:
          `Unsupported field key: ${String(
            isRecord(
              rawControl
            )
              ? rawControl.key
              : rawControl
          )}.`,

        retryable:
          false
      });
    }


    if (
      !isOperationFieldKind(
        rawControl.kind
      )
    ) {
      throw new AppError({
        status:
          502,

        code:
          "UNSUPPORTED_OPERATION_FORM_FIELD_KIND",

        userMessage:
          "Доменна схема містить непідтримуваний тип поля.",

        technicalMessage:
          `Unsupported field kind for ${rawControl.key}: ${String(
            rawControl.kind
          )}.`,

        retryable:
          false
      });
    }


    if (
      !isOperationSectionId(
        rawControl.section
      )
    ) {
      throw new AppError({
        status:
          502,

        code:
          "UNSUPPORTED_OPERATION_FORM_FIELD_SECTION",

        userMessage:
          "Поле доменної схеми прив’язане до непідтримуваної секції.",

        technicalMessage:
          `Unsupported section for ${rawControl.key}: ${String(
            rawControl.section
          )}.`,

        retryable:
          false
      });
    }


    if (
      seen.has(
        rawControl.key
      )
    ) {
      throw new AppError({
        status:
          502,

        code:
          "DUPLICATE_OPERATION_FORM_FIELD",

        userMessage:
          "Доменна схема містить дубль поля.",

        technicalMessage:
          `Duplicate field key: ${rawControl.key}.`,

        retryable:
          false
      });
    }


    const label =
      cleanOptionalString(
        rawControl.label
      );


    if (!label) {
      throw new AppError({
        status:
          502,

        code:
          "INVALID_OPERATION_FORM_FIELD_LABEL",

        userMessage:
          "Доменне ядро повернуло поле без назви.",

        technicalMessage:
          `Missing label for field ${rawControl.key}.`,

        retryable:
          false
      });
    }


    seen.add(
      rawControl.key
    );


    controls.push({
      key:
        rawControl.key,

      label,

      kind:
        rawControl.kind,

      section:
        rawControl.section,

      order:
        typeof rawControl.order ===
          "number" &&
        Number.isFinite(
          rawControl.order
        )
          ? rawControl.order
          : controls.length *
            10,

      required:
        rawControl.required ===
          true,

      visible:
        rawControl.visible !==
          false,

      enabled:
        rawControl.enabled !==
          false,

      placeholder:
        cleanOptionalString(
          rawControl.placeholder
        ) ??
        undefined,

      defaultValue:
        normalizeDefaultValue(
          rawControl.defaultValue
        ),

      options:
        normalizeFieldOptions(
          rawControl.options
        )
    });
  }


  return controls.sort(
    (a, b) =>
      a.order -
      b.order
  );
}


function normalizeDomainSchema(
  value:
    unknown
): NormalizedDomainSchema {
  if (
    !isRecord(
      value
    )
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_OPERATION_FORM_DOMAIN_SCHEMA",

      userMessage:
        "Доменне ядро повернуло некоректну структуру форми.",

      technicalMessage:
        "getOperationFormSchemaWeb result must be an object.",

      retryable:
        false
    });
  }


  if (
    value.source !==
      "DOMAIN"
  ) {
    throw new AppError({
      status:
        502,

      code:
        "INVALID_OPERATION_FORM_SOURCE",

      userMessage:
        "Схема форми отримана з недопустимого джерела.",

      technicalMessage:
        `Expected source=DOMAIN, got ${String(
          value.source
        )}.`,

      retryable:
        false
    });
  }


  const operationTypes =
    normalizeOperationTypes(
      value.operationTypes
    );


  if (
    !operationTypes.length
  ) {
    throw new AppError({
      status:
        502,

      code:
        "EMPTY_OPERATION_TYPES",

      userMessage:
        "Доменне ядро не повернуло доступні типи операцій.",

      retryable:
        false
    });
  }


  const selected =
    isRecord(
      value.selected
    )
      ? value.selected
      : null;


  return {
    version:
      cleanOptionalString(
        value.version
      ) ??
      OPERATION_FORM_CONTRACT_VERSION,

    schemaChecksum:
      cleanOptionalString(
        value.schemaChecksum
      ),

    source:
      "DOMAIN",

    domainOptionsReady:
      value.domainOptionsReady ===
        true,

    operationTypes,

    selectedOperationType:
      selected
        ? cleanOptionalString(
            selected.operationType
          )
        : null,

    sections:
      normalizeSections(
        value.sections
      ),

    controls:
      normalizeControls(
        value.controls
      ),

    canSubmit:
      value.canSubmit ===
        true,

    unavailableReason:
      cleanOptionalString(
        value.unavailableReason
      )
  };
}


function assertSelectionEcho(
  domain:
    NormalizedDomainSchema,

  requestedOperationType:
    string | null
) {
  if (
    requestedOperationType &&
    domain.selectedOperationType !==
      requestedOperationType
  ) {
    throw new AppError({
      status:
        502,

      code:
        "OPERATION_FORM_SELECTION_MISMATCH",

      userMessage:
        "Доменне ядро повернуло інший сценарій форми.",

      technicalMessage:
        `Requested operationType=${requestedOperationType}, returned=${String(
          domain.selectedOperationType
        )}.`,

      retryable:
        false
    });
  }
}


function buildSections(
  domain:
    NormalizedDomainSchema
): OperationFormSection[] {
  const fieldsBySection =
    new Map<
      OperationFormSection["id"],
      OperationFormField[]
    >();


  for (
    const control of
      domain.controls
  ) {
    const field:
      OperationFormField = {
        key:
          control.key,

        label:
          control.label,

        kind:
          control.kind,

        required:
          control.required,

        visible:
          control.visible,

        enabled:
          control.enabled,

        source:
          "DOMAIN"
      };


    if (
      control.placeholder !==
        undefined
    ) {
      field.placeholder =
        control.placeholder;
    }


    if (
      control.defaultValue !==
        undefined
    ) {
      field.defaultValue =
        control.defaultValue;
    }


    if (
      control.options.length ||
      control.kind ===
        "select" ||
      control.kind ===
        "entity-select"
    ) {
      field.options =
        control.options;
    }


    const bucket =
      fieldsBySection.get(
        control.section
      ) ??
      [];


    bucket.push(
      field
    );


    fieldsBySection.set(
      control.section,
      bucket
    );
  }


  return domain.sections.map(
    section => ({
      id:
        section.id,

      title:
        section.title,

      description:
        section.description,

      visible:
        section.visible,

      domainControlled:
        section.domainControlled,

      fields:
        fieldsBySection.get(
          section.id
        ) ??
        []
    })
  );
}


export async function getOperationFormSchema(
  params:
    GetOperationFormSchemaParams
): Promise<OperationFormSchema> {
  const requestedOperationType =
    normalizeRequestedValue(
      params.requestedOperationType
    );


  const requestedCategory =
    normalizeRequestedValue(
      params.requestedCategory
    );


  const requestedArticle =
    normalizeRequestedValue(
      params.requestedArticle
    );


  /*
   * PATCH 37.3
   *
   * READ-ONLY domain schema command.
   *
   * Browser передає тільки стан
   * бізнес-тригерів:
   *
   * operationType
   * category
   * article
   *
   * Browser НЕ передає:
   *
   * projectId
   * locationId
   * activeYear
   * spreadsheetId
   *
   * Trusted annual route додається
   * server-side у callAppsScriptAdapter().
   *
   * "as never" тимчасово дозволяє
   * не змінювати третій файл
   * apps-script-adapter.ts.
   */
  const adapterResponse =
    await callAppsScriptAdapter<
      {
        operationType:
          string | null;

        category:
          string | null;

        article:
          string | null;
      },
      AppsScriptOperationFormSchemaData
    >({
      requestId:
        params.requestId,

      command:
        "getOperationFormSchemaWeb" as never,

      context:
        params.context,

      idempotencyKey:
        null,

      payload: {
        operationType:
          requestedOperationType,

        category:
          requestedCategory,

        article:
          requestedArticle
      }
    });


  const responseData =
    adapterResponse.data;


  if (
    !responseData
  ) {
    throw new AppError({
      status:
        502,

      code:
        "EMPTY_OPERATION_FORM_SCHEMA_RESPONSE",

      userMessage:
        "Доменне ядро не повернуло структуру форми.",

      technicalMessage:
        "Apps Script adapter returned data=null.",

      retryable:
        false
    });
  }


  const domain =
    normalizeDomainSchema(
      responseData.result ??
      responseData
    );


  assertSelectionEcho(
    domain,
    requestedOperationType
  );


  return {
  version:
    domain.version,

  schemaChecksum:
    domain.schemaChecksum,

  source:
    "DOMAIN",

  domainOptionsReady:
    domain.domainOptionsReady,

  operationTypes:
    domain.operationTypes,

  selectedOperationType:
    domain.selectedOperationType,

  sections:
    buildSections(
      domain
    ),

  canSubmit:
    domain.canSubmit,

  unavailableReason:
    domain.unavailableReason
};
}