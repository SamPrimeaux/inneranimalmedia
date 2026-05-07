import React from 'react';

type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'code'; lang: string | null; text: string };

function escapeInline(text: string) {
  // Render inline code safely without HTML.
  const parts: Array<{ t: 'text' | 'code'; v: string }> = [];
  const s = String(text ?? '');
  let i = 0;
  while (i < s.length) {
    const tick = s.indexOf('`', i);
    if (tick === -1) {
      parts.push({ t: 'text', v: s.slice(i) });
      break;
    }
    const tick2 = s.indexOf('`', tick + 1);
    if (tick2 === -1) {
      parts.push({ t: 'text', v: s.slice(i) });
      break;
    }
    if (tick > i) parts.push({ t: 'text', v: s.slice(i, tick) });
    parts.push({ t: 'code', v: s.slice(tick + 1, tick2) });
    i = tick2 + 1;
  }
  return parts;
}

function parseMarkdownLite(input: string): Block[] {
  const lines = String(input ?? '').replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];

  let i = 0;
  const flushParagraph = (buf: string[]) => {
    const trimmed = buf.map((l) => l.trimEnd());
    if (trimmed.join('').trim() === '') return;
    blocks.push({ type: 'paragraph', lines: trimmed });
  };

  while (i < lines.length) {
    const raw = lines[i] ?? '';

    // fenced code
    const fence = raw.match(/^```(\w+)?\s*$/);
    if (fence) {
      const lang = fence[1] ? fence[1] : null;
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !String(lines[i]).startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      // consume closing fence if present
      if (i < lines.length && String(lines[i]).startsWith('```')) i++;
      blocks.push({ type: 'code', lang, text: codeLines.join('\n') });
      continue;
    }

    // headings
    const h = raw.match(/^(#{1,4})\s+(.+)\s*$/);
    if (h) {
      const level = Math.min(h[1].length, 4) as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, text: h[2] });
      i++;
      continue;
    }

    // lists
    const ul = raw.match(/^\s*[-*]\s+(.+)\s*$/);
    const ol = raw.match(/^\s*\d+\.\s+(.+)\s*$/);
    if (ul) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = String(lines[i]).match(/^\s*[-*]\s+(.+)\s*$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }
    if (ol) {
      const items: string[] = [];
      while (i < lines.length) {
        const m = String(lines[i]).match(/^\s*\d+\.\s+(.+)\s*$/);
        if (!m) break;
        items.push(m[1]);
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // paragraph (collect until blank line)
    if (raw.trim() === '') {
      i++;
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && String(lines[i]).trim() !== '') {
      buf.push(lines[i]);
      i++;
    }
    flushParagraph(buf);
  }

  return blocks;
}

export default function MarkdownLite({ markdown }: { markdown: string }) {
  const blocks = parseMarkdownLite(markdown);
  return (
    <div style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.75 }}>
      {blocks.map((b, idx) => {
        if (b.type === 'heading') {
          const Tag = (b.level === 1 ? 'h1' : b.level === 2 ? 'h2' : b.level === 3 ? 'h3' : 'h4') as any;
          const size = b.level === 1 ? 20 : b.level === 2 ? 16 : b.level === 3 ? 14 : 13;
          return (
            <Tag
              key={idx}
              style={{
                margin: idx === 0 ? '0 0 10px' : '18px 0 10px',
                fontSize: size,
                fontWeight: 600,
                color: 'var(--text-main)',
                lineHeight: 1.25,
              }}
            >
              {b.text}
            </Tag>
          );
        }
        if (b.type === 'code') {
          return (
            <pre
              key={idx}
              style={{
                margin: '14px 0',
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--bg-code-pre)',
                border: '1px solid var(--border-subtle)',
                overflowX: 'auto',
                fontSize: 12,
                color: 'var(--text-main)',
              }}
            >
              <code>{b.text}</code>
            </pre>
          );
        }
        if (b.type === 'ul' || b.type === 'ol') {
          const ListTag = (b.type === 'ul' ? 'ul' : 'ol') as any;
          return (
            <ListTag key={idx} style={{ margin: '10px 0 10px 20px', padding: 0 }}>
              {b.items.map((it, j) => (
                <li key={j} style={{ margin: '6px 0' }}>
                  {escapeInline(it).map((p, k) =>
                    p.t === 'code' ? (
                      <code
                        key={k}
                        style={{
                          padding: '1px 6px',
                          borderRadius: 6,
                          background: 'var(--bg-panel)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-main)',
                          fontSize: 12,
                        }}
                      >
                        {p.v}
                      </code>
                    ) : (
                      <span key={k}>{p.v}</span>
                    ),
                  )}
                </li>
              ))}
            </ListTag>
          );
        }
        // paragraph
        return (
          <div key={idx} style={{ margin: '10px 0', whiteSpace: 'pre-wrap' }}>
            {b.lines.join('\n').split('\n').map((line, li) => (
              <div key={li}>
                {escapeInline(line).map((p, k) =>
                  p.t === 'code' ? (
                    <code
                      key={k}
                      style={{
                        padding: '1px 6px',
                        borderRadius: 6,
                        background: 'var(--bg-panel)',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-main)',
                        fontSize: 12,
                      }}
                    >
                      {p.v}
                    </code>
                  ) : (
                    <span key={k}>{p.v}</span>
                  ),
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

