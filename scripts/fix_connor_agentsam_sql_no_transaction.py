#!/usr/bin/env python3
from pathlib import Path
import subprocess

ROOT = Path.cwd()
SQL_PATH = ROOT / "sql/agentsam/register_connor_workspace_scripts.sql"

def run(cmd, check=False):
    print("$ " + " ".join(cmd))
    result = subprocess.run(cmd, cwd=ROOT, text=True, capture_output=True)
    if result.stdout:
        print(result.stdout)
    if result.stderr:
        print(result.stderr)
    if check and result.returncode != 0:
        raise SystemExit(result.returncode)
    return result

if not SQL_PATH.exists():
    raise SystemExit(f"Missing SQL file: {SQL_PATH}")

sql = SQL_PATH.read_text(encoding="utf-8")

sql = sql.replace("BEGIN TRANSACTION;\n", "")
sql = sql.replace("\nBEGIN TRANSACTION;", "")
sql = sql.replace("\nCOMMIT;", "")
sql = sql.replace("COMMIT;\n", "")

SQL_PATH.write_text(sql, encoding="utf-8")

print(f"Removed explicit BEGIN/COMMIT from {SQL_PATH}")

# Quick sanity check
bad_terms = ["BEGIN TRANSACTION", "SAVEPOINT", "COMMIT;"]
for term in bad_terms:
    if term in sql:
        raise SystemExit(f"Still found forbidden transaction term: {term}")

run(["git", "add", str(SQL_PATH), "scripts/fix_connor_agentsam_sql_no_transaction.py"], check=False)
run(["git", "commit", "-m", "fix: remove explicit transaction from Connor Agent Sam SQL"], check=False)

print("\nNow apply with:")
print("npx wrangler d1 execute inneranimalmedia-business --remote --file sql/agentsam/register_connor_workspace_scripts.sql")
