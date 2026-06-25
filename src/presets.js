// Size presets for common social/marketing/ad formats.
// Each entry is [width, height] in CSS pixels (the render is done at this exact
// viewport; use --scale for high-DPI exports).

export const SIZE_PRESETS = {
  // Instagram
  "ig-post": [1080, 1080],
  "ig-portrait": [1080, 1350],
  "ig-landscape": [1080, 566],
  "ig-story": [1080, 1920],
  "ig-reel-cover": [1080, 1920],

  // Facebook
  "fb-post": [1200, 630],
  "fb-cover": [820, 312],
  "fb-ad": [1200, 628],

  // Meta Ads (formatos de anúncio)
  "meta-feed-1x1": [1080, 1080],
  "meta-feed-4x5": [1080, 1350],
  "meta-story-9x16": [1080, 1920],

  // X (Twitter)
  "x-post": [1600, 900],
  "x-header": [1500, 500],

  // LinkedIn
  "li-post": [1200, 627],
  "li-cover": [1584, 396],

  // YouTube
  "yt-thumb": [1280, 720],
  "yt-channel-cover": [2560, 1440],

  // Pinterest
  pinterest: [1000, 1500],

  // TikTok
  tiktok: [1080, 1920],

  // IAB display ad units
  "iab-leaderboard": [728, 90],
  "iab-medium-rectangle": [300, 250],
  "iab-skyscraper": [160, 600],
  "iab-billboard": [970, 250],

  // Misc
  "email-banner": [600, 200],
  "og-image": [1200, 630],
  "app-icon": [1024, 1024],
};

/**
 * Resolve a size spec into { width, height }.
 * Accepts:
 *   - a preset name ("ig-post")
 *   - a "WxH" string ("1080x1920")
 *   - an object { width, height }
 */
export function resolveSize(size) {
  if (!size) throw new Error("No size given");

  if (typeof size === "object") {
    const { width, height } = size;
    if (!width || !height) {
      throw new Error(`Invalid size object: ${JSON.stringify(size)}`);
    }
    return { width: Number(width), height: Number(height) };
  }

  if (typeof size === "string") {
    const preset = SIZE_PRESETS[size];
    if (preset) return { width: preset[0], height: preset[1] };

    const m = size.match(/^(\d+)\s*[xX]\s*(\d+)$/);
    if (m) return { width: Number(m[1]), height: Number(m[2]) };

    throw new Error(
      `Unknown size "${size}". Use a preset (run \`presets\`), a WxH string like 1080x1920, or { width, height }.`
    );
  }

  throw new Error(`Unsupported size value: ${String(size)}`);
}

/** Pretty-printed list of all presets, grouped, for the CLI. */
export function formatPresets() {
  const lines = ["Size presets:"];
  const pad = Math.max(...Object.keys(SIZE_PRESETS).map((k) => k.length));
  for (const [name, [w, h]] of Object.entries(SIZE_PRESETS)) {
    lines.push(`  ${name.padEnd(pad)}  ${w}x${h}`);
  }
  return lines.join("\n");
}
