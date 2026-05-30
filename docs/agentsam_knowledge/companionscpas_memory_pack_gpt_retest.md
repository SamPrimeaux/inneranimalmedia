# CompanionsCPAS memory pack — GPT re-test checklist

After MCP server **v2.6.35+** (`managed_save` + `private_pg` mirror), re-save or confirm these three keys via **`agentsam_memory_save`** (not `agentsam_memory_write`).

## Keys (by lane)

| memory_type | key |
|-------------|-----|
| `state` | `companionscpas_cms_publish_flow_live_2026_05_29` |
| `policy` | `companionscpas_non_negotiable_change_sync_contract` |
| `decision` | `companionscpas_architecture_decisions_2026_05_29` |

## Success response shape

```json
{
  "ok": true,
  "saved": true,
  "provider": "managed_save",
  "private_pg": {
    "ok": true,
    "sync_key": "tenant_sam_primeaux:au_<user>:companionscpas_cms_publish_flow_live_2026_05_29",
    "memory_type": "state"
  },
  "remote": { "ok": true, "skipped": true }
}
```

**Do not** expect `remote` to carry PG sync. **Do not** use `provider: "cf"` on save (that was the old Vectorize proxy path).

## Priority re-smoke

`companionscpas_cms_publish_flow_live_2026_05_29` was saved to D1 before the mirror fix; re-upsert in GPT so `private_pg` gets a sync key.

## Cursor / ops seed (optional)

From repo root (requires `SUPABASE_DB_URL` in `.env.cloudflare`):

```bash
./scripts/with-cloudflare-env.sh node scripts/seed-companionscpas-memory-pack.mjs
```

Idempotent: refreshes D1 bodies + mirrors all three keys to `agentsam.agentsam_memory`.

## GPT save template (state)

Use `agentsam_memory_save` with:

- `key`: `companionscpas_cms_publish_flow_live_2026_05_29`
- `memory_type`: `state`
- `value`: full snapshot text (production URL, commits, worker version, publish job IDs, bindings)
- `importance`: `8`
- `is_pinned`: `true`
- `tags`: `["companionscpas","cms","publish","production","may29"]`
- `source`: `mcp:chatgpt_retest_20260529`

Do **not** include `cpas_session` or any live cookie in `value`.
