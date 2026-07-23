-- 1016: Fix rule_vectorize_lane_memory tool drift — agentsam_memory_write is inactive.
-- Active write path is agentsam_memory_save (guard:engineering-laws check #6).

UPDATE agentsam_rules_document
SET body_markdown = REPLACE(
      body_markdown,
      'via `agentsam_memory_save` or `agentsam_memory_write`.',
      'via `agentsam_memory_save`.'
    ),
    updated_at_epoch = unixepoch(),
    notes = COALESCE(notes, '') || ' [1016: drop inactive agentsam_memory_write ref]'
WHERE id = 'rule_vectorize_lane_memory'
  AND body_markdown LIKE '%agentsam_memory_write%';
