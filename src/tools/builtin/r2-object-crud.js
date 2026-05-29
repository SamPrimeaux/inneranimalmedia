/**
 * Agent Sam R2 catalog ops — get / put / delete only (no wrangler `r2 object list`).
 * Platform Worker bindings (owner) OR per-user S3 keys from user_storage_access_keys.
 */
import {
  r2FetchObjectViaBindingOrS3,
  r2PutViaBindingOrS3,
  r2DeleteViaBindingOrS3,
  r2HeadViaBindingOrS3,
} from '../../core/r2.js';
import { getR2Binding } from '../../api/r2-api.js';
import { detectFileKind } from '../../core/file-kind.js';

/**
 * @param {any} env
 * @param {string} bucketOrBinding
 */
function resolveBucketAndBinding(env, bucketOrBinding) {
  const raw = String(bucketOrBinding || 'inneranimalmedia').trim();
  const binding = getR2Binding(env, raw);
  const bucketName = binding ? raw : raw;
  return { bucketName, binding };
}

/**
 * @param {any} env
 * @param {Record<string, unknown>} params
 * @param {Record<string, unknown>} config
 * @param {string} operation read|write|delete|get|put
 */
export async function executeR2CatalogOperation(env, params, config, operation) {
  const op = String(operation || 'read').toLowerCase();
  const bucket = String(params.bucket || config.bucket || config.binding || 'inneranimalmedia').trim();
  const key = String(params.key || params.object_key || params.path || '').trim();
  const { bucketName, binding } = resolveBucketAndBinding(env, bucket);

  if (!env.R2_ACCESS_KEY_ID && !binding) {
    return {
      ok: false,
      error: 'customer_r2_not_connected',
      user_message:
        'Connect your Cloudflare R2 API keys in Settings → Storage (Access Key + Secret). IAM platform R2 bindings are not available for your account.',
    };
  }

  if (op === 'read' || op === 'get') {
    if (!key) {
      return {
        ok: false,
        error: 'key_required',
        user_message: 'r2_read requires bucket and key (object path). Listing is not supported — use an explicit key.',
      };
    }
    const meta = await r2HeadViaBindingOrS3(env, binding, bucketName, key);
    if (!meta) return { ok: false, error: 'not_found', bucket: bucketName, key };
    const fetched = await r2FetchObjectViaBindingOrS3(env, binding, bucketName, key);
    if (!fetched) return { ok: false, error: 'read_failed', bucket: bucketName, key };
    const kind = detectFileKind({ key, contentType: fetched.contentType, size: fetched.body?.byteLength });
    const isText = kind === 'text' || (fetched.contentType || '').startsWith('text/');
    return {
      ok: true,
      bucket: bucketName,
      key,
      contentType: fetched.contentType,
      size: fetched.body?.byteLength ?? meta.size,
      fileKind: kind,
      content: isText ? new TextDecoder().decode(fetched.body) : null,
      binary: !isText,
      hint: isText ? null : 'Binary object — use signed URL or dashboard preview; content omitted.',
    };
  }

  if (op === 'write' || op === 'put') {
    if (!key) {
      return {
        ok: false,
        error: 'key_required',
        user_message: 'r2_write requires bucket, key, and content.',
      };
    }
    const content = params.content ?? params.body ?? params.data;
    if (content == null) return { ok: false, error: 'content_required' };
    const payload =
      typeof content === 'string'
        ? new TextEncoder().encode(content)
        : content instanceof ArrayBuffer
          ? new Uint8Array(content)
          : content;
    const contentType =
      params.content_type != null
        ? String(params.content_type)
        : params.contentType != null
          ? String(params.contentType)
          : 'application/octet-stream';
    const ok = await r2PutViaBindingOrS3(env, binding, bucketName, key, payload, contentType);
    return ok
      ? { ok: true, bucket: bucketName, key, written: true }
      : { ok: false, error: 'put_failed', bucket: bucketName, key };
  }

  if (op === 'delete') {
    if (!key) {
      return {
        ok: false,
        error: 'key_required',
        user_message: 'r2_delete requires bucket and key.',
      };
    }
    const ok = await r2DeleteViaBindingOrS3(env, binding, bucketName, key);
    return ok
      ? { ok: true, bucket: bucketName, key, deleted: true }
      : { ok: false, error: 'delete_failed', bucket: bucketName, key };
  }

  return {
    ok: false,
    error: 'unsupported_r2_operation',
    user_message:
      'Supported R2 operations: read (get), write (put), delete. Use explicit object keys — not directory listing.',
    operation: op,
  };
}

/**
 * @param {string} operation
 */
export function isR2ListLikeOperation(operation) {
  const op = String(operation || '').toLowerCase();
  return op === 'list' || op === 'search' || op === 'bucket_summary';
}
