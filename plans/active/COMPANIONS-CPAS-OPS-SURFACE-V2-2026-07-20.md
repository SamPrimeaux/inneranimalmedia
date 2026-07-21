# Companions CPAS — ops surface v2 (parked)

**Ticket:** `tkt_companions_cpas_ops_surface_v2`  
**Status:** `blocked` (PAUSED 2026-07-20)  
**Project:** `proj_companions_cpas_web`  
**Priority:** P3 (parked)  
**Linked todo:** `todo_cpas_ops_surface_v2`  
**Blocked by customer:** written request form from Lori with definitive scope, copy, and baselines  
**Related:** `tkt_companions_cpas_demo_handoff_20260720` (admin demo/handoff still outstanding)

---

## Gate (LOCKED)

No IAM build / design energy until Companions sends a **properly written request** covering what they want, what “done” means, and who owns copy. Open-ended revisions without direction are out of scope.

---

## Scope (one ticket — four asks)

### 1. Dashboard calendar + reminders / notifications
- In-dashboard calendar
- Real-time (or near-real-time) reminders / notifications for staff
- Needs: who gets notified, channels (in-app / email / push), event types, roles

### 2. Public “upcoming events” feed
- Easy to use / easy to update from their dashboard
- Public site surface for upcoming events (or alike)
- Needs: fields, publish workflow, timezone, archive rules  
- **No design work until written brief**

### 3. Video snippets (shareable) + storage standards
- They have some videos; want to add more
- Must define **basic standards** so older admin users do not treat the site like Facebook
- Guardrails: max length/size, formats, naming, retention, moderation, CDN/R2 quotas — avoid cluttered junk storage costs

### 4. Clearer foster paths
- Public/nav/CTA paths and concepts need baselines
- They must help define: concepts, copy, copyright/ownership of language, what “foster” means on-site vs CPAS process
- Related leftover: `/adopt` still has “Apply to Foster” modal (`todo_cpas_adopt_foster_cta`) — fold under this ticket when work resumes

---

## Explicitly not tonight

- No UI mockups, no schema speculation as build, no half-implemented feeds
- No continued unpaid polish without written customer input

---

## Resume checklist

1. Lori written request form lands (scope + acceptance)
2. Re-open this ticket → `active` / `in_review` as appropriate
3. Dual-pass E2E before `shipped` (required_pass_count = 2)
