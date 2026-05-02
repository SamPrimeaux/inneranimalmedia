#!/usr/bin/env bash
# =============================================================================
# PATCH FILE — Agent Sam Batch 1
# Session: 2026-03-29 | Target: worker.js
# Covers: P0-A (classifyIntent) + telemetry total_input_tokens + RAG A/B/C
#
# USAGE:
#   ./scripts/apply-batch1-patches.sh
#   Then: npm run build:vite-only
#   Then: ./scripts/deploy-sandbox.sh
#   Then: ./scripts/benchmark-full.sh sandbox  ← must be 31/31
#   Then: ./scripts/promote-to-prod.sh
#   Then: ./scripts/benchmark-full.sh prod
#   Then: git add worker.js && git commit -m "fix: classifyIntent manual model + telemetry tokens + custom RAG (vNNN)"
# =============================================================================

set -euo pipefail
WORKER="worker.js"

if [ ! -f "$WORKER" ]; then
  echo "ERROR: worker.js not found. Run from repo root."
  exit 1
fi

# Backup
cp "$WORKER" "${WORKER}.bak.$(date +%Y%m%d_%H%M%S)"
echo "[ok] Backup created"

# =============================================================================
# PATCH 1 — P0-A: classifyIntent for manual model selection
# Find: const _agentIntent = model?._intent ?? null;
# Add after: run classifyIntent if null, then derive _agentIntentFinal
# Then replace _agentIntent usages below with _agentIntentFinal
# =============================================================================
echo "Applying Patch 1 — P0-A classifyIntent..."

python3 - <<'PYEOF'
import re, sys

with open('worker.js', 'r') as f:
    src = f.read()

OLD = "      const _agentIntent = model?._intent ?? null;"

NEW = """      const _agentIntent = model?._intent ?? null;
      // P0-A FIX: run classifyIntent even when model was manually selected
      if (!_agentIntent && lastUserContent) {
        try {
          const _manualClassify = await classifyIntent(env, lastUserContent);
          if (_manualClassify?.intent) model = { ...model, _intent: _manualClassify.intent };
        } catch (_ce) { /* non-blocking */ }
      }
      const _agentIntentFinal = model?._intent ?? 'mixed';"""

if OLD not in src:
    print("WARN: Patch 1 anchor not found — already applied or line changed. Skipping.")
    sys.exit(0)

src = src.replace(OLD, NEW, 1)

# Replace downstream usages of _agentIntent (after the declaration block)
# Only replace occurrences that appear after the declaration (simple heuristic: replace all after first occurrence)
idx = src.find("const _agentIntentFinal = model?._intent ?? 'mixed';")
before = src[:idx + len("const _agentIntentFinal = model?._intent ?? 'mixed';")]
after = src[idx + len("const _agentIntentFinal = model?._intent ?? 'mixed';"):]

# Replace _agentIntent references in the section after the declaration
# Careful: only replace standalone _agentIntent (not _agentIntentFinal)
after = re.sub(r'\b_agentIntent\b(?!Final)', '_agentIntentFinal', after)

src = before + after

with open('worker.js', 'w') as f:
    f.write(src)

print("[ok] Patch 1 applied — classifyIntent for manual model selection")
PYEOF

# =============================================================================
# PATCH 2 — Telemetry: total_input_tokens_est → total_input_tokens
# The telemetry payload field is misnamed, causing agent_telemetry.total_input_tokens = 0
# =============================================================================
echo "Applying Patch 2 — telemetry total_input_tokens field rename..."

python3 - <<'PYEOF'
with open('worker.js', 'r') as f:
    src = f.read()

count = src.count('total_input_tokens_est')
if count == 0:
    print("WARN: total_input_tokens_est not found — already fixed or changed. Skipping.")
else:
    src = src.replace('total_input_tokens_est', 'total_input_tokens')
    with open('worker.js', 'w') as f:
        f.write(src)
    print(f"[ok] Patch 2 applied — renamed {count} occurrence(s) of total_input_tokens_est → total_input_tokens")
PYEOF

# =============================================================================
# PATCH 3 (RAG Patch C) — Replace AI Search `if (runRag)` block
# with custom Vectorize-backed RAG
# Anchor: the runRag block starts with:
#   if (runRag) {
#     try {
#       const ragRes = await fetch(
#         `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai-search/instances/iam-docs-search/search`,
# =============================================================================
echo "Applying Patch 3 — RAG Patch C (Vectorize replaces AI Search)..."

python3 - <<'PYEOF'
import re, sys

with open('worker.js', 'r') as f:
    src = f.read()

# Find the old runRag block by its distinctive AI Search URL
anchor = 'https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai-search/instances/iam-docs-search/search'

if anchor not in src:
    print("WARN: AI Search anchor not found in runRag block — already replaced or line changed. Skipping.")
    sys.exit(0)

# Find the enclosing if (runRag) { ... } block
# Strategy: find "if (runRag) {" before the anchor, then find the matching closing brace
rag_if_start = src.rfind('if (runRag) {', 0, src.index(anchor))
if rag_if_start == -1:
    print("ERROR: Could not find 'if (runRag) {' before anchor. Manual patch required.")
    sys.exit(1)

# Walk forward to find the matching closing brace
depth = 0
i = rag_if_start
in_block = False
end_idx = -1
while i < len(src):
    if src[i] == '{':
        depth += 1
        in_block = True
    elif src[i] == '}':
        depth -= 1
        if in_block and depth == 0:
            end_idx = i + 1
            break
    i += 1

if end_idx == -1:
    print("ERROR: Could not find closing brace of runRag block. Manual patch required.")
    sys.exit(1)

NEW_RAG_BLOCK = '''if (runRag) {
        try {
          const _t0Rag = Date.now();
          const _EMBED_MODEL = '@cf/baai/bge-base-en-v1.5';
          const _CHARS_PER_TOKEN = 4;

          const _embedRes = await env.AI.run(_EMBED_MODEL, { text: lastUserContent });
          const _queryVec = _embedRes?.data?.[0] ?? _embedRes?.result?.data?.[0];

          if (_queryVec && env.VECTORIZE_INDEX) {
            const _vRes = await env.VECTORIZE_INDEX.query(_queryVec, { topK: 5, returnMetadata: true });
            const _matches = _vRes?.matches ?? [];
            const _chunkIds = _matches.map(m => m.id).filter(Boolean);

            if (_chunkIds.length > 0) {
              const _placeholders = _chunkIds.map(() => '?').join(',');
              const _chunkRows = await env.DB.prepare(
                `SELECT id, content, token_count FROM ai_knowledge_chunks WHERE id IN (${_placeholders})`
              ).bind(..._chunkIds).all();
              const _rowMap = Object.fromEntries((_chunkRows.results ?? []).map(r => [r.id, r]));
              const _topChunks = _matches
                .filter(m => _rowMap[m.id])
                .map(m => ({ ..._rowMap[m.id], score: m.score }))
                .slice(0, 3);

              const _rawRag = _topChunks.map(c => c.content).filter(Boolean).join('\\n\\n');
              const _injectTokens = _topChunks.reduce((s, c) => s + (c.token_count || 0), 0);
              const _wasCapped = _rawRag.length > PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS;

              if (_rawRag.length >= RAG_MIN_CONTEXT_CHARS) {
                ragContext = capWithMarker(_rawRag, PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS);
              }

              // Log every query — zero tokens ever go untracked
              ctx.waitUntil(env.DB.prepare(`
                INSERT INTO rag_query_log (conversation_id, query_text, query_tokens, results_count, top_score, chunks_injected, inject_tokens, inject_chars, mode, intent, source, duration_ms, was_capped)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
              `).bind(
                conversationId ?? null,
                lastUserContent.slice(0, 500),
                Math.ceil(lastUserContent.length / _CHARS_PER_TOKEN),
                _matches.length,
                _matches[0]?.score ?? 0,
                _topChunks.length,
                _injectTokens,
                _rawRag.length,
                chatMode,
                _intentForRag,
                'vectorize',
                Date.now() - _t0Rag,
                _wasCapped ? 1 : 0
              ).run().catch(() => {}));
            }
          }
        } catch (e) {
          console.error('[agent/chat] custom RAG failed:', e?.message ?? e);
          // silent fail — ragContext stays empty
        }
      }'''

src = src[:rag_if_start] + NEW_RAG_BLOCK + src[end_idx:]

with open('worker.js', 'w') as f:
    f.write(src)

print("[ok] Patch 3 applied — AI Search replaced with Vectorize custom RAG")
PYEOF

# =============================================================================
# PATCH 4 (RAG Patch A) — Add /api/rag/ingest route
# Insert AFTER the /api/search/docs/index route block
# =============================================================================
echo "Applying Patch 4 — RAG Patch A (/api/rag/ingest route)..."

python3 - <<'PYEOF'
import sys

with open('worker.js', 'r') as f:
    src = f.read()

anchor = "if (url.pathname === '/api/search/docs/index' && request.method === 'POST')"
if anchor not in src:
    print("WARN: /api/search/docs/index anchor not found. Skipping Patch 4.")
    sys.exit(0)

# Find the end of that if block
idx = src.index(anchor)
depth = 0
i = idx
end_idx = -1
in_block = False
while i < len(src):
    if src[i] == '{':
        depth += 1
        in_block = True
    elif src[i] == '}':
        depth -= 1
        if in_block and depth == 0:
            end_idx = i + 1
            break
    i += 1

if end_idx == -1:
    print("ERROR: Could not find end of /api/search/docs/index block.")
    sys.exit(1)

RAG_INGEST_ROUTE = '''

      // ----- API: Custom RAG ingest (/api/rag/ingest) -----
      if (url.pathname === '/api/rag/ingest' && request.method === 'POST') {
        try {
          const { object_key, force = false } = await request.json();
          if (!object_key) return new Response(JSON.stringify({ error: 'object_key required' }), { status: 400 });

          const _existing = await env.DB.prepare(
            `SELECT id, index_status FROM autorag WHERE object_key = ?`
          ).bind(object_key).first();
          if (_existing?.index_status === 'indexed' && !force) {
            return new Response(JSON.stringify({ skipped: true, reason: 'already_indexed', id: _existing.id }), { status: 200 });
          }

          const _t0i = Date.now();
          const _EMBED_MODEL_I = '@cf/baai/bge-base-en-v1.5';
          const _CHUNK_CHARS = 1600;
          const _CPT = 4;

          const _obj = await env.AUTORAG_BUCKET.get(object_key);
          if (!_obj) return new Response(JSON.stringify({ error: 'object_key not found in R2' }), { status: 404 });
          const _rawText = await _obj.text();
          const _charCount = _rawText.length;
          const _tokenCount = Math.ceil(_charCount / _CPT);

          const _chunks = [];
          for (let _ci = 0; _ci < _rawText.length; _ci += _CHUNK_CHARS) {
            _chunks.push(_rawText.slice(_ci, _ci + _CHUNK_CHARS));
          }

          await env.DB.prepare(
            `UPDATE autorag SET index_status='indexing', char_count=?, token_count=?, chunk_count=?, embed_model=?, updated_at=datetime('now') WHERE object_key=?`
          ).bind(_charCount, _tokenCount, _chunks.length, _EMBED_MODEL_I, object_key).run();

          const _autoragRow = await env.DB.prepare(`SELECT id FROM autorag WHERE object_key=?`).bind(object_key).first();
          const _autoragId = _autoragRow?.id;
          let _embedCalls = 0;

          for (let _idx = 0; _idx < _chunks.length; _idx++) {
            const _ct = _chunks[_idx];
            const _ctTokens = Math.ceil(_ct.length / _CPT);
            const _chunkId = `${_autoragId}_c${_idx}`;
            const _emb = await env.AI.run(_EMBED_MODEL_I, { text: _ct });
            const _vec = _emb?.data?.[0] ?? _emb?.result?.data?.[0];
            _embedCalls++;
            await env.DB.prepare(`
              INSERT INTO ai_knowledge_chunks (id, knowledge_id, tenant_id, chunk_index, content, content_preview, token_count, embedding_model, is_indexed, created_at)
              VALUES (?,?,?,?,?,?,?,?,1,unixepoch())
              ON CONFLICT(id) DO UPDATE SET content=excluded.content, token_count=excluded.token_count, is_indexed=1
            `).bind(_chunkId, _autoragId, 'system', _idx, _ct, _ct.slice(0, 200), _ctTokens, _EMBED_MODEL_I).run();
            if (_vec && env.VECTORIZE_INDEX) {
              await env.VECTORIZE_INDEX.upsert([{
                id: _chunkId, values: _vec,
                metadata: { object_key, chunk_index: _idx, autorag_id: _autoragId, token_count: _ctTokens }
              }]);
            }
          }

          const _durI = Date.now() - _t0i;
          await env.DB.prepare(`UPDATE autorag SET index_status='indexed', indexed_at=datetime('now'), updated_at=datetime('now') WHERE object_key=?`).bind(object_key).run();
          await env.DB.prepare(`
            INSERT INTO rag_ingest_log (object_key, autorag_id, status, char_count, token_count, chunk_count, embed_calls, embed_model, embed_tokens_est, duration_ms, triggered_by)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)
          `).bind(object_key, _autoragId, 'ok', _charCount, _tokenCount, _chunks.length, _embedCalls, _EMBED_MODEL_I, _chunks.length * Math.ceil(_CHUNK_CHARS / _CPT), _durI, 'api').run();

          return new Response(JSON.stringify({
            ok: true, object_key, char_count: _charCount, token_count: _tokenCount,
            chunk_count: _chunks.length, embed_calls: _embedCalls, duration_ms: _durI
          }), { headers: { 'Content-Type': 'application/json' } });

        } catch (e) {
          await env.DB.prepare(`INSERT INTO rag_ingest_log (object_key, status, error_msg, triggered_by) VALUES (?,?,?,?)`)
            .bind(object_key ?? 'unknown', 'error', e?.message ?? String(e), 'api').run().catch(() => {});
          return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
        }
      }

      // ----- API: Custom RAG query (/api/rag/query) -----
      if (url.pathname === '/api/rag/query' && request.method === 'POST') {
        try {
          const { query, top_k = 5, conversation_id, mode, intent } = await request.json();
          if (!query) return new Response(JSON.stringify({ error: 'query required' }), { status: 400 });
          const _t0q = Date.now();
          const _EMBED_MODEL_Q = '@cf/baai/bge-base-en-v1.5';
          const _CPT_Q = 4;
          const _qTokens = Math.ceil(query.length / _CPT_Q);

          const _qEmb = await env.AI.run(_EMBED_MODEL_Q, { text: query });
          const _qVec = _qEmb?.data?.[0] ?? _qEmb?.result?.data?.[0];
          if (!_qVec) throw new Error('Embedding failed');

          const _qRes = await env.VECTORIZE_INDEX.query(_qVec, { topK: top_k, returnMetadata: true });
          const _qMatches = _qRes?.matches ?? [];
          const _qIds = _qMatches.map(m => m.id).filter(Boolean);
          let _qChunks = [];
          if (_qIds.length > 0) {
            const _qPh = _qIds.map(() => '?').join(',');
            const _qRows = await env.DB.prepare(
              `SELECT id, content, token_count, chunk_index FROM ai_knowledge_chunks WHERE id IN (${_qPh})`
            ).bind(..._qIds).all();
            const _qMap = Object.fromEntries((_qRows.results ?? []).map(r => [r.id, r]));
            _qChunks = _qMatches.filter(m => _qMap[m.id]).map(m => ({ ..._qMap[m.id], score: m.score })).slice(0, 3);
          }
          const _qInjectTokens = _qChunks.reduce((s, c) => s + (c.token_count || 0), 0);
          const _qInjectText = _qChunks.map(c => c.content).join('\\n\\n');
          const _qDur = Date.now() - _t0q;

          await env.DB.prepare(`
            INSERT INTO rag_query_log (conversation_id, query_text, query_tokens, results_count, top_score, chunks_injected, inject_tokens, inject_chars, mode, intent, source, duration_ms)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
          `).bind(conversation_id ?? null, query.slice(0, 500), _qTokens, _qMatches.length,
            _qChunks[0]?.score ?? 0, _qChunks.length, _qInjectTokens, _qInjectText.length,
            mode ?? null, intent ?? null, 'vectorize', _qDur).run();

          for (const _m of _qMatches) {
            if (_m.metadata?.autorag_id) {
              await env.DB.prepare(`UPDATE autorag SET query_count=query_count+1, last_queried_at=datetime('now') WHERE id=?`)
                .bind(_m.metadata.autorag_id).run();
            }
          }

          return new Response(JSON.stringify({
            ok: true, chunks_injected: _qChunks.length, inject_tokens: _qInjectTokens,
            top_score: _qChunks[0]?.score ?? 0, duration_ms: _qDur, context: _qInjectText
          }), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e?.message }), { status: 500 });
        }
      }'''

src = src[:end_idx] + RAG_INGEST_ROUTE + src[end_idx:]

with open('worker.js', 'w') as f:
    f.write(src)

print("[ok] Patch 4 applied — /api/rag/ingest and /api/rag/query routes added")
PYEOF

echo ""
echo "============================================"
echo " All patches applied. Next steps:"
echo "============================================"
echo " 1. Verify patch sanity:"
echo "    grep -n '_agentIntentFinal\|rag_query_log\|/api/rag/ingest\|total_input_tokens' worker.js | head -20"
echo ""
echo " 2. Build + deploy to sandbox:"
echo "    npm run build:vite-only"
echo "    ./scripts/deploy-sandbox.sh"
echo ""
echo " 3. Gate:"
echo "    ./scripts/benchmark-full.sh sandbox"
echo "    # Must be 31/31 — if not, restore backup and debug"
echo ""
echo " 4. Token check on sandbox:"
echo "    ./scripts/compare-openai.sh sandbox sql"
echo "    # Check Haiku tok:in column — target <1500"
echo ""
echo " 5. If gates pass, promote:"
echo "    ./scripts/promote-to-prod.sh"
echo "    ./scripts/benchmark-full.sh prod"
echo ""
echo " 6. Commit:"
echo '    git add worker.js && git commit -m "fix: classifyIntent manual model + telemetry tokens + Vectorize RAG (vNNN)"'
echo "    git push origin main"
echo ""
echo " Restore backup if needed:"
echo "    cp worker.js.bak.* worker.js"
