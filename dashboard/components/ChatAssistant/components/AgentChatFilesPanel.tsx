import type { FC } from 'react';
import type { Message, AgentGeneratedFile } from '../types';

type Props = {
  messages: Message[];
  stagedCount: number;
  onAttach: () => void;
  onClose: () => void;
  onOpenFile?: (file: AgentGeneratedFile) => void;
};

function kindIcon(kind: AgentGeneratedFile['kind']): string {
  const map: Record<AgentGeneratedFile['kind'], string> = {
    md: '📄', sql: '🗄️', ts: '📘', js: '📜', json: '📋', txt: '📃', other: '📁',
  };
  return map[kind] ?? '📁';
}

function extToKind(filename: string): AgentGeneratedFile['kind'] {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'md') return 'md';
  if (ext === 'sql') return 'sql';
  if (ext === 'ts' || ext === 'tsx') return 'ts';
  if (ext === 'js' || ext === 'jsx') return 'js';
  if (ext === 'json') return 'json';
  if (ext === 'txt') return 'txt';
  return 'other';
}

export const AgentChatFilesPanel: FC<Props> = ({ messages, stagedCount, onAttach, onClose, onOpenFile }) => {
  // User-uploaded attachments
  const uploaded = messages.flatMap((m, mi) =>
    (m.attachmentPreviews || []).map((a, ai) => ({
      key: `up-${mi}-${ai}`,
      name: a.name,
      type: a.type as 'image' | 'file',
      previewUrl: a.previewUrl,
    }))
  );

  // Agent-generated files (monaco_file_generated / RWS output)
  const generated = messages.flatMap((m, mi) =>
    (m.agentFiles || []).map((f, fi) => ({
      key: `gen-${mi}-${fi}`,
      file: f,
    }))
  );

  const empty = uploaded.length === 0 && generated.length === 0 && stagedCount === 0;

  return (
    <div className="border-b border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-3 py-2 max-h-[min(40vh,320px)] overflow-y-auto chat-hide-scroll">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dashboard-muted)]">
          Chat files
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onAttach}
            className="text-[11px] font-medium text-[var(--solar-cyan)] hover:underline">
            Add file
          </button>
          <button type="button" onClick={onClose}
            className="text-[11px] text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]">
            Close
          </button>
        </div>
      </div>

      {/* Staged badge */}
      {stagedCount > 0 && (
        <p className="text-[11px] text-[var(--dashboard-muted)] mb-2">
          {stagedCount} file{stagedCount === 1 ? '' : 's'} staged — send to attach.
        </p>
      )}

      {empty ? (
        <p className="text-[12px] text-[var(--dashboard-muted)]">
          No files yet. Attach files in the composer or ask Agent Sam to create one.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {/* Uploaded attachments */}
          {uploaded.map((f) => (
            <li key={f.key}
              className="flex items-center gap-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 px-2 py-1.5">
              {f.previewUrl && f.type === 'image' ? (
                <img src={f.previewUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-[var(--bg-hover)] flex items-center justify-center shrink-0 text-[16px]">
                  📎
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-[var(--dashboard-text)]">{f.name}</p>
                <p className="text-[10px] text-[var(--dashboard-muted)]">Attached</p>
              </div>
            </li>
          ))}

          {/* Agent-generated files */}
          {generated.map(({ key, file }) => (
            <li key={key}
              className="flex items-center gap-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 px-2 py-1.5 group">
              <div className="w-8 h-8 rounded bg-[var(--bg-hover)] flex items-center justify-center shrink-0 text-[16px]">
                {kindIcon(file.kind ?? extToKind(file.filename))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-[var(--dashboard-text)] font-medium">
                  {file.filename}
                </p>
                <p className="text-[10px] text-[var(--dashboard-muted)]">Agent output</p>
              </div>
              {onOpenFile && (
                <button
                  type="button"
                  onClick={() => onOpenFile(file)}
                  className="shrink-0 text-[10px] text-[var(--solar-cyan)] opacity-0 group-hover:opacity-100 transition-opacity hover:underline px-1"
                >
                  Open
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
