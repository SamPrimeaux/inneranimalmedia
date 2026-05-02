import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function AuthResetPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const token = params.get('token') || '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pwOk = password.length >= 8;
  const matchOk = password === confirm && confirm.length > 0;
  const canSubmit = !!token && pwOk && matchOk && !submitting;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) {
        setError(data?.error || 'Reset failed');
        return;
      }
      navigate('/auth/login?reset=1', { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-app)',
    }}>
      <div style={{
        width: 380, padding: 32,
        background: 'var(--bg-panel)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
      }}>
        <div style={{
          color: 'var(--solar-cyan)', fontSize: 16, fontWeight: 500,
          fontFamily: 'var(--font-mono)', marginBottom: 24,
        }}>
          Inner Animal Media
        </div>

        {!token && (
          <div style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(248,113,113,0.08)',
            color: 'rgba(254,226,226,0.95)',
            fontSize: 12,
          }}>
            Missing reset token.
          </div>
        )}

        {error && (
          <div style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid rgba(248,113,113,0.35)',
            background: 'rgba(248,113,113,0.08)',
            color: 'rgba(254,226,226,0.95)',
            fontSize: 12,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit}>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            New password
          </label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="At least 8 characters"
            style={{
              width: '100%', marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-app)',
              color: 'var(--text-main)',
            }}
          />

          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
            Confirm password
          </label>
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            type="password"
            autoComplete="new-password"
            placeholder="Repeat password"
            style={{
              width: '100%', marginBottom: 16,
              padding: '10px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-app)',
              color: 'var(--text-main)',
            }}
          />

          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid rgba(45,212,191,0.55)',
              background: 'rgba(45,212,191,0.12)',
              color: 'var(--text-main)',
              cursor: canSubmit ? 'pointer' : 'default',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          <a href="/auth/login" style={{ color: 'var(--solar-cyan)', textDecoration: 'none' }}>
            Back to sign in
          </a>
        </div>
      </div>
    </div>
  );
}

