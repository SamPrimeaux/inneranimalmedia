#!/usr/bin/env python3

import json
import os
import re
import urllib.request
from pathlib import Path

REPO = Path(".").resolve()
OUT = REPO / "artifacts" / "cms_ollama_gameplan"
SUMMARY_MD = OUT / "02_CHUNK_SUMMARIES.md"

WRITE_MODEL = "qwen2.5-coder:7b"
EMBED_MODEL = "mxbai-embed-large:latest"

CHUNK_SIZE = 1024
OVERLAP = 128

raw_host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").strip()
if raw_host in ("0.0.0.0", "0.0.0.0:11434"):
    raw_host = "127.0.0.1:11434"
if not raw_host.startswith("http://") and not raw_host.startswith("https://"):
    raw_host = "http://" + raw_host
OLLAMA_HOST = raw_host


def read_text(path):
    if not path.exists():
        raise SystemExit("Missing file: " + str(path))
    return path.read_text(encoding="utf-8")


def write_text(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("WROTE:", path)


def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
    print("WROTE:", path)


def chunk_text(text, size, overlap):
    text = text.strip()
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + size, len(text))
        piece = text[start:end]

        if end < len(text):
            cut = max(piece.rfind("\n\n"), piece.rfind("\n"), piece.rfind(". "))
            if cut > int(size * 0.55):
                end = start + cut + 1
                piece = text[start:end]

        piece = piece.strip()
        if piece:
            chunks.append(piece)

        if end >= len(text):
            break

        start = max(0, end - overlap)

    return chunks


def ollama_generate(prompt):
    body = {
        "model": WRITE_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "top_p": 0.9,
            "num_ctx": 8192,
        },
    }

    req = urllib.request.Request(
        OLLAMA_HOST.rstrip("/") + "/api/generate",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=420) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    return str(data.get("response", "")).strip()


def ollama_embed(text):
    try:
        body = {"model": EMBED_MODEL, "prompt": text}

        req = urllib.request.Request(
            OLLAMA_HOST.rstrip("/") + "/api/embeddings",
            data=json.dumps(body).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        embedding = data.get("embedding")
        if isinstance(embedding, list):
            return embedding
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


def make_synthesis_prompt(summaries):
    max_chars = 60000
    if len(summaries) > max_chars:
        summaries = summaries[:max_chars]

    return (
        "You are Agent Sam's CMS architect for Inner Animal Media.\n\n"
        + "Below are chunk-level summaries from the real cms_* Cloudflare D1 schema.\n\n"
        + "Chunk summaries:\n"
        + "```markdown\n"
        + summaries
        + "\n```\n\n"
        + "Write a final practical markdown gameplan with:\n"
        + "1. Plain-English explanation of what the cms_* system is.\n"
        + "2. How the tables work together as a Shopify/Liquid-style CMS.\n"
        + "3. Correct page lifecycle: route request -> cms_pages -> cms_page_sections -> cms_liquid_sections/component templates -> assets/collections -> theme tokens -> rendered page/R2 artifact.\n"
        + "4. Table group roles: pages/sections, liquid/templates, assets/collections, themes, drafts/overrides/live editing, tenants/settings, conversions/video/3d.\n"
        + "5. How to rebuild every public page into this CMS design.\n"
        + "6. D1 vs R2 vs source-code responsibilities.\n"
        + "7. What should be embedded for semantic Agent Sam editing.\n"
        + "8. What to send to OpenAI API next for a higher-quality remaster.\n"
        + "9. First migration sprint with exact priorities.\n\n"
        + "Be direct, technical, and implementation-focused.\n"
    )


def main():
    summaries = read_text(SUMMARY_MD)

    print("WRITING FINAL SYNTHESIS")
    gameplan = ollama_generate(make_synthesis_prompt(summaries))

    write_text(OUT / "03_QWEN_CMS_GAMEPLAN.md", "# Qwen CMS Gameplan\n\n" + gameplan + "\n")

    docs = []
    docs.append(("02_CHUNK_SUMMARIES.md", summaries))
    docs.append(("03_QWEN_CMS_GAMEPLAN.md", gameplan))

    embed_chunks = []
    for source, text in docs:
        pieces = chunk_text(text, CHUNK_SIZE, OVERLAP)
        for i, piece in enumerate(pieces):
            embed_chunks.append(
                {
                    "id": "cms_gameplan_" + str(len(embed_chunks)).zfill(4),
                    "source": source,
                    "chunk_index": i,
                    "text": piece,
                    "metadata": {
                        "kind": "cms_gameplan",
                        "source": source,
                        "chunk_size": CHUNK_SIZE,
                        "write_model": WRITE_MODEL,
                        "embed_model": EMBED_MODEL,
                    },
                }
            )

    write_jsonl(OUT / "04_embed_chunks_1024.jsonl", embed_chunks)

    embedded = []
    vectorize = []

    for i, row in enumerate(embed_chunks, 1):
        print("EMBEDDING", i, "/", len(embed_chunks), row["id"])

        vec = ollama_embed(row["text"])
        if not vec:
            print("EMBED FAILED:", row["id"])
            continue

        local = dict(row)
        local["embedding"] = vec
        embedded.append(local)

        vectorize.append(
            {
                "id": row["id"],
                "values": vec,
                "metadata": {
                    "kind": row["metadata"]["kind"],
                    "source": row["source"],
                    "chunk_index": row["chunk_index"],
                    "chunk_size": CHUNK_SIZE,
                    "text": row["text"][:3000],
                },
            }
        )

    write_jsonl(OUT / "05_embeddings_mxbai.local.jsonl", embedded)
    write_jsonl(OUT / "05_embeddings_mxbai.vectorize.ndjson", vectorize)

    index = "# CMS Ollama Gameplan\n\n"
    index += "Main file: `03_QWEN_CMS_GAMEPLAN.md`\n\n"
    index += "Embed chunks: `" + str(len(embed_chunks)) + "`\n"
    index += "Embedded: `" + str(len(embedded)) + "`\n"

    write_text(OUT / "INDEX.md", index)

    print("DONE")
    print("MAIN:", OUT / "03_QWEN_CMS_GAMEPLAN.md")


if __name__ == "__main__":
    main()