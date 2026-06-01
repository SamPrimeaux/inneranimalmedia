-- agentsam_spawn_job.merge_strategy CHECK allows: concat, json_merge, vote, first_success, custom.
-- RWS pipeline uses merge_strategy='custom'; pipeline id stored in merge_instructions.

-- Idempotent: only patch rows that used the invalid literal (none should exist after code fix).
UPDATE agentsam_spawn_job
SET merge_strategy = 'custom',
    merge_instructions = COALESCE(merge_instructions, 'rws_pipeline')
WHERE merge_strategy = 'rws_pipeline';
