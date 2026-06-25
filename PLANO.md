# Plano de Implementação — Agente de Gestão de Anúncios

## Contexto
Projeto de Hackathon da Cienty. Prazo: 25/06/2026 (tarde).
Plataformas: Meta Ads (Facebook + Instagram).
Credenciais Meta disponíveis com a Sara.

## O que já existe (image-forge)
- `src/render.js` — motor de renderização HTML → imagem (Puppeteer + Sharp)
- `src/cli.js` — CLI para renderizar templates
- `templates/quote-card/`, `templates/product-card/`, `templates/og-announcement/`
- Dependências instaladas: puppeteer, handlebars, sharp, chokidar, ws

## O que foi instalado nesta sessão
```bash
npm install @anthropic-ai/sdk express dotenv
```
Pasta `public/` criada.

---

## Arquivos a criar (não criados ainda)

### 1. `.env` (criar manualmente — não commitar)
```
ANTHROPIC_API_KEY=sk-ant-...
META_ACCESS_TOKEN=EAAxxxxxxx
META_AD_ACCOUNT_ID=act_xxxxxxxxx
PORT=3000
```

### 2. `src/meta-ads.js` — Wrapper da Meta Ads API
Funções necessárias:
- `getCampaignsWithInsights(datePreset)` — lista campanhas + métricas
- `updateBudget(campaignId, dailyBudgetBRL)` — atualiza orçamento diário
- `setStatus(campaignId, status)` — pausa/ativa campanha
- `uploadAdImage(imagePath)` — sobe imagem gerada para o Meta

API base: `https://graph.facebook.com/v21.0`
Orçamento no Meta = centavos (R$100 = 10000 na API)

### 3. `src/agent.js` — Agente Claude com tools
Modelo: `claude-sonnet-4-6`
Ferramentas (tools):
- `listar_campanhas` — chama getCampaignsWithInsights
- `atualizar_orcamento` — chama updateBudget
- `pausar_campanha` — chama setStatus('PAUSED')
- `ativar_campanha` — chama setStatus('ACTIVE')
- `criar_criativo` — chama renderImage do render.js
- `otimizar_campanhas` — lógica automática de realocação

Critérios de performance:
- CTR < 0,8% → baixa performance → pausar ou reduzir
- CTR > 2,5% → alta performance → aumentar orçamento
- Manter orçamento total próximo ao atual

Exporta: `async function runAgent(messages, sendEvent)`
`sendEvent` é um callback SSE com eventos: `{type: 'text'|'tool_start'|'tool_done'|'image'|'done', ...}`

### 4. `src/server.js` — Servidor Express
- `GET /` → serve `public/index.html`
- `POST /api/chat` → SSE stream (chama runAgent)
- `GET /output/*` → serve imagens geradas
- Porta padrão: 3000

### 5. `public/index.html` — Interface de chat
- Tema escuro (#0a0a0a)
- Chat centralizado, max-width 800px
- Mensagens do usuário: direita, azul
- Mensagens do agente: esquerda, #1e1e1e
- Tool indicators: pills cinzas animadas ("Consultando campanhas...")
- Imagens geradas exibidas inline no chat
- Header: "Agente de Anúncios — Cienty" com gradiente roxo/pink
- Usa fetch + ReadableStream (não EventSource, pois precisa de POST)

### 6. Atualizar `package.json`
Adicionar script:
```json
"start": "node src/server.js"
```

---

## Fluxo do demo

1. Usuário digita: *"Me mostra como estão minhas campanhas"*
   → Agent chama `listar_campanhas` → formata tabela com CTR, CPC, gasto

2. Usuário digita: *"Otimiza o orçamento das campanhas"*
   → Agent chama `listar_campanhas` → identifica melhores/piores → chama `atualizar_orcamento` e/ou `pausar_campanha` → relata o que fez

3. Usuário digita: *"Cria um criativo de Black Friday com 30% de desconto"*
   → Agent chama `criar_criativo` com template `product-card` → imagem aparece no chat

4. Usuário digita: *"Me dá um relatório da semana"*
   → Agent chama `listar_campanhas` → gera resumo em texto com métricas e ações tomadas

---

## Ordem de implementação sugerida
1. `.env` → preencher credenciais
2. `src/meta-ads.js` → testar com `node -e "import('./src/meta-ads.js').then(m => m.getCampaignsWithInsights()).then(console.log)"`
3. `src/agent.js` → testar isolado
4. `src/server.js` + `public/index.html` → testar no browser

## Para rodar
```bash
npm start
# abre http://localhost:3000
```
