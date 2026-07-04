/**
 * StartupChipRow — single reusable chip row for all startup surfaces.
 *
 * Agent, Draw, Design Studio, and Editor all use .iam-chat-startup-chip
 * from chat-startup-center.css. This component owns the chip rendering so
 * there's one place to change layout, spacing, or accessibility.
 *
 * Usage:
 *   import { StartupChipRow } from '@/components/shell/chat-startup/StartupChipRow';
 *
 *   <StartupChipRow chips={[
 *     { id: 'image', label: 'Create an image', icon: ImageIcon, onClick: onCreateImage },
 *     { id: 'web',   label: 'Web search',      icon: Globe,      onClick: onWebSearch },
 *   ]} />
 */
import React, { type ElementType } from 'react';

export type StartupChip = {
  /** Stable key — used as React key and data-chip-id. */
  id: string;
  label: string;
  /** Any Lucide-compatible icon component. */
  icon: ElementType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>;
  disabled?: boolean;
  onClick: () => void;
};

type Props = {
  chips: StartupChip[];
  /** Additional class on the wrapper div. */
  className?: string;
  /** aria-label on the role="group" wrapper. Defaults to "Quick actions". */
  ariaLabel?: string;
};

export function StartupChipRow({ chips, className, ariaLabel = 'Quick actions' }: Props) {
  if (!chips.length) return null;
  return (
    <div
      className={`iam-chat-startup-chips${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={ariaLabel}
    >
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <button
            key={chip.id}
            type="button"
            className="iam-chat-startup-chip"
            disabled={chip.disabled}
            onClick={chip.onClick}
            data-chip-id={chip.id}
          >
            <Icon size={14} aria-hidden />
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
