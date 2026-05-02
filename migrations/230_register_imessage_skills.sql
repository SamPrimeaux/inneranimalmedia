-- Migration: 230_register_imessage_skills.sql
-- Goal: Register Phase 19 iMessage capabilities in the Agent Sam modular skill registry.

-- Migration: 230_register_imessage_skills.sql
-- Goal: Register Phase 19 iMessage capabilities in the Agent Sam modular skill registry.

INSERT OR REPLACE INTO agentsam_skill (
    id, user_id, name, description, is_active, created_at, updated_at, access_mode, sort_order, slash_trigger, tags
) VALUES 
('imessage.send', 'au_871d920d1233cbd1', 'Send iMessage', 'Sends a text message to a specific chat GUID via BlueBubbles.', 1, unixepoch(), unixepoch(), 'read_write', 100, '/sms', 'communication,imessage,bluebubbles,sota'),
('imessage.list', 'au_871d920d1233cbd1', 'List iMessage Chats', 'Retrieves the list of recent conversations from iMessage.', 1, unixepoch(), unixepoch(), 'read_only', 110, '/chats', 'communication,imessage,bluebubbles,sota'),
('imessage.history', 'au_871d920d1233cbd1', 'Fetch iMessage History', 'Retrieves the conversation history for a specific chat GUID.', 1, unixepoch(), unixepoch(), 'read_only', 120, '/history', 'communication,imessage,bluebubbles,sota');
