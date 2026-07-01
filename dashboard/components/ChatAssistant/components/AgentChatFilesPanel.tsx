import type { FC } from 'react';
import type { Message } from '../types';

type Props = {
  messages: Message[];
  stagedCount: number;
  onAttach: () => void;
  onClose: () => void;
};

export const AgentChatFilesPanel: FC<Props> = ({ messages, stagedCount, onAttach, onClose }) => {
  const files = messages.flatMap((m, mi) => {
    const previews = m.attachmentPreviews || [];
    return previews.map((a, ai) => ({
      key: `${mi}-${ai}-${a.name}`,
      name: a.name,
      type: a.type,
      previewUrl: a.previewUrl,
      role: m.role,
    }));
  });

  return (
    <div className="border-b border-[var(--dashboard-border)] bg-[var(--scene-bg)] px-3 py-2 max-h-[min(40vh,280px)] overflow-y-auto chat-hide-scroll">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dashboard-muted)]">
          Chat files
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAttach}
            className="text-[11px] font-medium text-[var(--solar-cyan)] hover:underline"
          >
            Add file
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-[var(--dashboard-muted)] hover:text-[var(--dashboard-text)]"
          >
            Close
          </button>
        </div>
      </div>
      {stagedCount > 0 ? (
        <p className="text-[11px] text-[var(--dashboard-muted)] mb-2">
          {stagedCount} file{stagedCount === 1 ? '' : 's'} staged in composer — send to attach.
        </p>
      ) : null}
      {files.length ? (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.key}
              className="flex items-center gap-2 rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)]/60 px-2 py-1.5"
            >
              {f.previewUrl && f.type === 'image' ? (
                <img src={f.previewUrl} alt="" className="w-8 h-8 rounded object-cover shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded bg-[var(--bg-hover)] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] text-[var(--dashboard-text)]">{f.name}</p>
                <p className="text-[10px] text-[var(--dashboard-muted)] capitalize">{f.role}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12px] text-[var(--dashboard-muted)]">
          No files in this chat yet. Use the paperclip in the composer or the file icon to add attachments.
        </p>
      )}
    </div>
  );
};
