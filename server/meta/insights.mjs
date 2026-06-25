// Coleta métricas (/insights) da conta: nível campanha e nível anúncio.
//   node server/meta/insights.mjs [date_preset]
// date_preset: last_7d | last_14d | last_30d (padrão) | last_90d | maximum
import { getConfig, graph, graphAll } from './client.mjs';

const FIELDS = [
  'campaign_name',
  'adset_name',
  'ad_name',
  'spend',
  'impressions',
  'reach',
  'frequency',
  'clicks',
  'ctr',
  'cpc',
  'cpm',
  'actions',
  'cost_per_action_type',
].join(',');

// Extrai um tipo de ação (ex.: lead) da lista de actions do Meta.
function actionValue(actions, types) {
  if (!actions) return 0;
  for (const t of types) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return Number(hit.value);
  }
  return 0;
}
const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];

function num(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

// Normaliza uma linha de insight para uso interno.
function normalize(row) {
  const spend = num(row.spend);
  const leads = actionValue(row.actions, LEAD_TYPES);
  return {
    campaign: row.campaign_name,
    adset: row.adset_name,
    ad: row.ad_name,
    spend,
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: num(row.frequency),
    clicks: num(row.clicks),
    ctr: num(row.ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    leads,
    cpl: leads > 0 ? spend / leads : null,
  };
}

export async function fetchInsights(level, datePreset, cfg) {
  const rows = await graphAll(
    `${cfg.accountId}/insights`,
    { level, date_preset: datePreset, fields: FIELDS, limit: 100 },
    cfg,
    500
  );
  return rows.map(normalize);
}

// Resumo agregado da conta no período.
export async function fetchAccountSummary(datePreset, cfg) {
  const r = await graph(
    `${cfg.accountId}/insights`,
    { date_preset: datePreset, fields: FIELDS, limit: 1 },
    cfg
  );
  return (r.data || []).map(normalize)[0] || null;
}

function brl(n) {
  return n == null ? '—' : `R$${n.toFixed(2)}`;
}

async function main() {
  const preset = process.argv[2] || 'last_30d';
  const cfg = getConfig();
  console.log(`— Insights da conta ${cfg.accountId} (${preset}) —\n`);

  const account = await fetchAccountSummary(preset, cfg);
  if (account) {
    console.log('CONTA (total no período):');
    console.log(`  Gasto: ${brl(account.spend)}  |  Impressões: ${account.impressions.toLocaleString('pt-BR')}  |  Alcance: ${account.reach.toLocaleString('pt-BR')}`);
    console.log(`  Cliques: ${account.clicks}  |  CTR: ${account.ctr.toFixed(2)}%  |  CPC: ${brl(account.cpc)}  |  CPM: ${brl(account.cpm)}`);
    console.log(`  Frequência: ${account.frequency.toFixed(2)}  |  Leads: ${account.leads}  |  Custo/Lead: ${brl(account.cpl)}\n`);
  }

  const campaigns = await fetchInsights('campaign', preset, cfg);
  console.log(`CAMPANHAS (${campaigns.length}):`);
  for (const c of campaigns.sort((a, b) => b.spend - a.spend)) {
    console.log(`  • ${c.campaign}`);
    console.log(`      gasto=${brl(c.spend)} | leads=${c.leads} | CPL=${brl(c.cpl)} | CTR=${c.ctr.toFixed(2)}% | CPC=${brl(c.cpc)} | freq=${c.frequency.toFixed(2)}`);
  }

  const ads = await fetchInsights('ad', preset, cfg);
  console.log(`\nANÚNCIOS (${ads.length}) — ordenados por gasto:`);
  for (const a of ads.sort((x, y) => y.spend - x.spend).slice(0, 20)) {
    console.log(`  • [${a.campaign}] ${a.ad}`);
    console.log(`      gasto=${brl(a.spend)} | leads=${a.leads} | CPL=${brl(a.cpl)} | CTR=${a.ctr.toFixed(2)}% | CPC=${brl(a.cpc)} | freq=${a.frequency.toFixed(2)}`);
  }
}

// Roda só quando chamado diretamente (permite importar as funções acima).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('Erro:', e.message);
    process.exit(1);
  });
}
