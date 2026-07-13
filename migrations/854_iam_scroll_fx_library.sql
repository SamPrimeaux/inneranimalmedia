-- 854: IAM Scroll FX Library — CMS component template catalog + agent-ready feature

INSERT INTO cms_component_templates (
  id, template_name, template_type, category,
  is_system, slug, source_html_r2_key, r2_key,
  template_data, preview_image_url, source_liquid_file,
  iam_build, is_featured, featured_collection, iam_category, iam_status
) VALUES (
  'tpl_iam_scroll_fx_v1',
  'IAM Scroll FX Library',
  'motion_system',
  'Scroll FX',
  1,
  'iam-scroll-fx',
  'static/templates/ui/iam-scroll-fx/demo/index.html',
  'cms/motion/iam-scroll-fx-v1/index.html',
  '{"title":"IAM Scroll FX Library","description":"Zero-dependency scroll primitives driven by one --progress float per chapter: mask-wipe, letter-stagger, progress/clip-path, parallax-lite. Sticky chapter pin, reduced-motion baked in. No Lenis/WebGL.","stack":["scroll-engine","split-text","CSS --progress"],"preview_url":"https://assets.inneranimalmedia.com/cms/motion/iam-scroll-fx-v1/index.html","components_prefix":"cms/motion/iam-scroll-fx-v1/components/","primitives":["mask-wipe","letter-stagger","progress-clip","parallax-lite"]}',
  NULL,
  NULL,
  'inneranimalmedia',
  1,
  'agent-ready',
  'interactive',
  'ready'
)
ON CONFLICT(id) DO UPDATE SET
  template_name = excluded.template_name,
  template_type = excluded.template_type,
  category = excluded.category,
  slug = excluded.slug,
  source_html_r2_key = excluded.source_html_r2_key,
  r2_key = excluded.r2_key,
  template_data = excluded.template_data,
  iam_build = excluded.iam_build,
  is_featured = excluded.is_featured,
  featured_collection = excluded.featured_collection,
  iam_category = excluded.iam_category,
  iam_status = excluded.iam_status;
