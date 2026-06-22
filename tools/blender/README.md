# Meshy Blender plugin (pinned)

Pinned add-on for Design Studio CAD → Blender workflow.

| Artifact | Version |
|----------|---------|
| Zip | `meshy-blender-plugin-v0.6.0.zip` |
| Source | [Meshy Blender plugin docs](https://docs.meshy.ai/en/blender-plugin/bridge-to-blender) |

## Install

1. Open **Blender**
2. **Edit → Preferences → Add-ons → Install…**
3. Select this file:

   `~/inneranimalmedia/tools/blender/meshy-blender-plugin-v0.6.0.zip`

4. Enable the add-on (checkbox)
5. In add-on preferences, paste your API key from [meshy.ai/settings/api](https://www.meshy.ai/settings/api)  
   (same `msy_…` key as `MESHYAI_API_KEY` in `.env.cloudflare`)

## Use with Design Studio

1. Generate a model in **Design Studio** (Meshy text/image → job `done` → GLB on R2)
2. In Blender: **N** panel → **Meshy** tab → import GLB (download from job panel or public URL)

### DCC Bridge (one-click from Meshy web UI)

1. In the Meshy panel → **Run Bridge** → **Bridge ON** (listens on `http://127.0.0.1:5324`)
2. From meshy.ai workspace you can **Send to Blender** when Bridge is active  
   See [How Bridge Works](https://docs.meshy.ai/en/blender-plugin/bridge-to-blender#how-bridge-works)

Design Studio “Send to Blender” (Phase 4) will POST the GLB URL to the same port.

## Local API key alias (optional)

Blender prefs and upstream Meshy skills expect `MESHY_API_KEY`. Production Worker uses `MESHYAI_API_KEY`:

```bash
export MESHY_API_KEY="$(grep '^MESHYAI_API_KEY=' ~/inneranimalmedia/.env.cloudflare | cut -d= -f2- | tr -d '"')"
```

## Updating the plugin

1. Download newer zip from Meshy
2. Replace file here with versioned name (`meshy-blender-plugin-vX.Y.Z.zip`)
3. Update this README version table
4. Commit if keeping pinned copy in repo (~44 KB is fine for private repo)

## Related repo paths

| Path | Purpose |
|------|---------|
| `src/api/cad.js` | Meshy generate + poll Worker routes |
| `src/api/webhooks/meshy.js` | Task completion webhook |
| `docs/skills-playbooks/meshy_3d_designstudio/SKILL.md` | AgentSam skill playbook |
| `scripts/sync-meshy-api-key.sh` | Sync API key to Worker |
