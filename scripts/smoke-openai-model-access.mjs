#!/usr/bin/env node

import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const OUT_DIR = "tmp/openai-smoke";
await fs.mkdir(OUT_DIR, { recursive: true });

const candidates = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.3-codex",
  "gpt-5-codex",
  "gpt-5.1-codex",
  "gpt-5.2-codex",
  "gpt-5.4-pro",
  "gpt-5.5-pro",
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "o3",
  "o4-mini"
];

const prompt = 'Return exactly this JSON and nothing else: {"ok":true,"task":"openai_model_access_probe"}';

function outputText(json) {
  if (typeof json.output_text === "string") return json.output_text;
  const chunks = [];
  for (const item of json.output || []) {
    for (const c of item.content || []) {
      if (typeof c.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n").trim();
}

function usageSummary(json) {
  const u = json?.usage || {};
  return {
    input_tokens: u.input_tokens ?? u.prompt_tokens ?? null,
    output_tokens: u.output_tokens ?? u.completion_tokens ?? null,
    total_tokens: u.total_tokens ?? null,
  };
}

async function testModel(model) {
  const started = performance.now();

  const body = {
    model,
    input: prompt,
    max_output_tokens: 80,
    store: false,
  };

  if (/^(o3|o4|gpt-5)/.test(model)) {
    body.reasoning = { effort: "low" };
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const elapsed_ms = Math.round(performance.now() - started);
  const text = await res.text();

  let json = null;
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) {
    return {
      model,
      ok: false,
      status: res.status,
      elapsed_ms,
      error_code: json?.error?.code ?? null,
      error_type: json?.error?.type ?? null,
      error_message: json?.error?.message ?? text.slice(0, 500),
    };
  }

  return {
    model,
    ok: true,
    status: res.status,
    elapsed_ms,
    output_text: outputText(json).slice(0, 300),
    ...usageSummary(json),
  };
}

const results = [];

for (const model of candidates) {
  process.stderr.write(`testing ${model} ... `);
  const result = await testModel(model);
  process.stderr.write(result.ok ? "OK\n" : `FAIL ${result.status}\n`);
  results.push(result);
}

await fs.writeFile(
  `${OUT_DIR}/openai_model_access_results.json`,
  JSON.stringify({ created_at: new Date().toISOString(), results }, null, 2)
);

const cols = [
  "model",
  "ok",
  "status",
  "elapsed_ms",
  "input_tokens",
  "output_tokens",
  "total_tokens",
  "error_code",
  "error_type",
  "error_message",
  "output_text",
];

const tsv = [
  cols.join("\t"),
  ...results.map((r) =>
    cols.map((c) => String(r[c] ?? "").replaceAll("\t", " ").replaceAll("\n", " ")).join("\t")
  ),
].join("\n");

await fs.writeFile(`${OUT_DIR}/openai_model_access_results.tsv`, tsv);
console.log(tsv);
