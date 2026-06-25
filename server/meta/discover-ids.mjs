// Descobre os IDs necessários para criar campanhas: Página do Facebook e Pixel.
//   node server/meta/discover-ids.mjs
// Apenas LEITURA. Imprime um bloco pronto para colar em server/.env.
import { getConfig, graph, graphAll, redactToken } from './client.mjs';

async function main() {
  const cfg = getConfig();
  console.log('— Descoberta de IDs (Página + Pixel) —');
  console.log('Conta:', cfg.accountId, '| Token:', redactToken(cfg.token), '\n');

  // --- Páginas ---
  console.log('[1] Páginas do Facebook...');
  let pages = [];
  try {
    pages = await graphAll(`${cfg.accountId}/promote_pages`, { fields: 'id,name' }, cfg);
  } catch (e) {
    console.log('  (promote_pages falhou: ' + e.message + ') — tentando /me/accounts');
  }
  if (!pages.length) {
    try {
      pages = await graphAll('me/accounts', { fields: 'id,name' }, cfg);
    } catch (e) {
      console.log('  (me/accounts falhou: ' + e.message + ')');
    }
  }
  // Fallback robusto: extrai o page_id dos criativos JÁ existentes na conta.
  // (Tokens de System User costumam não listar páginas, mas os anúncios ativos
  //  carregam o page_id no object_story_spec.)
  let igActor;
  if (!pages.length) {
    console.log('  (sem página via API direta — derivando dos criativos existentes…)');
    try {
      const crs = await graphAll(`${cfg.accountId}/adcreatives`,
        { fields: 'object_story_spec,effective_object_story_id' }, cfg, 200);
      const tally = new Map();
      for (const c of crs) {
        const pid = c.object_story_spec?.page_id || (c.effective_object_story_id || '').split('_')[0];
        if (pid) tally.set(pid, (tally.get(pid) || 0) + 1);
        igActor = igActor || c.object_story_spec?.instagram_actor_id || c.object_story_spec?.instagram_user_id;
      }
      // ordena por nº de usos (a principal aparece mais)
      pages = [...tally.entries()].sort((a, b) => b[1] - a[1])
        .map(([id, n]) => ({ id, name: `(em ${n} criativos)` }));
    } catch (e) {
      console.log('  ✗ Não consegui derivar a página dos criativos:', e.message);
    }
  }
  if (pages.length) {
    for (const p of pages) console.log(`  • ${p.id}  ${p.name || ''}`);
    if (igActor) console.log(`  (instagram_actor_id detectado: ${igActor})`);
  } else {
    console.log('  (nenhuma página encontrada)');
  }
  console.log('');

  // --- Pixels ---
  console.log('[2] Pixels de conversão...');
  let pixels = [];
  try {
    pixels = await graphAll(`${cfg.accountId}/adspixels`, { fields: 'id,name,last_fired_time' }, cfg);
  } catch (e) {
    console.log('  ✗ Não consegui listar pixels:', e.message);
  }
  if (pixels.length) {
    for (const px of pixels) {
      const fired = px.last_fired_time ? `último evento: ${px.last_fired_time.slice(0, 10)}` : 'sem eventos recentes';
      console.log(`  • ${px.id}  ${px.name || ''}  (${fired})`);
    }
  } else {
    console.log('  (nenhum pixel visível)');
  }
  console.log('');

  // --- Bloco para o .env ---
  console.log('— Cole em server/.env (ajuste se houver mais de uma opção) —');
  console.log(`META_PAGE_ID=${pages[0]?.id || ''}`);
  console.log(`META_PIXEL_ID=${pixels[0]?.id || ''}`);
}

main().catch((e) => {
  console.error('Erro:', e.message);
  process.exit(1);
});
