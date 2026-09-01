# Preparação para a revisão do Programa de Associados Amazon

Revisado em 31 de agosto de 2026. Este documento transforma os requisitos públicos da Amazon.com.br em controles verificáveis para a Free Island. A decisão final continua sendo exclusiva da Amazon; nenhuma alteração técnica consegue prometer aprovação permanente.

## Diagnóstico da rejeição

A mensagem recebida apontou que a landing tinha poucas ofertas válidas ou exibia cupons vencidos. A auditoria identificou três causas concretas:

1. a chave pública usada para buscar promoções estava inválida e o JavaScript ocultava a seção inteira;
2. o HTML entregue ao avaliador continha pouco conteúdo útil sem executar JavaScript;
3. a nova candidatura recebeu a tag `freeislandt0b-20`, mas páginas e redirects ainda possuíam identificadores anteriores.

O certificado HTTPS da Render já era válido. Portanto, trocar apenas hospedagem, domínio ou certificado não resolveria a causa informada.

## Matriz de requisitos

| Requisito oficial | Controle implementado |
| --- | --- |
| Pelo menos três vendas qualificadas em 180 dias | Checklist operacional; compras próprias, de amigos e familiares são proibidas |
| Conteúdo original e desenvolvido sem depender de publicidade | Dez artigos públicos com URL, autoria, data e conteúdo integral |
| Boa prática de pelo menos dez publicações | Índice em `guias.html` e dez páginas distintas em `guias/` |
| Conteúdo recente, em geral publicado nos últimos 60 dias | Datas visíveis, sitemap e validação automática de recência |
| Site público e sob controle do candidato | Páginas estáticas abertas, sem login, assinatura ou paywall |
| Links Especiais com a tag da candidatura atual | `freeislandt0b-20` validada em cada URL Amazon e no redirect |
| Identificação clara perto de cada link | “Publicidade · link patrocinado” dentro de cada chamada |
| Declaração de participante visível | Texto contratual exibido na landing, seleções, artigos e termos |
| Conteúdo original relevante em links de busca/categoria | Cada busca Amazon vem depois de análise própria da categoria |
| Promoções temporárias removidas ao vencer | A landing não publica preço, estoque ou cupom Amazon manualmente |
| Preços Amazon somente por ferramenta/API autorizada | Produtos Amazon são excluídos do painel dinâmico público |
| Sem redirecionamento automático para Amazon | Links da candidatura são diretos; `/amzn` exige clique afirmativo |
| Destino claro mesmo com botão/encurtador | O texto do link informa explicitamente “Amazon.com.br” |
| Sem avaliações/estrelas copiadas | Política editorial proíbe reutilização fora de API autorizada |
| Privacidade e publicidade transparentes | Política pública e analytics/Meta Pixel bloqueados até consentimento |

## Fontes oficiais acompanhadas

- Processo de análise: <https://associados.amazon.com.br/help/node/topic/G8TW5AE9XL2VX9VM>
- Contrato Operacional: <https://associados.amazon.com.br/help/operating/agreement>
- Políticas do Programa: <https://associados.amazon.com.br/help/operating/policies/>
- Identificação de links patrocinados: <https://associados.amazon.com.br/help/node/topic/GHQNZAU6669EZS98>
- Restrição de nomes de domínio: <https://associados.amazon.com.br/help/node/topic/GWYBE5WWL9YPFCMF>
- Proibição de redirecionamento automático: <https://associados.amazon.com.br/help/node/topic/GVFBVT6N73NTC933>
- Dormência e prazo de 180 dias: <https://associados.amazon.com.br/help/node/topic/G7MJTPEP9NC3YKMG>

As políticas mudam. Antes de cada nova candidatura ou revisão, compare a data de atualização dessas páginas com este documento.

## Como descrever o site

Categoria mais fiel ao conteúdo atual: **Site de conteúdo**.

Descrição sugerida, que deve permanecer verdadeira:

> A Free Island publica guias originais e recentes sobre hardware, periféricos e compra segura, com análise de compatibilidade, vendedor, garantia e custo total. A comunidade usa esse conteúdo para tomar decisões; links patrocinados são identificados e preços e disponibilidade são conferidos na loja.

Cadastre exatamente `https://freeisland.onrender.com/`. Não use um grupo fechado de WhatsApp ou Telegram como plataforma principal da candidatura. A lista oficial de redes aceitas para análise é limitada e exige página pública e audiência orgânica relevante.

## Procedimento antes da revisão

1. Publique landing e backend com a mesma tag `freeislandt0b-20`.
2. Execute `python scripts/audit_amazon_site.py --base-url https://freeisland.onrender.com`.
3. Confirme que as 18 páginas retornam HTTP 200 por HTTPS e não têm `noindex`.
4. Abra três links Amazon de páginas diferentes e confira visualmente a identificação e a tag.
5. Mantenha pelo menos dez artigos reais, públicos e revisados nos últimos 60 dias.
6. Não crie compras próprias nem peça a amigos, parentes, empregados ou parceiros para usar os links.
7. Não prometa cupons, descontos, preços ou estoque Amazon sem uma ferramenta oficial autorizada.
8. Não altere datas apenas para aparentar recência; publique revisões editoriais reais.

## Manutenção contínua

- executar a auditoria no deploy da landing;
- revisar links quebrados e artigos pelo menos mensalmente;
- atualizar imediatamente a tag em site, backend, banco e redirects se a Amazon emitir outro ID;
- retirar menções temporárias assim que deixarem de ser válidas;
- preservar autoria, contato, política editorial, privacidade e termos;
- registrar no histórico do Git qualquer mudança relevante de conteúdo ou conformidade.

Uma tag aprovada não é irrevogável: o contrato permite reavaliação e encerramento por descumprimento ou inatividade. O objetivo é manter a Free Island continuamente verificável, não criar um site descartável apenas para passar na análise.
