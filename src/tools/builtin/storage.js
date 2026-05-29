/**
 * Tool: Storage (R2 / Workspace Files)
 * R2: get / put / delete via Worker binding or user S3 credentials — no wrangler object list.
 */
import { handlers as fsHandlers } from '../fs.js';
import { executeR2CatalogOperation, isR2ListLikeOperation } from './r2-object-crud.js';

const R2_LIST_DEGRADED = {
  ok: false,
  error: 'r2_list_not_supported',
  degraded: true,
  user_message:
    'R2 listing is not exposed to agents (Wrangler only supports r2 object get/put/delete). Use r2_read / r2_write / r2_delete with an explicit bucket and key. Connect your R2 keys in Settings → Storage for your own buckets.',
  hint: 'Owner dashboard may use /api/r2/list with Worker bindings; agents use key-based CRUD only.',
};

export const handlers = {
  async r2_list() {
    return R2_LIST_DEGRADED;
  },
  async r2_search() {
    return R2_LIST_DEGRADED;
  },
  async r2_bucket_summary() {
    return {
      ok: true,
      note: 'Bucket inventory via D1/registry only; object listing not available to agents.',
    };
  },
  async r2_read(params, env) {
    return executeR2CatalogOperation(env, params, {}, 'read');
  },
  async r2_write(params, env) {
    return executeR2CatalogOperation(env, params, {}, 'write');
  },
  async r2_delete(params, env) {
    return executeR2CatalogOperation(env, params, {}, 'delete');
  },
  async get_r2_url(params, env) {
    const bucket = String(params.bucket || '').trim();
    const key = String(params.key || params.path || '').trim();
    if (!bucket || !key) return { error: 'bucket and key required' };
    const origin = env.IAM_ORIGIN || 'https://inneranimalmedia.com';
    return {
      ok: true,
      url: `${origin}/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`,
    };
  },

  async workspace_list_files(params, env) {
    return fsHandlers.list_dir(params, env);
  },
  async workspace_read_file(params, env) {
    return fsHandlers.read_file(params, env);
  },
  async workspace_search(params, env) {
    return fsHandlers.list_dir({ ...params, recursive: true, search: true }, env);
  },
};
