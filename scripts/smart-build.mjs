/**
 * CF Builds / wrangler pre-deploy hook: run full Vite only when dashboard/ changed.
 * Uses last commit's file list; falls back to full build if git history is unavailable.
 */
import { execSync } from 'node:child_process';

function listChangedFiles() {
  try {
    return execSync('git diff --name-only HEAD~1 HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    console.warn('[build] git diff HEAD~1 HEAD failed (shallow/first commit?) — running full Vite build');
    return 'dashboard/\n';
  }
}

const changed = listChangedFiles();
const dashboardChanged = changed.split('\n').some((f) => f.startsWith('dashboard/'));

if (dashboardChanged) {
  console.log('[build] dashboard changed — running full Vite build');
  execSync('npm run build', { stdio: 'inherit' });
} else {
  console.log('[build] worker-only change — skipping Vite');
}
