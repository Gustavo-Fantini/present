create extension if not exists pgcrypto;

create or replace function public.short_link_target_allowed(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    value ~* '^https://www\.awin1\.com/cread\.php\?'
    and value ~* '[?&]awinaffid=2802012(&|$)'
    and value ~* '[?&]ued=https%3a%2f%2f'
    and (
      (
        value ~* '[?&]awinmid=17729(&|$)'
        and value ~* '[?&]ued=https%3a%2f%2f([^%&/]+\.)?kabum\.com\.br(%2f|/|&|$)'
      )
      or (
        value ~* '[?&]awinmid=18879(&|$)'
        and value ~* '[?&]ued=https%3a%2f%2f([^%&/]+\.)?aliexpress\.com(%2f|/|&|$)'
      )
      or (
        value ~* '[?&]awinmid=79926(&|$)'
        and value ~* '[?&]ued=https%3a%2f%2f([^%&/]+\.)?adidas\.com\.br(%2f|/|&|$)'
      )
    );
$$;

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
    check (target_url ~ '^https://'),
  constraint short_links_target_allowed
    check (not active or public.short_link_target_allowed(target_url))
);

update public.short_links
set active = false
where active = true
  and not public.short_link_target_allowed(target_url);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'short_links_target_allowed'
      and conrelid = 'public.short_links'::regclass
  ) then
    alter table public.short_links
      add constraint short_links_target_allowed
      check (not active or public.short_link_target_allowed(target_url));
  end if;
end;
$$;

create table if not exists public.short_link_clicks (
  id uuid primary key default gen_random_uuid(),
  slug text not null references public.short_links(slug) on delete cascade,
  created_at timestamptz not null default now(),
  referrer text,
  page_url text,
  user_agent text
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_short_links_updated_at on public.short_links;
create trigger trg_short_links_updated_at
before update on public.short_links
for each row execute function public.set_updated_at();

alter table public.short_links enable row level security;
alter table public.short_link_clicks enable row level security;

drop policy if exists "allow_anon_read_active_short_links" on public.short_links;
drop policy if exists "allow_anon_insert_short_link_clicks" on public.short_link_clicks;

revoke all on table public.short_links from anon, authenticated;
revoke all on table public.short_link_clicks from anon, authenticated;

create or replace function public.resolve_short_link(
  p_slug text,
  p_referrer text default null,
  p_page_url text default null,
  p_user_agent text default null
)
returns table (
  slug text,
  target_url text,
  title text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved public.short_links%rowtype;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,60}$' then
    return;
  end if;

  select link.*
  into resolved
  from public.short_links as link
  where link.slug = p_slug
    and link.active = true
    and public.short_link_target_allowed(link.target_url)
    and (link.expires_at is null or link.expires_at > now())
  limit 1;

  if not found then
    return;
  end if;

  insert into public.short_link_clicks (slug, referrer, page_url, user_agent)
  values (
    resolved.slug,
    nullif(left(coalesce(p_referrer, ''), 2048), ''),
    nullif(left(coalesce(p_page_url, ''), 2048), ''),
    nullif(left(coalesce(p_user_agent, ''), 512), '')
  );

  return query
  select resolved.slug, resolved.target_url, resolved.title;
end;
$$;

revoke all on function public.resolve_short_link(text, text, text, text) from public;
grant usage on schema public to anon, authenticated;
grant execute on function public.resolve_short_link(text, text, text, text) to anon, authenticated;

create index if not exists idx_short_links_active_expires
on public.short_links (active, expires_at);

create index if not exists idx_short_link_clicks_slug_created_at
on public.short_link_clicks (slug, created_at desc);
