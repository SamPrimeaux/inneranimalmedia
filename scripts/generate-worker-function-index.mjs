/**
 * AST scan of a JS file -> JSON or Markdown function index.
 * Run from repo root: node scripts/generate-worker-function-index.mjs [--input <path>] [--output <path>] [--project <name>] [--format json|md] [--upload]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse, Parser } from "acorn";
import { simple as walk, base } from "acorn-walk";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};
const root = path.join(__dirname, "..");
const workerPath = getArg("--input") || path.join(root, "worker.js");
const projectName = getArg("--project") || "inneranimalmedia";
const formatArg = (getArg("--format") || "json").toLowerCase();
const format = formatArg === "md" ? "md" : "json";
const defaultExt = format === "md" ? ".md" : ".json";
const outPath =
  getArg("--output") || path.join(root, "docs", projectName + "-function-index" + defaultExt);
const shouldUpload = args.includes("--upload");

/** Single-line text for Markdown bullets (avoid breaking list structure). */
function mdInline(s) {
  return String(s).replace(/\r?\n/g, " ").trim();
}

const code = fs.readFileSync(workerPath, "utf8");
const lines = code.split(/\n/);

const isJsx = workerPath.endsWith(".jsx") || workerPath.endsWith(".tsx");
const parseOptions = { ecmaVersion: "latest", sourceType: "module", locations: true, allowAwaitOutsideFunction: true };
let ast;
if (isJsx) {
  const acornJsx = require("acorn-jsx");
  const JsxParser = Parser.extend(acornJsx());
  ast = JsxParser.parse(code, parseOptions);
} else {
  ast = parse(code, parseOptions);
}

/** acorn-walk has no built-in JSX visitors; extend base so full-tree and shallow walks do not throw. */
function extendWalkBaseWithJsx(b) {
  return {
    ...b,
    JSXElement(node, st, c) {
      c(node.openingElement, st);
      for (const ch of node.children) c(ch, st);
      if (node.closingElement) c(node.closingElement, st);
    },
    JSXFragment(node, st, c) {
      c(node.openingFragment, st);
      for (const ch of node.children) c(ch, st);
      c(node.closingFragment, st);
    },
    JSXOpeningElement(node, st, c) {
      c(node.name, st);
      for (const attr of node.attributes) c(attr, st);
    },
    JSXClosingElement(node, st, c) {
      c(node.name, st);
    },
    JSXOpeningFragment() {},
    JSXClosingFragment() {},
    JSXAttribute(node, st, c) {
      if (node.value) c(node.value, st);
    },
    JSXSpreadAttribute(node, st, c) {
      c(node.argument, st);
    },
    JSXExpressionContainer(node, st, c) {
      c(node.expression, st);
    },
    JSXSpreadChild(node, st, c) {
      c(node.expression, st);
    },
    JSXText() {},
    JSXEmptyExpression() {},
    JSXIdentifier() {},
    JSXNamespacedName(node, st, c) {
      c(node.namespace, st);
      c(node.name, st);
    },
    JSXMemberExpression(node, st, c) {
      c(node.object, st);
      c(node.property, st);
    },
  };
}

const walkBase = isJsx ? extendWalkBaseWithJsx(base) : base;

const builtins = new Set([
  "parseInt",
  "parseFloat",
  "isNaN",
  "isFinite",
  "decodeURIComponent",
  "encodeURIComponent",
  "btoa",
  "atob",
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "queueMicrotask",
  "structuredClone",
  "fetch",
  "Response",
  "Request",
  "Headers",
  "URL",
  "URLSearchParams",
  "FormData",
  "Blob",
  "File",
  "TextEncoder",
  "TextDecoder",
  "crypto",
  "console",
  "JSON",
  "Math",
  "Object",
  "Array",
  "String",
  "Number",
  "Boolean",
  "Date",
  "RegExp",
  "Error",
  "TypeError",
  "SyntaxError",
  "Promise",
  "Map",
  "Set",
  "WeakMap",
  "WeakSet",
  "Symbol",
  "BigInt",
  "Uint8Array",
  "Uint16Array",
  "Uint32Array",
  "Int8Array",
  "Int16Array",
  "Int32Array",
  "Float32Array",
  "Float64Array",
  "ArrayBuffer",
  "DataView",
  "AbortController",
  "AbortSignal",
  "ReadableStream",
  "WritableStream",
  "TransformStream",
]);

function paramNames(params) {
  return params.map((p) => {
    if (p.type === "Identifier") return p.name;
    if (p.type === "AssignmentPattern" && p.left.type === "Identifier") return p.left.name;
    if (p.type === "RestElement" && p.argument.type === "Identifier") return `...${p.argument.name}`;
    return "?";
  });
}

function calleeName(node) {
  if (!node) return null;
  if (node.type === "Identifier") return node.name;
  if (node.type === "MemberExpression" && !node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  return null;
}

function purposeFromLine(line1) {
  const line = lines[line1 - 1];
  if (!line) return "Worker helper or handler.";
  const t = line.trim();
  if (t.startsWith("//")) return t.replace(/^\/\/\s?/, "").slice(0, 200) || "Worker helper or handler.";
  return "Worker helper or handler.";
}

function purposeFromJSDoc(startLine) {
  let i = startLine - 2;
  const block = [];
  while (i >= 0) {
    const raw = lines[i];
    const t = raw.trimEnd();
    if (t.trim() === "") {
      i--;
      continue;
    }
    if (t.trim().endsWith("*/")) {
      let j = i;
      while (j >= 0) {
        block.unshift(lines[j].trim());
        if (lines[j].includes("/**")) break;
        j--;
      }
      const text = block
        .join(" ")
        .replace(/\/\*\*?\s*/, "")
        .replace(/\*\/$/, "")
        .replace(/^\s*\*\s?/gm, "")
        .trim();
      const first = text.split(/\n/)[0] || text;
      return first.slice(0, 280) || purposeFromLine(startLine);
    }
    if (t.trim().startsWith("//")) {
      return t.replace(/^\s*\/\/\s?/, "").slice(0, 280);
    }
    break;
  }
  return purposeFromLine(startLine);
}

function inferTags(bodyStart, bodyEnd) {
  const slice = code.slice(bodyStart, bodyEnd);
  const tags = new Set();
  if (/env\.DB\b|\.prepare\s*\(|d1_query|d1_write/i.test(slice)) tags.add("d1");
  if (/env\.(R2|DASHBOARD|DOCS_BUCKET|ASSETS|AUTORAG_BUCKET|CAD_ASSETS)\b|bucket\.put|r2_read|r2_list|r2_write/i.test(slice)) tags.add("r2");
  if (/\/api\/mcp|invokeMcpToolFromChat|MCP|mcp_/i.test(slice)) tags.add("mcp");
  if (/session|getAuthUser|auth_|oauth|cookie|Bearer /i.test(slice)) tags.add("auth");
  if (/ReadableStream|text\/event-stream|getReader\(\)|SSE|EventSource/i.test(slice)) tags.add("streaming");
  if (/env\.AI\b|Workers AI|@cf\//i.test(slice)) tags.add("workers-ai");
  if (/MYBROWSER|playwright|browser_screenshot|playwright_screenshot/i.test(slice)) tags.add("browser");
  if (/VECTORIZE|Vectorize|embed/i.test(slice)) tags.add("vectorize");
  if (/KV\b|SESSION_CACHE|env\.KV/i.test(slice)) tags.add("kv");
  if (/DurableObject|Durable Object|\.id\.fromName|stub\./i.test(slice)) tags.add("durable-objects");
  if (/scheduled|cron|queue\(/i.test(slice)) tags.add("cron");
  if (/fetch\s*\(\s*[`'"]https?:/i.test(slice)) tags.add("http-client");
  return [...tags].sort();
}

const entries = [];

function pushEntry(displayName, fnNode, keyLine) {
  const start = fnNode.body?.start ?? fnNode.start;
  const end = fnNode.body?.end ?? fnNode.end;
  if (start == null || end == null) return;
  entries.push({
    name: displayName,
    line: keyLine,
    node: fnNode,
    start,
    end,
    params: paramNames(fnNode.params),
  });
}

walk(ast, {
  FunctionDeclaration(node) {
    if (node.id?.name) pushEntry(node.id.name, node, node.loc.start.line);
  },
  VariableDeclarator(node) {
    if (node.id.type !== "Identifier") return;
    const init = node.init;
    if (!init) return;
    if (init.type === "FunctionExpression" || init.type === "ArrowFunctionExpression") {
      pushEntry(node.id.name, init, init.loc.start.line);
    }
  },
  ClassDeclaration(node) {
    if (!node.id?.name) return;
    const cls = node.id.name;
    for (const el of node.body.body) {
      if (el.type !== "MethodDefinition") continue;
      const key = el.key.type === "Identifier" ? el.key.name : el.key.type === "Literal" ? String(el.key.value) : null;
      if (!key) continue;
      const fn = el.value;
      if (fn.type !== "FunctionExpression") continue;
      pushEntry(`${cls}.${key}`, fn, fn.loc.start.line);
    }
  },
  Property(node) {
    if (!node.method || node.key.type !== "Identifier") return;
    const fn = node.value;
    if (fn.type !== "FunctionExpression" && fn.type !== "ArrowFunctionExpression") return;
    pushEntry(node.key.name, fn, fn.loc.start.line);
  },
},
walkBase);

const definedNames = new Set(entries.map((e) => e.name.split(".").pop()));

/** Walk statement tree but do not descend into nested function bodies (call graph stays top-level per entry). */
const shallowBase = { ...walkBase };
for (const k of ["FunctionExpression", "FunctionDeclaration", "ArrowFunctionExpression"]) {
  shallowBase[k] = (node, st, c) => {
    if (node.type === "ArrowFunctionExpression" && node.body.type !== "BlockStatement") return;
    if (node.body?.type === "BlockStatement") c(node.body, st, k);
  };
}

const output = entries
  .sort((a, b) => a.line - b.line)
  .map((e) => {
    const calls = new Set();
    const body = e.node.body;
    if (body?.type === "BlockStatement") {
      walk(
        body,
        {
          CallExpression(node) {
            const n = calleeName(node.callee);
            if (n && !builtins.has(n) && definedNames.has(n)) calls.add(n);
          },
        },
        shallowBase,
      );
    }

    return {
      name: e.name,
      line: e.line,
      project: projectName,
      purpose: purposeFromJSDoc(e.line),
      params: e.params,
      calls: [...calls].sort(),
      tags: inferTags(e.start, e.end),
    };
  });

fs.mkdirSync(path.dirname(outPath), { recursive: true });
let body;
let byteNote;
if (format === "md") {
  const title = `# Worker Function Index — ${projectName}`;
  const joinOrNone = (arr) => (Array.isArray(arr) && arr.length ? arr.join(", ") : "none");
  const blocks = output.map((row) => {
    const p = row.project ?? projectName;
    return [
      `## ${row.name}`,
      `- **Line:** ${row.line}`,
      `- **Project:** ${p}  `,
      `- **Purpose:** ${mdInline(row.purpose)}`,
      `- **Params:** ${joinOrNone(row.params)}`,
      `- **Calls:** ${joinOrNone(row.calls)}`,
      `- **Tags:** ${joinOrNone(row.tags)}`,
    ].join("\n");
  });
  body = [title, "", blocks.join("\n\n"), ""].join("\n");
  byteNote = `${Buffer.byteLength(body, "utf8")} bytes`;
} else {
  body = JSON.stringify(output, null, 2) + "\n";
  byteNote = `${body.length} bytes`;
}
fs.writeFileSync(outPath, body, "utf8");
console.error("Indexed", output.length, "functions ->", outPath, `(${byteNote})`);

if (shouldUpload) {
  const { execSync } = await import("child_process");
  const r2Key = "code/" + projectName + "-function-index" + (format === "md" ? ".md" : ".json");
  const contentType = format === "md" ? "text/markdown" : "application/json";
  execSync(
    "./scripts/with-cloudflare-env.sh npx wrangler r2 object put autorag/" +
      r2Key +
      " --file=" +
      outPath +
      " --content-type=" +
      contentType +
      " --config wrangler.production.toml --remote",
    { stdio: "inherit", cwd: root }
  );
  console.log("Uploaded to AutoRAG: " + r2Key);
}
