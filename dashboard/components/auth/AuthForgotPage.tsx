import React, { useState } from 'react';

export function AuthForgotPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDoneMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      await res.json().catch(() => ({}));
      setDoneMsg('If that email exists, check your inbox for a reset link.');
    } catch (_) {
      setDoneMsg('If that email exists, check your inbox for a reset link.');
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

        {doneMsg && (
          <div style={{
            marginBottom: 12,
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid rgba(45,212,191,0.35)',
            background: 'rgba(45,212,191,0.10)',
            color: 'rgba(200,255,245,0.95)',
            fontSize: 12,
          }}>
            {doneMsg}
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
            Email
          </label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
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
            disabled={submitting || !email.trim()}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 6,
              border: '1px solid rgba(45,212,191,0.55)',
              background: 'rgba(45,212,191,0.12)',
              color: 'var(--text-main)',
              cursor: submitting ? 'default' : 'pointer',
              fontWeight: 500,
            }}
          >
            {submitting ? 'Sending…' : 'Send reset link'}
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

