-- 656: Point all 7 spawn skills at R2 playbooks + r2_vectorize retrieval.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/656_skill_playbook_instructions.sql

UPDATE agentsam_skill SET file_path = 'skills/on_brand_genmedia/SKILL.md', retrieval_strategy = 'r2', updated_at = datetime('now') WHERE id = 'skill_on_brand_genmedia';
UPDATE agentsam_skill SET file_path = 'skills/marketing_agency/SKILL.md', retrieval_strategy = 'r2', updated_at = datetime('now') WHERE id = 'skill_marketing_agency';
UPDATE agentsam_skill SET file_path = 'skills/brand_aligned_presentations/SKILL.md', retrieval_strategy = 'r2', updated_at = datetime('now') WHERE id = 'skill_brand_aligned_presentations';
UPDATE agentsam_skill SET file_path = 'skills/blogger_agent/SKILL.md', retrieval_strategy = 'r2', updated_at = datetime('now') WHERE id = 'skill_blogger_agent';
UPDATE agentsam_skill SET file_path = 'skills/deep_search/SKILL.md', retrieval_strategy = 'r2', updated_at = datetime('now') WHERE id = 'skill_deep_search';
UPDATE agentsam_skill SET file_path = 'skills/genmedia_commerce/SKILL.md', retrieval_strategy = 'r2', updated_at = datetime('now') WHERE id = 'skill_genmedia_commerce';
UPDATE agentsam_skill SET file_path = 'skills/data_engineering/SKILL.md', retrieval_strategy = 'r2', updated_at = datetime('now') WHERE id = 'skill_data_engineering';
