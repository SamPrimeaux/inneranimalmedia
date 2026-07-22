# Architecture Cartographer

**Discipline:** platform asset inventory & drift audit  
**Audience:** Sam (solo founder) + Agent Sam operator tooling  
**Family:** evergreen `agentsam` / Primeaux protocols — not one-off `scripts/audit_*.py` clutter

Read-only. Stdlib Python + bash. Does **not** prove production traffic — it maps what exists, clusters patterns, and diffs day-over-day.

## Layout

```
tools/architecture-cartographer/
├── architecture_cartographer.py   # repo + D1 + Supabase + optional AI
├── inventory_snapshot.sh          # pass-zero: path / size / last touch
├── prompts/                       # human-editable review briefs
├── architecture-map/              # generated (gitignored)
│   ├── latest/
│   ├── snapshots/
│   └── evidence/
└── README.md
```

## Pass zero — inventory

```bash
chmod +x tools/architecture-cartographer/inventory_snapshot.sh
./tools/architecture-cartographer/inventory_snapshot.sh . > /tmp/inventory.json

jq -r 'sort_by(-.size_bytes)[:20] | .[] | "\(.size_bytes)\t\(.path)"' /tmp/inventory.json
jq -r 'sort_by(.last_touched_epoch)[:30] | .[] | "\(.last_touched)\t\(.path)"' /tmp/inventory.json
```

## Repo-only cartography

```bash
python3 tools/architecture-cartographer/architecture_cartographer.py .
```

Outputs under `tools/architecture-cartographer/architecture-map/latest/`.

## Repo + D1

Uses `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` (also accepts `CF_*`). Soft-loads `.env.cloudflare` when present.

```bash
./scripts/with-cloudflare-env.sh python3 \
  tools/architecture-cartographer/architecture_cartographer.py . \
  --database-id cf87b717-d4e2-4cf8-bab0-a81268e32d49 \
  --label platform
```

Deeper FK orphan check:

```bash
./scripts/with-cloudflare-env.sh python3 \
  tools/architecture-cartographer/architecture_cartographer.py . \
  --database-id cf87b717-d4e2-4cf8-bab0-a81268e32d49 \
  --label platform \
  --check-orphans
```

## Repo + D1 + Supabase

Needs a Supabase **Management API personal access token** (`SUPABASE_ACCESS_TOKEN`). Service-role keys cannot query `information_schema` through this path.

```bash
export SUPABASE_ACCESS_TOKEN="sbp_..."

./scripts/with-cloudflare-env.sh python3 \
  tools/architecture-cartographer/architecture_cartographer.py . \
  --database-id cf87b717-d4e2-4cf8-bab0-a81268e32d49 \
  --supabase-project-ref dpmuvynqixblxsilnlut \
  --supabase-schemas public,agentsam \
  --label platform
```

## Solo-builder AI revision plan

Sanitized evidence only — no source files, no D1/PG row samples, secrets redacted.

```bash
export OPENAI_MODEL=gpt-5.6-sol   # Sol for major reviews; terra for monthly drift

./scripts/with-cloudflare-env.sh python3 \
  tools/architecture-cartographer/architecture_cartographer.py . \
  --database-id cf87b717-d4e2-4cf8-bab0-a81268e32d49 \
  --supabase-project-ref dpmuvynqixblxsilnlut \
  --supabase-schemas public,agentsam \
  --label platform \
  --ai --reasoning-effort high
```

Writes `architecture-map/latest/solo-builder-revision-plan.md`.

## Drift

```bash
python3 tools/architecture-cartographer/architecture_cartographer.py . \
  --database-id cf87b717-d4e2-4cf8-bab0-a81268e32d49 \
  --label platform \
  --diff-against tools/architecture-cartographer/architecture-map/snapshots/platform_PREV.json
```

## Model policy (suggested)

| Cadence | Model | Effort |
|--------|--------|--------|
| Weekly | local scanner only | — |
| Monthly drift | `gpt-5.6-terra` | high |
| Pre-launch / major refactor | `gpt-5.6-sol` | high / max |

## Naming lineage

If/when thin protocol wrappers are added:

- `agentsam_protocol_d1_audit.py` → calls this with `--skip-repo --database-id …`
- `agentsam_protocol_pg_audit.py` → Supabase-only
- `agentsam_protocol_repo_audit.py` → repo-only + clutter/orphan heuristics

Prefer evolving **this** package over adding more ad-hoc `scripts/audit_*.py` forks.

## Safety

- Read-only against repo / D1 / Supabase catalog
- Skips `.env*`, secrets, binaries, `node_modules`, build output
- AI packet strips samples and sensitive field names
- Generated reports are gitignored

## Where to keep generated architecture-map (proposal — not locked)

| Layer | What | Where | Why |
|-------|------|--------|-----|
| **A. Tooling (git)** | Scripts, README, prompts | `tools/architecture-cartographer/` | Versioned, shareable |
| **B. Working cache (local, gitignored)** | Full JSON + latest md | `tools/architecture-cartographer/architecture-map/` | Fast day-to-day; regenerable |
| **C. Durable snapshots (proposed)** | Timestamped JSON + executive-summary.md | R2 e.g. `ops/architecture-map/{label}/{stamp}/` | Survives laptop wipe; Agent Sam / MCP can fetch |
| **D. Human digest (optional, curated)** | 1–2 short md after a good run | `docs/ops/architecture-inventory/` | Only after you validate quality — not auto-commit every scan |

Recommendation while validating: keep **A + B**, re-run freely. Once a run looks useful, promote that stamp to **C** (R2). Promote a trimmed digest to **D** only when you’re happy with the signal — don’t fill git with 50MB dumps.

Pass-zero inventory (`/tmp/inventory.json`) can live next to B or upload beside C.

## Supabase PAT — get / set

**Dashboard owner email (confirmed):** `sam_primeaux@icloud.com`  
Full ownership table: [`docs/supabase/agentsam-supabase-identifiers-2026-06-03.md`](../../docs/supabase/agentsam-supabase-identifiers-2026-06-03.md)

`SUPABASE_SERVICE_ROLE_KEY` cannot run the catalog SQL this tool needs via PostgREST.
Preferred: a **Management API** personal access token:

1. Sign in as `sam_primeaux@icloud.com`
2. Open [Account → Access Tokens](https://supabase.com/dashboard/account/tokens)
3. Create token (name e.g. `architecture-cartographer-readonly`)
4. Copy once (`sbp_…`)
5. Add to gitignored `.env.cloudflare`:

```bash
SUPABASE_ACCESS_TOKEN=sbp_your_token_here
```

6. Re-run via `./scripts/with-cloudflare-env.sh …` (loads that file)

### Dashboard lockout bypass (no PAT)

If you cannot log into the Supabase dashboard, the cartographer falls back to
**`SUPABASE_DB_URL`** (Postgres pooler URI already in `.env.cloudflare`) via `psycopg2`.
Same catalog queries — no Management API needed.

```bash
./scripts/with-cloudflare-env.sh python3 \
  tools/architecture-cartographer/architecture_cartographer.py . \
  --skip-repo \
  --supabase-project-ref dpmuvynqixblxsilnlut \
  --supabase-schemas public,agentsam \
  --label platform
```

You should see: `via db_url`.

Smoke check (no secrets printed):

```bash
./scripts/with-cloudflare-env.sh python3 -c \
  "import os; t=os.environ.get('SUPABASE_ACCESS_TOKEN',''); d=os.environ.get('SUPABASE_DB_URL',''); print('pat_set', bool(t), 'db_url_set', bool(d))"
```

## D1 “0 tables” / Errno 8

If you see:

`urlopen error [Errno 8] nodename nor servname provided, or not known`

that is **DNS/network**, not “empty database” and not a missing token (missing token exits earlier). Credentials were loaded; `api.cloudflare.com` failed to resolve for a moment. Re-run the same command. Newer builds exit with a clear error instead of claiming `Found 0 tables`.
