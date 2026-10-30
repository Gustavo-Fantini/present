-- Metrics project qpzwinntrphqaabatoaf. Does not run retention or delete data.
begin;
revoke all on function public.freeisland_run_page_session_retention(integer, integer)
  from public, anon, authenticated;
grant execute on function public.freeisland_run_page_session_retention(integer, integer)
  to service_role;
-- The existing Cron job runs as postgres, the function owner.
commit;
