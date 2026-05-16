#!/usr/bin/env python3

import json
import os
import time
import urllib.request
from pathlib import Path

REPO = Path(".").resolve()
OUT = REPO / "artifacts" / "cms_ollama_gameplan"

MODEL = os.environ.get("OPENAI_MODEL", "gpt-5.4-mini")
API_KEY = os.environ.get("OPENAI_API_KEY", "")

FILES = [
    "07_TABLE_MAP.md",
    "08_CMS_ARCHITECTURE_GAMEPLAN.md",
    "09_MIGRATION_SPRINT.md",
    "10_OPENAI_REMASTER_PACKET.md",
]


def read(path):
    p = OUT / path
    if not p.exists():
        raise SystemExit("Missing file: " + str(p))
    return p.read_text(encoding="utf-8")


def write(path, text):
    p = OUT / path
    p.write_text(text, encoding="utf-8")
    print("WROTE:", p)


def openai(prompt, max_output_tokens=9000, retries=4):
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
            with urllib.request.urlopen(req, timeout=240) as resp:
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
            print("retry:", exc, "wait", wait)
            time.sleep(wait)

    raise RuntimeError("OpenAI failed")


def main():
    packet_parts = []

    for name in FILES:
        packet_parts.append("# FILE: " + name)
        packet_parts.append(read(name))

    packet = "\n\n".join(packet_parts)

    prompt = (
        "You are the final architecture planner for Inner Animal Media's cms_* D1 CMS.\n\n"
        "Input docs:\n"
        "```markdown\n"
        + packet[:120000]
        + "\n```\n\n"
        "Create one final implementation-ready master plan with these sections:\n\n"
        "1. Final CMS Mental Model\n"
        "2. Canonical Runtime Page Lifecycle\n"
        "3. Required D1 Query Contract\n"
        "4. D1 vs R2 vs Source Code Responsibilities\n"
        "5. Public Page Rebuild Order\n"
        "6. Seed Plan for cms_pages and cms_page_sections\n"
        "7. Liquid Section / Component Template Strategy\n"
        "8. Asset and Collection Strategy\n"
        "9. Theme Token Strategy\n"
        "10. Draft / Override / Live Edit / Rollback Workflow\n"
        "11. Minimal API Endpoints Needed\n"
        "12. Validation and Smoke Tests\n"
        "13. First 10 Concrete Tasks for Cursor/Claude\n"
        "14. Risks and Anti-Patterns\n\n"
        "Be direct, technical, and implementation-focused. Do not give generic CMS advice."
    )

    print("MODEL:", MODEL)
    result = openai(prompt)

    write("11_FINAL_CMS_MASTER_PLAN.md", "# Final CMS Master Plan\n\n" + result + "\n")

    print("DONE")
    print("MAIN:", OUT / "11_FINAL_CMS_MASTER_PLAN.md")


if __name__ == "__main__":
    main()