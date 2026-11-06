import "server-only";

export type R303CExecutionPreflightInput = {
  routePinnedVerified: boolean;
  spreadsheetApiStatus: string;
  scriptApiStatus: string;
  spreadsheetMetadataVerified: boolean;
  scriptProjectMetadataVerified: boolean;
  scriptParentVerified: boolean;
};

export function assessR303CExecutionPreflight(
  input: R303CExecutionPreflightInput
) {
  const blockingReasons: string[] = [];

  if (!input.routePinnedVerified) {
    blockingReasons.push("ANNUAL_ROUTE_NOT_VERIFIED");
  }

  if (input.spreadsheetApiStatus === "HTTP_404") {
    blockingReasons.push("SPREADSHEET_NOT_FOUND_OR_NOT_SHARED_WITH_USER");
  } else if (!input.spreadsheetMetadataVerified) {
    blockingReasons.push("SPREADSHEET_METADATA_NOT_VERIFIED");
  }

  if (input.scriptApiStatus === "HTTP_403") {
    blockingReasons.push("SCRIPT_API_FORBIDDEN_OR_DISABLED_OR_NO_ACCESS");
  } else if (!input.scriptProjectMetadataVerified) {
    blockingReasons.push("SCRIPT_PROJECT_METADATA_NOT_VERIFIED");
  }

  if (!input.scriptParentVerified) {
    blockingReasons.push("SCRIPT_WORKBOOK_BINDING_NOT_VERIFIED");
  }

  blockingReasons.push(
    "STANDARD_CLOUD_PROJECT_MATCH_NOT_VERIFIED",
    "API_EXECUTABLE_DEPLOYMENT_NOT_VERIFIED",
    "ALL_SCRIPT_EXECUTION_OAUTH_SCOPES_NOT_VERIFIED",
    "PERSONAL_APPS_SCRIPT_EXECUTION_NOT_VERIFIED",
    "PFSW_ACL_NOT_VERIFIED"
  );

  return {
    version: "PROFIN_R3_03C_02_EXECUTION_PREFLIGHT_V1" as const,
    verificationMode: "STATIC_AND_READ_ONLY_METADATA" as const,
    metadataReady:
      input.routePinnedVerified &&
      input.spreadsheetMetadataVerified &&
      input.scriptProjectMetadataVerified &&
      input.scriptParentVerified,
    scriptWorkbookBinding:
      input.scriptParentVerified
        ? "VERIFIED_CONTAINER_BOUND" as const
        : input.scriptProjectMetadataVerified
          ? "UNVERIFIED_MAY_BE_STANDALONE" as const
          : "UNVERIFIED" as const,
    sameStandardCloudProjectVerified: false as const,
    apiExecutableDeploymentVerified: false as const,
    allExecutionOauthScopesVerified: false as const,
    personalAppsScriptExecutionVerified: false as const,
    appsScriptCoreAclVerified: false as const,
    scriptsRunCalled: false as const,
    snapshotCalled: false as const,
    canExecute: false as const,
    canSubmit: false as const,
    decision: "BLOCKED" as const,
    blockingReasons
  };
}
