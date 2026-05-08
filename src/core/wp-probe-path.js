/**
 * Common WordPress crawl signatures — this site is not WordPress.
 * Short-circuit before R2 / dashboard SPA resolution so probes never get HTML shells or stray object hits.
 */

export function isLikelyWordPressProbePath(pathLower) {
  if (!pathLower || pathLower[0] !== '/') return false;
  const p = pathLower;
  if (p.startsWith('/wp-admin')) return true;
  if (p.startsWith('/wp-includes')) return true;
  if (p.startsWith('/wp-content')) return true;
  if (p.startsWith('/wp-json/')) return true;
  if (p === '/xmlrpc.php') return true;
  if (p === '/wp-login.php') return true;
  if (p.endsWith('/wlwmanifest.xml')) return true;
  if (p === '/readme.html' || p === '/license.txt') return true;
  return false;
}
