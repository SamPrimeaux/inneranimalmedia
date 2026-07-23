# Phone-loop LLM next steps (Mail chips)

**Status:** BACKLOG — do not start until funded / scheduled  
**D1:** `tkt_phone_loop_llm_next_steps_20260723`  
**Operator:** Sam · `ws_inneranimalmedia`  
**Created:** 2026-07-23

## Why

Phone IDE loop already works: email / Mail chips / push → Agent Sam spine → replyable Mail thread.  
**Gap:** next-step chips are **canned templates** (Continue / Status + caller overrides), not suggestions the model invents from the turn it just finished. That is the valuable refinement — not the plumbing.

## Already shipped (do not rebuild)

| Piece | Where |
|-------|--------|
| Mail deep-link (`?email=&folder=sent&c=`) | `email-agent-bridge.js`, `MailPage.tsx` |
| Chip UI + `POST /api/mail/agent-continue` | `MailPage.tsx`, `mail.js` |
| Sealed push actions (Android) | `push-action-token.js`, `push-handler.js` |
| Same spine as in-app (`executeAgentChatSpine`, `mode=agent`) | `email-agent-bridge.js` |
| Thread continuity `[ref:as_…]` | `email-reply-thread.js` |

## Outcome (when built)

After each phone-loop / deploy / agent completion email:

1. Model emits **2–4 structured next steps** (label + instruction) from the turn result.  
2. Those steps are embedded in the outbound Mail body (same `agentsam:next_steps` contract).  
3. Operator taps a chip on iPhone Mail → sealed instruction runs another Agent Sam turn on the **same** `conversationId`.  
4. Free-text email reply remains first-class (chips are shortcuts, not the only path).

## Non-goals (this ticket)

- Native iOS notification action buttons (Apple WebKit gap — won’t fix).  
- New tables / CF Email Workers.  
- Replacing Mail with Agent chat as the phone surface.  
- Spending a full day on design docs before a thin vertical slice.

## Thin slice (when scheduled — order)

1. **Schema contract** — JSON shape already exists (`buildNextStepsEmbeds` / `parseNextStepsFromBody`). Keep it.  
2. **Emitter** — after `collectSseAssistantText` in `runAgentTurnFromEmail`, ask the same (or cheaper) model for `next_steps[]` only; fall back to canned Continue/Status on parse failure.  
3. **Wire** — pass emitted steps into `sendPhoneLoopCompletion({ nextSteps })`.  
4. **Proof** — one deploy or email turn → Mail shows non-default chips → tap Continue-like chip → second turn on same `c=` → dual-pass E2E.

## Acceptance

- [ ] At least one live turn produces chips whose labels/instructions are **not** the hardcoded defaults.  
- [ ] Chip tap and email reply both continue the same `conversationId`.  
- [ ] Fail-soft: emitter failure still sends email/push with canned steps.  
- [ ] Dual-pass E2E before `shipped` (`required_pass_count=2`).

## Priority / schedule

**Backlog.** Valuable workflow to refine later — **not** funded for full implementation today.  
Resume when phone-loop is a priority sprint; estimate ~0.5–1 focused day for the thin slice above, not a multi-day remaster.
