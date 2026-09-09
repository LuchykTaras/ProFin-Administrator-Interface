import dotenv from "dotenv";

import {
  createHash,
  randomBytes,
  randomUUID
} from "node:crypto";

import postgres from "postgres";

dotenv.config({
  path: ".env.local"
});

function getArgument(name) {
  const index =
    process.argv.indexOf(
      `--${name}`
    );

  if (index === -1) {
    return undefined;
  }

  return (
    process.argv[
      index + 1
    ] ?? undefined
  );
}

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required."
  );
}

const userId =
  getArgument("user-id");

const locationId =
  getArgument("location-id");

if (!userId) {
  throw new Error(
    "--user-id is required."
  );
}

if (!locationId) {
  throw new Error(
    "--location-id is required."
  );
}

const hoursRaw =
  Number(
    getArgument("hours") ??
    process.env
      .INVITATION_TTL_HOURS ??
    "24"
  );

const ttlHours =
  Number.isFinite(hoursRaw) &&
  hoursRaw > 0
    ? hoursRaw
    : 24;

const isLocal =
  databaseUrl.includes("localhost") ||
  databaseUrl.includes("127.0.0.1");

const sql = postgres(
  databaseUrl,
  {
    max: 1,
    ssl:
      isLocal
        ? false
        : "require"
  }
);

try {
  const rows =
    await sql`
      SELECT
        u.user_id AS "userId",

        u.project_id AS
          "projectId",

        u.display_name AS
          "displayName",

        l.location_id AS
          "locationId"

      FROM users u

      INNER JOIN user_locations ul
        ON ul.user_id =
           u.user_id

      INNER JOIN locations l
        ON l.project_id =
           u.project_id
        AND l.location_id =
           ul.location_id

      INNER JOIN projects p
        ON p.project_id =
           u.project_id

      WHERE
        u.user_id =
          ${userId}

        AND l.location_id =
          ${locationId}

        AND u.status =
          'ACTIVE'

        AND l.status =
          'ACTIVE'

        AND p.status =
          'ACTIVE'

      LIMIT 1
    `;

  const user =
    rows[0];

  if (!user) {
    throw new Error(
      "Active user/location mapping not found."
    );
  }

  const token =
    randomBytes(32)
      .toString(
        "base64url"
      );

  const tokenHash =
    createHash("sha256")
      .update(
        token,
        "utf8"
      )
      .digest("hex");

  const invitationId =
    `inv_${randomUUID()}`;

  const expiresAt =
    new Date(
      Date.now() +
      ttlHours *
        60 *
        60 *
        1000
    );

  await sql`
    INSERT INTO invitations (
      invitation_id,
      user_id,
      project_id,
      location_id,
      token_hash,
      expires_at
    )
    VALUES (
      ${invitationId},
      ${user.userId},
      ${user.projectId},
      ${user.locationId},
      ${tokenHash},
      ${expiresAt}
    )
  `;

  const appUrl =
    (
      process.env.APP_URL ??
      "http://localhost:3000"
    ).replace(
      /\/$/,
      ""
    );

  console.log("");
  console.log(
    "Invitation created."
  );

  console.log(
    `User: ${user.displayName}`
  );

  console.log(
    `Expires: ${expiresAt.toISOString()}`
  );

  console.log("");
  console.log(
    "ONE-TIME LINK:"
  );

  console.log(
    `${appUrl}/activate?token=${token}`
  );

  console.log("");
} finally {
  await sql.end();
}