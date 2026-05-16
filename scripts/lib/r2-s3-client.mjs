/**
 * R2 S3-compatible client for Node scripts (aws4fetch — same SigV4 as @aws-sdk/client-s3).
 * Maps to PutObject, GetObject, HeadObject, ListObjectsV2, DeleteObject, DeleteObjects.
 *
 * Env: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 */
import { AwsClient } from 'aws4fetch';

export function encodeS3ObjectKey(key) {
  return String(key)
    .split('/')
    .filter((seg) => seg.length > 0)
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export function createR2S3Client(env = process.env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const client = new AwsClient({
    accessKeyId,
    secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  return { client, endpoint, accountId };
}

export function r2ObjectUrl(endpoint, bucket, key) {
  return `${endpoint}/${bucket}/${encodeS3ObjectKey(key)}`;
}

export function r2BucketListUrl(endpoint, bucket, queryParams = {}) {
  const qs = new URLSearchParams({ 'list-type': '2', ...queryParams });
  return `${endpoint}/${bucket}?${qs.toString()}`;
}

/** PutObject — create or overwrite */
export async function putR2Object(ctx, bucket, key, body, contentType = 'application/octet-stream') {
  const url = r2ObjectUrl(ctx.endpoint, bucket, key);
  const res = await ctx.client.fetch(url, {
    method: 'PUT',
    body,
    headers: { 'Content-Type': contentType },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`PutObject failed ${res.status}: ${t.slice(0, 300)}`);
  }
  return res;
}

/** GetObject */
export async function getR2Object(ctx, bucket, key) {
  const url = r2ObjectUrl(ctx.endpoint, bucket, key);
  const res = await ctx.client.fetch(url, { method: 'GET' });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GetObject failed ${res.status}: ${t.slice(0, 300)}`);
  }
  return res;
}

/** HeadObject */
export async function headR2Object(ctx, bucket, key) {
  const url = r2ObjectUrl(ctx.endpoint, bucket, key);
  const res = await ctx.client.fetch(url, { method: 'HEAD' });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`HeadObject failed ${res.status}: ${t.slice(0, 300)}`);
  }
  return {
    key,
    size: parseInt(res.headers.get('content-length') || '0', 10) || null,
    contentType: res.headers.get('content-type'),
    etag: res.headers.get('etag'),
    last_modified: res.headers.get('last-modified'),
  };
}

/** ListObjectsV2 — one page */
export async function listR2ObjectsPage(ctx, bucket, { prefix = '', maxKeys = 1000, continuationToken } = {}) {
  const params = { prefix, 'max-keys': String(maxKeys) };
  if (continuationToken) params['continuation-token'] = continuationToken;
  const url = r2BucketListUrl(ctx.endpoint, bucket, params);
  const res = await ctx.client.fetch(url, { method: 'GET' });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`ListObjectsV2 failed ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.text();
}

/** DeleteObject */
export async function deleteR2Object(ctx, bucket, key) {
  const url = r2ObjectUrl(ctx.endpoint, bucket, key);
  const res = await ctx.client.fetch(url, { method: 'DELETE' });
  if (!res.ok && res.status !== 404) {
    const t = await res.text();
    throw new Error(`DeleteObject failed ${res.status}: ${t.slice(0, 300)}`);
  }
  return res.ok;
}
