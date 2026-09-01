begin;

alter table public.short_links
  drop constraint if exists short_links_target_allowed;

create or replace function public.ensure_amazon_associate_tag(value text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  source_value text := coalesce(value, '');
  base_value text;
  fragment_value text := '';
  normalized_value text;
begin
  if source_value !~* '^https://(www\.)?amazon\.com(\.br)?/(dp|gp/product)/[a-z0-9]{10}([/?#]|$)' then
    return source_value;
  end if;

  if strpos(source_value, '#') > 0 then
    base_value := left(source_value, strpos(source_value, '#') - 1);
    fragment_value := substr(source_value, strpos(source_value, '#'));
  else
    base_value := source_value;
  end if;

  normalized_value := regexp_replace(base_value, '([?&])tag=[^&#]*', '\1', 'gi');
  normalized_value := regexp_replace(normalized_value, '\?&+', '?', 'g');
  normalized_value := regexp_replace(normalized_value, '&&+', '&', 'g');
  normalized_value := regexp_replace(normalized_value, '[?&]+$', '', 'g');

  return normalized_value
    || case when strpos(normalized_value, '?') > 0 then '&' else '?' end
    || 'tag=freeislandt0b-20'
    || fragment_value;
end;
$$;

create or replace function public.amazon_link_has_current_tag(value text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select
    value ~* '[?&]tag=freeislandt0b-20(&|#|$)'
    and regexp_replace(
      value,
      '([?&])tag=freeislandt0b-20(&|#|$)',
      '\1\2',
      'i'
    ) !~* '[?&]tag=';
$$;

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
      and public.amazon_link_has_current_tag(value)
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
set target_url = public.ensure_amazon_associate_tag(target_url),
    network = 'amzn',
    updated_at = now()
where (
    lower(coalesce(network, '')) = 'amzn'
    or target_url ~* '^https://(www\.)?amazon\.com(\.br)?/(dp|gp/product)/[a-z0-9]{10}([/?#]|$)'
  )
  and target_url ~* '^https://(www\.)?amazon\.com(\.br)?/(dp|gp/product)/[a-z0-9]{10}([/?#]|$)'
  and (
    target_url is distinct from public.ensure_amazon_associate_tag(target_url)
    or lower(coalesce(network, '')) <> 'amzn'
  );

alter table public.short_links
  add constraint short_links_target_allowed
  check (not active or coalesce(public.short_link_target_allowed(target_url, network), false));

commit;

select
  count(*) filter (where active) as amazon_links_testados,
  count(*) filter (
    where active and public.amazon_link_has_current_tag(target_url)
  ) as amazon_links_corretos,
  count(*) filter (
    where active and target_url !~* '[?&]tag='
  ) as amazon_links_sem_tag,
  count(*) filter (
    where active
      and target_url ~* '[?&]tag='
      and target_url !~* '[?&]tag=freeislandt0b-20(&|#|$)'
  ) as amazon_links_com_tag_antiga,
  count(*) filter (
    where active
      and array_length(regexp_split_to_array(lower(target_url), '[?&]tag='), 1) - 1 > 1
  ) as amazon_links_com_tag_duplicada
from public.short_links
where lower(network) = 'amzn';
