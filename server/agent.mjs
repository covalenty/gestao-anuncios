// Cérebro de IA do chat. Responde às perguntas do painel usando os dados REAIS
// da conta como contexto. Tem dois motores ("providers") intercambiáveis:
//   - api: Claude API via @anthropic-ai/sdk (produção; usa ANTHROPIC_API_KEY)
//   - cli: Claude Code local em modo -p (testes; usa sua assinatura, sem chave)
// A escolha é controlada por CHAT_PROVIDER (auto|api|cli). Em "auto", usa a API
// se houver chave; senão tenta o Claude local; senão o chamador cai nas regras.
import Anthropic from '@anthropic-ai/sdk';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadEnv } from './meta/client.mjs';

loadEnv(); // garante as variáveis em process.env (lidas pelo SDK e pelos helpers)

const DEFAULT_MODEL = 'claude-opus-4-8';

export function hasAnthropicKey() {
  loadEnv();
  return !!process.env.ANTHROPIC_API_KEY;
}

// Localiza o binário do Claude Code local (NÃO usar `which claude`: costuma ser
// um alias de shell). Respeita CLAUDE_CLI_PATH; senão tenta caminhos conhecidos.
export function findClaudeBin() {
  loadEnv();
  const explicit = (process.env.CLAUDE_CLI_PATH || '').trim();
  if (explicit) return fs.existsSync(explicit) ? explicit : null;
  const home = os.homedir();
  const candidates = [
    path.join(home, '.local', 'bin', 'claude'),
    path.join(home, '.claude', 'local', 'claude'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// Decide qual motor usar. Retorna 'api' | 'cli' | null (null => usar regras).
export function chatAvailable() {
  loadEnv();
  const mode = (process.env.CHAT_PROVIDER || 'auto').trim().toLowerCase();
  if (mode === 'api') return hasAnthropicKey() ? 'api' : null;
  if (mode === 'cli') return findClaudeBin() ? 'cli' : null;
  // auto
  if (hasAnthropicKey()) return 'api';
  if (findClaudeBin()) return 'cli';
  return null;
}

// Modelo do motor atual (para exibição no /api/chat/status).
export function chatModel(engine) {
  if (engine === 'api') return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  if (engine === 'cli') return process.env.CHAT_CLI_MODEL || DEFAULT_MODEL;
  return null;
}

const SYSTEM = `Você é o agente de gestão e otimização dos anúncios Meta/Facebook da Cienty
(conta CA01). Responde no chat do painel interno.

Regras:
- Responda SEMPRE em português do Brasil, com tom de especialista e parceiro, direto ao ponto.
- Baseie-se ESTRITAMENTE nos dados fornecidos no contexto. NUNCA invente números, campanhas ou métricas.
- Quando faltar dado para responder, diga o que falta — não chute.
- Aplique estas heurísticas ao analisar: CPL acima da média da conta = atenção de custo;
  frequência > 2,3 = risco de saturação (renovar criativo); melhor CPL = oportunidade de escalar;
  o mesmo criativo com CPL muito diferente entre campanhas/conjuntos = problema de público ou landing page.
- Recomendações devem ser ESPECÍFICAS: cite valores em R$ e ações concretas (aumentar/reduzir orçamento,
  pausar, renovar criativo). Inclua uma hipótese de resultado quando fizer sentido.
- Formate a resposta como HTML SIMPLES: use <strong>, <br>, <ul>/<li>, e <table> pequena quando ajudar.
  NÃO use Markdown, NÃO use blocos de código, NÃO use cabeçalhos grandes.
- Seja conciso — a resposta aparece numa janela de chat.
- Responda APENAS com a resposta final ao usuário, sem expor seu raciocínio interno.`;

// Monta um contexto compacto a partir do payload de /api/campaigns.
function buildContext(data) {
  return {
    conta: {
      cpl_medio: data.account.cplAvg,
      gasto_total_30d: data.account.spendTotal,
      leads_total_30d: data.account.leadsTotal,
      dia_do_mes: data.account.today,
      dias_no_mes: data.account.daysInMonth,
    },
    campanhas: data.campaigns.map((c) => ({
      nome: c.display,
      dominio: c.domain || null,
      status: c.status,
      objetivo: c.objective,
      gasto: c.metrics.spend,
      leads: c.metrics.leads,
      cpl: c.metrics.cpl,
      ctr: c.metrics.ctr,
      ctr_link: c.metrics.linkCtr,
      cpc: c.metrics.cpc,
      frequencia: c.metrics.freq,
      pct_gasto: c.metrics.spendPct,
      pct_leads: c.metrics.leadsPct,
      projecao_leads_mes: c.chart.monthTotal,
      ritmo_leads_dia: c.chart.projRate,
    })),
  };
}

function buildUserText(question, ctx) {
  return (
    `Dados atuais da conta (Meta Ads, últimos 30 dias) em JSON:\n` +
    JSON.stringify(ctx) +
    `\n\nPergunta: ${question}\n\nResponda em HTML simples, conforme as regras.`
  );
}

// Motor 1: Claude API (produção). Usa ANTHROPIC_API_KEY do ambiente.
async function callApi(userText) {
  const client = new Anthropic(); // resolve ANTHROPIC_API_KEY do ambiente
  const resp = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: 1500,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userText }],
  });
  return resp.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

// Motor 2: Claude Code local em modo -p (testes via assinatura, sem chave).
function callCli(userText) {
  const bin = findClaudeBin();
  if (!bin) throw new Error('binário do Claude local não encontrado (defina CLAUDE_CLI_PATH)');
  const model = process.env.CHAT_CLI_MODEL || DEFAULT_MODEL;
  const args = [
    '-p',
    '--append-system-prompt', SYSTEM,
    '--model', model,
    '--output-format', 'text',
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) return resolve(out.trim());
      reject(new Error(`claude CLI saiu com código ${code}: ${err.trim() || 'sem stderr'}`));
    });
    child.stdin.write(userText);
    child.stdin.end();
  });
}

// Responde a uma pergunta. `data` é o payload de buildCampaigns(); `engine`
// (opcional) força o motor — senão usa chatAvailable(). Retorna { html, engine }.
export async function agentChat(question, data, engine) {
  const chosen = engine || chatAvailable();
  if (!chosen) throw new Error('nenhum motor de IA disponível');
  const userText = buildUserText(question, buildContext(data));
  const html = chosen === 'cli' ? await callCli(userText) : await callApi(userText);
  return { html, engine: chosen };
}
