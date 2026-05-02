/**
 * One-off: load agent page and capture full console + page errors.
 * Run: node scripts/capture-agent-console.mjs
 */
import { chromium } from 'playwright';

const url = 'https://inneranimalmedia.com/dashboard/agent';
const logs = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();
    logs.push({ type, text, url: location?.url || '', line: location?.lineNumber, col: location?.columnNumber });
  });

  page.on('pageerror', (err) => {
    logs.push({ type: 'pageerror', text: err.message, stack: err.stack });
  });

  const failed = [];
  page.on('requestfailed', (req) => {
    failed.push({ url: req.url(), failure: req.failure()?.errorText || 'unknown' });
  });
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push({ url: res.url(), status: res.status() });
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});

  await page.waitForTimeout(4000);

  await browser.close();

  console.log('=== CONSOLE & PAGE ERRORS ===\n');
  for (const e of logs) {
    if (e.type === 'pageerror') {
      console.log('[PAGE ERROR]', e.text);
      if (e.stack) console.log(e.stack);
    } else {
      const loc = e.url ? ` (${e.url}${e.line != null ? `:${e.line}:${e.col || 0}` : ''})` : '';
      console.log(`[${e.type.toUpperCase()}]${loc} ${e.text}`);
    }
    console.log('');
  }
  if (logs.length === 0) console.log('(No console or page errors captured)');
  console.log('\n=== FAILED REQUESTS / 4xx-5xx ===');
  for (const f of failed) console.log(f.status ? `${f.status} ${f.url}` : `FAILED ${f.url} ${f.failure}`);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
