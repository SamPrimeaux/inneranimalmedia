# Design Studio — product principles

---

## Principles

1. **Calm frontend over real engines** — OpenSCAD, FreeCAD, Blender, Meshy run off-edge
2. **Preview, not edit** — viewport loads GLB; parametric edit happens via jobs and blueprints
3. **Project-first** — link blueprints and jobs to `projects.id` (Sam Sketch model)
4. **Independent product identity** — not "a dashboard page"
5. **Bounded agent operations** — Studio, CAD, and provider lifecycle work use distinct task profiles
6. **Intake is not execution** — `illustration_create` may interpret broad Create/CAD intent, but native CAD and Meshy operations use precise tools

---

## Standalone intent

**Yes** — may graduate to independent domain/app. Currently incubating at `/dashboard/designstudio`.

---

## Related

- [../create/README.md](../create/README.md) — family context
- [ARCHITECTURE.md](./ARCHITECTURE.md)
