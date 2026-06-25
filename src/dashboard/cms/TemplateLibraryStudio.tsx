import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { IAM_AGENT_CHAT_COMPOSE } from '@/agentChatConstants';
import { TemplatePreviewModal } from './TemplatePreviewModal';
import { TemplateLiveControls, useTemplateLiveControls } from './TemplateLiveControls';
import { StorefrontPreview } from './StorefrontPreview';
import {
  classifyTemplate,
  filterTemplatesByTaxonomy,
  TEMPLATE_TAXONOMY_HINTS,
  TEMPLATE_TAXONOMY_LABELS,
  type TemplateTaxonomy,
} from './templateTaxonomy';
import {
  isHtmlTemplate,
  isInlineComponentTemplate,
  parseTemplateMeta,
  resolveTemplatePreviewUrl,
  type CmsTemplateRow,
} from './templatePreview';
import { cmsApi } from './cmsApi';
import { TemplateInlineDemo } from './TemplateInlineDemo';

const api = cmsApi;

const STUDIO_STYLES = `
.pt-library-studio{display:grid;grid-template-columns:minmax(280px,360px) minmax(0,1fr);gap:18px;align-items:start;min-height:520px}
.pt-library-list{display:grid;gap:8px;max-height:min(72vh,720px);overflow:auto;padding-right:4px}
.pt-library-item{width:100%;text-align:left;border:1px solid var(--line);background:var(--panel);border-radius:12px;padding:12px 14px;cursor:pointer;transition:border-color .15s,background .15s}
.pt-library-item:hover{border-color:color-mix(in srgb,var(--blue) 35%,var(--line));background:var(--bg-hover,color-mix(in srgb,var(--text) 3%,transparent))}
.pt-library-item.active{border-color:color-mix(in srgb,var(--blue) 55%,var(--line));box-shadow:0 0 0 1px color-mix(in srgb,var(--blue) 18%,transparent)}
.pt-library-item__title{font-size:13px;font-weight:760;letter-spacing:-.02em;color:var(--text)}
.pt-library-item__sub{margin-top:3px;font-size:11px;color:var(--muted)}
.pt-taxonomy{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}
.pt-taxonomy-pill{height:34px;border-radius:999px;border:1px solid var(--line2);background:var(--panel);padding:0 14px;font-size:12px;font-weight:720;cursor:pointer;color:var(--muted);transition:all .15s}
.pt-taxonomy-pill.active{background:color-mix(in srgb,var(--blue) 12%,var(--panel));border-color:color-mix(in srgb,var(--blue) 40%,var(--line));color:var(--text)}
.pt-taxonomy-hint{margin:-6px 0 12px;font-size:12px;color:var(--muted);line-height:1.45}
.pt-studio-panel{display:grid;gap:14px;min-width:0;position:sticky;top:12px}
.pt-studio-preview{border:1px solid var(--line);border-radius:16px;overflow:hidden;background:var(--panel2);min-height:280px}
.pt-studio-preview__head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--line);background:var(--panel)}
.pt-studio-preview__body{min-height:240px}
.pt-refine{display:grid;gap:8px}
.pt-refine textarea{min-height:72px;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:10px;padding:10px 12px;resize:vertical;line-height:1.45}
.pt-live-controls{border:1px solid var(--line);border-radius:14px;padding:14px;background:var(--panel)}
.pt-live-controls__head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
.pt-live-controls__grid{display:grid;gap:12px}
.pt-live-control{display:grid;gap:6px;font-size:12px;color:var(--text)}
.pt-live-control__row{display:flex;justify-content:space-between;gap:8px;font-weight:650}
.pt-live-control__val{font-family:ui-monospace,monospace;color:var(--muted);font-size:11px}
.pt-live-control input[type=range]{width:100%;accent-color:var(--blue)}
@media(max-width:960px){.pt-library-studio{grid-template-columns:1fr}.pt-studio-panel{position:static}}
`;

function useStudioStyles() {
  useEffect(() => {
    const id = 'iam-template-library-studio-styles';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = STUDIO_STYLES;
    document.head.appendChild(s);
  }, []);
}

function refinePrompt(template: CmsTemplateRow, instruction: string): string {
  const meta = parseTemplateMeta(template);
  const r2 = template.source_html_r2_key || template.r2_key || '';
  return [
    `Refine CMS template **${template.template_name}** (${template.slug || template.id}).`,
    r2 ? `Source: \`${r2}\`` : '',
    meta.description ? `Context: ${String(meta.description)}` : '',
    '',
    `Instruction: ${instruction.trim()}`,
    '',
    'Update the HTML/CSS, write back via r2_put, bump version in cms_component_templates, and keep it reusable.',
  ]
    .filter(Boolean)
    .join('\n');
}

function dispatchAgentSamRefine(template: CmsTemplateRow, instruction: string) {
  const message = refinePrompt(template, instruction);
  window.dispatchEvent(
    new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
      detail: { message, ensureAgentPanel: true, send: false },
    }),
  );
}

type TemplateLibraryStudioProps = {
  projectSlug?: string | null;
  addToPageId?: string | null;
  onNavigatePath: (path: string) => void;
  marketingTemplates?: CmsTemplateRow[];
};

export function TemplateLibraryStudio({
  projectSlug,
  addToPageId,
  onNavigatePath,
  marketingTemplates = [],
}: TemplateLibraryStudioProps): ReactNode {
  useStudioStyles();
  const [templates, setTemplates] = useState<CmsTemplateRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [taxonomy, setTaxonomy] = useState<TemplateTaxonomy>('components');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalTemplate, setModalTemplate] = useState<CmsTemplateRow | null>(null);
  const [refineText, setRefineText] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const initial = await api<{ templates?: CmsTemplateRow[] }>('/api/cms/templates');
      let list = initial.templates || [];
      const slugs = new Set(list.map((t) => t.slug).filter(Boolean));
      let seeded = false;
      for (const tpl of marketingTemplates) {
        if (tpl.slug && !slugs.has(tpl.slug)) {
          await api('/api/cms/templates', { method: 'POST', body: tpl });
          seeded = true;
        }
      }
      if (seeded) {
        const refreshed = await api<{ templates?: CmsTemplateRow[] }>('/api/cms/templates');
        list = refreshed.templates || [];
      }
      setTemplates(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [marketingTemplates]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (templates ? filterTemplatesByTaxonomy(templates, taxonomy) : []),
    [templates, taxonomy],
  );

  const selected = useMemo(
    () => filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  useEffect(() => {
    if (selected?.id && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected?.id, selectedId]);

  const { values, onChange, reset, cssVars } = useTemplateLiveControls(selected);

  const addTemplate = async (t: CmsTemplateRow) => {
    if (!addToPageId) {
      alert('Open a page first, then add a template section.');
      return;
    }
    setBusy(String(t.id));
    const data = parseTemplateMeta(t);
    try {
      await api('/api/cms/sections', {
        method: 'POST',
        body: {
          page_id: addToPageId,
          section_type: t.template_type || t.category || 'template',
          section_name: t.template_name,
          section_data: data,
          sort_order: 100,
        },
      });
      onNavigatePath(`/dashboard/cms/pages/${encodeURIComponent(addToPageId)}${projectSlug ? `?site=${encodeURIComponent(projectSlug)}` : ''}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  const previewStyle = useMemo(() => {
    const style: Record<string, string> = {};
    for (const [k, v] of Object.entries(cssVars)) style[k] = v;
    return style as React.CSSProperties;
  }, [cssVars]);

  const renderPreview = (t: CmsTemplateRow) => {
    const meta = parseTemplateMeta(t);
    const previewUrl = resolveTemplatePreviewUrl(t, meta);
    const showHtml = previewUrl && isHtmlTemplate(t);
    const showInline = isInlineComponentTemplate(t) && !showHtml;

    if (showHtml && previewUrl) {
      return (
        <div style={previewStyle}>
          <StorefrontPreview url={previewUrl} variant="desktop" title={t.template_name || 'Preview'} />
        </div>
      );
    }
    if (showInline) {
      return (
        <div className="pt-template-modal-inline" style={previewStyle}>
          <TemplateInlineDemo meta={{ ...meta, slug: t.slug ?? meta.slug }} manual />
        </div>
      );
    }
    return (
      <div className="pt-template-modal-empty">
        <p>No live preview configured.</p>
        {meta.description ? <p className="pt-copy">{String(meta.description)}</p> : null}
      </div>
    );
  };

  const counts = useMemo(() => {
    if (!templates) return { components: 0, websites: 0, other: 0 };
    return templates.reduce(
      (acc, t) => {
        acc[classifyTemplate(t)] += 1;
        return acc;
      },
      { components: 0, websites: 0, other: 0 } as Record<TemplateTaxonomy, number>,
    );
  }, [templates]);

  return (
    <div className="pt-page">
      <div className="pt-page-inner">
        <header className="pt-compact-head">
          <h1 className="pt-compact-title">Template library</h1>
          <div className="pt-actions">
            <button type="button" className="pt-btn" onClick={() => onNavigatePath(`/dashboard/cms/pages${projectSlug ? `?site=${encodeURIComponent(projectSlug)}` : ''}`)}>
              Pages
            </button>
            <button type="button" className="pt-btn" onClick={() => void load()}>
              Refresh
            </button>
          </div>
        </header>

        {error ? (
          <div className="pt-card" style={{ padding: 16, marginBottom: 14, color: 'var(--muted)' }}>
            {error}
            <button type="button" className="pt-btn" style={{ marginLeft: 10 }} onClick={() => void load()}>
              Retry
            </button>
          </div>
        ) : null}

        <div className="pt-taxonomy" role="tablist" aria-label="Template taxonomy">
          {(['components', 'websites', 'other'] as TemplateTaxonomy[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={taxonomy === key}
              className={`pt-taxonomy-pill${taxonomy === key ? ' active' : ''}`}
              onClick={() => setTaxonomy(key)}
            >
              {TEMPLATE_TAXONOMY_LABELS[key]} ({counts[key]})
            </button>
          ))}
        </div>
        <p className="pt-taxonomy-hint">{TEMPLATE_TAXONOMY_HINTS[taxonomy]}</p>

        {!templates ? (
          <div className="pt-card" style={{ padding: 24, color: 'var(--muted)' }} aria-busy="true">
            Loading templates…
          </div>
        ) : (
          <div className="pt-library-studio">
            <div className="pt-library-list" role="list">
              {filtered.map((t) => (
                <button
                  key={String(t.id)}
                  type="button"
                  role="listitem"
                  className={`pt-library-item${selected?.id === t.id ? ' active' : ''}`}
                  onClick={() => setSelectedId(String(t.id))}
                >
                  <div className="pt-library-item__title">{t.template_name}</div>
                  <div className="pt-library-item__sub">
                    {t.category || 'General'} · {t.template_type || 'section'}
                  </div>
                </button>
              ))}
              {!filtered.length ? (
                <div className="pt-card" style={{ padding: 18, color: 'var(--muted)' }}>
                  No templates in this bucket yet.
                </div>
              ) : null}
            </div>

            {selected ? (
              <div className="pt-studio-panel">
                <div className="pt-studio-preview">
                  <div className="pt-studio-preview__head">
                    <div>
                      <div className="pt-row-title" style={{ fontSize: 15 }}>
                        {selected.template_name}
                      </div>
                      <div className="pt-row-sub">{selected.slug || selected.id}</div>
                    </div>
                    <div className="pt-actions">
                      <button type="button" className="pt-btn" onClick={() => setModalTemplate(selected)}>
                        Fullscreen
                      </button>
                      {addToPageId ? (
                        <button
                          type="button"
                          className="pt-btn primary"
                          disabled={busy === String(selected.id)}
                          onClick={() => void addTemplate(selected)}
                        >
                          {busy === String(selected.id) ? 'Adding…' : 'Add to page'}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="pt-studio-preview__body">{renderPreview(selected)}</div>
                </div>

                <TemplateLiveControls template={selected} values={values} onChange={onChange} onReset={reset} />

                <div className="pt-refine pt-card" style={{ padding: 14 }}>
                  <div className="pt-label">Refine with Agent Sam</div>
                  <textarea
                    placeholder="e.g. wire progress to agentsam_cad_jobs.progress_pct, remove the card chrome, match Claude tool rows…"
                    value={refineText}
                    onChange={(e) => setRefineText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="pt-btn primary"
                    disabled={!refineText.trim()}
                    onClick={() => {
                      dispatchAgentSamRefine(selected, refineText);
                      setRefineText('');
                    }}
                  >
                    Open in Agent Sam
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}

        <TemplatePreviewModal
          template={modalTemplate}
          onClose={() => setModalTemplate(null)}
          liveValues={modalTemplate?.id === selected?.id ? values : undefined}
          onLiveChange={modalTemplate?.id === selected?.id ? onChange : undefined}
          onLiveReset={modalTemplate?.id === selected?.id ? reset : undefined}
        />
      </div>
    </div>
  );
}
