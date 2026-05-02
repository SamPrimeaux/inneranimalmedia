import fs from "node:fs";
import path from "node:path";

const workerPath = "worker.js";
const worker = fs.existsSync(workerPath) ? fs.readFileSync(workerPath, "utf8") : "";
const srcFiles = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir)) {
    const p = path.join(dir, item);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(js|ts)$/.test(p)) srcFiles.push(p);
  }
}
walk("src");

function symbols(text) {
  const out = [];
  const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)|(?:export\s+)?class\s+([A-Za-z0-9_$]+)|(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1] || m[2] || m[3]);
  return [...new Set(out)].sort();
}

function routeHints(text) {
  const out = new Set();
  const re = /['"`](\/api\/[^'"`?\s]+|\/dashboard\/[^'"`?\s]+|\/auth\/[^'"`?\s]+|\/[a-z0-9-]+)['"`]/gi;
  let m;
  while ((m = re.exec(text))) out.add(m[1]);
  return [...out].sort();
}

const workerSymbols = symbols(worker);
const workerRoutes = routeHints(worker);
const srcIndex = new Map();
const srcRoutes = new Map();

for (const file of srcFiles) {
  const text = fs.readFileSync(file, "utf8");
  for (const sym of symbols(text)) {
    if (!srcIndex.has(sym)) srcIndex.set(sym, []);
    srcIndex.get(sym).push(file);
  }
  for (const route of routeHints(text)) {
    if (!srcRoutes.has(route)) srcRoutes.set(route, []);
    srcRoutes.get(route).push(file);
  }
}

const duplicatedSymbols = workerSymbols
  .filter(sym => srcIndex.has(sym))
  .map(sym => ({ sym, files: srcIndex.get(sym) }));

const workerOnlyRoutes = workerRoutes.filter(r => !srcRoutes.has(r));
const duplicatedRoutes = workerRoutes
  .filter(r => srcRoutes.has(r))
  .map(route => ({ route, files: srcRoutes.get(route) }));

console.log("# Worker Modularization Audit\n");
console.log(`worker.js lines: ${worker.split("\n").length}`);
console.log(`worker.js symbols: ${workerSymbols.length}`);
console.log(`worker.js route hints: ${workerRoutes.length}`);
console.log(`src files: ${srcFiles.length}`);
console.log(`duplicated symbol names: ${duplicatedSymbols.length}`);
console.log(`duplicated route hints: ${duplicatedRoutes.length}`);
console.log(`worker-only route hints: ${workerOnlyRoutes.length}\n`);

console.log("## Duplicated Symbols");
for (const d of duplicatedSymbols.slice(0, 250)) {
  console.log(`- ${d.sym} -> ${d.files.join(", ")}`);
}

console.log("\n## Duplicated Route Hints");
for (const d of duplicatedRoutes.slice(0, 250)) {
  console.log(`- ${d.route} -> ${d.files.join(", ")}`);
}

console.log("\n## Worker-only Route Hints");
for (const route of workerOnlyRoutes.slice(0, 300)) {
  console.log(`- ${route}`);
}

console.log("\n## Largest src files");
const sizes = srcFiles
  .map(f => ({ f, lines: fs.readFileSync(f, "utf8").split("\n").length }))
  .sort((a,b) => b.lines - a.lines)
  .slice(0, 60);

for (const s of sizes) console.log(`- ${String(s.lines).padStart(5)} ${s.f}`);
