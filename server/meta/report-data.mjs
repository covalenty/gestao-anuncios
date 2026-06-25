// Coletor completo para o relatório de performance.
// Junta config (campanha/adset/anúncio) + insights de 30 dias num único JSON,
// salvo em data/snapshot-<preset>-<carimbo>.json.
//   node server/meta/report-data.mjs [date_preset] [carimbo_iso]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, graph, graphAll } from './client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const INSIGHT_FIELDS = [
  'spend', 'impressions', 'reach', 'frequency', 'clicks',
  'ctr', 'cpc', 'cpm', 'inline_link_clicks', 'inline_link_click_ctr',
  'actions', 'cost_per_action_type',
].join(',');

const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];

function num(x) { const n = Number(x); return Number.isFinite(n) ? n : 0; }

function actionValue(actions, types) {
  if (!actions) return 0;
  for (const t of types) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return Number(hit.value);
  }
  return 0;
}

function normInsight(row) {
  if (!row) return null;
  const spend = num(row.spend);
  const leads = actionValue(row.actions, LEAD_TYPES);
  const linkClicks = num(row.inline_link_clicks);
  return {
    spend,
    impressions: num(row.impressions),
    reach: num(row.reach),
    frequency: num(row.frequency),
    clicks: num(row.clicks),
    linkClicks,
    ctr: num(row.ctr),
    linkCtr: num(row.inline_link_click_ctr),
    cpc: num(row.cpc),
    cpm: num(row.cpm),
    leads,
    cpl: leads > 0 ? spend / leads : null,
  };
}

// Resume o objeto de targeting num texto legível.
function summarizeTargeting(t) {
  if (!t) return null;
  const parts = [];
  if (t.age_min || t.age_max) parts.push(`${t.age_min || 18}-${t.age_max || 65}+`);
  if (t.genders) parts.push(t.genders.includes(1) && t.genders.includes(2) ? 'todos' : t.genders.includes(1) ? 'homens' : 'mulheres');
  const geos = t.geo_locations?.countries || t.geo_locations?.regions?.map((r) => r.name) || [];
  if (geos.length) parts.push(geos.join(','));
  const specs = t.flexible_spec || [];
  const interests = [];
  for (const s of specs) {
    for (const arr of Object.values(s)) {
      if (Array.isArray(arr)) interests.push(...arr.map((i) => i.name).filter(Boolean));
    }
  }
  if (t.interests) interests.push(...t.interests.map((i) => i.name).filter(Boolean));
  return { resumo: parts.join(' | '), interesses: [...new Set(interests)] };
}

async function main() {
  const preset = process.argv[2] || 'last_30d';
  const stamp = process.argv[3] || 'sem-carimbo';
  const cfg = getConfig();
  console.error(`Coletando ${cfg.accountId} (${preset})...`);

  // --- Config das entidades ---
  const accountInfo = await graph(cfg.accountId, { fields: 'name,currency,timezone_name,amount_spent' }, cfg);

  const campaigns = await graphAll(cfg.accountId + '/campaigns',
    { fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time' }, cfg);

  const adsets = await graphAll(cfg.accountId + '/adsets',
    { fields: 'id,name,campaign_id,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,bid_strategy,targeting' }, cfg);

  const ads = await graphAll(cfg.accountId + '/ads',
    { fields: 'id,name,adset_id,campaign_id,status,effective_status,creative{id,name,object_type,title,body}' }, cfg);

  // --- Insights por nível, indexados por id ---
  const byId = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], normInsight(r)]));

  const campIns = byId(await graphAll(cfg.accountId + '/insights',
    { level: 'campaign', date_preset: preset, fields: 'campaign_id,' + INSIGHT_FIELDS }, cfg), 'campaign_id');
  const adsetIns = byId(await graphAll(cfg.accountId + '/insights',
    { level: 'adset', date_preset: preset, fields: 'adset_id,' + INSIGHT_FIELDS }, cfg), 'adset_id');
  const adIns = byId(await graphAll(cfg.accountId + '/insights',
    { level: 'ad', date_preset: preset, fields: 'ad_id,' + INSIGHT_FIELDS }, cfg), 'ad_id');
  const accountIns = normInsight((await graph(cfg.accountId + '/insights',
    { date_preset: preset, fields: INSIGHT_FIELDS }, cfg)).data?.[0]);

  // --- Montagem hierárquica ---
  const cents = (v) => (v ? Number(v) / 100 : null);
  const tree = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    objective: c.objective,
    status: c.status,
    effective_status: c.effective_status,
    dailyBudget: cents(c.daily_budget),
    lifetimeBudget: cents(c.lifetime_budget),
    bidStrategy: c.bid_strategy || null,
    startTime: c.start_time || null,
    insights: campIns[c.id] || null,
    adsets: adsets.filter((s) => s.campaign_id === c.id).map((s) => ({
      id: s.id,
      name: s.name,
      status: s.status,
      effective_status: s.effective_status,
      dailyBudget: cents(s.daily_budget),
      lifetimeBudget: cents(s.lifetime_budget),
      optimizationGoal: s.optimization_goal,
      billingEvent: s.billing_event,
      bidStrategy: s.bid_strategy || null,
      targeting: summarizeTargeting(s.targeting),
      insights: adsetIns[s.id] || null,
      ads: ads.filter((a) => a.adset_id === s.id).map((a) => ({
        id: a.id,
        name: a.name,
        status: a.status,
        effective_status: a.effective_status,
        creative: a.creative ? {
          name: a.creative.name,
          type: a.creative.object_type,
          title: a.creative.title || null,
          body: a.creative.body || null,
        } : null,
        insights: adIns[a.id] || null,
      })),
    })),
  }));

  const snapshot = {
    generatedAt: stamp,
    datePreset: preset,
    account: {
      id: cfg.accountId,
      name: accountInfo.name,
      currency: accountInfo.currency,
      timezone: accountInfo.timezone_name,
      insights: accountIns,
    },
    campaigns: tree,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const safeStamp = stamp.replace(/[:.]/g, '-');
  const file = path.join(DATA_DIR, `snapshot-${preset}-${safeStamp}.json`);
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2));
  // também grava "latest" para o painel
  fs.writeFileSync(path.join(DATA_DIR, `snapshot-latest.json`), JSON.stringify(snapshot, null, 2));
  console.error(`OK -> ${file}`);
  console.log(file);
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
