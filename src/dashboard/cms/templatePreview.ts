const IAM_ASSETS_ORIGIN = 'https://assets.inneranimalmedia.com';

export type CmsTemplateRow = {
  id?: string;
  template_name?: string;
  template_type?: string;
  category?: string;
  preview_image_url?: string | null;
  template_data?: string | Record<string, unknown> | null;
  r2_key?: string | null;
  source_html_r2_key?: string | null;
  slug?: string | null;
  is_system?: number | boolean;
  source_liquid_file?: string | null;
  iam_tags?: string | string[] | null;
  iam_build?: string | null;
  iam_project_slug?: string | null;
  iam_category?: string | null;
  iam_label?: string | null;
  iam_status?: string | null;
  is_featured?: number | boolean | null;
  featured_collection?: string | null;
  usage_count?: number | null;
  sort_order?: number | null;
};

export function parseIamTags(raw: CmsTemplateRow['iam_tags']): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map((t) => String(t).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function parseTemplateMeta(template: CmsTemplateRow): Record<string, unknown> {
  const raw = template.template_data;
  if (!raw) return {};
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function r2KeyToAssetsUrl(key: string | null | undefined): string | null {
  const trimmed = String(key || '').trim().replace(/^\/+/, '');
  if (!trimmed) return null;
  return `${IAM_ASSETS_ORIGIN}/${trimmed}`;
}

/** Resolve a public preview URL for HTML / marketing templates. */
export function resolveTemplatePreviewUrl(
  template: CmsTemplateRow,
  meta?: Record<string, unknown>,
): string | null {
  const m = meta ?? parseTemplateMeta(template);
  const direct = m.preview_url ?? m.source_url;
  if (direct && /^https?:\/\//i.test(String(direct))) return String(direct).trim();
  return r2KeyToAssetsUrl(template.r2_key) ?? r2KeyToAssetsUrl(template.source_html_r2_key);
}

export function isHtmlTemplate(template: CmsTemplateRow): boolean {
  const type = String(template.template_type || '').toLowerCase();
  if (
    type === 'loading_screen' ||
    type === 'marketing_page' ||
    type === 'motion_system' ||
    type === 'interactive'
  ) {
    return true;
  }
  const key = String(template.r2_key || template.source_html_r2_key || '');
  return /\.html?(?:$|\?)/i.test(key) || Boolean(template.source_html_r2_key || template.r2_key);
}

export function isInlineComponentTemplate(template: CmsTemplateRow): boolean {
  const type = String(template.template_type || '').toLowerCase();
  return type === 'loading_state' || Boolean(parseTemplateMeta(template).component);
}
