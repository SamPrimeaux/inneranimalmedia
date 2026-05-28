# Chunk 17 — Knowledge and search

**Status:** Draft

## Purpose
search activity rail — KnowledgeSearchPanel, conversations.

## Live production scope
activeActivity search on agent path. — **https://inneranimalmedia.com/dashboard/agent** only. UI source: **`dashboard/`** only.

## Existing live code paths
- dashboard/components/KnowledgeSearchPanel.tsx (glob)
- App.tsx search rail

## What is ALREADY engineered
Panel opens from rail; conversation jump dispatches IAM_AGENT_CHAT_CONVERSATION_CHANGE.

## What is PARTIALLY engineered
RAG latency (see KNOWLEDGE_SEARCH doc if linked).

## What is BROKEN
TBD

## UX reality today
Separate from Cmd+K UnifiedSearchBar in top bar.

## Data / event / execution flow
Pick conversation → localStorage id → chat loads

## Validation commands
```bash
rg KnowledgeSearchPanel dashboard
rg activeActivity === 'search' App.tsx
```

## Acceptance criteria
- [ ] All paths verified with `rg` on current main
- [ ] No references to `agent-dashboard/` as live source
- [ ] Repair IDs linked in chunk 25

## Repair backlog IDs
_None assigned yet — add when triage complete._

## Immediate next implementation step
Document APIs KnowledgeSearchPanel calls.
