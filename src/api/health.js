import { jsonResponse } from '../core/responses.js';

export function handleHealthCheck(request, env) {
  return jsonResponse({
    status: 'ok',
    worker: 'inneranimalmedia',
    version: env.CF_VERSION_METADATA?.id ?? 'v2.0-modular',
    bindings: {
      db: !!env.DB,
      r2: !!env.DASHBOARD,
      browser: !!env.MYBROWSER,
      queue: !!env.MY_QUEUE,
      ai: !!env.AI,
    },
    timestamp: Date.now(),
  });
}
