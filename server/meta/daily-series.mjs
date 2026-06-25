// Série diária de leads por campanha (time_increment=1).
//   node server/meta/daily-series.mjs [date_preset]
// Grava data/daily-<preset>.json com { campanha: { 'YYYY-MM-DD': leads } }.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, graphAll } from './client.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

const LEAD_TYPES = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];

function leadCount(actions) {
  if (!actions) return 0;
  for (const t of LEAD_TYPES) {
    const hit = actions.find((a) => a.action_type === t);
    if (hit) return Number(hit.value);
  }
  return 0;
}

async function main() {
  const preset = process.argv[2] || 'this_month';
  const cfg = getConfig();
  console.error(`Série diária ${cfg.accountId} (${preset})...`);

  const rows = await graphAll(
    cfg.accountId + '/insights',
    {
      level: 'campaign',
      date_preset: preset,
      time_increment: 1,
      fields: 'campaign_id,campaign_name,spend,actions',
    },
    cfg,
    2000
  );

  // Estrutura: { campaignName: { id, status?, days: {date: {leads, spend}} } }
  const byCamp = {};
  const allDates = new Set();
  for (const r of rows) {
    const name = r.campaign_name;
    const date = r.date_start;
    allDates.add(date);
    byCamp[name] ??= { id: r.campaign_id, days: {} };
    byCamp[name].days[date] = { leads: leadCount(r.actions), spend: Number(r.spend) || 0 };
  }

  const out = {
    preset,
    dates: [...allDates].sort(),
    campaigns: byCamp,
  };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = path.join(DATA_DIR, `daily-${preset}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.error(`OK -> ${file}`);
  console.log(JSON.stringify(out));
}

main().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
