/**
 * Minimal MCP server skeleton for Cloudflare Workers.
 * Protocol: JSON-RPC 2.0 over HTTP; response as SSE line "data: <JSON>".
 * Auth: Bearer token via env.MCP_AUTH_TOKEN.
 *
 * Usage: Copy to mcp-server/src/index.js (back up the current bundle first),
 * or set main to this file in wrangler.jsonc. Add R2 binding for r2_write (see below).
 */

const MCP_ROUTE = '/mcp';
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'InnerAnimalMedia MCP';
const SERVER_VERSION = '1.0.0';

function unauthorized(message) {
  return new Response(JSON.stringify({ error: 'Unauthorized', message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function validateBearer(request, env) {
  const token = env.MCP_AUTH_TOKEN;
  if (!token) return unauthorized('MCP_AUTH_TOKEN not configured');
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return unauthorized('Missing or invalid Authorization header');
  const supplied = auth.slice(7).trim();
  if (supplied !== token) return unauthorized('Invalid token');
  return null;
}

function sseResponse(json) {
  return new Response('data: ' + JSON.stringify(json) + '\n\n', {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
}

function textContent(text) {
  return { content: [{ type: 'text', text: String(text) }] };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, '') || '/';

    if (path === '/') {
      return new Response(
        JSON.stringify({
          service: 'mcp-server',
          status: 'ok',
          mcp_endpoint: MCP_ROUTE,
          auth: 'Bearer token required',
        }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (path !== MCP_ROUTE) {
      return new Response('Not Found', { status: 404 });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const accept = request.headers.get('Accept') || '';
    if (!accept.includes('application/json') && !accept.includes('text/event-stream')) {
      return new Response('Not Acceptable', {
        status: 406,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    const authError = validateBearer(request, env);
    if (authError) return authError;

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const id = body.id;
    const method = body.method;
    const params = body.params || {};

    if (method === 'initialize') {
      return sseResponse({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: true } },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        },
      });
    }

    if (method === 'tools/list') {
      const tools = [
        { name: 'r2_write', description: 'Write a file to R2 storage', inputSchema: { type: 'object', properties: { key: { type: 'string' }, body: { type: 'string' } }, required: ['key', 'body'] } },
        { name: 'r2_read', description: 'Read an object from R2', inputSchema: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] } },
        { name: 'r2_list', description: 'List R2 objects with optional prefix', inputSchema: { type: 'object', properties: { prefix: { type: 'string' } } } },
        { name: 'd1_query', description: 'Run a SELECT query on D1', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'd1_write', description: 'Run an INSERT/UPDATE/DELETE on D1', inputSchema: { type: 'object', properties: { sql: { type: 'string' }, params: { type: 'array' } }, required: ['sql'] } },
        { name: 'terminal_execute', description: 'Execute a shell command', inputSchema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
        { name: 'knowledge_search', description: 'Search knowledge base / vectorize', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
        { name: 'list_clients', description: 'List clients from D1', inputSchema: { type: 'object' } },
        { name: 'get_worker_services', description: 'List Worker services for a client', inputSchema: { type: 'object', properties: { client_slug: { type: 'string' }, client_id: { type: 'string' } } } },
        { name: 'get_deploy_command', description: 'Get wrangler deploy command for a worker', inputSchema: { type: 'object', properties: { worker_name: { type: 'string' }, repo_path: { type: 'string' } }, required: ['worker_name'] } },
      ];
      return sseResponse({
        jsonrpc: '2.0',
        id,
        result: { tools },
      });
    }

    if (method === 'tools/call') {
      const name = params.name;
      const args = params.arguments || {};
      let result;

      try {
        if (name === 'r2_write') {
          if (!env.R2) {
            result = textContent('Error: R2 binding not configured. Add R2 bucket (e.g. agent-sam or iam-platform) to wrangler.jsonc.');
          } else {
            const key = args.key || args.path;
            const bodyContent = args.body ?? args.content ?? '';
            if (!key) {
              result = textContent('Error: key (or path) required');
            } else {
              await env.R2.put(key, bodyContent, {
                httpMetadata: args.contentType ? { contentType: args.contentType } : undefined,
              });
              result = textContent('OK: wrote ' + key);
            }
          }
        } else if (name === 'r2_read') {
          if (!env.R2) {
            result = textContent('Error: R2 binding not configured');
          } else {
            const key = args.key || args.path;
            const obj = key ? await env.R2.get(key) : null;
            result = textContent(obj ? await obj.text() : 'Key not found: ' + (key || ''));
          }
        } else if (name === 'r2_list') {
          if (!env.R2) {
            result = textContent('Error: R2 binding not configured');
          } else {
            const list = await env.R2.list({ prefix: args.prefix || '', limit: 50 });
            result = textContent(JSON.stringify(list.objects.map((o) => ({ key: o.key, size: o.size }))));
          }
        } else if (name === 'd1_query') {
          if (!env.DB) {
            result = textContent('Error: DB binding not configured');
          } else {
            const sql = (args.query || args.sql || '').trim();
            if (!sql.toUpperCase().startsWith('SELECT')) {
              result = textContent('Error: Only SELECT allowed via d1_query');
            } else {
              const rows = await env.DB.prepare(sql).all();
              result = textContent(JSON.stringify(rows.results ?? []));
            }
          }
        } else if (name === 'd1_write') {
          if (!env.DB) {
            result = textContent('Error: DB binding not configured');
          } else {
            const sql = (args.sql || args.query || '').trim();
            const bindParams = Array.isArray(args.params) ? args.params : [];
            const stmt = env.DB.prepare(sql);
            const run = bindParams.length ? await stmt.bind(...bindParams).run() : await stmt.run();
            result = textContent(JSON.stringify({ changes: run.meta?.changes ?? run.changes ?? 0, success: true }));
          }
        } else if (name === 'terminal_execute') {
          const cmd = args.command || '';
          if (!env.PTY_AUTH_TOKEN) {
            result = textContent('Error: terminal not configured (PTY_AUTH_TOKEN)');
          } else {
            const res = await fetch('https://terminal.inneranimalmedia.com/exec', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.PTY_AUTH_TOKEN },
              body: JSON.stringify({ command: cmd }),
            });
            const data = await res.json().catch(() => ({}));
            result = textContent((data.stdout || '') + (data.stderr ? '\nSTDERR: ' + data.stderr : '') || '(no output)');
          }
        } else if (name === 'knowledge_search') {
          result = textContent('knowledge_search: Implement via AI.autorag or Vectorize in main worker; MCP stub only.');
        } else if (name === 'list_clients') {
          if (!env.DB) {
            result = textContent('Error: DB not configured');
          } else {
            const r = await env.DB.prepare('SELECT id, display_name, slug, primary_email FROM clients ORDER BY display_name').all();
            result = textContent(JSON.stringify(r.results ?? [], null, 2));
          }
        } else if (name === 'get_worker_services') {
          if (!env.DB) {
            result = textContent('Error: DB not configured');
          } else if (args.client_id) {
            const r = await env.DB.prepare('SELECT worker_name, workers_dev_domain, notes FROM worker_services WHERE client_id = ? ORDER BY worker_name').bind(args.client_id).all();
            result = textContent(JSON.stringify(r.results ?? [], null, 2));
          } else if (args.client_slug) {
            const r = await env.DB.prepare(
              'SELECT ws.worker_name, ws.workers_dev_domain, ws.notes FROM worker_services ws JOIN clients c ON c.id = ws.client_id WHERE c.slug = ? ORDER BY ws.worker_name'
            )
              .bind(args.client_slug)
              .all();
            result = textContent(JSON.stringify(r.results ?? [], null, 2));
          } else {
            result = textContent('Provide client_slug or client_id.');
          }
        } else if (name === 'get_deploy_command') {
          if (!env.DB) {
            result = textContent('Error: DB not configured');
          } else {
            const r = await env.DB.prepare('SELECT worker_name, workers_dev_domain FROM worker_services WHERE worker_name = ? LIMIT 1').bind(args.worker_name).all();
            const row = r.results?.[0];
            if (!row) result = textContent('Worker not found: ' + args.worker_name);
            else result = textContent('Deploy: npx wrangler deploy (from repo root). Set secrets first.');
          }
        } else {
          result = textContent('Unknown tool: ' + name);
        }
      } catch (e) {
        result = textContent('Error: ' + (e?.message ?? String(e)));
      }

      return sseResponse({
        jsonrpc: '2.0',
        id,
        result: { content: result.content, isError: false },
      });
    }

    return sseResponse({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found: ' + method },
    });
  },
};
