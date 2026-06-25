# Agente de Gestão de Anúncios — Cienty
**Hackathon Cienty 2026**

> IA que cria criativos, monitora campanhas, realoca orçamento e gera relatórios — tudo pelo chat, sem abrir o Gerenciador de Anúncios.

| | |
|---|---|
| **Plataforma** | Meta Ads |
| **Canais** | Facebook · Instagram |
| **Interface** | Chat em linguagem natural |

---

## Contexto — De manual para automático

Tudo o que hoje consome horas de trabalho repetitivo, o agente resolve em segundos.

### Antes — processo manual
- ⏱ Criar imagens e banners manualmente em ferramentas de design
- 📊 Abrir o Gerenciador de Anúncios para verificar métricas
- 💸 Realocar orçamento manualmente campanha por campanha
- ⏸ Pausar anúncios ruins um a um após análise manual
- 📝 Montar relatórios copiando dados de várias telas

### Agora — com o agente
- ✅ Criativo gerado por IA em segundos a partir de um briefing
- ✅ Métricas de todas as campanhas com um comando no chat
- ✅ Realocação automática baseada em performance real
- ✅ Campanhas ruins pausadas automaticamente pelo agente
- ✅ Relatório gerado e entregue direto na conversa

---

## Arquitetura — Como funciona

O usuário se comunica em linguagem natural. O agente interpreta, decide e age.

```
Mensagem do usuário → Claude AI analisa → Ferramentas ativadas → Resultado no chat
```

| Etapa | O que acontece |
|---|---|
| **Entrada** | Texto em português, sem comandos especiais |
| **Cérebro** | Claude AI interpreta a intenção e decide quais ações tomar |
| **Execução** | Chama Meta Ads API e/ou gera criativos |
| **Resposta** | Imagem gerada, tabela de métricas ou relatório |

---

## Capacidades — O que o agente sabe fazer

6 ferramentas integradas que cobrem todo o ciclo de um anúncio.

### 📋 Listar Campanhas
Puxa todas as campanhas ativas com CTR, CPC, gasto, alcance e conversões dos últimos 7, 14 ou 30 dias.
> Ex: *"Como estão minhas campanhas?"*

### 🎨 Criar Criativo
Gera imagens e banners profissionais a partir de um briefing. Formatos: Instagram post, Story, Facebook post.
> Ex: *"Cria um anúncio de Black Friday com 30% off"*

### ⚡ Otimizar Campanhas
Analisa toda a conta, identifica as melhores e piores campanhas e realoca orçamento automaticamente.
> Ex: *"Otimiza o orçamento das campanhas"*

### 💰 Atualizar Orçamento
Ajusta o orçamento diário de qualquer campanha em reais, com confirmação antes de executar.
> Ex: *"Aumenta o orçamento da campanha X para R$150"*

### ⏸ Pausar Campanha
Pausa campanhas de baixo desempenho e registra o motivo no relatório para rastreabilidade.
> Ex: *"Pausa as campanhas com CTR abaixo de 1%"*

### ▶️ Ativar Campanha
Reativa campanhas pausadas. Pode ser acionado manualmente ou pelo fluxo de otimização.
> Ex: *"Ativa a campanha de lançamento"*

---

## Lógica de Otimização

O agente usa CTR como indicador principal para classificar campanhas e tomar decisões de orçamento.

| CTR | Classificação | Ação |
|---|---|---|
| **< 0,8%** | 🔴 Baixa performance | Pausa ou reduz orçamento em 30% |
| **0,8% – 2,5%** | 🟡 Performance média | Mantém orçamento atual |
| **> 2,5%** | 🟢 Alta performance | Aumenta orçamento em 30% |

---

## Stack Técnica

| Tecnologia | Função |
|---|---|
| **Claude AI** | Cérebro do agente |
| **Meta Ads API v21.0** | Gestão de campanhas |
| **image-forge** (Puppeteer + Sharp) | Geração de criativos |
| **Node.js + Express** | Servidor e interface web |
| **Handlebars** | Templates de imagem |

---

## Roadmap

| Versão | Descrição | Status |
|---|---|---|
| **MVP** | Criar criativos, monitorar campanhas, otimizar orçamento e gerar relatórios via chat | ✅ Entregue |
| **V1** | Publicar anúncios completos direto no Meta — do criativo ao ar, sem abrir nenhuma tela | 🔜 Próximo |
| **V2** | Relatórios automáticos semanais por e-mail e alertas quando uma campanha sair do padrão | 🔮 Futuro |
| **V3** | Suporte a Google Ads, TikTok Ads e otimização com machine learning sobre histórico da conta | 🔮 Futuro |
