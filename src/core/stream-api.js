/**
 * Cloudflare Stream — list + import to R2 (platform CLOUDFLARE_STREAM_TOKEN).
 */

export function getStreamCredentials(env) {
  const token = String(env?.CLOUDFLARE_STREAM_TOKEN || env?.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = String(env?.CLOUDFLARE_ACCOUNT_ID || '').trim();
  if (!token) throw new Error('CLOUDFLARE_STREAM_TOKEN not configured');
  if (!accountId) throw new Error('CLOUDFLARE_ACCOUNT_ID not configured');
  return { token, accountId };
}

export async function listStreamVideos(env, { limit = 100 } = {}) {
  const { token, accountId } = getStreamCredentials(env);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream?limit=${Math.min(limit, 100)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.[0]?.message || `Stream list HTTP ${res.status}`;
    throw new Error(msg);
  }
  return {
    videos: data.result || [],
    total: data.result_info?.total_count ?? (data.result || []).length,
    customerSubdomain: data.result?.[0]?.playback?.hls
      ? new URL(data.result[0].playback.hls).host
      : null,
  };
}

async function streamApiFetch(env, path, init = {}) {
  const { token, accountId } = getStreamCredentials(env);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.[0]?.message || `Stream API HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result;
}

export async function resolveStreamDownloadUrl(env, uid, { maxWaitMs = 45_000 } = {}) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('stream uid required');

  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    let downloads = await streamApiFetch(env, `/stream/${id}/downloads`);
    const def = downloads?.default;
    if (def?.status === 'ready' && def.url) return def.url;
    if (!def || def.status === 'error') {
      await streamApiFetch(env, `/stream/${id}/downloads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    }
    await new Promise((r) => setTimeout(r, 2000));
    downloads = await streamApiFetch(env, `/stream/${id}/downloads`);
    if (downloads?.default?.status === 'ready' && downloads.default.url) {
      return downloads.default.url;
    }
  }
  throw new Error('Stream download not ready in time');
}

/**
 * Copy Stream VOD bytes into ASSETS (inneranimalmedia) and return { bucket, object_key, size_bytes }.
 */
export async function importStreamVideoToR2(env, { uid, objectKey, bucketBinding = 'ASSETS' }) {
  const downloadUrl = await resolveStreamDownloadUrl(env, uid);
  const videoRes = await fetch(downloadUrl);
  if (!videoRes.ok) {
    throw new Error(`Stream download fetch failed HTTP ${videoRes.status}`);
  }
  const bytes = await videoRes.arrayBuffer();
  const bucket = env[bucketBinding];
  if (!bucket?.put) throw new Error(`${bucketBinding} R2 binding missing`);

  const key = String(objectKey || '').trim();
  if (!key) throw new Error('object_key required');

  const contentType = videoRes.headers.get('content-type') || 'video/mp4';
  await bucket.put(key, bytes, {
    httpMetadata: { contentType },
  });

  return {
    bucket: 'inneranimalmedia',
    object_key: key,
    size_bytes: bytes.byteLength,
    content_type: contentType,
  };
}

export async function getStreamWebhook(env) {
  return streamApiFetch(env, '/stream/webhook', { method: 'GET' });
}

export async function putStreamWebhook(env, notificationUrl) {
  const url = String(notificationUrl || '').trim();
  if (!url) throw new Error('notificationUrl required');
  return streamApiFetch(env, '/stream/webhook', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ notificationUrl: url }),
  });
}

export async function createLiveInput(env, opts = {}) {
  const name = String(opts.name || 'MovieMode Live').trim();
  const recordingMode = String(opts.recording_mode || 'automatic').trim();
  const meta = opts.meta && typeof opts.meta === 'object' ? opts.meta : { name };
  return streamApiFetch(env, '/stream/live_inputs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      meta,
      recording: {
        mode: recordingMode === 'off' ? 'off' : 'automatic',
        hideLiveViewerCount: false,
        requireSignedURLs: false,
        timeoutSeconds: 0,
      },
      enabled: opts.enabled !== false,
    }),
  });
}

export async function listLiveInputs(env, { limit = 50 } = {}) {
  const result = await streamApiFetch(
    env,
    `/stream/live_inputs?limit=${Math.min(Number(limit) || 50, 100)}`,
  );
  if (Array.isArray(result)) return result;
  return result?.liveInputs || [];
}

export async function getLiveInput(env, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('live input uid required');
  return streamApiFetch(env, `/stream/live_inputs/${id}`);
}

export async function deleteLiveInput(env, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('live input uid required');
  const { token, accountId } = getStreamCredentials(env);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/live_inputs/${id}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.[0]?.message || `Stream delete HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result;
}

export async function getStreamVideoDetail(env, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid required');
  return streamApiFetch(env, `/stream/${id}`);
}

export async function updateStreamVideoDetail(env, uid, patch = {}) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid required');
  const body = {};
  if (patch.meta && typeof patch.meta === 'object') body.meta = patch.meta;
  if (patch.requireSignedURLs !== undefined) body.requireSignedURLs = !!patch.requireSignedURLs;
  if (Array.isArray(patch.allowedOrigins)) body.allowedOrigins = patch.allowedOrigins;
  if (patch.thumbnailTimestampPct !== undefined) {
    body.thumbnailTimestampPct = Number(patch.thumbnailTimestampPct) || 0;
  }
  return streamApiFetch(env, `/stream/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteStreamVideo(env, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid required');
  const { token, accountId } = getStreamCredentials(env);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.[0]?.message || `Stream delete HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result ?? { deleted: true };
}

export async function getStreamDownloads(env, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid required');
  return streamApiFetch(env, `/stream/${id}/downloads`);
}

export async function enableStreamDownloads(env, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid required');
  return streamApiFetch(env, `/stream/${id}/downloads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export async function deleteStreamDownloads(env, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid required');
  const { token, accountId } = getStreamCredentials(env);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${id}/downloads`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.[0]?.message || `Stream downloads delete HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result ?? { deleted: true };
}

export async function listStreamCaptions(env, uid) {
  const id = String(uid || '').trim();
  if (!id) throw new Error('uid required');
  const result = await streamApiFetch(env, `/stream/${id}/captions`);
  return Array.isArray(result) ? result : result?.captions || [];
}

export async function putStreamCaption(env, uid, language, vttText) {
  const id = String(uid || '').trim();
  const lang = String(language || '').trim();
  if (!id || !lang) throw new Error('uid and language required');
  const { token, accountId } = getStreamCredentials(env);
  const form = new FormData();
  form.append('file', new Blob([String(vttText || '')], { type: 'text/vtt' }), `${lang}.vtt`);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${id}/captions/${lang}`,
    { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: form },
  );
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.[0]?.message || `Stream caption upload HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result;
}

export async function deleteStreamCaption(env, uid, language) {
  const id = String(uid || '').trim();
  const lang = String(language || '').trim();
  if (!id || !lang) throw new Error('uid and language required');
  const { token, accountId } = getStreamCredentials(env);
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${id}/captions/${lang}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const msg = data.errors?.[0]?.message || `Stream caption delete HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data.result ?? { deleted: true };
}

export async function copyStreamVideoFromUrl(env, { url, meta, requireSignedURLs } = {}) {
  const src = String(url || '').trim();
  if (!src) throw new Error('url required');
  const body = { url: src };
  if (meta && typeof meta === 'object') body.meta = meta;
  if (requireSignedURLs !== undefined) body.requireSignedURLs = !!requireSignedURLs;
  return streamApiFetch(env, `/stream/copy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function createStreamDirectUpload(
  env,
  { maxDurationSeconds = 3600, meta, requireSignedURLs } = {},
) {
  const body = { maxDurationSeconds: Number(maxDurationSeconds) || 3600 };
  if (meta && typeof meta === 'object') body.meta = meta;
  if (requireSignedURLs !== undefined) body.requireSignedURLs = !!requireSignedURLs;
  return streamApiFetch(env, `/stream/direct_upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** CF Stream watch/embed/manifest URLs — host MUST come from playback HLS, never accountId. */
export function resolveStreamCustomerHost(videoOrPlayback, accountId) {
  const playback =
    videoOrPlayback?.playback && typeof videoOrPlayback.playback === 'object'
      ? videoOrPlayback.playback
      : videoOrPlayback;
  const hls = playback?.hls || videoOrPlayback?.preview || '';
  if (hls && /^https?:\/\//.test(String(hls))) {
    try {
      return new URL(String(hls)).host;
    } catch {
      /* fall through */
    }
  }
  const preview = videoOrPlayback?.preview;
  if (preview && /^https?:\/\//.test(String(preview))) {
    try {
      return new URL(String(preview)).host;
    } catch {
      /* fall through */
    }
  }
  // Optional operator override — accountId is NOT a valid customer subdomain code.
  void accountId;
  return null;
}

/**
 * @param {string} uid
 * @param {{ customerSubdomain?: string|null, video?: object, accountId?: string }} [opts]
 */
export function buildStreamWatchUrls(uid, opts = {}) {
  const id = String(uid || '').trim();
  const host =
    String(opts.customerSubdomain || '').trim() ||
    resolveStreamCustomerHost(opts.video, opts.accountId) ||
    null;
  if (!id || !host) {
    return {
      customer_subdomain: host,
      watch_url: null,
      iframe_url: null,
      hls: null,
      dash: null,
      thumbnail: null,
      url_error: host
        ? null
        : 'customer_subdomain unresolved — wait for Stream playback.hls before embedding',
    };
  }
  return {
    customer_subdomain: host,
    watch_url: `https://${host}/${id}/watch`,
    iframe_url: `https://${host}/${id}/iframe`,
    hls: `https://${host}/${id}/manifest/video.m3u8`,
    dash: `https://${host}/${id}/manifest/video.mpd`,
    thumbnail: `https://${host}/${id}/thumbnails/thumbnail.jpg?time=0s&height=360`,
    url_error: null,
  };
}

export function mapStreamVideoRow(v, accountId) {
  const uid = String(v.uid || '');
  const host = resolveStreamCustomerHost(v, accountId);
  const urls = buildStreamWatchUrls(uid, { customerSubdomain: host, video: v, accountId });
  const hls = v.playback?.hls || urls.hls || '';
  return {
    uid,
    name: v.meta?.name || v.meta?.filename || uid,
    duration_sec: typeof v.duration === 'number' ? v.duration : null,
    size_bytes: typeof v.size === 'number' ? v.size : null,
    ready: !!v.readyToStream,
    require_signed_urls: !!v.requireSignedURLs,
    thumbnail: v.thumbnail || urls.thumbnail,
    hls: hls || null,
    dash: urls.dash,
    watch_url: urls.watch_url,
    iframe_url: urls.iframe_url,
    customer_subdomain: urls.customer_subdomain,
    created: v.created || null,
    status: v.status?.state || null,
    url_error: urls.url_error,
  };
}
