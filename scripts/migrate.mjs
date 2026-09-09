import dotenv from "dotenv";
import fs from "node:fs/promises";
import postgres from "postgres";

dotenv.config({
  path: ".env.local"
});

const databaseUrl =
  process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required."
  );
}

const isLocal =
  databaseUrl.includes("localhost") ||
  databaseUrl.includes("127.0.0.1");

const sql = postgres(
  databaseUrl,
  {
    max: 1,
    prepare: false,
    ssl:
      isLocal
        ? false
        : "require"
  }
);

try {
  const migrationUrl =
    new URL(
      "../db/001_control_plane.sql",
      import.meta.url
    );

  const source =
    await fs.readFile(
      migrationUrl,
      "utf8"
    );

  await sql.unsafe(source);

  console.log(
    "ProFin control-plane migration completed."
  );
} finally {
  await sql.end();
}