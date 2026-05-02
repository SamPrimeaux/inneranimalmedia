# UI Polish Verification (pre-Phase 2.6)

## Question 1: Chat input container

**Expected layout:** Single container with `[+] [Type...] [●mode] [Model▼] [|||||context] [→send]`

**Current state (verified in code):**

| Check | Status |
|-------|--------|
| "+" button inside input container | YES – First child of `agent-input-container` |
| Mode selector inside as circular icon | YES – 20x20, borderRadius "50%", background var(--mode-color) |
| Model dropdown inside | YES – `<select>` with activeModel, models |
| Context gauge (5 vertical bars) inside | YES – 5 divs, width 3 height 12, fill by contextPct > i*20 |
| Send button (→) inside | YES – Unicode \u2192, circular 32x32 |
| Container has drag-and-drop | YES – onDrop={onDropFiles}, onDragOver preventDefault |

**Verdict:** Chat input container is fully implemented as specified.

---

## Question 2: Monaco header buttons

**Expected:** Filename with [Save File] [Undo] always visible; Save writes to R2, Undo discards changes.

**Current state (verified in code):**

| Check | Status |
|-------|--------|
| Save File button in Monaco header | PARTIAL – "Save to R2" exists but only when `editMode` is true |
| Undo button in Monaco header | NO – Undo only exists in the diff-from-chat bar (HandleUndoFromChat), not in the normal code tab header |
| Buttons next to filename | PARTIAL – Save is next to filename when in edit mode only |
| Save writes to R2 / Undo discards | Save: yes. Undo: only for diff-from-chat, not for normal editor |

**Verdict:** Monaco header was missing always-visible Save File and Undo. **Implemented:** Save File and Undo are now always visible next to the filename when a file is open; Save writes to R2 (saveFileToR2, no longer requires editMode); Undo reverts to lastSavedContentRef. Part C CSS (agent-input-container focus-within, add-files-btn hover) added to index.css.
