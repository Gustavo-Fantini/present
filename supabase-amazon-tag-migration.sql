begin;

alter table public.short_links
  drop constraint if exists short_links_target_allowed;

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
    else false
  end;
$$;

update public.short_links
set target_url = regexp_replace(
      target_url,
      '([?&]tag=)[^&#]+',
      '\1freeislandt0e-20',
      'i'
    ),
    updated_at = now()
where lower(network) = 'amzn'
  and target_url ~* '^https://(www\.)?amazon\.com(\.br)?/'
  and target_url ~* '[?&]tag=[^&#]+';

alter table public.short_links
  add constraint short_links_target_allowed
  check (not active or coalesce(public.short_link_target_allowed(target_url, network), false));

commit;

select
  count(*) filter (where active) as amazon_links_ativos,
  count(*) filter (
    where active
      and target_url ~* '[?&]tag=freeislandt0e-20(&|$)'
  ) as amazon_links_com_tag_nova,
  count(*) filter (
    where active
      and target_url ~* '[?&]tag=(freeisland01|freeisland00|freeislandp06)-20(&|$)'
  ) as amazon_links_com_tag_antiga
from public.short_links
where lower(network) = 'amzn';
