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

## Métricas (Supabase)

Se você quer métricas próprias (page_view e clique em cada botão), a página já vem com `analytics.js`.
Ele envia eventos para uma tabela no Supabase via REST usando **apenas a anon key** (public).

### 1) Crie a tabela e policy no Supabase

No Supabase SQL Editor, rode:

```sql
create table if not exists public.events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),

  event_type text not null,
  event_name text,

  -- correlates events per page load ("acesso")
  page_view_id text,

  page_path text,
  page_url text,
  referrer text,

  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,

  visitor_id text,
  session_id text,

  user_agent text,
  language text,
  timezone text,

  screen_w int,
  screen_h int,
  viewport_w int,
  viewport_h int,

  extra jsonb
);

alter table public.events enable row level security;

-- Grants: sem isso o PostgREST pode negar mesmo com policy.
grant usage on schema public to anon, authenticated;
grant insert on table public.events to anon, authenticated;

-- Simples e direto: permite INSERT por anon (bom para começar).
-- Se quiser endurecer depois, a gente pode mover isso para uma Edge Function.
drop policy if exists "Allow anon inserts" on public.events;
create policy "Allow anon inserts"
on public.events
for insert
to anon
with check (true);
```

### 2) Configure o `analytics.js`

Abra `analytics.js` e preencha:

```js
supabaseUrl: "https://SEU-PROJETO.supabase.co",
supabaseAnonKey: "SUA-ANON-KEY",
```

Depois disso, publique (Render vai redeploy).

### Eventos que você vai ver

- `page_view` (carregou a página)
- `click` para cada CTA (ex.: `cta_hero_enter`, `cta_mobile_enter`)
- `whatsapp_click` quando o clique é em um botão do WhatsApp

## Estrategia de conversao usada

- CTA direto para o WhatsApp sem passar por Linktree
- Visual profissional alinhado com a marca
- Texto curto, claro e focado em ação
- Estrutura pronta para futuras atualizações
