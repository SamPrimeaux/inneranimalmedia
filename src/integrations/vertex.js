/**
 * Integration Layer: Google Vertex AI
 * Streaming chat via Vertex AI Generative AI endpoint.
 * Auth: GOOGLE_SERVICE_ACCOUNT_JSON → RS256 JWT → OAuth2 access token.
 *
 * Requires (production secrets):
 *   GOOGLE_SERVICE_ACCOUNT_JSON — service account JSON with Vertex AI user role
 *   GOOGLE_PROJECT_ID           — GCP project ID
 *
 * Models: all rows with provider='vertex' in ai_models table.
 * Endpoint pattern:
 *   https://{region}-aiplatform.googleapis.com/v1/projects/{project}/
 *   locations/{region}/publishers/google/models/{model}:streamGenerateContent
 */
import { jsonResponse } from '../core/responses.js';

const VERTEX_REGION  = 'us-central1';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const SCOPE          = 'https://www.googleapis.com/auth/cloud-platform';

// ─── JWT / OAuth2 ─────────────────────────────────────────────────────────────

function b64url(str) {
  return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlBytes(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signServiceAccountJwt(sa) {
  const now = Math.floor(Date.now() / 1000);

  const header  = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss:   sa.client_email,
    sub:   sa.client_email,
    aud:   TOKEN_ENDPOINT,
    iat:   now,
    exp:   now + 3600,
    scope: SCOPE,
  }));

  const signingInput = `${header}.${payload}`;

  const pemBody  = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');
  const keyBytes = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  return `${signingInput}.${b64urlBytes(new Uint8Array(sigBytes))}`;
}

async function getAccessToken(saJson) {
  let sa;
  try { sa = JSON.parse(saJson); } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON missing client_email or private_key');
  }

  const jwt = await signServiceAccountJwt(sa);
  const res = await fetch(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Token exchange failed: ${data.error_description || data.error || res.status}`);
  }
  return data.access_token;
}

// ─── Format Conversion ────────────────────────────────────────────────────────

/**
 * Convert messages to Gemini contents format.
 * Handles Anthropic multi-part, OpenAI tool_calls, and plain string content.
 */
function toGeminiContents(messages) {
  const contents = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    const role = msg.role === 'assistant' ? 'model' : 'user';

    if (typeof msg.content === 'string') {
      contents.push({ role, parts: [{ text: msg.content }] });
      continue;
    }

    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const block of msg.content) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_use') {
          parts.push({ functionCall: { name: block.name, args: block.input || {} } });
        } else if (block.type === 'tool_result') {
          parts.push({
            functionResponse: {
              name:     block.tool_use_id || 'tool',
              response: { content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content) },
            },
          });
        }
      }
      if (parts.length) contents.push({ role, parts });
      continue;
    }

    if (msg.tool_calls?.length) {
      const parts = msg.tool_calls.map(tc => ({
        functionCall: {
          name: tc.function.name,
          args: (() => { try { return JSON.parse(tc.function.arguments); } catch { return {}; } })(),
        },
      }));
      contents.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === 'tool') {
      contents.push({
        role:  'user',
        parts: [{ functionResponse: { name: msg.name || 'tool', response: { content: msg.content || '' } } }],
      });
      continue;
    }
  }

  return contents;
}

/**
 * Convert tool definitions (Anthropic or OpenAI format) to Gemini functionDeclarations.
 */
function toGeminiFunctionDeclarations(tools) {
  if (!tools?.length) return null;
  const declarations = tools.map(t => {
    if (t.type === 'function' && t.function) {
      return { name: t.function.name, description: t.function.description || '', parameters: t.function.parameters || { type: 'object', properties: {} } };
    }
    return { name: t.name, description: t.description || '', parameters: t.input_schema || { type: 'object', properties: {} } };
  });
  return [{ functionDeclarations: declarations }];
}

function extractSystemText(systemPrompt, messages) {
  if (systemPrompt) return systemPrompt;
  return messages.find(m => m.role === 'system')?.content || null;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Stream a chat completion via Vertex AI.
 * Returns a Response with text/event-stream SSE in {delta: {text}} format.
 */
export async function chatWithToolsVertex(env, request, params) {
  const { modelKey, systemPrompt, messages = [], tools = [] } = params;

  const saJson    = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const projectId = env.GOOGLE_PROJECT_ID;

  if (!saJson)    return jsonResponse({ error: 'GOOGLE_SERVICE_ACCOUNT_JSON not configured' }, 503);
  if (!projectId) return jsonResponse({ error: 'GOOGLE_PROJECT_ID not configured — Vertex is production-only' }, 503);
  if (!modelKey)  return jsonResponse({ error: 'modelKey required' }, 400);

  let accessToken;
  try {
    accessToken = await getAccessToken(saJson);
  } catch (e) {
    return jsonResponse({ error: 'Vertex auth failed', detail: e.message }, 502);
  }

  const endpoint =
    `https://${VERTEX_REGION}-aiplatform.googleapis.com/v1` +
    `/projects/${projectId}/locations/${VERTEX_REGION}` +
    `/publishers/google/models/${modelKey}:streamGenerateContent?alt=sse`;

  const systemText = extractSystemText(systemPrompt, messages);
  const contents   = toGeminiContents(messages);
  const gTools     = toGeminiFunctionDeclarations(tools);

  const body = {
    contents,
    ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
    ...(gTools     ? { tools: gTools } : {}),
    generationConfig: { temperature: 1.0, maxOutputTokens: 8192, topP: 0.95 },
  };

  let upstream;
  try {
    upstream = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
  } catch (e) {
    return jsonResponse({ error: 'Vertex request failed', detail: e.message }, 502);
  }

  if (!upstream.ok) {
    const err = await upstream.text().catch(() => '');
    return jsonResponse({ error: 'Vertex API error', status: upstream.status, detail: err.slice(0, 500) }, upstream.status);
  }

  // Proxy and normalize the SSE stream
  const { readable, writable } = new TransformStream();
  const writer  = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const reader = upstream.body.getReader();
      const dec    = new TextDecoder();
      let   buf    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });

        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;

          let chunk;
          try { chunk = JSON.parse(raw); } catch { continue; }

          const candidate = chunk.candidates?.[0];
          if (!candidate) continue;

          for (const part of candidate.content?.parts || []) {
            if (part.text) {
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ delta: { text: part.text } })}\n\n`)
              );
            }
            if (part.functionCall) {
              await writer.write(
                encoder.encode(`data: ${JSON.stringify({ delta: { tool_use: { name: part.functionCall.name, input: part.functionCall.args } } })}\n\n`)
              );
            }
          }

          if (chunk.usageMetadata) {
            await writer.write(
              encoder.encode(`data: ${JSON.stringify({ usage: { input_tokens: chunk.usageMetadata.promptTokenCount || 0, output_tokens: chunk.usageMetadata.candidatesTokenCount || 0 } })}\n\n`)
            );
          }
        }
      }

      await writer.write(encoder.encode('data: [DONE]\n\n'));
    } catch (e) {
      await writer.write(encoder.encode(`data: ${JSON.stringify({ error: e.message })}\n\n`));
    } finally {
      await writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
