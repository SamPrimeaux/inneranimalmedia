# Agent Sam Roadmap

## Phase 2: Monaco Diff Flow - STATUS: 95% Complete (v=50)

**Goal:** Agent generates code → "Open in Monaco" → diff view → "Keep Changes" → saves to R2

**Completed (v=50 - March 16, 2026):**
- Code block parsing from agent output
- "Open in Monaco" button generation
- Monaco diff editor rendering (persistent pattern)
- Custom `iam-custom` theme with CSS variables
- File save to R2 (verified working: divide.js)
- **CRITICAL FIX:** Disposal error eliminated (removed manual `.setValue()`)
- Filename validation and extraction
- Error handling with inline messages

**Remaining (Minor Polish):**
- Auto-hide diff panel after successful save (15-30 min fix)
  - File save works correctly
  - Panel requires manual close (X button)
  - Purely cosmetic UX issue

**Next Steps:**
- Option A: Fix auto-close (quick win, 15-30 min)
- Option B: Move to Phase 4 - Tool Execution Feedback (high priority, 3-4 hours)

---

## Phase 4: Tool Execution Feedback - STATUS: Not Started (HIGH PRIORITY)

**Goal:** Real-time visibility into agent actions

**Requirements:**
1. Worker emits SSE events:
   - `{type: "tool_start", tool: "r2_write", params: {...}}`
   - `{type: "tool_result", success: true, result: {...}}`
2. React renders tool execution indicators in chat
3. Loading states with contextual messages
4. Tool execution timeline/log

**Why Critical:**
- Users can't see what agent is doing (black box)
- Foundation for autonomous loop visibility
- Builds trust through transparency
- Essential for debugging agent behavior

**Estimated Effort:** 3-4 hours

**Priority:** HIGH (critical UX gap)
