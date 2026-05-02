# Time documentation — fix / improve

**Roadmap step:** `step_time_documentation` (plan_iam_dashboard_v1, order 25)  
**Status:** in_progress

## Problem

- **Timer never stops** — dashboard/time-track can leave an entry `is_active = 1` indefinitely (e.g. tab closed, no heartbeat/end), leading to inflated hours (e.g. 115h in one “session”).
- **Not user-aware** — user has little visibility that a timer is running or that time is being recorded; no clear “you’re clocked in” state or reminder to clock out.
- **Little to no validity** — no caps, no review flow, no way to correct or discard bad entries; reported “hours this week” can be misleading.

## Goals

1. **Timer stops** — Auto-stop after inactivity (e.g. heartbeat timeout) or session end; or explicit “idle too long, stop?” so entries don’t run forever.
2. **User-aware** — Visible “clocked in” state in shell/overview; optional reminder to clock out (e.g. end of day or after N hours).
3. **Validity** — Cap or flag single-session duration (e.g. max 12h per entry without confirmation); optional review/edit in time-tracking dashboard; document “hours this week” source (project_time_entries + any rules).

## References

- **D1:** `project_time_entries` (start_time, end_time, duration_seconds, is_active, user_id).
- **API:** `POST /api/dashboard/time-track/start`, `/end`, heartbeat; Overview reads weekly/today hours.
- **Worker:** `handleTimeTrack`, `handleTimeTrackHeartbeat`; overview stats use `date('now','weekday 1')` and `user_id IN (sam_primeaux, user_sam_primeaux)`.

## Implemented (2026-03-09)

- **12h cap per entry:** In `handleTimeTrack` (heartbeat branch), any active entry that has been running more than 12 hours is auto-closed (update `end_time`, `duration_seconds`, `is_active = 0`). Before processing the current user's heartbeat, the worker runs an auto-stop pass for all users; when updating the active entry for the current user, if that entry has been running ≥ 12 hours it is closed and the response returns `{ auto_stopped: true, reason: '12h cap' }` instead of updating duration.
- **Still to do:** Last-heartbeat timeout (e.g. add `last_heartbeat_at` and auto-close after ~30 min idle); clearer "clocked in" state and reminders in the UI.
