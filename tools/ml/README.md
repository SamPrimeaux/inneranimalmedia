# Offline ML / data-quality lane (inside main IAM repo)

Python jobs that talk to D1 over the Cloudflare HTTP API. Not a Worker runtime.
Not a separate GitHub repo — lives under `tools/ml/`.

| Phase | Module | Status |
|-------|--------|--------|
| 1 | `profiler.py` | active → `agentsam_data_quality_snapshots` |
| 2 | `anomaly.py` | planned |
| 3 | `routing/` | planned — prior writeback to `agentsam_routing_arms` |

## Install

```bash
cd tools/ml
~/.local/bin/python3.12 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Uses `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` from repo-root `.env.cloudflare`.
Platform D1 resolved by name (`inneranimalmedia-business`); per-app IDs from `client_apps`.

## Run

```bash
./run_daily.sh --apps inneranimalmedia --tables client_apps,clients,agentsam_routing_arms
# or dry-run:
./venv/bin/python profiler.py --dry-run --tables client_apps,clients
```

Migration: `migrations/997_agentsam_data_quality_snapshots.sql`
