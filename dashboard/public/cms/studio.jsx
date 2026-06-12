/* global React, ReactDOM */
const { useState, useEffect, useRef, useMemo } = React;

const Icon = ({ id, size = 14, className = "" }) => (
  <svg width={size} height={size} className={className} aria-hidden="true">
    <use href={`#i-${id}`} />
  </svg>
);

/* Initial files when Agent Sam produces artifacts */
const STARTER_FILES = [];

const DASHBOARD_THEME_KEYS = [
  '--bg-canvas', '--bg-app', '--bg-panel', '--bg-hover', '--bg-elevated',
  '--border-subtle', '--border-focus', '--text-main', '--text-muted', '--text-heading',
  '--solar-cyan', '--solar-orange', '--solar-green', '--solar-blue', '--solar-red',
  '--dashboard-panel', '--dashboard-canvas', '--dashboard-border',
];

function applyCmsThemeVars(vars) {
  if (!vars || typeof vars !== 'object') return;
  const root = document.documentElement;
  for (const [rawKey, val] of Object.entries(vars)) {
    if (val == null || String(val).trim() === '') continue;
    const key = String(rawKey).startsWith('--') ? String(rawKey) : `--${String(rawKey).replace(/^-+/, '')}`;
    root.style.setProperty(key, String(val));
  }
}

function tryCopyParentTheme() {
  try {
    const parentRoot = window.parent?.document?.documentElement;
    if (!parentRoot || parentRoot === document.documentElement) return;
    const cs = window.parent.getComputedStyle(parentRoot);
    const vars = {};
    for (const key of DASHBOARD_THEME_KEYS) {
      const v = cs.getPropertyValue(key).trim();
      if (v) vars[key] = v;
    }
    const slug = parentRoot.getAttribute('data-theme');
    if (slug) document.documentElement.setAttribute('data-theme', slug);
    applyCmsThemeVars(vars);
  } catch (_) {}
}

function askAgentSam(message, opts = {}) {
  const text = String(message || '').trim();
  if (!text) return;
  const ctx = readStudioContext();
  const detail = {
    message: text,
    task_type: opts.task_type || 'cms_edit',
    route_key: opts.route_key || 'cms_edit',
    ensureAgentPanel: true,
    send: opts.send !== false,
    force_plan_mode: opts.force_plan_mode === true,
    project_slug: ctx.projectSlug,
    page_id: opts.page_id || ctx.pageId || null,
    workspace_id: ctx.workspaceId || null,
    r2_key: opts.r2_key || null,
    live_url: opts.live_url || null,
    preview_mode: opts.preview_mode || null,
    bootstrap_cache_key: ctx.workspaceId
      ? `cms:bootstrap:${ctx.workspaceId}:${ctx.projectSlug}`
      : null,
    collab_room: (opts.page_id || ctx.pageId) ? `cms:${opts.page_id || ctx.pageId}` : null,
  };
  try {
    window.parent.postMessage(
      {
        type: detail.send ? 'iam-agent-chat-new-thread' : 'iam-agent-chat-compose',
        detail,
      },
      window.location.origin,
    );
  } catch (_) {}
}

function askAgentSamPlan(goalSuffix, opts = {}) {
  const ctx = readStudioContext();
  const goal = `[CMS · ${ctx.projectSlug}] ${String(goalSuffix || '').trim()}`;
  askAgentSam(goal, {
    ...opts,
    task_type: 'plan',
    route_key: 'plan',
    force_plan_mode: true,
  });
}

const STARTER_PROMPTS = {
  'Use a template': 'Help me pick a CMS template and scaffold pages for this project from cms_component_templates.',
  'Add a screenshot': 'I will attach a screenshot — match this UI and map sections to cms_pages and cms_page_sections.',
  'Connect a codebase': 'Connect my GitHub repo and continue building CMS pages from existing code.',
  'Drop in a Figma file': 'Import design tokens and components from a Figma file into this CMS project.',
};

const EXAMPLE_PROMPTS = [
  'A recipe CMS for a Mediterranean café',
  'A reading-list app with weekly digests',
  'An internal admin for managing leads',
  'A subscription paywall on top of my blog',
];

/* ─── File tree ─────────────────────────────────────────── */
function buildTree(files) {
  const root = { name: "project", dir: true, children: {} };
  for (const f of files) {
    const parts = f.path.split("/");
    let cur = root;
    parts.forEach((p, i) => {
      const isLeaf = i === parts.length - 1;
      cur.children[p] = cur.children[p] || (isLeaf
        ? { name: p, dir: false, isNew: f.isNew }
        : { name: p, dir: true, children: {} });
      if (!isLeaf) cur = cur.children[p];
    });
  }
  return root;
}

function flattenTree(node, depth = 0, out = []) {
  if (!node.children) return out;
  const entries = Object.values(node.children).sort((a, b) => {
    if (a.dir !== b.dir) return a.dir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (const e of entries) {
    out.push({ ...e, depth });
    if (e.dir) flattenTree(e, depth + 1, out);
  }
  return out;
}

function fileIcon(name) {
  if (name.endsWith(".ts") || name.endsWith(".tsx")) return "code";
  if (name.endsWith(".sql") || name.endsWith(".yaml")) return "db";
  if (name.endsWith(".md")) return "doc";
  if (name.endsWith(".png") || name.endsWith(".svg") || name.endsWith(".jpg")) return "image";
  return "doc";
}

/* ─── Components ─────────────────────────────────────────── */

const IAM_LOGO =
  "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e323ffb-4338-41dc-1f71-9c7bdc57bb00/public";

function readStudioContext() {
  const params = new URLSearchParams(location.search);
  return {
    projectSlug: params.get("project") || "inneranimalmedia",
    pageId: params.get("page") || "",
    workspaceId: params.get("workspace_id") || "",
    studioPanel: params.get("panel") || "pages",
  };
}

async function apiJson(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "include",
    headers: opts.body instanceof FormData ? {} : { "Content-Type": "application/json" },
    ...opts,
    body:
      opts.body instanceof FormData
        ? opts.body
        : opts.body
          ? JSON.stringify(opts.body)
          : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

function Topbar({ phase, workspaceLabel, projectSlug, projectLabel, userInitials, onShare, onDeploy }) {
  return (
    <div className="topbar">
      <div className="logo-mark">
        <img src={IAM_LOGO} alt="Inner Animal Media" />
      </div>
      <div className="brand">PrimeTech<em>.</em></div>
      <div className="crumbs">
        <span>Workspace</span>
        <span className="slash">/</span>
        <span>{workspaceLabel || projectSlug}</span>
        <span className="slash">/</span>
        <span className="current">{projectLabel || "New project"}</span>
      </div>
      <div className="spacer"></div>
      <span className="pill">
        <span className="dot"></span>
        {phase === "Deploying" ? phase : "Idle · ready"}
      </span>
      <button type="button" className="btn" onClick={onShare}><Icon id="share" />Share</button>
      <button type="button" className="btn primary" onClick={onDeploy}><Icon id="deploy" />Deploy</button>
      <div className="avatar">{userInitials || "IA"}</div>
    </div>
  );
}

function EmptyCanvas({ onSketch, onAskAgent, showToast }) {
  const starters = [
    { ic: "doc", color: "var(--accent-3)", label: "Use a template", desc: "Blog · SaaS · Storefront · Admin" },
    { ic: "image", color: "var(--solar-blue, #3a9fe8)", label: "Add a screenshot", desc: "Match an existing UI" },
    { ic: "code", color: "var(--ink-2)", label: "Connect a codebase", desc: "Continue from a repo" },
    { ic: "figma", color: "var(--solar-red, #e63333)", label: "Drop in a Figma file", desc: "Bring tokens + components" },
  ];

  const pickStarter = (label) => {
    const msg = STARTER_PROMPTS[label] || label;
    askAgentSamPlan(msg);
    showToast?.('Opening Plan mode →');
    onAskAgent?.();
  };

  const pickExample = (ex) => {
    askAgentSamPlan(`Build: ${ex}`);
    showToast?.('Opening Plan mode →');
    onAskAgent?.();
  };

  return (
    <div className="empty empty-with-starters">
      <div className="welcome">
        <h1>Start in <em>Agent Sam</em></h1>
        <p>Quick actions open Agent Sam on the right with CMS context for this project — pages, sections, and themes from D1.</p>
      </div>
      <div className="starters starters-grid">
        {starters.map((s) => (
          <button key={s.label} type="button" className="starter" onClick={() => pickStarter(s.label)}>
            <span className="ic" style={{ background: s.color }}><Icon id={s.ic} size={14} /></span>
            <span className="body">
              <div className="label">{s.label}</div>
              <div className="desc">{s.desc}</div>
            </span>
          </button>
        ))}
      </div>
      <div className="examples-label">Or try one of these</div>
      <div className="examples-compact">
        {EXAMPLE_PROMPTS.map((ex) => (
          <button key={ex} type="button" className="example" onClick={() => pickExample(ex)}>
            <Icon id="sparkle" />
            <span>{ex}</span>
            <Icon id="chev" className="arr" size={12} />
          </button>
        ))}
      </div>
      <button type="button" className="cta" onClick={onSketch}><Icon id="plus" size={11} /> Start with a sketch</button>
    </div>
  );
}

function CodeCanvas({ typed }) {
  return (
    <pre className="code-pane" aria-label="Generated code">
      <code>
        <div><span className="ln">1</span><span className="c">// app/api/projects.ts — generated by PrimeTech</span></div>
        <div><span className="ln">2</span><span className="k">import</span> <span className="p">{`{ db }`}</span> <span className="k">from</span> <span className="s">"../db"</span><span className="v">;</span></div>
        <div><span className="ln">3</span><span className="k">import</span> <span className="p">{`{ Anthropic }`}</span> <span className="k">from</span> <span className="s">"@anthropic-ai/sdk"</span><span className="v">;</span></div>
        <div><span className="ln">4</span></div>
        <div><span className="ln">5</span><span className="k">export async function</span> <span className="t">listProjects</span><span className="p">(</span><span className="v">userId</span><span className="p">:</span> <span className="t">string</span><span className="p">)</span> <span className="p">{`{`}</span></div>
        <div><span className="ln">6</span>{"  "}<span className="k">return</span> db<span className="p">.</span>projects<span className="p">.</span><span className="t">findMany</span><span className="p">({`{`}</span></div>
        <div><span className="ln">7</span>{"    "}<span className="v">where:</span> <span className="p">{`{`}</span> <span className="v">ownerId:</span> userId <span className="p">{`}`}</span><span className="v">,</span></div>
        <div><span className="ln">8</span>{"    "}<span className="v">orderBy:</span> <span className="p">{`{`}</span> <span className="v">updatedAt:</span> <span className="s">"desc"</span> <span className="p">{`}`}</span><span className="v">,</span></div>
        <div><span className="ln">9</span>{"  "}<span className="p">{`})`}</span><span className="v">;</span></div>
        <div><span className="ln">10</span><span className="p">{`}`}</span></div>
        <div><span className="ln">11</span></div>
        <div><span className="ln">12</span><span className="k">export async function</span> <span className="t">generateContent</span><span className="p">(</span><span className="v">prompt</span><span className="p">:</span> <span className="t">string</span><span className="p">)</span> <span className="p">{`{`}</span></div>
        <div><span className="ln">13</span>{"  "}<span className="k">const</span> claude <span className="p">=</span> <span className="k">new</span> <span className="t">Anthropic</span><span className="p">();</span></div>
        <div><span className="ln">14</span>{"  "}<span className="k">const</span> res <span className="p">=</span> <span className="k">await</span> claude<span className="p">.</span>messages<span className="p">.</span><span className="t">create</span><span className="p">({`{`}</span></div>
        <div><span className="ln">15</span>{"    "}<span className="v">model:</span> <span className="s">"claude-sonnet-4-5"</span><span className="v">,</span></div>
        <div><span className="ln">16</span>{"    "}<span className="v">max_tokens:</span> <span className="s">2048</span><span className="v">,</span></div>
        <div><span className="ln">17</span>{"    "}<span className="v">messages:</span> <span className="p">[{`{ role: "user", content: prompt }`}]</span><span className="v">,</span></div>
        <div><span className="ln">18</span>{"  "}<span className="p">{`})`}</span><span className="v">;</span></div>
        <div><span className="ln">19</span>{"  "}<span className="k">return</span> res<span className="p">.</span>content<span className="p">[</span><span className="s">0</span><span className="p">].</span>text<span className="v">;</span><span className="cursor"></span></div>
        <div><span className="ln">20</span><span className="p">{`}`}</span></div>
      </code>
    </pre>
  );
}

function SchemaCanvas() {
  const tables = [
    { name: "users", rows: [
      { nm: "id", ty: "uuid", pk: true },
      { nm: "email", ty: "text" },
      { nm: "name", ty: "text" },
      { nm: "created_at", ty: "timestamptz" },
    ]},
    { name: "projects", rows: [
      { nm: "id", ty: "uuid", pk: true },
      { nm: "owner_id", ty: "→ users.id", fk: true },
      { nm: "name", ty: "text" },
      { nm: "template", ty: "text" },
      { nm: "settings", ty: "jsonb" },
    ]},
    { name: "assets", rows: [
      { nm: "id", ty: "uuid", pk: true },
      { nm: "project_id", ty: "→ projects.id", fk: true },
      { nm: "kind", ty: "enum" },
      { nm: "url", ty: "text" },
      { nm: "meta", ty: "jsonb" },
    ]},
    { name: "comments", rows: [
      { nm: "id", ty: "uuid", pk: true },
      { nm: "asset_id", ty: "→ assets.id", fk: true },
      { nm: "author_id", ty: "→ users.id", fk: true },
      { nm: "body", ty: "text" },
    ]},
    { name: "templates", rows: [
      { nm: "slug", ty: "text", pk: true },
      { nm: "title", ty: "text" },
      { nm: "category", ty: "text" },
      { nm: "schema", ty: "jsonb" },
    ]},
    { name: "builds", rows: [
      { nm: "id", ty: "uuid", pk: true },
      { nm: "project_id", ty: "→ projects.id", fk: true },
      { nm: "status", ty: "enum" },
      { nm: "log_url", ty: "text" },
    ]},
  ];
  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto' }}>
      <div className="schema-grid">
        {tables.map(t => (
          <div className="schema-card" key={t.name}>
            <div className="schema-head">
              <Icon id="db" className="ic" size={12} />
              <span>{t.name}</span>
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--muted)', fontWeight: 400 }}>{t.rows.length} cols</span>
            </div>
            <div className="schema-rows">
              {t.rows.map(r => (
                <div key={r.nm} className={`schema-row ${r.pk ? "pk" : ""} ${r.fk ? "fk" : ""}`}>
                  <span className="nm">{r.nm}</span>
                  <span className="ty">{r.ty}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewSkeleton() {
  return (
    <div className="building-skeleton">
      <div className="skel-nav">
        <div className="skel" style={{ width: 28, height: 28, borderRadius: 7 }}></div>
        <div className="skel" style={{ width: 100 }}></div>
        <div style={{ flex: 1 }}></div>
        <div className="skel" style={{ width: 60 }}></div>
        <div className="skel" style={{ width: 60 }}></div>
        <div className="skel" style={{ width: 90, height: 28, borderRadius: 6 }}></div>
      </div>
      <div className="skel-body">
        <div className="skel" style={{ width: '70%', height: 36 }}></div>
        <div className="skel" style={{ width: '55%', height: 36 }}></div>
        <div className="skel" style={{ width: '40%', height: 14, marginTop: 6 }}></div>
        <div className="skel" style={{ width: '60%', height: 14 }}></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginTop: 18 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ border: '1px solid #EEE8DA', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="skel" style={{ width: 26, height: 26, borderRadius: 7 }}></div>
              <div className="skel" style={{ width: '70%', height: 14 }}></div>
              <div className="skel" style={{ width: '90%', height: 10 }}></div>
              <div className="skel" style={{ width: '80%', height: 10 }}></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CmsHtmlPreview({ html, contentUrl, pageTitle, refreshKey = 0, preferUrl = false }) {
  const iframeRef = useRef(null);
  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame) return;
    if (preferUrl && contentUrl) {
      frame.removeAttribute("srcdoc");
      frame.src = contentUrl + (contentUrl.includes("?") ? "&" : "?") + `_r=${refreshKey}`;
      return;
    }
    if (html) {
      frame.srcdoc = html;
      return;
    }
    if (contentUrl) {
      frame.removeAttribute("srcdoc");
      frame.src = contentUrl + (contentUrl.includes("?") ? "&" : "?") + `_r=${refreshKey}`;
    }
  }, [html, contentUrl, refreshKey, preferUrl]);
  if (!html && !contentUrl) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", fontSize: 13 }}>
        No preview content for {pageTitle || "this page"} yet.
      </div>
    );
  }
  return (
    <iframe
      ref={iframeRef}
      title={pageTitle || "CMS preview"}
      sandbox="allow-same-origin"
      style={{ width: "100%", height: "100%", border: 0, background: "#fff" }}
    />
  );
}

function bootstrapToFiles(bootstrap, pageId) {
  if (!bootstrap || !pageId) return [];
  const page = (bootstrap.pages || []).find((p) => p.id === pageId);
  if (!page) return [];
  const sections = bootstrap.sections_by_page?.[pageId] || [];
  const out = [
    { path: `pages/${page.slug || page.id}/index.html`, isNew: false },
    { path: `pages/${page.slug || page.id}/meta.json`, isNew: false },
  ];
  for (const s of sections) {
    out.push({ path: `sections/${s.section_type || "section"}/${s.section_name || s.id}.json`, isNew: false });
    const comps = bootstrap.components_by_section?.[s.id] || [];
    for (const c of comps) {
      out.push({
        path: `components/${s.section_type || "section"}/${c.component_type || c.id}.json`,
        isNew: false,
      });
    }
  }
  return out;
}

/* ─── Main app ──────────────────────────────────────────── */

function Studio() {
  const tweaks = window.useTweaks ? window.useTweaks({
    accent: "#E25A3C",
    showFilePulse: true,
    density: "comfortable",
  }) : null;
  const t = tweaks ? tweaks[0] : { accent: "#E25A3C", showFilePulse: true, density: "comfortable" };
  const setTweak = tweaks ? tweaks[1] : () => {};

  useEffect(() => {
    document.documentElement.style.setProperty("--accent", t.accent);
  }, [t.accent]);

  const ctx = useMemo(() => readStudioContext(), []);
  const [bootstrap, setBootstrap] = useState(null);
  const [pagePayload, setPagePayload] = useState(null);
  const [files, setFiles] = useState(STARTER_FILES);
  const panelTab = ctx.studioPanel === "imports" || ctx.studioPanel === "assets" ? "assets" : "preview";
  const [activeTab, setActiveTab] = useState(panelTab);
  const [phase, setPhase] = useState("Idle");
  const [activity, setActivity] = useState("Awaiting your move.");
  const [stats, setStats] = useState({ files: 0, lines: 0, time: "0s" });
  const [canvasMode, setCanvasMode] = useState("empty");
  const [device, setDevice] = useState("desktop");
  const [activeFile, setActiveFile] = useState(null);
  const [projectName, setProjectName] = useState("");
  const [workspaceLabel, setWorkspaceLabel] = useState("");
  const [userInitials, setUserInitials] = useState("IA");
  const [toast, setToast] = useState("");
  const [studioStatus, setStudioStatus] = useState(null);
  const [liveSession, setLiveSession] = useState(null);
  const [cmsAssets, setCmsAssets] = useState([]);
  const [liquidImports, setLiquidImports] = useState([]);
  const [conversions, setConversions] = useState([]);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [previewMode, setPreviewMode] = useState("published");
  const [uploadingTheme, setUploadingTheme] = useState(false);
  const draftTimerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const themeFileRef = useRef(null);
  const projectSlug = ctx.projectSlug;
  const pageId = ctx.pageId;

  useEffect(() => {
    tryCopyParentTheme();
    const onTheme = (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || data.type !== 'iam-cms-theme') return;
      applyCmsThemeVars(data.vars);
      if (data.slug) document.documentElement.setAttribute('data-theme', data.slug);
    };
    window.addEventListener('message', onTheme);
    return () => window.removeEventListener('message', onTheme);
  }, []);

  const saveDraft = (draftData, flush = false) => {
    if (!pageId) return;
    clearTimeout(draftTimerRef.current);
    const run = () => {
      apiJson(`/api/cms/pages/${encodeURIComponent(pageId)}/draft`, {
        method: "PUT",
        body: { draft_data: draftData, flush },
      }).catch(() => {});
    };
    if (flush) run();
    else draftTimerRef.current = setTimeout(run, 1400);
  };

  const refreshPreview = async (opts = {}) => {
    const focusId = opts.pageId || pageId;
    if (!focusId) return;
    const useDraft = opts.draft === true || previewMode === "draft";
    try {
      const qs = useDraft ? "?draft=1" : "";
      const payload = await apiJson(`/api/cms/pages/${encodeURIComponent(focusId)}${qs}`);
      setPagePayload(payload);
      if (payload.preview_html || payload.content_url) setCanvasMode("preview");
      setPreviewNonce((n) => n + 1);
      if (opts.mode) setPreviewMode(opts.mode);
    } catch (e) {
      showToast(e.message || "Preview refresh failed");
    }
  };

  const loadCmsContext = async (focusPageId) => {
    const bootQs = new URLSearchParams({ project_slug: projectSlug });
    if (focusPageId) bootQs.set("page_id", focusPageId);
    const data = await apiJson(`/api/cms/bootstrap?${bootQs.toString()}`);
    setBootstrap(data);
    setWorkspaceLabel(data.tenant?.name || projectSlug);
    if (data.active_theme?.css_vars) applyCmsThemeVars(data.active_theme.css_vars);
    if (data.active_theme?.slug) document.documentElement.setAttribute("data-theme", data.active_theme.slug);
    if (focusPageId) {
      const page = (data.pages || []).find((p) => p.id === focusPageId);
      setProjectName(page?.title || page?.route_path || projectSlug);
      const treeFiles = bootstrapToFiles(data, focusPageId);
      setFiles(treeFiles);
      setStats({ files: treeFiles.length, lines: treeFiles.length * 12, time: "live" });
      if (treeFiles.length) setCanvasMode("preview");
      if (data.live_session) setLiveSession(data.live_session);
    }
    return data;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await loadCmsContext(pageId || null);
        if (cancelled) return;
        const focusId = pageId || data.pages?.find((p) => p.is_homepage)?.id || data.pages?.[0]?.id;
        if (focusId) {
          const payload = await apiJson(`/api/cms/pages/${encodeURIComponent(focusId)}`);
          if (cancelled) return;
          setPagePayload(payload);
          if (payload.preview_html || payload.content_url) setCanvasMode("preview");
          const page = (data.pages || []).find((p) => p.id === focusId);
          if (page?.route_path) setActiveFile(page.route_path.replace(/^\//, "") || "home");
        }
      } catch (_) {
        if (!cancelled) setWorkspaceLabel(projectSlug);
      }
    })();
    try {
      const parentUser = window.parent?.__IAM_USER;
      const name = parentUser?.display_name || parentUser?.name || "";
      if (name) {
        const parts = String(name).trim().split(/\s+/);
        setUserInitials((parts[0]?.[0] || "I") + (parts[1]?.[0] || "A"));
      }
    } catch (_) {}
    return () => {
      cancelled = true;
    };
  }, [projectSlug, pageId]);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    const poll = () => {
      apiJson(`/api/cms/studio-status?page_id=${encodeURIComponent(pageId)}&project_slug=${encodeURIComponent(projectSlug)}`)
        .then((d) => { if (!cancelled) setStudioStatus(d); })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(id); };
  }, [pageId, projectSlug]);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    (async () => {
      try {
        const join = await apiJson("/api/cms/live-session/join", {
          method: "POST",
          body: { page_id: pageId },
        });
        if (!cancelled && join?.ok) setLiveSession(join);
      } catch (_) {}
    })();
    heartbeatRef.current = setInterval(() => {
      apiJson("/api/cms/live-session/heartbeat", {
        method: "POST",
        body: { page_id: pageId },
      }).catch(() => {});
    }, 15000);
    return () => {
      cancelled = true;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      clearTimeout(draftTimerRef.current);
      apiJson("/api/cms/live-session/leave", {
        method: "POST",
        body: { page_id: pageId },
      }).catch(() => {});
    };
  }, [pageId]);

  useEffect(() => {
    if (activeTab !== "assets") return;
    let cancelled = false;
    (async () => {
      try {
        const [assetsRes, importsRes, convRes] = await Promise.all([
          apiJson("/api/cms/assets"),
          apiJson("/api/cms/liquid-imports"),
          apiJson("/api/cms/conversions"),
        ]);
        if (cancelled) return;
        setCmsAssets(assetsRes.assets || []);
        setLiquidImports(importsRes.imports || []);
        setConversions(convRes.conversions || []);
      } catch (_) {}
    })();
    const id = setInterval(() => {
      apiJson("/api/cms/liquid-imports")
        .then((d) => setLiquidImports(d.imports || []))
        .catch(() => {});
      apiJson("/api/cms/conversions")
        .then((d) => setConversions(d.conversions || []))
        .catch(() => {});
    }, 12000);
    return () => { cancelled = true; clearInterval(id); };
  }, [activeTab]);

  useEffect(() => {
    if (!pageId || !bootstrap) return;
    const sections = bootstrap.sections_by_page?.[pageId] || [];
    const draftPayload = {
      page_id: pageId,
      sections: {},
      updated_at: Math.floor(Date.now() / 1000),
    };
    for (const s of sections) {
      draftPayload.sections[s.id] = s.section_data || {};
    }
    saveDraft(draftPayload, false);
  }, [pageId, bootstrap]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3200);
  };

  const handleShare = async () => {
    const url = `${location.origin}/dashboard/cms/${encodeURIComponent(projectSlug)}/pages`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "PrimeTech Studio", text: workspaceLabel, url });
        showToast("Shared studio link");
        return;
      }
      await navigator.clipboard.writeText(url);
      showToast("Studio link copied");
    } catch (e) {
      showToast(e.message || "Share cancelled");
    }
  };

  const handleDeploy = async () => {
    try {
      setPhase("Deploying");
      setActivity("Draft → override → version → publish…");
      const data = bootstrap || (await apiJson(`/api/cms/bootstrap?project_slug=${encodeURIComponent(projectSlug)}`));
      const pages = data.pages || [];
      const target = pageId
        ? pages.find((p) => p.id === pageId)
        : pages.find((p) => p.is_homepage) || pages[0];
      if (!target) throw new Error("No pages to publish");
      const sections = data.sections_by_page?.[target.id] || [];
      await apiJson(`/api/cms/pages/${encodeURIComponent(target.id)}/draft`, {
        method: "PUT",
        body: {
          draft_data: {
            page_id: target.id,
            sections: Object.fromEntries(sections.map((s) => [s.id, s.section_data || {}])),
          },
          flush: true,
        },
      });
      for (const s of sections) {
        await apiJson("/api/cms/overrides", {
          method: "POST",
          body: {
            project_slug: projectSlug,
            path: target.route_path || `/${target.slug}`,
            section: s.id,
            overrides_json: s.section_data || {},
          },
        }).catch(() => {});
      }
      await apiJson(`/api/cms/pages/${encodeURIComponent(target.id)}/snapshot`, { method: "POST", body: {} });
      const pub = await apiJson(`/api/cms/pages/${encodeURIComponent(target.id)}/publish`, { method: "POST", body: {} });
      setPhase("Ready");
      setActivity(`Published ${target.title || target.route_path} · ${(pub.override_chain || []).length} overrides`);
      showToast(`Deployed ${target.route_path || "/"}`);
      await loadCmsContext(target.id);
      setPreviewMode("published");
      await refreshPreview({ pageId: target.id, mode: "published" });
    } catch (e) {
      setPhase("Idle");
      setActivity("Deploy failed — check CMS bootstrap");
      showToast(e.message || "Deploy failed");
    }
  };

  const handleThemeImport = async (file) => {
    if (!file) return;
    setUploadingTheme(true);
    setActivity(`Uploading ${file.name}…`);
    try {
      const r2Key = `cms/liquid-imports/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`;
      const form = new FormData();
      form.append("file", file);
      form.append("bucket", "inneranimalmedia");
      form.append("key", r2Key);
      await apiJson("/api/r2/upload", { method: "POST", body: form });
      const importName = file.name.replace(/\.(zip|tar\.gz|tgz)$/i, "").replace(/[_-]+/g, " ");
      const sourceType = /\.tar\.gz$|\.tgz$/i.test(file.name) ? "shopify_tar_gz" : "shopify_zip";
      await apiJson("/api/cms/liquid-imports", {
        method: "POST",
        body: {
          import_name: importName,
          source_type: sourceType,
          r2_key: r2Key,
          r2_bucket: "inneranimalmedia",
          project_id: projectSlug,
        },
      });
      setActivity(`Theme import queued · ${importName}`);
      showToast("Shopify theme import queued — watch Assets tab for status");
      setActiveTab("assets");
      const importsRes = await apiJson("/api/cms/liquid-imports");
      setLiquidImports(importsRes.imports || []);
    } catch (e) {
      showToast(e.message || "Theme import failed");
    } finally {
      setUploadingTheme(false);
    }
  };

  const handleApplyImportToPage = (imp) => {
    const sections = imp?.sections_found || 0;
    askAgentSam(
      `[CMS · ${projectSlug}] Apply Shopify theme import "${imp.import_name}" (${sections} liquid sections) to page ${pageId || "homepage"}. Map cms_liquid_sections → cms_page_sections and redeploy.`,
      {
        task_type: "cms_edit",
        page_id: pageId,
        r2_key: pagePayload?.r2_key || null,
        live_url: pagePayload?.live_url || null,
      },
    );
    showToast("Agent Sam prompted to scaffold sections");
  };

  const handleRedeployWithAgent = () => {
    askAgentSam(
      `[CMS · ${projectSlug}] Update section content for page ${pageId || "current"} and redeploy (draft → publish). Current r2_key: ${pagePayload?.r2_key || "none"}. Live: ${pagePayload?.live_url || "n/a"}`,
      {
        task_type: "cms_edit",
        page_id: pageId,
        r2_key: pagePayload?.r2_key || null,
        live_url: pagePayload?.live_url || null,
        preview_mode: previewMode,
      },
    );
    showToast("Agent Sam ready — describe your section change");
  };

  const handleOpenLive = () => {
    const url = pagePayload?.live_url || pagePayload?.content_url;
    if (!url) {
      showToast("No live URL yet — publish first");
      return;
    }
    window.open(url, "_blank", "noopener");
  };

  const navigateToPage = (nextPageId) => {
    if (!nextPageId) return;
    const base = `/dashboard/cms/${encodeURIComponent(projectSlug)}/pages/${encodeURIComponent(nextPageId)}`;
    try {
      window.parent.postMessage({ type: "iam-cms-navigate", path: base }, window.location.origin);
    } catch (_) {}
    window.location.search = `?project=${encodeURIComponent(projectSlug)}&page=${encodeURIComponent(nextPageId)}&workspace_id=${encodeURIComponent(ctx.workspaceId || "")}`;
  };

  const tree = useMemo(() => buildTree(files), [files]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const onSketch = () => {
    try {
      window.parent.postMessage({ type: "iam-primetech-sketch", project: projectSlug }, "*");
    } catch (_) {}
    setActiveTab("preview");
    showToast("Sketch canvas opened");
  };

  const tabs = [
    { id: "preview", label: "Live preview", icon: "eye" },
    { id: "code", label: "Code", icon: "code" },
    { id: "schema", label: "Schema", icon: "db" },
    { id: "assets", label: "Assets", icon: "image" },
  ];

  return (
    <>
      <Topbar
        phase={phase}
        workspaceLabel={workspaceLabel}
        projectSlug={projectSlug}
        projectLabel={projectName || "New project"}
        userInitials={userInitials}
        onShare={handleShare}
        onDeploy={handleDeploy}
      />
      <div className="main">
        <div className="work">
          <div className="tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon id={tab.icon} size={12} />
                {tab.label}
              </button>
            ))}
            <div className="spacer"></div>
            <div className="tab-actions">
              {(bootstrap?.pages || []).length > 0 && (
                <select
                  className="ta"
                  value={pageId || ""}
                  onChange={(e) => navigateToPage(e.target.value)}
                  style={{ maxWidth: 180 }}
                >
                  {(bootstrap.pages || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.title || p.route_path || p.slug}</option>
                  ))}
                </select>
              )}
              <button className="ta">{stats.files} files · {stats.lines.toLocaleString()} lines</button>
              <button type="button" className="ta" onClick={() => { setPreviewMode("draft"); refreshPreview({ draft: true, mode: "draft" }); }}>Draft</button>
              <button type="button" className="ta primary" onClick={() => refreshPreview({ mode: previewMode })}><Icon id="refresh" size={11} /> Refresh</button>
              <button type="button" className="ta" onClick={handleRedeployWithAgent}><Icon id="bolt" size={11} /> Agent redeploy</button>
              <button type="button" className="ta primary" onClick={handleShare}><Icon id="share" size={11} /> Share</button>
            </div>
          </div>

          <div className="work-body">
            {/* File tree */}
            <div className="file-tree">
              <div className="tree-section">project</div>
              {flat.length === 0 && (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 11.5 }}>
                  Files will appear here as Agent Sam builds this project.
                </div>
              )}
              {flat.map((node, i) => (
                <div
                  key={i}
                  className={`tree-row ${node.dir ? "dir" : ""} ${node.isNew ? "new" : ""} ${activeFile === node.name ? "active" : ""} ${node.depth === 1 ? "nested" : node.depth >= 2 ? "nested2" : ""}`}
                  onClick={() => !node.dir && setActiveFile(node.name)}
                >
                  <span className="caret">{node.dir ? <Icon id="chev-d" size={9} /> : ""}</span>
                  <span className="ic">
                    <Icon id={node.dir ? "folder" : fileIcon(node.name)} size={12} />
                  </span>
                  <span className="name">{node.name}</span>
                  {node.isNew && t.showFilePulse && <span className="badge">NEW</span>}
                </div>
              ))}
            </div>

            {/* Canvas */}
            <div className="canvas-wrap">
              <div className="canvas-toolbar">
                <div className="seg">
                  <button className={device === "desktop" ? "on" : ""} onClick={() => setDevice("desktop")}><Icon id="desktop" size={11} /> Desktop</button>
                  <button className={device === "tablet" ? "on" : ""} onClick={() => setDevice("tablet")}><Icon id="tablet" size={11} /> Tablet</button>
                  <button className={device === "phone" ? "on" : ""} onClick={() => setDevice("phone")}><Icon id="phone" size={11} /> Phone</button>
                </div>
                <div className="url-bar">
                  <Icon id="bolt" size={10} className="lk" />
                  <span className="lk">{pagePayload?.live_url ? new URL(pagePayload.live_url).host : "preview"}</span>
                  <span className="lk">/</span>
                  <span className="pathseg">{activeFile ? activeFile.replace(/^\//, "").replace(/\.[^.]+$/, "") : "home"}</span>
                </div>
                <button type="button" className="ta primary" onClick={() => refreshPreview({ mode: previewMode })}><Icon id="refresh" size={11} /></button>
                <button type="button" className="ta primary" onClick={handleOpenLive}><Icon id="share" size={11} /> Open</button>
              </div>

              <div className="canvas">
                {activeTab === "preview" && canvasMode === "empty" && (
                  <EmptyCanvas onSketch={onSketch} showToast={showToast} />
                )}
                {activeTab === "preview" && canvasMode === "preview-skeleton" && (
                  <div className={`preview-frame ${device}`}><PreviewSkeleton /></div>
                )}
                {activeTab === "preview" && canvasMode === "preview" && (
                  <div className={`preview-frame ${device}`}>
                    <CmsHtmlPreview
                      html={previewMode === "draft" ? pagePayload?.preview_html : null}
                      contentUrl={pagePayload?.content_url}
                      pageTitle={projectName}
                      refreshKey={previewNonce}
                      preferUrl={previewMode === "published" && !!pagePayload?.content_url}
                    />
                  </div>
                )}
                {activeTab === "code" && (
                  files.length === 0
                    ? <EmptyCanvas onSketch={onSketch} showToast={showToast} />
                    : <CodeCanvas />
                )}
                {activeTab === "schema" && (
                  files.length === 0
                    ? <EmptyCanvas onSketch={onSketch} showToast={showToast} />
                    : <SchemaCanvas />
                )}
                {activeTab === "assets" && (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', gap: 12, padding: 12, overflow: 'auto' }}>
                    <div
                      style={{ border: '2px dashed var(--line)', borderRadius: 12, padding: 20, textAlign: 'center', cursor: 'pointer' }}
                      onClick={() => themeFileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleThemeImport(e.dataTransfer.files[0]); }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>
                        {uploadingTheme ? "Uploading theme…" : "Drop Shopify theme .tar.gz / .zip"}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        Extracts to R2 staging → conversion job → Agent Sam scaffold
                      </div>
                      <input ref={themeFileRef} type="file" accept=".zip,.tar.gz,.tgz" style={{ display: 'none' }}
                        onChange={(e) => handleThemeImport(e.target.files?.[0])} />
                    </div>
                    {liquidImports.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--muted)' }}>Theme imports</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {liquidImports.slice(0, 8).map((imp) => (
                            <div key={imp.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 10, border: '1px solid var(--line)', borderRadius: 8 }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500, fontSize: 13 }}>{imp.import_name}</div>
                                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                                  {imp.sections_found || 0} sections · {imp.status}
                                </div>
                              </div>
                              {imp.status === 'completed' && (
                                <button type="button" className="btn primary" onClick={() => handleApplyImportToPage(imp)}>Apply to page</button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {conversions.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                        Conversions: {conversions.slice(0, 5).map((c) => `${c.source_format}→${c.target_format} (${c.status})`).join(' · ')}
                      </div>
                    )}
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignContent: 'start' }}>
                      {(cmsAssets.length ? cmsAssets.slice(0, 16) : []).map((a) => (
                        <div key={a.id} style={{ aspectRatio: '4/3', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                          {a.thumbnail_url || a.public_url ? (
                            <img src={a.thumbnail_url || a.public_url} alt={a.label || a.filename} style={{ width: '100%', height: '70%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 11 }}>{a.mime_type || 'asset'}</div>
                          )}
                          <div style={{ padding: '6px 8px', fontSize: 10, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {a.label || a.filename || a.id}
                          </div>
                        </div>
                      ))}
                      {cmsAssets.length === 0 && (
                        <div style={{ gridColumn: '1/-1', color: 'var(--muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
                          No CMS assets yet — upload a Shopify theme or add images via Agent Sam.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Activity strip */}
              <div className="activity-strip">
                <span className={`dot ${liveSession?.session_id || studioStatus?.live_session ? "live" : "idle"}`}></span>
                <span><b>{phase}</b></span>
                <span className="ticker">
                  {activity}
                  {studioStatus?.active_plan_id ? ` · plan ${String(studioStatus.active_plan_id).slice(0, 10)}` : ""}
                  {studioStatus?.last_patch_session?.task_file ? ` · patch ${String(studioStatus.last_patch_session.task_file).split("/").pop()}` : ""}
                  {studioStatus?.publish_status ? ` · ${studioStatus.publish_status}` : ""}
                  {liveSession?.session_id ? ` · session ${String(liveSession.session_id).slice(0, 8)}` : studioStatus?.live_session?.session_id ? ` · session ${String(studioStatus.live_session.session_id).slice(0, 8)}` : ""}
                </span>
                <span className="stat"><b>{stats.files}</b> files</span>
                <span className="stat"><b>{stats.lines.toLocaleString()}</b> loc</span>
                <span className="stat"><b>{stats.time}</b></span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tweaks panel */}
      {window.TweaksPanel && (
        <window.TweaksPanel title="Tweaks">
          <window.TweakSection title="Theme">
            <window.TweakColor
              label="Accent"
              value={t.accent}
              options={["#E25A3C", "#2A5F4C", "#3D5A80", "#9C3D5C", "#1A1815"]}
              onChange={(v) => setTweak("accent", v)}
            />
          </window.TweakSection>
          <window.TweakSection title="Build animation">
            <window.TweakToggle
              label="Pulse new files"
              value={t.showFilePulse}
              onChange={(v) => setTweak("showFilePulse", v)}
            />
            <window.TweakButton onClick={() => {
              setFiles([]);
              setCanvasMode("empty");
              setActiveTab("preview");
              setPhase("Idle");
              setActivity("Awaiting your move.");
              setStats({ files: 0, lines: 0, time: "0s" });
              setProjectName("");
            }}>Reset session</window.TweakButton>
          </window.TweakSection>
          <window.TweakSection title="Try a prompt">
            <window.TweakButton onClick={() => askAgentSam('[CMS] A recipe CMS for a Mediterranean café')}>Recipe CMS</window.TweakButton>
            <window.TweakButton onClick={() => askAgentSam('[CMS] A reading-list app with weekly digests')}>Reading list</window.TweakButton>
            <window.TweakButton onClick={() => askAgentSam('[CMS] An internal admin for managing leads')}>Lead admin</window.TweakButton>
          </window.TweakSection>
        </window.TweaksPanel>
      )}
      {toast ? <div className="toast-banner" role="status">{toast}</div> : null}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<Studio />);
