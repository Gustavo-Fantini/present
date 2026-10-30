-- Apply only to the landing metrics project: qpzwinntrphqaabatoaf.
-- Additive migration: existing page_sessions rows and policies are unchanged.
begin;

do $$
begin
  if to_regclass('public.page_sessions') is null then
    raise exception 'Wrong project: open the landing metrics project qpzwinntrphqaabatoaf, where page_sessions exists.';
  end if;
end;
$$;

create table if not exists public.page_view_daily (
  day date not null,
  page_path text not null,
  page_views bigint not null default 0 check (page_views >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, page_path)
);

alter table public.page_view_daily enable row level security;
revoke all on table public.page_view_daily from anon, authenticated;
grant select on table public.page_view_daily to anon, authenticated;
grant all on table public.page_view_daily to service_role;
drop policy if exists page_view_daily_read on public.page_view_daily;
create policy page_view_daily_read on public.page_view_daily
  for select to anon, authenticated using (true);

create or replace function public.freeisland_record_page_view(p_page_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_headers jsonb := coalesce(nullif(pg_catalog.current_setting('request.headers', true), ''), '{}')::jsonb;
  view_day date := (pg_catalog.now() at time zone 'America/Sao_Paulo')::date;
begin
  if coalesce(request_headers ->> 'origin', '') <> 'https://freeisland.onrender.com' then
    raise exception using errcode = '42501', message = 'page_view_origin_not_allowed';
  end if;
  if p_page_path is null or not p_page_path = any (array[
    '/', '/guias.html', '/ofertas.html', '/sobre.html', '/politica-editorial.html',
    '/privacidade.html', '/termos.html', '/contato.html',
    '/guias/checklist-compra-online.html', '/guias/como-identificar-preco-real.html',
    '/guias/como-validar-cupom.html', '/guias/comparar-placa-de-video.html',
    '/guias/comparar-ssd.html', '/guias/escolher-monitor.html',
    '/guias/escolher-perifericos.html', '/guias/escolher-processador.html',
    '/guias/montar-pc-equilibrado.html', '/guias/vendedor-garantia-marketplace.html'
  ]::text[]) then
    raise exception using errcode = '22023', message = 'page_view_path_not_allowed';
  end if;
  insert into public.page_view_daily (day, page_path, page_views, updated_at)
  values (view_day, p_page_path, 1, pg_catalog.now())
  on conflict (day, page_path) do update
  set page_views = public.page_view_daily.page_views + 1, updated_at = excluded.updated_at;
end;
$$;

-- Intentional public write operation: accepts only a known page, records only
-- a daily aggregate, and exposes no visitor data. Direct writes remain revoked.
revoke all on function public.freeisland_record_page_view(text) from public, anon, authenticated;
grant execute on function public.freeisland_record_page_view(text) to anon, authenticated, service_role;

comment on table public.page_view_daily is
  'Anonymous page views per Brasilia day and public path. No visitor, session, cookie, IP or campaign identifiers.';
comment on function public.freeisland_record_page_view(text) is
  'Public counter; atomic daily increment for approved landing paths. Returns no private data.';

notify pgrst, 'reload schema';
commit;
