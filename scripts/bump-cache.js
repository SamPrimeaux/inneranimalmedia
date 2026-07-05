import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dashboard", "dist");
const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  console.error("[bump-cache] Missing dashboard build:", indexPath);
  console.error("[bump-cache] Run: npm run build:vite-only");
  process.exit(1);
}

let html = fs.readFileSync(indexPath, "utf8");
const stamp = `${Date.now()}`;

html = html.replace(
  /((?:agent-dashboard|dashboard)\.(?:js|css))(?:\?v=[^"'<> ]+)?/g,
  `$1?v=${stamp}`
);

const metaTag = `<meta name="iam-cache-bust" content="${stamp}" />`;
if (html.includes('<meta name="iam-cache-bust"')) {
  html = html.replace(/<meta name="iam-cache-bust" content="[^"]*" \/>/g, metaTag);
} else {
  html = html.replace("<head>", `<head>\n  ${metaTag}`);
}

fs.writeFileSync(indexPath, html);

/** Lazy route chunks import ./dashboard.js — must share the same ?v= as index.html or browsers reuse a stale entry module. */
const DASHBOARD_IMPORT_RE = /\.\/dashboard\.js(?:\?v=[^"'<> ]+)?/g;
let chunkFiles = 0;
for (const name of fs.readdirSync(distDir)) {
  if (!name.endsWith(".js") || name === "sw.js" || name === "push-handler.js" || name === "sw-agent-cache.js") {
    continue;
  }
  const filePath = path.join(distDir, name);
  const raw = fs.readFileSync(filePath, "utf8");
  if (!raw.includes("./dashboard.js")) continue;
  const next = raw.replace(DASHBOARD_IMPORT_RE, `./dashboard.js?v=${stamp}`);
  if (next !== raw) {
    fs.writeFileSync(filePath, next);
    chunkFiles += 1;
  }
}

console.log("[bump-cache] Updated:", indexPath);
console.log("[bump-cache] v=", stamp);
if (chunkFiles) {
  console.log(`[bump-cache] Stamped ./dashboard.js imports in ${chunkFiles} chunk file(s)`);
}
