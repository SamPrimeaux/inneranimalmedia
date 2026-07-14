#!/usr/bin/env bun
/**
 * Cursor stop hook — dual producer into Worker agent-run telemetry sink.
 * Set AGENT_TELEMETRY_URL (e.g. https://inneranimalmedia.com/api/internal/agent-run-telemetry)
 * and AGENT_TELEMETRY_SECRET (= Worker INTERNAL_API_SECRET) in the environment.
 *
 * Tracks consecutive fails under .cursor/hooks/.stop-fail-counts.json
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const COUNT_PATH = join(__dirname, ".stop-fail-counts.json");

type StopPayload = {
  status?: string;
  conversation_id?: string;
  session_id?: string;
  generation_id?: string;
  error?: string;
  model?: string;
};

async function readStdin(): Promise<StopPayload> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as StopPayload;
  } catch {
    return {};
  }
}

async function loadCounts(): Promise<Record<string, number>> {
  try {
    return JSON.parse(await readFile(COUNT_PATH, "utf8")) as Record<string, number>;
  } catch {
    return {};
  }
}

async function saveCounts(map: Record<string, number>) {
  await mkdir(__dirname, { recursive: true });
  await writeFile(COUNT_PATH, JSON.stringify(map, null, 2));
}

async function main() {
  const payload = await readStdin();
  const sessionKey = String(
    payload.conversation_id || payload.session_id || payload.generation_id || "default",
  );
  const failed =
    String(payload.status || "").toLowerCase() === "error" ||
    String(payload.status || "").toLowerCase() === "failed" ||
    Boolean(payload.error);

  const counts = await loadCounts();
  counts[sessionKey] = failed ? (counts[sessionKey] || 0) + 1 : 0;
  await saveCounts(counts);

  const url = process.env.AGENT_TELEMETRY_URL?.trim();
  const secret = process.env.AGENT_TELEMETRY_SECRET?.trim();
  if (!url || !secret) {
    // Fail open for desk UX when secrets are unset
    process.exit(0);
  }

  const body = {
    success: !failed,
    session_id: sessionKey,
    agent_run_id: payload.generation_id || `cursor_${sessionKey}`,
    workspace_id: process.env.AGENT_TELEMETRY_WORKSPACE_ID || "ws_inneranimalmedia",
    tenant_id: process.env.AGENT_TELEMETRY_TENANT_ID || "tenant_inneranimalmedia",
    model_key: payload.model || null,
    error_message: payload.error || (failed ? "cursor_stop_failed" : null),
    source: "cursor_stop",
    consecutive_fails: counts[sessionKey],
  };

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Fail open
  }
  process.exit(0);
}

main();
