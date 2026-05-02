/**
 * API Service: R2 Storage Operations
 * Handles bucket management, object CRUD, search, and cross-bucket sync.
 * Deconstructed from legacy worker.js.
 */

import { getAuthUser, jsonResponse } from '../core/auth';
import { insertAiGenerationLog } from './telemetry';

/**
 * Primary router for all R2-related API requests.
 */
export async function handleR2Api(request, url, env) {
  const path = url.pathname.replace(/\/$/, '') || '/';
  const pathLower = path.toLowerCase();
  const method = (request.method || 'GET').toUpperCase();

  // 1. Buckets & Inventory
  if (pathLower === '/api/r2/buckets' && method === 'GET') {
    return jsonResponse({ buckets: listBoundR2BucketNames(env) });
  }

  if (pathLower === '/api/r2/stats' && method === 'GET' && url.searchParams.get('bucket')) {
    const b = url.searchParams.get('bucket').trim();
    const stats = await r2LiveBucketStats(env, b);
    if (!stats.ok) {
      return jsonResponse({ error: stats.error || 'stats_failed', bucket: b }, stats.status || 400);
    }
    return jsonResponse({ bucket: b, object_count: stats.count, total_bytes: stats.bytes });
  }

  if (pathLower === '/api/r2/sync' && method === 'POST') {
    let syncBody = {};
    try {
      syncBody = await request.clone().json();
    } catch (_) {
      syncBody = {};
    }
    const source_bucket = syncBody.source_bucket != null ? String(syncBody.source_bucket).trim() : '';
    const dest_bucket = syncBody.dest_bucket != null ? String(syncBody.dest_bucket).trim() : '';
    const syncPrefix = syncBody.prefix != null ? String(syncBody.prefix) : '';
    
    if (source_bucket && dest_bucket) {
      const srcBind = getR2Binding(env, source_bucket);
      const dstBind = getR2Binding(env, dest_bucket);
      if (!srcBind || !dstBind) {
        return jsonResponse({ error: 'Source or destination bucket binding missing', source_bucket, dest_bucket }, 400);
      }
      
      let copied = 0;
      let bytes = 0;
      const errors = [];
      let cursor;
      do {
        const list = await srcBind.list({ prefix: syncPrefix, limit: 1000, cursor });
        for (const o of list.objects || []) {
          if (o.key.endsWith('/')) continue;
          try {
            const obj = await srcBind.get(o.key);
            if (!obj) continue;
            const buf = await obj.arrayBuffer();
            const ct = obj.httpMetadata?.contentType || getContentTypeFromKey(o.key) || 'application/octet-stream';
            await dstBind.put(o.key, buf, { httpMetadata: { contentType: ct } });
            copied++;
            bytes += buf.byteLength;
          } catch (e) {
            errors.push({ key: o.key, error: String(e?.message || e) });
          }
        }
        cursor = list.truncated ? list.cursor : undefined;
      } while (cursor);
      return jsonResponse({ ok: true, copied, bytes, errors: errors.length ? errors : undefined });
    }
  }

  // 2. Object Management
  if (pathLower === '/api/r2/list' && method === 'GET') {
    const bucket = url.searchParams.get('bucket');
    const prefix = url.searchParams.get('prefix') || '';
    const recursive = url.searchParams.get('recursive') === '1' || url.searchParams.get('recursive') === 'true';
    const limitParam = Math.min(5000, Math.max(1, parseInt(url.searchParams.get('limit') || '1000', 10) || 1000));
    
    if (!bucket) return jsonResponse({ error: 'bucket required' }, 400);
    const binding = getR2Binding(env, bucket);
    
    if (binding && binding.list) {
      if (recursive) {
        const allObjects = [];
        let cursor;
        do {
          const pageLimit = Math.min(1000, limitParam - allObjects.length);
          if (pageLimit <= 0) break;
          const list = await binding.list({ prefix, limit: pageLimit, cursor });
          for (const o of list.objects || []) {
            if (o.key.endsWith('/')) continue;
            allObjects.push({
              key: o.key,
              size: o.size ?? 0,
              last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
            });
            if (allObjects.length >= limitParam) break;
          }
          cursor = list.truncated ? list.cursor : undefined;
        } while (cursor && allObjects.length < limitParam);
        return jsonResponse({ objects: allObjects, prefixes: [] });
      }
      
      const list = await binding.list({ prefix, delimiter: '/', limit: limitParam });
      const objects = (list.objects || []).filter(o => !o.key.endsWith('/')).map(o => ({
        key: o.key,
        size: o.size ?? 0,
        last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
      }));
      return jsonResponse({ objects, prefixes: list.rolledUpPrefixes || [] });
    }
    
    // S3 Compatibility Fallback
    const signed = await signR2Request('GET', bucket, '', recursive 
      ? buildR2Query({ 'list-type': '2', prefix, 'max-keys': String(Math.min(1000, limitParam)) })
      : buildR2Query({ 'list-type': '2', prefix, delimiter: '/', 'max-keys': String(Math.min(1000, limitParam)) }), 
      env
    );
    if (!signed) return jsonResponse({ error: 'Bucket not bound and credentials missing' }, 400);
    
    const listResp = await fetch(signed.endpoint, { method: 'GET', headers: signed.headers });
    if (!listResp.ok) return jsonResponse({ error: 'R2 list failed', status: listResp.status }, 400);
    
    const parsed = parseListObjectsV2Xml(await listResp.text());
    return jsonResponse({ 
      objects: parsed.objects.map(o => ({ key: o.key, size: o.size, last_modified: o.lastModified })),
      prefixes: parsed.prefixes || []
    });
  }

  if (pathLower === '/api/r2/search' && method === 'GET') {
    const bucket = url.searchParams.get('bucket');
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const keyPrefix = (url.searchParams.get('prefix') || '').trim();
    if (!bucket) return jsonResponse({ error: 'bucket required' }, 400);
    const binding = getR2Binding(env, bucket);
    if (!binding || !binding.list) return jsonResponse({ objects: [] });
    
    const allObjects = [];
    let cursor;
    do {
      const list = await binding.list({ prefix: keyPrefix, limit: 500, cursor });
      for (const o of list.objects || []) {
        if (o.key.endsWith('/')) continue;
        if (q.length >= 2 && !o.key.toLowerCase().includes(q)) continue;
        allObjects.push({
          key: o.key,
          path: o.key,
          name: o.key.split('/').pop() || o.key,
          size: o.size ?? 0,
          last_modified: o.uploaded ? new Date(o.uploaded).toISOString() : null,
        });
        if (allObjects.length >= 100) break;
      }
      cursor = list.truncated ? list.cursor : undefined;
    } while (cursor && allObjects.length < 100);
    return jsonResponse({ objects: allObjects });
  }

  if (pathLower === '/api/r2/upload' && method === 'POST') {
    const bucket = url.searchParams.get('bucket');
    const key = url.searchParams.get('key') || `upload/${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    if (!bucket) return jsonResponse({ error: 'bucket required' }, 400);
    const binding = getR2Binding(env, bucket);
    if (!binding) return jsonResponse({ error: 'Bucket not bound' }, 400);
    
    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
    const body = await request.arrayBuffer();
    await binding.put(key, body, { httpMetadata: { contentType } });
    
    void insertAiGenerationLog(env, {
      generationType: 'r2_upload',
      responseText: `${bucket}:${key}`,
      metadataJson: { key, byte_length: body.byteLength, content_type: contentType }
    });
    
    return jsonResponse({ ok: true, key, url: `${url.origin}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}` });
  }

  if (pathLower === '/api/r2/delete' && method === 'DELETE') {
    const bucket = url.searchParams.get('bucket');
    const key = url.searchParams.get('key');
    if (!bucket || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
    const binding = getR2Binding(env, bucket);
    if (!binding) return jsonResponse({ error: 'Bucket not bound' }, 400);
    await binding.delete(key);
    return jsonResponse({ deleted: true, bucket, key });
  }

  if (pathLower === '/api/r2/url' && method === 'GET') {
    const bucket = url.searchParams.get('bucket');
    const key = url.searchParams.get('key');
    const exp = parseInt(url.searchParams.get('expires') || '3600', 10);
    if (!bucket || !key) return jsonResponse({ error: 'bucket and key required' }, 400);
    
    const workerUrl = `${url.origin}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
    const presigned = await presignR2GetObjectUrl(env, bucket, key, exp);
    return jsonResponse({ url: workerUrl, presigned_s3_url: presigned });
  }

  // 3. Dynamic Sub-routes
  const bucketsObjectsMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/objects$/i);
  if (bucketsObjectsMatch && method === 'GET') {
    const name = decodeURIComponent(bucketsObjectsMatch[1]);
    if (!env.DB) return jsonResponse({ error: 'DB not configured' }, 503);
    const { results } = await env.DB.prepare('SELECT * FROM r2_object_inventory WHERE bucket_name = ? ORDER BY object_key').bind(name).all();
    return jsonResponse({ objects: results || [] });
  }

  const objectKeyMatch = path.match(/^\/api\/r2\/buckets\/([^/]+)\/object\/(.+)$/i);
  if (objectKeyMatch) {
    const name = decodeURIComponent(objectKeyMatch[1]);
    const key = decodeURIComponent(objectKeyMatch[2]);
    const binding = getR2Binding(env, name);
    
    if (method === 'GET') {
      if (binding) {
        const obj = await binding.get(key);
        if (!obj) return jsonResponse({ error: 'Not found' }, 404);
        const headers = new Headers();
        if (obj.etag) headers.set('ETag', obj.etag);
        const ct = obj.httpMetadata?.contentType || getContentTypeFromKey(key) || 'application/octet-stream';
        headers.set('Content-Type', ct);
        headers.set('Content-Disposition', 'inline');
        return new Response(obj.body, { status: 200, headers });
      }
      return jsonResponse({ error: 'Bucket not bound' }, 404);
    }
    
    if (method === 'PUT') {
      if (!binding) return jsonResponse({ error: 'Bucket not bound' }, 404);
      const ct = request.headers.get('Content-Type') || getContentTypeFromKey(key) || 'application/octet-stream';
      const buf = await request.arrayBuffer();
      await binding.put(key, buf, { httpMetadata: { contentType: ct } });
      return jsonResponse({ ok: true, key });
    }
  }

  return jsonResponse({ error: 'R2 route not matched' }, 404);
}

// --- HELPER FUNCTIONS (exported for storage dashboard API) ---

export function getR2Binding(env, bucketName) {
  const map = {
    'inneranimalmedia-assets': env.ASSETS,
    autorag: env.AUTORAG_BUCKET,
    'agent-sam': env.DASHBOARD,
    dashboard: env.DASHBOARD,
    'agent-sam-sandbox-cicd': env.ASSETS,
    'iam-platform': env.R2,
    'iam-docs': env.DOCS_BUCKET,
    tools: env.DASHBOARD,
  };
  return map[bucketName] || null;
}

export function listBoundR2BucketNames(env) {
  const names = [];
  if (env.ASSETS) names.push('inneranimalmedia-assets');
  if (env.AUTORAG_BUCKET) names.push('autorag');
  if (env.DASHBOARD) {
    names.push('agent-sam');
    names.push('tools');
  }
  if (env.R2) names.push('iam-platform');
  if (env.DOCS_BUCKET) names.push('iam-docs');
  return names;
}

export async function r2LiveBucketStats(env, bucketName) {
  const binding = getR2Binding(env, bucketName);
  if (!binding || !binding.list) return { ok: false, error: 'Binding not available' };
  let cursor;
  let count = 0;
  let bytes = 0;
  do {
    const list = await binding.list({ limit: 1000, cursor });
    for (const o of list.objects || []) {
      if (o.key.endsWith('/')) continue;
      count++;
      bytes += o.size || 0;
    }
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
  return { ok: true, count, bytes };
}

function getContentTypeFromKey(key) {
  const ext = (key.split('.').pop() || '').toLowerCase().replace(/[#?].*$/, '');
  const types = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
    svg: 'image/svg+xml', ico: 'image/x-icon', bmp: 'image/bmp',
    html: 'text/html', css: 'text/css', js: 'application/javascript', mjs: 'application/javascript',
    json: 'application/json', xml: 'application/xml', txt: 'text/plain', md: 'text/markdown',
    pdf: 'application/pdf', mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  };
  return types[ext] || null;
}

// --- SIGV4 & PRE-SIGNING CORE ---

const EMPTY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

async function sha256hex(message) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacBytes(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw', typeof key === 'string' ? new TextEncoder().encode(key) : key,
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function hmacHex(key, message) {
  const bytes = await hmacBytes(key, message);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getSigningKey(secret, date, region, service) {
  const kDate = await hmacBytes('AWS4' + secret, date);
  const kRegion = await hmacBytes(kDate, region);
  const kService = await hmacBytes(kRegion, service);
  return hmacBytes(kService, 'aws4_request');
}

function getR2S3Host(env) {
  if (!env.CLOUDFLARE_ACCOUNT_ID) return null;
  return `${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`;
}

async function presignR2GetObjectUrl(env, bucket, key, expiresSeconds = 3600) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const host = getR2S3Host(env);
  if (!accessKey || !secretKey || !host) return null;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
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
  const canonicalRequest = ['GET', `/${bucket}/${encodedKey}`, canonicalQueryString, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');
  const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');
  const signature = await hmacHex(signingKey, stringToSign);
  
  return `https://${host}/${bucket}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

async function signR2Request(method, bucket, path, query, env) {
  const accessKey = env.R2_ACCESS_KEY_ID;
  const secretKey = env.R2_SECRET_ACCESS_KEY;
  const host = getR2S3Host(env);
  if (!accessKey || !secretKey || !host) return null;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const endpoint = `https://${host}/${bucket}${path}${query ? '?' + query : ''}`;
  
  const headerMap = { host, 'x-amz-content-sha256': EMPTY_HASH, 'x-amz-date': amzDate };
  const sortedKeys = Object.keys(headerMap).sort();
  const canonicalHeaders = sortedKeys.map(k => `${k}:${headerMap[k]}\n`).join('');
  const signedHeaders = sortedKeys.join(';');
  const canonicalRequest = [method, `/${bucket}${path}`, query || '', canonicalHeaders, signedHeaders, EMPTY_HASH].join('\n');
  
  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, await sha256hex(canonicalRequest)].join('\n');
  const signingKey = await getSigningKey(secretKey, dateStamp, 'auto', 's3');
  const signature = await hmacHex(signingKey, stringToSign);
  
  return {
    endpoint,
    headers: { ...headerMap, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}` }
  };
}

function parseListObjectsV2Xml(xml) {
  const objects = [];
  const prefixes = [];
  const contentsBlocks = xml.match(/<Contents>[\s\S]*?<\/Contents>/g) || [];
  for (const block of contentsBlocks) {
    const key = (block.match(/<Key>([^<]*)<\/Key>/) || [])[1] || '';
    const size = parseInt((block.match(/<Size>([^<]*)<\/Size>/) || [])[1] || '0', 10);
    const lastModified = (block.match(/<LastModified>([^<]*)<\/LastModified>/) || [])[1] || null;
    objects.push({ key, size, lastModified });
  }
  const prefixBlocks = xml.match(/<CommonPrefixes>[\s\S]*?<\/CommonPrefixes>/g) || [];
  for (const block of prefixBlocks) {
    const prefix = (block.match(/<Prefix>([^<]*)<\/Prefix>/) || [])[1];
    if (prefix) prefixes.push(prefix);
  }
  return { objects, prefixes };
}

function buildR2Query(params) {
  const keys = Object.keys(params).filter(k => params[k] != null && params[k] !== '');
  keys.sort();
  return keys.map(k => k + '=' + encodeURIComponent(params[k])).join('&');
}
