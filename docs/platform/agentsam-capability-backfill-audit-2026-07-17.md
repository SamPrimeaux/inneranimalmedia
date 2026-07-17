# Agent Sam Capability Backfill Audit — 2026-07-17

## Scope

Migration 932 introduces the capability catalog and classifies the active tool catalog using each tool's category, handler configuration, input schema, risk, and runtime behavior. Tool names remain executable identities; `domain.verb` capabilities are authorization boundaries.

Migration 934 adds the canonical Meshy catalog requested for Design Studio and retains the existing `meshyai_*` keys as executable compatibility aliases.

## Authorization behavior

- The selected `agentsam_tool_profiles` row remains the tool-menu allowlist.
- Read capabilities in that selected menu are allowed unless explicitly denied.
- Every applicable mutating capability must appear in `allow_mutating_capabilities`.
- Operation-sensitive composite capabilities are represented by `operations_json`.
- Unclassified low-risk reads remain compatible and emit telemetry.
- Unclassified medium/high-risk or approval-requiring tools fail closed.
- Risk and approval checks remain separate from capability authorization.

## Conservative classifications

- `agentsam_github_issue` is classified as `github.write`, including its get/list operations. This is intentionally conservative because one catalog tool combines read and mutation operations.
- `cloudflare_command_registry` is classified as `cloudflare.execute`. It remains approval/risk constrained and should later be split into provider-native read, execute, and deploy tools.
- `agentsam_cf_vectorize` is primarily `vector.write`; query operations also carry `vector.read`.
- `agentsam_gdrive` is primarily `drive.read`; explicit write/create/update/delete operations additionally require `drive.write`.
- `agentsam_memory_manager` always requires `memory.read`; write/upsert and delete/resolve operations additionally require their corresponding mutating capability.
- `agentsam_codebase_scan_fix` requires `file.read` and `file.write`; PR and deploy variants additionally require `github.write` and `cloudflare.deploy`.

## Meshy normalization

Canonical keys use the `meshy_*` prefix and map to:

- `media.generate`: text preview, single-image, and multi-image generation.
- `media.transform`: refine, remesh, retexture, rig, animate, convert, resize, and UV unwrap.
- `media.status`: get task status and list authenticated user-owned IAM jobs.
- `media.manage`: permanently delete an authenticated user-owned Meshy task.

Meshy's API exposes task deletion, not a reversible cancellation endpoint. `meshy_cancel_task` therefore requires approval and explicitly documents permanent deletion.

## Post-deploy verification

The release gate must confirm:

1. Every active medium/high-risk or approval-requiring tool has at least one joined capability.
2. No active tool has an invalid capability reference.
3. All canonical Meshy rows use `handler_type='media'` and resolve to registered handlers.
4. Design Studio and CAD Generation profiles contain only canonical `meshy_*` keys.
5. Capability decisions and mismatch details are present in `agentsam_tool_call_log.policy_decision_json`.
6. Memory result-policy telemetry records original/returned bytes and item counts without storing rejected raw payloads.

Any remaining unclassified low-risk read must be reviewed before capability enforcement is expanded beyond the selected profile menus.
