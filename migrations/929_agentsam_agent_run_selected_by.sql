-- 929: Persist the routing selector used for every Agent Sam run.
-- Production already has this column from the routing rollout. This ledger
-- migration asserts the required schema and reconciles migration history
-- without issuing a duplicate ALTER TABLE.

SELECT selected_by
FROM agentsam_agent_run
WHERE 1 = 0;
