
"use strict";

// ProFin OS PATCH 61.37
// Signed HTTP READ ONLY transfer audit.
// Allowed commands: getTransferInbox, getTransferOutbox.
// Node.js 20+.

const {
  createHmac,
  randomBytes,
  randomUUID
} = require("node:crypto");

const PROTOCOL =
  "PROFIN_APPS_SCRIPT_ADAPTER_V1";

const CLIENT =
  "PROFIN_NEXT_TRANSPORT_PATCH_35_2026";

const VERSION =
  "PROFIN-HMAC-V2";

const COMMANDS = [
  "getTransferInbox",
  "getTransferOutbox"
];

const profiles = [
  {
    name: "BAB_TEST",
    url: "https://script.google.com/macros/s/AKfycby-Rho3TFGiw4XsokNsaTf5OUWGjg10ld3b9t9mL5QlGrPtZ9avPAkA3PsVYsHRVyon0w/exec",
    locationId: "baburka-test",
    locationName: "Бабурка",
    branchCode: "BAB",
    spreadsheetId: "1UZawoIWSgZwmFlmk4HmOcTD_Ir9fxWjwBjTCRc9M6ng",
    routeStatus: "READY",
    keyIdEnv: "BAB_TEST_HMAC_KEY_ID",
    secretEnv: "BAB_TEST_HMAC_SECRET"
  },
  {
    name: "ALT_TEST",
    url: "https://script.google.com/macros/s/AKfycbwc7_diMEFXeY3Hpl5ij4y3o63euuHkePufzVEG9KJYqTS2r9ExokPh35-82vKDnjdraw/exec",
    locationId: "alternatyva-test",
    locationName: "Альтернатива",
    branchCode: "ALT",
    spreadsheetId: "1ppIrvrdzkBTg2_OEpv7kKhSZS0q3iLQesZzEVrfxfFY",
    routeStatus: "READY",
    keyIdEnv: "ALT_TEST_HMAC_KEY_ID",
    secretEnv: "ALT_TEST_HMAC_SECRET"
  }
];

// Same HMAC V2 canonicalization
// as http-readonly-test-61_15.cjs.

function scalar(value) {
  return value == null
    ? ""
    : String(value);
}

function stable(value) {
  if (value === null) {
    return "null";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable(value[key])}`
      )
      .join(",")}}`;
  }

  throw new Error(
    `Unsupported canonical type: ${typeof value}`
  );
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
    stable(
      c.annualRoute === undefined
        ? null
        : c.annualRoute
    ),
    scalar(req.idempotencyKey),
    stable(req.payload)
  ].join("\n");
}

// Read TEST credentials from environment.
// Never print HMAC secrets.

function credentials(profile) {
  const keyId = (
    process.env[profile.keyIdEnv] ||
    process.env[
      `APPS_SCRIPT_${profile.name}_HMAC_KEY_ID`
    ] ||
    ""
  ).trim();

  const secret = (
    process.env[profile.secretEnv] ||
    process.env[
      `APPS_SCRIPT_${profile.name}_HMAC_SECRET`
    ] ||
    ""
  ).trim();

  if (!keyId) {
    throw new Error(
      `Missing ${profile.keyIdEnv}`
    );
  }

  if (secret.length < 32) {
    throw new Error(
      `${profile.secretEnv} must be at least 32 characters`
    );
  }

  if (new Set(secret).size < 12) {
    throw new Error(
      `${profile.secretEnv} does not appear sufficiently random; rotate TEST secret`
    );
  }

  return {
    keyId,
    secret
  };
}

// annualRoute stays READY.
// Interbranch transferRoute stays ACTIVE.
// Both workbooks are pinned to TEST IDs.

function transferRoute(profile, command) {
  if (!COMMANDS.includes(command)) {
    throw new Error(
      "Forbidden command"
    );
  }

  const other = profiles.find(
    (p) => p.name !== profile.name
  );

  if (!other) {
    throw new Error(
      "Missing paired TEST profile"
    );
  }

  const outgoing =
    command === "getTransferOutbox";

  const source =
    outgoing ? profile : other;

  const destination =
    outgoing ? other : profile;

  return {
    projectId: "demo-project",
    year: 2026,
    status: "ACTIVE",

    sourceLocationId:
      source.locationId,

    destinationLocationId:
      destination.locationId,

    sourceLocationName:
      source.locationName,

    destinationLocationName:
      destination.locationName,

    sourceCode:
      source.branchCode,

    destinationCode:
      destination.branchCode,

    sourceSpreadsheetId:
      source.spreadsheetId,

    destinationSpreadsheetId:
      destination.spreadsheetId
  };
}

// Create an independent signed request
// for each Inbox / Outbox call.

function buildRequest(
  profile,
  creds,
  command
) {
  if (!COMMANDS.includes(command)) {
    throw new Error(
      "Forbidden command"
    );
  }

  const req = {
    protocolVersion: PROTOCOL,
    clientVersion: CLIENT,

    requestId:
      randomUUID(),

    command,

    sentAt:
      new Date().toISOString(),

    nonce:
      randomBytes(16).toString("hex"),

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
        spreadsheetId:
          profile.spreadsheetId,
        schemaVersion:
          "PROFIN_OS_2026_SCHEMA_V1"
      }
    },

    idempotencyKey: null,

    payload: {
      transferRoute:
        transferRoute(profile, command)
    }
  };

  req.auth = {
    scheme: "HMAC-SHA256",

    keyId:
      creds.keyId,

    signature:
      createHmac(
        "sha256",
        Buffer.from(
          creds.secret,
          "utf8"
        )
      )
        .update(
          canonical(req),
          "utf8"
        )
        .digest("hex")
  };

  return req;
}

// Execute one real signed HTTP READ ONLY request.

async function runTest(
  profile,
  creds,
  command
) {
  console.log(
    `\n=== ${profile.name} / ${command} / READ ONLY ===`
  );

  const req = buildRequest(
    profile,
    creds,
    command
  );

  const response = await fetch(
    profile.url,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(req),

      redirect: "follow",

      signal:
        AbortSignal.timeout(45000)
    }
  );

  const raw =
    await response.text();

  let result;

  try {
    result = JSON.parse(raw);

  } catch {
    console.log(
      JSON.stringify(
        {
          httpStatus:
            response.status,

          code:
            "NON_JSON_RESPONSE",

          contentType:
            response.headers.get(
              "content-type"
            ) || null,

          pass: false
        },
        null,
        2
      )
    );

    return false;
  }

  const items =
    result?.data?.result?.items;

  const itemsValid =
    Array.isArray(items) &&
    items.every(
      (item) =>
        item !== null &&
        typeof item === "object" &&
        !Array.isArray(item)
    );

  const pass =
    response.status === 200 &&
    result?.ok === true &&
    result?.status === 200 &&
    itemsValid;

  const pairedVerifiedCount =
    itemsValid &&
    command === "getTransferOutbox"
      ? items.filter(
          (item) =>
            item.pairedVerified === true
        ).length
      : null;

  const reconciliationNeededCount =
    itemsValid &&
    command === "getTransferOutbox"
      ? items.filter(
          (item) =>
            item.pairedVerified !== true
        ).length
      : null;

  console.log(
    JSON.stringify(
      {
        httpStatus:
          response.status,

        ok:
          result?.ok ?? null,

        status:
          result?.status ?? null,

        code:
          result?.code ?? null,

        technicalMessage:
          pass
            ? null
            : (
                result?.technicalMessage ??
                null
              ),

        itemCount:
          itemsValid
            ? items.length
            : null,

        pairedVerifiedCount,

        reconciliationNeededCount,

        pass
      },
      null,
      2
    )
  );

  console.log(
    pass
      ? `RESULT: PASS ${profile.name} ${command}`
      : `RESULT: FAIL ${profile.name} ${command}`
  );

  return pass;
}

// Run all four requests or only one TEST profile.

async function main() {
  const requestedProfile =
    process.argv[2] || "";

  if (
    requestedProfile &&
    !profiles.some(
      (p) => p.name === requestedProfile
    )
  ) {
    throw new Error(
      "Usage: node --env-file=.env.local http-transfer-readonly-test-61_37.cjs [BAB_TEST|ALT_TEST]"
    );
  }

  const selected =
    requestedProfile
      ? profiles.filter(
          (p) =>
            p.name === requestedProfile
        )
      : profiles;

  // Verify credentials before HTTP calls.

  const pairs =
    selected.map(
      (profile) => ({
        profile,
        creds: credentials(profile)
      })
    );

  // Independent keys for two branches.

  if (
    pairs.length === 2 &&
    (
      pairs[0].creds.keyId ===
        pairs[1].creds.keyId ||
      pairs[0].creds.secret ===
        pairs[1].creds.secret
    )
  ) {
    throw new Error(
      "TEST profiles must have independent key IDs and secrets"
    );
  }

  let passed = 0;
  let total = 0;

  for (
    const { profile, creds } of pairs
  ) {
    for (const command of COMMANDS) {
      total += 1;

      try {
        const ok = await runTest(
          profile,
          creds,
          command
        );

        if (ok) {
          passed += 1;
        }

      } catch (error) {
        console.log(
          JSON.stringify(
            {
              profile:
                profile.name,

              command,

              code:
                "TRANSPORT_ERROR",

              message:
                String(
                  error.message ||
                  error
                ),

              pass: false
            },
            null,
            2
          )
        );
      }
    }
  }

  console.log(
    `\nHTTP TRANSFER READ ONLY: ${passed}/${total} PASS`
  );

  if (passed !== total) {
    process.exitCode = 1;
  }
}

main().catch(
  (error) => {
    console.error(
      `Preflight error: ${error.message}`
    );

    process.exitCode = 1;
  }
);
