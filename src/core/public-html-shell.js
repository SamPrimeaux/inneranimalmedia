/**
 * Serve marketing HTML with shared iam-header / iam-footer injection (R2 ASSETS).
 */

/**
 * @param {import('@cloudflare/workers-types').Fetcher} [assets]
 * @param {string} html
 * @param {{ skipShellInject?: boolean, cacheControl?: string }} [opts]
 */
export async function servePublicHtmlWithShell(assets, html, opts = {}) {
  const skipShellInject = Boolean(opts.skipShellInject);
  const cacheControl = opts.cacheControl || 'public, max-age=300';

  let headerHtml = '';
  let footerHtml = '';
  if (!skipShellInject && assets) {
    const [headerObj, footerObj] = await Promise.all([
      assets.get('src/components/iam-header.html'),
      assets.get('src/components/iam-footer.html'),
    ]);
    headerHtml = headerObj ? await headerObj.text() : '';
    footerHtml = footerObj ? await footerObj.text() : '';
  }

  const base = new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': cacheControl },
  });

  if (skipShellInject || (!headerHtml && !footerHtml)) {
    return base;
  }

  return new HTMLRewriter()
    .on('body', {
      element(el) {
        if (headerHtml) el.prepend(headerHtml, { html: true });
        if (footerHtml) el.append(footerHtml, { html: true });
      },
    })
    .transform(base);
}
