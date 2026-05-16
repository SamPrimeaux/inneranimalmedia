#!/usr/bin/env node
// ingest_rag_knowledge.js
// Ollama (mxbai-embed-large:latest) → Cloudflare Vectorize
// No D1. No wrangler CLI. Pure fetch.
//
// Usage:
//   node scripts/ingest_rag_knowledge.js
//   node scripts/ingest_rag_knowledge.js --verify

import crypto from 'crypto';

// ── Config ────────────────────────────────────────────────────
const ACCOUNT_ID    = process.env.CLOUDFLARE_ACCOUNT_ID;
const API_TOKEN     = process.env.CLOUDFLARE_API_TOKEN;
const OLLAMA_HOST   = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const EMBED_MODEL   = process.env.OLLAMA_EMBEDDING_MODEL || 'mxbai-embed-large:latest';
const INDEX         = 'ai-search-inneranimalmedia-autorag';
const SOURCE_ID     = 'wf_rag_vectorize_knowledge_001';
const WORKSPACE_ID  = 'ws_sam_primeaux';
const TENANT_ID     = 'sam_primeaux';
const EXPECTED_DIMS = 1024;
const CHUNK_CHARS   = 1600;
const OVERLAP_CHARS = 200;
const BATCH_SIZE    = 100;
const MIN_SCORE     = 0.70;
const VERIFY_ONLY   = process.argv.includes('--verify');

// ── Knowledge document ────────────────────────────────────────
const DOC = `
KNOWLEDGE DOMAIN: Retrieval-Augmented Generation — End-to-End Reference for Agent Sam

PLATFORM CONTEXT: Inner Animal Media runs on Cloudflare Workers. The embedding model is mxbai-embed-large:latest running locally via Ollama at http://localhost:11434. This model produces 1024-dimensional dense vectors. Running locally means zero API cost, no rate limits, and no data leaving the machine during ingestion. The Vectorize index is ai-search-inneranimalmedia-autorag with 1024 dimensions and cosine similarity. The R2 bucket autorag.inneranimalmedia.com stores source documents and ingestion manifests.

SECTION 1: WHAT RAG IS AND WHY IT EXISTS

Retrieval-Augmented Generation is a pattern where an LLM is given relevant external context at inference time rather than relying solely on its training weights. The LLM parametric memory knows general facts up to a training cutoff. RAG provides episodic memory: specific, current, private, or domain-specific content the model was never trained on.

The pipeline has two phases. Ingestion runs offline: documents are chunked, embedded, and stored in a vector index. Retrieval runs at inference time: the user query is embedded, the index is searched for semantically similar chunks, and the top chunks are injected into the LLM prompt as context. The LLM answers using both its parametric knowledge and the retrieved context.

Without RAG, Agent Sam answering questions about IAM codebase, client data, or internal workflows would hallucinate. With RAG, Agent Sam retrieves the exact relevant chunk and grounds its answer in real content.

SECTION 2: THE EMBEDDING MODEL — mxbai-embed-large:latest via Ollama

The embedding model is mxbai-embed-large:latest running locally via Ollama. It produces 1024-dimensional dense vectors. The Ollama embedding endpoint is POST http://localhost:11434/api/embeddings with body { "model": "mxbai-embed-large:latest", "prompt": "text" }. The response is { "embedding": [...1024 floats...] }. Always validate the returned array has exactly 1024 elements before proceeding.

The critical usage pattern is asymmetric instruction formatting. When embedding a document chunk for storage, use the raw chunk text with no query prefix. When embedding a user query at retrieval time, prepend: "Represent this sentence for searching: {query}". This prefix orients the vector for retrieval. Skipping the query prefix degrades cosine similarity scores measurably.

The effective token limit for optimal quality is approximately 512 tokens. Keep chunks under 400-450 tokens to stay in the quality zone. Target chunk size at IAM is 400 tokens with 50 token overlap.

SECTION 3: CLOUDFLARE VECTORIZE OPERATIONS

The Vectorize index is ai-search-inneranimalmedia-autorag. Account ID is ede6590ac0d2fb7daf155b35653457b2. Configured with 1024 dimensions and cosine similarity. Vectorize uses HNSW indexing internally for approximate nearest neighbor search.

Vector IDs must be strings. IAM convention: {source_id}_chunk_{padded_index}. This enables targeted deletion by source prefix. Never use random UUIDs as vector IDs.

Always use upsert not insert. Upsert is idempotent: existing vectors with the same ID are overwritten.

Vectorize metadata is a flat JSON object. Always include workspace_id and tenant_id for namespace isolation and pre-query filtering. Metadata values must be strings, numbers, or booleans — no nested objects or arrays.

Upsert REST endpoint: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/vectorize/v2/indexes/{index}/upsert with Authorization Bearer and Content-Type application/x-ndjson. Each line is one JSON record: { "id": "...", "values": [...], "metadata": {...} }.

Query REST endpoint: POST https://api.cloudflare.com/client/v4/accounts/{account_id}/vectorize/v2/indexes/{index}/query with body { "vector": [...], "topK": 20, "returnMetadata": "all", "filter": { "workspace_id": "ws_sam_primeaux" } }.

Vectorize batch limit is 1000 vectors per upsert call. Vectorize indexing is asynchronous — wait 3-5 seconds after upsert before querying.

SECTION 4: CHUNKING STRATEGY

Chunking is the most impactful variable in RAG quality. The embedding averages over the semantic content of the entire chunk. Too large blurs the embedding over multiple competing ideas. Too small loses the context needed to be useful when retrieved.

Target 400 tokens with 50 token overlap. Approximate tokens as characters divided by 4. A 1600-character chunk is approximately 400 tokens. Overlap of 200 characters ensures sentences near boundaries appear in both adjacent chunks.

Recursive character splitting: split first on double newlines, then single newlines, then sentence-ending punctuation, then spaces. This respects document structure and avoids mid-sentence splits.

For code content, chunk by function or class boundary rather than character count. A function is one semantic unit.

Every chunk should have a context prefix prepended before embedding. The prefix is 1-2 sentences describing the parent document and section. Contextual prefixes reduce retrieval failures by 35-49 percent according to Anthropic research.

Never chunk across document boundaries. Each file is a hard split point.

SECTION 5: SIMILARITY SCORING AND THRESHOLDS

Cosine similarity measures the angle between two vectors. Cloudflare Vectorize returns scores zero to one for cosine where higher means more similar.

For mxbai-embed-large on English prose: score 0.85 and above means highly relevant, 0.70 to 0.85 means likely relevant, 0.55 to 0.70 means tangentially related, below 0.55 means probably not useful.

Always apply a minimum score threshold of 0.65 before injecting retrieved chunks into a prompt. If the top chunk scores below 0.65 the index has no relevant content and Agent Sam should say so rather than hallucinate.

SECTION 6: RETRIEVAL BEST PRACTICES

Retrieve more chunks than you plan to use then filter. Standard pattern: topK 20 from Vectorize, filter to chunks above 0.65, deduplicate near-identical chunks, use top 3 to 6 in the prompt.

Maximal Marginal Relevance deduplication: after selecting a chunk, skip any remaining candidate whose cosine similarity to an already-selected chunk exceeds 0.92. Ensures diversity in retrieved context.

The query vector must always use the instruction prefix. Embed "Represent this sentence for searching: {query}" not the raw query text.

Hybrid retrieval combines dense vector search with sparse keyword search like BM25. Dense excels at conceptual matching. Sparse excels at exact term matching: function names, variable names, error codes. For IAM codebase retrieval, hybrid search is recommended. Merge with Reciprocal Rank Fusion: score equals sum of 1 divided by rank plus 60 across retrieval systems.

Do not inject more than 6 retrieved chunks into a single prompt. The lost-in-the-middle phenomenon is real: LLMs recall content from the beginning and end of context better than the middle. Place the most relevant chunk first.

SECTION 7: IAM IMPLEMENTATION DETAILS

The Workers runtime cannot call localhost:11434 directly since it runs in Cloudflare infrastructure. Ollama runs on the developer machine or a VPS. Embed the query server-side via Ollama, pass the 1024-element float array to the Worker as a request body parameter, and the Worker calls env.VECTORIZE.query with that vector.

Wrangler binding for Vectorize in wrangler.jsonc: binding VECTORIZE, index_name ai-search-inneranimalmedia-autorag.

When a source document is updated: delete all Vectorize vectors with IDs matching the source_id prefix, then re-ingest from scratch. Full-replace is simpler and safer than partial updates.

SECTION 8: WHAT AGENT SAM MUST NEVER DO

Never embed a user query without the prefix "Represent this sentence for searching: ". Omitting this prefix produces a document-oriented vector rather than a query-oriented vector.

Never run unfiltered Vectorize queries in a multi-tenant environment. Every query must include a workspace_id filter. Returning chunks from another workspace is a data isolation breach.

Never inject more than 6 retrieved chunks into a single prompt without deliberate justification.

Never skip verification after ingestion. Silent ingestion failures are the hardest bugs to diagnose.

Never assume Vectorize is queryable immediately after upsert. Always wait 3 to 5 seconds.

Never store PII or secrets in Vectorize metadata or chunk content.

SECTION 9: DIAGNOSTICS AND QUALITY SIGNALS

Healthy pipeline: average cosine score for matched queries above 0.75, verification queries returning relevant chunks at rank 1 or 2, query latency under 300ms, chunk count growing at roughly 1 chunk per 350 words.

Warning signals: average score below 0.65 indicates embedding model mismatch or index drift. Empty results indicate metadata filter misconfiguration or wrong workspace_id.

Most common failures ranked: wrong chunk size, missing query prefix, metadata filter error, stale vectors from updated documents not cleaned before re-ingestion, Ollama not running.

SECTION 10: CONFIGURATION REFERENCE

Index: ai-search-inneranimalmedia-autorag
Account: ede6590ac0d2fb7daf155b35653457b2
Dimensions: 1024
Metric: cosine
Algorithm: HNSW managed by Cloudflare
Ollama model: mxbai-embed-large:latest
Ollama host: http://localhost:11434
Document embedding: raw text with context prefix, no query instruction
Query embedding: "Represent this sentence for searching: " plus query text
`.trim();

// ── Helpers ───────────────────────────────────────────────────
const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const estimateTokens = (t) => Math.ceil(t.length / 4);

// ── Chunker ───────────────────────────────────────────────────
function makeChunks(text) {
  const seps = ['\n\n', '\n', '. ', ' '];

  function split(str, si) {
    if (str.length <= CHUNK_CHARS) return [str.trim()];
    if (si >= seps.length) {
      const out = [];
      for (let i = 0; i < str.length; i += CHUNK_CHARS - OVERLAP_CHARS) {
        out.push(str.slice(i, i + CHUNK_CHARS).trim());
      }
      return out;
    }
    const sep = seps[si];
    const pieces = str.split(sep);
    const out = [];
    let cur = '';
    for (const p of pieces) {
      const candidate = cur ? cur + sep + p : p;
      if (candidate.length <= CHUNK_CHARS) {
        cur = candidate;
      } else {
        if (cur.trim()) out.push(cur.trim());
        if (p.length > CHUNK_CHARS) {
          out.push(...split(p, si + 1));
          cur = '';
        } else {
          cur = p;
        }
      }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }

  const raw = split(text, 0);
  const result = [];
  for (let i = 0; i < raw.length; i++) {
    if (i === 0) {
      result.push(raw[i]);
    } else {
      const tail = raw[i - 1].slice(-OVERLAP_CHARS).trim();
      result.push((tail + ' ' + raw[i]).trim());
    }
  }
  return result.filter(c => c.length > 60);
}

function detectSection(text) {
  const first = text.split('\n')[0].trim();
  if (/^SECTION \d+/i.test(first)) return first.slice(0, 80);
  return 'general';
}

// ── Ollama ────────────────────────────────────────────────────
async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_HOST}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const vec = data.embedding;
  if (!vec || vec.length !== EXPECTED_DIMS) {
    throw new Error(`Bad dimensions: got ${vec?.length}, expected ${EXPECTED_DIMS}`);
  }
  return vec;
}

// ── Vectorize ─────────────────────────────────────────────────
function cfUrl(path) {
  return `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/vectorize/v2/indexes/${INDEX}/${path}`;
}

async function vectorizeUpsert(records) {
  const body = records.map(r => JSON.stringify(r)).join('\n');
  const res = await fetch(cfUrl('upsert'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/x-ndjson',
    },
    body,
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`Upsert failed: ${JSON.stringify(json.errors)}`);
  }
  return json.result;
}

async function vectorizeQuery(vector, topK = 5) {
  const res = await fetch(cfUrl('query'), {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vector,
      topK,
      returnMetadata: 'all',
      
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(`Query failed: ${JSON.stringify(json.errors)}`);
  }
  return json.result?.matches ?? [];
}

// ── Preflight ─────────────────────────────────────────────────
async function preflight() {
  if (!ACCOUNT_ID) throw new Error('CLOUDFLARE_ACCOUNT_ID not set');
  if (!API_TOKEN)  throw new Error('CLOUDFLARE_API_TOKEN not set');
  log(`Checking Ollama at ${OLLAMA_HOST}...`);
  const res = await fetch(`${OLLAMA_HOST}/api/tags`);
  if (!res.ok) throw new Error('Ollama not reachable at ' + OLLAMA_HOST);
  const { models } = await res.json();
  const found = models?.some(m => m.name === EMBED_MODEL);
  if (!found) {
    const names = models?.map(m => m.name).join(', ') || 'none';
    throw new Error(`Model ${EMBED_MODEL} not found. Available: ${names}\nRun: ollama pull mxbai-embed-large`);
  }
  log(`Ollama OK — ${EMBED_MODEL} ready`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const startMs = Date.now();
  await preflight();

  if (VERIFY_ONLY) {
    log('Verify-only mode...');
    const qv = await ollamaEmbed(
      'Represent this sentence for searching: RAG chunking embedding Vectorize mxbai Ollama cosine similarity retrieval IAM'
    );
    const matches = await vectorizeQuery(qv, 5);
    log('Results (topK=5):');
    matches.forEach(m => log(`  ${m.score.toFixed(4)}  ${m.id}`));
    const hit = matches.find(m => m.id.startsWith(SOURCE_ID));
    log(hit
      ? `PASS — ${hit.id} score=${hit.score.toFixed(4)}`
      : 'MISS — no chunks from this source in top-5');
    return;
  }

  // Chunk
  log('Chunking...');
  const PREFIX = 'This chunk is from the IAM RAG and Vectorize knowledge base for Agent Sam. ';
  const rawChunks = makeChunks(DOC);
  const chunks = rawChunks.map((text, i) => ({
    i,
    id:       `${SOURCE_ID}_chunk_${String(i).padStart(3, '0')}`,
    text,
    prefixed: PREFIX + text,
    section:  detectSection(text),
    tokens:   estimateTokens(text),
    hash:     sha256(text),
  }));
  const avgTokens = Math.round(chunks.reduce((s, c) => s + c.tokens, 0) / chunks.length);
  log(`${chunks.length} chunks, avg ~${avgTokens} tokens each`);

  // Embed
  log(`Embedding via Ollama — ${EMBED_MODEL} (document mode, no query prefix)...`);
  const records = [];
  for (const c of chunks) {
    process.stdout.write(`  [${c.i + 1}/${chunks.length}] ${c.id} ... `);
    const t = Date.now();
    const values = await ollamaEmbed(c.prefixed);
    process.stdout.write(`${Date.now() - t}ms\n`);
    records.push({
      id: c.id,
      values,
      metadata: {
        source_id:       SOURCE_ID,
        workspace_id:    WORKSPACE_ID,
        tenant_id:       TENANT_ID,
        chunk_index:     c.i,
        section:         c.section.slice(0, 100),
        token_estimate:  c.tokens,
        content_hash:    c.hash,
        created_at_unix: Math.floor(Date.now() / 1000),
      },
    });
  }
  log(`All ${records.length} chunks embedded`);

  // Upsert
  log('Upserting to Vectorize...');
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} vectors`);
    const result = await vectorizeUpsert(batch);
    log(`  mutation_id: ${result?.mutationId ?? 'n/a'}`);
  }

  // Verify
  log('Waiting 5s for index to settle...');
  await sleep(5000);
  log('Running verification query...');
  const qv = await ollamaEmbed(
    'Represent this sentence for searching: RAG chunking embedding Vectorize mxbai Ollama cosine similarity retrieval IAM'
  );
  const matches = await vectorizeQuery(qv, 5);
  log('Results (topK=5):');
  matches.forEach(m => log(`  ${m.score.toFixed(4)}  ${m.id}`));

  const hit = matches.find(m => m.id.startsWith(SOURCE_ID));
  const topScore = hit?.score ?? 0;
  const passed = topScore >= MIN_SCORE;

  const duration = Date.now() - startMs;
  log(`\nDone in ${(duration / 1000).toFixed(1)}s`);
  log(`Chunks    : ${chunks.length}`);
  log(`Index     : ${INDEX}`);
  log(`Top score : ${topScore.toFixed(4)}`);
  log(`Status    : ${passed ? 'SUCCESS ✓' : 'DEGRADED — score below threshold'}`);
}

main().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
