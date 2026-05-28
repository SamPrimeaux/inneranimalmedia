#!/usr/bin/env python3
"""
autorag_ingest.py — R2 content + D1 schema → Supabase RAG tables
stdlib only (+ openai, supabase-py already in your env)

Columns mapped to ACTUAL Supabase schemas (verified 2026-05-27).
Insert contract: docs/supabase/AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md
Runtime policy: docs/autorag/AUTORAG_KNOWLEDGE_RETRIEVAL_RUNTIME_CONTRACT.md

Usage:
  python3 autorag_ingest.py --lane schema
  python3 autorag_ingest.py --lane recipes
  python3 autorag_ingest.py --lane knowledge
  python3 autorag_ingest.py --lane docs
  python3 autorag_ingest.py --lane all
"""

import os, sys, re, json, time, hashlib, argparse, uuid, urllib.request, urllib.parse

# ── Config ────────────────────────────────────────────────────────────────────
OPENAI_API_KEY  = os.environ["OPENAI_API_KEY"]
SUPABASE_URL    = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY    = (
    os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE")
)
if not SUPABASE_KEY:
    raise KeyError(
        "Missing Supabase service key env var. Set SUPABASE_SERVICE_ROLE_KEY (preferred) "
        "or SUPABASE_SERVICE_KEY."
    )
CF_API_TOKEN    = os.environ["CLOUDFLARE_API_TOKEN"]
CF_ACCOUNT_ID   = "ede6590ac0d2fb7daf155b35653457b2"
D1_DATABASE_ID  = "cf87b717-d4e2-4cf8-bab0-a81268e32d49"

# Canonical bucket for rag.inneranimalmedia.com custom domain.
R2_BUCKET       = os.environ.get("AUTORAG_R2_BUCKET", "inneranimalmedia-autorag")
# Canonical public base used in source_url (may be bot-challenged for curl, but is the contract).
R2_PUBLIC_BASE  = os.environ.get("AUTORAG_PUBLIC_BASE", "https://rag.inneranimalmedia.com")
WORKSPACE_ID    = "fa1f12a8-c841-4b79-a26c-d53a78b17dac"
USER_ID         = "6cbd71f8-1d57-4530-9736-9bf03be1adad"
EMBED_MODEL     = "text-embedding-3-large"
EMBED_DIMS      = 1536

# R2 prefix → table + vectorize binding
LANE_CONFIG = {
    "recipes":   {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "recipes",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "recipes/",
    },
    "knowledge": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "knowledge",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "knowledge/",
    },
    "docs": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "document",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "docs/",
    },
    "context": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "context",
        "vectorize_binding":"AGENTSAM_VECTORIZE_SCHEMA",
        "vectorize_index":  "agentsam-schema-oai3large-1536",
        "r2_prefix":        "context/",
    },
    "courses": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "course",
        "vectorize_binding":"AGENTSAM_VECTORIZE_COURSES",
        "vectorize_index":  "agentsam-courses-oai3large-1536",
        "r2_prefix":        "courses/",
    },
    "memory": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "knowledge",
        "vectorize_binding":"AGENTSAM_VECTORIZE_MEMORY",
        "vectorize_index":  "agentsam-memory-oai3large-1536",
        "r2_prefix":        "memory/",
    },
    "plans": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "plans",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "plans/",
    },
    "roadmap": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "roadmap",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "roadmap/",
    },
    "studentprofiles": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "other",
        "vectorize_binding":"AGENTSAM_VECTORIZE_COURSES",
        "vectorize_index":  "agentsam-courses-oai3large-1536",
        "r2_prefix":        "studentprofiles/",
    },
    "workflows": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "workflows",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "workflows/",
    },
    "clients": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "clients",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "clients/",
    },
    "workspaces": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "workspaces",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "workspaces/",
    },
    "brands": {
        "table":            "agentsam_documents_oai3large_1536",
        "source_type":      "brands",
        "vectorize_binding":"AGENTSAM_VECTORIZE_DOCUMENTS",
        "vectorize_index":  "agentsam-documents-oai3large-1536",
        "r2_prefix":        "brands/",
    },
}

# ── HTTP helpers ──────────────────────────────────────────────────────────────
def _http(method, url, headers, body=None):
    data = json.dumps(body).encode() if body else None
    req  = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=45) as r:
            body = r.read()
            return json.loads(body) if body.strip() else {}
    except urllib.error.HTTPError as e:
        print(f"  HTTP {e.code} on {method} {url}: {e.read().decode()[:300]}")
        raise

def supabase_headers():
    return {
        "apikey":        SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates",
        "Accept-Profile": "agentsam",
        "Content-Profile": "agentsam",
    }

def supabase_upsert(table, rows):
    if not rows:
        return
    url = f"{SUPABASE_URL}/rest/v1/{table}?on_conflict=content_hash"
    _http("POST", url, supabase_headers(), rows)
    print(f"    ✓ upserted {len(rows)} rows → {table}")

# ── OpenAI embed ──────────────────────────────────────────────────────────────
def embed_batch(texts):
    """Embed up to 20 texts, returns list of vectors."""
    r = _http("POST", "https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}",
                 "Content-Type":  "application/json"},
        body={"model": EMBED_MODEL, "input": texts, "dimensions": EMBED_DIMS})
    return [d["embedding"] for d in r["data"]]

# ── CF D1 ─────────────────────────────────────────────────────────────────────
def d1_query(sql, params=None):
    url  = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
            f"/d1/database/{D1_DATABASE_ID}/query")
    body = {"sql": sql}
    if params:
        body["params"] = params
    r = _http("POST", url,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}",
                 "Content-Type":  "application/json"},
        body=body)
    return r["result"][0]["results"]

# ── CF R2 ─────────────────────────────────────────────────────────────────────
def r2_list(prefix):
    url = (f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"
           f"/r2/buckets/{R2_BUCKET}/objects"
           f"?prefix={urllib.parse.quote(prefix)}&limit=1000")
    r = _http("GET", url,
        headers={"Authorization": f"Bearer {CF_API_TOKEN}"})
    # r may be a list or {"result": {...}, "success": true}
    if isinstance(r, list):
        result = r[0] if r else {}
    else:
        result = r.get("result", {})
    if isinstance(result, list):
        objects = result
    else:
        objects = result.get("objects", [])
    return [o["key"] for o in objects if isinstance(o, dict) and "key" in o]

def r2_get(key):
    import boto3
    from botocore.config import Config
    s3 = boto3.client("s3",
        endpoint_url=f"https://{CF_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        config=Config(signature_version="s3v4"),
        region_name="auto")
    obj = s3.get_object(Bucket=R2_BUCKET, Key=key)
    return obj["Body"].read().decode("utf-8", errors="replace")

# ── Text helpers ──────────────────────────────────────────────────────────────
def chunk_text(text, max_chars=1200, overlap=150):
    if len(text) <= max_chars:
        return [text.strip()]
    chunks, start = [], 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        chunks.append(text[start:end].strip())
        start += max_chars - overlap
    return [c for c in chunks if len(c) > 80]

def content_hash(text):
    return hashlib.sha256(text.encode()).hexdigest()[:32]

def estimate_tokens(text):
    return max(1, len(text) // 4)

def slug_from_key(key):
    name = key.split("/")[-1]
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")

def title_from_key(key):
    name = key.split("/")[-1]
    name = re.sub(r"\.(txt|md)$", "", name)
    return name.replace("_", " ").replace("-", " ").title()

def chunk_type_from_key(key):
    return "section" if key.endswith(".md") else "other"

def extract_column_names(ddl):
    """Parse column names from CREATE TABLE DDL."""
    keywords = {"PRIMARY","UNIQUE","FOREIGN","CHECK","CONSTRAINT","INDEX",
                "WITHOUT","ROWID","KEY","ON","NOT","NULL","DEFAULT","AS"}
    matches = re.findall(r"^\s{1,4}([a-zA-Z_][a-zA-Z0-9_]*)\s+\w", ddl, re.MULTILINE)
    return [m for m in matches if m.upper() not in keywords]

def now_iso():
    import datetime
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

# ── Lane: R2 documents ────────────────────────────────────────────────────────
def ingest_r2_lane(lane, only_keys=None):
    cfg    = LANE_CONFIG[lane]
    table  = cfg["table"]
    prefix = cfg["r2_prefix"]

    keys = [k for k in r2_list(prefix) if k.endswith((".txt", ".md"))]
    if only_keys:
        only = set([k.strip() for k in only_keys if k and k.strip()])
        keys = [k for k in keys if k in only]
    print(f"\n── {lane}  ({len(keys)} files) → {table}")

    # Build all chunks first
    pending = []
    for key in keys:
        content = r2_get(key)
        for i, chunk in enumerate(chunk_text(content)):
            pending.append({"key": key, "chunk_index": i, "chunk": chunk})

    print(f"   {len(pending)} chunks → embedding in batches of 20...")

    EMBED_BATCH = 20
    UPSERT_BATCH = 50
    rows = []
    ts   = now_iso()

    for i in range(0, len(pending), EMBED_BATCH):
        batch = pending[i:i+EMBED_BATCH]
        texts = [b["chunk"] for b in batch]
        vecs  = embed_batch(texts)

        for b, vec in zip(batch, vecs):
            key = b["key"]
            rows.append({
                "id":               str(uuid.uuid4()),
                "workspace_id":     WORKSPACE_ID,
                "user_id":          USER_ID,
                "title":            title_from_key(key),
                "content":          b["chunk"],
                "source_type":      cfg["source_type"],
                "source_url":       f"{R2_PUBLIC_BASE}/{key}",
                "source_path":      key,
                "source_ref":       key,                     # source_key → source_ref
                "slug":             slug_from_key(key),
                "chunk_index":      b["chunk_index"],
                "chunk_type":       chunk_type_from_key(key),
                "content_hash":     content_hash(b["chunk"]),# chunk_hash → content_hash
                "token_count":      estimate_tokens(b["chunk"]),
                "embedding":        vec,
                "embedding_model":  EMBED_MODEL,
                "embedding_dims":   EMBED_DIMS,
                "embedded_at":      ts,
                "vectorize_binding":cfg["vectorize_binding"],
                "vectorize_index":  cfg["vectorize_index"],
                "metadata":         json.dumps({
                    "bucket":    R2_BUCKET,
                    "key":       key,
                    "namespace": prefix.rstrip("/"),
                    "lane":      lane,                       # lane → metadata.lane
                }),
                "created_at":       ts,
                "updated_at":       ts,
            })
        time.sleep(0.25)

    for i in range(0, len(rows), UPSERT_BATCH):
        supabase_upsert(table, rows[i:i+UPSERT_BATCH])

    print(f"   ✓ {lane} done — {len(rows)} rows")

# ── Lane: D1 schema ───────────────────────────────────────────────────────────
def ingest_schema():
    table = "agentsam_database_schema_oai3large_1536"
    print(f"\n── D1 schema → {table}")

    ddls = d1_query(
        "SELECT name, sql FROM sqlite_master "
        "WHERE type='table' AND name NOT LIKE '_cf_%' "
        "AND sql IS NOT NULL ORDER BY name"
    )
    print(f"   {len(ddls)} tables → embedding...")

    EMBED_BATCH  = 20
    UPSERT_BATCH = 50
    rows = []
    ts   = now_iso()

    texts = [f"TABLE: {r['name']}\n\n{r['sql']}" for r in ddls]

    for i in range(0, len(texts), EMBED_BATCH):
        batch_texts = texts[i:i+EMBED_BATCH]
        batch_ddls  = ddls[i:i+EMBED_BATCH]
        vecs        = embed_batch(batch_texts)

        for ddl_row, text, vec in zip(batch_ddls, batch_texts, vecs):
            col_names = extract_column_names(ddl_row["sql"] or "")
            rows.append({
                "id":               str(uuid.uuid4()),
                "workspace_id":     WORKSPACE_ID,
                "database_kind":    "d1",                    # lane → database_kind
                "database_name":    "inneranimalmedia-business",
                "schema_name":      "main",
                "table_name":       ddl_row["name"],
                "object_type":      "table",                 # lane → object_type
                "title":            ddl_row["name"],
                "content":          text,
                "content_hash":     content_hash(text),      # chunk_hash → content_hash
                "token_count":      estimate_tokens(text),
                "column_names":     col_names,
                "source_path":      f"d1::inneranimalmedia-business::{ddl_row['name']}",
                "embedding":        vec,
                "embedding_model":  EMBED_MODEL,
                "embedding_dims":   EMBED_DIMS,
                "embedded_at":      ts,
                "vectorize_binding":"AGENTSAM_VECTORIZE_SCHEMA",
                "vectorize_index":  "agentsam-schema-oai3large-1536",
                # no chunk_index column on this table — each table = 1 row
                "metadata":         json.dumps({
                    "source":       "d1_sqlite_master",
                    "database_id":  D1_DATABASE_ID,
                    "table":        ddl_row["name"],
                }),
                "created_at":       ts,
                "updated_at":       ts,
            })
        time.sleep(0.25)

    for i in range(0, len(rows), UPSERT_BATCH):
        supabase_upsert(table, rows[i:i+UPSERT_BATCH])

    print(f"   ✓ schema done — {len(rows)} rows")

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="AgentSam AutoRAG ingest")
    parser.add_argument("--lane",
        choices=["recipes","knowledge","docs","context","courses","memory","plans","roadmap","studentprofiles","workflows","schema","all"],
        default="all")
    parser.add_argument("--dry-run", action="store_true",
        help="List what would be ingested without embedding or writing")
    parser.add_argument("--include-schema", action="store_true",
        help="Allow database schema ingestion (FROZEN by default)")
    parser.add_argument("--i-understand-schema-is-not-stable", action="store_true",
        help="Required acknowledgement for schema ingestion")
    parser.add_argument("--only-key", action="append", default=[],
        help="Ingest only this exact R2 object key (repeatable). Example: --only-key docs/supabase/AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md")
    args = parser.parse_args()

    if args.dry_run:
        for lane, cfg in LANE_CONFIG.items():
            keys = [k for k in r2_list(cfg["r2_prefix"]) if k.endswith((".txt",".md"))]
            print(f"  {lane}: {len(keys)} files → {cfg['table']}")
        print("  schema: (frozen) agentsam_database_schema_oai3large_1536")
        print("    Skipping database_schema lane: schema re-ingestion is frozen until data model stabilizes.")
        return

    if args.lane in ("recipes", "all"):
        ingest_r2_lane("recipes", only_keys=args.only_key)
    if args.lane in ("knowledge", "all"):
        ingest_r2_lane("knowledge", only_keys=args.only_key)
    if args.lane in ("docs", "all"):
        ingest_r2_lane("docs", only_keys=args.only_key)
    if args.lane in ("context", "all"):
        ingest_r2_lane("context", only_keys=args.only_key)
    if args.lane in ("courses", "all"):
        ingest_r2_lane("courses", only_keys=args.only_key)
    if args.lane in ("memory", "all"):
        ingest_r2_lane("memory", only_keys=args.only_key)
    if args.lane in ("plans", "all"):
        ingest_r2_lane("plans", only_keys=args.only_key)
    if args.lane in ("roadmap", "all"):
        ingest_r2_lane("roadmap", only_keys=args.only_key)
    if args.lane in ("studentprofiles", "all"):
        ingest_r2_lane("studentprofiles", only_keys=args.only_key)
    if args.lane in ("workflows", "all"):
        ingest_r2_lane("workflows", only_keys=args.only_key)
    if args.lane in ("schema", "all"):
        if not (args.include_schema and args.i_understand_schema_is_not_stable):
            print("Skipping database_schema lane: schema re-ingestion is frozen until data model stabilizes.")
        else:
            ingest_schema()

    print("\n✓ ingest complete")

if __name__ == "__main__":
    main()
