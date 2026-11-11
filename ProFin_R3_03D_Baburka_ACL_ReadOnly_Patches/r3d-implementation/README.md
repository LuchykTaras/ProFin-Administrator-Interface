# ProFin OS R3-03D: Baburka ACL + financial READ-ONLY bridge

Source: Apps Script snapshot copied on 2026-11-08, 126 files (plus clasp metadata).
No Google Cloud migration, no property changes, no writer modifications.

Files to add to Next.js:
- lib/server/r3-bab-identity.ts
- app/api/shifts/reports/secure-read/route.ts

Next.js file to edit:
- lib/contracts/apps-script-adapter.ts
  Replace the final enum line `| "getShiftReportsWeb";` with:
  `| "getShiftReportsWeb"`
  `| "getShiftFinancialSnapshot";`

Files to add to the *original* Apps Script project (after testing):
- apps-script/profinR3BabSecureRead.gs

File to patch in Apps Script (current version):
- webAdapterTransport.gs, adding a handler immediately after the SCHEMA GUARD
  before PATCH 61.71. See patches/001-apps-script-transport.diff.
  apps-script/webAdapterTransport.js is a complete patched LOCAL COPY for reference.

Local test:
  node --test tests/r3-bab-acl.test.cjs

Required runtime configuration (both default to disabled):
  PROFIN_R3_BAB_ACL_BRIDGE_ENABLED=false
  PROFIN_R3_BAB_FINANCIAL_READ_ENABLED=false

Deployment sequence:
1. Make a backup. Apply Next.js files locally; run type checks and build.
2. Review GAS patch against the current editor. Save the new file and edit transport.
3. Test in an isolated deployment/copy before updating the existing Web App version.
4. Only after safe update set ACL_BRIDGE_ENABLED=true, FINANCIAL_READ_ENABLED=false.
5. In an authenticated Baburka OWNER session request:
   GET /api/shifts/reports/secure-read?date=2026-11-08&mode=acl
6. Confirm denied results for unauthorised user, wrong branch, CASHIER, and bad HMAC.
7. Enable financial read ONLY after all preceding PASS results and approved ACL:
   PROFIN_R3_BAB_FINANCIAL_READ_ENABLED=true
   GET /api/shifts/reports/secure-read?date=2026-11-08&mode=snapshot
8. Keep reports/submit POST disabled and do NOT modify legacy shifts/close.

ACL policy in GAS:
- OWNER must be present in PROFIN_SHIFT_OWNER_EMAILS.
- SENIOR_ADMIN must be present in PROFIN_SHIFT_ADMIN_EMAILS.
- Both lists must be checked server-side; the owners list must be configured.
- The archive audit detected PROFIN_SHIFT_OWNER_EMAILS but not the admin list;
  no admin PASS is expected until the approved admin allowlist is configured.
- Apps Script trusts a signed Next.js assertion of Google identity approved by Neon.
  It does NOT directly validate an ID token on each request.

Safety:
- The existing HMAC V1 canonical string is unchanged, but annualRoute is NOT
  cryptographically covered by V1. The new handler pins project/location/year,
  routeMode, status and the exact Baburka workbook ID; HTTPS remains required.
- Login/account-link verification is not equivalent to fresh Google OAuth for
  each HTTP request. Do not report tokenVerifiedForRequest=true.
- No finance writes in the new code; canSubmit stays false throughout.
- Apps Script code changes do not affect a versioned web app until a new
  deployment version is selected. Updating the existing deployment needs testing.
