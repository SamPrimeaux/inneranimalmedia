-- One-shot: prepend tomorrow priority to system today_todo (Agent Sam / digest).
UPDATE agent_memory_index
SET
  value = '0) Tomorrow (2026-03-24): Finish UI + agent functionality — execution plan card visibility in main dashboard, Approve/Reject flow, Monaco alignment where needed. 1) Sprint1: Fix terminal sessionId (grep FloatingPreviewPanel + worker runTerminalCommand; align WS registration key). 2) Sprint2: SettingsPanel two-column nav + live saves + tabs Environment/Agents/Providers/Webhooks/Deploy/Cursor. 3) Sprint3: Agent dock CSS vars, icon states, multi-panel tabs, welcome cards; v123 after R2. Reference: docs/plans/TOMORROW_2026-03-23_UI_SETTINGS_TERMINAL_PLAN.md',
  updated_at = datetime('now')
WHERE tenant_id = 'system' AND key = 'today_todo';
