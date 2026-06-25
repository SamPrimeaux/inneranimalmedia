import { useEffect, type ReactNode } from 'react';
import { StorefrontPreview } from './StorefrontPreview';
import { TemplateInlineDemo } from './TemplateInlineDemo';
import {
  isHtmlTemplate,
  isInlineComponentTemplate,
  parseTemplateMeta,
  resolveTemplatePreviewUrl,
  type CmsTemplateRow,
} from './templatePreview';

export type TemplatePreviewModalProps = {
  template: CmsTemplateRow | null;
  onClose: () => void;
};

function previewHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function TemplatePreviewModal({ template, onClose }: TemplatePreviewModalProps): ReactNode {
  useEffect(() => {
    if (!template) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [template, onClose]);

  if (!template) return null;

  const meta = parseTemplateMeta(template);
  const previewUrl = resolveTemplatePreviewUrl(template, meta);
  const showHtml = previewUrl && isHtmlTemplate(template);
  const showInline = isInlineComponentTemplate(template) && !showHtml;

  return (
    <div className="pt-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="pt-modal pt-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pt-template-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pt-modal-head">
          <div>
            <div className="pt-kicker" style={{ marginBottom: 6 }}>Template preview</div>
            <h2 id="pt-template-modal-title" className="pt-modal-title">{template.template_name}</h2>
            <p className="pt-modal-sub">
              {template.category || 'General'} · {template.template_type || 'section'}
            </p>
          </div>
          <div className="pt-actions">
            {previewUrl ? (
              <a className="pt-btn" href={previewUrl} target="_blank" rel="noopener noreferrer">
                Open in new tab
              </a>
            ) : null}
            <button type="button" className="pt-icon-btn" onClick={onClose} aria-label="Close preview">
              ✕
            </button>
          </div>
        </header>

        <div className="pt-modal-body">
          {showHtml ? (
            <StorefrontPreview
              url={previewUrl!}
              variant="desktop"
              title={previewHost(previewUrl!)}
              className="pt-template-modal-frame"
            />
          ) : null}

          {showInline ? (
            <div className="pt-template-modal-inline">
              {meta.description ? <p className="pt-copy">{String(meta.description)}</p> : null}
              <TemplateInlineDemo meta={{ ...meta, slug: template.slug ?? meta.slug }} />
              {meta.component ? (
                <p className="pt-inline-demo__meta">
                  Component: <code>{String(meta.component)}</code>
                </p>
              ) : null}
            </div>
          ) : null}

          {!showHtml && !showInline ? (
            <div className="pt-template-modal-empty">
              <p>No live preview is configured for this template yet.</p>
              {meta.description ? <p className="pt-copy">{String(meta.description)}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
