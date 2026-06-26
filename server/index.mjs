// Servidor HTTP mínimo (Node nativo, sem dependências) que serve a interface
// e expõe dados REAIS do Meta Ads vindos dos scripts em server/meta/.
//   node server/index.mjs   →   http://localhost:4100
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { getConfig, graph, graphAll } from './meta/client.mjs';
import { createCampaignFromSpec } from './meta/create-campaign.mjs';
import { agentChat, chatAvailable, chatModel } from './agent.mjs';
import { renderImage } from '../src/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INTERFACE = path.join(ROOT, 'interface', 'index.html');
const TEMPLATES_DIR = path.join(ROOT, 'templates');
const PREVIEW_DIR = path.join(ROOT, 'output', '_preview');
const PORT = process.env.PORT || 4100;

const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const brl = (n) => 'R$ ' + (n == null ? '—' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
function leads(actions) {
  if (!actions) return 0;
  for (const t of LEAD_TYPES) { const h = actions.find((a) => a.action_type === t); if (h) return Number(h.value); }
  return 0;
}

// Quebra o nome da campanha do Meta em rótulos amigáveis para a interface.
function parseName(name) {
  const tags = [...name.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]);
  const domain = (name.match(/\(([^)]+)\)/) || [])[1] || '';
  const display = name.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/, '').trim() || name;
  return { tags, domain, display };
}

// Constrói o payload de campanhas (config + insights 30d + série diária do mês + projeção).
async function buildCampaigns() {
  const cfg = getConfig();
  const [list, ins30, dailyRows, accRows] = await Promise.all([
    graphAll(`${cfg.accountId}/campaigns`, { fields: 'id,name,objective,effective_status' }, cfg, 100),
    graphAll(`${cfg.accountId}/insights`, { level: 'campaign', date_preset: 'last_30d',
      fields: 'campaign_id,spend,reach,frequency,clicks,ctr,cpc,inline_link_click_ctr,actions' }, cfg, 200),
    graphAll(`${cfg.accountId}/insights`, { level: 'campaign', date_preset: 'this_month', time_increment: 1,
      fields: 'campaign_id,actions,date_start' }, cfg, 3000),
    graphAll(`${cfg.accountId}/insights`, { date_preset: 'last_30d',
      fields: 'spend,actions,reach,frequency,clicks,ctr,cpc,cpm,impressions,inline_link_click_ctr' }, cfg, 1),
  ]);

  const insById = Object.fromEntries(ins30.map((r) => [r.campaign_id, r]));

  // Série diária por campanha, indexada por dia do mês.
  const dayOf = (d) => Number(d.slice(8, 10));
  let today = 0;
  const dailyByCamp = {};
  for (const r of dailyRows) {
    const day = dayOf(r.date_start);
    today = Math.max(today, day);
    (dailyByCamp[r.campaign_id] ||= {})[day] = leads(r.actions);
  }
  const daysInMonth = (() => {
    const any = dailyRows[0]?.date_start;
    if (!any) return 30;
    const [y, m] = any.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  })();

  const acc = accRows[0] || {};
  const accSpend = num(acc.spend);
  const accLeads = leads(acc.actions);
  const cplAvg = accLeads ? accSpend / accLeads : 0;

  const campaigns = list.map((c) => {
    const ins = insById[c.id] || {};
    const spend = num(ins.spend);
    const ld = leads(ins.actions);
    const status = c.effective_status === 'ACTIVE' ? 'Ativa' : 'Pausada';
    const { tags, domain, display } = parseName(c.name);

    // série diária 1..hoje
    const byDay = dailyByCamp[c.id] || {};
    const actual = [];
    for (let d = 1; d <= today; d++) actual.push(byDay[d] || 0);

    // projeção: média dos últimos 7 dias completos (exclui hoje, parcial)
    const complete = actual.slice(0, -1);
    const last7 = complete.slice(-7);
    const avg = (status === 'Pausada' || !last7.length) ? 0 : last7.reduce((a, b) => a + b, 0) / last7.length;
    const rate = Math.round(avg);
    const sum = actual.reduce((a, b) => a + b, 0);
    const monthTotal = sum + rate * (daysInMonth - today);

    return {
      id: c.id, name: c.name, display, domain, tags, status, objective: c.objective,
      metrics: {
        spend, leads: ld, cpl: ld ? spend / ld : null,
        ctr: num(ins.ctr), linkCtr: num(ins.inline_link_click_ctr), cpc: num(ins.cpc),
        freq: num(ins.frequency),
        spendPct: accSpend ? spend / accSpend : 0,
        leadsPct: accLeads ? ld / accLeads : 0,
      },
      chart: { actual, today, daysInMonth, projRate: rate, monthTotal },
    };
  });

  // ordena por gasto desc
  campaigns.sort((a, b) => b.metrics.spend - a.metrics.spend);
  const account = {
    cplAvg, spendTotal: accSpend, leadsTotal: accLeads, today, daysInMonth,
    ctr: num(acc.ctr), linkCtr: num(acc.inline_link_click_ctr), cpc: num(acc.cpc),
    cpm: num(acc.cpm), freq: num(acc.frequency), reach: num(acc.reach),
  };
  return { account, campaigns };
}

// Resposta de chat por REGRAS (fallback quando não há ANTHROPIC_API_KEY).
// Recebe os dados já montados para não bater na API do Meta duas vezes.
function chatResponseRules(q, data) {
  const { account, campaigns } = data;
  const avg = account.cplAvg;
  const active = campaigns.filter((c) => c.status === 'Ativa' && c.metrics.leads > 0);
  const t = (q || '').toLowerCase();

  // — Comparar campanhas —
  if (/compar/.test(t)) {
    const rows = active.sort((a, b) => b.metrics.spend - a.metrics.spend).map((c) => {
      const m = c.metrics;
      const cplColor = m.cpl <= avg ? '#0e8345' : '#de1135';
      return `<tr style="border-top:1px solid rgba(0,0,0,.08)"><td style="padding:6px 8px 6px 0">${c.display}</td><td style="padding:6px 8px;text-align:right">${m.ctr.toFixed(2)}%</td><td style="padding:6px 8px;text-align:right;color:${cplColor};font-weight:600">${brl(m.cpl)}</td><td style="padding:6px 8px;text-align:right">${brl(m.spend)}</td><td style="padding:6px 8px;text-align:right">${m.leads}</td></tr>`;
    }).join('');
    return `Comparativo das <strong>campanhas ativas</strong> (últimos 30 dias):<br><br>
      <table style="width:100%;font-size:12px;border-collapse:collapse">
        <tr style="color:#6d7079;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.04em"><td style="padding:4px 8px 4px 0">Campanha</td><td style="padding:4px 8px;text-align:right">CTR</td><td style="padding:4px 8px;text-align:right">CPL</td><td style="padding:4px 8px;text-align:right">Gasto</td><td style="padding:4px 8px;text-align:right">Leads</td></tr>
        ${rows}
      </table><br>CPL médio da conta: <strong>${brl(avg)}</strong>.`;
  }

  // — Revisar orçamento —
  if (/or[çc]ament|verba|budget/.test(t)) {
    if (!active.length) return 'Não há campanhas ativas com leads no período para revisar o orçamento.';
    const byCpl = active.slice().sort((a, b) => a.metrics.cpl - b.metrics.cpl);
    const best = byCpl[0], worst = byCpl[byCpl.length - 1];
    return `Resumo do orçamento — últimos 30 dias:<br><br>
      Total investido: <strong>${brl(account.spendTotal)}</strong><br>
      Leads gerados: <strong>${account.leadsTotal}</strong> · CPL médio <strong>${brl(avg)}</strong><br><br>
      📌 <strong>Realocação sugerida:</strong><br>
      • Reduzir <strong>${worst.display}</strong> — pior CPL (${brl(worst.metrics.cpl)}, ${Math.round((worst.metrics.cpl / avg - 1) * 100)}% acima da média)<br>
      • Reforçar <strong>${best.display}</strong> — melhor CPL (${brl(best.metrics.cpl)})${best.metrics.freq < 1.8 ? ' e frequência baixa, há folga para escalar' : ''}<br><br>
      Mover verba do CPL alto para o baixo reduz o custo médio por lead sem aumentar o investimento total.`;
  }

  // — Sugerir copy —
  if (/copy|texto|an[úu]ncio/.test(t)) {
    const ctx = active[0]?.display || 'sua campanha';
    return `Aqui estão <strong>3 opções de copy</strong> ancoradas no contexto de <strong>${ctx}</strong>:<br><br>
      <strong>A — Benefício direto</strong><br><em>"Sua farmácia compara o preço de todos os distribuidores numa tela só. De graça, com a Cienty."</em><br><br>
      <strong>B — Dor + tempo</strong><br><em>"Cotar preço toma horas do seu dia. Com o buscapreço você fecha o melhor pedido em minutos."</em><br><br>
      <strong>C — Urgência de margem</strong><br><em>"Pequenas diferenças de preço viram margem no fim do mês. Compre melhor com a Cienty."</em><br><br>
      Posso transformar qualquer uma num criativo — veja a aba <strong>Criativos</strong>.`;
  }

  // — Criar criativo —
  if (/criativ|criar/.test(t)) {
    return `Para criar um novo criativo, use a aba <strong>Criativos</strong> (gera a imagem de verdade pelo image-forge) ou o botão <strong>Nova</strong> em Campanhas.<br><br>
      Recomendação com base nos dados: o ângulo de <strong>economia de tempo na compra</strong> é o que melhor converte hoje. Formato sugerido: vídeo 9:16 ou imagem 4:5, fundo escuro com magenta Cienty.`;
  }

  // — Insights / análise (default rico) —
  const flags = [];
  for (const c of active) {
    if (c.metrics.cpl > avg * 1.3) flags.push(`🔴 <strong>${c.display}</strong> — CPL ${brl(c.metrics.cpl)} (${Math.round((c.metrics.cpl / avg - 1) * 100)}% acima da média). Realocar verba.`);
    if (c.metrics.freq > 2.3) flags.push(`🟠 <strong>${c.display}</strong> — frequência ${c.metrics.freq.toFixed(2)}, risco de saturação. Renovar criativo.`);
  }
  const best = active.slice().sort((a, b) => a.metrics.cpl - b.metrics.cpl)[0];
  if (best) flags.push(`🟢 <strong>${best.display}</strong> — melhor CPL da conta (${brl(best.metrics.cpl)}). Oportunidade de escalar.`);
  const body = flags.length ? flags.join('<br><br>') : 'Nenhum alerta crítico — as campanhas ativas estão dentro do esperado.';
  return `Leitura da conta agora (<strong>${account.leadsTotal} leads</strong> a <strong>${brl(avg)}</strong> nos últimos 30 dias):<br><br>${body}`;
}

// Lista os templates reais do image-forge (lê templates/<nome>/config.json).
function listTemplates() {
  return fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(TEMPLATES_DIR, d.name, 'template.html')))
    .map((d) => {
      const cfgPath = path.join(TEMPLATES_DIR, d.name, 'config.json');
      let cfg = {};
      try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); } catch {}
      return { template: d.name, description: cfg.description || '', size: cfg.size || 'ig-post', defaults: cfg.defaults || {} };
    });
}

// Renderiza (com cache em disco) um template via image-forge e devolve o PNG.
async function renderPreview(template, size, vars) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const key = crypto.createHash('md5').update(JSON.stringify({ template, size, vars })).digest('hex').slice(0, 16);
  const out = path.join(PREVIEW_DIR, `${template}-${key}.png`);
  if (!fs.existsSync(out)) {
    await renderImage({ template, vars, size: size || undefined, scale: 1, format: 'png', output: out });
  }
  return fs.readFileSync(out);
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 5e6) reject(new Error('body grande demais')); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// Converte caminho absoluto em output/ para URL servível (/output/...).
function toOutputUrl(absPath) {
  if (!absPath) return null;
  const rel = path.relative(path.join(ROOT, 'output'), absPath);
  return rel.startsWith('..') ? null : '/output/' + rel.split(path.sep).join('/');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (url.pathname === '/api/campaigns') {
      const data = await buildCampaigns();
      return send(res, 200, JSON.stringify(data));
    }
    if (url.pathname === '/api/chat/status') {
      const engine = chatAvailable() || 'rules';
      return send(res, 200, JSON.stringify({ engine, model: chatModel(engine) }));
    }
    if (url.pathname === '/api/chat') {
      const q = url.searchParams.get('q') || '';
      const data = await buildCampaigns();
      const provider = chatAvailable();
      let html;
      let engine = 'rules';
      if (provider) {
        try {
          ({ html, engine } = await agentChat(q, data, provider));
        } catch (e) {
          console.error(`IA falhou (motor=${provider}):`, e.message);
          html = chatResponseRules(q, data) +
            `<br><br><small style="color:#b9700f">⚠ IA indisponível agora (${e.message}); resposta gerada por regras.</small>`;
          engine = 'rules';
        }
      } else {
        html = chatResponseRules(q, data);
      }
      console.log(`/api/chat motor=${engine}`);
      return send(res, 200, JSON.stringify({ html, engine }));
    }
    if (url.pathname === '/api/templates') {
      return send(res, 200, JSON.stringify({ templates: listTemplates() }));
    }
    if (url.pathname === '/api/render') {
      const template = url.searchParams.get('template');
      const size = url.searchParams.get('size') || '';
      let vars = {};
      try { vars = JSON.parse(url.searchParams.get('vars') || '{}'); } catch {}
      if (!template) return send(res, 400, JSON.stringify({ error: 'template obrigatório' }));
      const png = await renderPreview(template, size, vars);
      return send(res, 200, png, 'image/png');
    }
    if (url.pathname === '/api/campaign' && req.method === 'POST') {
      const body = await readBody(req);
      const { spec, confirm } = body;
      if (!spec) return send(res, 400, JSON.stringify({ error: 'spec obrigatório' }));
      const r = await createCampaignFromSpec(spec, { confirm: !!confirm });
      // expõe previews como URLs servíveis
      if (r.previews) r.previews = r.previews.map((p) => ({ ...p, url: toOutputUrl(p.imagePath) }));
      return send(res, 200, JSON.stringify(r));
    }
    if (url.pathname.startsWith('/output/')) {
      const f = path.join(ROOT, 'output', url.pathname.slice('/output/'.length));
      if (f.startsWith(path.join(ROOT, 'output')) && fs.existsSync(f)) {
        return send(res, 200, fs.readFileSync(f), 'image/png');
      }
      return send(res, 404, JSON.stringify({ error: 'not found' }));
    }
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204); return res.end();
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      return send(res, 200, fs.readFileSync(INTERFACE), 'text/html; charset=utf-8');
    }
    send(res, 404, JSON.stringify({ error: 'not found' }));
  } catch (e) {
    console.error('Erro:', e.message);
    send(res, 500, JSON.stringify({ error: e.message, meta: e.meta || null }));
  }
});

server.listen(PORT, () => {
  console.log(`▶ Painel Cienty em http://localhost:${PORT}`);
  console.log(`  API: GET /api/campaigns (dados reais da conta via server/meta)`);
});
