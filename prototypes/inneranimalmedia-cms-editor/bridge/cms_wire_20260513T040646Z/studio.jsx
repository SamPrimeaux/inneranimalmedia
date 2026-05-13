/* global React, ReactDOM */
const { useState, useEffect, useRef, useMemo } = React;

const Icon = ({ id, size = 14, className = "" }) => (
  <svg width={size} height={size} className={className} aria-hidden="true">
    <use href={`#i-${id}`} />
  </svg>
);

/* ─── Build script ──────────────────────────────────────── */
// Simulated build: each step adds files, posts an activity line,
// and advances the canvas. Tuned to feel like real work.

const BUILD_SCRIPT = [
  { delay: 350, log: "Parsing intent · extracting domain entities", phase: "Planning" },
  { delay: 550, log: "Spec drafted: 4 entities, 7 routes, 2 background jobs", phase: "Planning" },
  { delay: 400, addFiles: ["spec/PROJECT.md", "spec/schema.yaml"], log: "+ spec/PROJECT.md  + spec/schema.yaml", phase: "Planning" },
  { delay: 500, addFiles: ["app/routes.ts"], log: "Scaffolding routes …", phase: "Scaffolding" },
  { delay: 450, addFiles: ["db/migrations/001_init.sql", "db/seed.ts"], log: "+ db/migrations/001_init.sql", phase: "Scaffolding" },
  { delay: 600, addFiles: ["app/models/User.ts", "app/models/Project.ts", "app/models/Asset.ts", "app/models/Comment.ts"], log: "Generated 4 models from schema", phase: "Models", switchCanvas: "schema" },
  { delay: 600, addFiles: ["app/api/projects.ts", "app/api/assets.ts", "app/api/comments.ts"], log: "Wired API handlers · 7 endpoints", phase: "API" },
  { delay: 550, addFiles: ["app/ui/Layout.tsx", "app/ui/Sidebar.tsx", "app/ui/Composer.tsx"], log: "Composing UI shell", phase: "UI", switchCanvas: "code" },
  { delay: 700, addFiles: ["app/ui/Canvas.tsx", "app/ui/FileTree.tsx", "app/ui/Hero.tsx"], log: "Hero · cards · file tree", phase: "UI" },
  { delay: 500, addFiles: ["app/lib/claude.ts", "app/lib/stream.ts"], log: "Anthropic client wired · streaming on", phase: "AI" },
  { delay: 450, addFiles: ["public/og.png", "public/favicon.svg", "tailwind.config.ts"], log: "Theming · tokens · brand assets", phase: "UI" },
  { delay: 800, log: "Compiling · 142 modules · 0 errors", phase: "Building", switchCanvas: "preview-skeleton" },
  { delay: 900, log: "Hot reload ready · http://localhost:3000", phase: "Ready", switchCanvas: "preview", status: "done" },
];

/* Initial files when nothing has been built */
const STARTER_FILES = [];

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

function Topbar({ phase, building }) {
  return (
    <div className="topbar">
      <div className="logo-mark">A</div>
      <div className="brand">Atelier<em>.</em></div>
      <div className="crumbs">
        <span>Studios</span>
        <span className="slash">/</span>
        <span>Saskia's workspace</span>
        <span className="slash">/</span>
        <span className="current">Untitled project</span>
      </div>
      <div className="spacer"></div>
      <span className="pill">
        <span className="dot"></span>
        {building ? phase : "Idle · ready"}
      </span>
      <button className="btn"><Icon id="share" />Share</button>
      <button className="btn primary"><Icon id="deploy" />Deploy</button>
      <div className="avatar">SK</div>
    </div>
  );
}

function Welcome({ onPick, onSendExample }) {
  const starters = [
    { ic: "doc", color: "var(--accent-3)", label: "Use a template", desc: "Blog · SaaS · Storefront · Admin", kbd: "T" },
    { ic: "image", color: "var(--blue)", label: "Add a screenshot", desc: "Match an existing UI", kbd: "S" },
    { ic: "code", color: "var(--ink-2)", label: "Connect a codebase", desc: "Continue from a repo", kbd: "C" },
    { ic: "figma", color: "var(--red)", label: "Drop in a Figma file", desc: "Bring tokens + components", kbd: "F" },
  ];
  const examples = [
    "A recipe CMS for a Mediterranean café",
    "A reading-list app with weekly digests",
    "An internal admin for managing leads",
    "A subscription paywall on top of my blog",
  ];
  return (
    <div>
      <div className="welcome">
        <h1>Start with <em>context.</em></h1>
        <p>Designs grounded in real materials turn out better. Drop a screenshot, point at a repo, or just describe what you're after.</p>
      </div>
      <div className="starters">
        {starters.map((s) => (
          <button key={s.label} className="starter" onClick={() => onPick(s.label)}>
            <span className="ic" style={{ background: s.color }}><Icon id={s.ic} size={14} /></span>
            <span className="body">
              <div className="label">{s.label}</div>
              <div className="desc">{s.desc}</div>
            </span>
            <span className="kbd">{s.kbd}</span>
          </button>
        ))}
      </div>
      <div className="examples-label">Or try one of these</div>
      {examples.map((ex) => (
        <div key={ex} className="example" onClick={() => onSendExample(ex)}>
          <Icon id="sparkle" />
          <span>{ex}</span>
          <Icon id="chev" className="arr" size={12} />
        </div>
      ))}
    </div>
  );
}

function Composer({ value, setValue, onSend, disabled }) {
  const taRef = useRef(null);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "44px";
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px";
  }, [value]);

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) onSend();
    }
  };
  return (
    <div className="composer">
      <div className="composer-box">
        <textarea
          ref={taRef}
          value={value}
          placeholder="Describe what you want to build…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          disabled={disabled}
        />
        <div className="composer-row">
          <button className="chip" title="Settings"><Icon id="settings" /></button>
          <button className="chip" title="Attach"><Icon id="paperclip" /></button>
          <button className="chip" title="Voice"><Icon id="mic" /></button>
          <button className="model">
            <Icon id="sparkle" size={11} />
            Claude Sonnet 4.5
            <Icon id="chev-d" size={11} />
          </button>
          <button className="send" disabled={disabled || !value.trim()} onClick={onSend}>
            <Icon id="send" size={11} /> Build
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMessages({ messages, building }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, building]);

  return (
    <div className="chat-scroll" ref={scrollRef}>
      {messages.map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          <div className="av">{m.role === "user" ? "S" : "A"}</div>
          <div className="body">
            <div className="meta">
              <b style={{ color: "var(--ink)", fontWeight: 500 }}>{m.role === "user" ? "Saskia" : "Atelier"}</b>
              <span>·</span>
              <span>{m.time}</span>
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{m.text}</div>
            {m.tags && (
              <div className="pill-row">
                {m.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
            {m.actions && m.actions.map((a, j) => (
              <div key={j} className={`action-card ${a.done ? "done" : ""}`}>
                <span className="spin"></span>
                <span>{a.label}</span>
                {a.done && a.detail && <span style={{ marginLeft: "auto", color: "var(--muted)", fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>{a.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Canvas content variants ───────────────────────────── */

function EmptyCanvas({ onSketch }) {
  return (
    <div className="empty">
      <Icon id="sparkle" size={28} className="" />
      <div className="title">Your studio is empty</div>
      <div className="sub">Describe an idea on the left and watch it materialize here — files, schema, UI, and a live preview, all at once.</div>
      <button className="cta" onClick={onSketch}><Icon id="plus" size={11} /> Start with a sketch</button>
    </div>
  );
}

function CodeCanvas({ typed }) {
  return (
    <pre className="code-pane" aria-label="Generated code">
      <code>
        <div><span className="ln">1</span><span className="c">// app/api/projects.ts — generated by Atelier</span></div>
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

function BuiltAppPreview({ projectName }) {
  return (
    <div className="built-app">
      <div className="nav">
        <div className="nav-logo"><span className="ico"></span> {projectName || "Folio"}</div>
        <div className="nav-links">
          <a>Recipes</a>
          <a>Menu</a>
          <a>Story</a>
          <a>Visit</a>
        </div>
        <div className="nav-cta">Reserve</div>
      </div>
      <div className="body">
        <h1 className="h1">A neighborhood kitchen, written down.</h1>
        <p className="lede">Mediterranean cooking, weekly menus, and the recipes regulars keep asking for — published from a CMS you can edit like a doc.</p>
        <div className="btn-row">
          <button className="btn-primary">Browse recipes →</button>
          <button className="btn-ghost">This week's menu</button>
        </div>
        <div className="cards">
          {[
            { title: "Saffron orzo, lemon", desc: "Weekday · 25m · serves 4", emoji: "◐" },
            { title: "Burnt-honey halloumi", desc: "Brunch · 15m · serves 2", emoji: "◇" },
            { title: "Charred greens, tahini", desc: "Side · 12m · serves 4", emoji: "◑" },
          ].map(c => (
            <div className="card" key={c.title}>
              <div className="chip">{c.emoji}</div>
              <h3>{c.title}</h3>
              <p>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
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

  const [composerValue, setComposerValue] = useState("");
  const [messages, setMessages] = useState([]);
  const [files, setFiles] = useState(STARTER_FILES);
  const [activeTab, setActiveTab] = useState("preview"); // preview | code | schema
  const [building, setBuilding] = useState(false);
  const [phase, setPhase] = useState("Idle");
  const [activity, setActivity] = useState("Awaiting your move.");
  const [stats, setStats] = useState({ files: 0, lines: 0, time: "0s" });
  const [canvasMode, setCanvasMode] = useState("empty"); // empty | preview-skeleton | preview | code | schema
  const [device, setDevice] = useState("desktop"); // desktop | tablet | phone
  const [activeFile, setActiveFile] = useState(null);
  const [projectName, setProjectName] = useState("");
  const buildStart = useRef(null);
  const buildTimer = useRef(null);

  const tree = useMemo(() => buildTree(files), [files]);
  const flat = useMemo(() => flattenTree(tree), [tree]);

  const startBuild = (prompt) => {
    setBuilding(true);
    setActiveTab("preview");
    setCanvasMode("preview-skeleton");
    buildStart.current = Date.now();

    // Determine a project name from the prompt
    const inferredName = (() => {
      if (/recipe|café|cafe|menu|kitchen/i.test(prompt)) return "Folio";
      if (/reading|digest|blog/i.test(prompt)) return "Margins";
      if (/admin|lead|crm/i.test(prompt)) return "Console";
      return "Untitled";
    })();
    setProjectName(inferredName);

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((m) => [
      ...m,
      { role: "user", text: prompt, time: now },
      { role: "ai", time: now,
        text: "Working on it. I'll plan the schema, scaffold routes, generate the UI, and stream a live preview as it builds.",
        tags: ["claude-sonnet-4-5", "full-stack", "Anthropic SDK"],
        actions: [
          { label: "Plan domain & schema", done: false },
          { label: "Scaffold backend + DB", done: false },
          { label: "Compose UI from templates", done: false },
          { label: "Boot preview server", done: false },
        ],
      },
    ]);

    let idx = 0;
    const runStep = () => {
      if (idx >= BUILD_SCRIPT.length) {
        setBuilding(false);
        setPhase("Ready");
        setActivity("Build complete · preview live at localhost:3000");
        // mark all actions done
        setMessages((ms) => {
          const out = [...ms];
          const last = out[out.length - 1];
          if (last && last.actions) {
            last.actions = last.actions.map(a => ({ ...a, done: true }));
          }
          return out;
        });
        return;
      }
      const step = BUILD_SCRIPT[idx];
      buildTimer.current = setTimeout(() => {
        if (step.addFiles) {
          setFiles((prev) => {
            const next = [...prev];
            step.addFiles.forEach((p) => {
              if (!next.find((f) => f.path === p)) next.push({ path: p, isNew: true });
            });
            // Clear isNew on old additions
            return next.map((f, i) => i < prev.length ? { ...f, isNew: false } : f);
          });
        }
        if (step.phase) setPhase(step.phase);
        if (step.log) setActivity(step.log);
        if (step.switchCanvas) setCanvasMode(step.switchCanvas);

        // progressively mark message actions done
        const actionMap = {
          "Planning": 0,
          "Scaffolding": 1,
          "Models": 1,
          "API": 1,
          "UI": 2,
          "AI": 2,
          "Building": 3,
          "Ready": 3,
        };
        const completeIdx = actionMap[step.phase];
        if (completeIdx != null) {
          setMessages((ms) => {
            const out = [...ms];
            const last = out[out.length - 1];
            if (last && last.actions) {
              last.actions = last.actions.map((a, j) => j <= completeIdx ? { ...a, done: true } : a);
            }
            return out;
          });
        }

        // stats
        const elapsed = Math.round((Date.now() - buildStart.current) / 1000);
        setStats((s) => ({
          files: (step.addFiles ? s.files + step.addFiles.length : s.files),
          lines: s.lines + Math.floor(Math.random() * 80 + 40),
          time: `${elapsed}s`,
        }));

        idx++;
        runStep();
      }, step.delay);
    };
    runStep();
  };

  useEffect(() => () => clearTimeout(buildTimer.current), []);

  const onSend = () => {
    if (!composerValue.trim() || building) return;
    const v = composerValue.trim();
    setComposerValue("");
    startBuild(v);
  };

  const onSendExample = (text) => {
    setComposerValue(text);
    setTimeout(() => startBuild(text), 60);
  };

  const onSketch = () => {
    setComposerValue("A recipe CMS for a Mediterranean café");
  };

  const tabs = [
    { id: "preview", label: "Live preview", icon: "eye" },
    { id: "code", label: "Code", icon: "code" },
    { id: "schema", label: "Schema", icon: "db" },
    { id: "assets", label: "Assets", icon: "image" },
  ];

  return (
    <>
      <Topbar phase={phase} building={building} />
      <div className="main">
        {/* LEFT: Chat */}
        <div className="chat">
          <div className="chat-header">
            <h2>{projectName ? projectName : "New project"}</h2>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="icon-btn" title="History"><Icon id="history" /></button>
              <button className="icon-btn" title="New"><Icon id="plus" /></button>
            </div>
          </div>
          {messages.length === 0 ? (
            <div className="chat-scroll">
              <Welcome onPick={(l) => setComposerValue(l + ": ")} onSendExample={onSendExample} />
            </div>
          ) : (
            <ChatMessages messages={messages} building={building} />
          )}
          <Composer
            value={composerValue}
            setValue={setComposerValue}
            onSend={onSend}
            disabled={building}
          />
        </div>

        {/* RIGHT: Workspace */}
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
                {tab.id === "preview" && building && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginLeft: 4 }}></span>}
              </button>
            ))}
            <div className="spacer"></div>
            <div className="tab-actions">
              <button className="ta">{stats.files} files · {stats.lines.toLocaleString()} lines</button>
              <button className="ta primary"><Icon id="refresh" size={11} /> Refresh</button>
              <button className="ta primary"><Icon id="share" size={11} /> Share</button>
            </div>
          </div>

          <div className="work-body">
            {/* File tree */}
            <div className="file-tree">
              <div className="tree-section">project</div>
              {flat.length === 0 && (
                <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--muted)', fontSize: 11.5 }}>
                  Files will appear here as Atelier writes them.
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
                  <span className="lk">localhost:3000</span>
                  <span className="lk">/</span>
                  <span className="pathseg">{activeFile ? activeFile.replace(/\.[^.]+$/, "") : "home"}</span>
                </div>
                <button className="ta primary"><Icon id="refresh" size={11} /></button>
                <button className="ta primary"><Icon id="share" size={11} /> Open</button>
              </div>

              <div className="canvas">
                {canvasMode !== "empty" && (
                  <div className={`build-status ${!building ? "done" : ""}`}>
                    <span className="dot"></span>
                    {building ? `${phase}…` : "Live · synced just now"}
                  </div>
                )}
                {activeTab === "preview" && canvasMode === "empty" && (
                  <EmptyCanvas onSketch={onSketch} />
                )}
                {activeTab === "preview" && canvasMode === "preview-skeleton" && (
                  <div className={`preview-frame ${device}`}><PreviewSkeleton /></div>
                )}
                {activeTab === "preview" && canvasMode === "preview" && (
                  <div className={`preview-frame ${device}`}><BuiltAppPreview projectName={projectName} /></div>
                )}
                {activeTab === "code" && (
                  files.length === 0
                    ? <EmptyCanvas onSketch={onSketch} />
                    : <CodeCanvas />
                )}
                {activeTab === "schema" && (
                  files.length === 0
                    ? <EmptyCanvas onSketch={onSketch} />
                    : <SchemaCanvas />
                )}
                {activeTab === "assets" && (
                  <div style={{ width: '100%', height: '100%', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignContent: 'start' }}>
                    {files.length === 0 ? <div style={{ gridColumn: '1/-1' }}><EmptyCanvas onSketch={onSketch} /></div> :
                      [...Array(8)].map((_, i) => (
                        <div key={i} style={{ aspectRatio: '4/3', background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 10, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                          asset_{(i+1).toString().padStart(2, '0')}
                        </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity strip */}
              <div className="activity-strip">
                <span className={`dot ${building ? "" : "idle"}`}></span>
                <span><b>{phase}</b></span>
                <span className="ticker">{activity}</span>
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
              setMessages([]);
              setCanvasMode("empty");
              setActiveTab("preview");
              setPhase("Idle");
              setActivity("Awaiting your move.");
              setStats({ files: 0, lines: 0, time: "0s" });
              setProjectName("");
            }}>Reset session</window.TweakButton>
          </window.TweakSection>
          <window.TweakSection title="Try a prompt">
            <window.TweakButton onClick={() => onSendExample("A recipe CMS for a Mediterranean café")}>Recipe CMS</window.TweakButton>
            <window.TweakButton onClick={() => onSendExample("A reading-list app with weekly digests")}>Reading list</window.TweakButton>
            <window.TweakButton onClick={() => onSendExample("An internal admin for managing leads")}>Lead admin</window.TweakButton>
          </window.TweakSection>
        </window.TweaksPanel>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("app")).render(<Studio />);
