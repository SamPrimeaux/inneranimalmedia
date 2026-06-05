/** Build sandboxed HTML for editor srcDoc preview (static HTML / MD / SVG). */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildPreviewSrcDoc(fileName: string, content: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const name = escapeHtml(fileName.trim() || 'preview');

  if (ext === 'svg') {
    return content.trim();
  }

  if (ext === 'md') {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${name}</title><style>body{font-family:system-ui,-apple-system,sans-serif;max-width:52rem;margin:1rem auto;padding:0 1rem;line-height:1.5}</style></head><body><pre style="white-space:pre-wrap;font-family:Menlo,Monaco,monospace;font-size:13px">${escapeHtml(content)}</pre></body></html>`;
  }

  if (ext === 'html' || ext === 'htm') {
    return content;
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>${name}</title></head><body><pre>${escapeHtml(content)}</pre></body></html>`;
}

export function previewSrcDocMime(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'svg') return 'image/svg+xml';
  return 'text/html; charset=utf-8';
}
