#!/usr/bin/env python3

import json
import re
import time
from pathlib import Path

REPO = Path(".").resolve()
SRC = REPO / "artifacts" / "cms_d1_pull" / "cms_d1_pull_all.json"
OUT = REPO / "artifacts" / "cms_ollama_gameplan"
CHUNK_SIZE = 1024
OVERLAP = 128


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


def load_json(path):
    if not path.exists():
        raise SystemExit("Missing input file: " + str(path))
    return json.loads(path.read_text(encoding="utf-8"))


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


def compact_table(table):
    columns = []
    for col in table.get("columns", []):
        columns.append(
            {
                "name": col.get("name"),
                "type": col.get("type"),
                "notnull": col.get("notnull"),
                "default": col.get("dflt_value"),
                "pk": col.get("pk"),
            }
        )

    return {
        "name": table.get("name"),
        "row_count": table.get("row_count"),
        "create_sql": table.get("create_sql") or table.get("sql"),
        "columns": columns,
        "indexes": table.get("indexes", []),
        "foreign_keys": table.get("foreign_keys", []),
        "sample_rows": table.get("sample_rows", [])[:2],
    }


def make_digest(data):
    lines = []
    lines.append("# CMS D1 Schema Digest")
    lines.append("")
    lines.append("Generated: " + time.strftime("%Y-%m-%d %H:%M:%S"))
    lines.append("DB: " + str(data.get("db")))
    lines.append("Mode: " + str(data.get("mode")))
    lines.append("")

    tables = data.get("tables", [])
    for table in tables:
        t = compact_table(table)

        lines.append("## " + str(t["name"]))
        lines.append("")
        lines.append("Rows: `" + str(t["row_count"]) + "`")
        lines.append("")

        lines.append("### Columns")
        lines.append("")
        for col in t["columns"]:
            line = "- `" + str(col.get("name")) + "`"
            line += " type=`" + str(col.get("type")) + "`"
            line += " notnull=`" + str(col.get("notnull")) + "`"
            line += " default=`" + str(col.get("default")) + "`"
            line += " pk=`" + str(col.get("pk")) + "`"
            lines.append(line)

        lines.append("")
        lines.append("### Create SQL")
        lines.append("")
        lines.append("```sql")
        lines.append(str(t["create_sql"] or ""))
        lines.append("```")
        lines.append("")

        lines.append("### Indexes")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(t["indexes"], indent=2, ensure_ascii=False))
        lines.append("```")
        lines.append("")

        lines.append("### Foreign Keys")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(t["foreign_keys"], indent=2, ensure_ascii=False))
        lines.append("```")
        lines.append("")

        lines.append("### Sample Rows")
        lines.append("")
        lines.append("```json")
        lines.append(json.dumps(t["sample_rows"], indent=2, ensure_ascii=False))
        lines.append("```")
        lines.append("")

    return "\n".join(lines)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    data = load_json(SRC)
    digest = make_digest(data)

    write_text(OUT / "00_CMS_D1_DIGEST.md", digest)

    chunks = []
    pieces = chunk_text(digest, CHUNK_SIZE, OVERLAP)

    for i, piece in enumerate(pieces):
        chunks.append(
            {
                "id": "cms_schema_chunk_" + str(i).zfill(4),
                "chunk_index": i,
                "text": piece,
                "metadata": {
                    "source": str(SRC),
                    "kind": "cms_schema_chunk",
                    "chunk_size": CHUNK_SIZE,
                    "overlap": OVERLAP,
                },
            }
        )

    write_jsonl(OUT / "01_schema_chunks_1024.jsonl", chunks)

    index = []
    index.append("# CMS Chunked Schema")
    index.append("")
    index.append("Source: `" + str(SRC) + "`")
    index.append("Chunks: `" + str(len(chunks)) + "`")
    index.append("")
    index.append("Next:")
    index.append("")
    index.append("```bash")
    index.append("python3 scripts/cms_02_qwen_summarize_chunks.py")
    index.append("```")

    write_text(OUT / "INDEX.md", "\n".join(index) + "\n")

    print("DONE")
    print("chunks:", len(chunks))


if __name__ == "__main__":
    main()