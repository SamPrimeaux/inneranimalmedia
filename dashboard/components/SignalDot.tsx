import { useMemo } from "react";

type Props = {
  active: boolean;
  error?: boolean;
  lastEventAt?: Date | null;
};

export function SignalDot({ active, error = false, lastEventAt }: Props) {
  const title = useMemo(() => {
    if (error) return "Live signal error";
    if (lastEventAt) {
      const t = lastEventAt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      return `Live — last event ${t}`;
    }
    return "Live — waiting for events";
  }, [error, lastEventAt]);

  const color = error
    ? "var(--color-error, var(--accent-danger, #e63333))"
    : active
      ? "var(--color-success, var(--color-success-strong, #22c55e))"
      : "var(--color-muted, var(--text-muted, #8aa0aa))";

  return (
    <span
      data-title={title}
      title={title}
      aria-label={title}
      style={{
        display: "inline-block",
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        flexShrink: 0,
        transition: "background 0.2s ease",
      }}
    />
  );
}
