import { useState, useEffect } from "react";

const IAM_DOCS_STYLE_ID = "iam-docs-settings-markdown-styles";

function injectIamDocsMarkdownStyles() {
  if (typeof document === "undefined" || document.getElementById(IAM_DOCS_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = IAM_DOCS_STYLE_ID;
  style.textContent = `
.docs-markdown h1 {
  font-size: 15px; font-weight: 600; color: var(--text-primary);
  margin: 0 0 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border);
}
.docs-markdown h2 {
  font-size: 12px; font-weight: 600; color: var(--accent);
  margin: 16px 0 6px; text-transform: uppercase; letter-spacing: 0.06em;
}
.docs-markdown h3 {
  font-size: 12px; font-weight: 600; color: var(--text-primary); margin: 12px 0 4px;
}
.docs-markdown code {
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 3px;
  padding: 1px 5px; font-size: 10.5px; color: var(--accent);
  font-family: var(--font-mono, monospace);
}
.docs-markdown pre {
  background: var(--bg-elevated); border: 1px solid var(--border); border-radius: 6px;
  padding: 10px 12px; overflow-x: auto; margin: 8px 0;
}
.docs-markdown pre code {
  background: none; border: none; padding: 0; color: var(--text-secondary); font-size: 11px;
}
.docs-markdown ul { padding-left: 16px; margin: 4px 0 8px; }
.docs-markdown li { margin-bottom: 3px; color: var(--text-secondary); }
.docs-markdown a { color: var(--accent); text-decoration: none; }
.docs-markdown a:hover { text-decoration: underline; }
.docs-markdown strong { color: var(--text-primary); font-weight: 600; }
.docs-markdown p { margin-bottom: 8px; color: var(--text-secondary); }
.docs-markdown table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px; }
.docs-markdown th {
  text-align: left; padding: 5px 8px; background: var(--bg-elevated);
  border: 1px solid var(--border); color: var(--accent);
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em;
}
.docs-markdown td { padding: 4px 8px; border: 1px solid var(--border); color: var(--text-secondary); }
.iam-docs-list-btn:hover {
  background: var(--bg-hover) !important;
  color: var(--text-primary) !important;
  border-left-color: var(--accent) !important;
}
`;
  document.head.appendChild(style);
}

function renderIamDocsMarkdown(md) {
  if (!md) return "";
  const esc = (s) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const inlineFmt = (s) => {
    const links = [];
    let x = String(s);
    x = x.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const i = links.length;
      links.push({ label, href });
      return `__IAM_LINK_${i}__`;
    });
    x = esc(x);
    x = x.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    x = x.replace(/\*(.+?)\*/g, "<em>$1</em>");
    x = x.replace(/`([^`]+)`/g, "<code>$1</code>");
    x = x.replace(/__IAM_LINK_(\d+)__/g, (_, i) => {
      const { label, href } = links[Number(i)];
      return `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    });
    return x;
  };
  let t = String(md);
  const fences = [];
  t = t.replace(/```[\w]*\n([\s\S]*?)```/g, (_, code) => {
    const id = fences.length;
    fences.push("<pre><code>" + esc(code) + "</code></pre>");
    return "\n%%FENCE" + id + "%%\n";
  });
  const parts = t.split(/\n%%FENCE(\d+)%%\n/);
  const htmlParts = parts.map((chunk, idx) => {
    if (idx % 2 === 1) return fences[Number(chunk)];
    const lines = chunk.split("\n");
    const rows = [];
    let buf = [];
    const flushPara = () => {
      if (!buf.length) return;
      const text = buf.join("\n").trim();
      if (text) rows.push("<p>" + inlineFmt(text) + "</p>");
      buf = [];
    };
    for (const line of lines) {
      const fenceMatch = line.match(/^%%FENCE(\d+)%%$/);
      if (fenceMatch) { flushPara(); rows.push(fences[Number(fenceMatch[1])]); continue; }
      if (/^### /.test(line)) { flushPara(); rows.push("<h3>" + inlineFmt(line.slice(4)) + "</h3>"); }
      else if (/^## /.test(line)) { flushPara(); rows.push("<h2>" + inlineFmt(line.slice(3)) + "</h2>"); }
      else if (/^# /.test(line)) { flushPara(); rows.push("<h1>" + inlineFmt(line.slice(2)) + "</h1>"); }
      else if (/^[\-\*] /.test(line)) { flushPara(); rows.push("<li>" + inlineFmt(line.slice(2)) + "</li>"); }
      else if (line.trim() === "") { flushPara(); }
      else { buf.push(line); }
    }
    flushPara();
    let h = rows.join("");
    h = h.replace(/(?:<li>.*?<\/li>\s*)+/g, (m) => `<ul>${m.trim()}</ul>`);
    return h;
  });
  return htmlParts.join("");
}

const DOCS = [
  { label: "Platform Overview", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/cursor/IAM-CURSOR-CONTEXT.md" },
  { label: "Deploy Runbook", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/deploy-runbook.md" },
  { label: "Worker Routing", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/worker-routing.md" },
  { label: "R2 Bucket Map", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/r2-bucket-map.md" },
  { label: "D1 Schema", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/d1-schema-overview.md" },
  { label: "Bindings Reference", group: "IAM Platform", url: "https://docs.inneranimalmedia.com/platform/bindings-reference.md" },
  { label: "AI Agents Overview", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/README.md" },
  { label: "Anthropic / Claude", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/anthropic.md" },
  { label: "OpenAI / GPT", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/openai.md" },
  { label: "Google Gemini", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/google-gemini.md" },
  { label: "Workers AI", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/workers-ai.md" },
  { label: "Auto Mode", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/auto-mode.md" },
  { label: "Tool Reference", group: "AI Providers", url: "https://docs.inneranimalmedia.com/agents/tool-reference.md" },
  { label: "How RAG Works", group: "AutoRAG", url: "https://docs.inneranimalmedia.com/autorag/architecture/how-rag-works.md" },
  { label: "All Clients", group: "Clients", url: "https://docs.inneranimalmedia.com/clients/README.md" },
];

export function DocsTab() {
  const [currentDoc, setCurrentDoc] = useState(null);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { injectIamDocsMarkdownStyles(); }, []);

  const groups = [...new Set(DOCS.map((d) => d.group))];
  const filtered = search
    ? DOCS.filter((d) =>
        d.label.toLowerCase().includes(search.toLowerCase()) ||
        d.group.toLowerCase().includes(search.toLowerCase()))
    : DOCS;

  async function loadDoc(doc) {
    setCurrentDoc(doc);
    setLoading(true);
    setContent("");
    try {
      const res = await fetch(doc.url, { mode: "cors", credentials: "omit" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      setContent(text);
    } catch (e) {
      setContent(`Failed to load document: ${e?.message || String(e)}`);
    }
    setLoading(false);
  }

  if (currentDoc) {
    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
        <div style={{
          padding: "8px 12px", borderBottom: "1px solid var(--border)",
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
          background: "var(--bg-elevated)",
        }}>
          <button
            type="button"
            onClick={() => setCurrentDoc(null)}
            style={{
              background: "none", border: "none", color: "var(--text-muted)",
              cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4,
              display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit",
            }}
          >
            Back
          </button>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>
            {currentDoc.group} / {currentDoc.label}
          </span>
          <a
            href="https://docs.inneranimalmedia.com/index.html"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 10, color: "var(--accent)", textDecoration: "none" }}
          >
            Open full docs
          </a>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 16, fontSize: 12, lineHeight: 1.7, color: "var(--text-secondary)" }}>
          {loading ? (
            <div style={{ color: "var(--text-muted)", textAlign: "center", padding: 40, fontSize: 11 }}>Loading</div>
          ) : (
            <div className="docs-markdown" dangerouslySetInnerHTML={{ __html: renderIamDocsMarkdown(content) }} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Filter docs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%", background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "var(--text-primary)",
            fontFamily: "var(--font-mono, monospace)", outline: "none",
          }}
        />
      </div>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <a
          href="https://docs.inneranimalmedia.com/index.html"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 10px", background: "var(--bg-elevated)", border: "1px solid var(--border)",
            borderRadius: 6, textDecoration: "none", color: "var(--text-secondary)",
            fontSize: 11, transition: "border-color 150ms",
          }}
        >
          <span>docs.inneranimalmedia.com</span>
          <span style={{ color: "var(--accent)" }} aria-hidden="true">+</span>
        </a>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {groups.map((group) => {
          const items = filtered.filter((d) => d.group === group);
          if (!items.length) return null;
          return (
            <div key={group}>
              <div style={{
                fontSize: 9, fontWeight: 600, textTransform: "uppercase",
                letterSpacing: "0.1em", color: "var(--text-muted)", padding: "8px 12px 4px",
              }}>
                {group}
              </div>
              {items.map((doc) => (
                <button
                  key={doc.url}
                  type="button"
                  className="iam-docs-list-btn"
                  onClick={() => loadDoc(doc)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 8,
                    padding: "5px 12px", background: "none", border: "none",
                    color: "var(--text-secondary)", fontSize: 11, cursor: "pointer",
                    textAlign: "left", borderLeft: "2px solid transparent",
                    transition: "all 100ms", fontFamily: "inherit",
                  }}
                >
                  <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>-</span>
                  {doc.label}
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
