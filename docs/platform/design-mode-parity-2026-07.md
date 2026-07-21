# Design Mode parity (2026-07)

Cursor-style visual prompting in the Agent Sam **Browser** panel. Not a composer mode.

## Product law

- User stays on **Agent** (or Multitask). No sixth mode in the mode menu.
- Toggle Design Mode with **Cmd+Shift+D** (Ctrl+Shift+D) in Browser — or the pen toolbar button.
- When `browserContext.design_mode.active` is true, the worker auto-binds `agentsam_tool_profiles.profile_key = design_mode` (migration **967**).
- Plan / Ask / Debug composers still own their kits (Design Mode does not override them).

## What the agent receives

`browserContext.design_mode`:

```json
{
  "active": true,
  "selected_elements": [{ "selector": "...", "tag": "div", "computed_styles": {}, "...": "..." }],
  "annotation": { "kind": "strokes", "strokes": [], "frame_data_url": "..." }
}
```

Plus `selected_element` / `selected_elements` / `design_mode_active` for older readers.

## UI

| Action | Behavior |
|--------|----------|
| Pick element | Stays in Design Mode; multi-select chips; `@browser:…` in composer |
| Option+click | Silent attach (no input chip) |
| Annotate | Frozen viewport + freehand strokes → `annotation` |
| Area screenshot | Existing area mode (menu) |

## Not this feature

- Cursor **Canvases** (`.canvas.tsx`)
- Git **worktrees** / best-of-n
- IAM Draw `visual_canvas` / Excalidraw / Design Studio CAD

## Spine

- UI: `dashboard/components/BrowserView.tsx`, `dashboard/lib/designModeContext.ts`
- Chat: `dashboard/components/ChatAssistant/ChatAssistant.tsx`
- Profile resolve: `src/core/session-profile-task.js`, `src/core/design-mode-context.js`
- Session cache: `src/core/agent-session-context.js` (drops sticky `design_mode` when toggle off)
