import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    requestId: crypto.randomUUID(),
    ok: true,
    code: "OK",
    userMessage: "Система працює",
    technicalMessage: "prototype-health-ok",
    retryable: false,
    data: {
      api: "OK",
      db: "MOCK",
      appsScript: "MOCK"
    }
  });
}
