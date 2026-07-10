# Movie Mode — architecture

---

## Frontend

`dashboard/features/moviemode/` — `MovieModePage`, `MovieModeHome`, `MovieModeWorkbench`, timeline, Remotion utils

---

## Backend (main worker)

`src/api/moviemode-api.js` — projects, timelines, export, ingest, conversions

| Concern | Implementation |
|---------|----------------|
| Export | `POST /api/moviemode/export` → VPC `PTY_SERVICE` → Remotion script |
| Ingest | `POST /api/moviemode/ingest` → artifacts R2 |
| Conversions | CloudConvert presets |
| Stream | Webhooks → `media_assets` |
| Search | Gemini embeddings → `AGENTSAM_VECTORIZE_MEDIA` |

---

## Satellite

`services/moviemode-service/` — globe landing, legacy `/meaux*`; API offload **planned**

---

## Agent

- Workbench tab `moviemode` in App.tsx
- Tools: `moviemode.render`, Veo poll cron

---

## Related

- [../../MOVIEMODE-INFRA-PLAN.md](../../MOVIEMODE-INFRA-PLAN.md)
- [../../platform/workers-vpc-moviemode.md](../../platform/workers-vpc-moviemode.md)
