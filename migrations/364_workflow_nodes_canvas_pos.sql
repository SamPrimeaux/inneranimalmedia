-- Canvas layout coordinates on DAG nodes (agentsam_workflow_nodes)
ALTER TABLE agentsam_workflow_nodes ADD COLUMN pos_x REAL;
ALTER TABLE agentsam_workflow_nodes ADD COLUMN pos_y REAL;
