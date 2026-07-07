# AgentSam CAD Engineering

Generated: 2026-07-07

Reusable curriculum for Inner Animal Media operators, builders, and AgentSam prompt authors who work on **Draw**, **Design Studio**, and real CAD execution lanes.

This course is **not** “how to use a fake 3D UI.” It teaches how to study upstream open-source CAD ecosystems and wire them into IAM’s `/draw` + `/dashboard/designstudio` architecture.

## Course goal

Teach the learner to:

```txt
understand IAM Draw vs Design Studio vs illustration_create router
study OpenSCAD library ecosystems (BOSL2, Gridfinity, domain generators)
study FreeCAD as headless document/macro/BIM engine
evaluate Python CAD (CadQuery, build123d) for agent codegen
clone, run, and adapt external templates for IAM /templates
design honest UX: params → job → preview → export
operate the real runner pipeline (OpenSCAD → STL → Blender → GLB → R2)
```

## R2 prefix

```txt
learn/agentsam-cad-engineering/
```

## Public base URL

```txt
https://assets.inneranimalmedia.com/learn/agentsam-cad-engineering/
```

## Lesson modules (repo source)

| # | Module | File |
|---|--------|------|
| 00 | Platform inventory — what IAM has today | `00-iam-platform-inventory.md` |
| 01 | BOSL2 — default OpenSCAD abstraction | `01-openscad-bosl2.md` |
| 02 | MCAD, OMDL, awesome-openscad — reference map | `02-openscad-ecosystem-reference.md` |
| 03 | Gridfinity generators — parametric product pattern | `03-gridfinity-parametric-generators.md` |
| 04 | Domain generators (keyboard_parts, etc.) | `04-domain-specific-generators.md` |
| 05 | FreeCAD architecture + headless execution | `05-freecad-foundation.md` |
| 06 | FreeCAD-library + macros | `06-freecad-library-and-macros.md` |
| 07 | BIM / Arch — shop-house lane | `07-freecad-bim-architecture.md` |
| 08 | Assembly4 — parts and product structure | `08-freecad-assemblies.md` |
| 09 | CadQuery + build123d — Python CAD backends | `09-python-cad-cadquery-build123d.md` |
| 10 | CQ-editor + OCP viewer — preview UX | `10-code-preview-ux.md` |
| 11 | IAM integration blueprint | `11-iam-integration-blueprint.md` |
| 12 | Clone-first checklist + local setup | `12-clone-setup-checklist.md` |

## Required dashboard behavior

Each lesson should open as a focused session inside `/dashboard/learn`:

```txt
Course Library
  → AgentSam CAD Engineering
    → Module read + lab checklist
      → Terminal (clone/run) · Browser (repo docs) · Design Studio (job proof)
```

Labs must connect to **real** tooling where possible:

- `npm run designstudio:check` / `designstudio:smoke`
- `./scripts/designstudio/run-openscad.sh`
- `illustration_create` with `engine: openscad | freecad | blender`
- Runner proof via `cad-job-runner.mjs` (dev machine or ExecOS)

**No fake terminal. No fake preview.** If a lab step cannot run locally, document the ExecOS/container path explicitly.

## IAM surfaces referenced

| Surface | Route | Role in course |
|---------|-------|----------------|
| Draw | `/dashboard/draw` | 2D wireframes, plan maps, Excalidraw libraries |
| Design Studio | `/dashboard/designstudio` | 3D job dispatch, GLB viewport |
| AgentSam | chat + tools | `illustration_create` SSOT |

## Build standard

Match `software-engineering-builder-os` course rules:

- Modules are markdown in repo → sync to R2 `learn/agentsam-cad-engineering/`
- D1 seeds (`course_*` tables) reference module slugs and asset URLs
- Agent Sam may tutor using these modules as RAG source (AUTORAG lane)

## Related platform docs

- `docs/platform/design-cad-draw-inventory-2026-07.md`
- `docs/inneranimalmedia/product/designstudio/PIPELINE.md`
- `docs/inneranimalmedia/product/designstudio/E2E-TEST-PIPELINE.md`
- `containers/iam-cad-worker/README.md`
