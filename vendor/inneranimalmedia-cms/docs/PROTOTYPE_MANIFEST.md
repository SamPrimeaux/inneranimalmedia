# IAM Prototype Manifest (IPM) — CMS product contract

Version: **v1** (declarative only — no D1 table required in host until you opt in)

The CMS product is defined by a **Prototype Manifest**: one file per deployment that declares surfaces, resource planes, agent tools, artifacts, and promotion gates. Host platforms compile this into bindings; the manifest is the resale contract.

## Envelope

```yaml
apiVersion: inneranimalmedia.com/v1
kind: Prototype
metadata:
  id: proto_cms_studio_v1
  product: inneranimalmedia-cms
  project_slug: acme-corp
  workspace_id: ws_acme
  tenant_id: tn_acme

surfaces:
  studio:
    route: studio.example.com
    fallback_path: /studio/editor
  preview:
    query: "?preview=draft&cms=1&page_id={page_id}"
  live:
    route: www.example.com
  api:
    prefix: /api/cms

planes:
  d1:
    binding: DB
    tables: [cms_pages, cms_page_sections, cms_page_overrides]
  r2:
    bucket: cms
    binding: CMS_BUCKET
    public_origin: https://cms.example.com
    key_prefix: cms/
  kv:
    binding: SESSION_CACHE
    prefixes: ["cms:bootstrap:", "cms:draft:"]
  do:
    binding: IAM_COLLAB
    use: live_edit
  worker:
    service: iam-cms-pipeline
    binding: CMS_PIPELINE
    origin: https://cms-pipeline.example.com
  github:
    repo: org/site-repo
    paths: [sections/, studio/]
  local:
    tools: [terminal_execute, fs_read]

agent:
  route_key: cms_edit
  tools:
    - agentsam_cms_read
    - agentsam_cms_write
    - agentsam_cms_publish
    - cms_pipeline_prototype
    - cms_pipeline_extract
    - cms_pipeline_inject
    - cms_pipeline_bootstrap

gates:
  - id: d1_page_exists
  - id: r2_draft_present
  - id: preview_renders
  - id: studio_embed_loads
  - id: agent_extract_smoke
```

See [`manifests/cms-studio.v1.example.yaml`](../manifests/cms-studio.v1.example.yaml).

## Compile outputs (host responsibility)

A host platform (Inner Animal Media or a reseller stack) compiles IPM into:

1. Wrangler fragments — R2, service bindings, routes, vars
2. Agent tool rows — `agentsam_tools` seeds (reference SQL in `integration/`)
3. Gate module — pluggable checks before publish
4. Bootstrap slice — workspace storage capabilities for Agent Sam

This repo ships the **manifest + studio assets + pipeline worker**. The host ships **auth + dispatch + optional D1 migrations**.

## Why manifests beat monolith copy-paste

- New customer site = new manifest + R2 prefix, not new Worker fork
- Agent Sam tools and planes are explicit — 100% operations-plane capability
- Promotion gates define “valid” before live — no silent blank-canvas regressions
- Product repo stays bounded; host only adds thin adapters

## CMS reference implementation

| IPM section | This repo path |
|-------------|----------------|
| `planes.worker` | `services/cms-pipeline-service/` |
| `surfaces.studio` | `studio/public/cms-studio-shell.html`, `cms-editor-core.js` |
| `artifacts.sections` | `sections/` |
| `agent.tools` | `integration/agent-tools.reference.sql` |
| `planes.r2` | Host `CMS_BUCKET` → bucket `cms` |
