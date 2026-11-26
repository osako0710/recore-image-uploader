'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'zigzag_arrive_20261126_v1.html'), 'utf8');

function pick(name) {
  const isAsync = html.includes('\nasync function ' + name + '(');
  const head = (isAsync ? '\nasync function ' : '\nfunction ') + name + '(';
  const start = html.indexOf(head);
  assert.notEqual(start, -1, name + ' not found');
  const open = html.indexOf('{', html.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) return html.slice(start + 1, i + 1); }
  }
  throw new Error('unbalanced ' + name);
}

const src = ['normArrive', 'resultView', 'countOptions', 'allCounted', 'fmt', 'queueId', 'dedupeQueue', 'flushQueueList'].map(pick).join('\n');
const f = new Function(src + '\nreturn {normArrive,resultView,countOptions,allCounted,fmt,queueId,dedupeQueue,flushQueueList};')();

test('normArrive: full-width, lowercase, spaces', () => {
  assert.equal(f.normArrive(' ａ００１ '), 'A001');
  assert.equal(f.normArrive('ab 12\n3'), 'AB123');
  assert.equal(f.normArrive(null), '');
  assert.equal(f.normArrive('x'.repeat(65)), '');
});

test('resultView: text and keep per result', () => {
  assert.deepEqual(f.resultView('arrived', false), { kind: 'ok', text: 'OK 次の荷物へ', keep: true });
  assert.equal(f.resultView('arrived', true).kind, 'count');
  assert.equal(f.resultView('arrived', true).keep, false);
  assert.equal(f.resultView('not_listed', false).kind, 'photo');
  assert.equal(f.resultView('issue', false).kind, 'photo');
  assert.deepEqual(f.resultView('repeat', false), { kind: 'repeat', text: 'この荷物は確認済みです', keep: true });
  assert.equal(f.resultView('zzz', false).kind, 'error');
});

test('countOptions: 0..qty+2, window for large qty', () => {
  assert.deepEqual(f.countOptions(1), [0, 1, 2, 3]);
  assert.deepEqual(f.countOptions(3), [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(f.countOptions(10), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(f.countOptions(20), [0, 15, 16, 17, 18, 19, 20, 21, 22]);
  assert.deepEqual(f.countOptions(-4), [0, 1, 2]);
});

test('allCounted: every item needs a number', () => {
  const items = [{ key: 'a' }, { key: 'b' }];
  assert.equal(f.allCounted(items, { a: 1 }), false);
  assert.equal(f.allCounted(items, { a: 0, b: 2 }), true);
  assert.equal(f.allCounted([], {}), false);
});

test('fmt: thousands separator', () => {
  assert.equal(f.fmt(1191), '1,191');
  assert.equal(f.fmt(null), '0');
});

test('queueId and dedupeQueue: later one wins, kinds kept apart', () => {
  assert.equal(f.queueId({ action: 'arrive', client_id: 'c1' }), 'arrive:c1');
  assert.equal(f.queueId({ action: 'arrive_photo', client_id: 'c1', issue: true }), 'arrive_photo!:c1');
  const out = f.dedupeQueue([
    { qid: 'arrive:c1', v: 1 },
    { qid: 'arrive_count:c1', v: 2 },
    { qid: 'arrive:c1', v: 3 },
    null,
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].v, 3);
  assert.equal(out[1].v, 2);
});

test('flushQueueList: stops at first failure and returns the rest', async () => {
  const sent = [];
  const rest = await f.flushQueueList(
    [{ qid: 'a:1' }, { qid: 'b:2' }, { qid: 'c:3' }],
    async (row) => { if (row.qid === 'b:2') throw new Error('x'); sent.push(row.qid); }
  );
  assert.deepEqual(sent, ['a:1']);
  assert.deepEqual(rest.map((r) => r.qid), ['b:2', 'c:3']);
  assert.deepEqual(await f.flushQueueList([], async () => {}), []);
});

test('inline scripts parse (arrive and shoot)', () => {
  for (const file of ['zigzag_arrive_20261126_v1.html', 'zigzag_shoot_20261026_v1.html']) {
    const text = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    const scripts = [...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    assert.ok(scripts.length > 0, file);
    scripts.forEach((s) => new Function(s));
  }
});

test('visible text has no internal words', () => {
  const body = html.slice(html.indexOf('<body>'), html.indexOf('<script src'));
  const text = body.replace(/<[^>]+>/g, ' ');
  for (const w of ['PKG', 'sku', '突合', 'ロット', 'lot', 'client_id']) {
    assert.ok(!text.includes(w), w);
  }
});
