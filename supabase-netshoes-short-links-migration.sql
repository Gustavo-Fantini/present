begin;

alter table public.short_links
  drop constraint if exists short_links_target_allowed;
alter table public.short_links
  drop constraint if exists short_links_network_allowed;

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

alter table public.short_links
  add constraint short_links_network_allowed
  check (
    not active
    or (
      network is not null
      and network in ('meli', 'amzn', 'shopee', 'ali', 'kabum', 'adidas', 'terabyte', 'netshoes')
    )
  );

alter table public.short_links
  add constraint short_links_target_allowed
  check (not active or coalesce(public.short_link_target_allowed(target_url, network), false));

commit;
