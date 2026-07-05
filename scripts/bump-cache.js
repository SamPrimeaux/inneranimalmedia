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

const SKIP_JS = new Set(["sw.js", "push-handler.js", "sw-agent-cache.js"]);
const DYNAMIC_IMPORT_RE = /import\("(\.\/[^"?]+\.js)(?:\?v=[^"'<> ]+)?"\)/g;
const STATIC_IMPORT_RE = /from"(\.\/[^"?]+\.js)(?:\?v=[^"'<> ]+)?"/g;

function stampRelativeJsImports(raw) {
  return raw
    .replace(DYNAMIC_IMPORT_RE, (_, rel) => `import("${rel}?v=${stamp}")`)
    .replace(STATIC_IMPORT_RE, (_, rel) => `from"${rel}?v=${stamp}"`);
}

/** Stamp deploy ?v= on every relative ./ chunk import so lazy routes cannot cross-deploy. */
let stampedFiles = 0;
for (const name of fs.readdirSync(distDir)) {
  if (!name.endsWith(".js") || SKIP_JS.has(name)) continue;
  const filePath = path.join(distDir, name);
  const raw = fs.readFileSync(filePath, "utf8");
  const next = stampRelativeJsImports(raw);
  if (next !== raw) {
    fs.writeFileSync(filePath, next);
    stampedFiles += 1;
  }
}

console.log("[bump-cache] Updated:", indexPath);
console.log("[bump-cache] v=", stamp);
if (stampedFiles) {
  console.log(`[bump-cache] Stamped relative ./ imports in ${stampedFiles} JS file(s)`);
}
