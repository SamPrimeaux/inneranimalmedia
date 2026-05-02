# AutoRAG Partial Failure Diagnosis

**Date:** 2026-03-18  
**Observed:** Dashboard search returns "No matches"; first Agent reply generic (6998 tokens); second Agent reply correct from autorag.

---

## QUESTION 1: /api/agent/rag/query — Check Result

**Command run:**
```bash
curl -s -X POST https://inneranimalmedia.com/api/agent/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query": "agent modes"}' | jq .
```

**Result:**
```json
{
  "matches": [],
  "count": 0
}
```

- **HTTP status:** 200 (no 500).
- **Conclusion:** The endpoint does not throw. `env.AI.autorag('iam-autorag').search({ query })` is returning without error, but the payload has **no results** (we map `results?.results ?? results?.data ?? []` → empty array).

So either:
1. The AI Search instance **iam-autorag** exists but returns **empty `data`** (index empty, not synced, or no matching chunks), or
2. The binding returns a different shape (e.g. wrapped in `.result`) and we never read the actual array.

---

## QUESTION 2: Worker Logs

**Note:** `wrangler tail` is a live stream; it was not run in this session. To capture errors:

```bash
./scripts/with-cloudflare-env.sh npx wrangler tail --format=pretty 2>&1 | tee /tmp/tail.log
# In another terminal: curl -X POST .../api/agent/rag/query -d '{"query":"agent modes"}'
# Then grep: grep -E "rag/query|AISEARCH|autorag|iam-autorag" /tmp/tail.log
```

**What to look for:**
- Any log line containing `rag/query` (confirms the route was hit).
- `[agent/chat] AISEARCH failed` (would indicate RAG throw in chat path).
- Stack traces or 5xx from the rag/query path (we did not see 500 from curl).

---

## QUESTION 3: Chat RAG Trigger and First Reply (6998 tokens)

**RAG trigger (worker.js 3707–3709):**
- RAG runs only when `chatMode === 'agent'` and `lastUserContent.split(' ').length >= 10` and `env.AI` is set.
- If the first user message had **fewer than 10 words**, RAG would not run → no "Relevant platform context" → model answers from compiled context only (can be large token count).
- If RAG ran but **AISEARCH failed**, we’d set `ragContext = ''` and log `[agent/chat] AISEARCH failed`; again no RAG in the prompt.

**Second reply correct:** Suggests either (1) second message had ≥10 words and RAG succeeded that time, or (2) the model used the knowledge_search tool on the second turn and got results via invokeMcpToolFromChat (which also uses iam-autorag and has Vectorize fallback).

**To confirm in logs:**
- Search for `[agent/chat] AISEARCH failed`.
- Check whether the first request had a short message (< 10 words).

---

## QUESTION 4: Is `iam-autorag` a Valid Workers AI AutoRAG Instance Name?

**Worker usage:** `env.AI.autorag('iam-autorag').search({ query })` — the string is the **AI Search instance name** configured in the Cloudflare account.

**Wrangler (wrangler.production.toml 31–34):**
```toml
[[ai_search]]
binding = "AI_SEARCH"
search_name = "iam-autorag"
```

- The worker **does not use** `env.AI_SEARCH`; it uses **`env.AI.autorag('iam-autorag')`**.
- So the instance name must exist under the **AI (Workers AI)** binding’s AutoRAG/AI Search configuration, not only under a separate AI_SEARCH binding.

**What to verify in Cloudflare Dashboard:**
1. **Workers & Pages → AI (Workers AI) or AI Search / AutoRAG** (or equivalent).
2. Confirm an AI Search / AutoRAG instance named **exactly** `iam-autorag` exists.
3. Confirm its **data source** is the R2 bucket you populated (e.g. **autorag**) and that a **Sync** has been run successfully (e.g. 4+ documents, vectors created, 0 errors).
4. If the instance name in the dashboard differs (e.g. `iam-autorag-production` or a different ID), the worker must use that exact name.

**If the instance does not exist or has a different name:** Create an AI Search instance named `iam-autorag` (or change the worker to use the existing name), connect it to the autorag bucket, and run Sync.

---

## Response Shape (Worker vs Docs)

From [Cloudflare Workers Binding](https://developers.cloudflare.com/autorag/usage/workers-binding/), `.search()` returns an object like:

```json
{
  "object": "vector_store.search_results.page",
  "search_query": "...",
  "data": [
    {
      "file_id": "...",
      "filename": "...",
      "score": 0.45,
      "content": [ { "id": "...", "type": "text", "text": "..." } ]
    }
  ],
  "has_more": false,
  "next_page": null
}
```

**Worker (worker.js 4469–4473):**
- `rawResults = results?.results ?? results?.data ?? []` — we use `.data` (doc shape); `.results` is for backwards compatibility.
- Chunk text: `r.text ?? r.content?.[0]?.text ?? ''` — doc has `content[].text`, so we need `content[0].text`. Correct.

If the binding sometimes wraps this in a `.result` property, we’d get empty. **Optional defensive fix:** also try `rawResults = results?.result?.data ?? results?.results ?? results?.data ?? []` and, temporarily, `console.log('[rag/query] autorag response keys:', results ? Object.keys(results) : 'null')` to see the actual shape in production.

---

## Summary and Recommended Actions

| # | Check | Result / Action |
|---|--------|------------------|
| 1 | **curl /api/agent/rag/query** | Returns 200 with `matches: []`, `count: 0`. No exception. |
| 2 | **Worker log errors** | Run `wrangler tail` while calling rag/query and chat; grep for `rag/query`, `AISEARCH failed`, `iam-autorag`. |
| 3 | **RAG trigger / first reply** | Confirm first message had ≥10 words; search logs for `AISEARCH failed`. |
| 4 | **Instance name** | In dashboard, confirm an AI Search/AutoRAG instance is named **iam-autorag**, is attached to the autorag bucket, and has been synced (documents + vectors, 0 errors). |

**Most likely cause:** The **iam-autorag** instance is either missing, not linked to the bucket we populated, or not synced, so `.search()` returns `data: []`. The second Agent reply may be correct because it used the **knowledge_search** tool (invokeMcpToolFromChat), which has a **Vectorize + R2 fallback** when AutoRAG returns 0 results — so tool path can succeed even when the AutoRAG instance is empty.

**Next steps:**
1. In Cloudflare: **AI Search / AutoRAG** → find **iam-autorag** → confirm **data source = autorag bucket** → run **Sync** → wait for indexing to finish.
2. Re-run: `curl -X POST https://inneranimalmedia.com/api/agent/rag/query -H "Content-Type: application/json" -d '{"query":"agent modes"}'` and expect `matches` with content.
3. (Optional) In worker, add one-time logging for the rag/query path: log `Object.keys(results)` and `rawResults.length` so you can confirm the API shape and that data is present after Sync.
