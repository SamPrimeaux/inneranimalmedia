import React from 'react';

/** Uniform shell dropdown width — repo/branch and connection menus share this. */
export const SHELL_DROPDOWN_WIDTH_PX = 320;
export const SHELL_DROPDOWN_MAX_HEIGHT = 'min(380px, 55vh)';

type ShellDropdownPanelProps = {
  title?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** `floating` = App portal; `anchored` = absolute under trigger */
  variant?: 'floating' | 'anchored';
  className?: string;
  role?: string;
  'aria-label'?: string;
};

export function ShellDropdownPanel({
  title,
  children,
  footer,
  variant = 'floating',
  className = '',
  role = 'dialog',
  'aria-label': ariaLabel,
}: ShellDropdownPanelProps) {
  const position =
    variant === 'anchored'
      ? 'absolute top-full left-0 mt-1 z-[70]'
      : '';

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`iam-shell-dropdown flex flex-col overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] shadow-xl ${position} ${className}`}
      style={{
        width: SHELL_DROPDOWN_WIDTH_PX,
        maxWidth: '92vw',
        maxHeight: SHELL_DROPDOWN_MAX_HEIGHT,
      }}
    >
      {title != null ? (
        <div className="iam-shell-dropdown__header shrink-0 border-b border-[var(--border-subtle)] px-3 py-2 text-[0.6875rem] font-semibold text-[var(--text-main)] truncate font-[var(--font-sans)]">
          {title}
        </div>
      ) : null}
      <div className="iam-shell-dropdown__body flex flex-col flex-1 min-h-0 overflow-hidden">{children}</div>
      {footer != null ? (
        <div className="iam-shell-dropdown__footer shrink-0 border-t border-[var(--border-subtle)] bg-[var(--bg-app)]/40">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

type ShellDropdownRowProps = {
  label: string;
  hint?: string;
  badge?: string;
  onClick?: () => void;
  disabled?: boolean;
};

export function ShellDropdownRow({ label, hint, badge, onClick, disabled }: ShellDropdownRowProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="iam-shell-dropdown__row w-full text-left px-3 py-2 hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors border-b border-[var(--border-subtle)]/30 last:border-b-0"
    >
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[0.6875rem] text-[var(--text-main)] font-[var(--font-sans)]">{label}</span>
          {hint ? (
            <span className="block text-[10px] text-[var(--text-muted)] truncate mt-0.5 font-[var(--font-sans)]">
              {hint}
            </span>
          ) : null}
        </span>
        {badge ? (
          <span className="shrink-0 text-[0.5625rem] font-semibold text-[var(--text-muted)] uppercase tracking-wide">
            {badge}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function ShellDropdownLinkRow({
  label,
  href,
  onNavigate,
}: {
  label: string;
  href: string;
  onNavigate?: () => void;
}) {
  return (
    <a
      href={href}
      onClick={() => onNavigate?.()}
      className="iam-shell-dropdown__row block w-full text-left px-3 py-2 text-[0.6875rem] text-[var(--solar-cyan)] hover:bg-[var(--bg-hover)] font-[var(--font-sans)]"
    >
      {label}
    </a>
  );
}
