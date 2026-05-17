#!/usr/bin/env python3
from __future__ import annotations

import datetime as dt
import hashlib
import json
import subprocess
from collections import Counter
from pathlib import Path

INDEX_NAME = "ai-search-inneranimalmedia-autorag"
PACK_DIR = Path("artifacts/agentsam_cursor_gap_pack_v2")
VECTOR_FILE = PACK_DIR / "embeddings_clean_openai.vectorize.ndjson"
LOCAL_FILE = PACK_DIR / "embeddings_clean_openai.local.jsonl"
MANIFEST_FILE = PACK_DIR / "VECTORIZE_MANIFEST.md"


def sh(cmd: list[str]) -> str:
    try:
        return subprocess.run(cmd, text=True, capture_output=True, check=False).stdout.strip()
    except Exception:
        return ""


def main() -> int:
    if not VECTOR_FILE.exists():
        raise SystemExit(f"Missing vector file: {VECTOR_FILE}")

    ids = set()
    dupes = []
    dims = Counter()
    sources = Counter()
    row_count = 0

    with VECTOR_FILE.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue

            row = json.loads(line)
            rid = row.get("id")
            values = row.get("values")
            metadata = row.get("metadata") or {}

            if not rid:
                raise SystemExit(f"Missing id at line {line_no}")
            if rid in ids:
                dupes.append(rid)
            ids.add(rid)

            if not isinstance(values, list):
                raise SystemExit(f"Missing values list at line {line_no}: {rid}")

            dims[len(values)] += 1
            sources[str(metadata.get("source", "unknown"))] += 1
            row_count += 1

    if dupes:
        raise SystemExit(f"Duplicate ids found: {dupes[:10]}")

    if set(dims.keys()) != {1024}:
        raise SystemExit(f"Bad vector dimensions: {dict(dims)}")

    local_count = 0
    if LOCAL_FILE.exists():
        with LOCAL_FILE.open("r", encoding="utf-8") as f:
            local_count = sum(1 for line in f if line.strip())

    sha = hashlib.sha256(VECTOR_FILE.read_bytes()).hexdigest()
    git_sha = sh(["git", "rev-parse", "HEAD"])
    branch = sh(["git", "branch", "--show-current"])

    body = []
    body.append("# Vectorize Manifest\n")
    body.append(f"Generated: `{dt.datetime.now(dt.timezone.utc).isoformat()}`")
    body.append(f"Index: `{INDEX_NAME}`")
    body.append("Pack: `agentsam_cursor_gap_pack_v2`")
    body.append(f"Vector file: `{VECTOR_FILE}`")
    body.append(f"Local file: `{LOCAL_FILE}`")
    body.append(f"Vector rows: `{row_count}`")
    body.append(f"Local rows: `{local_count}`")
    body.append(f"Dimensions: `{dict(dims)}`")
    body.append(f"SHA256: `{sha}`")
    body.append(f"Git branch: `{branch}`")
    body.append(f"Git SHA: `{git_sha}`")
    body.append("\n## Top sources\n")
    body.append("| Source | Vectors |")
    body.append("|---|---:|")

    for source, count in sources.most_common(50):
        body.append(f"| `{source}` | {count} |")

    body.append("\n## Upload command\n")
    body.append("```bash")
    body.append(
        "./scripts/with-cloudflare-env.sh npx wrangler vectorize insert "
        f"{INDEX_NAME} --file {VECTOR_FILE}"
    )
    body.append("```")

    MANIFEST_FILE.write_text("\n".join(body) + "\n", encoding="utf-8")

    print(f"ok rows={row_count} dims={dict(dims)}")
    print(f"manifest={MANIFEST_FILE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
