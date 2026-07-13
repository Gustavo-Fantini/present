-- Free Island short links
-- Rode este script no Supabase SQL Editor do projeto:
-- https://jdeszhiykkviymtkdbit.supabase.co

create extension if not exists pgcrypto;

create table if not exists public.short_links (
  slug text primary key,
  target_url text not null,
  title text,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint short_links_slug_format
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  constraint short_links_target_https
    check (target_url ~ '^https://')
);

create table if not exists public.short_link_clicks (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.short_links(slug) on delete cascade,
  created_at timestamptz not null default now(),
  referrer text,
  page_url text,
  user_agent text
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_short_links_updated_at on public.short_links;
create trigger trg_short_links_updated_at
before update on public.short_links
for each row execute function public.set_updated_at();

alter table public.short_links enable row level security;
alter table public.short_link_clicks enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.short_links to anon, authenticated;
grant insert on public.short_link_clicks to anon, authenticated;

drop policy if exists "allow_anon_read_active_short_links" on public.short_links;
create policy "allow_anon_read_active_short_links"
on public.short_links
as permissive
for select
to anon, authenticated
using (
  active = true
  and (expires_at is null or expires_at > now())
);

drop policy if exists "allow_anon_insert_short_link_clicks" on public.short_link_clicks;
create policy "allow_anon_insert_short_link_clicks"
on public.short_link_clicks
as permissive
for insert
to anon, authenticated
with check (true);

create index if not exists idx_short_links_active_expires
on public.short_links (active, expires_at);

create index if not exists idx_short_link_clicks_slug_created_at
on public.short_link_clicks (slug, created_at desc);

-- Exemplo de cadastro:
-- insert into public.short_links (slug, target_url, title)
-- values (
--   'gabinete178',
--   'https://www.awin1.com/cread.php?...',
--   'Gabinete aquario por R$178'
-- )
-- on conflict (slug) do update set
--   target_url = excluded.target_url,
--   title = excluded.title,
--   active = true,
--   updated_at = now();

-- Depois use:
-- https://freeisland.onrender.com/r/?s=gabinete178

-- Relatorio simples de cliques:
-- select slug, count(*) as clicks
-- from public.short_link_clicks
-- group by slug
-- order by clicks desc;
