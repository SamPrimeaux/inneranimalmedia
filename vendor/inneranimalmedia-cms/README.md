# Inner Animal Media CMS

Standalone, resellable CMS product — studio editor, section templates, Python agentic pipeline, and host integration contracts. Designed to deploy as its own Workers/R2 stack or bind into a platform host (e.g. Inner Animal Media monolith) via thin adapters.

## Product boundaries

| In this repo | Stays in host platform |
|--------------|------------------------|
| Studio UI (`studio/`) | Auth, sessions, tenant routing |
| Section HTML templates (`sections/`) | Customer billing / workspace admin |
| Python pipeline worker (`services/cms-pipeline-service/`) | Generic Agent Sam orchestration |
| Prototype manifests + ops docs (`manifests/`, `docs/`) | Non-CMS product surfaces |
| Integration snippets (`integration/`) | Full `src/index.js` dispatch |

**Goal:** end-to-end CMS you can white-label without bloating the host monolith.

## Three lanes

1. **Studio** — `{host}/studio/editor?project=…` — auth-gated authoring
2. **Draft preview** — `{domain}/{route}?preview=draft&cms=1` — real route, draft merge
3. **Live** — published HTML on project domain

## Quick start

```bash
# Python pipeline (BeautifulSoup + Workers AI)
./scripts/setup-pipeline.sh
cd services/cms-pipeline-service
uv run pywrangler dev --port 8788
curl -s http://127.0.0.1:8788/health

# Deploy pipeline
uv run pywrangler deploy
```

Studio static assets ship to host R2 under `static/dashboard/app/cms/` (see `docs/HOST_INTEGRATION.md`).

## Docs

- [Python agentic pipeline](docs/PYTHON_CMS_AGENTIC.md)
- [PrimeTech studio](docs/PRIMETECH_STUDIO.md)
- [Prototype manifest (IPM)](docs/PROTOTYPE_MANIFEST.md)
- [Operations plane (Agent Sam)](docs/OPERATIONS_PLANE.md)
- [Host integration](docs/HOST_INTEGRATION.md)

## Related repos

- **Host platform:** [inneranimalmedia](https://github.com/SamPrimeaux/inneranimalmedia) — optional thin binding layer
- **Legacy editor shell:** [agentsam-cms-editor](https://github.com/SamPrimeaux/agentsam-cms-editor)

## License

Proprietary — Inner Animals LLC / Inner Animal Media. Contact for reseller terms.
