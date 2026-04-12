/**
 * Agent Sam dashboard shell build label.
 * Production/sandbox builds set VITE_SHELL_VERSION from
 * scripts/deploy-sandbox.sh (monotonic agent-dashboard/.sandbox-deploy-version).
 * Fallback is a dev placeholder — if you see this in production,
 * VITE_SHELL_VERSION failed to inject at build time.
 */
export const SHELL_VERSION = import.meta.env.VITE_SHELL_VERSION ?? 'dev-local';
