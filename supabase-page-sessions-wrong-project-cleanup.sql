-- Use somente no projeto incorreto onde supabase-page-sessions-retention.sql falhou
-- com "relation public.page_sessions does not exist".
-- Este script não apaga short_links, short_link_clicks ou qualquer dado de promoção.

do $$
declare
  existing_job_id bigint;
begin
  if to_regclass('public.page_sessions') is not null then
    raise exception 'Este projeto possui page_sessions; não execute a limpeza no projeto correto de métricas.';
  end if;

  if to_regclass('cron.job') is not null then
    execute $query$
      select jobid
      from cron.job
      where jobname = 'freeisland-page-session-retention'
      limit 1
    $query$ into existing_job_id;

    if existing_job_id is not null then
      execute format('select cron.unschedule(%s)', existing_job_id);
    end if;
  end if;
end;
$$;

drop function if exists public.freeisland_run_page_session_retention(integer, integer);
drop table if exists public.page_session_daily;

select 'Objetos de retenção de page_sessions removidos deste projeto incorreto.' as resultado;
