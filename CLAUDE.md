# image-forge

HTML/CSS → image generator (Puppeteer + Handlebars + sharp). Templates live in
`templates/`; render with `node src/cli.js render <template>`. See `README.md`
for the engine and `examples/TUTORIAL.md` for a walkthrough.

## Default output language: Brazilian Portuguese (pt-BR)

When generating the **content of assets/output** — post copy, headlines,
captions, CTAs, quotes, example variables, and any text baked into rendered
images — write it in **Brazilian Portuguese (pt-BR) by default**. The primary
brand here, Cienty, is Brazilian, and its design system defines a pt-BR voice.

- This applies to generated image content and example var files (e.g.
  `examples/*.json`), not to source code, CLI flags, or commit messages.
- For on-brand Cienty work, also follow the voice in the `cienty-brand` skill
  (specialist / partner / determined; address the user as "você").
- Only switch languages when the user explicitly asks for another one.
