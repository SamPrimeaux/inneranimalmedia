import type {
  CmsAgentSaveInjectedResponse,
  CmsAgentSavePageHtmlResponse,
  CmsAgentVerifyLiveResponse,
  CmsBootstrapData,
  CmsPageDetailResponse,
  CmsPreviewUrls,
  CmsPublishResponse,
  CmsSaveDraftResponse,
} from '../../types/cms';

export type CmsApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
};

export async function cmsApi<T = unknown>(path: string, opts: CmsApiOptions = {}): Promise<T> {
  const isForm = opts.body instanceof FormData;
  const res = await fetch(path, {
    credentials: 'include',
    headers: isForm
      ? (opts.headers as HeadersInit) || {}
      : { 'Content-Type': 'application/json', ...(opts.headers as Record<string, string>) },
    ...opts,
    body: isForm
      ? (opts.body as FormData)
      : opts.body != null
        ? JSON.stringify(opts.body)
        : undefined,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({ error: res.statusText }))) as {
      error?: string;
      message?: string;
      code?: string;
    };
    throw new Error(err.error || err.message || res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Typed CMS API surface — dashboard + future editor bundle share these */
export const cmsEndpoints = {
  bootstrap(projectSlug: string, pageId?: string | null) {
    const q = new URLSearchParams({ project_slug: projectSlug });
    if (pageId) q.set('page_id', pageId);
    return `/api/cms/bootstrap?${q}`;
  },
  pagePreviewUrls(pageId: string, projectSlug: string) {
    return `/api/cms/pages/${encodeURIComponent(pageId)}/preview-urls?project_slug=${encodeURIComponent(projectSlug)}`;
  },
  pageDetail(pageId: string, projectSlug: string, draft = false) {
    const q = new URLSearchParams({ project_slug: projectSlug });
    if (draft) q.set('draft', '1');
    return `/api/cms/pages/${encodeURIComponent(pageId)}?${q}`;
  },
  publishPage(pageId: string) {
    return `/api/cms/pages/${encodeURIComponent(pageId)}/publish`;
  },
};

export function fetchCmsBootstrap(projectSlug: string, pageId?: string | null) {
  return cmsApi<CmsBootstrapData>(cmsEndpoints.bootstrap(projectSlug, pageId));
}

export function fetchCmsPreviewUrls(pageId: string, projectSlug: string) {
  return cmsApi<CmsPreviewUrls & { page_id: string }>(
    cmsEndpoints.pagePreviewUrls(pageId, projectSlug),
  );
}

export function fetchCmsPageDetail(pageId: string, projectSlug: string, draft = false) {
  return cmsApi<CmsPageDetailResponse>(cmsEndpoints.pageDetail(pageId, projectSlug, draft));
}

export function publishCmsPage(pageId: string, body: Record<string, unknown> = {}) {
  return cmsApi<CmsPublishResponse>(cmsEndpoints.publishPage(pageId), {
    method: 'POST',
    body,
  });
}

export function saveCmsPageDraft(pageId: string, body: Record<string, unknown>) {
  return cmsApi<CmsSaveDraftResponse>(`/api/cms/pages/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    body,
  });
}

/** Full-page HTML remaster — maps to PUT /api/cms/pages/:id { content } */
export function saveCmsPageHtml(
  pageId: string,
  html: string,
  opts: { title?: string; content_type?: string } = {},
) {
  return cmsApi<CmsAgentSavePageHtmlResponse>(`/api/cms/pages/${encodeURIComponent(pageId)}`, {
    method: 'PUT',
    body: { content: html, title: opts.title, content_type: opts.content_type || 'text/html' },
  });
}

/** Section HTML inject — maps to POST /api/cms/sections/save-injected */
export function saveCmsInjectedSection(body: {
  page_id: string;
  section_name: string;
  html: string;
  section_type?: string;
  position?: 'start' | 'end';
  project_slug?: string;
  section_id?: string;
}) {
  return cmsApi<CmsAgentSaveInjectedResponse>('/api/cms/sections/save-injected', {
    method: 'POST',
    body,
  });
}

/** PrimeTech loop: publish then verify helpers for dashboard/agent UI */
export async function runCmsPublishAndVerify(
  pageId: string,
  projectSlug: string,
  verify?: { expect_title?: string; expect_snippet?: string },
) {
  const pub = await publishCmsPage(pageId);
  const urls = await fetchCmsPreviewUrls(pageId, projectSlug);
  const liveUrl = pub.preview_urls?.live_url || urls.live_url;
  const verifyRes = liveUrl
    ? await verifyCmsLiveUrl({ url: liveUrl, ...verify })
    : ({ ok: false, error: 'no_live_url' } as CmsAgentVerifyLiveResponse);
  return { publish: pub, verify: verifyRes, live_url: liveUrl };
}

/** Client-side live URL check (browser). Agent uses agentsam_cms_verify_live server-side. */
export async function verifyCmsLiveUrl(body: {
  url: string;
  expect_title?: string;
  expect_snippet?: string;
}): Promise<CmsAgentVerifyLiveResponse> {
  const liveUrl = String(body.url || '').trim();
  if (!liveUrl) return { ok: false, error: 'url required' };

  const res = await fetch(liveUrl, { credentials: 'omit' });
  const text = await res.text();
  const title = text.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  const isCleanCanvas = /Clean canvas/i.test(text) && text.length < 2000;
  const titleMatches = body.expect_title ? Boolean(title?.includes(body.expect_title)) : null;
  const snippetFound = body.expect_snippet ? text.includes(body.expect_snippet) : null;
  const verified =
    res.status === 200 &&
    !isCleanCanvas &&
    text.length > 500 &&
    (titleMatches === null || titleMatches === true) &&
    (snippetFound === null || snippetFound === true);

  return {
    ok: verified,
    verified,
    protocol_complete: verified,
    url: liveUrl,
    live_url: liveUrl,
    checks: {
      http_status: res.status,
      byte_length: text.length,
      title,
      is_clean_canvas: isCleanCanvas,
      title_matches: titleMatches,
      snippet_found: snippetFound,
    },
  };
}
