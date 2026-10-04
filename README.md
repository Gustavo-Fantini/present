# Free Island Landing Page

Landing estática da Free Island com entrada gratuita no WhatsApp e Telegram,
promoções recentes, loja Amazon, público total e métricas dos links próprios.
Os dois canais têm botões com as mesmas dimensões e destaque no início e no
final da página. A loja `https://www.amazon.com.br/shop/freeislandt0b` aparece
como publicidade, abaixo da escolha dos canais.

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

Com o auto-deploy do Render habilitado para `main`, cada push publica a landing.
Essa publicação não exige reiniciar a automação na EC2. Depois do deploy,
confira os dois canais, a loja Amazon, os dados públicos e o consentimento no
celular e no desktop; acompanhe a página e a API pública por cinco minutos.

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

O redirecionador legado usa uma chave pública `anon` limitada pela RPC e as
métricas opcionais usam outra chave `anon`, carregada somente após consentimento.
Promoções e lotação dos grupos são entregues por `GET /api/public/landing` sem
credenciais no payload. A `service_role` permanece exclusivamente no servidor.
Não existe parâmetro público que aceite uma URL arbitrária, evitando transformar
o domínio em open redirect.

## Retenção de métricas

Execute `supabase-page-sessions-retention.sql` uma vez no projeto Supabase das
métricas da landing (`qpzwinntrphqaabatoaf`), onde existe `page_sessions`. O
script cria um resumo diário, mantém 45 dias de sessões
detalhadas, preserva 24 meses agregados e agenda a limpeza diária com Supabase
Cron. No projeto do redirecionador (`jdeszhiykkviymtkdbit`), onde existem
`short_links` e `short_link_clicks`, execute
`docs/supabase-click-retention.sql` a partir do repositório do scraper.

Se o script de sessões já foi executado no projeto do redirecionador e exibiu
`relation "public.page_sessions" does not exist`, rode ali somente
`supabase-page-sessions-wrong-project-cleanup.sql`; depois troque para o projeto
de métricas e execute o script de retenção correto. Nenhum desses scripts remove
as regras da automação ou os links cadastrados.

Depois de uma limpeza inicial grande, rode separadamente no SQL Editor
`vacuum (analyze) public.page_sessions;`. Use `vacuum full` apenas em janela de
manutenção, pois ele bloqueia a tabela enquanto recupera espaço físico.

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
| `netshoes` | Netshoes via Rakuten Advertising |

Em uma instalacao que ja executou o SQL principal, rode
`supabase-netshoes-short-links-migration.sql` antes de ativar os links
Rakuten/Netshoes no scraper.

O SQL valida o domínio, o anunciante e a identificação própria antes de
permitir um redirecionamento ativo.

## Conformidade Amazon Associados

- `index.html` e `ofertas.html` exibem a declaração exigida e identificam cada
  link Amazon como publicidade;
- links de produto e seleção apontam diretamente para `amazon.com.br`,
  incluem `tag=freeislandt0b-20` e preservam a origem do tráfego; a URL de loja
  fornecida pelo programa é usada exatamente como recebida;
- links curtos `/amzn` exibem uma tela de confirmação com o Link Especial
  rastreado, em vez de redirecionar automaticamente;
- `ofertas.html` apresenta seleções por categoria sem copiar preço, estoque,
  estrelas ou imagens da Amazon;
- `guias.html` indexa dez artigos com URL própria, autoria e data, cujo conteúdo
  permanece completo sem os links patrocinados;
- `sobre.html`, `politica-editorial.html`, `privacidade.html`, `termos.html` e
  `contato.html` tornam autoria, tratamento de dados e responsabilidade claros;
- `robots.txt` e `sitemap.xml` tornam as páginas públicas localizáveis durante
  a revisão da candidatura.

Se uma nova candidatura gerar outro ID de rastreamento, substitua o ID antigo
em todos os arquivos e também em `AMAZON_ASSOCIATE_TAG` no scraper antes de
publicar links. Valide a landing com:

```powershell
rg -n "freeislandt0b-20|tag=|AMAZON_TAG" index.html ofertas.html guias.html guias/ r/redirect.js supabase-short-links.sql
python scripts/audit_amazon_site.py
```

Durante a análise da candidatura, mantenha links Amazon diretos e identificados
na landing e nas redes sociais declaradas. Não solicite compras para apoiar a
Free Island nem ofereça incentivos pelo uso dos links.

## Promoções recentes

`supabase-promotions.js` consome o snapshot sanitizado do backend e mostra no
máximo cinco publicações recentes da operação `free-island-principal`. O
servidor remove duplicatas, itens vencidos ou antigos, registros de outras
operações e qualquer produto Amazon. O painel não recebe preços nem URLs de
produto ou afiliado, IDs ou hashes internos; o contador diário também elimina
duplicatas. Assim, a landing não reproduz preço, disponibilidade ou imagem
Amazon sem uma API autorizada. A imagem segue esta
prioridade:

1. URL HTTPS do bucket público `promotion-images`;
2. arte neutra local quando a URL não passa pela validação.

No repositório do scraper, execute também
`docs/supabase-posted-promotions-media.sql` para criar as colunas, remover
duplicatas por `content_hash` e tornar público o bucket `promotion-images`.

## Métricas visíveis

A página atualiza periodicamente:

- audiência combinada dos destinos em `audience_stats`;
- promoções mais recentes.

`privacy-consent.js` deixa apenas recursos essenciais ativos por padrão. Somente
após consentimento ele carrega `fi.js` (métricas próprias em `page_sessions`) e
`meta-events.js` (Meta Pixel).

## Links dos grupos

Os convites são configurados em cada destino WhatsApp da operação Main no
painel do Hunter. `script.js` consulta a API pública a cada clique, escolhe o
grupo de maior prioridade abaixo de 990 membros e volta automaticamente ao
grupo prioritário quando uma vaga é aberta. Grupos desativados, lotados ou
sem dados confirmados não são oferecidos. A consulta de um clique nunca usa
cache antigo: se a API falhar, a página informa a indisponibilidade e permite
nova tentativa ou entrada no Telegram, sem inventar um convite de contingência.

Valide o roteamento e a aquisição antes de publicar:

```text
node scripts/test_landing_routes.cjs
python scripts/audit_amazon_site.py
python scripts/audit_amazon_site.py --base-url https://freeisland.onrender.com
```

## Arquivos principais

- `index.html`: estrutura da landing;
- `ofertas.html`: links especiais identificados e curadoria;
- `guias.html` e `guias/`: índice e dez publicações editoriais;
- `styles.css`: estilos compartilhados das páginas editoriais;
- `landing.css`: visual da página inicial;
- `public-data.js`: cliente sem credenciais da API pública;
- `script.js`: CTAs e roteamento dos grupos;
- `supabase-promotions.js`: renderiza o snapshot sanitizado;
- `privacy-consent.js`: consentimento e carregamento opcional de métricas;
- `scripts/audit_amazon_site.py`: auditoria local e HTTPS da candidatura;
- `r/index.html` e `r/redirect.js`: redirecionador seguro;
- `supabase-short-links.sql`: schema, validação e RPCs.
