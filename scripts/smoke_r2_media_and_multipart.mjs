#!/usr/bin/env node
/**
 * Smoke: R2 media metadata, single put, multipart, range read, delete.
 * Usage: BASE_URL=https://inneranimalmedia.com COOKIE="..." node scripts/smoke_r2_media_and_multipart.mjs
 */
const BASE = (process.env.BASE_URL || 'http://127.0.0.1:8787').replace(/\/$/, '');
const BUCKET = process.env.R2_SMOKE_BUCKET || 'DASHBOARD';
const PREFIX = process.env.R2_SMOKE_PREFIX || `uploads/smoke-${Date.now()}`;
const COOKIE = process.env.COOKIE || '';

const headers = { 'Content-Type': 'application/json' };
if (COOKIE) headers.Cookie = COOKIE;

async function req(method, path, opts = {}) {
  const init = { method, headers: { ...headers, ...(opts.headers || {}) } };
  if (opts.body != null) {
    if (opts.body instanceof ArrayBuffer || opts.body instanceof Uint8Array) {
      init.body = opts.body;
      delete init.headers['Content-Type'];
      init.headers['Content-Type'] = opts.contentType || 'application/octet-stream';
    } else if (typeof opts.body === 'string') {
      init.body = opts.body;
    } else {
      init.body = JSON.stringify(opts.body);
    }
  }
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 500) };
  }
  return { res, json, text };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  const keyTxt = `${PREFIX}/smoke.txt`;
  const keyBin = `${PREFIX}/smoke.bin`;
  const keyMp = `${PREFIX}/smoke-multipart.bin`;

  console.log('1. HEAD (expect 404 for new key)');
  let r = await req('GET', `/api/r2/head?bucket=${encodeURIComponent(BUCKET)}&key=${encodeURIComponent(keyTxt)}`);
  console.log('   status', r.res.status);

  console.log('2. PUT small text');
  r = await req('POST', '/api/r2/upload', {
    headers: {},
    body: (() => {
      const fd = new FormData();
      fd.set('bucket', BUCKET);
      fd.set('key', keyTxt);
      fd.set('file', new Blob(['smoke r2 text\n'], { type: 'text/plain' }), 'smoke.txt');
      return fd;
    })(),
  });
  if (!(r.body instanceof FormData)) {
    const fd = new FormData();
    fd.set('bucket', BUCKET);
    fd.set('key', keyTxt);
    fd.set('file', new Blob(['smoke r2 text\n'], { type: 'text/plain' }), 'smoke.txt');
    r = await fetch(`${BASE}/api/r2/upload`, { method: 'POST', headers: COOKIE ? { Cookie: COOKIE } : {}, body: fd }).then(
      async (res) => ({ res, json: await res.json().catch(() => ({})) }),
    );
  }
  assert(r.res.ok, `upload text failed ${r.res.status}`);
  console.log('   ok', r.json.key);

  console.log('3. GET file metadata (text)');
  r = await req('GET', `/api/r2/file?bucket=${encodeURIComponent(BUCKET)}&key=${encodeURIComponent(keyTxt)}`);
  assert(r.res.ok && r.json.fileKind === 'text', 'expected text fileKind');
  console.log('   fileKind', r.json.fileKind);

  console.log('4. PUT binary via JSON file route');
  const bin = new Uint8Array([0, 1, 2, 255, 254]);
  r = await req('PUT', `/api/r2/put?bucket=${encodeURIComponent(BUCKET)}&key=${encodeURIComponent(keyBin)}`, {
    body: bin.buffer,
    contentType: 'application/octet-stream',
  });
  assert(r.res.ok, `put binary failed ${r.res.status}`);

  console.log('5. Multipart create');
  const partPayload = new Uint8Array(6 * 1024 * 1024); // 6MB
  partPayload.fill(7);
  r = await req('POST', '/api/r2/multipart/create', {
    body: { bucket: BUCKET, key: keyMp, contentType: 'application/octet-stream' },
  });
  assert(r.res.ok && r.json.uploadId, 'multipart create failed');
  const uploadId = r.json.uploadId;
  console.log('   uploadId', uploadId.slice(0, 12) + '…');

  console.log('6. Upload part 1');
  const qs1 = new URLSearchParams({ bucket: BUCKET, key: keyMp, uploadId, partNumber: '1' });
  r = await req('PUT', `/api/r2/multipart/part?${qs1}`, { body: partPayload.buffer });
  assert(r.res.ok && r.json.etag, 'part 1 failed');
  const etag1 = r.json.etag;

  console.log('7. Complete multipart');
  r = await req('POST', '/api/r2/multipart/complete', {
    body: { bucket: BUCKET, key: keyMp, uploadId, parts: [{ partNumber: 1, etag: etag1 }] },
  });
  assert(r.res.ok, 'complete failed');
  console.log('   etag', r.json.etag);

  console.log('8. HEAD completed object');
  r = await req('GET', `/api/r2/head?bucket=${encodeURIComponent(BUCKET)}&key=${encodeURIComponent(keyMp)}`);
  assert(r.res.ok, 'head failed');

  console.log('9. Range GET first 1024 bytes');
  const objUrl = `${BASE}/api/r2/buckets/${encodeURIComponent(BUCKET)}/object/${encodeURIComponent(keyMp)}`;
  const rangeRes = await fetch(objUrl, {
    headers: { Range: 'bytes=0-1023', ...(COOKIE ? { Cookie: COOKIE } : {}) },
  });
  console.log('   status', rangeRes.status, 'content-range', rangeRes.headers.get('content-range'));
  assert(rangeRes.status === 206 || rangeRes.status === 200, 'range read failed');

  console.log('10. DELETE objects');
  for (const key of [keyTxt, keyBin, keyMp]) {
    r = await req('DELETE', `/api/r2/delete?bucket=${encodeURIComponent(BUCKET)}&key=${encodeURIComponent(key)}`);
    assert(r.res.ok, `delete ${key} failed`);
  }

  console.log('\n✓ smoke_r2_media_and_multipart passed');
}

main().catch((e) => {
  console.error('\n✗', e.message);
  process.exit(1);
});
