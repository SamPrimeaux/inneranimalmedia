#!/usr/bin/env python3

import concurrent.futures
import json
import os
import time
import urllib.request
from pathlib import Path

REPO = Path(".").resolve()
OUT = REPO / "artifacts" / "cms_ollama_gameplan"
INPUT = OUT / "01_schema_chunks_1024.jsonl"
SUMMARY_DIR = OUT / "chunk_summaries"

MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
API_KEY = os.environ.get("OPENAI_API_KEY", "")
MAX_WORKERS = int(os.environ.get("OPENAI_MAX_WORKERS", "8"))


def read_jsonl(path):
    if not path.exists():
        raise SystemExit("Missing input file: " + str(path))

    rows = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


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


def make_prompt(row):
    return (
        "You are analyzing one 1024-character chunk of Inner Animal Media's real cms_* Cloudflare D1 schema.\n\n"
        "Chunk ID: " + row["id"] + "\n\n"
        "Schema chunk:\n"
        "```text\n"
        + row["text"]
        + "\n```\n\n"
        "Return concise markdown with these sections:\n"
        "- Tables and fields noticed\n"
        "- Intended CMS role\n"
        "- Relationships implied\n"
        "- Risks or missing indexes\n"
        "- How this supports a Shopify/Liquid-style CMS\n"
        "- What Agent Sam should remember\n\n"
        "Be specific and compact."
    )


def openai_responses(prompt, retries=4):
    if not API_KEY:
        raise SystemExit("Missing OPENAI_API_KEY env var")

    body = {
        "model": MODEL,
        "input": prompt,
        "max_output_tokens": 900,
    }

    data = json.dumps(body).encode("utf-8")

    for attempt in range(retries):
        req = urllib.request.Request(
            "https://api.openai.com/v1/responses",
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": "Bearer " + API_KEY,
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                payload = json.loads(resp.read().decode("utf-8"))

            text = payload.get("output_text")
            if text:
                return text.strip()

            parts = []
            for item in payload.get("output", []):
                for content in item.get("content", []):
                    if content.get("type") == "output_text":
                        parts.append(content.get("text", ""))

            joined = "\n".join(parts).strip()
            if joined:
                return joined

            return json.dumps(payload, indent=2)[:4000]

        except Exception as exc:
            wait = 2 ** attempt
            print("OpenAI error:", exc, "retrying in", wait, "sec")
            time.sleep(wait)

    raise RuntimeError("OpenAI request failed after retries")


def summarize_one(row):
    md_path = SUMMARY_DIR / (row["id"] + ".md")

    if md_path.exists():
        existing = md_path.read_text(encoding="utf-8", errors="ignore")
        marker = "\n## Source Chunk\n\n"
        summary = existing.split(marker)[0].replace("# " + row["id"], "").strip()
        return {
            "id": row["id"],
            "chunk_index": row["chunk_index"],
            "summary": summary,
            "source_text": row["text"],
            "metadata": row.get("metadata", {}),
            "cached": True,
        }

    prompt = make_prompt(row)
    summary = openai_responses(prompt)

    md = "# " + row["id"] + "\n\n"
    md += summary + "\n\n"
    md += "## Source Chunk\n\n"
    md += "```text\n" + row["text"] + "\n```\n"

    write_text(md_path, md)

    return {
        "id": row["id"],
        "chunk_index": row["chunk_index"],
        "summary": summary,
        "source_text": row["text"],
        "metadata": row.get("metadata", {}),
        "cached": False,
    }


def main():
    rows = read_jsonl(INPUT)
    SUMMARY_DIR.mkdir(parents=True, exist_ok=True)

    print("MODEL:", MODEL)
    print("CHUNKS:", len(rows))
    print("WORKERS:", MAX_WORKERS)

    summary_rows = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        future_map = {}

        for row in rows:
            future = executor.submit(summarize_one, row)
            future_map[future] = row

        done_count = 0

        for future in concurrent.futures.as_completed(future_map):
            row = future_map[future]
            done_count += 1

            try:
                result = future.result()
                summary_rows.append(result)
                status = "cached" if result.get("cached") else "wrote"
                print("DONE", done_count, "/", len(rows), row["id"], status)
            except Exception as exc:
                print("FAILED", row["id"], exc)
                summary_rows.append(
                    {
                        "id": row["id"],
                        "chunk_index": row.get("chunk_index"),
                        "summary": "FAILED: " + str(exc),
                        "source_text": row.get("text", ""),
                        "metadata": row.get("metadata", {}),
                        "cached": False,
                    }
                )

    summary_rows = sorted(summary_rows, key=lambda x: x["chunk_index"])

    combined_parts = []
    for row in summary_rows:
        combined_parts.append("## " + row["id"] + "\n\n" + row["summary"])

    write_jsonl(OUT / "02_chunk_summaries.jsonl", summary_rows)
    write_text(
        OUT / "02_CHUNK_SUMMARIES.md",
        "# CMS Schema Chunk Summaries\n\n" + "\n\n".join(combined_parts) + "\n",
    )

    print("DONE")
    print("summaries:", len(summary_rows))
    print("next: python3 scripts/cms_03_synthesize_embed.py")


if __name__ == "__main__":
    main()