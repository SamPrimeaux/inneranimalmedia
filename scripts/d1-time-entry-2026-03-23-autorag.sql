-- Manual close-of-day: Cursor session — AutoRAG bucket structure, R2 upload, docs
-- project_id inneranimalmedia; user sam_primeaux
INSERT INTO project_time_entries (
  id,
  user_id,
  project_id,
  session_id,
  start_time,
  end_time,
  duration_seconds,
  is_active,
  description,
  created_at
) VALUES (
  'pte-2026-03-23-autorag-session',
  'sam_primeaux',
  'inneranimalmedia',
  NULL,
  '2026-03-23 08:00:00',
  '2026-03-23 10:00:00',
  7200,
  0,
  'AutoRAG: bucket structure doc, populate-autorag-bucket.sh, R2 upload full tree (24 objects), bucket metadata, session log',
  datetime('now')
);
