import React from 'react';
import { CodeXml, Globe, Image as ImageIcon } from 'lucide-react';

export type ComposerStartupChipsProps = {
  onCreateImage: () => void;
  onWebSearch: () => void;
  onOpenEditor: () => void;
};

export function ComposerStartupChips({
  onCreateImage,
  onWebSearch,
  onOpenEditor,
}: ComposerStartupChipsProps) {
  return (
    <div className="iam-chat-startup-chips" role="group" aria-label="Quick actions">
      <button type="button" className="iam-chat-startup-chip" onClick={onCreateImage}>
        <ImageIcon size={14} aria-hidden />
        Create an image
      </button>
      <button type="button" className="iam-chat-startup-chip" onClick={onWebSearch}>
        <Globe size={14} aria-hidden />
        Web search
      </button>
      <button type="button" className="iam-chat-startup-chip" onClick={onOpenEditor}>
        <CodeXml size={14} aria-hidden />
        Open editor
      </button>
    </div>
  );
}

export function ComposerStartupGreeting({ isDarkTheme }: { isDarkTheme: boolean }) {
  return (
    <div className="iam-chat-startup-greeting">
      <img
        src={
          isDarkTheme
            ? 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/dbb316af-9c97-4959-f09f-bf58b2783d00/avatar'
            : 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar'
        }
        alt="Inner Animal Media"
        width={72}
        height={72}
      />
      <p className="text-[15px] font-semibold text-[var(--dashboard-text)]">What should we work on?</p>
      <p className="text-[12px] text-[var(--dashboard-muted)] leading-relaxed max-w-sm">
        Type below to start a conversation with Agent Sam.
      </p>
    </div>
  );
}
