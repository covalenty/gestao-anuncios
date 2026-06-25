// Cliente mínimo da Graph API / Marketing API do Meta.
// Sem dependências externas — usa o fetch nativo do Node 18+.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carrega server/.env (parser simples KEY=VALUE) sem dependências.
export function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function getConfig() {
  loadEnv();
  const token = process.env.META_ACCESS_TOKEN;
  const version = process.env.META_API_VERSION || 'v23.0';
  // Normaliza: aceita "act_123" ou só "123" e sempre devolve com o prefixo act_.
  let accountId = (process.env.META_AD_ACCOUNT_ID || '').trim();
  if (accountId && !accountId.startsWith('act_')) accountId = `act_${accountId}`;
  if (!token) {
    throw new Error(
      'META_ACCESS_TOKEN não definido. Copie server/.env.example para server/.env e preencha o token.'
    );
  }
  return { token, version, accountId };
}

// Chamada GET genérica à Graph API. params é um objeto simples.
export async function graph(pathname, params, { token, version }) {
  const url = new URL(`https://graph.facebook.com/${version}/${pathname}`);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  }
  url.searchParams.set('access_token', token);

  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const err = body.error || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.meta = err;
    e.status = res.status;
    throw e;
  }
  return body;
}

// Segue paginação cursor-based e acumula todos os data[].
export async function graphAll(pathname, params, cfg, max = 500) {
  const out = [];
  let after;
  do {
    const page = await graph(pathname, { ...params, after, limit: 100 }, cfg);
    out.push(...(page.data || []));
    after = page.paging?.cursors?.after;
    if (!page.paging?.next) after = undefined;
  } while (after && out.length < max);
  return out;
}

// Redação de token para nunca logar o segredo inteiro.
export function redactToken(t) {
  if (!t) return '(vazio)';
  if (t.length <= 12) return '***';
  return `${t.slice(0, 6)}…${t.slice(-4)} (${t.length} chars)`;
}
