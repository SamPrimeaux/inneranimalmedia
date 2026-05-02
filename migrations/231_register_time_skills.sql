-- Migration: 231_register_time_skills.sql
-- Goal: Register Phase 21 Time capabilities in the Agent Sam modular skill registry.

INSERT OR REPLACE INTO agentsam_skill (
    id, user_id, name, description, is_active, created_at, updated_at, access_mode, sort_order, slash_trigger, tags
) VALUES 
('time.now', 'au_871d920d1233cbd1', 'Get Current Time', 'Retrieves the current ISO, Unix, and local time for a specific timezone.', 1, unixepoch(), unixepoch(), 'read_only', 130, '/now', 'temporal,time,sota'),
('time.convert', 'au_871d920d1233cbd1', 'Convert Timezone', 'Converts a specific time string to a target timezone.', 1, unixepoch(), unixepoch(), 'read_only', 140, '/tz', 'temporal,time,sota');
