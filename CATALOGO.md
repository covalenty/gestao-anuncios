# Catálogo de Templates — image-forge

Guia rápido para escolher o template certo na hora de criar conteúdo. Cada
template é re-renderizável: escolha um, troque o conteúdo e gere a imagem.

> Como renderizar:
> `node src/cli.js render <template> --var chave="valor" --output output/meu-post.png`
> ou com um arquivo de variáveis: `node src/cli.js render <template> --vars-file meu-post.json`

---

## 🎨 Templates da marca Cienty (on-brand)

| Template | Para que serve / quando usar | Formato | Exemplo |
|---|---|---|---|
| **cienty-checklist-card** | Post de checklist / lista de tarefas. Fundo magenta com itens "escritos à mão" em cards de papel. Ideal para dicas práticas e "o que revisar". | `ig-portrait` (1080×1350) | [ver imagem](output/check-cienty-checklist-card.png) |
| **cienty-hero-illustration** | Post com ilustração em destaque sobre formas geométricas + bloco de texto + logo. Bom para mensagens conceituais/educativas. Exige uma ilustração PNG/SVG com fundo transparente na var `illustration`. | `ig-portrait` (1080×1350) | [ver imagem](output/check-cienty-hero-illustration.png) |
| **cienty-photo-callout** | Post com foto de fundo inteira + headline no topo + balão magenta com chamada no rodapé. Ideal para provocação/pergunta + resposta curta. | `ig-portrait` (1080×1350) | [ver imagem](output/check-cienty-photo-callout.png) |
| **cienty-photo-headline** | Post com foto em destaque + painel de headline + marca Cienty. Bom para apresentar time, bastidores ou um tema com foto forte. | `ig-portrait` (1080×1350) | [ver imagem](output/check-cienty-photo-headline.png) |
| **cienty-split-portrait** | Slide de carrossel: texto à esquerda, foto retrato à direita + retângulo de destaque. Ótimo para abrir um carrossel ou destacar um número/dado. | `ig-portrait` (1080×1350) | [ver imagem](output/check-cienty-split-portrait.png) |
| **cienty-update-dashboard** | Painel "dashboard" em 3 colunas (estilo Slack/interno). Para comunicados, updates de área, resumos de iniciativas. Formato paisagem. | 1600×900 | [ver imagem](output/check-cienty-update-dashboard.png) |

---

## 🧩 Templates genéricos

| Template | Para que serve / quando usar | Formato | Exemplo |
|---|---|---|---|
| **og-announcement** | Banner de anúncio para blog / Open Graph (preview de link). Para divulgar lançamentos e novidades em cards de compartilhamento. | `og-image` (1200×630) | [ver imagem](output/test-og.png) |
| **product-card** | Vitrine de produto com foto, preço (com preço antigo opcional) e CTA. Para ofertas e divulgação de produtos. | `ig-portrait` (1080×1350) | [ver imagem](output/test-product.webp) |
| **quote-card** | Card de citação/frase em destaque para Instagram. Para frases de impacto, depoimentos curtos. | `ig-post` (1080×1080) | [ver imagem](output/test-quote.png) |

---

## 📎 Observações

- **`_cienty/`** não é um template renderizável — é a pasta de **assets compartilhados**
  da marca (logo, ilustrações de exemplo, tokens). Os templates `cienty-*` puxam recursos dela.
- Para conteúdo da Cienty, siga a skill **`cienty-brand`** (cores magenta/amarelo,
  tipografia, voz pt-BR e regras do logo).
- Mais exemplos prontos (carrossel, launch-post, etc.) ficam em `examples/`.
- Lista de presets de tamanho: `node src/cli.js presets`.
