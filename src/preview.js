import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import chokidar from "chokidar";
import { WebSocketServer } from "ws";
import { loadConfig, buildHtml, templateDir, TEMPLATES_DIR } from "./render.js";

const MIME = {
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".json": "application/json",
};

const RELOAD_SNIPPET = (port) => `
<script>
(function () {
  function connect() {
    var ws = new WebSocket("ws://" + location.hostname + ":${port}");
    ws.onmessage = function () { location.reload(); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }
  connect();
})();
</script>`;

/**
 * Start a live-reload preview server for a template.
 * Renders template.html with its config defaults and auto-reloads on edits.
 */
export async function startPreview(template, { port = 4000, templatesDir = TEMPLATES_DIR } = {}) {
  const dir = templateDir(template, templatesDir);
  if (!existsSync(dir)) {
    throw new Error(`Template "${template}" not found at ${dir}`);
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const pathname = decodeURIComponent(url.pathname);

      if (pathname === "/" || pathname === "/index.html") {
        const { config } = await loadConfig(template, templatesDir);
        let html = await buildHtml(template, config.defaults || {}, templatesDir, {
          baseHref: "/",
        });
        // Inject the live-reload client right before </body> (or at the end).
        if (/<\/body>/i.test(html)) {
          html = html.replace(/<\/body>/i, `${RELOAD_SNIPPET(port)}</body>`);
        } else {
          html += RELOAD_SNIPPET(port);
        }
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      // Serve any other file from the template folder (styles.css, assets…).
      const filePath = path.join(dir, pathname);
      if (!filePath.startsWith(dir) || !existsSync(filePath)) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const buf = await readFile(filePath);
      const mime = MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      res.writeHead(200, { "content-type": mime });
      res.end(buf);
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end(`Preview error: ${err.message}`);
    }
  });

  const wss = new WebSocketServer({ server });
  const watcher = chokidar.watch(dir, { ignoreInitial: true });
  watcher.on("all", () => {
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send("reload");
    }
  });

  await new Promise((resolve) => server.listen(port, resolve));

  return {
    port,
    async close() {
      await watcher.close();
      wss.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
