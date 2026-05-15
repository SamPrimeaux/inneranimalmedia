#!/usr/bin/env python3
"""
chunk_and_embed_inspection.py
─────────────────────────────
Parses agentsam_inspection.txt (format: ──── / tablename (N rows) / ────
with Row N: / key : value blocks) into per-table .md files, then generates
1024-dim embeddings via local Ollama (mxbai-embed-large).

Usage:
  # Chunk only
  python3 scripts/chunk_and_embed_inspection.py \
    --input agentsam_inspection.txt \
    --out   artifacts/agentsam_inspection

  # Chunk + embed
  python3 scripts/chunk_and_embed_inspection.py \
    --input agentsam_inspection.txt \
    --out   artifacts/agentsam_inspection \
    --embed

  # Force model
  python3 scripts/chunk_and_embed_inspection.py --embed --model mxbai-embed-large
"""

import argparse
import json
import re
import sys
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path


# ─── Config ──────────────────────────────────────────────────────────────────

OLLAMA_BASE      = "http://localhost:11434"
PREFERRED_MODELS = ["mxbai-embed-large", "bge-large-en-v1.5", "nomic-embed-text"]
EMBED_BATCH      = 20
SPARSE_THRESH    = 5

# Matches:  ────────────────── (any length, possibly indented)
DIVIDER_RE  = re.compile(r"^[\s]*[─━═\-]{10,}\s*$")
# Matches:  agentsam_foo  (3757 rows)  or  !!agentsam_foo  (0 rows)
TABLE_HDR   = re.compile(r"^\s*!*(\w+)\s+\((\d+)\s+rows?\)\s*$")
# Matches:  Row 1:
ROW_HDR     = re.compile(r"^\s*Row\s+\d+:\s*$")
# Matches:    key   : value
KV_RE       = re.compile(r"^\s{2,}(\S[\w\s]*?)\s*:\s*(.*?)\s*$")
# Matches schema col lines:  colname   TEXT   DEFAULT ...
SCHEMA_COL  = re.compile(r"^\s{2,}(\w+)\s+(TEXT|INTEGER|REAL|BLOB|NUMERIC|BOOLEAN)\s*(.*?)\s*$", re.I)


# ─── Data structures ─────────────────────────────────────────────────────────

@dataclass
class TableChunk:
    name:    str
    total:   int                          # row count from header
    schema:  list = field(default_factory=list)   # [(col, type, extras)]
    rows:    list = field(default_factory=list)   # [{"col": "val", ...}]

    @property
    def row_count(self): return len(self.rows)
    @property
    def is_empty(self):  return self.total == 0
    @property
    def is_sparse(self): return 0 < self.total <= SPARSE_THRESH


# ─── Parser ──────────────────────────────────────────────────────────────────

def parse_inspection_file(path: Path) -> list:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    chunks: list[TableChunk] = []
    i = 0
    n = len(lines)

    while i < n:
        # Look for divider line
        if not DIVIDER_RE.match(lines[i]):
            i += 1
            continue

        # Next non-blank line should be the table header
        j = i + 1
        while j < n and not lines[j].strip():
            j += 1
        if j >= n:
            break

        m = TABLE_HDR.match(lines[j])
        if not m:
            i = j + 1
            continue

        table_name = m.group(1)
        total_rows = int(m.group(2))

        # Skip closing divider
        k = j + 1
        while k < n and not DIVIDER_RE.match(lines[k]):
            k += 1
        section_start = k + 1  # first line after closing divider

        # Find where next section starts (next divider+header pair)
        section_end = n
        p = section_start
        while p < n:
            if DIVIDER_RE.match(lines[p]):
                # Peek ahead for a table header
                q = p + 1
                while q < n and not lines[q].strip():
                    q += 1
                if q < n and TABLE_HDR.match(lines[q]):
                    section_end = p
                    break
            p += 1

        block = lines[section_start:section_end]
        schema, rows = _parse_block(block)

        chunk = TableChunk(name=table_name, total=total_rows, schema=schema, rows=rows)
        chunks.append(chunk)
        print(f"✓ {table_name}.md ({total_rows} rows, {len(rows)} sampled)")

        i = section_end if section_end < n else n

    return chunks


def _parse_block(lines: list) -> tuple:
    """Extract schema columns and sample rows from a table block."""
    schema = []
    rows   = []

    in_schema  = False
    in_samples = False
    cur_row    = None

    for line in lines:
        stripped = line.strip()

        # Section markers
        if re.match(r"SCHEMA\s*\(", stripped):
            in_schema  = True
            in_samples = False
            continue
        if re.match(r"SAMPLE\s+ROWS", stripped, re.I):
            in_schema  = False
            in_samples = True
            continue

        if in_schema:
            mc = SCHEMA_COL.match(line)
            if mc:
                schema.append((mc.group(1), mc.group(2).upper(), mc.group(3).strip()))
            continue

        if in_samples:
            if ROW_HDR.match(line):
                if cur_row:
                    rows.append(cur_row)
                cur_row = {}
                continue
            if cur_row is not None:
                mk = KV_RE.match(line)
                if mk:
                    key = mk.group(1).strip()
                    val = mk.group(2).strip()
                    cur_row[key] = val

    if cur_row:
        rows.append(cur_row)

    return schema, rows


# ─── Markdown writer ─────────────────────────────────────────────────────────

def write_chunks(chunks: list, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    empty  = [c for c in chunks if c.is_empty]
    sparse = [c for c in chunks if c.is_sparse]
    active = [c for c in chunks if not c.is_empty and not c.is_sparse]

    for chunk in chunks:
        _write_table_md(chunk, out_dir)

    _write_index(chunks, active, sparse, empty, out_dir)
    _write_critical_empty(empty, out_dir)
    _write_sparse(sparse, out_dir)

    print(f"\nDone: {out_dir}")
    print(f"Tables: {len(chunks)}  Empty: {len(empty)}  Sparse: {len(sparse)}  Active: {len(active)}")


def _write_table_md(chunk: TableChunk, out_dir: Path) -> None:
    lines = [f"# {chunk.name}", "", f"**Total rows (D1):** {chunk.total}", ""]

    # Schema table
    if chunk.schema:
        lines += ["## Schema", ""]
        lines.append("| Column | Type | Details |")
        lines.append("| --- | --- | --- |")
        for col, typ, extra in chunk.schema:
            extra_clean = extra.replace("|", "\\|")
            lines.append(f"| `{col}` | {typ} | {extra_clean} |")
        lines.append("")

    # Sample rows
    if chunk.rows:
        # Collect all keys across sample rows
        all_keys = list(dict.fromkeys(k for r in chunk.rows for k in r))
        lines += [f"## Sample Rows ({len(chunk.rows)} shown)", ""]
        lines.append("| " + " | ".join(all_keys) + " |")
        lines.append("| " + " | ".join(["---"] * len(all_keys)) + " |")
        for row in chunk.rows:
            cells = [str(row.get(k, "")).replace("|", "\\|")[:120] for k in all_keys]
            lines.append("| " + " | ".join(cells) + " |")
        lines.append("")
    elif chunk.is_empty:
        lines.append("_No rows (table is empty)_")
        lines.append("")
    else:
        lines.append("_No sample rows captured_")
        lines.append("")

    (out_dir / f"{chunk.name}.md").write_text("\n".join(lines), encoding="utf-8")


def _write_index(all_chunks, active, sparse, empty, out_dir):
    lines = [
        "# Agent Sam Inspection — Index", "",
        f"**Total tables:** {len(all_chunks)}  ",
        f"**Active:** {len(active)}  ",
        f"**Sparse (≤{SPARSE_THRESH} rows):** {len(sparse)}  ",
        f"**Empty:** {len(empty)}", "",
        "| Table | D1 Rows | Status |", "| --- | --- | --- |",
    ]
    for c in sorted(all_chunks, key=lambda x: -x.total):
        status = "empty" if c.is_empty else ("sparse" if c.is_sparse else "active")
        lines.append(f"| [{c.name}](./{c.name}.md) | {c.total} | {status} |")
    (out_dir / "INDEX.md").write_text("\n".join(lines), encoding="utf-8")


def _write_critical_empty(empty, out_dir):
    body = "\n".join(f"- `{c.name}`" for c in empty) or "_None_"
    (out_dir / "CRITICAL_EMPTY.md").write_text(f"# Critical: Empty Tables\n\n{body}", encoding="utf-8")


def _write_sparse(sparse, out_dir):
    body = "\n".join(f"- `{c.name}` — {c.total} rows" for c in sparse) or "_None_"
    (out_dir / "SPARSE_TABLES.md").write_text(
        f"# Sparse Tables (≤{SPARSE_THRESH} rows)\n\n{body}", encoding="utf-8"
    )


# ─── Ollama helpers ──────────────────────────────────────────────────────────

def _ollama_post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        f"{OLLAMA_BASE}{path}", data=data,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode("utf-8"))


def detect_model(preferred=None):
    req = urllib.request.Request(f"{OLLAMA_BASE}/api/tags")
    with urllib.request.urlopen(req, timeout=10) as r:
        tags = json.loads(r.read().decode("utf-8"))
    models = tags.get("models", [])
    names  = [m["name"] for m in models]
    print(f"  Available: {', '.join(names) or '(none)'}")

    if preferred:
        match = next((n for n in names if n.startswith(preferred)), None)
        if match:
            print(f"  Using: {match}")
            return match
        print(f"  [warn] '{preferred}' not found — falling back")

    for candidate in PREFERRED_MODELS:
        match = next((n for n in names if n.startswith(candidate)), None)
        if match:
            print(f"  Selected: {match}")
            return match

    sys.exit("No embedding model found. Run: ollama pull mxbai-embed-large")


def get_embedding(model, text):
    resp = _ollama_post("/api/embeddings", {"model": model, "prompt": text})
    vec  = resp.get("embedding")
    if not vec:
        raise ValueError(f"No embedding returned: {resp}")
    return vec


def get_embeddings_batch(model, texts):
    try:
        resp = _ollama_post("/api/embed", {"model": model, "input": texts})
        vecs = resp.get("embeddings")
        if vecs and len(vecs) == len(texts):
            return vecs
    except Exception:
        pass
    return [get_embedding(model, t) for t in texts]


# ─── Embeddings ──────────────────────────────────────────────────────────────

def embed_chunks(chunks: list, out_dir: Path, model: str) -> None:
    embed_dir = out_dir / "embeddings"
    embed_dir.mkdir(parents=True, exist_ok=True)

    print(f"\nWarm-up embedding …")
    test_vec = get_embedding(model, "warm-up")
    dim = len(test_vec)
    print(f"  Model: {model}  |  dim: {dim}")
    if dim != 1024:
        print(f"  [warn] dim={dim}, not 1024 — Vectorize index must match")

    combined_lines = []

    for chunk in chunks:
        if chunk.is_empty:
            print(f"  skip {chunk.name} (empty)")
            continue

        passages = _build_passages(chunk)
        if not passages:
            continue

        table_lines = []
        print(f"  {chunk.name}: {len(passages)} passages", end="", flush=True)

        for i in range(0, len(passages), EMBED_BATCH):
            batch = passages[i : i + EMBED_BATCH]
            try:
                vecs = get_embeddings_batch(model, [p[0] for p in batch])
            except Exception as e:
                print(f"\n  [warn] batch {i} failed: {e}")
                continue
            for j, vec in enumerate(vecs):
                entry = json.dumps({
                    "id":       f"{chunk.name}:{i + j}",
                    "values":   vec,
                    "metadata": batch[j][1],
                }, ensure_ascii=False)
                table_lines.append(entry)
                combined_lines.append(entry)
            print(".", end="", flush=True)

        print(f" → {len(table_lines)} vectors")
        (embed_dir / f"{chunk.name}.jsonl").write_text("\n".join(table_lines), encoding="utf-8")

    combined_path = embed_dir / "combined.jsonl"
    combined_path.write_text("\n".join(combined_lines), encoding="utf-8")
    print(f"\n  combined.jsonl → {len(combined_lines)} total vectors")
    print(f"  Upload: wrangler vectorize insert {combined_path} --index-name ai-search-inneranimalmedia-autorag -c wrangler.production.toml")


def _build_passages(chunk: TableChunk) -> list:
    passages = []

    # Schema as one passage
    if chunk.schema:
        schema_text = f"[{chunk.name}] schema: " + ", ".join(
            f"{col} {typ}" for col, typ, _ in chunk.schema
        )
        passages.append((schema_text[:1500], {
            "table": chunk.name,
            "passage_type": "schema",
            "row_index": -1,
        }))

    # One passage per sample row
    for i, row in enumerate(chunk.rows):
        parts = [f"{k}: {v}" for k, v in row.items() if v and v not in ("null", "NULL", "")]
        text  = f"[{chunk.name}] " + " | ".join(parts)
        passages.append((text[:1500], {
            "table":     chunk.name,
            "passage_type": "row",
            "row_index": i,
            **{k: str(v)[:80] for k, v in list(row.items())[:8]},
        }))

    return passages


# ─── CLI ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="Chunk agentsam_inspection.txt → per-table .md + Ollama embeddings → Vectorize JSONL"
    )
    ap.add_argument("--input",  default="agentsam_inspection.txt")
    ap.add_argument("--out",    default="artifacts/agentsam_inspection")
    ap.add_argument("--embed",  action="store_true")
    ap.add_argument("--push",   action="store_true",             help="Upload to Vectorize after embedding")
    ap.add_argument("--index",  default="ai-search-inneranimalmedia-autorag", help="Vectorize index name")
    ap.add_argument("--toml",   default="wrangler.production.toml", help="Wrangler config for push")
    ap.add_argument("--model",  default=None,                    help="Ollama model (auto-detected)")
    ap.add_argument("--ollama", default="http://localhost:11434", help="Ollama base URL")
    args = ap.parse_args()

    global OLLAMA_BASE
    OLLAMA_BASE = args.ollama.rstrip("/")

    in_path = Path(args.input)
    out_dir = Path(args.out)

    if not in_path.exists():
        sys.exit(f"Input not found: {in_path}")

    print(f"Parsing {in_path} …")
    chunks = parse_inspection_file(in_path)

    print(f"\nWriting markdown chunks to {out_dir} …")
    write_chunks(chunks, out_dir)

    if args.embed:
        print("\nQuerying Ollama …")
        model = detect_model(args.model)
        embed_chunks(chunks, out_dir, model)

        if args.push:
            import subprocess
            combined = out_dir / "embeddings" / "combined.jsonl"
            if not combined.exists() or combined.stat().st_size == 0:
                print("  [skip] combined.jsonl is empty — nothing to push")
            else:
                print(f"\nPushing to Vectorize index: {args.index} …")
                cmd = [
                    "npx", "wrangler", "vectorize", "insert", args.index,
                    "--file", str(combined),
                    "-c", args.toml,
                ]
                result = subprocess.run(cmd, capture_output=False)
                if result.returncode != 0:
                    print(f"  [warn] wrangler exited {result.returncode}")
                else:
                    print(f"  Done — vectors live in {args.index}")

    print(f"\nOpen: {out_dir}/INDEX.md")


if __name__ == "__main__":
    main()
