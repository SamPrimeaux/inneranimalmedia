# Dashboard Identity Audit
Generated: 2026-05-14 14:16:25

> Scope: dashboard source files + live page responses only.

## Git State
- Tree clean: NO
```
M analytics/codebase-index/ws_inneranimalmedia/index-priority-files.json
?? scripts/audit_dashboard_identity.py
?? scripts/audit_hardcoded_identity.py
?? scripts/audit_hardcoded_identity_report.md
```

```
b7c90f1 feat(dashboard): analytics overview performance bar charts
9ea3ab4 fix(api): resolve analytics tenant and workspace from auth session
ec17b0a chore(scripts): add agent dashboard remaster audit tooling
7d7e335 fix(core): resolve plan tenant and workspace without hardcoded fallback
143acdb feat(dashboard): workflows page, rail icon, and multi-chat tabs
```

## Source Scan
- Dashboard files targeted: 125

### Source Flags

#### hardcoded workspace_id (5 hits)
| File | Line | Content |
|------|------|---------|
| `src/core/agentsam-workflow-debug-store.js` | 65 | `payload.workspace_id \|\| 'ws_inneranimalmedia',` |
| `src/core/agentsam-workflow-debug-store.js` | 156 | `payload.workspace_id \|\| 'ws_inneranimalmedia',` |
| `src/core/agentsam-workflow-debug-store.js` | 199 | `ev.workspace_id \|\| 'ws_inneranimalmedia',` |
| `src/core/agentsam-workflow-debug-store.js` | 225 | `payload.workspace_id \|\| 'ws_inneranimalmedia',` |
| `src/core/tool-stats-rollup.js` | 9 | `* - never use ws_inneranimalmedia as fallback` |

#### supabase project id (2 hits)
| File | Line | Content |
|------|------|---------|
| `src/core/agentsam-supabase-sync.js` | 239 | `const SUPABASE_RPC_FALLBACK_ORIGIN = 'https://dpmuvynqixblxsilnlut.supabase.co';` |
| `src/core/memory.js` | 26 | `const SUPABASE_REST_FALLBACK = 'https://dpmuvynqixblxsilnlut.supabase.co';` |

### Source Clean

- hardcoded tenant string
- tenant_id fallback
- tenant_id assignment
- workspace_id assignment
- hardcoded user_id
- hardcoded auth_id
- hardcoded user literal
- email in dashboard source
- default= tenant
- default= user
- env fallback to literal


## Live Page Scan

| Route | Status | Flags |
|-------|--------|-------|
| `/dashboard/overview` | 200 | clean |
| `/dashboard/library` | 200 | clean |
| `/dashboard/agent` | 200 | clean |
| `/dashboard/learn` | 200 | clean |
| `/dashboard/settings/agents` | 200 | clean |
| `/dashboard/settings/workspace` | 200 | clean |
| `/dashboard/settings/github` | 200 | clean |
| `/dashboard/settings/integrations` | 200 | clean |
| `/dashboard/settings/security` | 200 | clean |
| `/dashboard/mail` | 200 | clean |
| `/dashboard/mcp` | 200 | clean |
| `/dashboard/workflows` | 200 | clean |

## Checklist

- [FAIL] Git working tree is clean
- [FAIL] No hardcoded workspace_id in dashboard source
- [PASS] No tenant_id fallback literal in dashboard source
- [PASS] No hardcoded user_id in dashboard source
- [PASS] No hardcoded auth_id in dashboard source
- [FAIL] No Supabase project ID literal in dashboard source
- [PASS] No identity leaks in live dashboard responses