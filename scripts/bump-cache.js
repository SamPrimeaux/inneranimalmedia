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
  /(agent-dashboard\.(?:js|css))(?:\?v=[^"'<> ]+)?/g,
  `$1?v=${stamp}`
);

fs.writeFileSync(indexPath, html);

console.log("[bump-cache] Updated:", indexPath);
console.log("[bump-cache] v=", stamp);
