const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const securitySource = fs.readFileSync(path.join(root, 'apps-script/webAdapterSecurity.js'), 'utf8');
const handlerSource = fs.readFileSync(path.join(root, 'apps-script/profinR3BabSecureRead.gs'), 'utf8');
const transportSource = fs.readFileSync(path.join(root, 'apps-script/webAdapterTransport.js'), 'utf8');
const secret = 'x'.repeat(64);
const properties = {
  PROFIN_WEB_ADAPTER_HMAC_SECRET: secret,
  PROFIN_WEB_ADAPTER_HMAC_KEY_ID: 'test-key',
  PROFIN_SHIFT_OWNER_EMAILS: 'owner@example.com',
  PROFIN_SHIFT_ADMIN_EMAILS: 'admin@example.com'
};

const runtime = {
  PropertiesService: {
    getScriptProperties() {
      return { getProperty: key => properties[key] ?? null };
    }
  },
  Utilities: {
    newBlob(data) {
      return { getBytes() { return [...Buffer.from(data, 'utf8')].map(x => x > 127 ? x - 256 : x); } };
    },
    computeHmacSha256Signature(message, key) {
      return [...crypto.createHmac('sha256', Buffer.from(key)).update(Buffer.from(message)).digest()]
        .map(x => x > 127 ? x - 256 : x);
    }
  },
  profinWebAdapterError_: (status, code) => Object.assign(new Error(code), {status,code}),
  PFSW_V1: {version:'X'},
  PFSW_formSnapshot_: (date, identity) => ({date,revision:'b'.repeat(64),identity,canSubmit:true}),
};
vm.createContext(runtime);
vm.runInContext(securitySource, runtime);
vm.runInContext(handlerSource, runtime);

function request(role = 'OWNER', email = 'owner@example.com') {
  return {
    protocolVersion: 'PROFIN_APPS_SCRIPT_ADAPTER_V1',
    clientVersion: 'PROFIN_NEXT_TRANSPORT_PATCH_35_2026',
    requestId: 'req-test',
    command: 'getShiftFinancialSnapshot',
    sentAt: '2026-11-08T19:00:00.000Z',
    nonce: 'd'.repeat(32),
    context: {
      projectId: 'demo-project', locationId: 'main', activeYear: 2026,
      userId: 'usr-test', role, timezone: 'Europe/Kyiv', locale: 'uk-UA',
      annualRoute: {
        projectId:'demo-project', locationId:'main', year:2026,
        status:'ACTIVE',routeMode:'PRODUCTION',
        spreadsheetId:'1EUffLqpIy-VOiGqIN85BaZ4dV62Sn6bz3PjzhiFrkDw'
      }
    },
    idempotencyKey: null,
    payload: {
      mode: 'ACL_CHECK', date:'2026-11-08',
      identity: {googleSub:'1234567890123456789',googleEmail:email}
    }
  };
}
function sign(r) {
  const signature = crypto.createHmac('sha256', secret)
    .update(runtime.profinWebAdapterBuildCanonicalString_(r)).digest('hex');
  r.auth = {scheme:'HMAC-SHA256',keyId:'test-key',signature};
  return r;
}
function check(r) {
  runtime.profinWebAdapterVerifyHmac_(r);
  return runtime.profinR3BabSecureRead_(r,{
    spreadsheet:{getId:()=>r.context.annualRoute.spreadsheetId}
  });
}

test('owner ACL PASS, no finance data and no submission', () => {
  const result = check(sign(request()));
  assert.equal(result.authorized,true);
  assert.equal(result.isOwner,true);
  assert.equal(result.canSubmit,false);
  assert.equal(result.snapshot,undefined);
});
test('senior admin explicit allowlist PASS', () => {
  const result = check(sign(request('SENIOR_ADMIN','admin@example.com')));
  assert.equal(result.authorized,true);
  assert.equal(result.isOwner,false);
});
test('unauthorized email denied', () => {
  assert.throws(()=>check(sign(request('SENIOR_ADMIN','stranger@example.com'))),
    {code:'R3_BAB_ACL_DENIED'});
});
test('cashier denied', () => {
  assert.throws(()=>check(sign(request('CASHIER'))),{code:'R3_BAB_ROLE_DENIED'});
});
test('wrong branch denied', () => {
  const r = request(); r.context.locationId='alternatyva';
  assert.throws(()=>check(sign(r)),{code:'R3_BAB_ROUTE_DENIED'});
});
test('bad HMAC denied before any ACL call', () => {
  const r = sign(request()); r.payload.identity.googleEmail='stranger@example.com';
  assert.throws(()=>check(r),{code:'INVALID_HMAC_SIGNATURE'});
});
test('snapshot mode forces canSubmit=false', () => {
  const r = request(); r.payload.mode='SNAPSHOT';
  const x = check(sign(r));
  assert.equal(x.snapshot.canSubmit,false);
  assert.equal(x.canSubmit,false);
});
test('owner allowlist missing denied', () => {
  const old=properties.PROFIN_SHIFT_OWNER_EMAILS;
  properties.PROFIN_SHIFT_OWNER_EMAILS='';
  try {assert.throws(()=>check(sign(request())),{code:'R3_BAB_OWNER_ALLOWLIST_MISSING'});}
  finally {properties.PROFIN_SHIFT_OWNER_EMAILS=old;}
});
test('signed secure-read branch follows HMAC verification in doPost', () => {
  const verify = transportSource.indexOf('profinWebAdapterVerifyHmac_(');
  const branch = transportSource.indexOf("if (request.command === 'getShiftFinancialSnapshot')");
  assert.ok(verify !== -1 && branch > verify);
});
