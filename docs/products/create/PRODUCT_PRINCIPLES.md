# Create — product principles

**Status:** Working hypothesis · **Family:** Create

---

## Principles

### 1. Real engines, calm frontend

CAD tools run off-edge in the **CF `iam-cad-worker` container** (production LOCKED). The GCP `iam-tunnel` VM is always-on terminal/ops only — not CAD-capable. Browser is preview and orchestration — not fake in-browser FreeCAD.

### 2. Draw is the 2D lane; Design Studio is the 3D lane

Different routes today; shared project and agent context tomorrow.

### 3. Sam Sketch is the reference workflow

`proj_mrb5shkc_3kos2c` demonstrates house-plan flow — data in D1, not hardcoded React.

### 4. Agent Sam executes; Create surfaces orchestrate

Use `illustration_create` — not legacy `designstudio_*` catalog names unless D1 confirms handlers.

### 5. Do not merge code prematurely

Document family boundaries until blueprint router and project-scoped entry are verified.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Create** | Product family / nav group |
| **Draw** | 2D product lane |
| **Design Studio** | 3D product lane |
| **Sam Sketch** | Flagship project brand |

---

## Related

- [EXPERIENCE.md](./EXPERIENCE.md)
- [../design-studio/PRODUCT_PRINCIPLES.md](../design-studio/PRODUCT_PRINCIPLES.md)
