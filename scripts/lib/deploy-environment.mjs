/**
 * Deploy / runtime environment label (production, staging, …).
 * Worker binding: ENVIRONMENT. Shell scripts may still export legacy DEPLOY_ENV.
 */
export function deployEnvironmentLabel(fallback = 'production') {
  const raw = process.env.ENVIRONMENT ?? process.env.DEPLOY_ENV ?? fallback;
  const label = String(raw ?? '').trim();
  return label || fallback;
}

/**
 * @param {Record<string, unknown>|null|undefined} env Worker env
 */
export function workerEnvironmentLabel(env, fallback = 'production') {
  const raw = env?.ENVIRONMENT ?? env?.DEPLOY_ENV ?? fallback;
  const label = String(raw ?? '').trim();
  return label || fallback;
}
