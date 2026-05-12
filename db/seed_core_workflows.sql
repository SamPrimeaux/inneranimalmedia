-- Seeding Core Agent Sam Workflow Registry and Nodes
-- This script ensures both the parent workflow record and its constituent nodes/edges exist.

-- 1. Ensure Parent Workflows exist in agentsam_workflows (to satisfy FK)
INSERT OR IGNORE INTO agentsam_workflows 
(id, workflow_key, display_name, workflow_type, is_active)
VALUES
('wf_workspace_capability_runtime', 'wf_workspace_capability_runtime', 'Workspace Capability Runtime', 'agentic', 1),
('wf_agent_chat_v1', 'wf_agent_chat_v1', 'Standard Agent Chat', 'agentic', 1);

-- 2. Clear existing nodes/edges for these IDs to ensure a clean seed
DELETE FROM agentsam_workflow_nodes WHERE workflow_id IN ('wf_workspace_capability_runtime', 'wf_agent_chat_v1');
DELETE FROM agentsam_workflow_edges WHERE workflow_id IN ('wf_workspace_capability_runtime', 'wf_agent_chat_v1');

-- 3. Nodes for wf_workspace_capability_runtime
INSERT INTO agentsam_workflow_nodes 
(workflow_id, node_key, node_type, title, description, handler_key, sort_order)
VALUES
('wf_workspace_capability_runtime', 'start', 'agent', 'Intent Analysis', 'Analyze user request to determine required capability', 'agentsam.intent.classify', 10),
('wf_workspace_capability_runtime', 'router', 'branch', 'Capability Router', 'Route to specific surface handler', NULL, 20),
('wf_workspace_capability_runtime', 'monaco', 'mcp_tool', 'Monaco Editor', 'Apply code changes via Monaco patch system', 'agentsam.monaco.patch', 30),
('wf_workspace_capability_runtime', 'browser', 'mcp_tool', 'Browser Automation', 'Perform browser actions and capture screenshots', 'agentsam.browser.capture', 40),
('wf_workspace_capability_runtime', 'excalidraw', 'mcp_tool', 'Excalidraw Canvas', 'Generate or update diagram scenes', 'agentsam.excalidraw.scene', 50),
('wf_workspace_capability_runtime', 'approval', 'approval_gate', 'Human Approval', 'Wait for user to approve high-risk actions', NULL, 60),
('wf_workspace_capability_runtime', 'end', 'eval', 'Finalize', 'Complete the workflow run', NULL, 70);

-- 4. Edges for wf_workspace_capability_runtime
INSERT INTO agentsam_workflow_edges
(workflow_id, from_node_key, to_node_key, condition_type, condition_json, label)
VALUES
('wf_workspace_capability_runtime', 'start', 'router', 'always', '{}', 'Analyzed'),
('wf_workspace_capability_runtime', 'router', 'monaco', 'status', '{"from_status": "success", "field": "capability", "value": "monaco"}', 'Use Monaco'),
('wf_workspace_capability_runtime', 'router', 'browser', 'status', '{"from_status": "success", "field": "capability", "value": "browser"}', 'Use Browser'),
('wf_workspace_capability_runtime', 'router', 'excalidraw', 'status', '{"from_status": "success", "field": "capability", "value": "excalidraw"}', 'Use Excalidraw'),
('wf_workspace_capability_runtime', 'monaco', 'approval', 'risk', '{"requires_approval": true}', 'Needs Approval'),
('wf_workspace_capability_runtime', 'monaco', 'end', 'risk', '{"requires_approval": false}', 'Auto-applied'),
('wf_workspace_capability_runtime', 'browser', 'end', 'always', '{}', 'Captured'),
('wf_workspace_capability_runtime', 'excalidraw', 'end', 'always', '{}', 'Rendered'),
('wf_workspace_capability_runtime', 'approval', 'end', 'status', '{"from_status": "success"}', 'Approved');

-- 5. Nodes for wf_agent_chat_v1 (Linear simplified fallback)
INSERT INTO agentsam_workflow_nodes 
(workflow_id, node_key, node_type, title, description, handler_key, sort_order)
VALUES
('wf_agent_chat_v1', 'chat', 'agent', 'Agent Reasoning', 'Process chat message and respond', 'agentsam.agent.chat', 10);
