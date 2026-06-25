import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderImage } from './render.js';
import {
  getCampaignsWithInsights,
  updateBudget,
  setStatus,
  uploadAdImage,
} from './meta-ads.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Você é um agente especialista em gestão de mídia paga no Meta Ads (Facebook e Instagram) da Cienty.

Seu papel é:
1. **Criar criativos** — gerar imagens e banners profissionais para anúncios usando os templates disponíveis
2. **Monitorar campanhas** — analisar métricas como CTR, CPC, alcance e conversões
3. **Otimizar automaticamente** — identificar campanhas com baixa performance e realocar orçamento para as que entregam melhor resultado
4. **Gerar relatórios** — explicar de forma clara e prática o que foi feito e por quê

**Critérios de performance:**
- CTR < 0,8% → baixa performance (candidata a pausa ou redução de orçamento)
- CTR > 2,5% → alta performance (candidata a aumento de orçamento)
- CPC alto com poucas conversões → sinal de alerta

**Ao otimizar orçamento:**
- Sempre explique o raciocínio antes de executar
- Mantenha o orçamento total próximo ao atual
- Nunca pause todas as campanhas ao mesmo tempo

**Formato de respostas:**
- Seja direto e use dados concretos
- Use markdown para tabelas e listas
- Para relatórios, mostre comparativos quando relevante
- Escreva sempre em português do Brasil`;

const TOOLS = [
  {
    name: 'listar_campanhas',
    description: 'Lista todas as campanhas do Meta Ads com métricas de performance.',
    input_schema: {
      type: 'object',
      properties: {
        periodo: {
          type: 'string',
          enum: ['last_7d', 'last_14d', 'last_30d'],
          description: 'Período para as métricas. Padrão: last_7d',
        },
      },
    },
  },
  {
    name: 'atualizar_orcamento',
    description: 'Atualiza o orçamento diário de uma campanha em reais (R$).',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string', description: 'ID da campanha' },
        campaign_name: { type: 'string', description: 'Nome da campanha (para log)' },
        novo_orcamento_diario_brl: { type: 'number', description: 'Novo orçamento diário em R$' },
      },
      required: ['campaign_id', 'campaign_name', 'novo_orcamento_diario_brl'],
    },
  },
  {
    name: 'pausar_campanha',
    description: 'Pausa uma campanha ativa no Meta Ads.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        campaign_name: { type: 'string' },
        motivo: { type: 'string', description: 'Motivo da pausa (para o relatório)' },
      },
      required: ['campaign_id', 'campaign_name'],
    },
  },
  {
    name: 'ativar_campanha',
    description: 'Ativa uma campanha pausada no Meta Ads.',
    input_schema: {
      type: 'object',
      properties: {
        campaign_id: { type: 'string' },
        campaign_name: { type: 'string' },
      },
      required: ['campaign_id', 'campaign_name'],
    },
  },
  {
    name: 'criar_criativo',
    description: 'Gera um criativo (imagem/banner) para anúncio usando os templates disponíveis. Templates: quote-card (citação/frase), product-card (produto com preço), og-announcement (anúncio/comunicado).',
    input_schema: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          enum: ['quote-card', 'product-card', 'og-announcement'],
          description: 'Template a usar',
        },
        vars: {
          type: 'object',
          description: 'Variáveis para o template. Exemplos: title, subtitle, cta, accent (cor hex), price, oldPrice, badge, quote, author',
        },
        tamanho: {
          type: 'string',
          description: 'Tamanho: ig-post (1080x1080), ig-story (1080x1920), fb-post (1200x630). Padrão: ig-post',
        },
      },
      required: ['template', 'vars'],
    },
  },
  {
    name: 'otimizar_campanhas',
    description: 'Analisa performance de todas as campanhas e realoca orçamento automaticamente. Pausa as de baixa performance (CTR < 0,8%) e aumenta o investimento nas de alta performance (CTR > 2,5%).',
    input_schema: {
      type: 'object',
      properties: {
        executar: {
          type: 'boolean',
          description: 'Se true, executa as mudanças. Se false, apenas mostra o plano de otimização.',
        },
      },
      required: ['executar'],
    },
  },
];

async function executeTool(name, input, sendEvent) {
  switch (name) {
    case 'listar_campanhas': {
      const periodo = input.periodo || 'last_7d';
      const campaigns = await getCampaignsWithInsights(periodo);
      return { campaigns, periodo };
    }

    case 'atualizar_orcamento': {
      await updateBudget(input.campaign_id, input.novo_orcamento_diario_brl);
      return {
        ok: true,
        campaign: input.campaign_name,
        novo_orcamento: `R$ ${input.novo_orcamento_diario_brl.toFixed(2)}/dia`,
      };
    }

    case 'pausar_campanha': {
      await setStatus(input.campaign_id, 'PAUSED');
      return { ok: true, campaign: input.campaign_name, status: 'PAUSED', motivo: input.motivo };
    }

    case 'ativar_campanha': {
      await setStatus(input.campaign_id, 'ACTIVE');
      return { ok: true, campaign: input.campaign_name, status: 'ACTIVE' };
    }

    case 'criar_criativo': {
      const outputFile = path.join(ROOT, 'output', `criativo_${Date.now()}.png`);
      const result = await renderImage({
        template: input.template,
        vars: input.vars || {},
        size: input.tamanho || 'ig-post',
        format: 'png',
        output: outputFile,
      });

      const filename = path.basename(result.output);
      sendEvent({ type: 'image', url: `/output/${filename}`, size: `${result.width}x${result.height}` });

      return {
        ok: true,
        arquivo: `/output/${filename}`,
        dimensoes: `${result.width}x${result.height}`,
        tamanho_bytes: result.bytes,
      };
    }

    case 'otimizar_campanhas': {
      const campaigns = await getCampaignsWithInsights('last_7d');
      const active = campaigns.filter(c => c.status === 'ACTIVE' && c.insights);

      const lowPerformers = active.filter(c => parseFloat(c.insights?.ctr || 0) < 0.8);
      const highPerformers = active.filter(c => parseFloat(c.insights?.ctr || 0) > 2.5);
      const avgPerformers = active.filter(c => {
        const ctr = parseFloat(c.insights?.ctr || 0);
        return ctr >= 0.8 && ctr <= 2.5;
      });

      const plan = {
        pausar: lowPerformers.map(c => ({ id: c.id, name: c.name, ctr: c.insights?.ctr, motivo: 'CTR abaixo de 0,8%' })),
        aumentar: highPerformers.map(c => ({
          id: c.id,
          name: c.name,
          ctr: c.insights?.ctr,
          orcamento_atual: c.daily_budget_brl,
          novo_orcamento: (parseFloat(c.daily_budget_brl || 0) * 1.3).toFixed(2),
        })),
        manter: avgPerformers.map(c => ({ id: c.id, name: c.name, ctr: c.insights?.ctr })),
      };

      if (input.executar) {
        for (const c of plan.pausar) await setStatus(c.id, 'PAUSED');
        for (const c of plan.aumentar) await updateBudget(c.id, parseFloat(c.novo_orcamento));
        return { executado: true, ...plan };
      }

      return { executado: false, plano: plan };
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}

function toolLabel(name, input) {
  const labels = {
    listar_campanhas: 'Consultando campanhas...',
    atualizar_orcamento: `Atualizando orçamento de "${input.campaign_name}"...`,
    pausar_campanha: `Pausando "${input.campaign_name}"...`,
    ativar_campanha: `Ativando "${input.campaign_name}"...`,
    criar_criativo: `Gerando criativo (${input.template})...`,
    otimizar_campanhas: input.executar ? 'Executando otimização...' : 'Analisando campanhas...',
  };
  return labels[name] || `Executando ${name}...`;
}

export async function runAgent(messages, sendEvent) {
  const history = [...messages];

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: history,
      tools: TOOLS,
    });

    for (const block of response.content) {
      if (block.type === 'text' && block.text) {
        sendEvent({ type: 'text', content: block.text });
      }
    }

    if (response.stop_reason === 'end_turn') break;

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      sendEvent({ type: 'tool_start', name: block.name, label: toolLabel(block.name, block.input) });

      let result;
      try {
        result = await executeTool(block.name, block.input, sendEvent);
      } catch (err) {
        result = { error: err.message };
      }

      sendEvent({ type: 'tool_done', name: block.name });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }

    history.push({ role: 'assistant', content: response.content });
    history.push({ role: 'user', content: toolResults });
  }
}
