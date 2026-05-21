import React, { useMemo } from 'react';
import { ClipboardCopy, X } from 'lucide-react';

export type CellDetailPayload = {
  datasourceLabel: string;
  tableName: string;
  columnName: string;
  rowKey: string | null;
  rawValue: unknown;
};

type Props = {
  payload: CellDetailPayload | null;
  onClose: () => void;
  onCopy: (text: string) => void;
};

function formatRaw(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

export function DatabaseCellDetailDrawer({ payload, onClose, onCopy }: Props) {
  const prettyJson = useMemo(() => {
    if (!payload) return null;
    const { rawValue } = payload;
    if (rawValue === null || rawValue === undefined) return null;
    if (typeof rawValue === 'object') {
      try {
        return JSON.stringify(rawValue, null, 2);
      } catch {
        return null;
      }
    }
    const text = String(rawValue).trim();
    if (!(text.startsWith('{') || text.startsWith('['))) return null;
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return null;
    }
  }, [payload]);

  if (!payload) return null;

  const copyText = formatRaw(payload.rawValue);

  return (
    <aside className="database-cell-drawer" role="dialog" aria-label="Cell detail">
      <div className="flex items-center justify-between border-b border-[var(--database-border)] px-4 py-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--database-text-muted)]">Cell detail</p>
          <p className="font-mono text-sm font-semibold">
            {payload.tableName}.{payload.columnName}
          </p>
        </div>
        <button type="button" onClick={onClose} className="rounded p-1 hover:bg-[var(--database-row-hover-bg)]" aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto px-4 py-3 text-[12px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px]">
          <dt className="text-[var(--database-text-muted)]">Datasource</dt>
          <dd>{payload.datasourceLabel}</dd>
          <dt className="text-[var(--database-text-muted)]">Table</dt>
          <dd>{payload.tableName}</dd>
          <dt className="text-[var(--database-text-muted)]">Column</dt>
          <dd>{payload.columnName}</dd>
          <dt className="text-[var(--database-text-muted)]">Row</dt>
          <dd className="break-all">{payload.rowKey ?? '—'}</dd>
        </dl>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--database-text-muted)]">Value</span>
            <button
              type="button"
              onClick={() => onCopy(copyText)}
              className="inline-flex items-center gap-1 rounded border border-[var(--database-border)] px-2 py-0.5 text-[10px] font-bold hover:bg-[var(--database-row-hover-bg)]"
            >
              <ClipboardCopy size={11} /> Copy
            </button>
          </div>
          {payload.rawValue === null || payload.rawValue === undefined ? (
            <span className="database-null-chip">NULL</span>
          ) : (
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--database-border)] bg-[var(--database-bg)] p-3 font-mono text-[11px]">
              {prettyJson ?? copyText}
            </pre>
          )}
        </div>
      </div>
    </aside>
  );
}
