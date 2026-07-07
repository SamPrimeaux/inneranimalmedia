# Module 10 — CQ-editor + OCP CAD Viewer (code ↔ preview UX)

**Time:** 30 min  
**Repos:**

- https://github.com/CadQuery/CQ-editor  
- https://github.com/bernhard-42/vscode-ocp-cad-viewer

## The UX IAM should steal

Not Blender chrome — **developer CAD UX**:

```txt
┌──────────────────┬─────────────────────┐
│  Code / params   │   Live 3D preview   │
│  (Monaco)        │   (Three.js / OCCT) │
├──────────────────┴─────────────────────┤
│  [Run] [Export STL] [Export STEP]      │
└────────────────────────────────────────┘
```

## CQ-editor features to study

- Auto reload on script save
- Object stack / feature tree inspection
- Export buttons (STL, STEP)
- Debugger for parametric scripts

## OCP CAD Viewer (VS Code) features

- CadQuery / build123d objects in editor
- Three.js-based viewer in IDE sidebar
- Makes code-driven CAD **feel immediate**

## IAM mapping

| Upstream | IAM component |
|----------|---------------|
| Code panel | Creation lane BUILD tab + future Monaco in Design Studio |
| Reload | Re-run cad job on debounced edit |
| Object stack | Job metadata panel (not fake feature tree) |
| Viewer | `AgentSamEngine` GLB spawn + `ToolTraceCadLivePanel` |
| Export | `cadExportFormats.ts` + R2 download links |

Existing pieces:

- `dashboard/components/designstudio/creation-station/CreationPanelEditor.tsx`
- `dashboard/components/ChatAssistant/execution/ToolTraceCadLivePanel.tsx`
- `useCadJobPoll.ts` — poll until GLB ready

## Gap

BUILD tab fires jobs but lacks **tight reload loop** like CQ-editor (edit script → auto-regenerate). Wire debounced re-run when script editor stabilizes.

## Lab checklist

- [ ] Install CQ-editor locally OR watch upstream demo GIF/readme
- [ ] Install vscode-ocp-cad-viewer — open sample build123d script
- [ ] Screenshot IAM Creation lane BUILD tab — annotate missing pieces
- [ ] Write 5 acceptance criteria for "honest code preview UX"

## Anti-pattern

Showing a Monaco editor with **no** connection to runner = fake CAD. Either wire run or hide editor.

## Next module

→ `11-iam-integration-blueprint.md`
