# Phase 2.6 Test Checklist

After deploy, run these workflows to verify agent tool integration and tracking.

---

## Test 1: File Creation

**User asks:** "Create a hello-world.js file that exports a simple handler"

**Expected:**
- [ ] Agent generates execution plan
- [ ] ExecutionPlanCard appears with steps
- [ ] User clicks Approve
- [ ] State changes: WAITING_APPROVAL to EXECUTING
- [ ] Code preview appears (15 lines max)
- [ ] "Open in Monaco" button works
- [ ] Monaco diff shows green highlights (new code)
- [ ] Keep Changes saves to R2
- [ ] Tables populated: agent_execution_plans, agent_costs, mcp_tool_calls (r2_write), agent_audit_log

---

## Test 2: Screenshot

**User asks:** "Take a screenshot of https://inneranimalmedia.com"

**Expected:**
- [ ] Agent calls playwright_screenshot (or browser_screenshot)
- [ ] Screenshot appears inline in chat as image
- [ ] Screenshot saved to R2 (screenshots/<id>.png)
- [ ] Tables populated: mcp_tool_calls (playwright_screenshot/browser_screenshot are BUILTIN so may not appear in mcp_tool_calls), agent_costs, agent_audit_log (event_type playwright_screenshot or browser_screenshot)

---

## Test 3: Database Query

**User asks:** "Show me the 5 most recent conversations"

**Expected:**
- [ ] Agent calls d1_query
- [ ] Results displayed in chat (formatted table or list)
- [ ] Tables populated: mcp_tool_calls (d1_query is BUILTIN so not in mcp_tool_calls), agent_audit_log (no audit for d1_query read-only), agent_costs

---

## Test 4: Terminal Command

**User asks:** "Run 'ls -la' in the terminal"

**Expected:**
- [ ] Agent calls terminal_execute
- [ ] Command output displayed in chat
- [ ] Tables populated: terminal_history, agent_audit_log (terminal_execute), agent_costs

---

## Test 5: Queue System

**User sends 3 requests rapidly while agent is working**

**Expected:**
- [ ] First request runs immediately
- [ ] QueueIndicator shows "+2 queued"
- [ ] Requests process in order
- [ ] agent_request_queue has 3 entries
- [ ] Each completes and updates status

---

## Test 6: Mode Switching

**User changes mode: Ask to Debug to Plan to Agent**

**Expected:**
- [ ] Mode icon color changes (green to red to orange to blue)
- [ ] Send button color matches mode
- [ ] AnimatedStatusText uses mode color for THINKING state

---

## Test 7: Multi-Source Search

**User types in global search:** "worker"

**Expected:**
- [ ] Results from ALL R2 buckets (shows bucket name)
- [ ] Results from knowledge base
- [ ] Results from conversations
- [ ] Clicking file result loads in Monaco
- [ ] Clicking knowledge result inserts into chat

---

## Test 8: Source Control

**User opens source control panel, selects different buckets/repos**

**Expected:**
- [ ] Shows recent files for selected bucket
- [ ] Shows git changes for selected repo (if GitHub connected)
- [ ] Info tab shows correct bucket stats / repo info
- [ ] No hardcoded bucket/repo names
