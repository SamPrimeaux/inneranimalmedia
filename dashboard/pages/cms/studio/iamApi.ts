export type StudioSection = {
  id: string;
  name: string;
  type: string;
  zone: 'HEADER' | 'BODY' | 'FOOTER' | 'TEMPLATE';
  visible: boolean;
  color: string;
  fields: Record<string, any>;
  css?: Record<string, any>;
};

export type StudioPage = {
  id: string;
  title: string;
  slug: string;
  status: 'live' | 'draft' | 'new';
  type: string;
  parent?: string;
  sections: StudioSection[];
  metaTitle: string;
  metaDescription: string;
};

export type StudioSite = {
  id: string;
  name: string;
  initials: string;
  domain: string;
  edited: string;
  color: string;
  pages: StudioPage[];
};

type Json = Record<string, any>;

type ApiInit = Omit<RequestInit, 'body'> & { body?: any };

async function api<T = Json>(path: string, init: ApiInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  let body = init.body;
  if (body != null && !(body instanceof FormData) && typeof body !== 'string') {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(body);
  }
  const response = await fetch(path, {
    ...init,
    body,
    headers,
    credentials: 'include',
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || payload?.error || response.statusText || 'Request failed';
    throw Object.assign(new Error(String(message)), { status: response.status, payload });
  }
  return payload as T;
}

function parseObject(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try { return JSON.parse(String(value)); } catch { return {}; }
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'IA';
}

function zoneFor(row: Json): StudioSection['zone'] {
  const explicit = String(row.zone || row.section_data?.zone || '').toUpperCase();
  if (explicit === 'HEADER' || explicit === 'FOOTER' || explicit === 'TEMPLATE') return explicit;
  const type = String(row.section_type || '').toLowerCase();
  if (type.includes('nav') || type.includes('header')) return 'HEADER';
  if (type.includes('footer')) return 'FOOTER';
  return 'BODY';
}

export function mapSection(row: Json): StudioSection {
  const fields = parseObject(row.section_data ?? row.fields);
  return {
    id: String(row.id),
    name: String(row.section_name || row.name || row.section_type || 'Section'),
    type: String(row.section_type || fields.section_type || row.section_name || 'Section'),
    zone: zoneFor({ ...row, section_data: fields }),
    visible: row.is_visible === undefined ? row.visible !== false : Boolean(Number(row.is_visible)),
    color: String(fields.bg_color || fields.background_color || row.color || '#111115'),
    fields,
    css: parseObject(fields.css_override || row.css),
  };
}

export function mapPage(row: Json, sections: StudioSection[] = []): StudioPage {
  const route = String(row.route_path || row.slug || '/');
  return {
    id: String(row.id),
    title: String(row.title || row.slug || 'Untitled'),
    slug: route.startsWith('/') ? route : `/${route}`,
    status: row.status === 'published' || row.is_published ? 'live' : row.status === 'new' ? 'new' : 'draft',
    type: String(row.page_type || row.type || (route === '/' ? 'Home' : 'Interior')),
    parent: row.parent_id || undefined,
    sections,
    metaTitle: String(row.seo_title || row.meta_title || row.title || ''),
    metaDescription: String(row.meta_description || ''),
  };
}

export async function getBootstrap(projectSlug: string, focusPageId?: string | null) {
  const params = new URLSearchParams({ project_slug: projectSlug, site: projectSlug });
  if (focusPageId) params.set('page_id', focusPageId);
  const raw = await api<Json>(`/api/cms/bootstrap?${params}`);
  const byPage = raw.sections_by_page || {};
  const pages = (raw.pages || []).map((page: Json) => mapPage(page, (byPage[page.id] || []).map(mapSection)));
  const tenant = raw.tenant || {};
  const name = String(tenant.name || raw.workspace_label || projectSlug);
  const themeVars = parseObject(raw.active_theme?.css_vars || raw.active_theme?.css_vars_json);
  const site: StudioSite = {
    id: projectSlug,
    name,
    initials: initials(name),
    domain: String(raw.public_domain || tenant.domain || ''),
    edited: 'Just now',
    color: String(themeVars['--brand-primary'] || tenant.primary_color || '#6358ff'),
    pages,
  };
  return {
    site,
    themeVars,
    templates: raw.component_templates || [],
    imports: raw.liquid_imports || [],
    homePageId: raw.home_page?.id || pages[0]?.id || null,
  };
}

export const saveSection = (sectionId: string, fields: Record<string, any>, css?: Record<string, any>) =>
  api(`/api/cms/sections/${encodeURIComponent(sectionId)}`, {
    method: 'PUT',
    body: { section_data: { ...fields, ...(css && Object.keys(css).length ? { css_override: css } : {}) } },
  });

export const renameSection = (sectionId: string, sectionName: string) =>
  api(`/api/cms/sections/${encodeURIComponent(sectionId)}`, { method: 'PUT', body: { section_name: sectionName } });

export const reorderSections = (pageId: string, sections: StudioSection[]) =>
  api('/api/cms/sections/reorder', {
    method: 'POST',
    body: { page_id: pageId, order: sections.map((section, index) => ({ id: section.id, sort_order: (index + 1) * 10 })) },
  });

export const setSectionVisibility = (sectionId: string, visible: boolean) =>
  api(`/api/cms/sections/${encodeURIComponent(sectionId)}/visibility`, {
    method: 'POST', body: { is_visible: visible ? 1 : 0 },
  });

export async function createSection(pageId: string, name: string, fields: Record<string, any>, sortOrder: number) {
  const result = await api<Json>('/api/cms/sections', {
    method: 'POST',
    body: { page_id: pageId, section_type: name.toLowerCase().replace(/\s+/g, '-'), section_name: name, section_data: fields, sort_order: sortOrder },
  });
  return mapSection(result.section || { id: result.id, section_name: name, section_type: name, section_data: fields, is_visible: 1 });
}

export async function createPage(projectSlug: string, input: { title: string; slug: string; type: string }) {
  const slug = input.slug.replace(/^\/+/, '') || 'untitled';
  const result = await api<Json>('/api/cms/pages', {
    method: 'POST',
    body: { project_id: projectSlug, title: input.title || 'Untitled', slug, route_path: `/${slug}`, page_type: input.type, status: 'draft', content: '' },
  });
  return mapPage({ ...result, id: result.id, title: input.title, slug, route_path: result.route_path || `/${slug}`, page_type: input.type, status: 'draft' });
}

export const savePageMeta = (page: StudioPage) =>
  api(`/api/cms/pages/${encodeURIComponent(page.id)}`, {
    method: 'PUT',
    body: {
      title: page.title,
      route_path: page.slug,
      slug: page.slug.replace(/^\/+/, ''),
      page_type: page.type,
      seo_title: page.metaTitle,
      meta_description: page.metaDescription,
    },
  });

export const publishPage = (pageId: string) =>
  api(`/api/cms/pages/${encodeURIComponent(pageId)}/publish`, { method: 'POST', body: {} });

export const saveThemeVars = (projectSlug: string, vars: Record<string, string>) =>
  api('/api/cms/theme-vars', { method: 'PATCH', body: { project_slug: projectSlug, vars } });

export async function getAssets() {
  const result = await api<Json>('/api/cms/assets');
  return (result.assets || []).map((asset: Json, index: number) => ({
    id: asset.id || index,
    name: asset.original_filename || asset.filename || asset.label || 'Asset',
    type: String(asset.mime_type || '').startsWith('video/') ? 'Video' : String(asset.mime_type || '').includes('font') ? 'Font' : String(asset.mime_type || '').includes('pdf') ? 'Document' : 'Image',
    size: asset.content_size_bytes ? `${(Number(asset.content_size_bytes) / 1e6).toFixed(1)} MB` : '—',
    color: ['#5346db', '#d2e9df', '#ebc59d', '#25302b', '#705cf0', '#e6e0d3'][index % 6],
    previewUrl: asset.thumbnail_url || asset.cdn_url || asset.public_url || null,
  }));
}

export async function getTemplates() {
  const result = await api<Json>('/api/cms/templates');
  return (result.templates || []).map((row: Json) => String(row.template_name || row.iam_label || row.slug || 'Template'));
}

export async function getContacts() {
  const result = await api<Json>('/api/user/contacts');
  return (result.contacts || []).map((row: Json, index: number) => ({
    id: index,
    name: String(row.name || row.display_name || row.email || 'Contact'),
    email: String(row.email || ''),
    source: String(row.source || 'Contact form'),
    date: String(row.updated_at || row.created_at || 'Recently'),
    tag: Array.isArray(row.tags) ? row.tags[0] || 'Lead' : row.tag || 'Lead',
  }));
}

export async function activateTheme(themeSlug: string, accent?: string) {
  return api('/api/cms/themes/activate', { method: 'POST', body: { slug: themeSlug, accent } });
}
