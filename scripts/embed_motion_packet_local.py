#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path("/Users/samprimeaux/inneranimalmedia")
INPUT = ROOT / "artifacts/cms_motion_system_schema_audit/CHATGPT_REVIEW_PACKET.md"
OUT_DIR = ROOT / "artifacts/cms_vectorize"
OUT_DIR.mkdir(parents=True, exist_ok=True)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
if OLLAMA_HOST in {"0.0.0.0", "0.0.0.0:11434", "localhost", "127.0.0.1"}:
    OLLAMA_HOST = "http://127.0.0.1:11434"
elif not OLLAMA_HOST.startswith(("http://", "https://")):
    OLLAMA_HOST = "http://" + OLLAMA_HOST

MODEL = os.getenv("OLLAMA_EMBED_MODEL", "mxbai-embed-large:latest")
INDEX = "ai-search-inneranimalmedia-autorag"
DIM = 1024
STAMP = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

OUT = OUT_DIR / f"cms_motion_packet_{STAMP}.vectorize.ndjson"
LATEST = OUT_DIR / "LATEST_CMS_MOTION_PACKET.vectorize.ndjson"
SUMMARY = OUT_DIR / f"cms_motion_packet_{STAMP}.summary.md"
LATEST_SUMMARY = OUT_DIR / "LATEST_CMS_MOTION_PACKET_SUMMARY.md"

MAX_CHARS = 2200
OVERLAP = 260

def sha(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()

def chunks(text: str) -> list[str]:
    text = text.replace("\r\n", "\n").replace("\r", "\n").strip()
    blocks = re.split(r"\n(?=# |## |### |```|CREATE TABLE|INSERT INTO|UPDATE |SELECT |\| Table |\| cid )", text)
    out = []
    for b in blocks:
        b = b.strip()
        if not b:
            continue
        if len(b) <= MAX_CHARS:
            out.append(b)
            continue
        i = 0
        while i < len(b):
            j = min(i + MAX_CHARS, len(b))
            out.append(b[i:j].strip())
            if j >= len(b):
                break
            i = max(0, j - OVERLAP)
    return out

def embed(text: str) -> list[float]:
    payload = json.dumps({"model": MODEL, "prompt": text}).encode("utf-8")
    req = urllib.request.Request(
        f"{OLLAMA_HOST}/api/embeddings",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    values = data.get("embedding")
    if not isinstance(values, list):
        raise RuntimeError("No embedding returned")
    if len(values) != DIM:
        raise RuntimeError(f"Embedding dimension mismatch: got {len(values)}, expected {DIM}")
    return values

def main() -> None:
    if not INPUT.exists():
        raise SystemExit(f"Missing input: {INPUT}")

    text = INPUT.read_text(encoding="utf-8", errors="replace")
    parts = chunks(text)

    ok = 0
    failed = 0

    with OUT.open("w", encoding="utf-8") as f:
        for idx, part in enumerate(parts):
            chunk_text = (
                "Project: inneranimalmedia\n"
                "System: CMS motion schema audit\n"
                "Source: artifacts/cms_motion_system_schema_audit/CHATGPT_REVIEW_PACKET.md\n"
                "Vectorize index: ai-search-inneranimalmedia-autorag\n\n"
                + part
            )
            chunk_id = "cmsmotion_" + hashlib.sha256(f"{idx}:{sha(chunk_text)}".encode()).hexdigest()[:24]

            try:
                values = embed(chunk_text)
            except Exception as e:
                failed += 1
                print(f"fail {chunk_id}: {e}")
                time.sleep(0.5)
                continue

            row = {
                "id": chunk_id,
                "values": values,
                "metadata": {
                    "project": "inneranimalmedia",
                    "system": "cms",
                    "lane": "cms_motion_schema",
                    "source_path": "artifacts/cms_motion_system_schema_audit/CHATGPT_REVIEW_PACKET.md",
                    "chunk_index": idx,
                    "chunk_sha256": sha(chunk_text),
                    "embedded_at": STAMP,
                    "embedding_model": MODEL,
                    "vectorize_index": INDEX,
                    "dimensions": DIM,
                    "text": chunk_text,
                },
            }
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            ok += 1
            print(f"ok {ok}: {chunk_id}")

    LATEST.write_text(OUT.read_text(encoding="utf-8"), encoding="utf-8")

    SUMMARY.write_text(
        "\n".join([
            "# CMS Motion Packet Embedding Summary",
            "",
            f"- Generated: `{STAMP}`",
            f"- Input: `{INPUT}`",
            f"- Input bytes: `{INPUT.stat().st_size}`",
            f"- Chunks attempted: `{len(parts)}`",
            f"- Successful chunks: `{ok}`",
            f"- Failed chunks: `{failed}`",
            f"- Output: `{OUT}`",
            f"- Latest: `{LATEST}`",
            "",
            "## Upload",
            "",
            "```bash",
            f"cd {ROOT} && npx wrangler vectorize upsert {INDEX} --file {LATEST}",
            "```",
            "",
        ]),
        encoding="utf-8",
    )
    LATEST_SUMMARY.write_text(SUMMARY.read_text(encoding="utf-8"), encoding="utf-8")

    print("")
    print("DONE")
    print(f"ok:      {ok}")
    print(f"failed:  {failed}")
    print(f"latest:  {LATEST}")
    print(f"summary: {LATEST_SUMMARY}")

if __name__ == "__main__":
    main()
