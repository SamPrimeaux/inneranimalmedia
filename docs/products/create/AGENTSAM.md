# Create family — Agent Sam compass

**Canonical technical detail:** [../../inneranimalmedia/product/designstudio/AGENTSAM.md](../../inneranimalmedia/product/designstudio/AGENTSAM.md)

---

## Agent entry

```txt
illustration_create
  schema: iam.illustration.v1
  engine: auto | excalidraw | openscad | freecad | blender | meshy
```

---

## Phase routing (target)

| Phase | Surface | Engine |
|-------|---------|--------|
| Sketch | Draw | excalidraw |
| Printable part | Design Studio | openscad + BOSL2 |
| Mechanical | Design Studio | freecad |
| Character / prop | Design Studio | meshy |
| Architecture | Design Studio | freecad Arch/BIM |

**Today:** manual surface selection.

---

## Sam Sketch rules

- Project: `proj_mrb5shkc_3kos2c`
- Reference images in `metadata_json` — not TS constants
- Barndominium layouts belong in blueprint `intent_json.options[]`

---

## CAD truth

- Jobs → `agentsam_cad_jobs` → runner → R2 GLB
- Runner down = say so; don't fake live preview
- BIM: `glb_up_axis: Y` after Blender export

---

## Proposed agent portfolio

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `create_router` | L0 | Luna | Phase pick: sketch vs CAD vs mesh |
| `cad_planner` | L4 | Sonnet 5 | Engine routing, intent |
| `cad_builder` | L2 | Codex | Script mutation |
| `cad_verifier` | L5 | Gemini 3.5 Flash | GLB / dimension QA |

Full roster: [`plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md`](../../plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md)

---

## Related

- [../agent-sam/AGENTSAM.md](../agent-sam/AGENTSAM.md)
- [../design-studio/AGENTSAM.md](../design-studio/AGENTSAM.md)
