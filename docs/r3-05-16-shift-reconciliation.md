# R3-05-16 — shift reconciliation, fail closed

## Status

The Next.js read-only reconciliation endpoint and its adapter-command type are implemented in this branch. **This is not yet a working end-to-end deployment.** The Apps Script transport dispatcher and read-only reconciliation handler must still be wired to the actual writer metadata format and verified.

Do not enable `PROFIN_SHIFT_WRITE_ENABLED` or `PROFIN_SHIFT_SUBMIT_ENABLED` to test reconciliation.

## Read-only endpoint

`GET /api/shifts/reports/reconcile?date=YYYY-MM-DD&idempotencyKey=<uuid>&payloadSha256=<hex sha256>`

Only authenticated OWNER and SENIOR_ADMIN sessions with `shift:read` and a verified Google identity link can call the endpoint. It resolves the annual Apps Script route server-side. No write command or Google ID token is used for this read.

The expected `payloadSha256` is SHA-256 of the EXACT submitted **official report JSON body** (not the earlier `ShiftReportSubmissionDraft` serialization). Its value must be recorded alongside the UUID at submission time. Calculating this hash only after the failure is not proof of what was sent.

## Required Apps Script signed command: reconcileShiftReport

The existing HMAC-verified `doPost` dispatcher must route this new command to a **read-only** implementation. Do not add a new unsecured Apps Script endpoint.

Input:

- `payload.date`
- `payload.idempotencyKey`
- `payload.payloadSha256`
- `payload.identity.googleEmail` and `payload.identity.googleSub`
- HMAC-signed transport `request.context`, including branch and role.

The implementation must:
1. Independently check the trusted workbook ID, authenticated role OWNER or SENIOR_ADMIN, and email in the respective Apps Script role allowlist. Require the account to match signed, verified identity. OWNER has the sole authority to approve FIRST opening balances. SENIOR_ADMIN may submit later daily reports.
2. Locate EXACTLY ONE committed idempotency record by UUID and its persisted canonical payload SHA-256 (never infer from same date or report ID alone).
3. Reject any mismatch in UUID, date, SHA-256, report ID, workbook, or actor binding. If existing metadata lacks this digest or actor linkage, return UNRESOLVED.
4. Verify EXACTLY ONE matching report row, EXACTLY FOUR detail rows, and EXACTLY SEVEN KPI rows for report ID `SHIFT-YYYYMMDD`; reject duplicate or incomplete sets.
5. Return `data.result` only after all independent checks:
```json
{
  "verified": true,
  "readOnly": true,
  "sameRequest": true,
  "payloadMatched": true,
  "archiveVerified": true,
  "authorizationVerified": true,
  "date": "2026-11-10",
  "reportId": "SHIFT-20261110",
  "idempotencyKey": "<same uuid>",
  "payloadSha256": "<same hex>",
  "archiveRows": { "reports": 1, "details": 4, "kpi": 7 }
}
```
6. Never call `PFSW_submitTrusted_`, `PFSW_replay_` if that function can write, `setValues`, `appendRow`, `Sheets.Spreadsheets.batchUpdate`, or anything that modifies the spreadsheet or metadata.

Anything else must NOT set `verified: true`. The HTTP endpoint will return 409 `SHIFT_RECONCILIATION_UNRESOLVED` for a response with missing or mismatched fields.

## Important: already written 2026-11-10 report

Archive contains 1 report, 4 account rows, 7 KPI rows and one idempotency metadata record. Those counts do NOT prove that the report matches the original payload digest. Do not claim recovered success or re-send; reconcile manually until the original UUID and digest are located.

## Required integration tests

- missing/invalid UUID or SHA-256 -> 400
- absent role/identity/ACL -> 403
- unmatched UUID, changed body, duplicate rows, missing digest or actor, mismatched date -> 409 or error; no write
- valid same UUID + same hash, archive 1/4/7 -> 200 SHIFT_RECONCILIATION_CONFIRMED
- existing report with fresh UUID -> UNRESOLVED, no write
- run read-only diagnostics before and after every test: identical reports/details/kpi/metadata counts

## Browser integration

Save {UUID, full exact-body SHA-256, date, branch, account} BEFORE the original POST in persistent storage. Do not store Google tokens. If submit outcome is unknown, disable submit and call reconciliation. Mark `Звіт подано` ONLY on `SHIFT_RECONCILIATION_CONFIRMED`. Do not clear pending on 409, 500, network error, or browser reload. Clear only after confirmed success or audited operator action.

**No automatic retry of the POST after a network error.**

## Deployment gate

No production activation until Apps Script command, metadata contract, no-write tests, OWNER-first / SENIOR_ADMIN-later role tests and UI integration pass. Test using an isolated test workbook first.
