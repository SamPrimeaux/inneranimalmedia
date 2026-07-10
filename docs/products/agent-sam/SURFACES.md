# Agent Sam — surfaces

**Parent:** [README.md](./README.md)

---

## Surface map

```
Agent Sam
├── In-app workbench      /dashboard/agent
├── Embedded agents       Side panel on product routes (App.tsx)
├── MCP Connect           mcp.inneranimalmedia.com (MCP repo)
├── SDK API               /api/sdk/* (main worker)
├── CLI / npm package     @inneranimalmedia/agentsam-sdk (external repo)
└── Scaffold engine       sdk-scaffold.js lanes
```

---

## In-app workbench (`/dashboard/agent`)

| Item | Detail |
|------|--------|
| UI | Agent chat host, modes, composer |
| Route keys | `agent_sam`, `agent_examples` |
| API | `POST /api/agent/chat` |
| **Note** | One interface — not the entirety of Agent Sam |

---

## Embedded product agents

Configured in `dashboard/App.tsx` per route:

| Route | Workbench tab / subagent |
|-------|--------------------------|
| `/dashboard/designstudio` | `designstudio`, default `cadcreator` |
| `/dashboard/draw` | Draw context via events |
| `/dashboard/cms` | CMS workbench context |
| `/dashboard/moviemode` | `moviemode` |

Route context: `dashboard/lib/dashboardRouteContext.ts` (partial coverage — Draw/Movie Mode gaps).

---

## MCP Connect

| Item | Detail |
|------|--------|
| URL | `https://mcp.inneranimalmedia.com/mcp` |
| Repo | `inneranimalmedia-mcp-server` |
| Auth | OAuth 2.1 PKCE, workspace tokens |
| Clients | Cursor, Claude, ChatGPT connectors |

---

## SDK + scaffold

| Endpoint | Purpose |
|----------|---------|
| `POST /api/sdk/auth/*` | CLI OAuth |
| `GET /api/sdk/context` | Developer context |
| `POST /api/sdk/scaffold` | NDJSON provision + files |

Lanes: `fullstack`, `cms`, `data`, `crm`, `creative` — `src/core/sdk-scaffold.js`

---

## Related

- [SDK_AND_MCP.md](./SDK_AND_MCP.md)
- [../../shared/AGENT_RUNTIME.md](../../shared/AGENT_RUNTIME.md)
