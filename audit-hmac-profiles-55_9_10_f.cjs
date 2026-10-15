/*
 * PATCH 55.9.10.F — local HMAC profile audit.
 * Uses mock keys ONLY. No HTTP, database, or spreadsheet calls.
 * Run from the Next.js project root:
 *   node audit-hmac-profiles-55_9_10_f.cjs
 * Or pass the full local path to apps-script-signing.ts as the first argument.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const ts = require("typescript");

const input = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(process.cwd(), "lib/server/apps-script-signing.ts");

if (!fs.existsSync(input)) {
  console.error("[ERROR] Could not find apps-script-signing.ts:", input);
  process.exit(2);
}

const fixtureSecrets = Object.freeze({
  APPS_SCRIPT_HMAC_KEY_ID: "AUDIT_BAB_PRODUCTION",
  APPS_SCRIPT_HMAC_SECRET: "local-mock-bab-production-secret-only-000001",
  APPS_SCRIPT_ALT_HMAC_KEY_ID: "AUDIT_ALT_PRODUCTION",
  APPS_SCRIPT_ALT_HMAC_SECRET: "local-mock-alt-production-secret-only-000002",
  APPS_SCRIPT_BAB_TEST_HMAC_KEY_ID: "AUDIT_BAB_TEST",
  APPS_SCRIPT_BAB_TEST_HMAC_SECRET: "local-mock-bab-test-secret-only-000000003",
  APPS_SCRIPT_ALT_TEST_HMAC_KEY_ID: "AUDIT_ALT_TEST",
  APPS_SCRIPT_ALT_TEST_HMAC_SECRET: "local-mock-alt-test-secret-only-000000004"
});

class MockAppError extends Error {
  constructor(options) {
    super(options.userMessage || options.code || "AppError");
    this.code = options.code;
    this.status = options.status;
  }
}

const compiled = ts.transpileModule(fs.readFileSync(input, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  },
  reportDiagnostics: true,
  fileName: input
});

const diagnosticErrors = (compiled.diagnostics || []).filter(
  d => d.category === ts.DiagnosticCategory.Error
);
if (diagnosticErrors.length) {
  console.error("[ERROR] TypeScript transpilation had errors:", diagnosticErrors.length);
  process.exit(2);
}

const mod = { exports: {} };
const sandbox = {
  exports: mod.exports,
  module: mod,
  Buffer,
  process: { env: fixtureSecrets },
  require(name) {
    if (name === "server-only") return {};
    if (name === "node:crypto") return crypto;
    if (name === "@/lib/contracts/apps-script-adapter") {
      return { APPS_SCRIPT_HMAC_SCHEME: "HMAC-SHA256" };
    }
    if (name === "@/lib/server/errors") return { AppError: MockAppError };
    throw new Error("Unexpected import blocked by audit: " + name);
  }
};
vm.runInNewContext(compiled.outputText, sandbox, {
  filename: path.basename(input),
  timeout: 5000
});

const { signAppsScriptRequest, buildAppsScriptCanonicalString } = mod.exports;
if (typeof signAppsScriptRequest !== "function" ||
    typeof buildAppsScriptCanonicalString !== "function") {
  console.error("[ERROR] Required signer exports are missing");
  process.exit(2);
}

const sheets = Object.freeze({
  BAB_PRODUCTION: "1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw",
  ALT_PRODUCTION: "1Xq-byiSUVSOhNB30rDGrt9WecxI9unZEMXwxvwuhPM8",
  BAB_TEST: "1UZawoIWSgZwmFlmk4HmOcTD_Ir9fxWjwBjTCRc9M6ng",
  ALT_TEST: "1ppIrvrdzkBTg2_OEpv7kKhSZS0q3iLQesZzEVrfxfFY"
});

const profiles = [
  { name: "BAB_PRODUCTION", location: "main", mode: "PRODUCTION", v: "V1", env: "APPS_SCRIPT" },
  { name: "ALT_PRODUCTION", location: "alternatyva", mode: "PRODUCTION", v: "V2", env: "APPS_SCRIPT_ALT" },
  { name: "BAB_TEST", location: "baburka-test", mode: "TEST", v: "V2", env: "APPS_SCRIPT_BAB_TEST" },
  { name: "ALT_TEST", location: "alternatyva-test", mode: "TEST", v: "V2", env: "APPS_SCRIPT_ALT_TEST" }
];

function buildRequest(profile) {
  const route = {
    projectId: "demo-project",
    locationId: profile.location,
    year: 2026,
    status: profile.mode === "TEST" ? "READY" : "ACTIVE",
    routeMode: profile.mode,
    spreadsheetId: sheets[profile.name],
    schemaVersion: "AUDIT_SCHEMA",
    adapterWebAppUrl: null
  };
  return {
    protocolVersion: "PROFIN_APPS_SCRIPT_ADAPTER_V1",
    clientVersion: "PROFIN_NEXT_TRANSPORT_PATCH_35_2026",
    requestId: "audit-local-request",
    command: "ping",
    sentAt: "2026-10-15T00:00:00.000Z",
    nonce: "audit-nonce-00000000000000000000001",
    context: {
      projectId: "demo-project",
      locationId: profile.location,
      activeYear: 2026,
      userId: "audit-local-user",
      role: "SENIOR_ADMIN",
      timezone: "Europe/Kyiv",
      locale: "uk-UA",
      annualRoute: route
    },
    idempotencyKey: null,
    payload: { source: "NEXTJS" }
  };
}

const findings = [];
function check(description, ok) {
  findings.push({ description, passed: !!ok });
  process.stdout.write(`${ok ? "[PASS]" : "[FAIL]"} ${description}\n`);
}
function rejects(description, req, expectedCode) {
  let caught = null;
  try { signAppsScriptRequest(req); } catch (error) { caught = error; }
  check(description, caught !== null && (!expectedCode || caught.code === expectedCode));
}

for (const p of profiles) {
  const req = buildRequest(p);
  const canon = buildAppsScriptCanonicalString(req);
  const auth = signAppsScriptRequest(req);
  const expectedPrefix = p.v === "V1" ? "PROFIN-HMAC-V1" : "PROFIN-HMAC-V2";
  const expectedKeyId = fixtureSecrets[`${p.env}_HMAC_KEY_ID`];
  const expectedSig = crypto
    .createHmac("sha256", Buffer.from(fixtureSecrets[`${p.env}_HMAC_SECRET`], "utf8"))
    .update(Buffer.from(canon, "utf8"))
    .digest("hex");
  check(`${p.name}: version ${p.v}`, canon.startsWith(expectedPrefix + "\n"));
  check(`${p.name}: independent MOCK key ID`, auth.keyId === expectedKeyId);
  check(`${p.name}: signature matches independent MOCK secret`, auth.signature === expectedSig);
  check(`${p.name}: annualRoute coverage`, p.v === "V1"
    ? !canon.includes(sheets[p.name])
    : canon.includes(sheets[p.name]));

  req.context.annualRoute.schemaVersion = "AUDIT_CHANGED_SCHEMA";
  const changedCanon = buildAppsScriptCanonicalString(req);
  check(`${p.name}: canonical changes only for V2 when route changes`,
    p.v === "V1" ? canon === changedCanon : canon !== changedCanon);
}

const badTest = buildRequest(profiles[2]);
badTest.context.annualRoute.spreadsheetId = sheets.ALT_TEST;
rejects("BAB_TEST: ALT TEST spreadsheet rejected", badTest, "TEST_HMAC_SPREADSHEET_FORBIDDEN");

const badTestMode = buildRequest(profiles[2]);
badTestMode.context.annualRoute.routeMode = "PRODUCTION";
rejects("BAB_TEST: fake production mode rejected", badTestMode, "TEST_HMAC_ROUTE_FORBIDDEN");

const badProdAlt = buildRequest(profiles[1]);
badProdAlt.context.annualRoute.spreadsheetId = sheets.BAB_PRODUCTION;
rejects("ALT_PRODUCTION: incorrect spreadsheet rejected", badProdAlt, "ALT_PRODUCTION_ROUTE_MISMATCH");

const badProdAltProject = buildRequest(profiles[1]);
badProdAltProject.context.projectId = "foreign-project";
badProdAltProject.context.annualRoute.projectId = "foreign-project";
rejects("ALT_PRODUCTION: foreign project rejected", badProdAltProject, "ALT_PRODUCTION_ROUTE_MISMATCH");

const badProdBab = buildRequest(profiles[0]);
badProdBab.context.annualRoute.spreadsheetId = sheets.ALT_PRODUCTION;
rejects("BAB_PRODUCTION: incorrect spreadsheet rejected", badProdBab, "BAB_PRODUCTION_ROUTE_MISMATCH");

const unknownProd = buildRequest(profiles[0]);
unknownProd.context.locationId = "unknown-location";
unknownProd.context.annualRoute.locationId = "unknown-location";
rejects("UNKNOWN_PRODUCTION: no BAB key fallback", unknownProd, "UNKNOWN_PRODUCTION_HMAC_ROUTE");

const missingRoute = buildRequest(profiles[0]);
missingRoute.context.annualRoute = null;
rejects("Missing annualRoute must be rejected", missingRoute, "HMAC_ANNUAL_ROUTE_INVALID");

const pass = findings.filter(x => x.passed).length;
const fail = findings.length - pass;
console.log(`\nRESULT: ${pass}/${findings.length} checks passed; failures: ${fail}`);
console.log("This audit used MOCK secrets only, and made no HTTP/DB/Sheets calls.");
if (fail) process.exitCode = 1;
