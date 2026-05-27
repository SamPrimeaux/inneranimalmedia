#!/usr/bin/env python3
import csv
import json
import os
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

ENV_FILE = Path("/Users/samprimeaux/inneranimalmedia/.env.cloudflare")
OUT_CSV = "db_table_counts.csv"
OUT_MD = "db_table_counts.md"


def load_dotenv(path):
    if not path.exists():
        print(f"Missing env file: {path}", file=sys.stderr)
        sys.exit(1)

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if line.startswith("export "):
            line = line[len("export "):].strip()

        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def require_env():
    load_dotenv(ENV_FILE)

    api_token = os.environ.get("CLOUDFLARE_API_TOKEN") or os.environ.get("CF_API_TOKEN")
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID")
    database_id = (
        os.environ.get("D1_DATABASE_ID")
        or os.environ.get("CLOUDFLARE_D1_DATABASE_ID")
        or os.environ.get("DATABASE_ID")
    )

    missing = []
    if not api_token:
        missing.append("CLOUDFLARE_API_TOKEN")
    if not account_id:
        missing.append("CLOUDFLARE_ACCOUNT_ID")
    if not database_id:
        missing.append("D1_DATABASE_ID")

    if missing:
        print(f"Missing env vars in {ENV_FILE}: {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)

    return api_token, account_id, database_id


API_TOKEN, ACCOUNT_ID, DATABASE_ID = require_env()

API_URL = (
    f"https://api.cloudflare.com/client/v4/accounts/"
    f"{ACCOUNT_ID}/d1/database/{DATABASE_ID}/query"
)


def d1_query(sql, params=None):
    payload = json.dumps({
        "sql": sql,
        "params": params or [],
    }).encode("utf-8")

    req = urllib.request.Request(
        API_URL,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {API_TOKEN}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            body_text = res.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_text = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {e.code}: {err_text[:1000]}")
    except Exception as e:
        raise RuntimeError(str(e))

    body = json.loads(body_text)

    if not body.get("success"):
        raise RuntimeError(json.dumps(body, indent=2)[:1500])

    result = body.get("result") or []
    if not result:
        return []

    return result[0].get("results") or []


def quote_ident(name):
    return '"' + name.replace('"', '""') + '"'


def get_tables_and_views():
    return d1_query("""
        SELECT name, type
        FROM sqlite_master
        WHERE type IN ('table', 'view')
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name;
    """)


def count_rows(name):
    try:
        rows = d1_query(f"SELECT COUNT(*) AS count FROM {quote_ident(name)};")
        return int(rows[0]["count"]), ""
    except Exception as exc:
        return "", str(exc).splitlines()[0][:300]


def main():
    print(f"Loaded env: {ENV_FILE}")
    print(f"Account: {ACCOUNT_ID}")
    print(f"D1 DB:   {DATABASE_ID}")
    print()

    print("Reading sqlite_master...")
    objects = get_tables_and_views()
    print(f"Found {len(objects)} tables/views.")
    print()

    results = []

    for i, obj in enumerate(objects, start=1):
        name = obj["name"]
        kind = obj["type"]

        count, error = count_rows(name)

        results.append({
            "name": name,
            "type": kind,
            "row_count": count,
            "error": error,
        })

        label = f"{count:,}" if isinstance(count, int) else f"ERR: {error}"
        print(f"[{i:>3}/{len(objects)}] {kind:<5} {name:<60} {label}")

        time.sleep(0.02)

    def sort_key(r):
        if r["row_count"] == "":
            return (1, 0)
        return (0, -int(r["row_count"]))

    results_sorted = sorted(results, key=sort_key)

    with open(OUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "type", "row_count", "error"])
        writer.writeheader()
        writer.writerows(results_sorted)

    with open(OUT_MD, "w", encoding="utf-8") as f:
        f.write("# D1 Table Row Counts\n\n")
        f.write(f"- Env file: `{ENV_FILE}`\n")
        f.write(f"- Account: `{ACCOUNT_ID}`\n")
        f.write(f"- D1 database: `{DATABASE_ID}`\n\n")
        f.write("| Rank | Name | Type | Row Count | Error |\n")
        f.write("|---:|---|---|---:|---|\n")

        for rank, r in enumerate(results_sorted, start=1):
            row_count = r["row_count"]
            if row_count != "":
                row_count = f"{int(row_count):,}"

            f.write(
                f"| {rank} | `{r['name']}` | {r['type']} | "
                f"{row_count} | {r['error']} |\n"
            )

    total_rows = sum(
        int(r["row_count"])
        for r in results
        if r["row_count"] != ""
    )
    errored = sum(1 for r in results if r["error"])

    print()
    print("Done.")
    print(f"Objects scanned: {len(results)}")
    print(f"Total counted rows: {total_rows:,}")
    print(f"Errors: {errored}")
    print(f"Wrote: {OUT_CSV}")
    print(f"Wrote: {OUT_MD}")


if __name__ == "__main__":
    main()
