---
name: iam-ship
description: >-
  Umbrella index for IAM platform shipping. Does NOT deploy anything by itself —
  choose /iam-ship-main (inneranimalmedia.com Worker+PWA) or /iam-ship-mcp
  (mcp.inneranimalmedia.com). Prevents mixing the two repo roots.
---

# IAM ship — pick a surface

**Do not deploy until you pick one slash:**

| Slash | Skill | Deploys |
|-------|-------|---------|
| **`/iam-ship-main`** | `skill_iam_ship_main` | `SamPrimeaux/inneranimalmedia` only |
| **`/iam-ship-mcp`** | `skill_iam_ship_mcp` | `SamPrimeaux/inneranimalmedia-mcp-server` only |

| | Main | MCP |
|--|------|-----|
| Mac cwd | `/Users/samprimeaux/inneranimalmedia` | `/Users/samprimeaux/inneranimalmedia-mcp-server` |
| URL | `inneranimalmedia.com` | `mcp.inneranimalmedia.com` |
| Typical | `deploy:full` / `ship:remote` | `deploy:full` (MCP scripts) |

Shared: `ws_inneranimalmedia` · D1 `inneranimalmedia-business` · lanes doc `mac-free-ship-lanes-2026-07.md`.

If the user says “deploy” without naming MCP vs main, **ask which surface** — then load the matching skill. Never run both pipelines from one cwd.
