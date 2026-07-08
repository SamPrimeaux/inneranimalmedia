---
title: Sandbox R2 FUSE (default)
project_key: inneranimalmedia
topic: terminal_exec
updated: 2026-07-07
status: canonical
---

# Sandbox R2 FUSE — default persistence lane

R2 FUSE is **required product behavior** for `agentsam_terminal_sandbox`, not an optional enhancement. Container ephemeral disk loses builds, node_modules caches, and generated assets when the pool sleeps. FUSE writes durable objects under the workspace R2 prefix.

## Mount layout

```
/mnt/r2/                          ← tigrisfs mount (inneranimalmedia bucket)
  {workspace_r2_prefix}/          ← from workspaces.r2_prefix / agentsam_workspace
    {zone_slug}/                  ← MCP zone slug (engineer, architect, …)
      assets/                     ← recommended drop for renders, exports, uploads
      …                           ← git clone / npm / wrangler cwd when writable
```

**Writable default:** `IAM_R2_FUSE_READONLY=0` (production). Read-only mount is legacy/debug only.

## Code SSOT

| Piece | Path |
|-------|------|
| Cwd resolver | `src/core/sandbox-r2-fuse-env.js` → `resolveSandboxContainerCwd` |
| Container env | `buildSandboxR2FuseEnvVars` → `MyContainer.js` |
| Image entrypoint | `containers/iam-sandbox-go/entrypoint.sh` |
| Sandbox exec | `src/core/terminal-sandbox.js` |

## Worker secrets (required for FUSE)

- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `IAM_SANDBOX_R2_FUSE=1` (disable only for emergency: `=0`)

## Why not VM disk alone

GCP iam-tunnel (`terminal.inneranimalmedia.com`) is for **git/shell/wrangler** when Mac is asleep. Heavy builds and asset pipelines belong in **sandbox + R2 FUSE** so outputs land in R2 keys agents and dashboards can index — not on a sparse VM clone or lost container layer.

## Related

- [terminal-three-lane-model.md](./terminal-three-lane-model.md)
- [project runtime contracts](./project-runtime-contracts.md)
