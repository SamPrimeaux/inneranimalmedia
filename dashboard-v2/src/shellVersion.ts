/**
 * Agent Sam dashboard shell build label. Production/sandbox builds set
 * `VITE_SHELL_VERSION` from `scripts/deploy-sandbox.sh` (monotonic `agent-dashboard/.sandbox-deploy-version`).
 * Fallback tracks the last committed counter so local dev matches the current generation (update when `.sandbox-deploy-version` bumps).
 */
export const SHELL_VERSION = import.meta.env.VITE_SHELL_VERSION ?? 'v1.0.0-agentsam';
