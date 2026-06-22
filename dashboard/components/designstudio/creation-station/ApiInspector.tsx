import React from 'react';
import { Copy } from 'lucide-react';

type Props = {
  request: string;
  response: string;
  open: boolean;
  onToggle: () => void;
};

export function ApiInspector({ request, response, open, onToggle }: Props) {
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="hidden lg:flex absolute right-0 top-1/2 -translate-y-1/2 z-30 w-8 h-16 items-center justify-center rounded-l-lg border border-r-0 border-[var(--border-subtle)] bg-[var(--bg-panel)] text-[10px] font-bold text-[var(--text-muted)] hover:text-[var(--solar-cyan)]"
      >
        API
      </button>
    );
  }

  return (
    <aside className="hidden lg:flex flex-col w-[min(340px,28vw)] border-l border-[var(--border-subtle)] bg-[#0d0f14] shrink-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
        <span className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">API</span>
        <button type="button" onClick={onToggle} className="text-[10px] text-[var(--text-muted)] hover:text-white">
          Hide
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold uppercase text-[var(--text-muted)]">Request</span>
            {request ? (
              <button type="button" onClick={() => copy(request)} className="text-[var(--text-muted)] hover:text-white">
                <Copy size={12} />
              </button>
            ) : null}
          </div>
          <pre className="text-[9px] leading-relaxed text-emerald-300/90 whitespace-pre-wrap break-all bg-black/30 rounded-lg p-2 border border-white/5">
            {request || 'Run a generation to see the cURL request.'}
          </pre>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold uppercase text-[var(--text-muted)]">Response</span>
            {response ? (
              <button type="button" onClick={() => copy(response)} className="text-[var(--text-muted)] hover:text-white">
                <Copy size={12} />
              </button>
            ) : null}
          </div>
          <pre className="text-[9px] leading-relaxed text-sky-300/90 whitespace-pre-wrap break-all bg-black/30 rounded-lg p-2 border border-white/5 max-h-[40vh] overflow-y-auto">
            {response || '{}'}
          </pre>
        </div>
      </div>
    </aside>
  );
}
