/**
 * API Service: CMS (Content Management System)
 * Handles page metadata in D1 and content persistence in R2.
 * 
 * Rules:
 * 1. D1 row = metadata + routing.
 * 2. Actual content = R2 object (HTML/MD).
 * 3. R2 key format: cms/{workspace_id}/{project_id}/{slug}/[draft|published].html
 * 4. Every INSERT must write person_uuid and tenant_id.
 * 5. R2 writes must succeed before D1 writes.
 */

import { getAuthUser, jsonResponse } from '../core/auth.js';

// --- R2 Helpers ---

function getCmsR2Binding(env, bucketName) {
  // R2 bucket: 'iam-docs' for client sites, 'agent-sam' for internal
  if (bucketName === 'iam-docs') return env.DOCS_BUCKET || env.R2;
  if (bucketName === 'agent-sam') return env.DASHBOARD || env.R2;
  return env.R2;
}

/**
 * Generates an R2 presigned URL for GET operations via S3 API.
 */
async function presignR2GetObjectUrl(env, bucket, key, expiresSeconds = 3600) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  if (!accessKey || !secretKey || !accountId) return null;

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  
  const encodedKey = String(key).split('/').map(seg => encodeURIComponent(seg)).join('/');
  
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSeconds),
    'X-Amz-SignedHeaders': 'host'
  });
  
  const sortedPairs = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  const canonicalQueryString = sortedPairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  
  const sha256 = async (msg) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const hmac = async (key, msg) => {
    const cryptoKey = await crypto.subtle.importKey(
      'raw', typeof key === 'string' ? new TextEncoder().encode(key) : key,
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(msg));
    return new Uint8Array(sig);
  };

  const canonicalRequest = ['GET', `/${bucket}/${encodedKey}`, canonicalQueryString, canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256(canonicalRequest)].join('\n');
  
  const kDate = await hmac('AWS4' + secretKey, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const signingKey = await hmac(kService, 'aws4_request');
  
  const signature = Array.from(await hmac(signingKey, stringToSign)).map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `https://${host}/${bucket}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

// --- CMS API Handlers ---

export async function handleCmsApi(request, url, env, ctx) {
  const authUser = await getAuthUser(request, env);
  if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

  const method = request.method.toUpperCase();
  const path = url.pathname.replace(/\/$/, '');
  const pathParts = path.split('/');
  
  // Scoping context
  const tenantId = authUser.tenant_id;
  const personUuid = authUser.person_uuid;
  const workspaceId = authUser.workspace_id || tenantId || 'ws_default';

  if (!env.DB) return jsonResponse({ error: 'Database unavailable' }, 503);

  /**
   * GET /api/cms/pages
   * List pages for workspace (metadata only).
   */
  if (path === '/api/cms/pages' && method === 'GET') {
    const projectId = url.searchParams.get('project_id');
    try {
      let query = `SELECT id, project_id, slug, title, status, route_path, updated_at, created_at, is_homepage FROM cms_pages WHERE tenant_id = ?`;
      const params = [tenantId];
      
      if (projectId) {
        query += ` AND project_id = ?`;
        params.push(projectId);
      }
      
      const { results } = await env.DB.prepare(query + ` ORDER BY created_at DESC`).bind(...params).all();
      return jsonResponse({ pages: results || [] });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * GET /api/cms/pages/:id
   * Return metadata + presigned R2 URL for content.
   */
  const pageIdMatch = path.match(/^\/api\/cms\/pages\/([^/]+)$/);
  if (pageIdMatch && method === 'GET') {
    const pageId = pageIdMatch[1];
    try {
      const page = await env.DB.prepare(
        `SELECT * FROM cms_pages WHERE id = ? AND tenant_id = ?`
      ).bind(pageId, tenantId).first();

      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      // Generate presigned URL for the R2 content
      const bucket = page.r2_bucket || 'iam-docs';
      const key = page.r2_key;
      let contentUrl = null;
      if (key) {
        contentUrl = await presignR2GetObjectUrl(env, bucket, key);
      }

      return jsonResponse({ page, content_url: contentUrl });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * POST /api/cms/pages
   * Create a new page.
   */
  if (path === '/api/cms/pages' && method === 'POST') {
    const body = await request.json();
    const { project_id, slug, title, content, content_type = 'text/html' } = body;

    if (!project_id || !slug || !title) {
      return jsonResponse({ error: 'project_id, slug, and title are required' }, 400);
    }

    // Determine R2 path and bucket
    const r2Bucket = 'iam-docs'; // Default for client sites
    const r2Key = `cms/${workspaceId}/${project_id}/${slug}/published.html`;
    const r2Binding = getCmsR2Binding(env, r2Bucket);

    if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);

    try {
      // 1. Write to R2 first
      const contentBuffer = new TextEncoder().encode(content || '');
      await r2Binding.put(r2Key, contentBuffer, {
        httpMetadata: { contentType: content_type }
      });

      // 2. Insert to D1
      const pageId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      
      await env.DB.prepare(`
        INSERT INTO cms_pages (
          id, project_id, slug, title, status, route_path,
          tenant_id, person_uuid, created_by, updated_by,
          r2_key, r2_bucket, content_type, content_size_bytes,
          created_at, updated_at, published_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        pageId, project_id, slug, title, 'published', `/${slug}`,
        tenantId, personUuid, authUser.id, authUser.id,
        r2Key, r2Bucket, content_type, contentBuffer.byteLength,
        now, now, now
      ).run();

      return jsonResponse({ success: true, id: pageId, r2_key: r2Key });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * PUT /api/cms/pages/:id
   * Update page content (saved as draft).
   */
  if (pageIdMatch && method === 'PUT') {
    const pageId = pageIdMatch[1];
    const body = await request.json();
    const { title, content, content_type = 'text/html' } = body;

    try {
      const page = await env.DB.prepare(
        `SELECT project_id, slug, r2_bucket FROM cms_pages WHERE id = ? AND tenant_id = ?`
      ).bind(pageId, tenantId).first();

      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      const r2Bucket = page.r2_bucket || 'iam-docs';
      const r2Key = `cms/${workspaceId}/${page.project_id}/${page.slug}/draft.html`;
      const r2Binding = getCmsR2Binding(env, r2Bucket);

      if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);

      // 1. Upload to R2 as draft
      const contentBuffer = new TextEncoder().encode(content || '');
      await r2Binding.put(r2Key, contentBuffer, {
        httpMetadata: { contentType: content_type }
      });

      // 2. Update D1 metadata
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE cms_pages 
        SET title = COALESCE(?, title),
            updated_by = ?,
            updated_at = ?,
            r2_key = ?,
            content_size_bytes = ?,
            status = 'draft'
        WHERE id = ? AND tenant_id = ?
      `).bind(
        title || null, authUser.id, now, r2Key, contentBuffer.byteLength, pageId, tenantId
      ).run();

      return jsonResponse({ success: true, r2_key: r2Key, status: 'draft' });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * POST /api/cms/pages/:id/publish
   * Copy draft R2 object to published path.
   */
  if (path.endsWith('/publish') && method === 'POST') {
    const pageId = pathParts[pathParts.length - 2];
    try {
      const page = await env.DB.prepare(
        `SELECT project_id, slug, r2_bucket, content_type FROM cms_pages WHERE id = ? AND tenant_id = ?`
      ).bind(pageId, tenantId).first();

      if (!page) return jsonResponse({ error: 'Page not found' }, 404);

      const r2Bucket = page.r2_bucket || 'iam-docs';
      const draftKey = `cms/${workspaceId}/${page.project_id}/${page.slug}/draft.html`;
      const publishedKey = `cms/${workspaceId}/${page.project_id}/${page.slug}/published.html`;
      const r2Binding = getCmsR2Binding(env, r2Bucket);

      if (!r2Binding) return jsonResponse({ error: 'R2 storage unavailable' }, 503);

      // 1. Copy draft to published in R2
      // Note: Cloudflare R2 binding doesn't have a direct 'copy' yet, so we get and put.
      const draftObj = await r2Binding.get(draftKey);
      if (!draftObj) return jsonResponse({ error: 'No draft found to publish' }, 400);

      const content = await draftObj.arrayBuffer();
      await r2Binding.put(publishedKey, content, {
        httpMetadata: { contentType: page.content_type || 'text/html' }
      });

      // 2. Update D1
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE cms_pages 
        SET status = 'published',
            published_at = ?,
            published_by = ?,
            updated_at = ?,
            r2_key = ?
        WHERE id = ? AND tenant_id = ?
      `).bind(
        now, authUser.id, now, publishedKey, pageId, tenantId
      ).run();

      return jsonResponse({ success: true, status: 'published', r2_key: publishedKey });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  /**
   * DELETE /api/cms/pages/:id
   * Soft delete page.
   */
  if (pageIdMatch && method === 'DELETE') {
    const pageId = pageIdMatch[1];
    try {
      const now = Math.floor(Date.now() / 1000);
      await env.DB.prepare(`
        UPDATE cms_pages 
        SET status = 'archived',
            archived_at = ?,
            updated_at = ?
        WHERE id = ? AND tenant_id = ?
      `).bind(now, now, pageId, tenantId).run();

      return jsonResponse({ success: true, status: 'archived' });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  return jsonResponse({ error: 'CMS route not found' }, 404);
}
