/**
 * R2 storage scope — platform Worker bindings vs customer BYOK.
 *
 * Platform buckets (ASSETS, AUTORAG_BUCKET, …) are introspected from env only.
 * Never hardcode dropped bindings (R2/iam-platform, DOCS_BUCKET, EMAIL, …).
 *
 * HTTP (/api/r2/*, /api/storage/*) and dashboard must use these helpers so
 * non-owner users (e.g. Connor) never get platform bindings or Wrangler S3 secrets.
 *
 * Audit hotspots (still may reference bucket strings for IAM-owned paths):
 *   src/api/r2-api.js          — R2 HTTP API (gate with assertDashboardR2BucketAccess)
 *   src/api/storage.js         — Storage dashboard (tenant project_storage + superadmin live scan)
 *   src/core/platform-owner-r2-access.js — Agent tool catalog (auth_source=platform)
 *   src/core/user-storage-r2-credentials.js — mergeR2S3EnvFromUserStorage (BYOK vs superadmin)
 *   src/core/bootstrap-scoped-context.js — platform_r2_visible, tenant_buckets
 *   dashboard/components/StoragePage.tsx — /api/storage/*
 *   dashboard/components/LocalExplorer.tsx — /api/r2/* placeholders
 */

import { ApiError } from './api-error.js';
import { authUserIsSuperadmin } from './auth.js';
import {
  loadUserCloudflareR2Credentials,
  mergeR2S3EnvFromUserStorage,
} from './user-storage-r2-credentials.js';

/**
 * Block authenticated tenants from writing to platform Worker R2 bindings (ASSETS, AUTORAG, …).
 * Superadmin only until BYOK write paths exist for feature routes.
 * @param {Record<string, unknown>|null|undefined} authUser
 */
export function assertPlatformR2WriteAccess(authUser) {
  if (!authUserIsSuperadmin(authUser)) {
    throw new ApiError(
      403,
      'platform_r2_write_denied',
      'Platform R2 writes require superadmin or BYOK credentials.',
    );
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} authUser
 * @returns {Response|null} JSON 403 when denied; null when allowed
 */
export function platformR2WriteGateResponse(authUser) {
  try {
    assertPlatformR2WriteAccess(authUser);
    return null;
  } catch (e) {
    if (e instanceof ApiError) return e.toJsonResponse();
    throw e;
  }
}

/** Live Worker bindings only — bucket_name is the wrangler bucket_name for each binding key. */
export const WORKER_R2_BINDING_SPECS = [
  {
    bindingKey: 'ASSETS',
    bucketName: 'inneranimalmedia',
    labels: ['ASSETS', 'DASHBOARD'],
    aliases: ['dashboard', 'inneranimalmedia-sandbox-cicd'],
  },
  {
    bindingKey: 'AUTORAG_BUCKET',
    bucketName: 'inneranimalmedia-autorag',
    labels: ['AUTORAG_BUCKET'],
    aliases: ['autorag'],
  },
  {
    bindingKey: 'ARTIFACTS',
    bucketName: 'artifacts',
    labels: ['ARTIFACTS'],
    aliases: ['artifacts'],
  },
];

/**
 * Rows for storage dashboard / superadmin sync — only bindings present on this Worker.
 * @param {any} env
 */
export function listWorkerR2BindingCatalog(env) {
  /** @type {Array<{ binding: string, bucket_name: string, storage_name: string, storage_id: string, storage_type: string, public: boolean, url?: string }>} */
  const rows = [];
  for (const spec of WORKER_R2_BINDING_SPECS) {
    if (!env?.[spec.bindingKey]) continue;
    rows.push({
      binding: spec.bindingKey,
      bucket_name: spec.bucketName,
      storage_name: spec.bucketName,
      storage_id: spec.bucketName,
      storage_type: 'r2_bucket',
      public: spec.bindingKey === 'AUTORAG_BUCKET' || spec.bindingKey === 'ARTIFACTS',
      ...(spec.bindingKey === 'AUTORAG_BUCKET'
        ? { url: 'https://autorag.inneranimalmedia.com' }
        : spec.bindingKey === 'ARTIFACTS'
          ? { url: 'https://artifacts.inneranimalmedia.com' }
          : {}),
    });
  }
  return rows;
}

/**
 * @param {any} env
 * @param {string} raw
 * @returns {string}
 */
export function normalizeR2BucketParam(env, raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const upper = trimmed.toUpperCase();
  for (const spec of WORKER_R2_BINDING_SPECS) {
    if (!env?.[spec.bindingKey]) continue;
    if (spec.labels.includes(upper)) return spec.bucketName;
  }
  return trimmed;
}

/**
 * True when the param resolves to a platform Worker-bound bucket on this deployment.
 * @param {any} env
 * @param {string} bucketOrLabel
 */
export function isPlatformWorkerBoundBucket(env, bucketOrLabel) {
  const normalized = normalizeR2BucketParam(env, bucketOrLabel).toLowerCase();
  if (!normalized) return false;
  for (const spec of WORKER_R2_BINDING_SPECS) {
    if (!env?.[spec.bindingKey]) continue;
    if (normalized === spec.bucketName.toLowerCase()) return true;
    for (const alias of spec.aliases) {
      if (normalized === alias.toLowerCase()) return true;
    }
  }
  return false;
}

/**
 * Resolve R2Bucket handle for a bucket name (platform bindings only).
 * @param {any} env
 * @param {string} bucketName
 */
export function getPlatformWorkerR2Binding(env, bucketName) {
  const normalized = String(bucketName || '').trim().toLowerCase();
  if (!normalized) return null;
  for (const spec of WORKER_R2_BINDING_SPECS) {
    const handle = env?.[spec.bindingKey];
    if (!handle) continue;
    if (normalized === spec.bucketName.toLowerCase()) return handle;
    for (const alias of spec.aliases) {
      if (normalized === alias.toLowerCase()) return handle;
    }
  }
  return null;
}

/**
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @param {string} bucketOrLabel
 */
export async function assertDashboardR2BucketAccess(env, authUser, bucketOrLabel) {
  if (!authUser) {
    return {
      ok: false,
      status: 401,
      error: 'unauthenticated',
      user_message: 'Sign in to access storage.',
    };
  }

  const bucket = normalizeR2BucketParam(env, bucketOrLabel);
  const isOwner = authUserIsSuperadmin(authUser);

  if (isPlatformWorkerBoundBucket(env, bucket)) {
    if (!isOwner) {
      return {
        ok: false,
        status: 403,
        error: 'platform_r2_owner_only',
        bucket,
        user_message:
          'IAM platform R2 is owner-only. Connect your Cloudflare R2 API keys in Settings → Storage to use your buckets.',
      };
    }
    return { ok: true, bucket, via: 'platform_binding' };
  }

  const userCreds = authUser?.id ? await loadUserCloudflareR2Credentials(env, authUser.id) : null;
  if (!userCreds?.accessKeyId || !userCreds?.secretAccessKey) {
    return {
      ok: false,
      status: 403,
      error: 'customer_r2_not_connected',
      bucket,
      user_message:
        'Connect your Cloudflare R2 access key + secret in Settings → Storage before using this bucket.',
    };
  }

  return { ok: true, bucket, via: 'customer_s3' };
}

/**
 * Buckets visible in dashboard R2 picker / catalog.
 * @param {any} env
 * @param {Record<string, unknown>|null|undefined} authUser
 * @param {{ all?: boolean, listAccountViaS3?: (e: any) => Promise<string[]|null> }} [opts]
 */
export async function listDashboardVisibleR2Buckets(env, authUser, opts = {}) {
  const isOwner = authUser && authUserIsSuperadmin(authUser);
  const platformRows = listWorkerR2BindingCatalog(env);
  const platformNames = platformRows.map((r) => r.bucket_name);

  if (isOwner) {
    const bound = [...platformNames];
    const display = [...platformNames];
    if (opts.all === true && typeof opts.listAccountViaS3 === 'function') {
      const account = await opts.listAccountViaS3(env);
      if (account?.length) {
        const merged = [...display];
        const seen = new Set(merged);
        for (const name of account) {
          if (!seen.has(name)) {
            merged.push(name);
            seen.add(name);
          }
        }
        return {
          buckets: merged,
          bound,
          source: 'platform_bindings+s3',
          count: merged.length,
          platform_r2_visible: true,
        };
      }
    }
    return {
      buckets: display,
      bound,
      source: 'platform_bindings',
      count: display.length,
      platform_r2_visible: true,
    };
  }

  const userEnv = await mergeR2S3EnvFromUserStorage(env, authUser);
  if (
    userEnv.R2_ACCESS_KEY_ID &&
    userEnv.R2_SECRET_ACCESS_KEY &&
    typeof opts.listAccountViaS3 === 'function'
  ) {
    const account = await opts.listAccountViaS3(userEnv);
    const names = account || [];
    return {
      buckets: names,
      bound: names,
      source: 'customer_s3',
      count: names.length,
      platform_r2_visible: false,
      r2_byok_connected: true,
    };
  }

  return {
    buckets: [],
    bound: [],
    source: 'customer_disconnected',
    count: 0,
    platform_r2_visible: false,
    r2_byok_connected: false,
    user_message:
      'Connect your Cloudflare R2 access key + secret in Settings → Storage to browse your buckets.',
  };
}
