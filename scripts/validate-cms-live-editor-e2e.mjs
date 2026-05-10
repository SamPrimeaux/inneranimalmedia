#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import crypto from "node:crypto";

const required = ["IAM_D1_DB", "IAM_TENANT_ID", "IAM_WORKSPACE_ID", "IAM_USER_ID", "CLOUDFLARE_R2_BUCKET"];

for (const key of required) {
  if (!process.env[key] || !String(process.env[key]).trim()) {
    throw new Error(`Missing ${key}. Refusing to run without explicit environment scope.`);
  }
}

const DB = process.env.IAM_D1_DB;
const tenantId = process.env.IAM_TENANT_ID;
const workspaceId = process.env.IAM_WORKSPACE_ID;
const userId = process.env.IAM_USER_ID;
const bucket = process.env.CLOUDFLARE_R2_BUCKET;

const workflowId = "wf_cms_live_editor_dev_app";
const workflowKey = "cms_live_editor_dev_app";
const planId = "plan_cms_live_editor_dev_20260509";
const todoId = "todo_cms_live_editor";
const projectContextId = "ctx_project_cms_live_editor_dev_app";
const modelKey = process.env.AGENTSAM_E2E_MODEL || "gpt-5.4-nano";

const runStamp = new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\..+/, "");
const runId = `cms_live_editor_e2e_${runStamp}_${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`;

const safePrefix = `cms/test-runs/live-editor-template-library/${runId}`;
const captureKey = `captures/inneranimalmedia/results/${runId}.json`;
const analyticsKey = `analytics/agentsam/cms-live-editor/${runId}.json`;
const manifestKey = `${safePrefix}/manifest.json`;

function q(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replaceAll("'", "''")}'`;
}

function sh(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: "utf8",
    stdio: opts.stdio || ["ignore", "pipe", "pipe"]
  });
}

function d1(sql, json = true) {
  const args = ["wrangler", "d1", "execute", DB, "--remote"];
  if (json) args.push("--json");
  args.push("--command", sql);
  const out = sh("npx", args);
  if (!json) return out;
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`No JSON in wrangler output:\n${out}`);
  return JSON.parse(out.slice(start))?.[0]?.results || [];
}

function r2put(key, file) {
  sh("npx", ["wrangler", "r2", "object", "put", `${bucket}/${key}`, "--file", file, "--remote"], { stdio: "pipe" });
}

function r2get(key, file) {
  sh("npx", ["wrangler", "r2", "object", "get", `${bucket}/${key}`, "--file", file, "--remote"], { stdio: "pipe" });
}

function tableCount(label, sql) {
  const rows = d1(sql);
  return {
    label,
    count: Number(Object.values(rows[0] || { count: 0 })[0] || 0)
  };
}

function main() {
  fs.mkdirSync("tmp/cms-live-editor-e2e", { recursive: true });

  const checks = [];

  checks.push(tableCount("todo", `
    SELECT COUNT(*) AS count
    FROM agentsam_todo
    WHERE id=${q(todoId)}
      AND tenant_id=${q(tenantId)};
  `));

  checks.push(tableCount("plan", `
    SELECT COUNT(*) AS count
    FROM agentsam_plans
    WHERE id=${q(planId)}
      AND tenant_id=${q(tenantId)}
      AND workspace_id=${q(workspaceId)};
  `));

  checks.push(tableCount("project_context", `
    SELECT COUNT(*) AS count
    FROM agentsam_project_context
    WHERE id=${q(projectContextId)}
      AND tenant_id=${q(tenantId)}
      AND linked_plan_id=${q(planId)};
  `));

  checks.push(tableCount("workflow", `
    SELECT COUNT(*) AS count
    FROM agentsam_workflows
    WHERE id=${q(workflowId)}
      AND workflow_key=${q(workflowKey)};
  `));

  checks.push(tableCount("workflow_runs", `
    SELECT COUNT(*) AS count
    FROM agentsam_workflow_runs
    WHERE workflow_id=${q(workflowId)}
      AND tenant_id=${q(tenantId)}
      AND workspace_id=${q(workspaceId)}
      AND id LIKE 'wrun_cms_live_editor_wire_%';
  `));

  checks.push(tableCount("prompt_routes", `
    SELECT COUNT(*) AS count
    FROM agentsam_prompt_routes
    WHERE route_key LIKE 'cms_live_editor.%'
      AND is_active=1;
  `));

  checks.push(tableCount("prompt_versions", `
    SELECT COUNT(*) AS count
    FROM agentsam_prompt_versions
    WHERE prompt_key LIKE 'prompt_cms_live_editor%'
      AND is_active=1;
  `));

  checks.push(tableCount("tool_chain", `
    SELECT COUNT(*) AS count
    FROM agentsam_tool_chain
    WHERE workflow_run_id LIKE 'wrun_cms_live_editor_wire_%'
      AND tenant_id=${q(tenantId)}
      AND workspace_id=${q(workspaceId)}
      AND execution_step_id IS NOT NULL;
  `));

  checks.push(tableCount("dependency_graph", `
    SELECT COUNT(*) AS count
    FROM agentsam_execution_dependency_graph
    WHERE workflow_run_id LIKE 'wrun_cms_live_editor_wire_%'
      AND tenant_id=${q(tenantId)}
      AND workspace_id=${q(workspaceId)};
  `));

  checks.push(tableCount("execution_steps", `
    SELECT COUNT(*) AS count
    FROM agentsam_execution_steps
    WHERE execution_id LIKE 'wrun_cms_live_editor_wire_%';
  `));

  checks.push(tableCount("performance_metrics", `
    SELECT COUNT(*) AS count
    FROM agentsam_execution_performance_metrics
    WHERE workflow_id=${q(workflowId)}
      AND tenant_id=${q(tenantId)}
      AND workspace_id=${q(workspaceId)};
  `));

  const promptCacheRows = d1(`
    SELECT COUNT(*) AS count
    FROM agentsam_prompt_cache_keys
    WHERE tenant_id=${q(tenantId)}
      AND workspace_id=${q(workspaceId)}
      AND (
        source_id LIKE 'pver_cms_live_editor_%'
        OR route_key LIKE 'cms_live_editor.%'
      );
  `);

  checks.push({
    label: "prompt_cache_keys",
    count: Number(promptCacheRows?.[0]?.count || 0)
  });

  const failed = checks.filter((c) => !c.warn_only && c.count <= 0);
  const warnings = checks.filter((c) => c.warn_only && c.count <= 0);

  const manifest = {
    run_id: runId,
    pass: failed.length === 0,
    tenant_id: tenantId,
    workspace_id: workspaceId,
    user_id: userId,
    model_key: modelKey,
    bucket,
    safe_prefix: safePrefix,
    r2_keys: {
      manifest: manifestKey,
      capture: captureKey,
      analytics: analyticsKey
    },
    checks,
    failures: failed,
    warnings,
    created_at: new Date().toISOString(),
    next_action: failed.length === 0
      ? "Proceed to nano-first artifact generation dry run."
      : "Fix missing required runtime rows before artifact generation."
  };

  const localManifest = `tmp/cms-live-editor-e2e/${runId}.json`;
  fs.writeFileSync(localManifest, JSON.stringify(manifest, null, 2));

  r2put(manifestKey, localManifest);
  r2put(captureKey, localManifest);
  r2put(analyticsKey, localManifest);

  const readback = `tmp/cms-live-editor-e2e/${runId}.readback.json`;
  r2get(manifestKey, readback);

  const readbackJson = JSON.parse(fs.readFileSync(readback, "utf8"));
  const r2ReadbackOk = readbackJson.run_id === runId && readbackJson.bucket === bucket;

  const artifactId = `art_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;

  d1(`
    INSERT OR REPLACE INTO agentsam_artifacts (
      id,
      user_id,
      tenant_id,
      workspace_id,
      name,
      description,
      artifact_type,
      r2_key,
      public_url,
      source,
      tags,
      is_public,
      file_size_bytes,
      created_at,
      updated_at
    )
    VALUES (
      ${q(artifactId)},
      ${q(userId)},
      ${q(tenantId)},
      ${q(workspaceId)},
      ${q(`CMS Live Editor E2E Validation ${runId}`)},
      ${q("End-to-end validation manifest for CMS live editor workflow/runtime/R2/artifact registry readiness.")},
      'json',
      ${q(manifestKey)},
      NULL,
      'cms_live_editor_e2e_validation',
      ${q(JSON.stringify(["cms","live-editor","e2e","validation","r2","agentsam"]))},
      0,
      ${fs.statSync(localManifest).size},
      unixepoch(),
      unixepoch()
    );
  `, false);

  const artifactCheck = d1(`
    SELECT COUNT(*) AS count
    FROM agentsam_artifacts
    WHERE id=${q(artifactId)}
      AND r2_key=${q(manifestKey)}
      AND tenant_id=${q(tenantId)}
      AND workspace_id=${q(workspaceId)};
  `);

  const final = {
    ...manifest,
    r2_readback_ok: r2ReadbackOk,
    artifact_registered: Number(artifactCheck?.[0]?.count || 0) === 1,
    artifact_id: artifactId
  };

  final.pass = final.pass && final.r2_readback_ok && final.artifact_registered;

  fs.writeFileSync(localManifest, JSON.stringify(final, null, 2));
  r2put(captureKey, localManifest);
  r2put(analyticsKey, localManifest);

  console.log(JSON.stringify(final, null, 2));

  if (!final.pass) process.exit(1);
}

main();
