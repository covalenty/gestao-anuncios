#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderImage, loadConfig, TEMPLATES_DIR } from "./render.js";
import { startPreview } from "./preview.js";
import { formatPresets, SIZE_PRESETS } from "./presets.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ---- tiny arg parser --------------------------------------------------------
// Supports: positionals, --flag value, --flag=value, -o value, repeatable --var.
function parseArgs(argv) {
  const positionals = [];
  const flags = {};
  const vars = {};

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (arg === "-o") arg = "--output";

    if (arg.startsWith("--")) {
      let key = arg.slice(2);
      let value;
      const eq = key.indexOf("=");
      if (eq !== -1) {
        value = key.slice(eq + 1);
        key = key.slice(0, eq);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        value = argv[++i];
      } else {
        value = true; // boolean flag
      }

      if (key === "var") {
        const sep = String(value).indexOf("=");
        if (sep === -1) throw new Error(`--var expects key=value, got "${value}"`);
        vars[value.slice(0, sep)] = value.slice(sep + 1);
      } else {
        flags[key] = value;
      }
    } else {
      positionals.push(arg);
    }
  }

  return { positionals, flags, vars };
}

function humanBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function listTemplates() {
  if (!existsSync(TEMPLATES_DIR)) return [];
  const entries = await readdir(TEMPLATES_DIR, { withFileTypes: true });
  const names = [];
  for (const e of entries) {
    if (e.isDirectory() && existsSync(path.join(TEMPLATES_DIR, e.name, "template.html"))) {
      names.push(e.name);
    }
  }
  return names.sort();
}

// ---- commands ---------------------------------------------------------------

async function cmdList() {
  const templates = await listTemplates();
  if (templates.length === 0) {
    console.log("No templates found in templates/. Scaffold one with: new <name>");
  } else {
    console.log("Templates:");
    for (const name of templates) {
      let desc = "";
      try {
        const { config } = await loadConfig(name);
        desc = config.description ? `  — ${config.description}` : "";
      } catch {}
      console.log(`  ${name}${desc}`);
    }
  }
  console.log("");
  console.log(`Size presets: ${Object.keys(SIZE_PRESETS).length} (run \`presets\` to list)`);
}

function cmdPresets() {
  console.log(formatPresets());
}

async function cmdRender(positionals, flags, vars) {
  const template = positionals[0];
  if (!template) throw new Error("Usage: render <template> [--var k=v] [--vars-file f] [--output o] [--size s] [--format f] [--quality q] [--scale n]");

  let fileVars = {};
  if (flags["vars-file"]) {
    const p = path.resolve(process.cwd(), flags["vars-file"]);
    fileVars = JSON.parse(await readFile(p, "utf8"));
  }

  const result = await renderImage({
    template,
    vars: { ...fileVars, ...vars },
    size: flags.size,
    format: flags.format,
    scale: flags.scale,
    quality: flags.quality,
    output: flags.output ? path.resolve(process.cwd(), flags.output) : undefined,
  });

  const rel = path.relative(process.cwd(), result.output) || result.output;
  console.log(
    `✓ Rendered ${template} → ${rel} (${result.width}x${result.height} ${result.format}, ${humanBytes(result.bytes)})`
  );
}

async function cmdPreview(positionals, flags) {
  const template = positionals[0];
  if (!template) throw new Error("Usage: preview <template> [--port 4000]");
  const port = flags.port ? Number(flags.port) : 4000;
  const server = await startPreview(template, { port });
  console.log(`Preview of "${template}" running → http://localhost:${server.port}`);
  console.log("Edit the template files to auto-reload. Press Ctrl+C to stop.");
  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}

async function cmdNew(positionals) {
  const name = positionals[0];
  if (!name) throw new Error("Usage: new <name>");
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error("Template name must be lowercase letters, numbers and dashes.");
  }
  const dir = path.join(TEMPLATES_DIR, name);
  if (existsSync(dir)) throw new Error(`Template "${name}" already exists at ${dir}`);
  await mkdir(dir, { recursive: true });

  const config = {
    description: `Template ${name}`,
    size: "ig-post",
    format: "png",
    scale: 1,
    defaults: {
      title: "Seu título aqui",
      accent: "#dc36c0",
    },
  };
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <main class="card" style="--accent: {{accent}}">
    <h1>{{title}}</h1>
  </main>
</body>
</html>
`;
  const css = `* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  display: flex; align-items: center; justify-content: center;
}
.card {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: var(--accent, #dc36c0);
  padding: 80px;
}
.card h1 {
  color: #fff; font-size: 96px; font-weight: 800; line-height: 1.1;
  letter-spacing: -0.02em; text-align: center;
}
`;
  await writeFile(path.join(dir, "config.json"), JSON.stringify(config, null, 2) + "\n");
  await writeFile(path.join(dir, "template.html"), html);
  await writeFile(path.join(dir, "styles.css"), css);

  console.log(`✓ Created template templates/${name}/`);
  console.log(`  Render it:  node src/cli.js render ${name}`);
  console.log(`  Preview it: node src/cli.js preview ${name}`);
}

function cmdHelp() {
  console.log(`image-forge — HTML/CSS → image generator

Usage:
  node src/cli.js <command> [options]

Commands:
  list                       List templates and preset count
  presets                    List all size presets
  render <template>          Render a template to an image
  preview <template>         Live-reload preview at http://localhost:4000
  new <name>                 Scaffold a new template

Render options:
  --var key=value            Set a variable (repeatable)
  --vars-file <file.json>    Load variables from JSON
  --output, -o <path>        Output file path
  --size <preset|WxH>        Size preset or explicit dimensions
  --format <png|jpeg|webp|avif>
  --quality <1-100>          Quality for jpeg/webp/avif
  --scale <n>                Device pixel ratio (2 = retina)

Preview options:
  --port <n>                 Port (default 4000)
`);
}

// ---- main -------------------------------------------------------------------

async function main() {
  const [, , command, ...rest] = process.argv;
  const { positionals, flags, vars } = parseArgs(rest);

  switch (command) {
    case "list":
      await cmdList();
      break;
    case "presets":
      cmdPresets();
      break;
    case "render":
      await cmdRender(positionals, flags, vars);
      break;
    case "preview":
      await cmdPreview(positionals, flags);
      break;
    case "new":
      await cmdNew(positionals);
      break;
    case undefined:
    case "help":
    case "--help":
    case "-h":
      cmdHelp();
      break;
    default:
      console.error(`Unknown command: ${command}\n`);
      cmdHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
