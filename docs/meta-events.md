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
