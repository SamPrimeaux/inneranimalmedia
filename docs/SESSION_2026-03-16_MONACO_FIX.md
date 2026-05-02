# Session 2026-03-16 — Monaco Disposal Fix + Disk Cleanup (v=50)

## Accomplishments

- **Disk Space Recovery:** Freed 120GB by deleting Cursor snapshots (124GB → 7GB)
  - System went from 100% capacity (203GB used) to 41% capacity (83GB used)
- **Monaco Disposal Bug FIXED:** After 11 attempts, identified root cause
  - Deleted manual `.setValue()` useEffect (lines 570-581 in FloatingPreviewPanel.jsx)
  - @monaco-editor/react manages models through controlled props, not refs
  - v=50 deployed: NO disposal errors, file save works
- **Minor Issue:** Diff panel auto-close doesn't work (cosmetic, manual close works)

## Technical Details

- Files changed: FloatingPreviewPanel.jsx (deleted lines 570-581), agent.html (v=49→v=50)
- Build: agent-dashboard.js (274.88 kB), agent-dashboard.css (1.53 kB)
- Deploy: ./agent-dashboard/deploy-to-r2.sh to agent-sam bucket
- Test: divide.js saved to R2 successfully, no console errors

## Root Cause Analysis

- Manual model manipulation (`.setValue()`) was racing with React lifecycle
- @monaco-editor/react expects controlled props (`original`, `modified`)
- Bypassing lifecycle with ref manipulation caused disposal race condition
- Solution: Remove manual sync, rely on component's internal model management

## Status

- Phase 2 (Monaco Diff Flow): 95% complete
- Remaining: Auto-close panel after save (15-30 min cosmetic fix)
- Next: Phase 4 (Tool Execution Feedback) OR quick auto-close polish

## Key Learnings

- Architecture > Timing: 10 failed timing fixes, 1 successful architectural fix
- Always audit actual source early (not at attempt #10)
- React wrapper components have contracts - manual ref manipulation breaks them
- Disk space at 100% causes random failures - monitor Cursor snapshots directory
