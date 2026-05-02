/**
 * Cursor Cloud Agents API proxy (spawn, SSE stream, status).
 */
import { getAuthUser, jsonResponse } from '../core/auth.js';

const CURSOR_API_BASE = 'https://api.cursor.com/v1';

export async function handleCursorAgentApi(request, url, env, ctx) {
  const method = request.method.toUpperCase();
  const path = url.pathname.toLowerCase();

  try {
    if (!env.CURSOR_API_KEY) {
      return jsonResponse({ error: 'CURSOR_API_KEY not configured' }, 503);
    }

    if (path === '/api/cursor/agent/spawn' && method === 'POST') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const body = await request.json().catch(() => ({}));
      const { plan_id, prompt, repo, branch = 'main', model = 'claude-sonnet-4-5' } = body;

      if (!prompt) return jsonResponse({ error: 'prompt required' }, 400);

      let fullPrompt = prompt;
      if (plan_id && env.DB) {
        const plan = await env.DB.prepare('SELECT * FROM agentsam_plans WHERE id = ?').bind(plan_id).first();
        if (plan) {
          const steps = await env.DB.prepare(
            'SELECT title, task_type FROM agentsam_todo WHERE plan_id = ? ORDER BY sort_order',
          ).bind(plan_id).all();

          fullPrompt = `${prompt}

Build Plan:
${(steps.results || []).map((s, i) => `${i + 1}. ${s.title}`).join('\n')}

Repository: ${repo || 'current workspace'}
Branch: ${branch}`;
        }
      }

      const spawnRes = await fetch(`${CURSOR_API_BASE}/agents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CURSOR_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: fullPrompt,
          model,
          ...(repo ? { repository: repo, branch } : {}),
          stream: true,
        }),
      });

      if (!spawnRes.ok) {
        const errText = await spawnRes.text();
        console.warn('[cursor/spawn] API error:', spawnRes.status, errText.slice(0, 200));
        return jsonResponse({ error: `Cursor API error: ${spawnRes.status}`, detail: errText.slice(0, 200) }, 502);
      }

      const raw = await spawnRes.text();
      let agentData;
      try {
        agentData = raw ? JSON.parse(raw) : {};
      } catch {
        return jsonResponse({ error: 'Cursor API returned non-JSON response' }, 502);
      }
      const agentId = agentData.id || agentData.agent_id;

      if (env.DB) {
        await env.DB.prepare(`
        INSERT INTO agentsam_agent_run
          (id, user_id, agent_id, plan_id, prompt, status, model, created_at)
        VALUES (?, ?, ?, ?, ?, 'running', ?, unixepoch())
      `).bind(
          'arun_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12),
          authUser.id,
          agentId || 'unknown',
          plan_id || null,
          fullPrompt.slice(0, 500),
          model,
        ).run().catch(() => {}); // non-fatal if table schema mismatch
      }

      return jsonResponse({
        agent_id: agentId,
        status: agentData.status || 'running',
        stream_url: `/api/cursor/agent/${agentId}/stream`,
        model,
      });
    }

    const streamMatch = url.pathname.match(/^\/api\/cursor\/agent\/([^/]+)\/stream$/i);
    if (streamMatch && method === 'GET') {
      const authUser = await getAuthUser(request, env);
      if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

      const agentId = streamMatch[1];

      const upstreamRes = await fetch(`${CURSOR_API_BASE}/agents/${agentId}/stream`, {
        headers: {
          Authorization: `Bearer ${env.CURSOR_API_KEY}`,
          Accept: 'text/event-stream',
        },
      });

      if (!upstreamRes.ok) {
        return jsonResponse({ error: `Stream unavailable: ${upstreamRes.status}` }, 502);
      }

      const enc = new TextEncoder();
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      ctx.waitUntil(
        (async () => {
          const reader = upstreamRes.body.getReader();
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
                    mapped = { type: 'agent.stream.delta', delta: event.content || event.text || '', ts: Date.now() };
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
            await writer.write(enc.encode(`data: ${JSON.stringify({ type: 'agent.stream.done', ts: Date.now() })}\n\n`));
            await writer.close();
          }
        })(),
      );

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

      const statusRes = await fetch(`${CURSOR_API_BASE}/agents/${agentId}`, {
        headers: { Authorization: `Bearer ${env.CURSOR_API_KEY}` },
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

      const listRes = await fetch(`${CURSOR_API_BASE}/agents?limit=20`, {
        headers: { Authorization: `Bearer ${env.CURSOR_API_KEY}` },
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
      await fetch(`${CURSOR_API_BASE}/agents/${agentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${env.CURSOR_API_KEY}` },
      });

      return jsonResponse({ ok: true, agent_id: agentId, status: 'cancelled' });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (e) {
    console.warn('[handleCursorAgentApi]', e?.message ?? e);
    return jsonResponse({ error: String(e?.message || e) }, 500);
  }
}
