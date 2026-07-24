/**
 * Cloudflare Stream video detail API — Settings / Downloads / Captions / Embed / JSON / Public
 * Details / Tags. Mounted under /api/stream/videos/:uid/* (and /api/stream/from-url,
 * /api/stream/direct-upload) from src/api/moviemode-api.js.
 *
 * Tags: Cloudflare Resource Tagging with resource_type=`stream_video` (same product as Images
 * `resource_type=image` — see https://developers.cloudflare.com/resource-tagging/reference/resource-types/).
 * Public Details: Stream watch-page fields have no dedicated REST surface; stored in
 * meta.iam_public_details (not Resource Tagging). Embed prefs: meta.iam_embed.
 */

import { jsonResponse } from '../core/auth.js';
import {
  getResourceTags,
  setResourceTags,
  RESOURCE_TYPE_STREAM_VIDEO,
} from '../core/cf-resource-tags.js';
import {
  getStreamCredentials,
  getStreamVideoDetail,
  updateStreamVideoDetail,
  deleteStreamVideo,
  getStreamDownloads,
  enableStreamDownloads,
  deleteStreamDownloads,
  listStreamCaptions,
  putStreamCaption,
  deleteStreamCaption,
  copyStreamVideoFromUrl,
  createStreamDirectUpload,
  buildStreamWatchUrls,
} from '../core/stream-api.js';

const STREAM_TAG_OPTS = { resourceType: RESOURCE_TYPE_STREAM_VIDEO };

function parseLegacyTagList(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

/** Prefer Resource Tagging map; fall back to legacy meta.iam_tags list. */
function resourceTagsFromBody(body) {
  if (body?.resource_tags && typeof body.resource_tags === 'object' && !Array.isArray(body.resource_tags)) {
    return body.resource_tags;
  }
  if (body?.tags && typeof body.tags === 'object' && !Array.isArray(body.tags)) {
    return body.tags;
  }
  const list = parseLegacyTagList(body?.tags);
  if (!list.length) return {};
  const out = {};
  for (const t of list) out[t] = '';
  return out;
}

async function mapDetail(video, accountId, env) {
  const uid = String(video?.uid || '');
  const meta = video?.meta || {};
  const urls = buildStreamWatchUrls(uid, { video, accountId });
  let resource_tags = {};
  let resource_tags_error = null;
  if (env && uid) {
    const tagRes = await getResourceTags(env, uid, STREAM_TAG_OPTS).catch((e) => ({
      ok: false,
      error: String(e?.message || e),
      tags: {},
    }));
    if (tagRes.ok) resource_tags = tagRes.tags || {};
    else resource_tags_error = tagRes.error || 'Resource Tagging unavailable';
  }
  const legacy = parseLegacyTagList(meta.iam_tags);
  return {
    uid,
    name: meta.name || meta.filename || uid,
    status: video?.status?.state || null,
    ready: !!video?.readyToStream,
    duration_sec: typeof video?.duration === 'number' ? video.duration : null,
    size_bytes: typeof video?.size === 'number' ? video.size : null,
    created: video?.created || null,
    modified: video?.modified || null,
    require_signed_urls: !!video?.requireSignedURLs,
    allowed_origins: Array.isArray(video?.allowedOrigins) ? video.allowedOrigins : [],
    thumbnail_timestamp_pct: video?.thumbnailTimestampPct ?? null,
    /** @deprecated prefer resource_tags — legacy meta.iam_tags list */
    tags: Object.keys(resource_tags).length ? Object.keys(resource_tags) : legacy,
    resource_tags,
    resource_tags_error,
    public_details: meta.iam_public_details || {},
    embed: meta.iam_embed || {},
    meta,
    playback: video?.playback || {},
    account_id: accountId,
    ...urls,
  };
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

/**
 * Dispatcher for /api/stream/videos/:uid/* and /api/stream/from-url, /api/stream/direct-upload.
 * Returns null when nothing matches so the caller can fall through to its own 404.
 */
export async function handleStreamVideosDetailApi(request, url, env, _ctx, _scope = {}) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const method = (request.method || 'GET').toUpperCase();

  if (path === '/api/stream/from-url' && method === 'POST') {
    const body = await readJsonBody(request);
    const srcUrl = String(body.url || '').trim();
    if (!srcUrl) return jsonResponse({ error: 'url required' }, 400);
    try {
      const meta = { ...(body.meta || {}) };
      if (body.name) meta.name = String(body.name).trim();
      const result = await copyStreamVideoFromUrl(env, {
        url: srcUrl,
        meta,
        requireSignedURLs: body.require_signed_urls,
      });
      const { accountId } = getStreamCredentials(env);
      return jsonResponse({ ok: true, video: await mapDetail(result, accountId, env) });
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e?.message || e).slice(0, 400) }, 502);
    }
  }

  if (path === '/api/stream/direct-upload' && method === 'POST') {
    const body = await readJsonBody(request);
    try {
      const meta = { ...(body.meta || {}) };
      if (body.name) meta.name = String(body.name).trim();
      const result = await createStreamDirectUpload(env, {
        maxDurationSeconds: body.max_duration_seconds,
        meta: Object.keys(meta).length ? meta : undefined,
        requireSignedURLs: body.require_signed_urls,
      });
      return jsonResponse({
        ok: true,
        upload_url: result?.uploadURL || result?.uploadUrl || null,
        uid: result?.uid || null,
      });
    } catch (e) {
      return jsonResponse({ ok: false, error: String(e?.message || e).slice(0, 400) }, 502);
    }
  }

  const uidMatch = path.match(/^\/api\/stream\/videos\/([^/]+)(?:\/(.*))?$/);
  if (!uidMatch) return null;
  const uid = decodeURIComponent(uidMatch[1]);
  const sub = uidMatch[2] || '';
  if (!uid) return jsonResponse({ error: 'uid required' }, 400);

  try {
    const { accountId } = getStreamCredentials(env);

    if (!sub) {
      if (method === 'GET') {
        const video = await getStreamVideoDetail(env, uid);
        return jsonResponse({ ok: true, video: await mapDetail(video, accountId, env) });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(request);
        const current = await getStreamVideoDetail(env, uid);
        const meta = { ...(current?.meta || {}) };
        if (body.name !== undefined) meta.name = String(body.name || '').trim();
        // Tags no longer written via meta — use /tags → Resource Tagging.
        const updated = await updateStreamVideoDetail(env, uid, {
          meta,
          requireSignedURLs: body.require_signed_urls,
          allowedOrigins: body.allowed_origins,
          thumbnailTimestampPct: body.thumbnail_timestamp_pct,
        });
        return jsonResponse({ ok: true, video: await mapDetail(updated, accountId, env) });
      }
      if (method === 'DELETE') {
        await deleteStreamVideo(env, uid);
        return jsonResponse({ ok: true, uid });
      }
    }

    if (sub === 'downloads') {
      if (method === 'GET') {
        const downloads = await getStreamDownloads(env, uid);
        return jsonResponse({ ok: true, downloads });
      }
      if (method === 'POST') {
        const downloads = await enableStreamDownloads(env, uid);
        return jsonResponse({ ok: true, downloads });
      }
      if (method === 'DELETE') {
        await deleteStreamDownloads(env, uid);
        return jsonResponse({ ok: true, uid });
      }
    }

    if (sub === 'captions') {
      if (method === 'GET') {
        const captions = await listStreamCaptions(env, uid);
        return jsonResponse({ ok: true, captions });
      }
      if (method === 'POST') {
        const body = await readJsonBody(request);
        const language = String(body.language || '').trim();
        const vtt = String(body.vtt || body.vtt_content || '');
        if (!language || !vtt) return jsonResponse({ error: 'language and vtt required' }, 400);
        const result = await putStreamCaption(env, uid, language, vtt);
        return jsonResponse({ ok: true, caption: result });
      }
    }
    const captionDeleteMatch = sub.match(/^captions\/([^/]+)$/);
    if (captionDeleteMatch && method === 'DELETE') {
      const language = decodeURIComponent(captionDeleteMatch[1]);
      await deleteStreamCaption(env, uid, language);
      return jsonResponse({ ok: true, uid, language });
    }

    if (sub === 'public-details') {
      // Watch-page branding — NOT Resource Tagging. No Stream REST for these fields.
      const current = await getStreamVideoDetail(env, uid);
      if (method === 'GET') {
        return jsonResponse({ ok: true, public_details: current?.meta?.iam_public_details || {} });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(request);
        const meta = { ...(current?.meta || {}) };
        const prev = meta.iam_public_details || {};
        meta.iam_public_details = {
          title: body.title ?? prev.title ?? '',
          logo: body.logo ?? prev.logo ?? '',
          share: body.share ?? prev.share ?? true,
          channel_link: body.channel_link ?? prev.channel_link ?? '',
        };
        const updated = await updateStreamVideoDetail(env, uid, { meta });
        return jsonResponse({ ok: true, public_details: updated?.meta?.iam_public_details || {} });
      }
    }

    if (sub === 'embed') {
      const current = await getStreamVideoDetail(env, uid);
      const urls = buildStreamWatchUrls(uid, { video: current, accountId });
      if (method === 'GET') {
        const embed = current?.meta?.iam_embed || {};
        return jsonResponse({
          ok: true,
          embed,
          iframe_url: urls.iframe_url,
          url_error: urls.url_error,
          iframe_snippet: urls.iframe_url
            ? `<iframe src="${urls.iframe_url}" style="border:none" height="720" width="1280" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen="true"></iframe>`
            : null,
        });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(request);
        const meta = { ...(current?.meta || {}) };
        const prev = meta.iam_embed || {};
        meta.iam_embed = {
          poster_time: body.poster_time ?? prev.poster_time ?? 0,
          start_time: body.start_time ?? prev.start_time ?? 0,
          controls: body.controls ?? prev.controls ?? true,
          autoplay: body.autoplay ?? prev.autoplay ?? false,
          loop: body.loop ?? prev.loop ?? false,
          preload: body.preload ?? prev.preload ?? 'metadata',
          muted: body.muted ?? prev.muted ?? false,
          lazy: body.lazy ?? prev.lazy ?? true,
          primary_color: body.primary_color ?? prev.primary_color ?? '#f6821f',
        };
        const updated = await updateStreamVideoDetail(env, uid, { meta });
        return jsonResponse({ ok: true, embed: updated?.meta?.iam_embed || {} });
      }
    }

    if (sub === 'json' && method === 'GET') {
      const video = await getStreamVideoDetail(env, uid);
      return jsonResponse({
        ok: true,
        curl: `curl -H "Authorization: Bearer <CLOUDFLARE_STREAM_TOKEN>" https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`,
        response: video,
      });
    }

    if (sub === 'tags') {
      if (method === 'GET') {
        const tagRes = await getResourceTags(env, uid, STREAM_TAG_OPTS);
        if (!tagRes.ok && !tagRes.beta_untagged && !tagRes.empty) {
          return jsonResponse(
            { ok: false, error: tagRes.error || 'Resource Tagging GET failed', resource_tags: {} },
            tagRes.status || 502,
          );
        }
        return jsonResponse({
          ok: true,
          resource_tags: tagRes.tags || {},
          resource_type: RESOURCE_TYPE_STREAM_VIDEO,
          tags: Object.keys(tagRes.tags || {}),
        });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(request);
        const next = resourceTagsFromBody(body);
        const put = await setResourceTags(env, uid, next, STREAM_TAG_OPTS);
        if (!put.ok) {
          return jsonResponse(
            { ok: false, error: put.error || 'Resource Tagging PUT failed', resource_tags: {} },
            put.status || 502,
          );
        }
        return jsonResponse({
          ok: true,
          resource_tags: put.tags || next,
          resource_type: RESOURCE_TYPE_STREAM_VIDEO,
          tags: Object.keys(put.tags || next),
        });
      }
    }

    return jsonResponse({ error: 'Stream video route not matched' }, 404);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e).slice(0, 400) }, 502);
  }
}
