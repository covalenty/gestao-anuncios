// Cria uma campanha PAUSADA no Meta Ads a partir de um "campaign-spec" (JSON),
// renderizando o criativo de imagem estática com o image-forge e anexando-o.
//
//   node server/meta/create-campaign.mjs <spec.json>            # dry-run (não escreve)
//   node server/meta/create-campaign.mjs <spec.json> --confirm  # cria de fato (tudo PAUSED)
//
// Três travas de segurança: status PAUSED + dry-run padrão + flag --confirm.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, graphPost, uploadAdImage, uploadAdVideo, waitForVideoReady, getVideoThumbnail } from './client.mjs';
import { renderImage } from '../../src/render.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT_DIR = path.join(ROOT, 'output');

// Chaves de segmentação proibidas quando há categoria especial de anúncio.
const RESTRICTED_TARGETING = ['age_min', 'age_max', 'genders', 'flexible_spec', 'interests'];

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'campanha';
}
function brl(cents) { return `R$ ${(cents / 100).toFixed(2)}`; }
function dump(label, obj) { console.log(`\n── ${label} ──\n` + JSON.stringify(obj, null, 2)); }

// Monta os payloads (sem enviar). Retorna {campaign, adset, decisions} e mantém
// os criativos para render/upload posteriores.
function buildPayloads(spec, cfg) {
  const warnings = [];
  const objective = spec.objective || 'OUTCOME_LEADS';
  const special = spec.specialAdCategories || [];

  // --- Campanha ---
  const campaign = {
    name: spec.name,
    objective,
    status: 'PAUSED',
    special_ad_categories: special,
    buying_type: 'AUCTION',
    // Orçamento é no ad set (ABO). O Meta exige declarar explicitamente que os
    // conjuntos NÃO compartilham orçamento quando não há budget de campanha.
    is_adset_budget_sharing_enabled: false,
  };

  // --- Otimização / pixel ---
  let optimizationGoal = spec.optimizationGoal || 'OFFSITE_CONVERSIONS';
  let promotedObject;
  if (optimizationGoal === 'OFFSITE_CONVERSIONS') {
    if (cfg.pixelId) {
      promotedObject = { pixel_id: cfg.pixelId, custom_event_type: 'LEAD' };
    } else {
      optimizationGoal = 'LINK_CLICKS';
      warnings.push('META_PIXEL_ID vazio → otimizando por LINK_CLICKS (não por lead). Preencha o pixel para replicar as campanhas vencedoras.');
    }
  }

  // --- Targeting (objeto cru do Meta) ---
  let targeting = { ...(spec.targeting || {}) };
  if (special.length) {
    const removed = RESTRICTED_TARGETING.filter((k) => k in targeting);
    for (const k of removed) delete targeting[k];
    if (removed.length) warnings.push(`Categoria especial ${JSON.stringify(special)} → removi segmentação restrita: ${removed.join(', ')}.`);
  }
  // O Meta exige declarar explicitamente a sinalização de público Advantage.
  // Default 0 (desligado) se o spec não trouxer.
  if (!targeting.targeting_automation) targeting.targeting_automation = { advantage_audience: 0 };

  // --- Ad Set (ABO: orçamento aqui, em centavos) ---
  const adset = {
    name: spec.adsetName || `${spec.name} — conjunto`,
    status: 'PAUSED',
    daily_budget: spec.dailyBudget,
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizationGoal,
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    targeting,
    ...(promotedObject ? { promoted_object: promotedObject } : {}),
  };

  return { campaign, adset, warnings };
}

export async function createCampaignFromSpec(spec, { confirm = false, cfg = getConfig() } = {}) {
  console.log(`\n=== Criar campanha (${confirm ? 'CONFIRMADO — vai escrever' : 'DRY-RUN'}) ===`);
  console.log('Conta:', cfg.accountId);

  // Pré-condições
  if (!spec.name) throw new Error('spec.name é obrigatório.');
  if (!spec.dailyBudget) throw new Error('spec.dailyBudget (centavos) é obrigatório.');
  if (!spec.landingUrl) throw new Error('spec.landingUrl é obrigatório.');
  if (!cfg.pageId) throw new Error('META_PAGE_ID não definido. Rode server/meta/discover-ids.mjs e preencha o .env.');
  const creatives = spec.creatives || [];
  if (!creatives.length) throw new Error('spec.creatives[] vazio.');
  for (const c of creatives) {
    const type = c.type || (c.video || c.videoId ? 'video' : 'image');
    c.type = type; // normaliza
    if (type === 'image') continue;
    if (type === 'video') {
      if (!c.video && !c.videoId) {
        throw new Error(`Criativo de vídeo "${c.headline || c.title || ''}" precisa de "video" (caminho .mp4) ou "videoId".`);
      }
      if (c.video && !fs.existsSync(c.video)) {
        throw new Error(`Arquivo de vídeo não encontrado: ${c.video}`);
      }
      continue;
    }
    throw new Error(`Tipo de criativo desconhecido: "${type}" (use "image" ou "video").`);
  }

  const { campaign, adset, warnings } = buildPayloads(spec, cfg);

  // 1) Prepara os criativos. Imagens são renderizadas SEMPRE (local/seguro, serve de
  //    preview no dry-run). Vídeos não são renderizados — o .mp4 já é o ativo.
  console.log('\n[preparo] Gerando/validando criativo(s)…');
  const slug = slugify(spec.name);
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const rendered = [];
  for (let i = 0; i < creatives.length; i++) {
    const c = creatives[i];
    if (c.type === 'video') {
      console.log(`  🎬 vídeo: ${c.video || ('video_id ' + c.videoId)}`);
      rendered.push({ ...c });
      continue;
    }
    const out = path.join(OUTPUT_DIR, `${slug}-${i + 1}.png`);
    const r = await renderImage({
      template: c.template || 'ad-lead-benefit',
      vars: c.vars || {},
      size: c.size || 'meta-feed-4x5',
      scale: c.scale || 2,
      format: 'png',
      output: out,
    });
    console.log(`  🖼️  ${r.output} (${r.width}x${r.height}, ${(r.bytes / 1024).toFixed(0)} KB)`);
    rendered.push({ ...c, imagePath: r.output });
  }

  // 2) Mostra os payloads.
  console.log(`\n[orçamento] daily_budget = ${adset.daily_budget} centavos = ${brl(adset.daily_budget)}/dia`);
  dump('Campaign (POST /campaigns)', campaign);
  dump('Ad Set (POST /adsets)', adset);
  const creativePayloads = rendered.map((c, i) => {
    const oss = c.type === 'video'
      ? {
          page_id: cfg.pageId,
          video_data: {
            video_id: c.videoId || '<gerado no upload>',
            image_url: '<miniatura automática do vídeo>',
            message: c.message || '',
            title: c.title || c.headline || '',
            call_to_action: { type: c.cta || 'LEARN_MORE', value: { link: spec.landingUrl } },
          },
        }
      : {
          page_id: cfg.pageId,
          link_data: {
            image_hash: '<gerado no upload>',
            link: spec.landingUrl,
            message: c.message || '',
            name: c.headline || '',
            call_to_action: { type: c.cta || 'LEARN_MORE', value: { link: spec.landingUrl } },
          },
        };
    const payload = {
      name: c.headline || c.title || `${spec.name} — criativo ${i + 1}`,
      object_story_spec: oss,
    };
    dump(`Ad Creative #${i + 1} [${c.type}] (POST /adcreatives)`, payload);
    return payload;
  });

  if (warnings.length) {
    console.log('\n⚠ Avisos:');
    warnings.forEach((w) => console.log('  • ' + w));
  }

  // Resultado estruturado (consumido pela UI/servidor além do CLI).
  const previews = rendered.map((c) => ({ type: c.type, imagePath: c.imagePath || null, video: c.video || null }));
  const result = { payloads: { campaign, adset, creatives: creativePayloads }, previews, warnings, budgetReais: adset.daily_budget / 100 };

  // 3) Dry-run para aqui.
  if (!confirm) {
    console.log('\nDRY-RUN — nada foi enviado ao Meta. Rode de novo com --confirm para criar (tudo PAUSED).');
    return { dryRun: true, ...result };
  }

  // 4) Escrita real, em sequência. Sem transação: registramos o que foi criado.
  const created = {};
  try {
    console.log('\n[1/N] Criando campanha…');
    const camp = await graphPost(`${cfg.accountId}/campaigns`, campaign, cfg);
    created.campaignId = camp.id;
    console.log('  campaign_id =', camp.id);

    console.log('[2/N] Criando ad set…');
    const as = await graphPost(`${cfg.accountId}/adsets`, { ...adset, campaign_id: camp.id }, cfg);
    created.adsetId = as.id;
    console.log('  adset_id =', as.id);

    const adIds = [];
    for (let i = 0; i < rendered.length; i++) {
      const c = rendered[i];
      let objectStorySpec;

      if (c.type === 'video') {
        let videoId = c.videoId;
        if (!videoId) {
          console.log(`[3.${i + 1}] Subindo vídeo…`);
          videoId = await uploadAdVideo(c.video, cfg);
          console.log('  video_id =', videoId);
          console.log(`[3.${i + 1}] Aguardando processamento do vídeo…`);
          await waitForVideoReady(videoId, cfg);
        }
        const thumb = c.thumbnailUrl || (await getVideoThumbnail(videoId, cfg));
        if (!thumb) throw new Error('vídeo sem miniatura disponível — tente novamente em instantes');
        objectStorySpec = {
          page_id: cfg.pageId,
          video_data: {
            video_id: videoId,
            image_url: thumb,
            message: c.message || '',
            title: c.title || c.headline || '',
            call_to_action: { type: c.cta || 'LEARN_MORE', value: { link: spec.landingUrl } },
          },
        };
      } else {
        console.log(`[3.${i + 1}] Subindo imagem…`);
        const imageHash = await uploadAdImage(c.imagePath, cfg);
        console.log('  image_hash =', imageHash);
        objectStorySpec = {
          page_id: cfg.pageId,
          link_data: {
            image_hash: imageHash,
            link: spec.landingUrl,
            message: c.message || '',
            name: c.headline || '',
            call_to_action: { type: c.cta || 'LEARN_MORE', value: { link: spec.landingUrl } },
          },
        };
      }

      console.log(`[4.${i + 1}] Criando criativo [${c.type}]…`);
      const cr = await graphPost(`${cfg.accountId}/adcreatives`, {
        name: c.headline || c.title || `${spec.name} — criativo ${i + 1}`,
        object_story_spec: objectStorySpec,
      }, cfg);
      console.log('  creative_id =', cr.id);

      console.log(`[5.${i + 1}] Criando anúncio (PAUSED)…`);
      const ad = await graphPost(`${cfg.accountId}/ads`, {
        name: c.headline || c.title || `${spec.name} — anúncio ${i + 1}`,
        adset_id: as.id,
        creative: { creative_id: cr.id },
        status: 'PAUSED',
      }, cfg);
      console.log('  ad_id =', ad.id);
      adIds.push(ad.id);
    }
    created.adIds = adIds;

    console.log('\n✅ Pronto. Campanha criada e PAUSADA.');
    console.log(`   campaign_id=${created.campaignId}  adset_id=${created.adsetId}  ads=${adIds.join(', ')}`);
    console.log('   Revise no Ads Manager e despause manualmente quando aprovar.');
    return { dryRun: false, created, ...result };
  } catch (e) {
    console.error('\n✗ Falhou no meio da sequência:', e.message);
    if (e.meta) console.error('  Meta:', JSON.stringify(e.meta));
    // Dicas para erros conhecidos.
    if (e.meta?.error_subcode === 1885183) {
      console.error('  → O APP do token está em modo de desenvolvimento. Coloque-o em modo Público/Live no painel do Meta (developers.facebook.com) para criar criativos.');
    }
    if (Object.keys(created).length) {
      console.error('  Já foi criado (pode precisar de limpeza manual):', JSON.stringify(created));
    }
    throw e;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  const specPath = args.find((a) => !a.startsWith('--'));
  if (!specPath) {
    console.error('Uso: node server/meta/create-campaign.mjs <spec.json> [--confirm]');
    process.exit(1);
  }
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  await createCampaignFromSpec(spec, { confirm });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('Erro:', e.message);
    process.exit(1);
  });
}
