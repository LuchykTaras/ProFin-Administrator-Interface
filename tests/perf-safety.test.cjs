const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const journal = read('components/journal/operation-journal.tsx');
const modal = read('components/operation-form-modal.tsx');
const createRoute = read('app/api/operations/create/route.ts');
const journalRoute = read('app/api/operations/journal/route.ts');

test('live journal poll is 6 seconds', () => {
  assert.match(journal, /POLLING_INTERVAL_MS\s*=\s*6000\s*;/);
  assert.match(
    journal,
    /window\.setInterval\([\s\S]*?pollDelta\(\);[\s\S]*?POLLING_INTERVAL_MS/
  );
});

test('journal keeps existing delta, visibility, and concurrency guards', () => {
  assert.match(
    journal,
    /pollRequestRunningRef\.current\s*\|\|\s*document\.hidden/
  );
  assert.match(journal, /\/api\/operations\/journal\?afterRow=/);
  assert.match(
    journal,
    /activeRequestControllerRef\s*\.current\s*\?\.abort\(\)/
  );
});

test('unchanged delta does not create redundant journal state', () => {
  assert.match(
    journal,
    /delta\.rows\.length\s*===\s*0\s*&&[\s\S]*?nextRowNumber\s*===\s*current\.latestRowNumber[\s\S]*?return current;/
  );
});

test('unknown write outcome retains idempotency and is not reported as success', () => {
  assert.match(
    modal,
    /idempotencyKeyRef\.current\s*=\s*`profin-web-\$\{crypto\.randomUUID\(\)\}`/
  );
  assert.match(modal, /"APPS_SCRIPT_TIMEOUT"/);
  assert.match(modal, /"Операція могла бути записана/);
  assert.doesNotMatch(
    modal,
    /catch\s*\([^)]*\)\s*\{\s*setSubmitResult\(/
  );
});

test('write remains protected by session, RBAC, route, and adapter', () => {
  assert.match(createRoute, /await requireSessionContext\(\)/);
  assert.match(
    createRoute,
    /assertPermission\([\s\S]*?"operation:create"/
  );
  assert.match(createRoute, /await resolveActiveYearRoute\(/);
  assert.match(createRoute, /command:\s*"createOperationWeb"/);
  assert.match(createRoute, /idempotencyKey,/);
  assert.match(
    createRoute,
    /await transaction`[\s\S]*?INSERT INTO audit_events/
  );
});

test('performance logging contains no operation payload or patient fields', () => {
  for (const src of [createRoute, journalRoute]) {
    assert.match(src, /PROFIN_\w+_TIMING/);
    const logger = src.match(
      /console\.info\(JSON\.stringify\(\{[\s\S]*?\}\)\);/
    );

    assert.ok(logger);
    assert.doesNotMatch(
      logger[0],
      /payload|patient|spreadsheetId|amount|email|secret/i
    );
  }
});

test('journal uses a noninteractive skeleton on initial loading', () => {
  const skeleton = read(
    'components/journal/operation-journal-skeleton.tsx'
  );
  const css = read(
    'components/journal/operation-journal.module.css'
  );

  assert.match(journal, /return <OperationJournalSkeleton \/>/);
  assert.match(skeleton, /aria-busy="true"/);
  assert.match(skeleton, /role="status"/);
  assert.match(
    skeleton,
    /className=\{styles\.skeletonViewport\}/
  );
  assert.match(
    css,
    /\.skeletonViewport\s*\{[^}]*overflow:\s*hidden;/
  );
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('background polling does not flash loading indicator on each update', () => {
  assert.doesNotMatch(journal, /setPolling\s*\(/);
  assert.doesNotMatch(journal, /перевірка нових записів/);
  assert.match(
    journal,
    /pollRequestRunningRef\.current\s*=\s*true/
  );
  assert.match(
    journal,
    /pollRequestRunningRef\.current\s*=\s*false/
  );
});