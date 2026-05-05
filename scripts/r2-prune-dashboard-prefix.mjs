#!/usr/bin/env node
/**
 * List R2 objects under a prefix (S3 ListObjectsV2), compare to local dist files,
 * delete keys that are not in the current build (stale hashed chunks).
 *
 * Requires: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
 * (R2 → Overview → Manage R2 API Tokens — permission to read/list + delete objects.)
 */
import { AwsClient } from 'aws4fetch';
import fs from 'fs';
import path from 'path';

function usage() {
  console.error(
    'Usage: node r2-prune-dashboard-prefix.mjs --bucket B --prefix P --dist DIR\n' +
      '  P: key prefix without trailing slash, e.g. static/dashboard/agent',
  );
  process.exit(1);
}

function parseArgs() {
  const a = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--bucket') o.bucket = a[++i];
    else if (a[i] === '--prefix') o.prefix = a[++i];
    else if (a[i] === '--dist') o.dist = a[++i];
  }
  if (!o.bucket || !o.prefix || !o.dist) usage();
  return o;
}

function collectExpectedKeys(distDir, prefix) {
  const abs = path.resolve(distDir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error(`dist is not a directory: ${abs}`);
  }
  const keys = new Set();
  const walk = (dir, relPieces) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        walk(path.join(dir, ent.name), [...relPieces, ent.name]);
      } else {
        const rel = [...relPieces, ent.name].join('/');
        keys.add(`${prefix}/${rel}`);
      }
    }
  };
  walk(abs, []);
  return keys;
}

function parseKeysFromListXml(xml) {
  return [...xml.matchAll(/<Key>([^<]*)<\/Key>/g)].map((m) => m[1]);
}

function isTruncated(xml) {
  return /<IsTruncated>true<\/IsTruncated>/.test(xml);
}

function nextToken(xml) {
  const m = xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/);
  return m ? m[1] : '';
}

function objectUrl(endpoint, bucket, key) {
  const encPath = key.split('/').map(encodeURIComponent).join('/');
  return `${endpoint}/${bucket}/${encPath}`;
}

async function main() {
  const { bucket, prefix: rawPrefix, dist } = parseArgs();
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    console.error('Missing CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, or R2_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  const prefix = rawPrefix.replace(/\/$/, '');
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;
  const aws = new AwsClient({ accessKeyId, secretAccessKey });

  const expected = collectExpectedKeys(dist, prefix);
  const listPrefix = `${prefix}/`;

  const remoteKeys = [];
  let token = '';
  do {
    const qs = new URLSearchParams({
      'list-type': '2',
      prefix: listPrefix,
      'max-keys': '1000',
    });
    if (token) qs.set('continuation-token', token);
    const url = `${endpoint}/${bucket}?${qs.toString()}`;
    const res = await aws.fetch(url, { method: 'GET' });
    const xml = await res.text();
    if (!res.ok) {
      throw new Error(`ListObjectsV2 ${res.status}: ${xml.slice(0, 500)}`);
    }
    remoteKeys.push(...parseKeysFromListXml(xml));
    token = isTruncated(xml) ? nextToken(xml) : '';
  } while (token);

  const stale = remoteKeys.filter((k) => !expected.has(k));
  if (stale.length === 0) {
    console.log(
      `R2 prune: 0 stale objects under ${listPrefix} (${remoteKeys.length} remote, ${expected.size} expected)`,
    );
    return;
  }

  console.log(`R2 prune: deleting ${stale.length} stale object(s) under ${listPrefix}...`);
  for (const key of stale) {
    const url = objectUrl(endpoint, bucket, key);
    const delRes = await aws.fetch(url, { method: 'DELETE' });
    if (!delRes.ok) {
      const t = await delRes.text();
      throw new Error(`DeleteObject ${key} failed ${delRes.status}: ${t.slice(0, 300)}`);
    }
    console.log(`  deleted ${key}`);
  }
  console.log(`R2 prune: done (removed ${stale.length})`);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
