#!/usr/bin/env python3

import concurrent.futures
import json
import os
import re
import time
import urllib.request
from pathlib import Path

REPO = Path(".").resolve()
OUT = REPO / "artifacts" / "cms_ollama_gameplan"
SUMMARY_MD = OUT / "02_CHUNK_SUMMARIES.md"
REDUCED_DIR = OUT / "reduced_reports"

MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
API_KEY = os.environ.get("OPENAI_API_KEY", "")
MAX_WORKERS = int(os.environ.get("OPENAI_MAX_WORKERS", "4"))


def read(path):
    if not path.exists():
        raise SystemExit("Missing file: " + str(path))
    return path.read_text(encoding="utf-8")


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    print("WROTE:", path)


def openai(prompt, max_output_tokens=2500, retries=4):
    if not API_KEY:
        raise SystemExit("Missing OPENAI_API_KEY")

    body = {
        "model": MODEL,
        "input": prompt,
        "max_output_tokens": max_output_tokens,
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
            with urllib.request.urlopen(req, timeout=180) as resp:
                payload = json.loads(resp.read().decode("utf-8"))

            if payload.get("output_text"):
                return payload["output_text"].strip()

            parts = []
            for item in payload.get("output", []):
                for content in item.get("content", []):
                    if content.get("type") == "output_text":
                        parts.append(content.get("text", ""))

            return "\n".join(parts).strip()

        except Exception as exc:
            wait = 2 ** attempt
            print("OpenAI retry:", exc, "wait", wait)
            time.sleep(wait)

    raise RuntimeError("OpenAI failed")


def split_summaries(text):
    parts = re.split(r"\n## cms_schema_chunk_", text)
    chunks = []

    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue

        if i == 0 and part.startswith("# CMS Schema Chunk Summaries"):
            continue

        if not part.startswith("cms_schema_chunk_"):
            part = "cms_schema_chunk_" + part

        chunks.append(part)

    return chunks


def pack_chunks(chunks, max_chars=18000):
    packs = []
    current = []

    size = 0
    for chunk in chunks:
        if size + len(chunk) > max_chars and current:
            packs.append("\n\n".join(current))
            current = []
            size = 0

        current.append(chunk)
        size += len(chunk)

    if current:
        packs.append("\n\n".join(current))

    return packs


def reduce_pack(index, text):
    prompt = (
        "You are reducing chunk-level cms_* schema reports into useful architecture evidence.\n\n"
        "Input pack number: " + str(index) + "\n\n"
        "Reports:\n"
        "```markdown\n"
        + text
        + "\n```\n\n"
        "Return compact markdown with these exact sections:\n"
        "## Tables Mentioned\n"
        "List each table and its role.\n\n"
        "## Relationships\n"
        "Explain table relationships and lifecycle order.\n\n"
        "## CMS Capabilities\n"
        "Extract capabilities this schema enables.\n\n"
        "## Risks / Gaps\n"
        "Indexes, missing constraints, vague fields, overlap, dead tables.\n\n"
        "## Migration Uses\n"
        "How this pack informs converting public pages into CMS pages.\n\n"
        "No fluff. Deduplicate aggressively."
    )

    return openai(prompt, max_output_tokens=3000)


def final_doc(title, reduced_text, instruction):
    prompt = (
        "You are creating one final CMS architecture artifact for Inner Animal Media.\n\n"
        "Artifact title: " + title + "\n\n"
        "Reduced evidence:\n"
        "```markdown\n"
        + reduced_text[:90000]
        + "\n```\n\n"
        + instruction
        + "\n\n"
        "Use markdown. Be specific. Avoid generic CMS advice."
    )

    return openai(prompt, max_output_tokens=6000)


def main():
    REDUCED_DIR.mkdir(parents=True, exist_ok=True)

    summaries = read(SUMMARY_MD)
    chunks = split_summaries(summaries)
    packs = pack_chunks(chunks)

    print("chunks:", len(chunks))
    print("packs:", len(packs))

    reduced_rows = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        future_map = {}
        for i, pack in enumerate(packs, 1):
            path = REDUCED_DIR / ("pack_" + str(i).zfill(2) + ".md")

            if path.exists():
                reduced = read(path)
                reduced_rows.append({"pack": i, "text": reduced, "cached": True})
                print("CACHED pack", i)
                continue

            fut = pool.submit(reduce_pack, i, pack)
            future_map[fut] = (i, path)

        for fut in concurrent.futures.as_completed(future_map):
            i, path = future_map[fut]
            reduced = fut.result()
            write(path, "# Reduced Pack " + str(i) + "\n\n" + reduced + "\n")
            reduced_rows.append({"pack": i, "text": reduced, "cached": False})
            print("DONE pack", i)

    reduced_rows = sorted(reduced_rows, key=lambda x: x["pack"])
    reduced_text = "\n\n".join("## Pack " + str(r["pack"]) + "\n\n" + r["text"] for r in reduced_rows)

    write(OUT / "06_REDUCED_EVIDENCE.md", "# Reduced CMS Evidence\n\n" + reduced_text + "\n")

    docs = [
        (
            "07_TABLE_MAP.md",
            "CMS Table Map",
            (
                "Create a table-by-table map. For every cms_* table found, explain: purpose, likely primary keys, "
                "important columns, relationships, what should query it, what should write to it, and whether it seems core/supporting/optional."
            ),
        ),
        (
            "08_CMS_ARCHITECTURE_GAMEPLAN.md",
            "CMS Architecture Gameplan",
            (
                "Create the real architecture explanation: how route resolution, page sections, Liquid/component templates, assets, "
                "collections, themes, drafts, overrides, live editing, rollbacks, tenants, conversions, video, and 3D assets should work together."
            ),
        ),
        (
            "09_MIGRATION_SPRINT.md",
            "CMS Migration Sprint",
            (
                "Create a first migration sprint. Include phases, exact deliverables, validation checks, D1/R2/source responsibilities, "
                "safe rollout strategy, and what NOT to do. Prioritize minimal breakage."
            ),
        ),
        (
            "10_OPENAI_REMASTER_PACKET.md",
            "OpenAI Remaster Packet",
            (
                "Create a compact packet to give a stronger OpenAI model next. Include schema summary, decisions needed, open questions, "
                "target outputs wanted, and the exact prompt to run next."
            ),
        ),
    ]

    for filename, title, instruction in docs:
        print("WRITING", filename)
        result = final_doc(title, reduced_text, instruction)
        write(OUT / filename, "# " + title + "\n\n" + result + "\n")

    index = "# CMS Final Reduced Reports\n\n"
    index += "- `06_REDUCED_EVIDENCE.md`\n"
    index += "- `07_TABLE_MAP.md`\n"
    index += "- `08_CMS_ARCHITECTURE_GAMEPLAN.md`\n"
    index += "- `09_MIGRATION_SPRINT.md`\n"
    index += "- `10_OPENAI_REMASTER_PACKET.md`\n"

    write(OUT / "FINAL_INDEX.md", index)

    print("DONE")
    print("open:", OUT)


if __name__ == "__main__":
    main()