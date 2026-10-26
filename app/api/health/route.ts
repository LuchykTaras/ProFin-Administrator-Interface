import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      requestId: crypto.randomUUID(),
      ok: true,
      code: "API_HEALTH_OK",
      userMessage: "Вебсервер відповідає.",
      technicalMessage:
        "API liveness only. Neon and Apps Script were not checked.",
      retryable: false,
      data: {
        api: "OK",
        db: "NOT_CHECKED",
        appsScript: "NOT_CHECKED"
      }
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}