import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';

const OUT = 'C:/Users/Luiza/Documents/Projetos/_video_assets';
mkdirSync(OUT, { recursive: true });

const W = 1080, H = 1908;

// Cienty monochrome logo. color => single fill.
const logo = (color) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1500 525.36" color="${color}" fill="currentColor" aria-label="Cienty" style="display:block;width:100%;height:auto">
  <path fill="currentColor" d="M225.37,373.42c-19.38,17.02-44.54,26.4-70.82,26.4-59.53,0-104.42-44.63-104.42-103.83s43.92-103.24,104.42-103.24c26.5,0,52.29,9.6,70.76,26.35l29.88-33.37c-26.11-24.83-63.23-39.08-101.82-39.08C67.23,146.65,2.27,210.85,2.27,295.99s64.96,149.91,151.09,149.91c39,0,76.33-14.24,102.41-39.07l-30.41-33.41Z"/>
  <rect fill="currentColor" x="310.18" y="153.71" width="47.85" height="285.12"/>
  <path fill="currentColor" d="M562.54,146.65c-83.8,0-144.62,62.56-144.62,148.75s60.82,150.51,144.62,150.51c54.13,0,102.98-27.86,127.51-72.71l-41.2-19.21c-17.44,28.7-49.27,45.84-85.13,45.84-52.53,0-89.34-31.58-97.23-82.86h235.42l.5-4.53c.63-5.65,1.21-11.62,1.21-17.04,0-87.58-58.02-148.75-141.08-148.75ZM467.19,274.41c8.82-51.26,44.1-81.66,95.35-81.66s85.72,31.85,92.61,81.66h-187.96Z"/>
  <path fill="currentColor" d="M899.29,146.65c-30.66,0-68.9,13.4-90.29,42.41v-35.35h-47.85v285.12h47.85v-157.49c1.15-64.46,45.57-87.43,86.76-87.43s72.63,33.5,72.63,81.46v163.46h47.85v-165.23c0-77.12-45.91-126.96-116.95-126.96Z"/>
  <polygon fill="currentColor" points="1124.35 196.27 1187.34 196.27 1187.34 153.71 1124.35 153.71 1124.35 80.88 1077.08 80.88 1077.08 438.84 1207.22 438.84 1207.22 396.31 1124.35 396.31 1124.35 196.27"/>
  <polygon fill="currentColor" points="1446.06 153.71 1354.67 370.52 1264.42 153.71 1212.77 153.71 1328.53 430.81 1289.74 524.56 1341.15 524.56 1497.73 153.71 1446.06 153.71"/>
  <path fill="currentColor" d="M276,117.01h116.21V.8h-116.21v116.21ZM294.15,18.95h79.9v79.9h-79.9V18.95Z"/>
</svg>`;

const pin = (color) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="74" height="74" fill="${color}" style="display:block">
  <path d="M12 2C7.8 2 4.4 5.4 4.4 9.6c0 5.4 7 11.8 7.3 12.1.2.2.5.2.7 0 .3-.3 7.3-6.7 7.3-12.1C19.6 5.4 16.2 2 12 2zm0 10.4a2.8 2.8 0 1 1 0-5.6 2.8 2.8 0 0 1 0 5.6z"/>
</svg>`;

const page_open = (body, transparent) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,400;0,600;0,700;0,800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px;font-family:'Open Sans',sans-serif;${transparent?'background:transparent':''}}
.stage{position:relative;width:${W}px;height:${H}px;overflow:hidden}
</style></head><body><div class="stage">${body}</div></body></html>`;

// ---- full-screen magenta card ----
const card = (html, fs) => page_open(`
  <div style="position:absolute;inset:0;background:#dc36c0;display:flex;align-items:center;justify-content:center;padding:0 110px">
    <div style="color:#fff;font-weight:800;font-size:${fs}px;line-height:1.18;letter-spacing:-0.01em;text-align:center">${html}</div>
  </div>`, false);

// ---- end card: white bg, black logo centered, decorative squares ----
const endcard = page_open(`
  <div style="position:absolute;inset:0;background:#ffffff"></div>
  <!-- decorative Cienty squares, asymmetric, bottom-right -->
  <div style="position:absolute;right:150px;bottom:300px;width:150px;height:150px;background:#dc36c0"></div>
  <div style="position:absolute;right:90px;bottom:230px;width:90px;height:90px;background:#ffb92a"></div>
  <!-- decorative square top-left accent -->
  <div style="position:absolute;left:130px;top:430px;width:110px;height:110px;background:#dc36c0"></div>
  <div style="position:absolute;left:90px;top:380px;width:64px;height:64px;background:#ffb92a"></div>
  <div style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:640px">${logo('#000000')}</div>
`, false);

// ---- opening logo overlay: opaque magenta band covers old logo, white cienty centered ----
const openlogo = page_open(`
  <div style="position:absolute;left:0;top:1285px;width:1080px;height:240px;background:#dc36c0;
       display:flex;align-items:center;justify-content:center">
    <div style="width:520px">${logo('#ffffff')}</div>
    <div style="position:absolute;right:0;top:0;width:46px;height:46px;background:#ffb92a"></div>
  </div>
`, true);

// ---- lower third overlay: NO box, magenta text, only name + role ----
const tstroke = '-webkit-text-stroke:1.2px rgba(0,0,0,.55);paint-order:stroke fill;text-shadow:0 2px 10px rgba(0,0,0,.65),0 0 2px rgba(0,0,0,.5)';
const lowerthird = page_open(`
  <div style="position:absolute;left:70px;top:1045px">
    <div style="color:#dc36c0;font-weight:800;font-size:50px;letter-spacing:-0.01em;line-height:1.1;${tstroke}">J&eacute;ssica &ndash; Drogaria Leg&iacute;tima</div>
    <div style="height:7px;background:#dc36c0;width:360px;margin:14px 0 12px;box-shadow:0 2px 8px rgba(0,0,0,.5)"></div>
    <div style="color:#dc36c0;font-weight:700;font-size:32px;line-height:1.1;${tstroke}">Gerente</div>
  </div>
`, true);

// ---- on-footage caption replacement: "A Cienty acelerou todo esse trabalho" ----
const capCienty = page_open(`
  <div style="position:absolute;left:60px;top:965px;color:#fff;font-weight:800;font-size:76px;
       line-height:1.18;letter-spacing:-0.01em;text-shadow:0 3px 14px rgba(0,0,0,.8),0 0 3px rgba(0,0,0,.6)">
    A Cienty acelerou<br>todo esse trabalho
  </div>
`, true);

// ---- feather masks (black bg, white blurred rect) for soft-edged region blur ----
const maskHtml = (x,y,w,h,b) => `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>*{margin:0;padding:0}html,body{width:${W}px;height:${H}px;background:#000;overflow:hidden}</style></head>
<body><div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:#fff;border-radius:12px;filter:blur(${b}px)"></div></body></html>`;

const jobs = [
  { name: 'card1', html: card('O fim das<br>cota&ccedil;&otilde;es manuais', 98), transparent: false },
  { name: 'card2', html: card('Como a Cienty<br>mudou a rotina da<br>Drogaria Leg&iacute;tima', 90), transparent: false },
  { name: 'card3', html: card('Como a plataforma<br>se encaixa no<br>dia a dia?', 92), transparent: false },
  { name: 'card4', html: card('E o melhor:<br>tudo isso, de<br>forma 100% gratuita.', 90), transparent: false },
  { name: 'endcard', html: endcard, transparent: false },
  { name: 'overlay_logo', html: openlogo, transparent: true },
  { name: 'overlay_lt', html: lowerthird, transparent: true },
  { name: 'overlay_cap', html: capCienty, transparent: true },
  { name: 'mask_lt', html: maskHtml(0, 985, 1062, 388, 28), transparent: false },
  { name: 'mask_cap', html: maskHtml(8, 912, 984, 352, 28), transparent: false },
];

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
for (const j of jobs) {
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
  await page.goto('data:text/html;charset=utf-8,' + encodeURIComponent(j.html), { waitUntil: 'networkidle0' });
  await page.evaluate(async () => { await document.fonts.ready; });
  await new Promise(r => setTimeout(r, 250));
  await page.screenshot({ path: `${OUT}/${j.name}.png`, omitBackground: j.transparent });
  console.log('rendered', j.name);
  await page.close();
}
await browser.close();
console.log('DONE');
