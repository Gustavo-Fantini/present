# Free Island Landing Page

Landing estática da Free Island com captação para o WhatsApp, promoções
recentes, público total e métricas dos links próprios.

## Publicação no Render

O arquivo `render.yaml` versiona a regra para novos deploys via Blueprint. Em
um Static Site já criado manualmente, confirme uma única vez no Dashboard do
Render a regra abaixo; o arquivo `404.html` mantém um redirecionamento seguro
de contingência enquanto essa regra não estiver ativa.

1. Conecte este repositório como Static Site.
2. Deixe o Build Command vazio.
3. Use `.` como Publish Directory.
4. Em `Redirects/Rewrites`, adicione:

| Source | Destination | Action |
| --- | --- | --- |
| `/:productid/:network` | `/r/index.html` | `Rewrite` |

Essa regra permite URLs como:

```text
https://freeisland.onrender.com/943392/kabum
https://freeisland.onrender.com/B0BK9HTNJP/amzn
```

A rota legada `https://freeisland.onrender.com/r/?s=<slug>` continua válida.

## Banco do redirecionador

Execute `supabase-short-links.sql` no projeto Supabase usado pelo scraper. O
script é idempotente e cria/atualiza:

- `short_links`: destino validado, rede e produto;
- `short_link_clicks`: um evento por acesso;
- `resolve_short_link`: resolve e registra o clique sem expor as tabelas;
- `short_link_click_stats`: total e divisão por rede nas últimas 24 horas.

O JavaScript público usa somente a chave `anon`. A `service_role` permanece
exclusivamente no backend do scraper. Não existe parâmetro público que aceite
uma URL arbitrária, evitando transformar o domínio em open redirect.

## Rotas aceitas

| Sufixo | Loja |
| --- | --- |
| `meli` | Mercado Livre |
| `amzn` | Amazon |
| `shopee` | Shopee |
| `ali` | AliExpress via Awin |
| `kabum` | KaBuM! via Awin |
| `adidas` | Adidas via Awin |
| `terabyte` | TerabyteShop |

O SQL valida o domínio, o anunciante e a identificação própria antes de
permitir um redirecionamento ativo.

## Promoções recentes

`supabase-promotions.js` carrega as cinco promoções mais recentes de
`posted_promotions`. A imagem segue esta prioridade:

1. `image_public_url`, que contém os bytes exatos enviados pelo bot;
2. `image_url`, apenas para compatibilidade;
3. arte neutra local.

No repositório do scraper, execute também
`docs/supabase-posted-promotions-media.sql` para criar as colunas, remover
duplicatas por `content_hash` e tornar público o bucket `promotion-images`.

## Métricas visíveis

A página atualiza periodicamente:

- audiência combinada dos destinos em `audience_stats`;
- cliques em links Free Island nas últimas 24 horas;
- promoções mais recentes.

`fi.js` mantém as métricas próprias de navegação em `page_sessions`.

## Link do grupo

Altere somente `WHATSAPP_GROUP_URL` em `script.js` quando o convite principal
mudar:

```js
const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/SEU-LINK-AQUI";
```

## Arquivos principais

- `index.html`: estrutura da landing;
- `styles.css`: visual;
- `script.js`: CTAs;
- `supabase-promotions.js`: promoções, audiência e cliques;
- `r/index.html` e `r/redirect.js`: redirecionador seguro;
- `supabase-short-links.sql`: schema, validação e RPCs.
