/**
 * Persistence Layer: R2 Storage
 * Handles Cloudflare R2 and S3-failover logic.
 * Deconstructed from legacy worker.js.
 */

/**
 * Returns the S3-compatible host for R2.
 */
export function getR2S3Host(env) {
  if (!env || env.CLOUDFLARE_ACCOUNT_ID == null) return null;
  const id = String(env.CLOUDFLARE_ACCOUNT_ID).trim();
  return id ? `${id}.r2.cloudflarestorage.com` : null;
}

/**
 * Store agent/browser tool screenshots.
 */
export async function putAgentBrowserScreenshotToR2(env, buf, contentType) {
  const ct = contentType || 'image/png';
  const blen = buf?.byteLength ?? buf?.length ?? 0;
  
  const bucket = env.DOCS_BUCKET || env.DASHBOARD || env.R2;
  if (!bucket) throw new Error('No R2 bucket available for screenshots');

  const ts = Date.now();
  const id = crypto.randomUUID();
  const key = `screenshots/agent/${ts}-${id}.png`;
  
  await bucket.put(key, buf, { httpMetadata: { contentType: ct } });
  
  const baseUrl = env.DOCS_BUCKET ? 'https://docs.inneranimalmedia.com' : 'https://pub-b845a8f899834f0faf95dc83eda3c505.r2.dev';
  return { screenshot_url: `${baseUrl}/${key}`, job_id: id };
}

// --- S3 Failover & Signing Helpers ---

async function sha256hex(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacBytes(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function hmacHex(key, message) {
  const sig = await hmacBytes(key, message);
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secret, date, region, service) {
  const kDate = await hmacBytes('AWS4' + secret, date);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}

function r2ObjectPathForS3(key) {
  const k = String(key || '').replace(/^\/+/, '');
  if (!k) return '';
  return `/${k.split('/').map((s) => encodeURIComponent(s)).join('/')}`;
}

/** SigV4 for R2 S3 API. */
export async function signR2Request(method, bucket, path, query, env, payloadOpts = null) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  if (!accessKey || !secretKey) return null;
  const host = getR2S3Host(env);
  if (!host) return null;
  const region = 'auto';
  const service = 's3';
  const endpoint = `https://${host}/${bucket}${path}${query ? '?' + query : ''}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);

  const payload = payloadOpts?.body || '';
  const bodyBytes = typeof payload === 'string' ? new TextEncoder().encode(payload) : payload;
  const payloadHash = await sha256hex(bodyBytes);

  const headerMap = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (bodyBytes.length > 0) {
    headerMap['content-type'] = payloadOpts?.contentType || 'application/octet-stream';
    headerMap['content-length'] = bodyBytes.byteLength.toString();
  }

  const sortedKeys = Object.keys(headerMap).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${headerMap[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');
  const canonicalRequest = [method, `/${bucket}${path}`, query || '', canonicalHeaders, signedHeaders, payloadHash].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');

  const signingKey = await getSigningKey(secretKey, dateStamp, region, service);
  const signature = await hmacHex(signingKey, stringToSign);

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const fetchHeaders = {
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization: authHeader,
  };
  if (bodyBytes.length > 0) {
    fetchHeaders['content-type'] = headerMap['content-type'];
    fetchHeaders['content-length'] = headerMap['content-length'];
  }

  return { endpoint, headers: fetchHeaders, bodyBytes };
}

export async function r2GetViaBindingOrS3(env, binding, s3BucketName, key) {
  const fetched = await r2FetchObjectViaBindingOrS3(env, binding, s3BucketName, key);
  if (!fetched) return null;
  const text = new TextDecoder().decode(fetched.body);
  return { text: async () => text };
}

/** Fetch object bytes + metadata via Worker binding or account S3 API. */
export async function r2FetchObjectViaBindingOrS3(env, binding, s3BucketName, key) {
  if (binding?.get) {
    const obj = await binding.get(key);
    if (!obj) return null;
    const body = await obj.arrayBuffer();
    return {
      body,
      contentType: obj.httpMetadata?.contentType || null,
      etag: obj.etag || null,
    };
  }
  if (!s3BucketName || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null;
  const path = r2ObjectPathForS3(key);
  const signed = await signR2Request('GET', s3BucketName, path, '', env);
  if (!signed) return null;
  const res = await fetch(signed.endpoint, { method: 'GET', headers: signed.headers });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const body = await res.arrayBuffer();
  return {
    body,
    contentType: res.headers.get('content-type'),
    etag: res.headers.get('etag'),
  };
}

export async function r2PutViaBindingOrS3(env, binding, s3BucketName, key, body, contentType) {
  const ct = contentType || 'application/octet-stream';
  if (binding && binding.put) {
    await binding.put(key, body, { httpMetadata: { contentType: ct } });
    return true;
  }
  if (!s3BucketName || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return false;
  const path = r2ObjectPathForS3(key);
  const signed = await signR2Request('PUT', s3BucketName, path, '', env, { body, contentType: ct });
  if (!signed) return false;
  const res = await fetch(signed.endpoint, {
    method: 'PUT',
    headers: signed.headers,
    body: signed.bodyBytes.byteLength ? signed.bodyBytes : undefined,
  });
  return res.ok;
}

export async function r2DeleteViaBindingOrS3(env, binding, s3BucketName, key) {
  if (binding && binding.delete) {
    await binding.delete(key);
    return true;
  }
  if (!s3BucketName || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return false;
  const path = r2ObjectPathForS3(key);
  const signed = await signR2Request('DELETE', s3BucketName, path, '', env);
  if (!signed) return false;
  const res = await fetch(signed.endpoint, { method: 'DELETE', headers: signed.headers });
  return res.ok;
}

/** HeadObject — metadata without body (binding head() or S3 HEAD). */
export async function r2HeadViaBindingOrS3(env, binding, s3BucketName, key) {
  if (binding?.head) {
    const obj = await binding.head(key);
    if (!obj) return null;
    return {
      key,
      size: obj.size ?? null,
      contentType: obj.httpMetadata?.contentType || null,
      etag: obj.etag || null,
      last_modified: obj.uploaded ? new Date(obj.uploaded).toISOString() : null,
    };
  }
  if (!s3BucketName || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return null;
  const path = r2ObjectPathForS3(key);
  const signed = await signR2Request('HEAD', s3BucketName, path, '', env);
  if (!signed) return null;
  const res = await fetch(signed.endpoint, { method: 'HEAD', headers: signed.headers });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  const lm = res.headers.get('last-modified');
  return {
    key,
    size: parseInt(res.headers.get('content-length') || '0', 10) || null,
    contentType: res.headers.get('content-type'),
    etag: res.headers.get('etag'),
    last_modified: lm || null,
  };
}

/** DeleteObjects — bulk delete (binding accepts array; S3 DeleteObjects XML). */
export async function r2DeleteManyViaBindingOrS3(env, binding, s3BucketName, keys) {
  const unique = [...new Set((keys || []).map((k) => String(k || '').trim()).filter(Boolean))];
  if (!unique.length) return { deleted: 0, errors: [] };

  if (binding?.delete) {
    await binding.delete(unique);
    return { deleted: unique.length, errors: [] };
  }

  if (!s3BucketName || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    return { deleted: 0, errors: unique.map((key) => ({ key, error: 'no_binding_or_credentials' })) };
  }

  const errors = [];
  let deleted = 0;
  const chunkSize = 1000;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const objectsXml = chunk.map((k) => `<Object><Key>${escapeXmlText(k)}</Key></Object>`).join('');
    const body = `<?xml version="1.0" encoding="UTF-8"?><Delete>${objectsXml}</Delete>`;
    const signed = await signR2Request('POST', s3BucketName, '', 'delete=', env, {
      body,
      contentType: 'application/xml',
    });
    if (!signed) {
      for (const key of chunk) errors.push({ key, error: 'sign_failed' });
      continue;
    }
    const res = await fetch(signed.endpoint, {
      method: 'POST',
      headers: signed.headers,
      body: signed.bodyBytes.byteLength ? signed.bodyBytes : undefined,
    });
    if (!res.ok) {
      for (const key of chunk) errors.push({ key, error: `delete_objects_${res.status}` });
      continue;
    }
    const xml = await res.text();
    const errBlocks = xml.match(/<Error>[\s\S]*?<\/Error>/g) || [];
    for (const block of errBlocks) {
      const ek = (block.match(/<Key>([^<]*)<\/Key>/) || [])[1];
      const code = (block.match(/<Code>([^<]*)<\/Code>/) || [])[1] || 'Error';
      if (ek) errors.push({ key: ek, error: code });
    }
    const deletedInChunk = chunk.length - errBlocks.length;
    deleted += Math.max(0, deletedInChunk);
  }
  return { deleted, errors };
}

function escapeXmlText(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildS3ListQuery(prefix, limit) {
  const params = {
    'list-type': '2',
    prefix: prefix || '',
    'max-keys': String(Math.max(1, Number(limit) || 100)),
  };
  const keys = Object.keys(params).sort();
  return keys.map((k) => `${k}=${encodeURIComponent(params[k])}`).join('&');
}

export async function r2ListViaBindingOrS3(env, binding, s3BucketName, prefix, limit) {
  const lim = Math.max(1, Number(limit) || 100);
  if (binding && binding.list) {
    const list = await binding.list({ prefix, limit: lim });
    return (list.objects || []).map(o => ({ key: o.key, size: o.size, last_modified: o.uploaded }));
  }

  if (!s3BucketName || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) return [];
  const query = buildS3ListQuery(prefix, lim);
  const signed = await signR2Request('GET', s3BucketName, '', query, env);
  if (!signed) return [];

  const res = await fetch(signed.endpoint, { method: 'GET', headers: signed.headers });
  if (!res.ok) return [];

  const xml = await res.text();
  const objects = [];
  const contents = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];

  for (const item of contents) {
    const key = (item.match(/<Key>([^<]*)<\/Key>/) || [])[1];
    const size = parseInt((item.match(/<Size>([^<]*)<\/Size>/) || [])[1] || '0', 10);
    const lastModified = (item.match(/<LastModified>([^<]*)<\/LastModified>/) || [])[1];
    if (key) objects.push({ key, size, last_modified: lastModified });
  }

  return objects;
}
