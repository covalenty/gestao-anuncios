# Installing image-forge

`image-forge` is a Node.js CLI that renders HTML/CSS templates into images
(PNG/JPEG/WebP/AVIF) using a headless Chromium. This guide covers everything you
need to get it running from a clean machine.

## What it actually depends on

| Layer | Requirement | Why |
| --- | --- | --- |
| Runtime | **Node.js ≥ 18** (tested on v20) | The code uses ES modules (`"type": "module"`) and `node:` core imports. |
| Package manager | **npm** (ships with Node) | Installs dependencies and the bundled Chromium. |
| Rendering engine | **Chromium** | Downloaded automatically by Puppeteer during `npm install` (≈150–200 MB). No system Chrome required. |
| Image conversion | **sharp** | Used for WebP/AVIF output. Installs prebuilt native binaries — no compiler needed on macOS/Linux/Windows x64/arm64. |

Runtime npm dependencies (from `package.json`):

- `puppeteer` — drives headless Chromium to screenshot the page
- `handlebars` — `{{variable}}` templating in `template.html`
- `sharp` — converts PNG screenshots to WebP/AVIF
- `chokidar` — file watching for the live `preview` server
- `ws` — WebSocket auto-reload in preview mode

There is **no build step** and **no `.env`/config** to set up.

## Step 1 — Install Node.js (if you don't have it)

Check first:

```bash
node --version   # need v18 or newer
npm --version
```

If Node is missing or too old, install it.

**macOS:**

```bash
# Homebrew
brew install node

# or nvm (lets you pin a version)
nvm install 20 && nvm use 20
```

**Windows** (run in PowerShell):

```powershell
# winget (built into Windows 10/11)
winget install OpenJS.NodeJS.LTS

# or Chocolatey
choco install nodejs-lts

# or nvm-windows (https://github.com/coreybutler/nvm-windows) to pin a version
nvm install 20
nvm use 20
```

Or download the `.msi` installer from <https://nodejs.org/> and accept the
defaults. After installing, open a **new** terminal so `node`/`npm` are on the
`PATH`, then verify with `node --version`.

## Step 2 — Install project dependencies

```bash
cd image-forge
npm install
```

This downloads the npm packages **and** a matching Chromium build for Puppeteer.
The Chromium download is the slow part on a first install and is cached under
`~/.cache/puppeteer`, so later installs are fast.

> Behind a corporate proxy or firewall? If the Chromium download is blocked, set
> `PUPPETEER_SKIP_DOWNLOAD=1` before `npm install` and point Puppeteer at a
> system Chrome via the `PUPPETEER_EXECUTABLE_PATH` env var at runtime.

## Step 3 — Verify it works

```bash
# Should print the bundled templates
node src/cli.js list

# Render one to confirm Chromium + sharp are functional
node src/cli.js render quote-card --var quote="It works" --output output/test.png
```

A successful render prints something like:
`✓ Rendered quote-card → output/test.png (1080x1080 png, 42.3 KB)`.
Output files land in `output/` (gitignored).

> **Windows shell note:** the multi-line examples in this repo use the Unix
> backslash (`\`) for line continuation. In PowerShell use a backtick (`` ` ``)
> instead, in `cmd.exe` use a caret (`^`), or just put the whole command on one
> line. Paths work with either `/` or `\`.

## Optional — install as a global command

`package.json` exposes a `bin` named `image-forge`, so you can run it by name
instead of `node src/cli.js`:

```bash
npm link            # from the repo root, registers the `image-forge` command
image-forge list    # now usable anywhere
```

## Platform notes

- **macOS / Windows / Linux x64 & arm64** — all work out of the box; sharp and
  Puppeteer ship prebuilt binaries for these.
- **Windows specifics:**
  - The Puppeteer Chromium download is cached under
    `%USERPROFILE%\.cache\puppeteer` (not `~/.cache`).
  - The first `image-forge render` may trigger a **Windows Defender Firewall**
    prompt because Chromium opens a local debugging port — allow it (it's
    localhost only, no inbound traffic needed).
  - If `npm link` / the global `image-forge` command won't run scripts, your
    PowerShell **execution policy** may be blocking it. Either call it as
    `node src\cli.js …` or run
    `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
  - No Visual Studio / build tools are required — both `sharp` and `puppeteer`
    install prebuilt binaries, so there's nothing to compile.
- **Linux servers / Docker** — headless Chromium needs a few shared libraries
  (e.g. `libnss3`, `libatk-1.0`, `libgbm1`, fonts). Install your distro's
  Puppeteer/Chrome dependency set. The launcher already passes
  `--no-sandbox --disable-setuid-sandbox`, which is what most container
  environments require.

## Common commands once installed

```bash
node src/cli.js list                 # list templates
node src/cli.js presets              # list size presets (ig-post, og-image, …)
node src/cli.js render <template> --var key=value --output out.png
node src/cli.js render <template> --vars-file vars.json --size 1200x630 --format webp
node src/cli.js preview <template>   # live-reload preview at http://localhost:4000
node src/cli.js new <name>           # scaffold a new template
```

See `README.md` for template authoring and the full option reference.
