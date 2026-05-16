#!/usr/bin/env python3

import json
import os
import re
import time
import urllib.request
from pathlib import Path

REPO = Path(".").resolve()
SRC = REPO / "artifacts" / "cms_d1_pull" / "cms_d1_pull_all.json"
OUT = REPO / "artifacts" / "cms_ollama_gameplan"
OUT.mkdir(parents=True, exist_ok=True)

raw_host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").strip()

if raw_host in {"0.0.0.0", "0.0.0.0:11434"}:
    raw_host = "127.0.0.1:11434"

if not raw_host.startswith(("http://", "https://")):
    raw_host = "http://" + raw_host

OLLAMA_HOST = raw_host
WRITE_MODEL = "qwen2.5-coder:7b"
EMBED_MODEL = "mxbai-embed-large:latest"
CHUNK_SIZE = 1024


def load_json(path):
    if not path.exists():
        raise SystemExit(f"Missing file: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("WROTE:", path)


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print("WROTE:", path)


def ollama_generate(prompt):
    body = {
        "model": WRITE_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "top_p": 0.9,
            "num_ctx": 8192
        }
    }

    req = urllib.request.Request(
        OLLAMA_HOST.rstrip("/") + "/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=420) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return data.get("response", "").strip()


def ollama_embed(text):
    body = {"model": EMBED_MODEL, "prompt": text}

    try:
        req = urllib.request.Request(
            OLLAMA_HOST.rstrip("/") + "/api/embeddings",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        if isinstance(data.get("embedding"), list):
            return data["embedding"]
    except Exception:
        pass

    body = {"model": EMBED_MODEL, "input": text}

    req = urllib.request.Request(
        OLLAMA_HOST.rstrip("/") + "/api/embed",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    embeddings = data.get("embeddings") or []
    if embeddings and isinstance(embeddings[0], list):
        return embeddings[0]

    return None


def chunk_text(text, size=1024, overlap=128):
    text = text.strip()
    chunks = []
    i = 0

    while i < len(text):
        end = min(i + size, len(text))
        piece = text[i:end]

        if end < len(text):
            cut = max(piece.rfind("\n\n"), piece.rfind("\n"), piece.rfind(". "))
            if cut > int(size * 0.55):
                end = i + cut + 1
                piece = text[i:end]

        piece = piece.strip()
        if piece:
            chunks.append(piece)

        if end >= len(text):
            break

        i = max(0, end - overlap)

    return chunks


def table_brief(table):
    cols = table.get("columns") or []
    idxs = table.get("indexes") or []
    fks = table.get("foreign_keys") or []
    samples = table.get("sample_rows") or []

    col_names = [c.get("name") for c in cols]

    return {
        "name": table.get("name"),
        "row_count": table.get("row_count"),
        "columns": col_names,
        "indexes": idxs,
        "foreign_keys": fks,
        "sample_rows": samples[:2],
        "create_sql": table.get("create_sql") or table.get("sql"),
    }


def make_schema_markdown(data):
    lines = [
        "# CMS D1 Pull Digest",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"DB: {data.get('db')}",
        f"Mode: {data.get('mode')}",
        "",
        "## Tables",
        "",
    ]

    for table in data.get("tables", []):
        cols = table.get("columns") or []
        col_names = [c.get("name") for c in cols]
        lines.append(f"## {table.get('name')}")
        lines.append("")
        lines.append(f"Rows: `{table.get('row_count')}`")
        lines.append("")
        lines.append("Columns:")
        lines.append("")
        for name in col_names:
            lines.append(f"- `{name}`")
        lines.append("")
        lines.append("Create SQL:")
        lines.append("")
        lines.append("```sql")
        lines.append(str(table.get("create_sql") or table.get("sql") or ""))
        lines.append("```")
        lines.append("")

    return "\n".join(lines)


def main():
    data = load_json(SRC)
    tables = data.get("tables", [])

    schema_md = make_schema_markdown(data)
    write(OUT / "00_CMS_D1_DIGEST.md", schema_md)

    table_briefs = [table_brief(t) for t in tables]

    prompt = f"""
You are Agent Sam's CMS architect for Inner Animal Media.

We pulled the real Cloudflare D1 cms_* tables. Use only this schema and explain how the CMS is intended to work.

CMS table briefs:
{json.dumps(table_briefs, indent=2)[:50000]}

Write a practical markdown gameplan with:

1. Plain-English explanation of what this cms_* system is.
2. How these tables should work together as a Shopify/Liquid-style CMS.
3. Table-by-table intended role.
4. The correct page lifecycle:
   route request -> cms_pages -> cms_page_sections -> cms_liquid_sections/component templates -> assets/collections -> theme tokens -> rendered page/R2 artifact.
5. How drafts, overrides, live edit sessions, and rollbacks should work.
6. How to rebuild public pages properly from this CMS model.
7. What should be stored in D1 vs R2 vs source code.
8. What should be embedded for Agent Sam retrieval.
9. What to ask a stronger OpenAI API model to remaster next.
10. First migration sprint with exact priorities.

Be direct, technical, and specific. No generic CMS fluff.
"""

    print("ASKING:", WRITE_MODEL)
    report = ollama_generate(prompt)
    write(OUT / "01_QWEN_CMS_GAMEPLAN.md", "# Qwen CMS Gameplan\n\n" + report + "\n")

    combined = schema_md + "\n\n# Qwen CMS Gameplan\n\n" + report
    chunks = []

    for i, chunk in enumerate(chunk_text(combined, CHUNK_SIZE)):
        chunks.append({
            "id": f"cms_gameplan_{i:04d}",
            "source": "cms_ollama_gameplan",
            "chunk_index": i,
            "text": chunk,
            "metadata": {
                "kind": "cms_gameplan",
                "chunk_size": CHUNK_SIZE,
                "write_model": WRITE_MODEL,
                "embed_model": EMBED_MODEL,
            }
        })

    write_jsonl(OUT / "chunks_1024.jsonl", chunks)

    embedded = []
    vectorize = []

    print("EMBEDDING:", len(chunks), "chunks with", EMBED_MODEL)

    for i, row in enumerate(chunks, 1):
        vec = ollama_embed(row["text"])

        if not vec:
            print("EMBED FAILED:", row["id"])
            continue

        local = dict(row)
        local["embedding"] = vec
        embedded.append(local)

        vectorize.append({
            "id": row["id"],
            "values": vec,
            "metadata": {
                **row["metadata"],
                "source": row["source"],
                "chunk_index": row["chunk_index"],
                "text": row["text"][:3000],
            }
        })

        if i % 10 == 0:
            print("embedded", i, "/", len(chunks))

    write_jsonl(OUT / "embeddings_mxbai.local.jsonl", embedded)
    write_jsonl(OUT / "embeddings_mxbai.vectorize.ndjson", vectorize)

    index = f"""# CMS Ollama Gameplan

Generated from:

`{SRC}`

Outputs:

- `00_CMS_D1_DIGEST.md`
- `01_QWEN_CMS_GAMEPLAN.md`
- `chunks_1024.jsonl`
- `embeddings_mxbai.local.jsonl`
- `embeddings_mxbai.vectorize.ndjson`

Chunks: `{len(chunks)}`
Embedded: `{len(embedded)}`

Next step: review `01_QWEN_CMS_GAMEPLAN.md`, then send the digest/gameplan to OpenAI API for a higher-quality remaster pass.
"""
    write(OUT / "INDEX.md", index)

    print("")
    print("DONE")
    print("OPEN:", OUT)


if __name__ == "__main__":
    main()