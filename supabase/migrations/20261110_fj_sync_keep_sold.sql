-- 取得の範囲から外れた「売れた出品」の行を同期で消さない。
-- 売れた出品の行は「売れた出品だけがある」の判定（二重売却の保留）に使うため、Shops 側で見えなくなっても残す。
create or replace function public.fj_sync_listings(token text, rows jsonb, finish boolean default false, started timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int; d int := 0;
begin
  if not exists (select 1 from fj_sync_secrets where token_sha256 = encode(digest(token, 'sha256'), 'hex')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into fj_listings (product_id, management_no, fj_no, name, status, stock, synced_at)
  select r->>'product_id', nullif(r->>'management_no', ''), nullif(r->>'fj_no', ''), r->>'name', r->>'status',
         coalesce((r->>'stock')::int, 0), now()
  from jsonb_array_elements(rows) r
  on conflict (product_id) do update set management_no = excluded.management_no, fj_no = excluded.fj_no,
    name = excluded.name, status = excluded.status, stock = excluded.stock, synced_at = excluded.synced_at;
  get diagnostics n = row_count;
  -- 最後の呼び出しで、今回の同期に出てこなかった出品中・非公開の行を消す。売れた行は残す。
  if finish and started is not null then
    delete from fj_listings where synced_at < started and status <> 'sold';
    get diagnostics d = row_count;
  end if;
  return jsonb_build_object('upserted', n, 'deleted', d, 'total', (select count(*) from fj_listings));
end $$;
revoke all on function public.fj_sync_listings(text, jsonb, boolean, timestamptz) from public;
grant execute on function public.fj_sync_listings(text, jsonb, boolean, timestamptz) to anon;
