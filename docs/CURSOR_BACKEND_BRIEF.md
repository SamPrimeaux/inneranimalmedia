# Agent Home — Backend Brief (Phase 1)

Frontend types: `dashboard/types/agentHomeScene.ts`

## D1

Table: `agent_home_scene` (migration `725_agent_home_scene.sql`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | `ahs_{userId}_{workspaceId\|global}` |
| `user_id` | TEXT | Owner |
| `workspace_id` | TEXT | `''` = user-global; non-empty = workspace override |
| `scene_json` | TEXT | JSON matching `AgentHomeSceneConfig` |
| `created_at` / `updated_at` | INTEGER | unixepoch |

Unique: `(user_id, workspace_id)`

## API

### `GET /api/agent/scene`

Auth required. Resolution order:

1. Row for `(user_id, workspace_id)` → `source: workspace`
2. Row for `(user_id, '')` → `source: user`
3. Built-in default → `source: default` (not persisted)

Response:

```json
{
  "ok": true,
  "source": "default" | "user" | "workspace",
  "scene": { "version": 1, "layers": [...], "atmosphere": {...}, "ui": {...} }
}
```

### `PUT /api/agent/scene`

Auth required. Body:

```json
{
  "scene": { "version": 1, "layers": [...] },
  "workspaceScoped": false
}
```

- `workspaceScoped: false` → upsert user-global row (`workspace_id = ''`)
- `workspaceScoped: true` → upsert workspace row

Server sanitizes layers (preset ids, URL length, layer cap 6).

## Scene layers (v1)

| type | fields |
|------|--------|
| `preset` | `id`: `moonlit-sea` \| `aurora` \| `minimal-dark` |
| `gradient` | `stops[]`, `angle` |
| `image` | `url`, optional `blur` |
| `video` | `url`, `muted` |
| `webgl` | `presetId`, `params` (lazy chunk on client) |

## Phase 2 (not in this pass)

- Scene editor UI (inspector panel)
- Agent Sam tool `update_home_scene`
- Realtime sync across devices
