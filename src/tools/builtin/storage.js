/**
 * Tool: Storage (R2 / Workspace Files)
 * R2: get / put / delete via Worker binding or user S3 credentials; list via catalog helpers.
 */
import { handlers as fsHandlers } from '../fs.js';
import {
  executeR2CatalogOperation,
  executeR2ListCatalogOperation,
} from './r2-object-crud.js';

export const handlers = {
  async r2_list(params, env) {
    const listAll = params?.list_all === true || params?.listAll === true;
    const bucket = String(params?.bucket || '').trim();
    if (listAll || !bucket) {
      return executeR2ListCatalogOperation(env, params || {}, {}, 'buckets');
    }
    return executeR2ListCatalogOperation(env, params || {}, {}, 'objects');
  },
  async r2_search(params, env) {
    return handlers.r2_list(params, env);
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
