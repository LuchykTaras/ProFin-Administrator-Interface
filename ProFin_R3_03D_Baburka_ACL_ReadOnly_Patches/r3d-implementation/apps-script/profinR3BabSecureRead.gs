/*
 * R3-03D BABURKA - signed, read-only finance bridge.
 * No doGet, doPost, writes, property updates, or ACL bypass.
 * The HMAC envelope MUST be verified by webAdapterTransport.doPost
 * before this internal function is called.
 */
function profinR3BabSecureRead_(request, trustedRoute) {
  function deny(status, code) {
    throw profinWebAdapterError_(
      status, code,
      'Financial access denied.',
      code,
      false
    );
  }

  var c = request && request.context;
  var p = request && request.payload;
  var route = c && c.annualRoute;
  var bookId = '1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw';

  if (
    !c || !route ||
    c.projectId !== 'demo-project' ||
    c.locationId !== 'main' ||
    c.activeYear !== 2026 ||
    route.projectId !== c.projectId ||
    route.locationId !== c.locationId ||
    route.year !== c.activeYear ||
    route.routeMode !== 'PRODUCTION' ||
    route.status !== 'ACTIVE' ||
    route.spreadsheetId !== bookId ||
    !trustedRoute || !trustedRoute.spreadsheet ||
    trustedRoute.spreadsheet.getId() !== bookId
  ) deny(403, 'R3_BAB_ROUTE_DENIED');

  if (
    (c.role !== 'OWNER' && c.role !== 'SENIOR_ADMIN') ||
    typeof c.userId !== 'string' ||
    !c.userId.trim()
  ) deny(403, 'R3_BAB_ROLE_DENIED');

  if (
    !p || typeof p !== 'object' || Array.isArray(p) ||
    Object.keys(p).sort().join(',') !== 'date,identity,mode' ||
    (p.mode !== 'ACL_CHECK' && p.mode !== 'SNAPSHOT') ||
    typeof p.date !== 'string' ||
    !/^2026-\d{2}-\d{2}$/.test(p.date)
  ) deny(400, 'R3_BAB_PAYLOAD_INVALID');

  var dateObj = new Date(p.date + 'T00:00:00.000Z');
  if (
    isNaN(dateObj.getTime()) ||
    dateObj.toISOString().slice(0, 10) !== p.date
  ) deny(400, 'R3_BAB_DATE_INVALID');

  var i = p.identity;
  if (
    !i || typeof i !== 'object' || Array.isArray(i) ||
    Object.keys(i).sort().join(',') !== 'googleEmail,googleSub' ||
    typeof i.googleEmail !== 'string' ||
    typeof i.googleSub !== 'string' ||
    i.googleEmail.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(i.googleEmail) ||
    !/^[A-Za-z0-9_-]{1,255}$/.test(i.googleSub)
  ) deny(403, 'R3_BAB_GOOGLE_IDENTITY_INVALID');

  // The googleSub/email relationship was checked against Neon by Next.js.
  // Apps Script trusts only this HMAC-signed server assertion, NOT
  // Session.getEffectiveUser(), Session.getActiveUser(), or browser fields.
  var email = i.googleEmail.trim().toLowerCase();
  var props = PropertiesService.getScriptProperties();
  function allowlist(name) {
    return String(props.getProperty(name) || '')
      .split(/[;,\n]/)
      .map(function(x) { return x.trim().toLowerCase(); })
      .filter(Boolean);
  }
  var owners = allowlist('PROFIN_SHIFT_OWNER_EMAILS');
  var admins = allowlist('PROFIN_SHIFT_ADMIN_EMAILS');
  if (!owners.length) deny(403, 'R3_BAB_OWNER_ALLOWLIST_MISSING');

  var isOwner = c.role === 'OWNER' && owners.indexOf(email) >= 0;
  var isAdmin = c.role === 'SENIOR_ADMIN' && admins.indexOf(email) >= 0;
  if (!isOwner && !isAdmin) deny(403, 'R3_BAB_ACL_DENIED');

  if (p.mode === 'ACL_CHECK') {
    return {
      authorized: true,
      isOwner: isOwner,
      readOnly: true,
      canSubmit: false
    };
  }

  if (
    typeof PFSW_formSnapshot_ !== 'function' ||
    typeof PFSW_V1 === 'undefined'
  ) deny(503, 'R3_BAB_FINANCE_ENGINE_MISSING');

  // Existing approved calculation, no new business formulas.
  var snapshot = PFSW_formSnapshot_(p.date, {
    email: email,
    isOwner: isOwner
  });
  snapshot.canSubmit = false;

  return {
    authorized: true,
    isOwner: isOwner,
    readOnly: true,
    canSubmit: false,
    snapshot: snapshot
  };
}
