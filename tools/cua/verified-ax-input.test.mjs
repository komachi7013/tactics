import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedAXInput } from './verified-ax-input.mjs';

const page = '0 window URL: isolated-qa\n';
const opts = {
  expectedPage: s => s.startsWith(page),
  isTarget: n => n.text === 'ボタン Safe target',
  changed: (before, after) => before !== after && after.includes('EXPECTED'),
};
function mock(states, clickError) {
  const calls = [];
  return { calls, async getAXState() {
    calls.push('read'); const state = states.shift();
    if (state instanceof Error) throw state;
    return state;
  }, async click(id) { calls.push(['click', id]); if (clickError) throw clickError; } };
}
test('fresh id; success requires AX change and still requires visual check', async () => {
  const app = mock([page+'91 ボタン Safe target', page+'EXPECTED']);
  const result = await verifiedAXInput(app, opts);
  assert.equal(result.status, 'awaiting-visual-check');
  assert.deepEqual(app.calls, ['read', ['click', 91], 'read']);
});
test('resolved input with unchanged state stops without retry', async () => {
  const state = page+'7 ボタン Safe target'; const app = mock([state, state]);
  assert.equal((await verifiedAXInput(app, opts)).phase, 'postcondition');
  assert.deepEqual(app.calls, ['read', ['click', 7], 'read']);
});
test('input error stops even if a partial side effect might have occurred', async () => {
  const app = mock([page+'7 ボタン Safe target'], new Error('noWindowsAvailable'));
  const result = await verifiedAXInput(app, opts);
  assert.equal(result.phase, 'input'); assert.match(result.error, /noWindowsAvailable/);
  assert.deepEqual(app.calls, ['read', ['click', 7]]);
});
test('duplicate target does not input', async () => {
  const app = mock([page+'7 ボタン Safe target\n8 ボタン Safe target']);
  assert.equal((await verifiedAXInput(app, opts)).phase, 'target-count');
  assert.deepEqual(app.calls, ['read']);
});
test('disabled target does not input', async () => {
  const app = mock([page+'7 ボタン (disabled) Safe target']);
  assert.equal((await verifiedAXInput(app, opts)).phase, 'target-count');
  assert.deepEqual(app.calls, ['read']);
});
test('wrong page does not input', async () => {
  const app = mock(['0 window URL: normal-save\n7 ボタン Safe target']);
  assert.equal((await verifiedAXInput(app, opts)).phase, 'wrong-page');
  assert.deepEqual(app.calls, ['read']);
});
test('page/session change after input stops even with matching postcondition', async () => {
  const app = mock([page+'7 ボタン Safe target', '0 window URL: normal-save\nEXPECTED']);
  assert.equal((await verifiedAXInput(app, opts)).phase, 'wrong-page-after');
  assert.deepEqual(app.calls, ['read', ['click', 7], 'read']);
});
test('caller predicate cannot accept an entirely unchanged snapshot', async () => {
  const state = page+'7 ボタン Safe target'; const app = mock([state, state]);
  assert.equal((await verifiedAXInput(app, { ...opts, changed: () => true })).phase, 'postcondition');
  assert.deepEqual(app.calls, ['read', ['click', 7], 'read']);
});
test('read failures stop at the correct phase', async () => {
  const first = mock([new Error('read denied')]);
  assert.equal((await verifiedAXInput(first, opts)).phase, 'read-before');
  const last = mock([page+'7 ボタン Safe target', new Error('read denied')]);
  assert.equal((await verifiedAXInput(last, opts)).phase, 'read-after');
});
test('CRLF snapshots and required predicates', async () => {
  const app = mock([page+'8 ボタン Other\r\n12 ボタン Safe target', page+'EXPECTED']);
  assert.equal((await verifiedAXInput(app, opts)).target.id, 12);
  await assert.rejects(verifiedAXInput(app, {}), TypeError);
});
