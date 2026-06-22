import React from 'react';
import { Copy, X } from 'lucide-react';

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

  if (!open) return null;

  return (
    <aside className="flex flex-col flex-1 min-h-0 w-full bg-[#0a0b10]">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06]">
        <span className="text-[11px] font-semibold text-zinc-400">API</span>
        <button type="button" onClick={onToggle} className="p-1 text-zinc-500 hover:text-zinc-200">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-3 space-y-4">
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase text-zinc-500">Request</span>
            {request ? (
              <button type="button" onClick={() => copy(request)} className="text-zinc-500 hover:text-zinc-200">
                <Copy size={12} />
              </button>
            ) : null}
          </div>
          <pre className="text-[10px] leading-relaxed text-emerald-300/85 whitespace-pre-wrap break-all bg-black/50 rounded-lg p-3 border border-white/[0.04] max-h-[40vh] overflow-y-auto">
            {request || 'Run a generation to see the cURL request.'}
          </pre>
        </section>
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase text-zinc-500">Response</span>
            {response ? (
              <button type="button" onClick={() => copy(response)} className="text-zinc-500 hover:text-zinc-200">
                <Copy size={12} />
              </button>
            ) : null}
          </div>
          <pre className="text-[10px] leading-relaxed text-sky-300/85 whitespace-pre-wrap break-all bg-black/50 rounded-lg p-3 border border-white/[0.04] max-h-[40vh] overflow-y-auto">
            {response || '{}'}
          </pre>
        </section>
      </div>
    </aside>
  );
}
