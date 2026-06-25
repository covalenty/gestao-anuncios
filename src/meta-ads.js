import { readFile } from 'node:fs/promises';

const BASE = 'https://graph.facebook.com/v21.0';

const token = () => process.env.META_ACCESS_TOKEN;
const accountId = () => process.env.META_AD_ACCOUNT_ID;
const isMock = () => token() === 'mock';

// ---- Mock data ---------------------------------------------------------------

const MOCK_CAMPAIGNS = [
  { id: 'camp_001', name: 'Black Friday — Produto X', status: 'ACTIVE', objective: 'CONVERSIONS', daily_budget: '5000', daily_budget_brl: '50.00' },
  { id: 'camp_002', name: 'Remarketing — Carrinho Abandonado', status: 'ACTIVE', objective: 'CONVERSIONS', daily_budget: '3000', daily_budget_brl: '30.00' },
  { id: 'camp_003', name: 'Awareness — Marca Cienty', status: 'ACTIVE', objective: 'REACH', daily_budget: '8000', daily_budget_brl: '80.00' },
  { id: 'camp_004', name: 'Promoção de Verão', status: 'ACTIVE', objective: 'LINK_CLICKS', daily_budget: '4000', daily_budget_brl: '40.00' },
  { id: 'camp_005', name: 'Lançamento — Produto Y', status: 'PAUSED', objective: 'CONVERSIONS', daily_budget: '6000', daily_budget_brl: '60.00' },
];

const MOCK_INSIGHTS = {
  camp_001: { campaign_id: 'camp_001', campaign_name: 'Black Friday — Produto X', impressions: '42300', clicks: '1480', ctr: '3.50', cpc: '1.20', spend: '245.80', reach: '38100', actions: [{ action_type: 'purchase', value: '18' }] },
  camp_002: { campaign_id: 'camp_002', campaign_name: 'Remarketing — Carrinho Abandonado', impressions: '18700', clicks: '842', ctr: '4.50', cpc: '0.95', spend: '134.20', reach: '14200', actions: [{ action_type: 'purchase', value: '31' }] },
  camp_003: { campaign_id: 'camp_003', campaign_name: 'Awareness — Marca Cienty', impressions: '210000', clicks: '1050', ctr: '0.50', cpc: '4.80', spend: '312.60', reach: '195000', actions: [] },
  camp_004: { campaign_id: 'camp_004', campaign_name: 'Promoção de Verão', impressions: '31400', clicks: '220', ctr: '0.70', cpc: '5.60', spend: '98.40', reach: '28900', actions: [{ action_type: 'purchase', value: '3' }] },
};

const mockLog = [];

function mockGetCampaigns() {
  return MOCK_CAMPAIGNS.map(c => ({ ...c }));
}

function mockGetInsights() {
  return Object.values(MOCK_INSIGHTS);
}

function mockUpdateBudget(campaignId, dailyBudgetBRL) {
  const c = MOCK_CAMPAIGNS.find(x => x.id === campaignId);
  if (c) {
    c.daily_budget = String(Math.round(dailyBudgetBRL * 100));
    c.daily_budget_brl = dailyBudgetBRL.toFixed(2);
  }
  mockLog.push({ action: 'update_budget', campaignId, dailyBudgetBRL });
  return { success: true };
}

function mockSetStatus(campaignId, status) {
  const c = MOCK_CAMPAIGNS.find(x => x.id === campaignId);
  if (c) c.status = status;
  mockLog.push({ action: 'set_status', campaignId, status });
  return { success: true };
}

async function call(path, { method = 'GET', params = {}, body } = {}) {
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('access_token', token());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  const res = await fetch(url.toString(), {
    method,
    headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {},
    body: body ? new URLSearchParams(body).toString() : undefined,
  });

  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message} (code ${data.error.code})`);
  return data;
}

export async function getCampaigns() {
  if (isMock()) return mockGetCampaigns();
  const data = await call(`/${accountId()}/campaigns`, {
    params: {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget',
      limit: 50,
    },
  });
  return (data.data || []).map(c => ({
    ...c,
    daily_budget_brl: c.daily_budget ? (Number(c.daily_budget) / 100).toFixed(2) : null,
  }));
}

export async function getAccountInsights(datePreset = 'last_7d') {
  if (isMock()) return mockGetInsights();
  const data = await call(`/${accountId()}/insights`, {
    params: {
      fields: 'campaign_id,campaign_name,impressions,clicks,ctr,cpc,spend,reach,actions',
      date_preset: datePreset,
      level: 'campaign',
      limit: 50,
    },
  });
  return data.data || [];
}

export async function getCampaignsWithInsights(datePreset = 'last_7d') {
  const [campaigns, insights] = await Promise.all([
    getCampaigns(),
    getAccountInsights(datePreset),
  ]);
  const byId = Object.fromEntries(insights.map(i => [i.campaign_id, i]));
  return campaigns.map(c => ({ ...c, insights: byId[c.id] || null }));
}

export async function updateBudget(campaignId, dailyBudgetBRL) {
  if (isMock()) return mockUpdateBudget(campaignId, dailyBudgetBRL);
  return call(`/${campaignId}`, {
    method: 'POST',
    body: { daily_budget: Math.round(dailyBudgetBRL * 100) },
  });
}

export async function setStatus(campaignId, status) {
  if (isMock()) return mockSetStatus(campaignId, status);
  return call(`/${campaignId}`, {
    method: 'POST',
    body: { status },
  });
}

export async function uploadAdImage(imagePath) {
  if (isMock()) return { images: { mock: { hash: 'mock_hash_123' } } };
  const buf = await readFile(imagePath);
  const b64 = buf.toString('base64');
  const url = new URL(`${BASE}/${accountId()}/adimages`);
  url.searchParams.set('access_token', token());
  const form = new URLSearchParams();
  form.set('bytes', b64);
  form.set('name', `criativo_${Date.now()}.png`);
  const res = await fetch(url.toString(), { method: 'POST', body: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}
