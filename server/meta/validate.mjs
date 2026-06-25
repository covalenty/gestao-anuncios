// Valida o token do Meta Ads e mostra o que ele permite acessar.
//   node server/meta/validate.mjs
//
// Etapas:
//   1. debug_token  -> escopos, validade, tipo de token, app
//   2. /me/adaccounts -> contas que o token enxerga
//   3. /act_<id>/campaigns -> campanhas ativas (amostra)
import { getConfig, graph, graphAll, redactToken } from './client.mjs';

function fmtDate(unix) {
  if (!unix || unix === 0) return 'nunca expira';
  return new Date(unix * 1000).toISOString().replace('T', ' ').slice(0, 16);
}

async function main() {
  const cfg = getConfig();
  console.log('— Validação do token Meta Ads —');
  console.log('Token:', redactToken(cfg.token));
  console.log('Graph API:', cfg.version);
  console.log('');

  // 1. debug_token. Inspeciona o próprio token usando ele mesmo como inspetor.
  console.log('[1] Inspecionando o token (debug_token)...');
  let debug;
  try {
    const r = await graph('debug_token', { input_token: cfg.token }, cfg);
    debug = r.data || {};
    console.log('  • Válido:', debug.is_valid ? 'sim' : 'NÃO');
    console.log('  • App ID:', debug.app_id, debug.application ? `(${debug.application})` : '');
    console.log('  • Tipo:', debug.type || '(desconhecido)');
    console.log('  • Expira em:', fmtDate(debug.expires_at));
    if (debug.data_access_expires_at)
      console.log('  • Acesso a dados até:', fmtDate(debug.data_access_expires_at));
    const scopes = debug.scopes || [];
    console.log('  • Escopos:', scopes.length ? scopes.join(', ') : '(nenhum)');
    const adsRead = scopes.includes('ads_read') || scopes.includes('ads_management');
    console.log(
      adsRead
        ? '  ✓ Tem permissão de leitura de anúncios (ads_read/ads_management).'
        : '  ✗ FALTA ads_read — sem isso não dá para ler campanhas/insights.'
    );
  } catch (e) {
    console.log('  ✗ Falhou:', e.message);
    if (e.meta?.code) console.log('    código:', e.meta.code, e.meta.error_subcode || '');
  }
  console.log('');

  // 2. Contas de anúncio visíveis.
  console.log('[2] Listando contas de anúncio (/me/adaccounts)...');
  let accounts = [];
  try {
    accounts = await graphAll(
      'me/adaccounts',
      { fields: 'id,name,account_status,currency,timezone_name,amount_spent' },
      cfg
    );
    if (!accounts.length) {
      console.log('  (nenhuma conta visível para este token)');
    }
    for (const a of accounts) {
      const status = a.account_status === 1 ? 'ATIVA' : `status=${a.account_status}`;
      console.log(`  • ${a.id}  ${a.name}  [${status}, ${a.currency}, ${a.timezone_name}]`);
    }
  } catch (e) {
    console.log('  ✗ Falhou:', e.message);
  }
  console.log('');

  // 3. Campanhas de uma conta (a fixada no .env ou a primeira encontrada).
  const targetId = cfg.accountId || accounts[0]?.id;
  if (!targetId) {
    console.log('[3] Sem conta para inspecionar campanhas. Defina META_AD_ACCOUNT_ID no .env.');
    return;
  }
  console.log(`[3] Campanhas de ${targetId} (amostra)...`);
  try {
    const campaigns = await graphAll(
      `${targetId}/campaigns`,
      {
        fields:
          'id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,start_time',
      },
      cfg,
      50
    );
    console.log(`  Total: ${campaigns.length} campanha(s).`);
    for (const c of campaigns.slice(0, 15)) {
      const budget = c.daily_budget
        ? `R$${(c.daily_budget / 100).toFixed(2)}/dia`
        : c.lifetime_budget
        ? `R$${(c.lifetime_budget / 100).toFixed(2)} total`
        : 'orçamento no adset';
      console.log(`  • [${c.effective_status}] ${c.name}`);
      console.log(`      objetivo=${c.objective}  lance=${c.bid_strategy || '-'}  ${budget}`);
    }
    if (campaigns.length > 15) console.log(`  … e mais ${campaigns.length - 15}.`);
  } catch (e) {
    console.log('  ✗ Falhou:', e.message);
  }
  console.log('');
  console.log('Pronto. Se o passo [1] e [2] funcionaram, o token serve para os insights.');
}

main().catch((e) => {
  console.error('Erro fatal:', e.message);
  process.exit(1);
});
