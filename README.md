# Free Island Landing Page

Landing page estática para captar entradas no grupo de promoções pelo WhatsApp.

## Arquivos principais

- `index.html`: estrutura da página
- `styles.css`: visual da landing
- `script.js`: link central do grupo do WhatsApp
- `assets/logo_sem_fundo.png`: sua logo

## Como trocar o link do grupo

Abra `script.js` e altere esta linha:

```js
const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/SEU-LINK-AQUI";
```

Sempre que um grupo encher, troque apenas esse link e publique novamente.

## Como publicar no Render

1. Suba estes arquivos para um repositório Git.
2. No Render, crie um novo projeto do tipo Static Site.
3. Conecte o repositório.
4. Deixe o Build Command vazio.
5. Use `.` como Publish Directory.
6. Publique.

## Métricas (Supabase) - 1 Linha Por Acesso

Se você quer métricas próprias por acesso (1 linha por page load), a página já vem com `fi.js`.
Ele faz **upsert** no Supabase usando **apenas a anon key** (public) e grava:
- 1 linha por acesso (`page_view_id`)
- tempo na tela (duration/visible)
- scroll máximo
- cliques agregados por botão (`click_counts`) + flags/contagens de WhatsApp/Instagram

### 1) Crie a tabela e policy no Supabase

No Supabase SQL Editor, rode:

```sql
create table if not exists public.page_sessions (
  page_view_id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  visitor_id text,
  session_id text,

  page_path text,
  page_url text,
  referrer text,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,

  user_agent text,
  language text,
  timezone text,

  screen_w int,
  screen_h int,
  viewport_w int,
  viewport_h int,

  duration_ms int,
  visible_ms int,
  max_scroll_pct int,

  click_any boolean,
  click_counts jsonb,

  whatsapp_clicks int,
  instagram_clicks int,
  external_redirects int,
  redirected_to_whatsapp boolean,
  redirected_to_instagram boolean,

  flush_reason text,
  closed boolean
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_page_sessions_updated_at on public.page_sessions;
create trigger trg_page_sessions_updated_at
before update on public.page_sessions
for each row execute function public.set_updated_at();

alter table public.page_sessions enable row level security;

grant usage on schema public to anon, authenticated;
grant insert, update on table public.page_sessions to anon, authenticated;

-- Simples e direto: permite INSERT por anon (bom para começar).
-- Como fazemos UPSERT, precisa liberar INSERT e UPDATE.
drop policy if exists "allow_anon_upsert_page_sessions" on public.page_sessions;
create policy "allow_anon_upsert_page_sessions"
on public.page_sessions
as permissive
for all
to anon
using (true)
with check (true);
```

### 2) Configure o `analytics.js`

Nada a configurar: `fi.js` já está apontando para seu Supabase e usa a anon key.

Depois disso, publique (Render vai redeploy).

### Eventos que você vai ver

- 1 linha por acesso em `public.page_sessions`
- `click_counts` é um JSON com a contagem por `data-track`
- `flush_reason` indica quando salvou: `page_view`, `t_60s`, `pagehide`, etc

## Estrategia de conversao usada

- CTA direto para o WhatsApp sem passar por Linktree
- Visual profissional alinhado com a marca
- Texto curto, claro e focado em ação
- Estrutura pronta para futuras atualizações
