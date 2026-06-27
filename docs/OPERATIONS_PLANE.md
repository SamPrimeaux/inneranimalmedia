# Operations plane — Agent Sam + CMS

Agent Sam (or any orchestrator) interacts with CMS through **named tools** mapped to **resource planes**. This doc is the resale operations contract — what your AI team must be able to do end-to-end without monolith internals.

## Planes

| Plane | CMS use | Tool examples |
|-------|---------|---------------|
| **D1** | Page/section metadata | `agentsam_cms_read`, `agentsam_cms_write` |
| **R2** | HTML shells, section fragments | write via CMS API; read via pipeline |
| **KV** | Draft hot cache, bootstrap | host `SESSION_CACHE` |
| **DO** | Live collab edit sessions | host `IAM_COLLAB` |
| **Worker** | HTML intelligence + AI prototype | `cms_pipeline_*` → `iam-cms-pipeline` |
| **GITHUB** | Section source, theme import | `repo_search`, PR workflows |
| **LOCAL** | Operator PTY, Monaco buffer | terminal / fs tools on host |

## Pipeline tools (Python worker)

| Tool | Endpoint | Risk |
|------|----------|------|
| `cms_pipeline_prototype` | `POST /agent/prototype` | medium — proposal only |
| `cms_pipeline_extract` | `POST /pipeline/extract-sections` | low |
| `cms_pipeline_inject` | `POST /pipeline/inject` | medium — preview |
| `cms_pipeline_bootstrap` | `GET /pipeline/bootstrap` | low |

Host registers tools in D1 (`integration/agent-tools.reference.sql`) and routes via service binding `CMS_PIPELINE`.

## Core CMS tools (host Worker)

| Tool | Action |
|------|--------|
| `agentsam_cms_read` | List/read pages + sections |
| `agentsam_cms_write` | Draft section/page mutations |
| `agentsam_cms_publish` | Promotion gates → live |

## End-to-end agent flow

```
1. cms_pipeline_bootstrap(project_slug)  → D1 tree
2. cms_pipeline_prototype(goal, page_id)  → AI section proposal
3. cms_pipeline_inject(shell, section)   → preview HTML (optional)
4. agentsam_cms_write(...)               → persist draft to D1/R2
5. agentsam_cms_publish(...)             → gates → live route
```

## Host adapter files (monolith)

Minimal surface — copy pattern, not whole API:

- `CMS_PIPELINE` service binding → `fetchCmsPipeline()`
- `CMS_BUCKET` R2 binding → `getCmsR2Binding(env, 'cms')`
- `cms.js` tool handlers → import from host or duplicate thin proxy

See [HOST_INTEGRATION.md](./HOST_INTEGRATION.md).

## Reseller checklist

- [ ] Deploy `iam-cms-pipeline` + DNS `cms-pipeline.{domain}`
- [ ] R2 bucket `cms` + custom domain `cms.{domain}`
- [ ] Upload `studio/public/*` to host R2 CMS static prefix
- [ ] Register agent tools (reference SQL)
- [ ] Service binding on host Worker
- [ ] Run gate suite before customer go-live
