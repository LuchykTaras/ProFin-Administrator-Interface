export const CLIENT_CREATE_A83_VERSION =
  "PROFIN_CLIENT_CREATE_A83_PROD_V1" as const;

export type CreateClientA83Input = {
  name: string;
  birthDate: string; // YYYY-MM-DD
  trustedPerson: string;
  trustedPhone: string;
};

export type ClientCreateA83Mode = "DRY_RUN" | "COMMIT";

export type ClientCreateA83Request = {
  mode: ClientCreateA83Mode;
  client: CreateClientA83Input;
};

export type ClientCreateA83DryRun = {
  version: typeof CLIENT_CREATE_A83_VERSION;
  mode: "DRY_RUN";
  locationId: "main";
  sourceSheet: "\u041a\u043b\u0456\u0454\u043d\u0442\u0441\u044c\u043a\u0430 \u0431\u0430\u0437\u0430";
  duplicateFound: boolean;
  destinationFree: boolean;
  ledgerReady: boolean;
  writeEnabled: boolean;
  readyForCommit: boolean;
  writesPerformed: false;
};

export type ClientCreateA83Committed = {
  version: typeof CLIENT_CREATE_A83_VERSION;
  mode: "COMMIT";
  clientId: string;
  locationId: "main";
  sourceSheet: "\u041a\u043b\u0456\u0454\u043d\u0442\u0441\u044c\u043a\u0430 \u0431\u0430\u0437\u0430";
  replayed: boolean;
};

export type ClientCreateA83Result =
  | ClientCreateA83DryRun
  | ClientCreateA83Committed;
