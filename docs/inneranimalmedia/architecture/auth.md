# Authentication architecture

## Overview

- Session-backed dashboard access; OAuth (Google, GitHub) and email flows as implemented in Worker and `pages/auth/*`.

## Locked flows

- Do not change OAuth callback handlers without explicit review; KV `SESSION_CACHE` stores OAuth state.
- `connectDrive` / `connectGitHub` flags in KV distinguish connection popups from login; login must land on `/dashboard` after session creation.

## Password reset

- Pages: `pages/auth/reset.html` (and related).
- API routes under `/api/auth/password-reset/*` as wired in Worker.
