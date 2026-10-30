# Eventos da Meta

O Pixel da landing é `1479287410507022`, conjunto de dados **dados Free**.
O carregador `privacy-consent.js` ativa `meta-events.js` e `fi.js` após a escolha
**Aceitar métricas**. Visitas com somente essenciais ou bloqueadores podem não
aparecer no Pixel. A lista de visualizações do anúncio não comprova entrada no grupo.

| Evento | Disparo |
| --- | --- |
| `PageView` | Uma vez por documento, após aceitar métricas, inclusive nas páginas secundárias. |
| `ViewContent` | Uma vez na página inicial, após aceitar métricas. |
| `WhatsAppClick` | Encaminhamento solicitado após confirmar um convite atual com vaga. |
| `Lead` | Mesmo encaminhamento ao WhatsApp, como evento padrão para manter a configuração existente. |
| `TelegramClick` | Clique no botão do Telegram. |
| `OfferClick` | Clique nas seleções/loja Amazon. |
| `Scroll50`, `Scroll90` | Primeira rolagem que alcança cada profundidade após aceitar métricas. |

`Lead` mede intenção de entrar pelo convite, não adesão confirmada. O payload
identifica `conversion_stage: invite_redirect` e `membership_confirmed: false`.
O site não recebe confirmação de que o visitante concluiu a entrada no aplicativo.
Se nenhum grupo estiver disponível ou a consulta de vagas falhar, não há Lead.
Os nomes dos eventos padrão e personalizados anteriores foram preservados.

O roteador de grupos emite `freeisland:whatsapp-redirect` quando tem um convite
válido; o Pixel escuta esse evento sem controlar ou atrasar a navegação.
Repetições em menos de 1,2 segundo são ignoradas nas métricas. Cada evento recebe
seu próprio `eventID`. Não há integração de Conversions API neste site estático.

Ao escolher **Somente essenciais**, a API de consentimento do Pixel recebe
`revoke`, eventos novos e gravações de analytics próprias param, e os
identificadores locais opcionais são removidos. Eventos ainda na fila de um SDK
não carregado são descartados. Reabrir o painel de cookies não apaga a escolha
anterior. Falhas transitórias de carregamento têm uma nova tentativa limitada;
uma conexão restaurada ou nova aceitação permite tentar novamente.

## Conferir no Gerenciador de Eventos

1. Abra **dados Free → Eventos de teste** na conta da Meta.
2. Abra `https://freeisland.onrender.com/?debugMeta=true` pelo teste de navegador.
3. Escolha **Aceitar métricas**; confira `PageView` e `ViewContent`.
4. Clique uma vez no WhatsApp; confira `WhatsAppClick` e `Lead`.
5. Teste também Telegram e loja Amazon se esses eventos forem usados na campanha.

Em uma visita que já escolheu somente essenciais, reabra **Cookies** no rodapé
para alterar a escolha. No console, `FreeIslandMetaEvents.getStatus()` mostra
Pixel, consentimento, biblioteca, contagem de chamadas e erros depois do
carregamento. `FreeIslandMetaEvents.retry()` permite tentar novamente após
uma falha de rede. Uma biblioteca carregada ou chamada enfileirada não comprova
o recebimento na conta; essa confirmação acontece em **Eventos de teste**.

O link `?debugMeta=true` também mostra um painel no início da página, inclusive
quando o arquivo de eventos ou a biblioteca da Meta não carrega. **Copiar
diagnóstico** reúne consentimento, estado dos arquivos, chamadas do Pixel,
recursos de rede observados e a resposta do Supabase. O relatório exclui chaves,
cookies, identificadores dos visitantes e dados de identificação do SDK. A
ausência de um status HTTP em recurso externo não comprova bloqueio: o navegador
pode não expor esse campo. O painel não aparece para visitas normais.

## Tabela de métricas da landing

O total de acessos é agregado em `page_view_daily`, com somente `day`,
`page_path`, `page_views` e `updated_at`. O dia é definido pelo servidor no fuso
de Brasília. `anonymous-page-count.js` envia somente uma página pública aprovada,
sem query string, referrer, cookies ou identificadores. O contador é independente
da preferência por métricas detalhadas e não distingue visitantes únicos.

A RPC `freeisland_record_page_view` faz o incremento atômico, restringe origem e
página e não permite alterações diretas pelo cliente na tabela. Aplique
`supabase-anonymous-page-views.sql` no projeto `qpzwinntrphqaabatoaf` antes de
publicar o contador. A migração adiciona a estrutura e preserva `page_sessions`.
Não há reenvio automático de uma contagem com resposta ambígua, evitando
duplicação sem introduzir tokens de identificação. O total começa a ser medido
na ativação: acessos anteriores que não foram registrados não são reconstruídos.

No dashboard, o total vem da soma de `page_views`. Os detalhes abaixo são um
subconjunto e não entram novamente nessa soma. Filtros por campanha, fonte ou
visitante se aplicam aos detalhes; o contador anônimo não contém esses atributos.
O período e a apresentação dos dias usam Brasília.

`fi.js` grava em `page_sessions` no projeto `qpzwinntrphqaabatoaf`, separado do
projeto das promoções e dos links. Mantém os campos existentes e uma linha por
acesso: checkpoints e novas tentativas usam o mesmo `page_view_id`.

Gravações ao sair, ocultar a página ou encaminhar ao WhatsApp usam `fetch` com
`keepalive` quando disponível. Falhas transitórias de rede, HTTP 429 e erros de
servidor permitem até duas novas tentativas, sem criar acessos duplicados. Erros
de autorização e de estrutura da tabela aparecem no diagnóstico e não acionam
essa repetição. Os cliques brutos continuam em `click_counts`; o encaminhamento
ao WhatsApp só incrementa os respectivos campos após confirmar um convite válido.

No console, `FreeIslandSessionAnalytics.getStatus()` informa a tabela, projeto,
último status HTTP e último sucesso, sem expor a chave pública nem os dados da
linha. O painel de diagnóstico mostra uma gravação aceita separadamente do
carregamento da Meta. Essa coleta continua condicionada a **Aceitar métricas**;
ela não representa todos os acessos sem consentimento ou com bloqueadores.

## Verificações automatizadas

```text
node scripts/test_landing_routes.cjs
python scripts/audit_amazon_site.py
python scripts/test_meta_events.py --output /tmp/freeisland-meta-results
```

O teste de navegador requer Playwright e Chromium. Todas as chamadas externas
são interceptadas, incluindo gravações de analytics e requisições publicitárias;
não cria leads ou visualizações na conta real. As opções `--sdk-file` e
`--pixel-config-file` permitem exercitar cópias obtidas diretamente da biblioteca
e da configuração pública da Meta, com o envio também interceptado.

Referências: [Meta Pixel](https://developers.facebook.com/docs/meta-pixel/implementation/),
[API de eventos](https://developers.facebook.com/docs/meta-pixel/reference/),
[consentimento no código oficial da Meta](https://github.com/meta/facebook-for-woocommerce/blob/main/facebook-commerce-pixel-event.php).
