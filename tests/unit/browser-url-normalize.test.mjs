import test from 'node:test';
import assert from 'node:assert/strict';

/** Mirror BrowserView.normalize — reject /https:// double-prefix paths. */
function normalizeBrowserUrl(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (/^\/https?:\/\//i.test(s)) s = s.replace(/^\/+/, '');
  const nestedAbs = s.match(/^https?:\/\/[^/]+\/(https?:\/\/.+)$/i);
  if (nestedAbs?.[1]) s = nestedAbs[1];
  if (!/^https?:\/\//i.test(s)) {
    if (s.includes('.') || s.startsWith('localhost')) return `https://${s}`;
    return `https://${s}`;
  }
  return s;
}

test('normalize strips leading slash before absolute URL', () => {
  const u = normalizeBrowserUrl('/https://companionscpas.meauxbility.workers.dev/');
  assert.equal(u, 'https://companionscpas.meauxbility.workers.dev/');
});

test('normalize unwraps host-prefixed absolute URL mistake', () => {
  const u = normalizeBrowserUrl(
    'https://inneranimalmedia.com/https://companionscpas.meauxbility.workers.dev/',
  );
  assert.equal(u, 'https://companionscpas.meauxbility.workers.dev/');
});
