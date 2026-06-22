/**
 * CAD job dispatch router — GCP (default) vs CF iam-cad-worker container.
 *
 * Env:
 *   CAD_DISPATCH_TARGET=gcp|container|auto  (default: gcp)
 *   CAD_CONTAINER_DISPATCH_ENABLED=1          → auto when target unset
 */
import { dispatchCadJobToPty, probeCadComputeHealth as probeGcpCadHealth } from './cad-pty-executor.js';
import { probeIamCadWorkerContainer, dispatchCadJobToContainer } from './iam-cad-worker-container.js';

/** @param {any} env */
export function resolveCadDispatchTarget(env) {
  const explicit = String(env?.CAD_DISPATCH_TARGET || '')
    .trim()
    .toLowerCase();
  if (explicit === 'gcp' || explicit === 'container' || explicit === 'auto') {
    return explicit;
  }
  const enabled = env?.CAD_CONTAINER_DISPATCH_ENABLED;
  if (enabled === '1' || enabled === true || String(enabled).toLowerCase() === 'true') {
    return 'auto';
  }
  return 'gcp';
}

/**
 * @param {any} env
 * @param {any} ctx
 * @param {string} jobId
 * @param {{ userId: string, tenantId?: string|null, workspaceId: string }} auth
 */
export async function dispatchCadJob(env, ctx, jobId, auth) {
  const target = resolveCadDispatchTarget(env);

  if (target === 'gcp') {
    const res = await dispatchCadJobToPty(env, ctx, jobId, auth);
    return { ...res, dispatch: res.dispatch || 'execos' };
  }

  if (target === 'container') {
    return dispatchCadJobToContainer(env, ctx, jobId, auth);
  }

  const probe = await probeIamCadWorkerContainer(env);
  if (probe.ok && probe.toolchain_ok) {
    const res = await dispatchCadJobToContainer(env, ctx, jobId, auth);
    if (res.ok) return res;
    console.warn('[cad-dispatch] container dispatch failed, falling back to GCP:', res.error);
  }

  const res = await dispatchCadJobToPty(env, ctx, jobId, auth);
  return { ...res, dispatch: res.dispatch || 'execos', fallback_from: 'container' };
}

/**
 * Combined CAD compute health (GCP ExecOS + optional CF container lane).
 * @param {any} env
 * @param {{ userId?: string|null, tenantId?: string|null, workspaceId?: string|null }} [ctx]
 */
export async function probeCadComputeHealth(env, ctx = {}) {
  const gcp = await probeGcpCadHealth(env, ctx);
  const container = await probeIamCadWorkerContainer(env);
  const dispatchTarget = resolveCadDispatchTarget(env);

  return {
    ...gcp,
    dispatch_target: dispatchTarget,
    container_lane: {
      ok: container.ok,
      bound: container.bound,
      toolchain_ok: container.toolchain_ok,
      image: container.image,
      error: container.error || null,
    },
  };
}

/** User-facing dispatch label for API responses. */
export function cadDispatchLabel(result) {
  if (result?.dispatch === 'container') {
    return 'CAD job dispatched to IAM CAD worker container';
  }
  if (result?.fallback_from === 'container') {
    return 'CAD job dispatched to ExecOS GCP (container unavailable, fallback)';
  }
  return 'CAD job dispatched to ExecOS GCP (iam-tunnel)';
}
