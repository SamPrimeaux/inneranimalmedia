import React from 'react';

interface GlobeErrorStateProps {
  url?: string;
  message?: string;
  status?: number;
  onRetry?: () => void;
}

export const GlobeErrorState: React.FC<GlobeErrorStateProps> = ({
  url,
  message = "This address couldn't be reached.",
  status,
  onRetry,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '32px 20px',
        textAlign: 'center',
        maxWidth: 380,
      }}
    >
      <div style={{ position: 'relative', width: 80, height: 80 }}>
        <svg
          style={{ position: 'absolute', inset: 0, animation: 'iamGlobeSpin 16s linear infinite reverse' }}
          viewBox="0 0 80 80"
          fill="none"
        >
          <circle
            cx="40"
            cy="40"
            r="36"
            stroke="var(--solar-cyan,#00e5ff)"
            strokeWidth="0.6"
            strokeDasharray="3 7"
            opacity="0.25"
          />
          <circle
            cx="40"
            cy="40"
            r="30"
            stroke="var(--solar-cyan,#00e5ff)"
            strokeWidth="0.4"
            strokeDasharray="1 9"
            opacity="0.12"
          />
        </svg>
        <svg
          style={{ position: 'absolute', inset: 0, animation: 'iamGlobeSpin 8s linear infinite' }}
          viewBox="0 0 80 80"
          fill="none"
        >
          <circle cx="40" cy="40" r="23" stroke="var(--solar-cyan,#00e5ff)" strokeWidth="1.2" opacity="0.6" />
          <ellipse cx="40" cy="40" rx="11" ry="23" stroke="var(--solar-cyan,#00e5ff)" strokeWidth="0.8" opacity="0.38" />
          <line x1="17" y1="40" x2="63" y2="40" stroke="var(--solar-cyan,#00e5ff)" strokeWidth="0.8" opacity="0.38" />
          <ellipse cx="40" cy="40" rx="23" ry="6" stroke="var(--solar-cyan,#00e5ff)" strokeWidth="0.6" opacity="0.2" />
          <path
            d="M30 31 Q34 27 39 29 Q43 31 41 35 Q37 37 32 35Z"
            fill="var(--solar-cyan,#00e5ff)"
            opacity="0.12"
          />
          <path
            d="M42 34 Q47 30 51 33 Q53 37 49 39 Q45 39 43 37Z"
            fill="var(--solar-cyan,#00e5ff)"
            opacity="0.09"
          />
        </svg>
      </div>

      <div style={{ display: 'flex', gap: 4 }}>
        {[0, 200, 400].map((delay) => (
          <div
            key={delay}
            style={{
              width: 4,
              height: 4,
              borderRadius: '50%',
              background: 'var(--solar-cyan,#00e5ff)',
              opacity: 0.3,
              animation: `iamDotPulse 1.4s ease-in-out ${delay}ms infinite`,
            }}
          />
        ))}
      </div>

      {status !== undefined && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--solar-cyan,#00e5ff)',
            opacity: 0.65,
          }}
        >
          {status}
        </span>
      )}

      <p
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-main,#e2e8f0)',
          lineHeight: 1.4,
          margin: 0,
        }}
      >
        {message}
      </p>

      {url ? (
        <code
          style={{
            fontSize: 11,
            color: 'var(--text-muted,#64748b)',
            wordBreak: 'break-all',
            maxWidth: '100%',
            fontFamily: 'monospace',
          }}
        >
          {url}
        </code>
      ) : null}

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          style={{
            fontSize: 12,
            padding: '6px 16px',
            border: '1px solid rgba(0,229,255,0.2)',
            borderRadius: 8,
            background: 'transparent',
            color: 'var(--solar-cyan,#00e5ff)',
            cursor: 'pointer',
            marginTop: 4,
          }}
        >
          Try again
        </button>
      ) : null}

      <style>{`
        @keyframes iamGlobeSpin {
          to { transform: rotate(360deg); transform-origin: center; }
        }
        @keyframes iamDotPulse {
          0%, 80%, 100% { opacity: 0.15; }
          40% { opacity: 0.8; }
      `}</style>
    </div>
  );
};
