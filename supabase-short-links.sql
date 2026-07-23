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
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,100}$'),
  constraint short_links_target_https
    check (target_url ~ '^https://')
);

alter table public.short_links
  add column if not exists network text,
  add column if not exists product_id text;

alter table public.short_links
  drop constraint if exists short_links_slug_format;
alter table public.short_links
  drop constraint if exists short_links_target_allowed;
alter table public.short_links
  drop constraint if exists short_links_network_allowed;
alter table public.short_links
  drop constraint if exists short_links_product_id_format;

create or replace function public.short_link_target_allowed(value text, link_network text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select case lower(coalesce(link_network, ''))
    when 'kabum' then
      value ~* '^https://www\.awin1\.com/cread\.php\?'
      and value ~* '[?&]awinaffid=2802012(&|$)'
      and value ~* '[?&]awinmid=17729(&|$)'
      and value ~* '[?&]ued=https%3a%2f%2f([^%&/]+\.)?kabum\.com\.br(%2f|/|&|$)'
    when 'ali' then
      value ~* '^https://www\.awin1\.com/cread\.php\?'
      and value ~* '[?&]awinaffid=2802012(&|$)'
      and value ~* '[?&]awinmid=18879(&|$)'
      and value ~* '[?&]ued=https%3a%2f%2f([^%&/]+\.)?aliexpress\.com(%2f|/|&|$)'
    when 'adidas' then
      value ~* '^https://www\.awin1\.com/cread\.php\?'
      and value ~* '[?&]awinaffid=2802012(&|$)'
      and value ~* '[?&]awinmid=79926(&|$)'
      and value ~* '[?&]ued=https%3a%2f%2f([^%&/]+\.)?adidas\.com\.br(%2f|/|&|$)'
    when 'amzn' then
      value ~* '^https://(www\.)?amazon\.com(\.br)?/(dp|gp/product)/[a-z0-9]{10}([/?#]|$)'
      and value ~* '[?&]tag=freeislandt0e-20(&|$)'
    when 'meli' then
      value ~* '^https://((www\.)?(mercadolivre\.com\.br|mercadolivre\.com|mercadolibre\.com)/|meli\.la/)'
    when 'shopee' then
      value ~* '^https://((s\.)?shopee\.com\.br/|shope\.ee/)'
    when 'terabyte' then
      value ~* '^https://(www\.)?terabyteshop\.com\.br/produto/[0-9]+(/|\?|$)'
      and value ~* '[?&]p=[0-9]{2,20}(&|$)'
    when 'netshoes' then
      value ~* '^https://click\.linksynergy\.com/(deeplink|fs-bin/click)\?'
      and value ~* '[?&]id=[a-z0-9_-]{6,100}(&|$)'
      and value ~* '[?&]mid=[0-9]{1,15}(&|$)'
      and value ~* '[?&]murl=https%3a%2f%2f([^%&/]+\.)?netshoes\.com\.br(%2f|/|&|$)'
    else false
  end;
$$;

create or replace function public.short_link_target_allowed(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    public.short_link_target_allowed(value, 'kabum')
    or public.short_link_target_allowed(value, 'ali')
    or public.short_link_target_allowed(value, 'adidas')
    or public.short_link_target_allowed(value, 'amzn')
    or public.short_link_target_allowed(value, 'meli')
    or public.short_link_target_allowed(value, 'shopee')
    or public.short_link_target_allowed(value, 'terabyte')
    or public.short_link_target_allowed(value, 'netshoes');
$$;

update public.short_links
set network = case
  when public.short_link_target_allowed(target_url, 'kabum') then 'kabum'
  when public.short_link_target_allowed(target_url, 'ali') then 'ali'
  when public.short_link_target_allowed(target_url, 'adidas') then 'adidas'
  when public.short_link_target_allowed(target_url, 'amzn') then 'amzn'
  when public.short_link_target_allowed(target_url, 'meli') then 'meli'
  when public.short_link_target_allowed(target_url, 'shopee') then 'shopee'
  when public.short_link_target_allowed(target_url, 'terabyte') then 'terabyte'
  when public.short_link_target_allowed(target_url, 'netshoes') then 'netshoes'
  else network
end
where network is null
   or network not in ('meli', 'amzn', 'shopee', 'ali', 'kabum', 'adidas', 'terabyte', 'netshoes');

update public.short_links
set product_id = left(
  regexp_replace(
    case
      when slug ~ '^(meli|amzn|shopee|ali|kabum|adidas|terabyte|netshoes)-' then
        regexp_replace(slug, '^(meli|amzn|shopee|ali|kabum|adidas|terabyte|netshoes)-', '')
      else slug
    end,
    '[^a-z0-9-]+',
    '-',
    'g'
  ),
  80
)
where product_id is null or product_id !~ '^[a-z0-9][a-z0-9-]{1,79}$';

update public.short_links
set active = false
where active = true
  and (
    network is null
    or network not in ('meli', 'amzn', 'shopee', 'ali', 'kabum', 'adidas', 'terabyte', 'netshoes')
    or product_id is null
    or product_id !~ '^[a-z0-9][a-z0-9-]{1,79}$'
    or not coalesce(public.short_link_target_allowed(target_url, network), false)
  );

alter table public.short_links
  add constraint short_links_slug_format
  check (slug ~ '^[a-z0-9][a-z0-9-]{1,100}$');

alter table public.short_links
  add constraint short_links_network_allowed
  check (not active or (network is not null and network in ('meli', 'amzn', 'shopee', 'ali', 'kabum', 'adidas', 'terabyte', 'netshoes')));

alter table public.short_links
  add constraint short_links_product_id_format
  check (not active or (product_id is not null and product_id ~ '^[a-z0-9][a-z0-9-]{1,79}$'));

alter table public.short_links
  add constraint short_links_target_allowed
  check (not active or coalesce(public.short_link_target_allowed(target_url, network), false));

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

drop function if exists public.resolve_short_link(text, text, text, text);

create function public.resolve_short_link(
  p_slug text,
  p_referrer text default null,
  p_page_url text default null,
  p_user_agent text default null
)
returns table (
  slug text,
  target_url text,
  title text,
  network text,
  product_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved public.short_links%rowtype;
begin
  if p_slug is null or p_slug !~ '^[a-z0-9][a-z0-9-]{1,100}$' then
    return;
  end if;

  select link.*
  into resolved
  from public.short_links as link
  where link.slug = p_slug
    and link.active = true
    and public.short_link_target_allowed(link.target_url, link.network)
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
  select resolved.slug, resolved.target_url, resolved.title, resolved.network, resolved.product_id;
end;
$$;

drop function if exists public.short_link_click_stats(integer);

create function public.short_link_click_stats(p_hours integer default 24)
returns table (
  total_clicks bigint,
  by_network jsonb,
  period_hours integer
)
language sql
security definer
set search_path = public
as $$
  with settings as (
    select greatest(1, least(coalesce(p_hours, 24), 720))::integer as hours
  ),
  grouped as (
    select link.network, count(*)::bigint as clicks
    from public.short_link_clicks as click
    join public.short_links as link on link.slug = click.slug
    cross join settings
    where click.created_at >= now() - make_interval(hours => settings.hours)
    group by link.network
  )
  select
    coalesce(sum(grouped.clicks), 0)::bigint,
    coalesce(jsonb_object_agg(grouped.network, grouped.clicks) filter (where grouped.network is not null), '{}'::jsonb),
    settings.hours
  from settings
  left join grouped on true
  group by settings.hours;
$$;

revoke all on function public.resolve_short_link(text, text, text, text) from public;
revoke all on function public.short_link_click_stats(integer) from public;
grant usage on schema public to anon, authenticated;
grant execute on function public.resolve_short_link(text, text, text, text) to anon, authenticated;
grant execute on function public.short_link_click_stats(integer) to anon, authenticated;

create index if not exists idx_short_links_active_expires
on public.short_links (active, expires_at);

create index if not exists idx_short_links_network_product
on public.short_links (network, product_id);

create index if not exists idx_short_link_clicks_slug_created_at
on public.short_link_clicks (slug, created_at desc);

create index if not exists idx_short_link_clicks_created_at
on public.short_link_clicks (created_at desc);
