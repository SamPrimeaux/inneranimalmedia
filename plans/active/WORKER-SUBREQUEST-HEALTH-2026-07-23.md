# Worker subrequest health follow-up — Copilot + CF API failures

**Ticket:** `tkt_worker_subrequest_health_2026_07_23`  
**Opened:** 2026-07-23  
**Source:** CF Workers Metrics → Subrequests (last 24h) on `inneranimalmedia/production`

## Snapshot (operator read)

| Host | Signal | Verdict |
|------|--------|---------|
| `api.githubcopilot.com` | 46× 4xx, **0** 2xx | Broken — auth/token or dead endpoint |
| `api.cloudflare.com` | 10× 2xx vs 12× 4xx + 27× 5xx | Bad — majority failures |
| `api.openai.com` duration `~1.6e13 s` | Impossible duration | Metrics glitch — ignore; Worker wall ~409ms |
| `api.openai.com` | ~1k 2xx, ~21 errors | Normal noise |
| `api.github.com` | 292 / 22 | Acceptable |
| `api.anthropic.com` | 41 / 1 | Fine |
| `api.resend.com` | 23 / 0 | Fine (Mail UI crash was client-side) |

## Fix / follow-up

1. **GitHub Copilot** — find callers of `api.githubcopilot.com`; verify token/BYOK/`user_api_keys`; stop polling if permanently unauthorized; surface health in Settings.
2. **Cloudflare API** — identify which CF REST paths fail (5xx vs 4xx); token scope / rate limit / wrong account; add structured logging of status+path on CF API clients.
3. **OpenAI duration metric** — no product fix required unless we find a hung `fetch` without AbortSignal; treat dashboard duration as unreliable.
4. Dual-pass E2E before `shipped`: (a) Copilot subrequest 2xx or explicitly disabled with zero 4xx spam, (b) CF API 2xx majority over 24h sample.

## Out of scope

- Resend / phone-loop inbound (separate thread; inbound 401 + Reply-To already patched).
- Mail compose crash (`CheckCircle` import — shipped `72331dd6`).
