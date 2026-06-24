import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import puppeteer from "puppeteer";
import sharp from "sharp";
import Handlebars from "handlebars";
import { resolveSize } from "./presets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export const TEMPLATES_DIR = path.join(ROOT, "templates");
export const DEFAULT_OUTPUT_DIR = path.join(ROOT, "output");

const IMAGE_VAR_RE = /\.(png|jpe?g|webp|avif|gif|svg)$/i;
const VALID_FORMATS = new Set(["png", "jpeg", "webp", "avif"]);

// ---- Handlebars helpers -----------------------------------------------------

Handlebars.registerHelper("upper", (s) => String(s ?? "").toUpperCase());
Handlebars.registerHelper("lower", (s) => String(s ?? "").toLowerCase());
Handlebars.registerHelper("default", (value, fallback) =>
  value === undefined || value === null || value === "" ? fallback : value
);
Handlebars.registerHelper("json", (ctx) => new Handlebars.SafeString(JSON.stringify(ctx)));

// ---- Template loading -------------------------------------------------------

export function templateDir(template, templatesDir = TEMPLATES_DIR) {
  return path.join(templatesDir, template);
}

export async function loadConfig(template, templatesDir = TEMPLATES_DIR) {
  const dir = templateDir(template, templatesDir);
  if (!existsSync(dir)) {
    throw new Error(`Template "${template}" not found at ${dir}`);
  }
  const configPath = path.join(dir, "config.json");
  let config = {};
  if (existsSync(configPath)) {
    config = JSON.parse(await readFile(configPath, "utf8"));
  }
  return { dir, config };
}

/**
 * Resolve variable values that look like local image paths into absolute
 * file:// URLs, relative to the template folder. Leaves http(s)/data/file
 * URLs and absolute paths untouched.
 */
function resolveImageVars(vars, dir) {
  const out = {};
  for (const [key, value] of Object.entries(vars)) {
    if (
      typeof value === "string" &&
      IMAGE_VAR_RE.test(value) &&
      !/^(https?:|data:|file:)/i.test(value)
    ) {
      const abs = path.isAbsolute(value) ? value : path.resolve(dir, value);
      out[key] = pathToFileURL(abs).href;
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Inject a <base href> so relative links (styles.css, fonts, images) resolve. */
function injectBase(html, baseHref) {
  const baseTag = `<base href="${baseHref}">`;
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${baseTag}</head>`);
  }
  return `<head>${baseTag}</head>\n${html}`;
}

/**
 * Compile a template's HTML with the given variables and return a full HTML
 * document string ready to load into the browser.
 */
export async function buildHtml(template, vars = {}, templatesDir = TEMPLATES_DIR, opts = {}) {
  const dir = templateDir(template, templatesDir);
  const htmlPath = path.join(dir, "template.html");
  if (!existsSync(htmlPath)) {
    throw new Error(`Template "${template}" has no template.html (${htmlPath})`);
  }
  const source = await readFile(htmlPath, "utf8");
  const compiled = Handlebars.compile(source, { noEscape: false });
  // For an http preview, resolve image vars against the server root so the
  // browser doesn't try to load file:// assets from an http:// page.
  const resolvedVars = opts.baseHref ? { ...vars } : resolveImageVars(vars, dir);
  const rendered = compiled(resolvedVars);
  const baseHref = opts.baseHref || pathToFileURL(dir + path.sep).href;
  return injectBase(rendered, baseHref);
}

// ---- Rendering --------------------------------------------------------------

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

/**
 * Render a template to an image file.
 *
 * @param {object} opts
 * @param {string} opts.template   template folder name under templates/
 * @param {object} [opts.vars]     variables (merged over config defaults)
 * @param {string|object} [opts.size]   preset name, "WxH", or { width, height }
 * @param {string} [opts.format]   png | jpeg | webp | avif
 * @param {number} [opts.scale]    device pixel ratio (2 = retina)
 * @param {number} [opts.quality]  1-100, for jpeg/webp/avif
 * @param {string} [opts.output]   output file path
 * @param {string} [opts.templatesDir]
 * @param {import('puppeteer').Browser} [opts.browser]  reuse an existing browser
 * @returns {Promise<{output:string,width:number,height:number,format:string,bytes:number}>}
 */
export async function renderImage(opts) {
  const {
    template,
    vars = {},
    templatesDir = TEMPLATES_DIR,
    browser: externalBrowser,
  } = opts;

  const { dir, config } = await loadConfig(template, templatesDir);

  const mergedVars = { ...(config.defaults || {}), ...vars };
  const size = resolveSize(opts.size || config.size || "ig-post");
  const format = (opts.format || config.format || "png").toLowerCase();
  const scale = Number(opts.scale || config.scale || 1);
  const quality = opts.quality != null ? Number(opts.quality) : config.quality;

  if (!VALID_FORMATS.has(format)) {
    throw new Error(`Unsupported format "${format}". Use png, jpeg, webp, or avif.`);
  }

  const output =
    opts.output ||
    path.join(DEFAULT_OUTPUT_DIR, `${template}.${format === "jpeg" ? "jpg" : format}`);

  const html = await buildHtml(template, mergedVars, templatesDir);

  const browser = externalBrowser || (await launchBrowser());
  let pngBuffer;
  try {
    const page = await browser.newPage();
    await page.setViewport({
      width: size.width,
      height: size.height,
      deviceScaleFactor: scale,
    });
    const baseHref = pathToFileURL(dir + path.sep).href;
    await page.goto(baseHref, { waitUntil: "load" }).catch(() => {});
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });
    await new Promise((r) => setTimeout(r, 150));
    pngBuffer = await page.screenshot({ type: "png", fullPage: false });
    await page.close();
  } finally {
    if (!externalBrowser) await browser.close();
  }

  // Convert via sharp for non-png formats; png is written as captured.
  let outBuffer = pngBuffer;
  if (format !== "png") {
    let pipeline = sharp(pngBuffer);
    const q = quality != null ? { quality: Number(quality) } : {};
    if (format === "jpeg") pipeline = pipeline.jpeg(q);
    else if (format === "webp") pipeline = pipeline.webp(q);
    else if (format === "avif") pipeline = pipeline.avif(q);
    outBuffer = await pipeline.toBuffer();
  }

  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, outBuffer);

  return {
    output,
    width: size.width * scale,
    height: size.height * scale,
    format,
    bytes: outBuffer.length,
  };
}

export { launchBrowser };
