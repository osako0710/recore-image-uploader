-- FJ 出品照合と棚番登録（docs/fromjapan-listing-check-spec-20261102-v1.md）
create extension if not exists pg_trgm with schema extensions;

create table if not exists public.fj_listings (
  product_id text primary key,
  management_no text,
  fj_no text,
  name text not null,
  status text not null,
  stock integer not null default 0,
  synced_at timestamptz not null default now()
);
create index if not exists fj_listings_management_no on public.fj_listings (management_no);
create index if not exists fj_listings_name_trgm on public.fj_listings using gin (name extensions.gin_trgm_ops) where management_no is null;
alter table public.fj_listings enable row level security;

create table if not exists public.fj_shelf_marks (
  mark_id uuid primary key default gen_random_uuid(),
  management_no text not null,
  shelf text,
  kind text not null check (kind in ('listed', 'listed_by_name', 'sold_hold')),
  product_id text,
  worker_id text not null,
  client_id uuid not null unique,
  created_at timestamptz not null default now()
);
create index if not exists fj_shelf_marks_management_no on public.fj_shelf_marks (management_no);
alter table public.fj_shelf_marks enable row level security;

alter table public.fj_shots add column if not exists shelf text;

-- 同期トークンのハッシュ。トークン本体は ~/mono-hq/.env の FJ_SYNC_TOKEN。
create table if not exists public.fj_sync_secrets (id int primary key default 1 check (id = 1), token_sha256 text not null);
alter table public.fj_sync_secrets enable row level security;

-- Mac の同期スクリプトから anon キーで呼ぶ。トークンが合うときだけ全件を入れ替える。
create or replace function public.fj_sync_listings(token text, rows jsonb, finish boolean default false, started timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare n int;
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
  -- 最後の呼び出しで、今回の同期に出てこなかった出品を消す（出品が削除されたもの）。
  if finish and started is not null then
    delete from fj_listings where synced_at < started;
  end if;
  return jsonb_build_object('upserted', n, 'total', (select count(*) from fj_listings));
end $$;
revoke all on function public.fj_sync_listings(text, jsonb, boolean, timestamptz) from public;
grant execute on function public.fj_sync_listings(text, jsonb, boolean, timestamptz) to anon;

-- 8桁が管理コードに無い古い出品から、名前の似たものを返す。Edge Function（service role）から呼ぶ。
create or replace function public.fj_similar_listings(q text, n int default 3)
returns table (product_id text, fj_no text, name text, status text, score real)
language sql stable security definer set search_path = public, extensions as $$
  select product_id, fj_no, name, status, similarity(name, q) as score
  from fj_listings
  where management_no is null and status in ('on_sale', 'stopped') and name % q
  order by similarity(name, q) desc
  limit least(greatest(n, 1), 5);
$$;
revoke all on function public.fj_similar_listings(text, int) from public, anon, authenticated;
grant execute on function public.fj_similar_listings(text, int) to service_role;

-- 説明欄に棚番を追記する Mac のスクリプトが、出品ごとの最新の棚番を読む。トークンは同期と同じもの。
create or replace function public.fj_latest_shelf_marks(token text)
returns table (product_id text, management_no text, shelf text, kind text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from fj_sync_secrets where token_sha256 = encode(digest(token, 'sha256'), 'hex')) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select distinct on (m.product_id) m.product_id, m.management_no, m.shelf, m.kind, m.created_at
    from fj_shelf_marks m
    where m.product_id is not null and m.shelf is not null and m.kind in ('listed', 'listed_by_name')
    order by m.product_id, m.created_at desc;
end $$;
revoke all on function public.fj_latest_shelf_marks(text) from public;
grant execute on function public.fj_latest_shelf_marks(text) to anon;
