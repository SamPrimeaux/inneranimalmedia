-- Migration 801: cms_component_templates IAM tag spine (gallery filters + PATCH fields)
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/801_cms_template_gallery_iam_tag_spine.sql

ALTER TABLE cms_component_templates ADD COLUMN iam_tags TEXT DEFAULT '[]';
ALTER TABLE cms_component_templates ADD COLUMN iam_build TEXT;
ALTER TABLE cms_component_templates ADD COLUMN iam_project_slug TEXT;
ALTER TABLE cms_component_templates ADD COLUMN iam_category TEXT;
ALTER TABLE cms_component_templates ADD COLUMN iam_label TEXT;
ALTER TABLE cms_component_templates ADD COLUMN iam_status TEXT DEFAULT 'active';
ALTER TABLE cms_component_templates ADD COLUMN iam_workspace_id TEXT;
ALTER TABLE cms_component_templates ADD COLUMN sort_order INTEGER DEFAULT 50;
ALTER TABLE cms_component_templates ADD COLUMN usage_count INTEGER DEFAULT 0;
ALTER TABLE cms_component_templates ADD COLUMN last_used_at TEXT;
ALTER TABLE cms_component_templates ADD COLUMN is_featured INTEGER DEFAULT 0;
ALTER TABLE cms_component_templates ADD COLUMN featured_collection TEXT;

CREATE INDEX IF NOT EXISTS idx_cms_component_templates_iam_build
  ON cms_component_templates(iam_build) WHERE iam_build IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_component_templates_iam_project_slug
  ON cms_component_templates(iam_project_slug) WHERE iam_project_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cms_component_templates_iam_status
  ON cms_component_templates(iam_status);
CREATE INDEX IF NOT EXISTS idx_cms_component_templates_is_featured
  ON cms_component_templates(is_featured) WHERE is_featured = 1;

-- Back-fill iam_build
UPDATE cms_component_templates SET iam_build = 'inneranimalmedia'
WHERE iam_build IS NULL
  AND (slug LIKE 'iam-%' OR slug LIKE 'agent-sam%' OR slug LIKE 'agentsam%'
       OR slug LIKE 'inline-%' OR slug LIKE 'iam-offline%'
       OR category IN ('loading_screen','loading_state','spline_scene',
                       'hero','services','cta','custom','faq','header','footer'));

-- Back-fill iam_category
UPDATE cms_component_templates SET iam_category = CASE
  WHEN template_type IN ('loading_screen','loading_state') THEN 'loading-screen'
  WHEN template_type = 'section' THEN 'section'
  WHEN template_type = 'marketing_page' THEN 'page'
  WHEN category = 'hero' THEN 'hero'
  WHEN category = 'cta' THEN 'cta'
  WHEN category = 'services' THEN 'services'
  WHEN category = 'footer' THEN 'footer'
  WHEN category = 'header' THEN 'header'
  WHEN category = 'faq' THEN 'faq'
  WHEN category = 'spline_scene' THEN 'interactive'
  WHEN category = 'loading_screen' THEN 'loading-screen'
  ELSE category END
WHERE iam_category IS NULL;

-- Back-fill iam_label
UPDATE cms_component_templates SET iam_label = template_name
WHERE iam_label IS NULL AND template_name IS NOT NULL;

-- Feature agent-ready templates
UPDATE cms_component_templates SET is_featured = 1, featured_collection = 'agent-ready'
WHERE slug IN (
  'agent-sam-loading-states-lab','agent-sam-loading-states-clean-lab',
  'agentsam-loading-states-lab','agentsam-platform-hero',
  '3d-workflow-diagram','boxes-hover'
);
