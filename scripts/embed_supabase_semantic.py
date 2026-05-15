#!/usr/bin/env python3
"""
embed_supabase_semantic.py
──────────────────────────
Backfills missing embeddings for Supabase semantic tables:
  1. agent_memory        (121 missing)
  2. knowledge_edges     (82 missing — as natural-language statements)
  3. tenant_context      (1 missing)
  4. agent_decisions     (1 missing)

Embeds with local Ollama mxbai-embed-large (1024-dim).
Writes vectors back to Supabase embedding column AND pushes to Vectorize.

Usage:
  python3 scripts/embed_supabase_semantic.py
"""

import hashlib
import json
import re
import subprocess
import urllib.request
from pathlib import Path

DB_URL  = "postgresql://postgres.dpmuvynqixblxsilnlut:DLnyxTu1lKjZYrFFNeiAtXNAsm7xFJI@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
OLLAMA  = "http://localhost:11434"
MODEL   = "mxbai-embed-large:latest"
INDEX   = "ai-search-inneranimalmedia-autorag"
TOML    = "wrangler.production.toml"
BATCH   = 12
OUT     = Path("artifacts/batch_embed/embeddings")
OUT.mkdir(parents=True, exist_ok=True)

EMBED_MODEL_TAG = "ollama:mxbai-embed-large"


# ─── Ollama ───────────────────────────────────────────────────────────────────

def sanitize(t: str) -> str:
    t = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]', ' ', str(t))
    return re.sub(r'\s{4,}', '   ', t)[:2000].strip()


def embed_texts(texts: list) -> list:
    clean = [sanitize(t) for t in texts]
    try:
        data = json.dumps({"model": MODEL, "input": clean}).encode()
        req  = urllib.request.Request(
            f"{OLLAMA}/api/embed", data=data,
            headers={"Content-Type": "application/json"}, method="POST"
        )
        resp = json.loads(urllib.request.urlopen(req, timeout=180).read())
        vecs = resp.get("embeddings")
        if vecs and len(vecs) == len(clean):
            return vecs
    except Exception:
        pass
    # Serial fallback
    results = []
    for t in clean:
        try:
            data = json.dumps({"model": MODEL, "prompt": t}).encode()
            req  = urllib.request.Request(
                f"{OLLAMA}/api/embeddings", data=data,
                headers={"Content-Type": "application/json"}, method="POST"
            )
            v = json.loads(urllib.request.urlopen(req, timeout=60).read()).get("embedding")
            results.append(v)
        except Exception:
            results.append(None)
    return results


# ─── Supabase ─────────────────────────────────────────────────────────────────

def get_conn():
    import psycopg2
    import psycopg2.extras
    conn = psycopg2.connect(DB_URL, connect_timeout=15)
    conn.autocommit = False
    return conn, psycopg2.extras.RealDictCursor


def content_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


# ─── 1. agent_memory ─────────────────────────────────────────────────────────

def build_memory_text(row: dict) -> str:
    parts = []
    if row.get("memory_type"): parts.append(f"[{row['memory_type']}]")
    if row.get("role"):        parts.append(f"role: {row['role']}")
    if row.get("content"):     parts.append(str(row["content"])[:1200])
    if row.get("plan_id"):     parts.append(f"plan: {row['plan_id']}")
    if row.get("task_id"):     parts.append(f"task: {row['task_id']}")
    if row.get("source_tool"): parts.append(f"tool: {row['source_tool']}")
    return " | ".join(parts)


def embed_agent_memory(conn, cur) -> list:
    print("\n── agent_memory ──")
    cur.execute("""
        SELECT id, role, content, memory_type, durability, importance,
               plan_id, task_id, source_tool, workspace_id
        FROM agent_memory
        WHERE embedding IS NULL
          AND (
            durability != 'scratch'
            OR importance >= 3
            OR memory_type IN ('session','project','decision','error','fix')
          )
        ORDER BY importance DESC NULLS LAST, created_at DESC
        LIMIT 200
    """)
    rows = cur.fetchall()
    print(f"  {len(rows)} rows to embed")
    if not rows:
        return []

    passages = []
    for row in rows:
        text = build_memory_text(row)
        if len(text) < 20:
            continue
        passages.append({
            "id":   row["id"],
            "text": text,
            "meta": {
                "source":      "memory",
                "slug":        "agent_memory",
                "memory_type": str(row.get("memory_type") or ""),
                "importance":  str(row.get("importance") or ""),
                "durability":  str(row.get("durability") or ""),
                "workspace_id": str(row.get("workspace_id") or ""),
                "embed_model": EMBED_MODEL_TAG,
            }
        })

    vectorize_lines = []
    updated = 0
    for i in range(0, len(passages), BATCH):
        batch = passages[i:i+BATCH]
        vecs  = embed_texts([p["text"] for p in batch])
        for j, vec in enumerate(vecs):
            if not vec or len(vec) < 64:
                continue
            p = batch[j]
            # Write back to Supabase
            cur.execute(
                "UPDATE agent_memory SET embedding = %s, embed_model = %s WHERE id = %s",
                (json.dumps(vec), EMBED_MODEL_TAG, p["id"])
            )
            updated += 1
            vectorize_lines.append(json.dumps({
                "id":       f"memory:{p['id']}",
                "values":   vec,
                "metadata": p["meta"],
            }))
        print(f"  batch {i//BATCH+1}: {min(i+BATCH, len(passages))}/{len(passages)}", end="\r")

    conn.commit()
    print(f"  ✅ {updated} rows updated in Supabase")
    return vectorize_lines


# ─── 2. knowledge_edges ──────────────────────────────────────────────────────

def build_edge_text(row: dict) -> str:
    """Convert graph edge to natural-language statement."""
    a   = str(row.get("entity_a") or "")
    rel = str(row.get("relation") or "relates to")
    b   = str(row.get("entity_b") or "")
    src = str(row.get("source_type") or "")
    conf = row.get("confidence")

    text = f"{a} {rel} {b}."
    if src:   text += f" (source: {src})"
    if conf:  text += f" confidence: {conf}"

    meta_raw = row.get("metadata")
    if meta_raw and isinstance(meta_raw, str) and len(meta_raw) < 300:
        text += f" | {meta_raw}"
    elif meta_raw and isinstance(meta_raw, dict):
        for k, v in list(meta_raw.items())[:3]:
            text += f" | {k}: {v}"

    return text


def embed_knowledge_edges(conn, cur) -> list:
    print("\n── knowledge_edges ──")
    cur.execute("""
        SELECT id, entity_a, relation, entity_b, source_type, confidence, metadata
        FROM knowledge_edges
        WHERE embedding IS NULL
        LIMIT 200
    """)
    rows = cur.fetchall()
    print(f"  {len(rows)} rows to embed")
    if not rows:
        return []

    passages = []
    for row in rows:
        text = build_edge_text(row)
        passages.append({
            "id":   row["id"],
            "text": text,
            "meta": {
                "source":      "architecture",
                "slug":        "knowledge_edge",
                "entity_a":    str(row.get("entity_a") or "")[:80],
                "entity_b":    str(row.get("entity_b") or "")[:80],
                "relation":    str(row.get("relation") or "")[:80],
                "source_type": str(row.get("source_type") or ""),
                "embed_model": EMBED_MODEL_TAG,
            }
        })

    vectorize_lines = []
    updated = 0
    for i in range(0, len(passages), BATCH):
        batch = passages[i:i+BATCH]
        vecs  = embed_texts([p["text"] for p in batch])
        for j, vec in enumerate(vecs):
            if not vec or len(vec) < 64:
                continue
            p = batch[j]
            cur.execute(
                "UPDATE knowledge_edges SET embedding = %s WHERE id = %s",
                (json.dumps(vec), p["id"])
            )
            updated += 1
            vectorize_lines.append(json.dumps({
                "id":       f"edge:{p['id']}",
                "values":   vec,
                "metadata": p["meta"],
            }))
        print(f"  batch {i//BATCH+1}: {min(i+BATCH, len(passages))}/{len(passages)}", end="\r")

    conn.commit()
    print(f"  ✅ {updated} edges updated in Supabase")
    return vectorize_lines


# ─── 3. tenant_context ───────────────────────────────────────────────────────

def embed_tenant_context(conn, cur) -> list:
    print("\n── tenant_context ──")
    # SELECT * to avoid column assumption errors
    cur.execute("SELECT * FROM tenant_context WHERE embedding IS NULL LIMIT 10")
    rows = cur.fetchall()
    print(f"  {len(rows)} rows to embed")
    if not rows:
        return []

    vectorize_lines = []
    for row in rows:
        # Skip id/embedding/timestamps — embed everything else
        skip = {"id","embedding","embed_model","created_at","updated_at","embedding_dim"}
        parts = []
        for col, v in row.items():
            if col in skip or v is None: continue
            val = json.dumps(v) if isinstance(v, dict) else str(v)
            if val.strip() in ("","null","NULL","{}"): continue
            parts.append(f"{col}: {val[:400]}")

        text = f"[tenant_context] " + " | ".join(parts)
        vecs = embed_texts([text])
        vec  = vecs[0] if vecs else None
        if not vec or len(vec) < 64:
            continue

        cur.execute(
            "UPDATE tenant_context SET embedding = %s WHERE id = %s",
            (json.dumps(vec), row["id"])
        )
        vectorize_lines.append(json.dumps({
            "id":     f"tenant:{row['id']}",
            "values": vec,
            "metadata": {
                "source":      "tenant",
                "slug":        "tenant_context",
                "tenant_id":   str(row.get("tenant_id") or ""),
                "embed_model": EMBED_MODEL_TAG,
            }
        }))
        print(f"  ✅ tenant_context row embedded")

    conn.commit()
    return vectorize_lines


# ─── 4. agent_decisions ──────────────────────────────────────────────────────

def build_decision_text(row: dict) -> str:
    parts = [f"decision_type: {row.get('decision_type','')}"]
    for col in ("question","decision","reasoning","outcome","was_correct"):
        v = row.get(col)
        if v is not None:
            parts.append(f"{col}: {v}")
    return " | ".join(parts)


def embed_agent_decisions(conn, cur) -> list:
    print("\n── agent_decisions ──")
    cur.execute("""
        SELECT id, decision_type, question, decision, reasoning, outcome, was_correct
        FROM agent_decisions
        WHERE embedding IS NULL
        LIMIT 50
    """)
    rows = cur.fetchall()
    print(f"  {len(rows)} rows to embed")
    if not rows:
        return []

    passages = [{"id": r["id"], "text": build_decision_text(r), "meta": {
        "source":        "decision",
        "slug":          "agent_decision",
        "decision_type": str(r.get("decision_type") or ""),
        "was_correct":   str(r.get("was_correct") or ""),
        "embed_model":   EMBED_MODEL_TAG,
    }} for r in rows]

    vectorize_lines = []
    updated = 0
    for i in range(0, len(passages), BATCH):
        batch = passages[i:i+BATCH]
        vecs  = embed_texts([p["text"] for p in batch])
        for j, vec in enumerate(vecs):
            if not vec or len(vec) < 64:
                continue
            p = batch[j]
            cur.execute(
                "UPDATE agent_decisions SET embedding = %s WHERE id = %s",
                (json.dumps(vec), p["id"])
            )
            updated += 1
            vectorize_lines.append(json.dumps({
                "id":       f"decision:{p['id']}",
                "values":   vec,
                "metadata": p["meta"],
            }))

    conn.commit()
    print(f"  ✅ {updated} decisions updated in Supabase")
    return vectorize_lines


# ─── Push to Vectorize ────────────────────────────────────────────────────────

def push_vectorize(lines: list, label: str):
    if not lines:
        print(f"  [skip] no vectors for {label}")
        return
    path = OUT / f"supabase_{label}.jsonl"
    path.write_text("\n".join(lines), encoding="utf-8")
    print(f"\n  Pushing {label} ({len(lines)} vectors) → {INDEX} …")
    r = subprocess.run(
        ["npx","wrangler","vectorize","insert", INDEX,
         "--file", str(path), "-c", TOML],
        capture_output=False
    )
    if r.returncode != 0:
        print(f"  [warn] push exited {r.returncode}")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    try:
        import psycopg2
    except ImportError:
        import subprocess as sp
        sp.run(["pip3","install","psycopg2-binary","--break-system-packages"])
        import psycopg2

    print("Connecting to Supabase …")
    conn, CursorFactory = get_conn()
    cur = conn.cursor(cursor_factory=CursorFactory)
    print("✅ Connected\n")

    all_lines = []

    lines = embed_agent_memory(conn, cur)
    all_lines.extend(lines)
    push_vectorize(lines, "agent_memory")

    lines = embed_knowledge_edges(conn, cur)
    all_lines.extend(lines)
    push_vectorize(lines, "knowledge_edges")

    lines = embed_tenant_context(conn, cur)
    all_lines.extend(lines)
    push_vectorize(lines, "tenant_context")

    lines = embed_agent_decisions(conn, cur)
    all_lines.extend(lines)
    push_vectorize(lines, "agent_decisions")

    cur.close()
    conn.close()

    # Write combined
    combined = OUT / "supabase_combined.jsonl"
    combined.write_text("\n".join(all_lines), encoding="utf-8")
    print(f"\n{'─'*50}")
    print(f"  Total vectors: {len(all_lines)}")
    print(f"  Written: {combined}")
    print(f"  Vectorize index: {INDEX}")

    # Check index
    subprocess.run(["npx","wrangler","vectorize","info", INDEX, "-c", TOML])


if __name__ == "__main__":
    main()
