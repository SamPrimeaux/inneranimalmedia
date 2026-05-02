#!/usr/bin/env bash
set -euo pipefail

ROOT="/Users/samprimeaux/Downloads/inneranimalmedia/inneranimalmedia-agentsam-dashboard"
DASH="$ROOT/dashboard"

cd "$DASH"

echo "== Repair dashboard/package.json directly =="
node <<'NODE'
const fs = require("fs");

const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));

pkg.scripts = pkg.scripts || {};
pkg.scripts.build = "vite build";
pkg.scripts.dev = "vite --host 0.0.0.0";
pkg.scripts.preview = "vite preview --host 0.0.0.0";

pkg.devDependencies = pkg.devDependencies || {};
pkg.devDependencies.vite = "^6.3.5";
pkg.devDependencies["@vitejs/plugin-react"] = "^4.4.1";
pkg.devDependencies.typescript = "^5.8.3";

fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
console.log(fs.readFileSync(path, "utf8"));
NODE

echo "== Clean bad local install =="
rm -rf node_modules package-lock.json dist .vite

echo "== Install Vite deps into flat dashboard package =="
npm install --include=dev

echo "== Prove Vite is installed locally =="
ls -la node_modules/.bin/vite
node -e "console.log('vite resolved:', require.resolve('vite/package.json'))"
npx vite --version

echo "== Build flat dashboard =="
npm run build

echo "== Patch root build script =="
cd "$ROOT"
node <<'NODE'
const fs = require("fs");
const path = "package.json";
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));

pkg.scripts = pkg.scripts || {};
pkg.scripts["build:vite-only"] = "npm --prefix dashboard run build";
pkg.scripts["dev:dashboard"] = "npm --prefix dashboard run dev";
pkg.scripts["preview:dashboard"] = "npm --prefix dashboard run preview";

fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
NODE

echo "== Test root build script =="
npm run build:vite-only

echo "== Verify Agent Sam bundle marker =="
rg -n "agent-app-sse-v1|canonical mounted|data-chat-assistant-contract" dashboard/dist || true

echo "== Done =="
git status --short
