/**
 * security-scan.js
 * Runs shield rules, writes security_findings, fires notifications.
 * Called from nightly-master cron and optionally from deploy gate.
 */

// Patterns that constitute a critical exposure if found in logs/chat/bundles
const EXPOSURE_PATTERNS = [
  { name: 'stripe_live',     regex: /sk_live_[a-zA-Z0-9]{90,}/g,      severity: 'critical', rotate: 'STRIPE_SECRET_KEY' },
  { name: 'cf_token',        regex: /cfut_[a-zA-Z0-9]{20,}/g,          severity: 'critical', rotate: 'CLOUDFLARE_API_TOKEN' },
  { name: 'openai_key',      regex: /sk-[a-zA-Z0-9T-]{40,}/g,          severity: 'critical', rotate: 'OPENAI_API_KEY' },
  { name: 'anthropic_key',   regex: /sk-ant-[a-zA-Z0-9\-]{80,}/g,      severity: 'critical', rotate: 'ANTHROPIC_API_KEY' },
  { name: 'generic_secret',  regex: /[a-f0-9]{64}/g,                   severity: 'high',     rotate: null },
  { name: 'iam_bridge',      regex: /iam-bridge-[a-zA-Z0-9]{20,}/g,    severity: 'critical', rotate: 'AGENTSAM_BRIDGE_KEY' },
  { name: 'resend_key',      regex: /re_[a-zA-Z0-9]{32,}/g,            severity: 'high',     rotate: 'RESEND_API_KEY' },
];

function redact(str) {
  if (!str) return '';
  const s = String(str);
  if (s.length <= 8) return '***REDACTED***';
  return s.slice(0, 6) + '...' + s.slice(-4) + ' [REDACTED]';
}

function fingerprintOf(text) {
  // Stable ID for dedup — first 12 chars of match + source
  return text.slice(0, 12).replace(/[^a-zA-Z0-9]/g, '');
}

export async function runSecurityScan(env, opts = {}) {
  if (!env?.DB) return { ok: false, skipped: true };

  const {
    scanSources = ['agent_messages', 'terminal_history', 'mcp_audit_log'],
    tenantId = 'tenant_sam_primeaux',
    triggeredBy = 'nightly_cron',
  } = opts;

  const findings = [];

  for (const source of scanSources) {
    // Only scan recent rows (last 24h) to avoid re-scanning old data
    let rows = [];
    try {
      const tableMap = {
        agent_messages:  { col: 'content',       dateCol: 'created_at', type: 'unix' },
        terminal_history:{ col: 'output',         dateCol: 'created_at', type: 'unix' },
        mcp_audit_log:   { col: 'request_json',   dateCol: 'created_at', type: 'unix' },
        agent_telemetry: { col: 'metadata_json',  dateCol: 'created_at', type: 'unix' },
      };
      const t = tableMap[source];
      if (!t) continue;

      const cutoff = Math.floor(Date.now() / 1000) - 86400;
      const result = await env.DB.prepare(
        `SELECT id, ${t.col} as content FROM ${source}
         WHERE ${t.dateCol} >= ? LIMIT 500`
      ).bind(cutoff).all();
      rows = result?.results ?? [];
    } catch {
      continue; // table may not exist or have the column — skip safely
    }

    for (const row of rows) {
      const text = String(row.content ?? '');
      for (const pat of EXPOSURE_PATTERNS) {
        const matches = text.match(pat.regex);
        if (!matches?.length) continue;

        for (const match of matches) {
          const fp = fingerprintOf(match) + '_' + source;

          // Dedup — skip if already logged (same fingerprint + open/triaged)
          const existing = await env.DB.prepare(
            `SELECT id FROM security_findings
             WHERE fingerprint = ? AND status IN ('open','triaged') LIMIT 1`
          ).bind(fp).first().catch(() => null);
          if (existing) continue;

          const findingId = 'sf_' + Math.random().toString(36).slice(2);
          await env.DB.prepare(`
            INSERT INTO security_findings
              (id, tenant_id, source_type, source_ref, finding_type,
               severity, fingerprint, snippet_redacted, status,
               created_by, notification_sent_at, metadata_json)
            VALUES (?,?,?,?,?,?,?,?,  'open',?,NULL,?)
          `).bind(
            findingId, tenantId, source, row.id,
            'credential_exposure', pat.severity, fp,
            redact(match), triggeredBy,
            JSON.stringify({ pattern_name: pat.name, rotate_key: pat.rotate })
          ).run().catch(() => {});

          findings.push({ id: findingId, pattern: pat.name, severity: pat.severity,
            source, rotate: pat.rotate });
        }
      }
    }
  }

  // Shield rule: null_value_registered — env_secrets with no encrypted_value and key_type='encrypted_d1'
  const nullVault = await env.DB.prepare(`
    SELECT key_name FROM env_secrets
    WHERE key_type = 'encrypted_d1' AND (encrypted_value IS NULL OR encrypted_value = '')
    AND is_active = 1
  `).all().catch(() => ({ results: [] }));

  for (const r of nullVault.results ?? []) {
    const fp = 'null_vault_' + r.key_name;
    const exists = await env.DB.prepare(
      `SELECT id FROM security_findings WHERE fingerprint=? AND status='open' LIMIT 1`
    ).bind(fp).first().catch(() => null);
    if (exists) continue;
    await env.DB.prepare(`
      INSERT INTO security_findings
        (id, tenant_id, source_type, source_ref, finding_type,
         severity, fingerprint, snippet_redacted, status, created_by)
      VALUES (?,?,  'env_secrets',?,  'null_vault_value',  'medium',?,?,  'open',?)
    `).bind(
      'sf_' + Math.random().toString(36).slice(2),
      tenantId, r.key_name, fp, r.key_name, 'nightly_security_scan'
    ).run().catch(() => {});
  }

  // Shield rule: rotation_due — env_secrets past rotation_due_at
  const rotationDue = await env.DB.prepare(`
    SELECT key_name, rotation_due_at FROM env_secrets
    WHERE rotation_due_at IS NOT NULL
      AND rotation_due_at < unixepoch()
      AND is_active = 1
  `).all().catch(() => ({ results: [] }));

  for (const r of rotationDue.results ?? []) {
    const fp = 'rotation_due_' + r.key_name;
    const exists = await env.DB.prepare(
      `SELECT id FROM security_findings WHERE fingerprint=? AND status='open' LIMIT 1`
    ).bind(fp).first().catch(() => null);
    if (exists) continue;
    await env.DB.prepare(`
      INSERT INTO security_findings
        (id, tenant_id, source_type, source_ref, finding_type,
         severity, fingerprint, snippet_redacted, status, created_by)
      VALUES (?,?,'env_secrets',?,'rotation_overdue','high',?,?,'open',?)
    `).bind(
      'sf_' + Math.random().toString(36).slice(2),
      tenantId, r.key_name, fp,
      `${r.key_name} rotation overdue`,
      'nightly_security_scan'
    ).run().catch(() => {});
  }

  // Notify if any critical/high findings were new — send to Resend
  const criticalNew = findings.filter(f => f.severity === 'critical');
  if (criticalNew.length > 0 && env.RESEND_API_KEY) {
    const lines = criticalNew.map(f =>
      `• [${f.severity.toUpperCase()}] ${f.pattern} in ${f.source}` +
      (f.rotate ? ` → ROTATE: ${f.rotate}` : '')
    ).join('\n');

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM ?? 'security@inneranimalmedia.com',
        to: env.RESEND_TO ?? 'support@inneranimalmedia.com',
        subject: `🚨 IAM Security Alert — ${criticalNew.length} critical finding(s) detected`,
        text: `IAM Security Scanner detected the following:\n\n${lines}\n\nReview at: https://inneranimalmedia.com/dashboard/settings/security\n\nTimestamp: ${new Date().toISOString()}`,
      }),
    }).catch(() => {});

    // Update notification_sent_at on findings we just alerted
    for (const f of criticalNew) {
      await env.DB.prepare(
        `UPDATE security_findings SET notification_sent_at = unixepoch() WHERE id = ?`
      ).bind(f.id).run().catch(() => {});
    }
  }

  // Update shield rule trigger counts
  if (findings.length > 0) {
    await env.DB.prepare(`
      UPDATE security_shield_rules
      SET trigger_count = trigger_count + ?,
          last_triggered_at = unixepoch(),
          updated_at = unixepoch()
      WHERE rule_type = 'exposure_pattern' AND is_active = 1
    `).bind(findings.length).run().catch(() => {});
  }

  return {
    ok: true,
    findings_new: findings.length,
    critical: criticalNew.length,
    rotation_due: rotationDue.results?.length ?? 0,
    null_vault: nullVault.results?.length ?? 0,
  };
}

export async function logSecretAudit(env, {
  secretId, tenantId, userId, eventType,
  triggeredBy, previousLast4, newLast4,
  notes, ipAddress, userAgent
}) {
  if (!env?.DB || !secretId) return;
  await env.DB.prepare(`
    INSERT INTO secret_audit_log
      (id, secret_id, tenant_id, user_id, event_type,
       triggered_by, previous_last4, new_last4,
       notes, ip_address, user_agent, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,unixepoch())
  `).bind(
    'saudit_' + Math.random().toString(36).slice(2),
    secretId, tenantId, userId ?? null, eventType,
    triggeredBy ?? 'system', previousLast4 ?? null, newLast4 ?? null,
    notes ?? null, ipAddress ?? null, userAgent ?? null
  ).run().catch(() => {});
}
