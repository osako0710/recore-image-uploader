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

// 画面の外の部品を差し込んで、本体の関数をそのまま動かす
function harness(names, prelude, ret) {
  return new Function(prelude + '\n' + names.map(pick).join('\n') + '\nreturn ' + ret + ';');
}
function fakeStorage() {
  const m = {};
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
}

test('1) flush keeps need_count / not_listed / issue as remaining confirmations', async () => {
  const replies = {
    c1: { result: 'arrived', need_count: true, items: [{ key: 'k', name: 'a', quantity: 2 }] },
    c2: { result: 'not_listed', need_count: false },
    c3: { result: 'issue', need_count: false },
    c4: { result: 'arrived', need_count: false },
  };
  const h = harness(
    ['safeStorageGet', 'safeStorageSet', 'pendingLoad', 'pendingSave', 'pendingDone', 'addPending', 'removePending', 'pendingFromReply', 'dedupeQueue', 'flushQueueList', 'queueId', 'flushQueue'],
    `var localStorage=this.ls;var PENDING_KEY='k';var _flushing=false,_retryStep=0,_retryTimer=0,workerValid=true;
     var navigator={onLine:true};var deleted=[];
     var rows=['c1','c2','c3','c4'].map(function(c){return {qid:'arrive:'+c,action:'arrive',client_id:c};});
     async function queueAll(){return rows;} async function queueDelete(q){deleted.push(q);} async function queueCount(){return 0;}
     async function request(b){return this_replies[b.client_id];}
     function retryable(e){return !e.status;} function scheduleRetry(){} async function refreshStatus(){} async function updateStatus(){}`,
    '{flushQueue,pendingLoad,deleted}'
  );
  const ctx = { ls: fakeStorage() };
  const g = new Function('this_replies', 'return (' + h.toString().replace(/^function anonymous\(\n\) \{\n/, 'function(){') + ')')(replies);
  const api = g.call(ctx);
  await api.flushQueue();
  const list = api.pendingLoad();
  assert.deepEqual(list.map((r) => r.kind + ':' + r.client_id), ['count:c1', 'photo:c2', 'photo:c3']);
  assert.equal(list[2].issue, true);
  assert.equal(api.deleted.length, 4);
});

test('1) pendingFromReply ignores plain arrivals and other actions; add/remove dedupe', () => {
  const h = harness(['pendingFromReply', 'addPending', 'removePending'], '', '{pendingFromReply,addPending,removePending}')();
  assert.equal(h.pendingFromReply({ action: 'arrive', client_id: 'x' }, { result: 'arrived', need_count: false }), null);
  assert.equal(h.pendingFromReply({ action: 'arrive', client_id: 'x' }, { result: 'repeat' }), null);
  assert.equal(h.pendingFromReply({ action: 'arrive_photo', client_id: 'x' }, { result: 'not_listed' }), null);
  assert.equal(h.pendingFromReply({ action: 'arrive', client_id: 'x' }, { result: 'arrived', need_count: true }), null);
  let l = h.addPending([], { kind: 'photo', client_id: 'x' });
  l = h.addPending(l, { kind: 'photo', client_id: 'x' });
  l = h.addPending(l, { kind: 'count', client_id: 'x' });
  assert.equal(l.length, 2);
  assert.equal(h.removePending(l, 'x', 'photo').length, 1);
});

test('1) replayed photo upload clears the confirmation its arrival created; code is kept', async () => {
  const replies = { p1: { result: 'not_listed', need_count: false } };
  const h = harness(
    ['safeStorageGet', 'safeStorageSet', 'pendingLoad', 'pendingSave', 'pendingDone', 'addPending', 'removePending', 'pendingFromReply', 'dedupeQueue', 'flushQueueList', 'queueId', 'flushQueue'],
    `var localStorage=this.ls;var PENDING_KEY='k';var _flushing=false,_retryStep=0,_retryTimer=0,workerValid=true;
     var navigator={onLine:true};var deleted=[];
     var rows=[{qid:'arrive:p1',action:'arrive',client_id:'p1',code:'PK9'},{qid:'arrive_photo!:p1',action:'arrive_photo',client_id:'p1',issue:true},
               {qid:'arrive:p2',action:'arrive',client_id:'p2',code:'PK8'}];
     async function queueAll(){return rows;} async function queueDelete(q){deleted.push(q);} async function queueCount(){return 0;}
     async function request(b){return this_replies[b.client_id]||{result:'issue'};}
     function retryable(e){return !e.status;} function scheduleRetry(){} async function refreshStatus(){} async function updateStatus(){}`,
    '{flushQueue,pendingLoad}'
  );
  const g = new Function('this_replies', 'return (' + h.toString().replace(/^function anonymous\(\n\) \{\n/, 'function(){') + ')')(replies);
  const api = g.call({ ls: fakeStorage() });
  await api.flushQueue();
  assert.deepEqual(api.pendingLoad().map((r) => r.kind + ':' + r.client_id + ':' + r.code), ['photo:p2:PK8']);
});

test('1) withCode names the parcel; mock mode uses its own storage', () => {
  const { withCode } = harness(['withCode'], '', '{withCode}')();
  assert.equal(withCode('写真を撮ってください', 'PK9'), '番号 PK9 の荷物です。写真を撮ってください');
  assert.equal(withCode('写真を撮ってください', ''), '写真を撮ってください');
  assert.match(html, /zigzag_arrive_mock_v1/);
  assert.match(html, /zigzag_arrive_confirm_mock/);
  assert.ok(/var follow=pendingFromReply\(body,value\)/.test(html), 'online follow-up is persisted');
});

test('2) retryDelay grows 5/15/30/60 seconds and stays at 60', () => {
  const { retryDelay } = harness(['retryDelay'], '', '{retryDelay}')();
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(retryDelay), [5000, 15000, 30000, 60000, 60000, 60000]);
  assert.equal(retryDelay(-1), 5000);
});

test('2) scheduleRetry sets one timer only; failed flush backs off, success resets', async () => {
  const timers = [];
  const make = (flushOutcome) => harness(['scheduleRetry', 'retryDelay'],
    `var _retryTimer=0,_retryStep=0;var calls=0;function flushQueue(){calls++;}
     var setTimeout=function(fn,ms){timers.push(ms);return timers.length;};`,
    '{scheduleRetry,get timer(){return _retryTimer;},set step(v){_retryStep=v;},get calls(){return calls;}}');
  const api = new Function('timers', make().toString().replace(/^function anonymous\(\n\) \{\n/, '').replace(/\n\}$/, ''))(timers);
  api.scheduleRetry();
  api.scheduleRetry();
  assert.deepEqual(timers, [5000]);
  assert.ok(api.timer);
});

test('3) updateStatus shows the bad-URL text once workerValid turns false', async () => {
  const el = { className: '', textContent: '' };
  const h = new Function('el', `
    var workerValid=true;var BAD_URL='この URL は使えません。担当者に連絡してください';
    var document={getElementById:function(){return el;}};
    function pendingLoad(){return [];}
    async function queueCount(){workerValid=false;return 0;}
    ` + pick('updateStatus') + '\nreturn updateStatus;')(el);
  await h();
  assert.equal(el.className, 'status bad');
  assert.match(el.textContent, /この URL は使えません/);
  assert.ok(/updateStatus\(\);\}\s*if\(error\.status===409\)/.test(html), 'refreshStatus calls updateStatus on 403');
});

test('3) updateStatus: remaining confirmations take the single status line', async () => {
  const el = { className: '', textContent: '' };
  const h = new Function('el', `
    var workerValid=true;var BAD_URL='x';var document={getElementById:function(){return el;}};
    function pendingLoad(){return [1,2];} async function queueCount(){return 5;}
    ` + pick('updateStatus') + '\nreturn updateStatus;')(el);
  await h();
  assert.equal(el.className, 'status warn');
  assert.equal(el.textContent, '確認が 2 件残っています');
});

test('4) stepCount clamps 0..999 and the other-number button exists', () => {
  const { stepCount } = harness(['stepCount'], '', '{stepCount}')();
  assert.equal(stepCount(10, -1), 9);
  assert.equal(stepCount(4, 10), 14);
  assert.equal(stepCount(3, -10), 0);
  assert.equal(stepCount(995, 10), 999);
  assert.equal(stepCount(undefined, 1), 1);
  assert.ok(html.includes('data-other="1">ほかの数</button>'));
  for (const d of ['-10', '-1', '1', '10']) assert.ok(html.includes('data-step="' + d + '"'), d);
});

test('5) isBusy covers sending, counting, photo; onScanned drops reads while busy', async () => {
  const { isBusy } = harness(['isBusy'], '', '{isBusy}')();
  assert.equal(isBusy({}), false);
  assert.equal(isBusy({ sending: true }), true);
  assert.equal(isBusy({ busy: true }), true);
  assert.equal(isBusy({ cur: { saved: false } }), true);
  assert.equal(isBusy({ cur: { saved: true } }), false);
  assert.equal(isBusy({ photo: { shots: [] } }), true);
  const calls = [];
  const mk = (viewState) => new Function('calls', 'view', `
    var _lastRead={code:'',at:0};
    function normArrive(s){return String(s).toUpperCase();} function isBusy(v){return !!(v.busy||v.sending||(v.cur&&!v.cur.saved)||v.photo);}
    async function doArrive(c){calls.push(c);return {keep:true};} function closeScan(){} function refreshStatus(){}
    ` + pick('onScanned') + '\nreturn {onScanned,_lastRead:function(){return _lastRead;}};')(calls, viewState);
  const busy = mk({ sending: true });
  assert.equal(await busy.onScanned('a1'), true);
  assert.deepEqual(calls, []);
  assert.equal(busy._lastRead().code, '');
  const idle = mk({});
  await idle.onScanned('a1');
  assert.deepEqual(calls, ['A1']);
  assert.ok(html.includes("document.getElementById('manual-go').disabled=isBusy(view)"));
  assert.ok(html.includes('if(isBusy(view))return;var input=document.getElementById(\'manual-no\')'));
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
