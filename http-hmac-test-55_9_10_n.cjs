"use strict";

const { createHmac, randomBytes, randomUUID } = require("node:crypto");

const PROTOCOL = "PROFIN_APPS_SCRIPT_ADAPTER_V1";
const CLIENT = "PROFIN_NEXT_TRANSPORT_PATCH_35_2026";
const VERSION = "PROFIN-HMAC-V2";

const profiles = [
  {
    name: "BAB_TEST",
    url: "https://script.google.com/macros/s/AKfycby-Rho3TFGiw4XsokNsaTf5OUWGjg10ld3b9t9mL5QlGrPtZ9avPAkA3PsVYsHRVyon0w/exec",
    locationId: "baburka-test",
    spreadsheetId: "1UZawoIWSgZwmFlmk4HmOcTD_Ir9fxWjwBjTCRc9M6ng",
    routeStatus: "READY",
    keyIdEnv: "BAB_TEST_HMAC_KEY_ID",
    secretEnv: "BAB_TEST_HMAC_SECRET",
  },
  {
    name: "ALT_TEST",
    url: "https://script.google.com/macros/s/AKfycbwc7_diMEFXeY3Hpl5ij4y3o63euuHkePufzVEG9KJYqTS2r9ExokPh35-82vKDnjdraw/exec",
    locationId: "alternatyva-test",
    spreadsheetId: "1ppIrvrdzkBTg2_OEpv7kKhSZS0q3iLQesZzEVrfxfFY",
    routeStatus: "READY",
    keyIdEnv: "ALT_TEST_HMAC_KEY_ID",
    secretEnv: "ALT_TEST_HMAC_SECRET",
  },
];

function scalar(value) {
  return value == null ? "" : String(value);
}

function stable(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  throw new Error(`Unsupported canonical type: ${typeof value}`);
}

function canonical(req) {
  const c = req.context || {};
  return [
    VERSION,
    scalar(req.protocolVersion),
    scalar(req.clientVersion),
    scalar(req.requestId),
    scalar(req.command),
    scalar(req.sentAt),
    scalar(req.nonce),
    scalar(c.projectId),
    scalar(c.locationId),
    scalar(c.activeYear),
    scalar(c.userId),
    scalar(c.role),
    scalar(c.timezone),
    scalar(c.locale),
    stable(c.annualRoute === undefined ? null : c.annualRoute),
    scalar(req.idempotencyKey),
    stable(req.payload),
  ].join("\n");
}

function credentials(profile) {
  const keyId = (
    process.env[profile.keyIdEnv] ||
    process.env[`APPS_SCRIPT_${profile.name}_HMAC_KEY_ID`] ||
    ""
  ).trim();

  const secret = (
    process.env[profile.secretEnv] ||
    process.env[`APPS_SCRIPT_${profile.name}_HMAC_SECRET`] ||
    ""
  ).trim();
  if (!keyId) throw new Error(`Missing ${profile.keyIdEnv}`);
  if (secret.length < 32) throw new Error(`${profile.secretEnv} must be at least 32 characters`);
  if (new Set(secret).size < 12) throw new Error(`${profile.secretEnv} does not appear sufficiently random; rotate TEST secret`);
  return { keyId, secret };
}

function buildRequest(profile, keyId, secret) {
  const req = {
    protocolVersion: PROTOCOL,
    clientVersion: CLIENT,
    requestId: randomUUID(),
    command: "ping",
    sentAt: new Date().toISOString(),
    nonce: randomBytes(16).toString("hex"),
    context: {
      projectId: "demo-project",
      locationId: profile.locationId,
      activeYear: 2026,
      userId: "diagnostic",
      role: "SENIOR_ADMIN",
      timezone: "Europe/Kyiv",
      locale: "uk-UA",
      annualRoute: {
        projectId: "demo-project",
        locationId: profile.locationId,
        year: 2026,
        status: profile.routeStatus,
        routeMode: "TEST",
        spreadsheetId: profile.spreadsheetId,
        schemaVersion: "PROFIN_OS_2026_SCHEMA_V1",
      },
    },
    idempotencyKey: null,
    payload: { source: "NEXTJS" },
  };
  req.auth = {
    scheme: "HMAC-SHA256",
    keyId,
    signature: createHmac("sha256", Buffer.from(secret, "utf8"))
      .update(canonical(req), "utf8")
      .digest("hex"),
  };
  return req;
}

async function ping(profile, creds) {
  console.log(`\n=== ${profile.name} SIGNED PING ===`);
  const req = buildRequest(profile, creds.keyId, creds.secret);
  const response = await fetch(profile.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    console.log(`HTTP=${response.status}; non-JSON response (first 240 characters): ${raw.slice(0, 240)}`);
    return false;
  }
  console.log(JSON.stringify({
    httpStatus: response.status,
    ok: result.ok,
    status: result.status,
    code: result.code || null,
    userMessage: result.userMessage || null,
    technicalMessage: result.technicalMessage || null,
    adapterBuildId: result.adapterBuildId || null,
    requestId: result.requestId || null,
  }, null, 2));
  const passed = result.ok === true;
  console.log(passed ? "RESULT: PASS (signed ping accepted)" : "RESULT: NOT PASS (inspect adapter response)");
  return passed;
}

async function main() {
  const requestedProfile = process.argv[2] || "";
  if (requestedProfile && !["BAB_TEST", "ALT_TEST"].includes(requestedProfile)) {
    throw new Error("Usage: node http-hmac-test-55_9_10_n.cjs [BAB_TEST|ALT_TEST]");
  }
  const selected = requestedProfile
    ? profiles.filter((profile) => profile.name === requestedProfile)
    : profiles;
  const pairs = selected.map((profile) => ({ profile, creds: credentials(profile) }));
  if (pairs.length === 2 &&
      (pairs[0].creds.keyId === pairs[1].creds.keyId ||
       pairs[0].creds.secret === pairs[1].creds.secret)) {
    throw new Error("TEST profiles must have independent key IDs and secrets");
  }
  let failures = 0;
  for (const { profile, creds } of pairs) {
    try {
      if (!(await ping(profile, creds))) failures++;
    } catch (error) {
      failures++;
      console.error(`${profile.name}: ${error.message}`);
    }
  }
  console.log(`\nHTTP SIGNED PING: ${pairs.length - failures}/${pairs.length} accepted`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Preflight error: ${error.message}`);
  process.exitCode = 1;
});
