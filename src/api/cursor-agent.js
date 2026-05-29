/**
 * Cursor Cloud Agents API — spawn, stream, status routes + provider dispatch (cursor_sdk).
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';
import { getVaultSecrets, secretFromVault } from '../core/vault.js';

const CURSOR_API_BASE = 'https://api.cursor.com/v1';
const CURSOR_WEBHOOK_URL = 'https://inneranimalmedia.com/api/webhooks/cursor';

/** @param {any} env */
export function resolveCursorApiKey(env) {
  const key = env?.CURSOR_API_KEY || env?.CURSOR_API_TOKEN;
  return key != null && String(key).trim() !== '' ? String(key).trim() : null;
}

/** @param {any} env */
export async function resolveCursorWebhookSecret(env) {
  let secret = env?.CURSOR_WEBHOOK_SECRET;
  if (secret != null && String(secret).trim() !== '') return String(secret).trim();
  if (env?.DB && (env?.VAULT_KEY || env?.VAULT_MASTER_KEY)) {
    try {
      const vault = await getVaultSecrets(env);
      secret = secretFromVault(vault, env, 'CURSOR_WEBHOOK_SECRET');
      if (secret != null && String(secret).trim() !== '') return String(secret).trim();
    } catch {
      /* vault unavailable */
    }
  }
  return null;
}

/**
 * @param {string} systemPrompt
 * @param {Array<{ role?: string, content?: unknown }>} messages
 */
export function buildCursorPromptFromChat(systemPrompt, messages) {
  const parts = [];
  if (systemPrompt && String(systemPrompt).trim()) {
    parts.push(`System:\n${String(systemPrompt).trim()}`);
  }
  for (const m of messages || []) {
    const role = String(m?.role || 'user').toLowerCase();
    let content = m?.content;
    if (Array.isArray(content)) {
      content = content
        .map((c) => (typeof c === 'string' ? c : c?.text || c?.content || ''))
        .filter(Boolean)
        .join('\n');
    }
    content = String(content ?? '').trim();
    if (!content) continue;
    parts.push(`${role}:\n${content}`);
  }
  return parts.join('\n\n');
}

/**
 * @param {any} env
 * @param {{ prompt: string, model: string, repo?: string | null, branch?: string }} opts
 */
export async function spawnCursorCloudAgent(env, opts) {
  const apiKey = resolveCursorApiKey(env);
  if (!apiKey) {
    return { ok: false, status: 503, error: 'CURSOR_API_KEY not configured' };
  }

  const prompt = String(opts.prompt || '').trim();
  if (!prompt) return { ok: false, status: 400, error: 'prompt required' };

  const model = String(opts.model || 'composer-2.5').trim();
  const repo = opts.repo != null ? String(opts.repo).trim() : '';
  const branch = opts.branch != null ? String(opts.branch).trim() : 'main';
  const webhookSecret = await resolveCursorWebhookSecret(env);

  const spawnRes = await fetch(`${CURSOR_API_BASE}/agents`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      model,
      ...(repo ? { repository: repo, branch } : {}),
      stream: true,
      ...(webhookSecret
        ? {
            webhook: {
              url: CURSOR_WEBHOOK_URL,
              secret: webhookSecret,
            },
          }
        : {}),
    }),
  });

  if (!spawnRes.ok) {
    const errText = await spawnRes.text();
    return {
      ok: false,
      status: spawnRes.status,
      error: `Cursor API error: ${spawnRes.status}`,
      detail: errText.slice(0, 400),
    };
  }

  const raw = await spawnRes.text();
  let agentData = {};
  try {
    agentData = raw ? JSON.parse(raw) : {};
  } catch {
    return { ok: false, status: 502, error: 'Cursor API returned non-JSON response', detail: raw.slice(0, 200) };
  }

  const agentId = agentData.id || agentData.agent_id;
  if (!agentId) {
    return { ok: false, status: 502, error: 'Cursor API missing agent id', detail: raw.slice(0, 200) };
  }

  return {
    ok: true,
    agentId: String(agentId),
    status: agentData.status || 'running',
    model,
  };
}

/**
 * Map Cursor SSE → OpenAI chat.completions chunks (agent tool loop consumer).
 * @param {ReadableStream<Uint8Array>} upstreamBody
 */
function pipeCursorStreamAsOpenAiChat(upstreamBody) {
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    const reader = upstreamBody.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const rawLine = line.slice(5).trim();
          if (!rawLine || rawLine === '[DONE]') continue;
          try {
            const event = JSON.parse(rawLine);
            const text =
              event.content || event.text || event.delta || event.message || '';
            if (
              text &&
              (event.type === 'text' || event.type === 'message' || event.type === 'delta')
            ) {
              await writer.write(
                enc.encode(
                  `data: ${JSON.stringify({
                    choices: [{ delta: { content: String(text) }, finish_reason: null }],
                  })}\n\n`,
                ),
              );
            }
          } catch {
            /* skip */
          }
        }
      }
      await writer.write(enc.encode('data: [DONE]\n\n'));
    } finally {
      await writer.close();
    }
  })().catch((e) => console.warn('[cursor-agent] openai_sse pipe', e?.message ?? e));

  return readable;
}

/**
 * Map Cursor SSE → agent.stream.* events (dashboard /api/cursor routes).
 * @param {ReadableStream<Uint8Array>} upstreamBody
 */
function pipeCursorStreamAsAgentEvents(upstreamBody) {
  const enc = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  (async () => {
    const reader = upstreamBody.getReader();
    const dec = new TextDecoder();
    let buffer = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const event = JSON.parse(raw);
            let mapped = null;
            if (event.type === 'text' || event.type === 'message') {
              mapped = {
                type: 'agent.stream.delta',
                delta: event.content || event.text || '',
                ts: Date.now(),
              };
            } else if (event.type === 'tool_use' || event.type === 'tool_call') {
              mapped = { type: 'agent.tool.start', tool: event.name || event.tool, ts: Date.now() };
            } else if (event.type === 'tool_result') {
              mapped = { type: 'agent.tool.done', tool: event.name || event.tool, ts: Date.now() };
            } else if (event.type === 'done' || event.type === 'complete') {
              mapped = { type: 'agent.stream.done', ts: Date.now() };
            } else if (event.type === 'file_write' || event.type === 'edit') {
              mapped = {
                type: 'agent.file.changed',
                file: event.path || event.file,
                action: event.type,
                ts: Date.now(),
              };
            }
            if (mapped) {
              await writer.write(enc.encode(`data: ${JSON.stringify(mapped)}\n\n`));
            }
          } catch {
            /* skip malformed events */
          }
        }
      }
    } finally {
      await writer.write(
        enc.encode(`data: ${JSON.stringify({ type: 'agent.stream.done', ts: Date.now() })}\n\n`),
      );
      await writer.close();
    }
  })().catch((e) => console.warn('[cursor-agent] agent_events pipe', e?.message ?? e));

  return readable;
}

/**
 * @param {any} env
 * @param {string} agentId
 */
async function fetchCursorAgentStream(env, agentId) {
  const apiKey = resolveCursorApiKey(env);
  if (!apiKey) return null;
  return fetch(`${CURSOR_API_BASE}/agents/${agentId}/stream`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream',
    },
  });
}

/**
 * Provider dispatch — used by dispatchStream when api_platform = cursor_sdk.
 * @param {any} env
 * @param {Request} _request
 * @param {Record<string, unknown>} params
 */
export async function dispatchCursorComposerStream(env, _request, params) {
  if (!resolveCursorApiKey(env)) {
    return jsonResponse({ error: 'CURSOR_API_KEY not configured' }, 503);
  }

  const modelKey = String(params.modelKey || 'composer-2.5').trim();
  const providerModelId =
    params.providerModelId != null && String(params.providerModelId).trim() !== ''
      ? String(params.providerModelId).trim()
      : modelKey;
  const prompt = buildCursorPromptFromChat(params.systemPrompt, params.messages);

  const spawned = await spawnCursorCloudAgent(env, {
    prompt,
    model: providerModelId,
  });
  if (!spawned.ok) {
    return jsonResponse(
      { error: spawned.error, detail: spawned.detail ?? null },
      spawned.status === 400 ? 400 : 502,
    );
  }

  const agentRunId = params.agentRunId ?? params.agent_run_id ?? null;
  if (env.DB && agentRunId) {
    await env.DB.prepare(
      `UPDATE agentsam_agent_run SET status = 'running', model_id = ? WHERE id = ?`,
    )
      .bind(modelKey, String(agentRunId))
      .run()
      .catch(() => {});
  }

  const upstreamRes = await fetchCursorAgentStream(env, spawned.agentId);
  if (!upstreamRes?.ok || !upstreamRes.body) {
    return jsonResponse(
      { error: `Cursor stream unavailable: ${upstreamRes?.status ?? 'no_body'}` },
      502,
    );
  }

  const readable = pipeCursorStreamAsOpenAiChat(upstreamRes.body);
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'X-Provider': 'cursor_sdk',
      'X-Cursor-Agent-Id': spawned.agentId,
    },
  });
}

export async function handleCursorAgentApi(request, url, env, ctx) {
  const method = request.method.toUpperCase();
  const path = url.pathname.toLowerCase();

  try {
    if (!resolveCursorApiKey(env)) {
      return jsonResponse({ error: 'CURSOR_API_KEY not configured' }, 503);
    }

    if (path === '/api/cursor/agent/spawn' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const { plan_id, prompt, repo, branch = 'main', model = 'composer-2.5' } = body;

      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      let fullPrompt = prompt;
      if (plan_id && env.DB) {
        const plan = await env.DB.prepare('SELECT * FROM agentsam_plans WHERE id = ?').bind(plan_id).first();
        if (plan) {
          const steps = await env.DB.prepare(
            'SELECT title, task_type FROM agentsam_todo WHERE plan_id = ? ORDER BY sort_order',
          )
            .bind(plan_id)
            .all();

          fullPrompt = `${prompt}

Build Plan:
${(steps.results || []).map((s, i) => `${i + 1}. ${s.title}`).join('\n')}

Repository: ${repo || 'current workspace'}
Branch: ${branch}`;
        }
      }

      const spawned = await spawnCursorCloudAgent(env, {
        prompt: fullPrompt,
        model,
        repo,
        branch,
      });
      if (!spawned.ok) {
        return jsonResponse(
          { error: spawned.error, detail: spawned.detail ?? null },
          spawned.status === 400 ? 400 : 502,
        );
      }

      if (env.DB) {
        await env.DB.prepare(`
        INSERT INTO agentsam_agent_run
          (id, user_id, agent_id, status, trigger, model_id, conversation_id, created_at)
        VALUES (?, ?, ?, 'running', 'cursor_api', ?, ?, datetime('now'))
      `)
          .bind(
            'arun_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
            authUser.id,
            spawned.agentId,
            model,
            plan_id || null,
          )
          .run()
          .catch(() => {});
      }

      return jsonResponse({
        agent_id: spawned.agentId,
        status: spawned.status || 'running',
        stream_url: `/api/cursor/agent/${spawned.agentId}/stream`,
        model,
      });
    }

    const streamMatch = url.pathname.match(/^\/api\/cursor\/agent\/([^/]+)\/stream$/i);
    if (streamMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const agentId = streamMatch[1];
      const upstreamRes = await fetchCursorAgentStream(env, agentId);
      if (!upstreamRes?.ok || !upstreamRes.body) {
        return jsonResponse({ error: `Stream unavailable: ${upstreamRes?.status ?? 'no_body'}` }, 502);
      }

      const readable = pipeCursorStreamAsAgentEvents(upstreamRes.body);
      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    const statusMatch = url.pathname.match(/^\/api\/cursor\/agent\/([^/]+)\/status$/i);
    if (statusMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const agentId = statusMatch[1];
      const apiKey = resolveCursorApiKey(env);

      const statusRes = await fetch(`${CURSOR_API_BASE}/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!statusRes.ok) {
        return jsonResponse({ error: `Status unavailable: ${statusRes.status}` }, 502);
      }

      const raw = await statusRes.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        return jsonResponse({ error: 'Invalid status response from Cursor' }, 502);
      }
      return jsonResponse({
        agent_id: agentId,
        status: data.status,
        artifacts: data.artifacts || [],
        created_at: data.created_at,
        completed_at: data.completed_at,
      });
    }

    if (path === '/api/cursor/agents' && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const apiKey = resolveCursorApiKey(env);
      const listRes = await fetch(`${CURSOR_API_BASE}/agents?limit=20`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (!listRes.ok) return jsonResponse({ agents: [] });
      const raw = await listRes.text();
      let data;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        return jsonResponse({ agents: [] });
      }
      return jsonResponse({ agents: data.agents || data.data || [] });
    }

    const cancelMatch = url.pathname.match(/^\/api\/cursor\/agent\/([^/]+)\/cancel$/i);
    if (cancelMatch && method === 'DELETE') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const agentId = cancelMatch[1];
      const apiKey = resolveCursorApiKey(env);
      await fetch(`${CURSOR_API_BASE}/agents/${agentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      return jsonResponse({ ok: true, agent_id: agentId, status: 'cancelled' });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    console.warn('[handleCursorAgentApi]', e?.message ?? e);
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}
