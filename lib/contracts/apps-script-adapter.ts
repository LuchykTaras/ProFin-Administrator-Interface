export const APPS_SCRIPT_ADAPTER_PROTOCOL_VERSION =
  "PROFIN_APPS_SCRIPT_ADAPTER_V1" as const;


export const APPS_SCRIPT_ADAPTER_CLIENT_VERSION =
  "PROFIN_NEXT_TRANSPORT_PATCH_35_2026" as const;


export const APPS_SCRIPT_HMAC_SCHEME =
  "HMAC-SHA256" as const;


export type AppsScriptAdapterCommand =
  | "ping"
  | "idempotencyProbe"
  | "createOperationWeb"
  | "createTransfer"
  | "acceptTransfer"
  | "cancelOperation"
  | "closeShift";


export type AppsScriptAdapterAuth = {
  scheme:
    typeof APPS_SCRIPT_HMAC_SCHEME;

  keyId:
    string;

  signature:
    string;
};


export type AppsScriptAdapterContext = {
  projectId:
    string;

  locationId:
    string;

  activeYear:
    number;

  userId:
    string;

  role:
    string;

  timezone:
    string;

  locale:
    string;
};


export type AppsScriptAdapterRequest<
  TPayload = Record<string, never>
> = {
  protocolVersion:
    typeof APPS_SCRIPT_ADAPTER_PROTOCOL_VERSION;

  clientVersion:
    typeof APPS_SCRIPT_ADAPTER_CLIENT_VERSION;

  requestId:
    string;

  command:
    AppsScriptAdapterCommand;

  sentAt:
    string;

  nonce:
    string;

  context:
    AppsScriptAdapterContext;

  idempotencyKey:
    string | null;

  auth:
    AppsScriptAdapterAuth;

  payload:
    TPayload;
};


export type UnsignedAppsScriptAdapterRequest<
  TPayload = Record<string, never>
> = Omit<
  AppsScriptAdapterRequest<TPayload>,
  "auth"
>;


export type AppsScriptAdapterResponse<
  TData = unknown
> = {
  protocolVersion:
    string;

  requestId:
    string;

  ok:
    boolean;

  status:
    number;

  code:
    string;

  userMessage:
    string;

  technicalMessage:
    string | null;

  data:
    TData | null;

  retryable:
    boolean;
};


export type AppsScriptPingPayload = {
  source:
    "NEXTJS";
};


export type AppsScriptPingData = {
  adapter:
    string;

  adapterVersion:
    string;

  security:
    "HMAC-SHA256";

  replayProtection:
    "NONCE+TIMESTAMP";

  status:
    "OK";

  receivedAt:
    string;
};