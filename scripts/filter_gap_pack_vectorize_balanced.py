#!/usr/bin/env python3
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

PACK = Path("artifacts/agentsam_cursor_gap_pack_v2")
INFILE = PACK / "embeddings_clean_openai.vectorize.ndjson"
OUTFILE = PACK / "embeddings_clean_openai.vectorize.balanced.ndjson"
MANIFEST = PACK / "VECTORIZE_BALANCED_MANIFEST.md"

SOURCE_LIMITS = {
    "artifacts/agentsam_cursor_gap_pack/table_usage.json": 120,
    "artifacts/agentsam_cursor_gap_pack/findings.json": 80,
}

ALWAYS_KEEP_PREFIXES = (
    "virtual/findings/",
)

ALWAYS_KEEP_SOURCES = {
    "artifacts/agentsam_cursor_gap_pack/00_INDEX.md",
    "artifacts/agentsam_cursor_gap_pack/15_cursor_quality_gap_summary.md",
    "artifacts/agentsam_cursor_gap_pack/17_openai_recommendations.md",
}

DEFAULT_SOURCE_LIMIT = 500


def keep_row(row, counts):
    meta = row.get("metadata") or {}
    source = str(meta.get("source") or "")

    if source in ALWAYS_KEEP_SOURCES:
        return True

    if source.startswith(ALWAYS_KEEP_PREFIXES):
        return True

    limit = SOURCE_LIMITS.get(source, DEFAULT_SOURCE_LIMIT)
    return counts[source] < limit


def main() -> int:
    if not INFILE.exists():
        raise SystemExit(f"missing input: {INFILE}")

    kept = []
    skipped = Counter()
    counts = Counter()
    dims = Counter()

    with INFILE.open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            meta = row.get("metadata") or {}
            source = str(meta.get("source") or "unknown")

            values = row.get("values")
            if not isinstance(values, list):
                raise SystemExit(f"bad values for {row.get('id')}")
            dims[len(values)] += 1

            if keep_row(row, counts):
                kept.append(row)
                counts[source] += 1
            else:
                skipped[source] += 1

    if set(dims.keys()) != {1024}:
        raise SystemExit(f"bad dimensions: {dict(dims)}")

    with OUTFILE.open("w", encoding="utf-8") as f:
        for row in kept:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    body = []
    body.append("# Balanced Vectorize Manifest\n")
    body.append(f"Input: `{INFILE}`")
    body.append(f"Output: `{OUTFILE}`")
    body.append(f"Kept rows: `{len(kept)}`")
    body.append(f"Dimensions: `{dict(dims)}`")
    body.append("\n## Kept by source\n")
    body.append("| Source | Kept | Skipped |")
    body.append("|---|---:|---:|")

    for source, count in counts.most_common():
        body.append(f"| `{source}` | {count} | {skipped[source]} |")

    MANIFEST.write_text("\n".join(body) + "\n", encoding="utf-8")

    print(f"ok kept={len(kept)} out={OUTFILE}")
    print(f"manifest={MANIFEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
