/**
 * Puppeteer Handler Implementations
 * src/integrations/puppeteer-handlers.js
 *
 * All 26 cdt_* tools implemented as Cloudflare Browser Rendering builtins.
 * Router reads handler_config.fn from DB and calls handlers.puppeteer[fn](args, env).
 *
 * Requires: env.MYBROWSER (Cloudflare Browser Rendering binding)
 *
 * Session model: open → operate → close per call.
 * For multi-step flows (performance traces), session state is held in
 * env.SESSION_CACHE keyed by session_id between start/stop calls.
 */

import puppeteer from '@cloudflare/puppeteer';

// ─── Session helper ───────────────────────────────────────────────────────────

async function withPage(env, fn) {
  if (!env.MYBROWSER) throw new Error('MYBROWSER binding not configured');
  const browser = await puppeteer.launch(env.MYBROWSER);
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    return await fn(page, browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function withNavigatedPage(env, url, fn) {
  return withPage(env, async (page, browser) => {
    if (!url) throw new Error('url is required');
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    return fn(page, browser);
  });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export const puppeteer = {

  // ── Navigation ──────────────────────────────────────────────────────────────

  async cdt_navigate({ url, wait_until = 'networkidle2' }, env) {
    return withPage(env, async (page) => {
      await page.goto(url, { waitUntil: wait_until, timeout: 30000 });
      return {
        ok:    true,
        url:   page.url(),
        title: await page.title(),
      };
    });
  },

  async cdt_reload({ url, wait_until = 'networkidle2' }, env) {
    return withNavigatedPage(env, url, async (page) => {
      await page.reload({ waitUntil: wait_until, timeout: 30000 });
      return { ok: true, url: page.url(), title: await page.title() };
    });
  },

  async cdt_go_back({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      await page.goBack({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      return { ok: true, url: page.url(), title: await page.title() };
    });
  },

  async cdt_go_forward({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      await page.goForward({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
      return { ok: true, url: page.url(), title: await page.title() };
    });
  },

  // ── Screenshots ─────────────────────────────────────────────────────────────

  async cdt_take_screenshot({ url, full_page = false, width = 1280, height = 800 }, env) {
    return withNavigatedPage(env, url, async (page) => {
      await page.setViewport({ width, height });
      const buf    = await page.screenshot({ fullPage: full_page, type: 'png' });
      const key    = `screenshots/cdt/${Date.now()}.png`;
      const bucket = env.DOCS_BUCKET || env.DASHBOARD || env.R2;
      let   screenshot_url = '';
      if (bucket) {
        await bucket.put(key, buf, { httpMetadata: { contentType: 'image/png' } });
        screenshot_url = `${(env.IAM_ORIGIN || '').replace(/\/$/, '')}/${key}`;
      }
      return { ok: true, screenshot_url, width, height, full_page };
    });
  },

  async cdt_capture_area_screenshot({ url, x = 0, y = 0, width = 800, height = 600 }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const buf    = await page.screenshot({ clip: { x, y, width, height }, type: 'png' });
      const key    = `screenshots/cdt/area-${Date.now()}.png`;
      const bucket = env.DOCS_BUCKET || env.DASHBOARD || env.R2;
      let   screenshot_url = '';
      if (bucket) {
        await bucket.put(key, buf, { httpMetadata: { contentType: 'image/png' } });
        screenshot_url = `${(env.IAM_ORIGIN || '').replace(/\/$/, '')}/${key}`;
      }
      return { ok: true, screenshot_url, clip: { x, y, width, height } };
    });
  },

  // ── DOM ─────────────────────────────────────────────────────────────────────

  async cdt_get_document({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const html = await page.content();
      return { ok: true, html: html.slice(0, 100000) };
    });
  },

  async cdt_query_selector({ url, selector }, env) {
    if (!selector) throw new Error('selector is required');
    return withNavigatedPage(env, url, async (page) => {
      const results = await page.$$eval(selector, els => els.map(el => ({
        tag:       el.tagName.toLowerCase(),
        id:        el.id || null,
        className: el.className || null,
        text:      el.innerText?.slice(0, 500) || null,
        html:      el.outerHTML?.slice(0, 2000) || null,
      })));
      return { ok: true, selector, count: results.length, elements: results.slice(0, 50) };
    });
  },

  async cdt_get_element_attributes({ url, selector = 'body' }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const result = await page.$eval(selector, el => {
        const attrs = {};
        for (const a of el.attributes) attrs[a.name] = a.value;
        return {
          tag:        el.tagName.toLowerCase(),
          attributes: attrs,
          html:       el.outerHTML?.slice(0, 5000),
          text:       el.innerText?.slice(0, 1000),
        };
      }).catch(() => null);
      if (!result) return { ok: false, error: `Selector not found: ${selector}` };
      return { ok: true, selector, ...result };
    });
  },

  async cdt_get_computed_styles({ url, selector = 'body' }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const styles = await page.$eval(selector, el => {
        const cs = window.getComputedStyle(el);
        const out = {};
        for (const prop of cs) out[prop] = cs.getPropertyValue(prop);
        return out;
      }).catch(() => null);
      if (!styles) return { ok: false, error: `Selector not found: ${selector}` };
      return { ok: true, selector, styles };
    });
  },

  // ── Interaction ──────────────────────────────────────────────────────────────

  async cdt_click({ url, selector }, env) {
    if (!selector) throw new Error('selector is required');
    return withNavigatedPage(env, url, async (page) => {
      await page.click(selector);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
      return { ok: true, selector, current_url: page.url() };
    });
  },

  async cdt_type({ url, selector, text, clear_first = false }, env) {
    if (!selector) throw new Error('selector is required');
    if (!text)     throw new Error('text is required');
    return withNavigatedPage(env, url, async (page) => {
      if (clear_first) await page.$eval(selector, el => { el.value = ''; });
      await page.type(selector, text, { delay: 30 });
      return { ok: true, selector, typed: text };
    });
  },

  async cdt_hover({ url, selector }, env) {
    if (!selector) throw new Error('selector is required');
    return withNavigatedPage(env, url, async (page) => {
      await page.hover(selector);
      const boundingBox = await page.$eval(selector, el => {
        const r = el.getBoundingClientRect();
        return { top: r.top, left: r.left, width: r.width, height: r.height };
      }).catch(() => null);
      return { ok: true, selector, boundingBox };
    });
  },

  // ── Console ──────────────────────────────────────────────────────────────────

  async cdt_console_list_messages({ url }, env) {
    return withPage(env, async (page) => {
      const messages = [];
      page.on('console', msg => messages.push({
        type:    msg.type(),
        text:    msg.text(),
        time:    new Date().toISOString(),
      }));
      page.on('pageerror', err => messages.push({
        type: 'error',
        text: err.message,
        time: new Date().toISOString(),
      }));
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      // Brief wait to capture any deferred console output
      await new Promise(r => setTimeout(r, 1500));
      return { ok: true, url, count: messages.length, messages };
    });
  },

  async cdt_console_clear({ url }, env) {
    // Stateless — nothing to clear in cloud browser between calls.
    // Returns ok so tool calls don't error in multi-step flows.
    return { ok: true, note: 'Cloud browser sessions are ephemeral — console cleared on session end.' };
  },

  // ── Network ──────────────────────────────────────────────────────────────────

  async cdt_network_list_requests({ url }, env) {
    return withPage(env, async (page) => {
      const requests = [];
      page.on('request',  req => requests.push({
        url:    req.url(),
        method: req.method(),
        type:   req.resourceType(),
      }));
      page.on('response', res => {
        const req = requests.find(r => r.url === res.url());
        if (req) req.status = res.status();
      });
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      return {
        ok:    true,
        url,
        count: requests.length,
        requests: requests.slice(0, 200),
      };
    });
  },

  async cdt_network_clear({ url }, env) {
    return { ok: true, note: 'Cloud browser sessions are ephemeral — network log cleared on session end.' };
  },

  // ── Performance ──────────────────────────────────────────────────────────────

  async cdt_performance_start_trace({ url, session_id }, env) {
    if (!session_id) throw new Error('session_id required for performance traces');
    // Record start time — actual metrics captured on stop
    const startedAt = Date.now();
    if (env.SESSION_CACHE) {
      await env.SESSION_CACHE.put(
        `perf_trace:${session_id}`,
        JSON.stringify({ url, started_at: startedAt }),
        { expirationTtl: 3600 }
      );
    }
    return { ok: true, session_id, url, started_at: startedAt };
  },

  async cdt_performance_stop_trace({ session_id }, env) {
    if (!session_id) throw new Error('session_id required');
    let traceData = null;
    if (env.SESSION_CACHE) {
      const raw = await env.SESSION_CACHE.get(`perf_trace:${session_id}`);
      if (raw) traceData = JSON.parse(raw);
      await env.SESSION_CACHE.delete(`perf_trace:${session_id}`);
    }
    if (!traceData) return { ok: false, error: 'No active trace for session_id' };

    return withNavigatedPage(env, traceData.url, async (page) => {
      const metrics = await page.metrics();
      const perf    = await page.evaluate(() => ({
        navigation: performance.getEntriesByType('navigation')[0] || null,
        paint:      performance.getEntriesByType('paint'),
      }));
      const duration_ms = Date.now() - traceData.started_at;
      return {
        ok:          true,
        session_id,
        url:         traceData.url,
        duration_ms,
        metrics,
        performance: perf,
      };
    });
  },

  async cdt_get_metrics({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const metrics  = await page.metrics();
      const perf     = await page.evaluate(() => ({
        navigation: performance.getEntriesByType('navigation')[0] || null,
        paint:      performance.getEntriesByType('paint'),
        resources:  performance.getEntriesByType('resource').slice(0, 50),
      }));
      return { ok: true, url, metrics, performance: perf };
    });
  },

  // ── Storage & Cookies ────────────────────────────────────────────────────────

  async cdt_get_cookies({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const cookies = await page.cookies();
      return { ok: true, url, count: cookies.length, cookies };
    });
  },

  async cdt_clear_cookies({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const client = await page.createCDPSession();
      await client.send('Network.clearBrowserCookies');
      return { ok: true, url, cleared: 'cookies' };
    });
  },

  async cdt_get_local_storage({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const storage = await page.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          out[k]  = localStorage.getItem(k);
        }
        return out;
      }).catch(() => ({}));
      return { ok: true, url, storage };
    });
  },

  async cdt_clear_local_storage({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      await page.evaluate(() => localStorage.clear()).catch(() => {});
      return { ok: true, url, cleared: 'localStorage' };
    });
  },

  async cdt_clear_cache({ url }, env) {
    return withPage(env, async (page) => {
      const client = await page.createCDPSession();
      await client.send('Network.clearBrowserCache');
      if (url) await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      return { ok: true, cleared: 'cache' };
    });
  },

  // ── Runtime ──────────────────────────────────────────────────────────────────

  async cdt_evaluate({ url, expression }, env) {
    if (!expression) throw new Error('expression is required');
    return withNavigatedPage(env, url, async (page) => {
      const result = await page.evaluate(new Function(`return (${expression})`)).catch(e => ({ error: e.message }));
      return { ok: true, url, expression, result };
    });
  },

  async cdt_get_page_title({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      return { ok: true, url, title: await page.title() };
    });
  },

  async cdt_get_current_url({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      return { ok: true, navigated_to: url, resolved_url: page.url() };
    });
  },

  // ── Accessibility ────────────────────────────────────────────────────────────

  async cdt_get_accessibility_tree({ url }, env) {
    return withNavigatedPage(env, url, async (page) => {
      const snapshot = await page.accessibility.snapshot({ interestingOnly: true });
      return { ok: true, url, tree: snapshot };
    });
  },

};

// ─── Top-level dispatch (called by MCP tool router) ──────────────────────────
//
// Usage in worker:
//   import { handlers } from './integrations/puppeteer-handlers.js';
//   const { impl, fn } = JSON.parse(tool.handler_config);
//   return handlers[impl][fn](args, env);

export const handlers = { puppeteer };
