#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

function normalizeGeneratedPath(value) {
  return String(value || "")
    .replaceAll("\\\\", "/")
    .replace(/^\.?\//, "")
    .trim();
}

function generatedPathSet(files) {
  return new Set((files || []).map((f) => normalizeGeneratedPath(f.path || f.name || f.file || "")));
}

function hasGeneratedPath(files, candidates) {
  const paths = generatedPathSet(files);
  return candidates.some((candidate) => paths.has(normalizeGeneratedPath(candidate)));
}

function generatedFileList(files) {
  return Array.from(generatedPathSet(files)).sort();
}


const DB = process.env.IAM_D1_DB || "inneranimalmedia-business";
const TENANT_ID = process.env.IAM_TENANT_ID || "tenant_sam_primeaux";
const WORKSPACE_ID = process.env.IAM_WORKSPACE_ID || "ws_inneranimalmedia";
const USER_ID = process.env.IAM_USER_ID || "sam_primeaux";
const USER_EMAIL = process.env.IAM_USER_EMAIL || "sam@inneranimalmedia.com";
const R2_BUCKET = process.env.IAM_R2_BUCKET || "inneranimalmedia-assets";

const NANO_MODEL = process.env.OPENAI_NANO_MODEL || "gpt-5.4-nano";
const MINI_MODEL = process.env.OPENAI_MINI_MODEL || "gpt-5.4-mini";

const PRICE = {
  [NANO_MODEL]: { input: Number(process.env.NANO_INPUT_PER_1M || 0.20), output: Number(process.env.NANO_OUTPUT_PER_1M || 1.25) },
  [MINI_MODEL]: { input: Number(process.env.MINI_INPUT_PER_1M || 0.75), output: Number(process.env.MINI_OUTPUT_PER_1M || 4.50) },
};

const publish = process.argv.includes("--publish");
const userPrompt = process.argv
  .filter((x) => !x.endsWith(".mjs") && !x.includes("node") && x !== "--publish")
  .join(" ")
  .trim() || "Build a polished landing page for Inner Animal Media showing Agent Sam autonomous AI workflows, website generation, analytics, artifacts, and Cloudflare-first infrastructure.";

if (!process.env.OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY. Run: export OPENAI_API_KEY='sk-...'");
  process.exit(1);
}

const now = Date.now();
const slug = `agent-sam-site-${now}`;
const outDir = path.resolve("scripts/generated-sites", slug);
const workflowId = "wf_agent_openai_website_build_e2e";
const workflowKey = "agent_openai_website_build_e2e";
const runId = `wrun_${crypto.randomBytes(8).toString("hex")}`;

let stepResults = [];
let inputTokens = 0;
let outputTokens = 0;
let costUsd = 0;
let startedAt = Math.floor(Date.now() / 1000);

function sqlEscape(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function jsonEscape(value) {
  return sqlEscape(JSON.stringify(value));
}

function d1(command) {
  return execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--remote", "--command", command],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function r2Put(localFile, key) {
  return execFileSync(
    "npx",
    ["wrangler", "r2", "object", "put", `${R2_BUCKET}/${key}`, "--file", localFile, "--remote"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  );
}

function estimateCost(model, usage) {
  const p = PRICE[model] || { input: 0, output: 0 };
  const input = usage?.input_tokens || 0;
  const output = usage?.output_tokens || 0;
  return (input / 1_000_000) * p.input + (output / 1_000_000) * p.output;
}

function outputTextFromResponse(data) {
  if (data.output_text) return data.output_text;

  const parts = [];
  for (const item of data.output || []) {
    for (const c of item.content || []) {
      if (typeof c.text === "string") parts.push(c.text);
      if (typeof c.output_text === "string") parts.push(c.output_text);
    }
  }
  return parts.join("\n").trim();
}

function extractJson(text) {
  const clean = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {}

  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(clean.slice(first, last + 1));
  }

  throw new Error(`Could not parse JSON from model output:\n${clean.slice(0, 1200)}`);
}

async function openaiJson({ model, system, user, maxOutputTokens = 12000 }) {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_output_tokens: maxOutputTokens,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(`OpenAI ${model} failed: ${res.status} ${JSON.stringify(data).slice(0, 2000)}`);
  }

  const usage = data.usage || {};
  inputTokens += usage.input_tokens || 0;
  outputTokens += usage.output_tokens || 0;
  costUsd += estimateCost(model, usage);

  return {
    data,
    text: outputTextFromResponse(data),
    usage,
  };
}

function updateRun(fields = {}) {
  const sets = [];
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "number") sets.push(`${k} = ${v}`);
    else sets.push(`${k} = ${sqlEscape(v)}`);
  }

  d1(`
    UPDATE agentsam_workflow_runs
    SET
      ${sets.join(",\n      ")},
      input_tokens = ${Math.round(inputTokens)},
      output_tokens = ${Math.round(outputTokens)},
      cost_usd = ${Number(costUsd.toFixed(8))},
      step_results_json = ${jsonEscape(stepResults)},
      heartbeat_at = ${Math.floor(Date.now() / 1000)},
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE id = ${sqlEscape(runId)};
  `);
}

function pushStep(step) {
  stepResults.push({
    ...step,
    at: new Date().toISOString(),
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    cost_usd: Number(costUsd.toFixed(8)),
  });

  updateRun({
    current_node_key: step.node_key,
    steps_completed: stepResults.length,
  });
}

function ensureWorkflowSeed() {
  const workflowDescription = "Real E2E OpenAI website generation workflow. Nano creates the build spec, mini generates a complete website bundle, validator verifies files, and optional R2/artifact persistence proves the run end to end.";

  d1(`
    INSERT OR IGNORE INTO agentsam_workflows (
      id, tenant_id, workspace_id, workflow_key, display_name, description,
      workflow_type, trigger_type, default_mode, default_task_type, risk_level,
      requires_approval, max_concurrent_nodes, timeout_ms, quality_gate_json,
      metadata_json, is_active, is_platform_global
    )
    VALUES (
      ${sqlEscape(workflowId)},
      ${sqlEscape(TENANT_ID)},
      ${sqlEscape(WORKSPACE_ID)},
      ${sqlEscape(workflowKey)},
      'OpenAI Website Build E2E',
      ${sqlEscape(workflowDescription)},
      'agentic',
      'agent',
      'agent',
      'website_build_e2e',
      'medium',
      0,
      1,
      600000,
      '{"requires_real_openai":true,"requires_generated_files":true,"requires_validation":true,"capture_tokens":true,"capture_cost":true}',
      '{"models":{"spec":"gpt-5.4-nano","build":"gpt-5.4-mini"},"pro_enabled":false,"production_real":true,"button_required":false}',
      1,
      1
    );
  `);

  const nodes = [
    ["nano_build_spec", "agent", "Nano Build Spec", "openai.nano.website_spec", "Use nano to turn the raw user ask into a structured website specification.", 10],
    ["mini_generate_website", "agent", "Mini Generate Website", "openai.mini.generate_website", "Use mini to generate a full static website bundle.", 20],
    ["validate_website_bundle", "eval", "Validate Website Bundle", "eval.website_bundle", "Validate generated files, HTML structure, CSS/JS references, and minimum quality.", 30],
    ["write_local_artifact", "script", "Write Local Artifact", "script.write_generated_site", "Write the generated website to scripts/generated-sites.", 40],
    ["optional_publish_r2", "script", "Optional Publish R2", "script.r2_publish_site", "Optionally publish the generated website bundle to R2.", 50],
    ["persist_final_ledger", "db_query", "Persist Final Ledger", "db.persist_website_build_result", "Persist final output, usage, costs, duration, artifact metadata, and validation results.", 60],
  ];

  for (const [nodeKey, nodeType, title, handler, desc, sort] of nodes) {
    d1(`
      INSERT OR IGNORE INTO agentsam_workflow_nodes (
        workflow_id, node_key, node_type, title, description, handler_key,
        input_schema_json, output_schema_json, timeout_ms, retry_policy_json,
        quality_gate_json, risk_level, requires_approval, is_active, sort_order
      )
      VALUES (
        ${sqlEscape(workflowId)},
        ${sqlEscape(nodeKey)},
        ${sqlEscape(nodeType)},
        ${sqlEscape(title)},
        ${sqlEscape(desc)},
        ${sqlEscape(handler)},
        '{}',
        '{}',
        120000,
        '{"max_retries":1,"backoff":"exponential","delay_ms":1000}',
        '{"requires_step_result":true}',
        'medium',
        0,
        1,
        ${sort}
      );
    `);
  }

  const edges = [
    ["nano_build_spec", "mini_generate_website", 10],
    ["mini_generate_website", "validate_website_bundle", 20],
    ["validate_website_bundle", "write_local_artifact", 30],
    ["write_local_artifact", "optional_publish_r2", 40],
    ["optional_publish_r2", "persist_final_ledger", 50],
  ];

  for (const [from, to, priority] of edges) {
    d1(`
      INSERT OR IGNORE INTO agentsam_workflow_edges (
        workflow_id, from_node_key, to_node_key, condition_type, priority, label
      )
      VALUES (
        ${sqlEscape(workflowId)},
        ${sqlEscape(from)},
        ${sqlEscape(to)},
        'always',
        ${priority},
        ${sqlEscape(`${from} -> ${to}`)}
      );
    `);
  }
}

function createRun() {
  d1(`
    INSERT INTO agentsam_workflow_runs (
      id, workflow_id, workflow_key, display_name,
      tenant_id, workspace_id, user_id, user_email, session_id,
      trigger_type, status, input_json, output_json, step_results_json,
      steps_completed, steps_total, model_used,
      input_tokens, output_tokens, cost_usd,
      environment, graph_mode, current_node_key,
      max_runtime_ms, max_cost_usd, max_total_tokens,
      heartbeat_at, metadata_json
    )
    VALUES (
      ${sqlEscape(runId)},
      ${sqlEscape(workflowId)},
      ${sqlEscape(workflowKey)},
      'OpenAI Website Build E2E',
      ${sqlEscape(TENANT_ID)},
      ${sqlEscape(WORKSPACE_ID)},
      ${sqlEscape(USER_ID)},
      ${sqlEscape(USER_EMAIL)},
      ${sqlEscape(`sess_${slug}`)},
      'agent',
      'running',
      ${jsonEscape({ userPrompt, publish, models: { nano: NANO_MODEL, mini: MINI_MODEL } })},
      '{}',
      '[]',
      0,
      6,
      ${sqlEscape(`${NANO_MODEL}->${MINI_MODEL}`)},
      0,
      0,
      0,
      'production',
      1,
      'nano_build_spec',
      600000,
      0.25,
      120000,
      ${Math.floor(Date.now() / 1000)},
      ${jsonEscape({ e2e: true, generated_site_slug: slug, publish })}
    );
  `);
}

function validateWebsite(files) {
  const errors = [];
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));

  for (const required of ["index.html", "assets/styles.css", "assets/app.js", "README.md"]) {
    if (!byPath[required]) errors.push(`Missing ${required}`);
  }

  if (byPath["index.html"] && !byPath["index.html"].includes("assets/styles.css")) {
    errors.push("index.html does not reference styles.css");
  }

  if (byPath["index.html"] && !byPath["index.html"].includes("assets/app.js")) {
    errors.push("index.html does not reference app.js");
  }

  if (byPath["index.html"] && byPath["index.html"].length < 2500) {
    errors.push("index.html is too small to prove a real website build");
  }

  if (byPath["assets/styles.css"] && byPath["assets/styles.css"].length < 1500) {
    errors.push("styles.css is too small to prove real styling");
  }

  if (byPath["assets/app.js"] && byPath["assets/app.js"].length < 500) {
    errors.push("app.js is too small to prove real interactivity");
  }

  return {
    passed: errors.length === 0,
    errors,
    file_count: files.length,
    total_bytes: files.reduce((sum, f) => sum + Buffer.byteLength(f.content || "", "utf8"), 0),
  };
}

function writeFiles(files) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const file of files) {
    const safePath = file.path.replace(/^\/+/, "").replace(/\.\./g, "");
    const full = path.join(outDir, safePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, file.content || "", "utf8");
  }
}

function publishFiles(files) {
  const uploaded = [];
  for (const file of files) {
    const safePath = file.path.replace(/^\/+/, "").replace(/\.\./g, "");
    const local = path.join(outDir, safePath);
    const key = `agent-sites/${slug}/${safePath}`;
    const result = r2Put(local, key);
    uploaded.push({ path: safePath, r2_key: key, result: result.slice(0, 500) });
  }
  return uploaded;
}

function registerArtifact(uploaded, validation) {
  const artifactId = `art_${crypto.randomBytes(8).toString("hex")}`;
  const r2Key = `agent-sites/${slug}/index.html`;
  const publicUrl = `https://assets.inneranimalmedia.com/${r2Key}`;

  d1(`
    INSERT INTO agentsam_artifacts (
      id, user_id, tenant_id, workspace_id, name, description,
      artifact_type, r2_key, public_url, source, tags,
      is_public, file_size_bytes
    )
    VALUES (
      ${sqlEscape(artifactId)},
      ${sqlEscape(USER_ID)},
      ${sqlEscape(TENANT_ID)},
      ${sqlEscape(WORKSPACE_ID)},
      ${sqlEscape(`OpenAI E2E Website - ${slug}`)},
      ${sqlEscape("Website generated by gpt-5.4-nano + gpt-5.4-mini E2E workflow.")},
      'html',
      ${sqlEscape(r2Key)},
      ${sqlEscape(publicUrl)},
      'agent_openai_website_build_e2e',
      ${jsonEscape(["openai", "gpt-5.4-mini", "website", "e2e", "verified"])},
      1,
      ${validation.total_bytes}
    );
  `);

  return { artifact_id: artifactId, public_url: publicUrl, r2_key: r2Key };
}

async function main() {
  console.log(`\nStarting ${workflowKey}`);
  console.log(`Run: ${runId}`);
  console.log(`Prompt: ${userPrompt}\n`);

  ensureWorkflowSeed();
  createRun();

  try {
    pushStep({
      node_key: "nano_build_spec",
      status: "running",
      model: NANO_MODEL,
      message: "Creating website specification with nano.",
    });

    const specResp = await openaiJson({
      model: NANO_MODEL,
      maxOutputTokens: 4000,
      system: "You are Agent Sam's cheap routing/spec model. Return JSON only. No markdown.",
      user: `
Create a structured website build spec from this user request.

User request:
${userPrompt}

Return JSON with:
{
  "site_name": string,
  "audience": string,
  "goal": string,
  "pages": string[],
  "sections": string[],
  "visual_style": string,
  "required_features": string[],
  "copy_direction": string,
  "validation_criteria": string[]
}
`,
    });

    const spec = extractJson(specResp.text);

    stepResults[stepResults.length - 1] = {
      ...stepResults[stepResults.length - 1],
      status: "completed",
      usage: specResp.usage,
      output: spec,
    };
    updateRun({ current_node_key: "mini_generate_website" });

    pushStep({
      node_key: "mini_generate_website",
      status: "running",
      model: MINI_MODEL,
      message: "Generating complete website bundle with mini.",
    });

    const buildResp = await openaiJson({
      model: MINI_MODEL,
      maxOutputTokens: 32000,
      system: "You are Agent Sam's website builder. Return JSON only. No markdown fences. Generate production-quality static website files.",
      user: `

MANDATORY OUTPUT CONTRACT FOR THE WEBSITE BUILD:
Return ONLY valid JSON.

The JSON must include:
{
  "site_name": "...",
  "summary": "...",
  "files": [
    { "path": "index.html", "content": "..." },
    { "path": "about.html", "content": "..." },
    { "path": "platform.html", "content": "..." },
    { "path": "pricing.html", "content": "..." },
    { "path": "contact.html", "content": "..." },
    { "path": "assets/styles.css", "content": "..." },
    { "path": "assets/app.js", "content": "..." },
    { "path": "README.md", "content": "..." }
  ]
}

Do not omit any required file.
Do not use root-level styles.css.
Do not use root-level app.js.
Every root HTML page must include:
<link rel="stylesheet" href="assets/styles.css">
<script src="assets/app.js" defer></script>

Build a complete static website bundle from this spec:

${JSON.stringify(spec, null, 2)}

Hard requirements:
- Return JSON only.
- Create at minimum these files:
  - index.html
  - styles.css
  - app.js
  - README.md
- index.html must link ./styles.css and ./app.js.
- The website must be polished, responsive, modern, and visually impressive.
- No external paid assets.
- No secrets.
- No placeholders like TODO.
- Make the copy specific to Inner Animal Media and Agent Sam.
- Include sections for:
  hero,
  proof metrics,
  autonomous workflow,
  model routing nano/mini,
  artifacts/library,
  analytics,
  Cloudflare infrastructure,
  call to action.
- app.js should include real interactivity like tab switching, live metric animation, or workflow step playback.

Return exactly:
{
  "summary": string,
  "files": [
    {"path": "index.html", "content": "..."},
    {"path": "assets/styles.css", "content": "..."},
    {"path": "assets/app.js", "content": "..."},
    {"path": "README.md", "content": "..."}
  ]
}
`,
    });

    const bundle = extractJson(buildResp.text);
    if (!Array.isArray(bundle.files)) throw new Error("Mini response missing files array.");

    stepResults[stepResults.length - 1] = {
      ...stepResults[stepResults.length - 1],
      status: "completed",
      usage: buildResp.usage,
      summary: bundle.summary,
      files: bundle.files.map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.content || "", "utf8") })),
    };
    updateRun({ current_node_key: "validate_website_bundle" });

    pushStep({
      node_key: "validate_website_bundle",
      status: "running",
      message: "Validating generated website bundle.",
    });

    const validation = validateWebsite(bundle.files);

    stepResults[stepResults.length - 1] = {
      ...stepResults[stepResults.length - 1],
      status: validation.passed ? "completed" : "failed",
      validation,
    };
    updateRun({ current_node_key: "write_local_artifact" });

    if (!validation.passed) {
      throw new Error(`Website validation failed: ${validation.errors.join("; ")}. Generated file paths: ${JSON.stringify(generatedFileList(files || generatedFiles || website?.files || site?.files || []))}`);
    }

    pushStep({
      node_key: "write_local_artifact",
      status: "running",
      message: `Writing website files to ${outDir}`,
    });

    writeFiles(bundle.files);

    stepResults[stepResults.length - 1] = {
      ...stepResults[stepResults.length - 1],
      status: "completed",
      outDir,
      files: bundle.files.map((f) => f.path),
    };
    updateRun({ current_node_key: "optional_publish_r2" });

    let uploaded = [];
    let artifact = null;

    pushStep({
      node_key: "optional_publish_r2",
      status: publish ? "running" : "skipped",
      message: publish ? "Publishing website files to R2." : "Skipped R2 publish. Re-run with --publish to upload.",
    });

    if (publish) {
      uploaded = publishFiles(bundle.files);
      artifact = registerArtifact(uploaded, validation);

      stepResults[stepResults.length - 1] = {
        ...stepResults[stepResults.length - 1],
        status: "completed",
        uploaded,
        artifact,
      };
    }

    updateRun({ current_node_key: "persist_final_ledger" });

    pushStep({
      node_key: "persist_final_ledger",
      status: "running",
      message: "Persisting final run ledger.",
    });

    const durationMs = Date.now() - now;
    const output = {
      success: true,
      workflow_key: workflowKey,
      run_id: runId,
      generated_site_slug: slug,
      local_dir: outDir,
      published: publish,
      artifact,
      validation,
      files: bundle.files.map((f) => ({
        path: f.path,
        bytes: Buffer.byteLength(f.content || "", "utf8"),
      })),
      models: {
        nano: NANO_MODEL,
        mini: MINI_MODEL,
      },
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: Number(costUsd.toFixed(8)),
        duration_ms: durationMs,
      },
    };

    stepResults[stepResults.length - 1] = {
      ...stepResults[stepResults.length - 1],
      status: "completed",
      output,
    };

    d1(`
      UPDATE agentsam_workflow_runs
      SET
        status = 'completed',
        output_json = ${jsonEscape(output)},
        step_results_json = ${jsonEscape(stepResults)},
        steps_completed = 6,
        steps_total = 6,
        current_node_key = 'persist_final_ledger',
        model_used = ${sqlEscape(`${NANO_MODEL}->${MINI_MODEL}`)},
        input_tokens = ${Math.round(inputTokens)},
        output_tokens = ${Math.round(outputTokens)},
        cost_usd = ${Number(costUsd.toFixed(8))},
        duration_ms = ${durationMs},
        completed_at = ${Math.floor(Date.now() / 1000)},
        heartbeat_at = ${Math.floor(Date.now() / 1000)},
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
      WHERE id = ${sqlEscape(runId)};
    `);

    console.log("\nE2E WEBSITE BUILD COMPLETE");
    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    const durationMs = Date.now() - now;
    const error = err?.stack || err?.message || String(err);

    try {
      d1(`
        UPDATE agentsam_workflow_runs
        SET
          status = 'failed',
          error_message = ${sqlEscape(error.slice(0, 4000))},
          output_json = ${jsonEscape({ success: false, error })},
          step_results_json = ${jsonEscape(stepResults)},
          input_tokens = ${Math.round(inputTokens)},
          output_tokens = ${Math.round(outputTokens)},
          cost_usd = ${Number(costUsd.toFixed(8))},
          duration_ms = ${durationMs},
          completed_at = ${Math.floor(Date.now() / 1000)},
          heartbeat_at = ${Math.floor(Date.now() / 1000)},
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ${sqlEscape(runId)};
      `);
    } catch (dbErr) {
      console.error("Failed to persist failure:", dbErr?.message || dbErr);
    }

    console.error("\nE2E WEBSITE BUILD FAILED");
    console.error(error);
    process.exit(1);
  }
}

main();
