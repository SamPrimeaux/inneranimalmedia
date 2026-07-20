# Companions CPAS — client demo + admin handoff (2026-07-20)

**Ticket:** `tkt_companions_cpas_demo_handoff_20260720`  
**Status:** `active`  
**Project:** `proj_companions_cpas_web` (Companions of CPAS / companionsofcaddo.org)  
**Subsystem:** `cms` · client delivery  
**Priority:** P0  
**Linked todo:** `todo_cpas_customer_admin_handoff` — *Complete customer takeover QA and admin guide*  
**Related backlog:** `tkt_companions_cms_ssot_audit` (CMS SSOT audit — do not expand scope into that today)  
**Required passes before `shipped`:** 2 (demo dry-run + live client session, or dry-run + post-demo guide delivery)

---

## Why this ticket exists

Tomorrow (Mon 2026-07-20) is the **client demo / CMS tutorial**. Goal: walk the customer through self-serve edits so they can run the site without a developer for day-to-day copy, images, section order, and form awareness — and leave them a short operating guide.

This extends the existing handoff todo into a single end-to-end plan with a dual-pass bar. It does **not** reopen renderer remasters or the full SSOT audit.

---

## Success criteria (demo day)

1. Operator can run a **dry-run** of the full tutorial path without surprises.
2. Client sees: login → pick page → edit field → Save Draft → Publish → public refresh shows change.
3. Client understands **About** editable fields (approved branded HTML + `data-cms-field`) and image focal controls.
4. Client understands **reorder** sections on a page (what moves, what does not).
5. Operator delivers a **1–2 page admin How-To** (draft OK if polished after session).
6. Known caveats called out verbally (draft vs live, Forms Studio generic submissions inbox gap).

---

## Out of scope (do not touch during demo prep)

- Replacing About custom renderers / redesigning About
- Atomic reorder hardening / tests (track separately if needed)
- Full Forms Studio Applications inbox UI
- Stripe live key swap, Meta/social publishing, animal_profiles /adopt grid restore
- Broad `tkt_companions_cms_ssot_audit` gap closure

---

## End-to-end plan

### Phase 0 — Night-before checklist (Sun → Mon)

| # | Action | Proof |
|---|--------|-------|
| 0.1 | Confirm live About still shows approved layout (`ms-wrap`, pillars, hero-split, CTA) | Visual on companionsofcaddo.org/about |
| 0.2 | Confirm CMS editor opens for Companions workspace / site | Dashboard CMS loads sections |
| 0.3 | Confirm operator + client admin accounts work | Login OK |
| 0.4 | Skim this plan + todo notes | Ready for Phase 1 |

### Phase 1 — Pre-demo QA (Mon morning, ~45–60 min)

Run **before** the client joins. Prefer a disposable text change you will revert or re-publish.

| # | Path | Pass if |
|---|------|---------|
| 1.1 | Login → CMS → Home or About | Sections list loads; no empty bootstrap |
| 1.2 | Edit one `data-cms-field` on About (e.g. mission line) → **Save Draft** | Draft saves; note whether public already changed (document real behavior) |
| 1.3 | **Publish** → hard-refresh public /about | Live matches intended publish |
| 1.4 | Image: open inspector → adjust focal / object-position on hero if available → Publish | Public image framing updates |
| 1.5 | Reorder two non-critical sections on a safe page → Publish → public | Order matches CMS |
| 1.6 | Forms: Contact / Foster still submit via dedicated endpoints; generic Forms Studio note | No surprise 404 on known CTAs |
| 1.7 | Revert demo edits if needed | Site back to approved copy |

**Record PASS1** on the ticket after Phase 1 (dry-run proof URLs / notes):

```bash
npm run record:ticket-e2e-pass -- --ticket=tkt_companions_cpas_demo_handoff_20260720 --detail='PASS1: dry-run edit→draft→publish on About/Home; proof …'
```

### Phase 2 — Client demo / tutorial script (~30–40 min)

Keep it one job at a time. Do not digress into platform internals.

1. **Welcome + outcome** — “You can change copy and pictures yourselves; we stay for design/features.”
2. **Login** — how they reach admin (footer/inconspicuous path — not a public nav CTA).
3. **Pick a page** — Home vs About; show section list.
4. **Edit text** — click field → change one sentence → Save Draft → explain what “draft” means **as observed in Phase 1**.
5. **Publish** — Publish → open public tab → refresh → celebrate.
6. **Images** — replace or reframe one image; focal control; publish again.
7. **Reorder** — move one section; show public order; warn: don’t reorder during a live campaign without checking.
8. **Forms awareness** — Contact/Foster paths; Entries / Applications where they exist today; generic form rows may need follow-up inbox work.
9. **What to ask us for** — new page types, Stripe live, major layout, custom sections.
10. **Hand off draft How-To** — leave PDF/doc or shared note with screenshots placeholders.

### Phase 3 — Admin guide (produce during / right after demo)

Short customer-facing doc (no IAM internals, no client-unrelated product names):

1. Sign in  
2. Open the page you want to change  
3. Edit text fields  
4. Save Draft vs Publish (honest wording from Phase 1)  
5. Images and framing  
6. Reorder sections  
7. Forms / entries (current truth)  
8. When to call support  

Store under `docs/clients/companionscpas/` when ready (e.g. `ADMIN-HOWTO-DRAFT.md`) and link from ticket events.

### Phase 4 — Close-out

| # | Action |
|---|--------|
| 4.1 | Second independent E2E (live client session notes = PASS2, or next-day retest) |
| 4.2 | `npm run record:ticket-e2e-pass` PASS2 |
| 4.3 | Resolve one-time morning memory `morning_focus_companions_cpas_demo_2026_07_20` |
| 4.4 | Clear demo-day blocker from `ctx_companionscpas.current_blockers` |
| 4.5 | `npm run assert:ticket-shippable -- --ticket=tkt_companions_cpas_demo_handoff_20260720 --set-shipped` only when dual-pass green |
| 4.6 | Mark `todo_cpas_customer_admin_handoff` done when guide delivered |

---

## Operator talking points (caveats)

- **Save Draft** may sync more than a pure draft (document what you see in Phase 1; do not oversell isolation).
- **About** uses approved branded HTML with field hooks — edit fields, don’t expect a blank HTML sandbox.
- **Reorder** is available; treat as soft until ownership/atomic hardening lands.
- **Generic Forms Studio** submissions land in D1; dedicated Contact/Foster still use their endpoints; full Applications inbox for generic rows is follow-up.

---

## Morning brief (data-driven, not hardcoded)

One-time D1 rows feed the existing morning synthesis (no cron string hardcode):

| Row | Role |
|-----|------|
| `agentsam_memory` key `morning_focus_companions_cpas_demo_2026_07_20` | Pinned `state` reminder for ### TODAY'S PLAN / CLIENT |
| `agentsam_project_context` `ctx_companionscpas` | `current_blockers` + notes + `linked_todo_ids` |
| `agentsam_todo` `todo_cpas_customer_admin_handoff` | due `2026-07-20`, high, in progress |
| This ticket | `project = proj_companions_cpas_web` |

After demo day: resolve the memory row and drop the demo-day blocker so it does not linger in digests.

---

## Dual-pass law

Deploy or “looks good once” ≠ shipped. Need two independent E2E proofs on this ticket before `shipped`.
