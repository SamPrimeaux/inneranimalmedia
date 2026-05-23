# Analytics portable contract (cross-repo)

| Repo | Branch | Role |
|------|--------|------|
| `agentsam-cms-editor` | `python/cms-worker` | Python Worker + React `analytics-app/` |
| `inneranimalmedia` | `feature/analytics-portable-port` | Production dashboard imports portable UI |

## API contract

| Sandbox (cms-editor) | Production (IAM) |
|----------------------|------------------|
| `GET /api/analytics/overview` | `GET /api/analytics/overview?range=7d` → `PulseResponse` |
| `GET /api/analytics/health` | `source-health` + deploy panels |
| `GET /api/analytics/finance` | `GET /api/analytics/costs` (tab) |

Portable components accept **`PulseResponse`** via adapters in `dashboard/components/analytics/portable/adapters/`.

## Component map

| Source (`agentsam-cms-editor`) | Destination (`inneranimalmedia`) |
|--------------------------------|----------------------------------|
| `analytics-app/src/components/kpi/*` | `dashboard/components/analytics/portable/kpi/` |
| `analytics-app/src/components/charts/*` | `dashboard/components/analytics/portable/charts/` |
| `analytics-app/src/components/tables/*` | `dashboard/components/analytics/portable/tables/` |
| `analytics-app/src/lib/format.ts` | `dashboard/components/analytics/portable/format.ts` |

Do not copy `DashboardShell` — IAM uses `AnalyticsShell`.

## Integration

- `OverviewTab.tsx` renders `OverviewPortablePanels` additively (does not replace existing KPI grid).
- Adapter: `pulseToPortable.ts` maps production pulse JSON → portable props.

## Worker runtime

- cms-editor: **Python** `src/entry.py` (`python_workers` flag)
- IAM: JavaScript `src/api/analytics/*.js` (unchanged on this branch)
