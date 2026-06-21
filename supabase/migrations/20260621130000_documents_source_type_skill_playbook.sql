-- Extend documents lane source_type with skill_playbook for R2 skill orchestration playbooks.

ALTER TABLE agentsam.agentsam_documents_oai3large_1536
  DROP CONSTRAINT IF EXISTS agentsam_documents_oai3large_1536_source_type_check;

ALTER TABLE agentsam.agentsam_documents_oai3large_1536
  ADD CONSTRAINT agentsam_documents_oai3large_1536_source_type_check
  CHECK (source_type IN (
    'document', 'course', 'lesson', 'module', 'lab', 'asset', 'markdown',
    'product_doc', 'support_doc', 'architecture_note', 'knowledge', 'plans',
    'roadmap', 'recipes', 'context', 'workflows', 'other', 'clients',
    'workspaces', 'brands', 'policy', 'skill_playbook'
  ));
