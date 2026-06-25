// Preenche as tiras de "Criativos citados" (crefs) no relatório.
// Você marca no HTML onde quer a tira e quais anúncios entram:
//   <!--CREFS:Luiza 04=120241298134200068|Jessica=120242414482760068--><!--/CREFS-->
// e este script injeta, entre os marcadores, a miniatura real (data URI) + o
// link de preview do Facebook, lendo de data/snapshot-latest.json. Idempotente:
// roda quantas vezes quiser (regenera o conteúdo entre os marcadores).
//   node server/meta/inject-crefs.mjs [arquivo.html] [snapshot.json]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');

const file = process.argv[2] || 'web/relatorio-30d.html';
const snapPath = process.argv[3] || 'data/snapshot-latest.json';

const snap = JSON.parse(fs.readFileSync(path.join(ROOT, snapPath), 'utf8'));
const idx = {};
for (const c of snap.campaigns)
  for (const s of c.adsets)
    for (const a of s.ads)
      idx[a.id] = { thumb: a.creative?.thumb || null, preview: a.previewLink || null };

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function chip(label, id) {
  const d = idx[id] || {};
  if (!d.thumb && !d.preview) console.error(`  aviso: anúncio ${id} ("${label}") não achado no snapshot`);
  const initial = esc((label || '?').trim().charAt(0).toUpperCase());
  const thumb = d.thumb
    ? `<img class="cref-thumb" src="${d.thumb}" alt="Criativo ${esc(label)}">`
    : `<span class="cref-thumb">${initial}</span>`;
  const link = d.preview
    ? `<span class="cref-link">ver no Facebook ↗</span>`
    : `<span class="cref-link off">sem preview</span>`;
  const meta = `<span class="cref-meta"><span class="cref-name">${esc(label)}</span>${link}</span>`;
  return d.preview
    ? `<a class="cref" href="${esc(d.preview)}" target="_blank" rel="noopener">${thumb}${meta}</a>`
    : `<span class="cref">${thumb}${meta}</span>`;
}

let html = fs.readFileSync(path.join(ROOT, file), 'utf8');
let n = 0, chips = 0;
html = html.replace(/<!--CREFS:(.*?)-->[\s\S]*?<!--\/CREFS-->/g, (_m, spec) => {
  const items = spec.split('|').map((x) => x.trim()).filter(Boolean).map((pair) => {
    const i = pair.lastIndexOf('=');
    return { label: pair.slice(0, i).trim(), id: pair.slice(i + 1).trim() };
  });
  const rendered = items.map((it) => { chips++; return chip(it.label, it.id); }).join('\n          ');
  n++;
  return `<!--CREFS:${spec}-->\n        <div class="crefs">\n          <span class="crefs-label">Criativos citados</span>\n          ${rendered}\n        </div>\n        <!--/CREFS-->`;
});

fs.writeFileSync(path.join(ROOT, file), html);
console.error(`crefs: ${n} tira(s), ${chips} chip(s) injetado(s) em ${file}`);
