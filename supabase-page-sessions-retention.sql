-- Execute uma vez no SQL Editor do projeto Supabase da landing page.
-- Mantém 45 dias de sessões detalhadas e preserva até 24 meses em resumo diário.

create extension if not exists pg_cron;

create table if not exists public.page_session_daily (
  day date not null,
  page_path text not null default '',
  utm_source text not null default '',
  utm_medium text not null default '',
  utm_campaign text not null default '',
  page_views bigint not null default 0,
  unique_visitors bigint not null default 0,
  unique_sessions bigint not null default 0,
  engaged_views bigint not null default 0,
  whatsapp_clicks bigint not null default 0,
  instagram_clicks bigint not null default 0,
  external_redirects bigint not null default 0,
  duration_ms bigint not null default 0,
  visible_ms bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (day, page_path, utm_source, utm_medium, utm_campaign)
);

alter table public.page_session_daily enable row level security;
revoke all on table public.page_session_daily from anon, authenticated;

create index if not exists idx_page_sessions_created_at
on public.page_sessions (created_at desc);

create index if not exists idx_page_sessions_utm_created_at
on public.page_sessions (utm_source, utm_campaign, created_at desc);

create index if not exists idx_page_session_daily_day
on public.page_session_daily (day desc);

create or replace function public.freeisland_run_page_session_retention(
  p_raw_days integer default 45,
  p_rollup_days integer default 730
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  raw_days integer := greatest(14, least(coalesce(p_raw_days, 45), 180));
  rollup_days integer := greatest(90, least(coalesce(p_rollup_days, 730), 3650));
  raw_cutoff timestamptz;
  rollup_cutoff date;
  rolled_up_groups bigint := 0;
  deleted_sessions bigint := 0;
  deleted_rollups bigint := 0;
begin
  raw_cutoff := date_trunc('day', now() - make_interval(days => raw_days));
  rollup_cutoff := (now() at time zone 'America/Sao_Paulo')::date - rollup_days;

  insert into public.page_session_daily (
    day,
    page_path,
    utm_source,
    utm_medium,
    utm_campaign,
    page_views,
    unique_visitors,
    unique_sessions,
    engaged_views,
    whatsapp_clicks,
    instagram_clicks,
    external_redirects,
    duration_ms,
    visible_ms,
    updated_at
  )
  select
    (created_at at time zone 'America/Sao_Paulo')::date,
    coalesce(page_path, ''),
    coalesce(utm_source, ''),
    coalesce(utm_medium, ''),
    coalesce(utm_campaign, ''),
    count(*)::bigint,
    count(distinct visitor_id)::bigint,
    count(distinct session_id)::bigint,
    count(*) filter (where coalesce(click_any, false) or coalesce(visible_ms, 0) >= 10000)::bigint,
    coalesce(sum(greatest(coalesce(whatsapp_clicks, 0), 0)), 0)::bigint,
    coalesce(sum(greatest(coalesce(instagram_clicks, 0), 0)), 0)::bigint,
    coalesce(sum(greatest(coalesce(external_redirects, 0), 0)), 0)::bigint,
    coalesce(sum(greatest(coalesce(duration_ms, 0), 0)), 0)::bigint,
    coalesce(sum(greatest(coalesce(visible_ms, 0), 0)), 0)::bigint,
    now()
  from public.page_sessions
  where created_at < raw_cutoff
  group by 1, 2, 3, 4, 5
  on conflict (day, page_path, utm_source, utm_medium, utm_campaign)
  do update set
    page_views = public.page_session_daily.page_views + excluded.page_views,
    unique_visitors = public.page_session_daily.unique_visitors + excluded.unique_visitors,
    unique_sessions = public.page_session_daily.unique_sessions + excluded.unique_sessions,
    engaged_views = public.page_session_daily.engaged_views + excluded.engaged_views,
    whatsapp_clicks = public.page_session_daily.whatsapp_clicks + excluded.whatsapp_clicks,
    instagram_clicks = public.page_session_daily.instagram_clicks + excluded.instagram_clicks,
    external_redirects = public.page_session_daily.external_redirects + excluded.external_redirects,
    duration_ms = public.page_session_daily.duration_ms + excluded.duration_ms,
    visible_ms = public.page_session_daily.visible_ms + excluded.visible_ms,
    updated_at = now();
  get diagnostics rolled_up_groups = row_count;

  delete from public.page_sessions
  where created_at < raw_cutoff;
  get diagnostics deleted_sessions = row_count;

  delete from public.page_session_daily
  where day < rollup_cutoff;
  get diagnostics deleted_rollups = row_count;

  return jsonb_build_object(
    'ok', true,
    'raw_cutoff', raw_cutoff,
    'rolled_up_groups', rolled_up_groups,
    'deleted_page_sessions', deleted_sessions,
    'deleted_rollups', deleted_rollups
  );
end;
$$;

revoke all on function public.freeisland_run_page_session_retention(integer, integer) from public;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'freeisland-page-session-retention';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'freeisland-page-session-retention',
    '31 3 * * *',
    $job$select public.freeisland_run_page_session_retention(45, 730);$job$
  );
end;
$$;

select public.freeisland_run_page_session_retention(45, 730) as initial_cleanup;

select
  relname as relation,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size,
  n_live_tup as estimated_rows,
  n_dead_tup as dead_rows
from pg_stat_user_tables
where schemaname = 'public'
order by pg_total_relation_size(relid) desc;
