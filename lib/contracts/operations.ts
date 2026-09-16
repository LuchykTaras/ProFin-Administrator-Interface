export const OPERATION_FORM_CONTRACT_VERSION =
  "PROFIN_OPERATION_FORM_UI_V3";


export type OperationFieldSource =
  | "INTERFACE_BASELINE"
  | "DOMAIN";


export type OperationFieldKey =
  | "date"
  | "account"
  | "type"
  | "category"
  | "article"
  | "doctor"
  | "patient"
  | "unitPrice"
  | "quantity"
  | "amount"
  | "comment"
  | "transferTo"
  | "packageStart"
  | "packageDuration"
  | "packageMonthlyAmount"
  | "packageAccrualStart"
  | "vaccineName"
  | "vaccinePatient"
  | "vaccineCost"
  | "vaccineSeries"
  | "storedVaccineId"
  | "newStatus"
  | "actualDate"
  | "assetName"
  | "assetCategory"
  | "assetAmortization"
  | "assetStartDate"
  | "inventoryName"
  | "inventorySeries"
  | "inventoryExpiryDate"
  | "inventorySupplier";


export type OperationFieldKind =
  | "text"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "entity-select"
  | "readonly";


export type OperationFieldOption = {
  value: string;

  label: string;
};


export type OperationTypeOption = {
  value: string;

  label: string;

  enabled: boolean;

  source:
    OperationFieldSource;
};


export type OperationFormField = {
  key:
    OperationFieldKey;

  label:
    string;

  kind:
    OperationFieldKind;

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

  options?:
    OperationFieldOption[];

  source:
    OperationFieldSource;
};


export type OperationFormSection = {
  id:
    | "basic"
    | "package"
    | "vaccine"
    | "inventory"
    | "asset"
    | "vaccine-status";

  title:
    string;

  description?:
    string;

  visible:
    boolean;

  domainControlled:
    boolean;

  fields:
    OperationFormField[];
};


export type OperationFormSchema = {
  version:
    string;

  schemaChecksum:
    string | null;

  source:
    OperationFieldSource;

  domainOptionsReady:
    boolean;

  operationTypes:
    OperationTypeOption[];

  selectedOperationType:
    string | null;

  sections:
    OperationFormSection[];

  canSubmit:
    boolean;

  unavailableReason:
    string | null;
};


export type OperationDraftValue =
  | string
  | number
  | null;


export type OperationDraft =
  Partial<
    Record<
      OperationFieldKey,
      OperationDraftValue
    >
  >;

/****************************************************
 * ROADMAP PATCH 34
 * CREATE OPERATION WEB CONTRACT
 ****************************************************/

export type CreateOperationInput = {
  date:
    string;

  account?:
    string | null;

  transferTo?:
    string | null;

  type:
    string;

  category:
    string;

  article:
    string;

  doctor?:
    string | null;

  patientId?:
    string | null;

  unitPrice?:
    number | string | null;

  quantity?:
    number | string | null;

  amount?:
    number | string | null;

  comment?:
    string | null;

  packageStart?:
    string | null;

  packageDuration?:
    number | string | null;

  packageMonthlyAmount?:
    number | string | null;

  packageAccrualStart?:
    string | null;

  vaccineName?:
    string | null;

  vaccineQty?:
    number | string | null;

  vaccineCost?:
    number | string | null;

  vaccineSeries?:
    string | null;

  storedVaccineId?:
    string | null;

  assetName?:
    string | null;

  assetCategory?:
    string | null;

  assetAmortization?:
    number | string | null;

  assetStartDate?:
    string | null;

  inventoryName?:
    string | null;

  inventorySeries?:
    string | null;

  inventoryExpiryDate?:
    string | null;

  inventorySupplier?:
    string | null;
};


export type CreateOperationRequestBody = {
  operation:
    CreateOperationInput;
};


export type CreateOperationResult = {
  version:
    string;

  operationId:
    string;

  type:
    string;

  category:
    string;

  article:
    string;

  amount:
    number;

  warnings:
    string[];

  inventoryReceiptWritten:
    boolean;

  vaccineRegistryWritten:
    boolean;

  inventoryIssueWritten:
    boolean;

  inventoryIssue:
    {
      ok:
        boolean;

      requiresIssue:
        boolean;

      inventoryType:
        string;

      inventoryName:
        string;

      operationId:
        string;

      movementIds:
        string[];

      totalCost:
        number;

      averageUnitCost:
        number;

      userMessage:
        string;
    } | null;

  status:
    "OK";
};
