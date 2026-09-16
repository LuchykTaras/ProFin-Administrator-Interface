export type InterfaceServiceStatus =
  | "OK"
  | "NOT_CONNECTED"
  | "ERROR";


export type InterfaceBootstrapData = {
  context: {
    userId: string;

    displayName: string;

    role:
      | "CASHIER"
      | "SENIOR_ADMIN"
      | "OWNER"
      | "SYSTEM";

    projectId: string;
    projectName: string;

    locationId: string;
    locationName: string;

    activeYear: number;

    timezone: string;
    locale: string;

    sessionExpiresAt: string;
  };

  permissions: {
    operationCreate: boolean;
    journalRead: boolean;
    inventoryRead: boolean;
    correctionRequest: boolean;
    cancellationRequest: boolean;
  };

  services: {
    api: InterfaceServiceStatus;

    database:
      InterfaceServiceStatus;

    domainAdapter:
      InterfaceServiceStatus;

    checkedAt: string;
  };

  domainCommandsReady: boolean;
};


export type ApiEnvelope<T> = {
  requestId: string;

  ok: boolean;

  code: string;

  userMessage: string;

  technicalMessage:
    string | null;

  data:
    T | null;

  retryable: boolean;
};