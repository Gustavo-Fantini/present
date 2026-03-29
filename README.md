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

## Estrategia de conversao usada

- CTA direto para o WhatsApp sem passar por Linktree
- Visual profissional alinhado com a marca
- Texto curto, claro e focado em ação
- Estrutura pronta para futuras atualizações
