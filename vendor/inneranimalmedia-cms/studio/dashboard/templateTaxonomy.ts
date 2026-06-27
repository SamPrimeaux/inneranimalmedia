import type { CmsTemplateRow } from './templatePreview';

export type TemplateTaxonomy = 'components' | 'websites' | 'other';

export const TEMPLATE_TAXONOMY_LABELS: Record<TemplateTaxonomy, string> = {
  components: 'Components',
  websites: 'Websites',
  other: 'Other',
};

export const TEMPLATE_TAXONOMY_HINTS: Record<TemplateTaxonomy, string> = {
  components: 'Reusable UI fragments — loaders, heroes, CTAs, inline progress',
  websites: 'Full-page HTML templates and marketing layouts',
  other: 'Standalone utilities — games, offline fallbacks, experiments',
};

const OTHER_SLUGS = new Set(['iam-offline-runner', 'offline-runner', 'offline-signal-wait']);

/** Classify a cms_component_templates row into the 3-filter taxonomy. */
export function classifyTemplate(template: CmsTemplateRow): TemplateTaxonomy {
  const type = String(template.template_type || '').toLowerCase();
  const slug = String(template.slug || '').toLowerCase();
  const cat = String(template.category || '').toLowerCase();

  if (OTHER_SLUGS.has(slug) || slug.includes('offline-runner') || slug.includes('offline-signal')) {
    return 'other';
  }

  if (type === 'marketing_page') return 'websites';

  if (type === 'loading_state' || type === 'section') return 'components';

  if (type === 'loading_screen') {
    if (slug.includes('offline')) return 'other';
    return 'components';
  }

  if (cat.includes('marketing') && template.source_html_r2_key) return 'websites';
  if (cat.includes('loading')) return 'components';

  if (template.source_html_r2_key && !type) return 'websites';

  return 'components';
}

export function filterTemplatesByTaxonomy(
  templates: CmsTemplateRow[],
  taxonomy: TemplateTaxonomy | 'all',
): CmsTemplateRow[] {
  if (taxonomy === 'all') return templates;
  return templates.filter((t) => classifyTemplate(t) === taxonomy);
}
