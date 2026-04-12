import React, { useState } from "react";

// ─── SettingsRow ──────────────────────────────────────────────────────────────

interface SettingsRowProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
}

export function SettingsRow({ label, description, control }: SettingsRowProps) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderBottom: "1px solid var(--border)",
    }}>
      <div>
        <div style={{ fontSize: 12, color: "var(--text-primary)", fontWeight: 500 }}>{label}</div>
        {description && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{control}</div>
    </div>
  );
}

// ─── ControlledSwitch ─────────────────────────────────────────────────────────

interface ControlledSwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}

export function ControlledSwitch({ checked, onChange, disabled = false }: ControlledSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: 32, height: 18, borderRadius: 9,
        background: checked ? "var(--accent)" : "var(--border)",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        position: "relative",
        transition: "background 150ms",
        flexShrink: 0,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{
        position: "absolute", top: 2,
        left: checked ? 16 : 2, width: 14, height: 14,
        borderRadius: "50%", background: "var(--text-primary)",
        transition: "left 150ms",
      }} />
    </button>
  );
}

// ─── Btn ─────────────────────────────────────────────────────────────────────

type BtnVariant = "primary" | "danger" | "ghost" | "inline";
type BtnSize    = "sm" | "md";

interface BtnProps {
  onClick?: () => void;
  variant?: BtnVariant;
  size?: BtnSize;
  disabled?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export function Btn({ onClick, variant = "ghost", size = "sm", disabled, children, style }: BtnProps) {
  const base: React.CSSProperties = {
    border: "none", borderRadius: 4,
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "inherit", fontWeight: 500,
    opacity: disabled ? 0.5 : 1,
    transition: "opacity 150ms, background 150ms",
    padding: size === "sm" ? "4px 10px" : "6px 14px",
    fontSize: size === "sm" ? 11 : 12,
    ...style,
  };
  const variants: Record<BtnVariant, React.CSSProperties> = {
    primary: { background: "var(--accent)",       color: "var(--bg-canvas)"   },
    danger:  { background: "var(--color-error)",  color: "var(--bg-surface)", border: "1px solid var(--color-border)" },
    ghost:   { background: "var(--bg-elevated)",  border: "1px solid var(--border)", color: "var(--text-secondary)" },
    inline:  { background: "transparent", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "2px 6px", fontSize: 10 },
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick} style={{ ...base, ...variants[variant] }}>
      {children}
    </button>
  );
}

// ─── StatusDot ───────────────────────────────────────────────────────────────

type DotStatus = "ok" | "fail" | "untested" | "checking";

export function StatusDot({ status }: { status: DotStatus | string }) {
  const colors: Record<string, string> = {
    ok:       "var(--color-primary)",
    fail:     "var(--color-error)",
    untested: "var(--text-muted)",
    checking: "var(--color-warning)",
  };
  return (
    <span style={{
      display: "inline-block", width: 7, height: 7, borderRadius: "50%",
      background: colors[status] ?? colors.untested, flexShrink: 0,
      animation: status === "checking" ? "spPulse 1.2s infinite" : "none",
    }} />
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em",
      color: "var(--text-secondary)", marginBottom: 6, paddingBottom: 4,
      borderBottom: "1px solid var(--border)",
    }}>
      {children}
    </div>
  );
}

// ─── Input ───────────────────────────────────────────────────────────────────

interface InputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

export function Input({ value, onChange, placeholder, type = "text", style, disabled, onKeyDown }: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      onKeyDown={onKeyDown}
      style={{
        background: "var(--bg-canvas)", border: "1px solid var(--border)",
        color: "var(--text-primary)", padding: "6px 8px", borderRadius: 4,
        fontFamily: "inherit", fontSize: 11, width: "100%", boxSizing: "border-box",
        outline: "none", ...style,
      }}
    />
  );
}

// ─── Modal ───────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "color-mix(in srgb, var(--color-text) 70%, transparent)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: "var(--bg-elevated)", border: "1px solid var(--border)",
        borderRadius: 8, padding: 16, minWidth: 340, maxWidth: 480, width: "90vw",
        maxHeight: "80vh", overflowY: "auto",
        boxShadow: "0 8px 32px color-mix(in srgb, var(--color-text) 50%, transparent)",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 14, fontWeight: 600, fontSize: 13, color: "var(--text-primary)",
        }}>
          <span>{title}</span>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-secondary)",
            fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px",
          }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── WideModal ───────────────────────────────────────────────────────────────

interface WideModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function WideModal({ open, onClose, title, children }: WideModalProps) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "color-mix(in srgb, var(--color-text) 70%, transparent)",
        zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        style={{
          background: "var(--bg-elevated)", border: "1px solid var(--border)",
          borderRadius: 8, padding: 16, width: "min(920px, 96vw)", maxHeight: "90vh",
          overflow: "hidden", display: "flex", flexDirection: "column", boxSizing: "border-box",
          boxShadow: "0 8px 32px color-mix(in srgb, var(--color-text) 50%, transparent)",
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 12, flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)" }}>{title}</span>
          <button type="button" onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-secondary)",
            fontSize: 18, cursor: "pointer", lineHeight: 1, padding: "0 4px",
          }}>×</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
      </div>
    </div>
  );
}
