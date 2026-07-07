# Module 08 — FreeCAD assemblies (Assembly4 pattern)

**Time:** 45 min  
**Repos:**

- https://github.com/leoheck/FreeCAD_Assembly4.1 (study pattern)
- FreeCAD 1.0+ built-in Assembly Workbench (compare)

## Mental model IAM needs

```txt
Part          → single FCStd / generated artifact
Assembly      → container of parts with transforms
Export        → STL per part, GLB combined, STEP assembly
Versioning    → source FCStd hashes, job lineage in D1
```

## What Assembly4 teaches

- Assembly container object
- Parts positioned relative to each other (LCS / attachments)
- **External documents** linked — update part → assembly updates
- Product structure thinking (BOM-like)

Built-in Assembly Workbench (FreeCAD 1.0+) may replace Assembly4 for new work — study **patterns**, not necessarily adopt Assembly4 as runtime dependency.

## IAM D1 schema direction (proposed)

Extend `agentsam_cad_jobs` or add `agentsam_cad_assemblies`:

| Field | Purpose |
|-------|---------|
| `assembly_id` | Container job |
| `child_part_job_ids` | JSON array |
| `transforms_json` | Position/rotation per child |
| `root_fcstd_r2_key` | Editable source |

Design Studio viewport spawns **one GLB** merged for preview; FCStd tree preserved for edit.

## AgentSam flow

```txt
User: "Mount Pi enclosure to 2020 extrusion bracket assembly"
  1. Resolve part templates (enclosure job, bracket job)
  2. Create assembly job referencing FCStd outputs
  3. Apply transforms from intent ("flush to extrusion face")
  4. Export combined GLB + assembly FCStd
```

## Lab checklist

- [ ] Read Assembly4.1 README — note external document linking
- [ ] Compare with FreeCAD docs for native Assembly Workbench
- [ ] Sketch ER diagram for parts ↔ assemblies in D1
- [ ] Review `cad-job-complete.js` — what metadata is stored today on job success
- [ ] Identify gap: single-part jobs only vs multi-part assembly

## Not first integration

Assembly complexity is **P2** — after single-part templates and FreeCAD macro lane work. Study now; ship after Gridfinity + enclosure templates prove the pipeline.

## Next module

→ `09-python-cad-cadquery-build123d.md`
