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
