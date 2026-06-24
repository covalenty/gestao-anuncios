# image-forge

Generate images from HTML/CSS templates. Intended for social media posts, marketing pieces, and ads — but the engine is generic and works for any HTML-renderable image (OG cards, thumbnails, banners, etc.).

## How it works

1. You write a **template** as a tiny static site (`template.html` + `styles.css` + a `config.json`).
2. The CLI renders that template in a headless Chromium at the exact pixel size you want.
3. Variables come from `defaults` in `config.json`, a JSON file, or `--var key=value` flags.

Templates are just folders under `templates/`. Pick any one and re-render it with new content — that's how you produce campaign variants in the same style.

## Install

```bash
cd image-forge
npm install
```

The first install downloads Chromium for Puppeteer.

## CLI

```bash
# List templates and size presets
npm run list
node src/cli.js presets

# Render with inline variables
node src/cli.js render quote-card \
  --var quote="Ship it." \
  --var author="You" \
  --output output/ship.png

# Render with a JSON file of variables
node src/cli.js render quote-card --vars-file examples/quote.json

# Override size and format (any preset, or WxH)
node src/cli.js render og-announcement --size 1600x900 --format webp --quality 85

# High-DPI export (2x retina)
node src/cli.js render product-card --scale 2 --output output/product@2x.png

# Live preview with auto-reload while you edit the template
node src/cli.js preview quote-card
# open http://localhost:4000

# Scaffold a new template
node src/cli.js new my-template
```

## Template anatomy

```
templates/quote-card/
├── config.json     # description, default size/format, default variables
├── template.html   # Handlebars-style {{variables}}
└── styles.css      # styling (any other assets — fonts, images — live here too)
```

`config.json`:

```json
{
  "description": "Bold quote card for Instagram",
  "size": "ig-post",
  "format": "png",
  "scale": 1,
  "defaults": {
    "quote": "...",
    "author": "...",
    "accent": "#ff4f5e"
  }
}
```

- `size` can be a preset name (`ig-post`, `og-image`, `yt-thumb`, …), `"1080x1920"`, or `{ "width": …, "height": … }`.
- `format` is `png` (default), `jpeg`, `webp`, or `avif`.
- `scale` is the device pixel ratio. Use `2` for retina exports.

Variables in `template.html` use Handlebars syntax: `{{title}}`, `{{#if oldPrice}}…{{/if}}`. Built-in helpers: `upper`, `lower`, `default`, `json`.

Local image paths in variables (anything ending `.png`/`.jpg`/`.webp`/`.svg`/...) are auto-resolved to `file://` URLs relative to the template folder, so you can do `--var image=./photo.jpg`.

## Built-in size presets

Includes Instagram (post, portrait, landscape, story, reel cover), Facebook (post, cover, ad), X (post, header), LinkedIn (post, cover), YouTube (thumbnail, channel cover), Pinterest, TikTok, IAB display ad sizes (leaderboard, medium rectangle, skyscraper, billboard), email banner, Open Graph, and app icons. Run `node src/cli.js presets` for the full list.

## Programmatic use

```js
import { renderImage } from "./src/render.js";

await renderImage({
  template: "quote-card",
  vars: { quote: "Hello", author: "Me" },
  size: "ig-story",
  format: "webp",
  output: "output/hello.webp",
});
```

## Tips for designing templates

- Set `box-sizing: border-box` and explicit `html, body { width: 100%; height: 100%; }` — the viewport is exactly your render size.
- Use `px` units rather than `rem`/`vh` for predictable output across sizes.
- For variable-length text, use `clamp()` or container queries to keep layout stable.
- Webfonts: load via `<link>` from Google Fonts (or self-host in the template folder). The renderer waits for `document.fonts.ready`.
- For `--scale 2` exports, design at the base size — Chromium does the upscaling.
