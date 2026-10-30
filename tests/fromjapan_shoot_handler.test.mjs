// fromjapan-shoot API の保存の流れを、偽の DB と偽の GitHub で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, STALE_RESERVATION_MS } from '../supabase/functions/fromjapan-shoot/handler.ts';

const ORIGIN = 'https://osako0710.github.io';
const NOW = new Date('2026-10-30T03:00:00Z');
const JPEG_A = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
const JPEG_B = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9]).toString('base64');
const UUID1 = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function fakeWorld({ shots = [], files = {} } = {}) {
  const calls = [];
  const supabaseRequest = async (path, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, path });
    const url = new URL('http://x/' + path);
    const table = url.pathname.slice(1);
    const p = Object.fromEntries(url.searchParams);
    if (table === 'zz_workers') return json([{ worker_id: 'uxZnD8X1' }]);
    if (table !== 'fj_shots') return json([]);
    const match = (s) => (!p.management_no || s.management_no === p.management_no.slice(3)) &&
      (!p.client_id || s.client_id === p.client_id.slice(3)) &&
      (!p.shot_id || s.shot_id === p.shot_id.slice(3)) &&
      (p.completed_at !== 'is.null' || s.completed_at === null) &&
      (p.completed_at !== 'not.is.null' || s.completed_at !== null) &&
      (!p.worker_id || s.worker_id === p.worker_id.slice(3));
    if (method === 'GET') return json(shots.filter(match));
    if (method === 'DELETE') {
      for (let i = shots.length - 1; i >= 0; i--) if (match(shots[i])) shots.splice(i, 1);
      return new Response(null, { status: 204 });
    }
    if (method === 'POST') {
      const row = JSON.parse(init.body);
      if (shots.some((s) => s.management_no === row.management_no)) return json({}, 409);
      const shot = { shot_id: 'S' + (shots.length + 1), photo_urls: [], completed_at: null, created_at: NOW.toISOString(), ...row };
      shots.push(shot);
      return json([shot], 201);
    }
    if (method === 'PATCH') {
      const target = shots.filter(match);
      target.forEach((s) => Object.assign(s, JSON.parse(init.body)));
      return json(target);
    }
    return json({}, 400);
  };
  const fetcher = async (url, init = {}) => {
    const name = String(url).split('/contents/')[1];
    if ((init.method ?? 'GET') === 'GET') return name in files ? json({ sha: files[name].sha }) : json({}, 404);
    const body = JSON.parse(init.body);
    if (name in files && body.sha !== files[name].sha) return json({}, 409);
    const bytes = Buffer.from(body.content, 'base64');
    const head = Buffer.from(`blob ${bytes.length}\0`);
    const { createHash } = await import('node:crypto');
    files[name] = { sha: createHash('sha1').update(Buffer.concat([head, bytes])).digest('hex') };
    return json({ content: {} }, name in files ? 200 : 201);
  };
  return { shots, files, calls, deps: { supabaseUrl: 'http://db', serviceRoleKey: 'k', githubToken: 't', geminiKey: '', supabaseRequest, fetcher, now: () => NOW } };
}

const save = (deps, clientId, photo = JPEG_A, code = '24130242') => handle(new Request('https://api/fn', {
  method: 'POST',
  headers: { origin: ORIGIN, 'content-type': 'application/json' },
  body: JSON.stringify({ action: 'save', w: 'uxZnD8X1', code, client_id: clientId, candidate_id: null, condition: 'good', quantity: 1,
    photos: [{ media_type: 'image/jpeg', base64: photo }, { media_type: 'image/jpeg', base64: photo }],
    draft: { name: 'バッグ', description: '', genre: 'その他' }, memo: '' }),
}), deps);

test('保存が終わると番号が登録済みになり、2回目は 409 number_registered', async () => {
  const w = fakeWorld();
  const first = await save(w.deps, UUID1);
  assert.equal(first.status, 200);
  assert.equal((await first.json()).management_no, '24130242');
  assert.ok(w.shots[0].completed_at);
  const second = await save(w.deps, UUID2, JPEG_B);
  assert.equal(second.status, 409);
  assert.equal((await second.json()).error, 'number_registered');
});

test('同じ client_id で送り直すと同じ登録を返す', async () => {
  const w = fakeWorld();
  await save(w.deps, UUID1);
  const again = await save(w.deps, UUID1);
  assert.equal(again.status, 200);
  assert.equal(w.shots.length, 1);
});

test('途中で止まった古い予約と古い写真があっても、別の写真で登録し直せる', async () => {
  const old = new Date(NOW.getTime() - STALE_RESERVATION_MS - 1000).toISOString();
  const w = fakeWorld({
    shots: [{ shot_id: 'OLD', management_no: '24130242', client_id: UUID1, worker_id: 'uxZnD8X1', photo_urls: [], completed_at: null, created_at: old }],
    files: { 'recoreimages/fromjapan/24130242_1.jpg': { sha: 'deadbeef' } },
  });
  const res = await save(w.deps, UUID2, JPEG_B);
  assert.equal(res.status, 200);
  assert.equal(w.shots.length, 1);
  assert.equal(w.shots[0].client_id, UUID2);
  assert.notEqual(w.files['recoreimages/fromjapan/24130242_1.jpg'].sha, 'deadbeef');
});

test('3分以内の予約は別の端末が保存中とみなし 503 number_in_progress を返して消さない', async () => {
  const w = fakeWorld({
    shots: [{ shot_id: 'NEW', management_no: '24130242', client_id: UUID1, worker_id: 'uxZnD8X1', photo_urls: [], completed_at: null, created_at: NOW.toISOString() }],
  });
  const res = await save(w.deps, UUID2, JPEG_B);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'number_in_progress');
  assert.equal(w.shots[0].shot_id, 'NEW');
});
