import "server-only";

import postgres from "postgres";

type SqlClient = ReturnType<typeof postgres>;

type GlobalDatabase = typeof globalThis & {
  __profinSql?: SqlClient;
};

const globalDatabase = globalThis as GlobalDatabase;

export function db(): SqlClient {
  if (globalDatabase.__profinSql) {
    return globalDatabase.__profinSql;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is not configured."
    );
  }

  const isLocal =
    databaseUrl.includes("localhost") ||
    databaseUrl.includes("127.0.0.1");

  const client = postgres(databaseUrl, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: isLocal ? false : "require"
  });

  globalDatabase.__profinSql = client;

  return client;
}