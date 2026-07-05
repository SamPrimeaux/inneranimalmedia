-- Routing unblock: workspace default_model_id is picker UI only — never Auto routing pin.
UPDATE agentsam_workspace
SET default_model_id = NULL,
    updated_at = unixepoch()
WHERE id IN ('ws_inneranimalmedia', 'ws_connor_mcneely')
  AND default_model_id IS NOT NULL;
