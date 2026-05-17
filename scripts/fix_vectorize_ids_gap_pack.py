#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from collections import Counter

PACK = Path("artifacts/agentsam_cursor_gap_pack_v2")
INFILE = PACK / "embeddings_clean_openai.vectorize.balanced.ndjson"
OUTFILE = PACK / "embeddings_clean_openai.vectorize.balanced.fixed_ids.ndjson"
MANIFEST = PACK / "VECTORIZE_FIXED_IDS_MANIFEST.md"

PREFIX = "asg_v2_"
MAX_ID_BYTES = 64


def short_id(old_id: str, source: str, chunk_index) -> str:
    seed = f"{old_id}|{source}|{chunk_index}"
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()[:40]
    return f"{PREFIX}{digest}"


def main() -> int:
    if not INFILE.exists():
        raise SystemExit(f"missing input: {INFILE}")

    rows = []
    old_too_long = []
    ids = set()
    dims = Counter()
    sources = Counter()

    with INFILE.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            if not line.strip():
                continue

            row = json.loads(line)
            old = str(row.get("id") or "")
            meta = row.get("metadata") or {}
            source = str(meta.get("source") or "unknown")
            chunk_index = meta.get("chunk_index")

            if len(old.encode("utf-8")) > MAX_ID_BYTES:
                old_too_long.append(old)

            new_id = short_id(old, source, chunk_index)
            if len(new_id.encode("utf-8")) > MAX_ID_BYTES:
                raise SystemExit(f"generated id still too long: {new_id}")

            if new_id in ids:
                raise SystemExit(f"duplicate generated id: {new_id}")
            ids.add(new_id)

            values = row.get("values")
            if not isinstance(values, list):
                raise SystemExit(f"missing values at line {line_no}")
            dims[len(values)] += 1
            sources[source] += 1

            meta["original_vector_id"] = old
            meta["vector_id_strategy"] = "sha256_40_hex_prefixed"
            row["metadata"] = meta
            row["id"] = new_id
            rows.append(row)

    if set(dims.keys()) != {1024}:
        raise SystemExit(f"bad dimensions: {dict(dims)}")

    with OUTFILE.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    body = []
    body.append("# Vectorize Fixed IDs Manifest\n")
    body.append(f"Input: `{INFILE}`")
    body.append(f"Output: `{OUTFILE}`")
    body.append(f"Rows: `{len(rows)}`")
    body.append(f"Dimensions: `{dict(dims)}`")
    body.append(f"IDs over 64 bytes in original: `{len(old_too_long)}`")
    body.append(f"New ID prefix: `{PREFIX}`")
    body.append("\n## Upload command\n")
    body.append("```bash")
    body.append("./scripts/with-cloudflare-env.sh npx wrangler vectorize insert ai-search-inneranimalmedia-autorag --file artifacts/agentsam_cursor_gap_pack_v2/embeddings_clean_openai.vectorize.balanced.fixed_ids.ndjson")
    body.append("```")
    body.append("\n## Sources\n")
    body.append("| Source | Rows |")
    body.append("|---|---:|")
    for source, count in sources.most_common():
        body.append(f"| `{source}` | {count} |")

    MANIFEST.write_text("\n".join(body) + "\n", encoding="utf-8")

    print(f"ok rows={len(rows)} original_too_long={len(old_too_long)} out={OUTFILE}")
    print(f"manifest={MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
