-- 855: Promote IAM Scroll FX in CMS template gallery (sort + category casing)

UPDATE cms_component_templates
SET
  sort_order = 5,
  iam_category = 'interactive',
  is_featured = 1,
  featured_collection = 'agent-ready',
  iam_build = 'inneranimalmedia',
  iam_status = 'ready',
  iam_label = 'IAM Scroll FX Library'
WHERE id = 'tpl_iam_scroll_fx_v1';
