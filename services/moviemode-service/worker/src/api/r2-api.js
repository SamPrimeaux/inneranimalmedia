/** Minimal R2 helpers for MovieMode API in standalone worker. */
export function isDashboardMediaBucket(bucket) {
  const b = String(bucket || '').trim().toLowerCase();
  return ['inneranimalmedia', 'artifacts', 'agent-sam', 'inneranimalmedia-autorag'].includes(b);
}

export function getR2Binding(env, bucket) {
  const b = String(bucket || 'inneranimalmedia').trim().toLowerCase();
  if (b === 'artifacts') return env.ARTIFACTS || env.ASSETS;
  return env.ASSETS;
}
