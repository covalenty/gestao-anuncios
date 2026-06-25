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
  // IDs opcionais usados só na criação de campanhas (escrita).
  const pageId = (process.env.META_PAGE_ID || '').trim();
  const pixelId = (process.env.META_PIXEL_ID || '').trim();
  return { token, version, accountId, pageId, pixelId };
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

// POST genérico à Graph/Marketing API (escrita). Mesma forma de erro do graph().
// Objetos aninhados (targeting, object_story_spec, promoted_object, creative…) devem
// vir como objeto em params — são serializados para string JSON no corpo urlencoded.
export async function graphPost(pathname, params, { token, version }) {
  const url = new URL(`https://graph.facebook.com/${version}/${pathname}`);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    form.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  form.set('access_token', token);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const err = body.error || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.meta = err;
    e.status = res.status;
    throw e;
  }
  return body; // normalmente { id: "..." } ou { images: { <name>: { hash } } }
}

// Sobe um PNG/JPG para /act_<id>/adimages usando o campo base64 `bytes`
// (evita multipart). Retorna o image_hash para usar no object_story_spec.
export async function uploadAdImage(imgPath, cfg) {
  const bytes = fs.readFileSync(imgPath).toString('base64');
  const r = await graphPost(`${cfg.accountId}/adimages`, { bytes }, cfg);
  const first = Object.values(r.images || {})[0];
  if (!first?.hash) throw new Error('adimages não retornou hash');
  return first.hash;
}

// Sobe um vídeo para /act_<id>/advideos (multipart via FormData/Blob nativos).
// Bom para arquivos pequenos/médios; para >~50MB o ideal seria upload em chunks.
// Retorna o video_id.
export async function uploadAdVideo(videoPath, cfg) {
  const buf = fs.readFileSync(videoPath);
  const form = new FormData();
  form.append('access_token', cfg.token);
  form.append('source', new Blob([buf], { type: 'video/mp4' }), path.basename(videoPath));
  const res = await fetch(`https://graph.facebook.com/${cfg.version}/${cfg.accountId}/advideos`, {
    method: 'POST',
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    const err = body.error || {};
    const e = new Error(err.message || `HTTP ${res.status}`);
    e.meta = err;
    e.status = res.status;
    throw e;
  }
  return body.id;
}

// Aguarda o vídeo terminar de processar (status video_status === 'ready').
export async function waitForVideoReady(videoId, cfg, { tries = 40, intervalMs = 3000 } = {}) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));
    const st = await graph(videoId, { fields: 'status' }, cfg);
    const s = st.status?.video_status || st.status;
    if (s === 'ready') return true;
    if (s === 'error') throw new Error('vídeo falhou no processamento');
  }
  throw new Error('timeout aguardando o processamento do vídeo');
}

// Miniatura preferida do vídeo (uri) para usar como image_url no video_data.
export async function getVideoThumbnail(videoId, cfg) {
  const th = await graph(`${videoId}/thumbnails`, { fields: 'uri,is_preferred' }, cfg);
  const t = (th.data || []).find((x) => x.is_preferred) || (th.data || [])[0];
  return t?.uri || null;
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
