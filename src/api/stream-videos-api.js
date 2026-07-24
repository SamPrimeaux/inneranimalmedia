/**
 * Cloudflare Stream video detail API — Settings / Downloads / Captions / Embed / JSON / Public
 * Details / Tags. Mounted under /api/stream/videos/:uid/* (and /api/stream/from-url,
 * /api/stream/direct-upload) from src/api/moviemode-api.js, which already owns auth +
 * workspace/tenant resolution for the whole /api/stream/* prefix (see production-dispatch.js).
 *
 * GET    /api/stream/videos/:uid                     — full detail (watch_url, iframe_url, hls, dash, thumbnail, meta, tags)
 * PATCH  /api/stream/videos/:uid                      { name?, tags?, require_signed_urls?, allowed_origins?, thumbnail_timestamp_pct? }
 * DELETE /api/stream/videos/:uid
 * GET    /api/stream/videos/:uid/downloads
 * POST   /api/stream/videos/:uid/downloads             — enable default MP4 download
 * DELETE /api/stream/videos/:uid/downloads
 * GET    /api/stream/videos/:uid/captions
 * POST   /api/stream/videos/:uid/captions              { language, vtt }
 * DELETE /api/stream/videos/:uid/captions/:language
 * GET    /api/stream/videos/:uid/public-details
 * PATCH  /api/stream/videos/:uid/public-details         { title?, logo?, share?, channel_link? }
 * GET    /api/stream/videos/:uid/embed                  — embed config + live iframe snippet
 * PATCH  /api/stream/videos/:uid/embed                  { poster_time?, start_time?, controls?, autoplay?, loop?, preload?, muted?, lazy?, primary_color? }
 * GET    /api/stream/videos/:uid/json                   — curl example + live GET response body
 * GET    /api/stream/videos/:uid/tags
 * PATCH  /api/stream/videos/:uid/tags                   { tags: string[] }
 * POST   /api/stream/from-url                           { url, name?, meta?, require_signed_urls? } — Stream copy-from-URL
 * POST   /api/stream/direct-upload                      { max_duration_seconds?, name?, meta?, require_signed_urls? }
 *
 * IAM meta convention — Cloudflare Stream has no native tags / public-details endpoints (unlike
 * CF Images resource tags). `meta` on a Stream video is the only freeform per-video JSON store, so:
 *   meta.iam_tags            = comma-joined string (split on read; same shape as CF Images iam_tags)
 *   meta.iam_public_details  = { title, logo, share, channel_link }
 *   meta.iam_embed           = { poster_time, start_time, controls, autoplay, loop, preload, muted, lazy, primary_color }
 * This is a deliberate parity shim, not a Cloudflare-native feature — documented here so nobody
 * mistakes iam_* meta keys for CF platform fields when reading Stream API responses directly.
 */

import { jsonResponse } from '../core/auth.js';
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

function parseTagsInput(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return [];
}

function mapDetail(video, accountId) {
  const uid = String(video?.uid || '');
  const meta = video?.meta || {};
  const urls = buildStreamWatchUrls(uid, accountId);
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
    tags: parseTagsInput(meta.iam_tags),
    public_details: meta.iam_public_details || {},
    embed: meta.iam_embed || {},
    meta,
    playback: video?.playback || {},
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
      return jsonResponse({ ok: true, video: mapDetail(result, accountId) });
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
        return jsonResponse({ ok: true, video: mapDetail(video, accountId) });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(request);
        const current = await getStreamVideoDetail(env, uid);
        const meta = { ...(current?.meta || {}) };
        if (body.name !== undefined) meta.name = String(body.name || '').trim();
        if (body.tags !== undefined) meta.iam_tags = parseTagsInput(body.tags).join(',');
        const updated = await updateStreamVideoDetail(env, uid, {
          meta,
          requireSignedURLs: body.require_signed_urls,
          allowedOrigins: body.allowed_origins,
          thumbnailTimestampPct: body.thumbnail_timestamp_pct,
        });
        return jsonResponse({ ok: true, video: mapDetail(updated, accountId) });
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
      const urls = buildStreamWatchUrls(uid, accountId);
      if (method === 'GET') {
        const embed = current?.meta?.iam_embed || {};
        return jsonResponse({
          ok: true,
          embed,
          iframe_url: urls.iframe_url,
          iframe_snippet: `<iframe src="${urls.iframe_url}" style="border:none" height="720" width="1280" allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;" allowfullscreen="true"></iframe>`,
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
      const current = await getStreamVideoDetail(env, uid);
      if (method === 'GET') {
        return jsonResponse({ ok: true, tags: parseTagsInput(current?.meta?.iam_tags) });
      }
      if (method === 'PATCH') {
        const body = await readJsonBody(request);
        const tags = parseTagsInput(body.tags);
        const meta = { ...(current?.meta || {}), iam_tags: tags.join(',') };
        const updated = await updateStreamVideoDetail(env, uid, { meta });
        return jsonResponse({ ok: true, tags: parseTagsInput(updated?.meta?.iam_tags) });
      }
    }

    return jsonResponse({ error: 'Stream video route not matched' }, 404);
  } catch (e) {
    return jsonResponse({ ok: false, error: String(e?.message || e).slice(0, 400) }, 502);
  }
}
