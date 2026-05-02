#!/bin/bash
# Populate autorag R2 bucket with 4 knowledge files for AI Search (iam-autorag).
# Run from repo root: ./scripts/populate-autorag.sh
# Requires: ./scripts/with-cloudflare-env.sh and wrangler.production.toml

set -e
BUCKET="autorag"
WRANGLER_CMD="./scripts/with-cloudflare-env.sh npx wrangler r2 object put"
REMOTE="-c wrangler.production.toml --remote"

echo "Populating autorag bucket with knowledge files..."

# 1. Worker architecture
cat > /tmp/worker-core.md << 'EOF'
---
title: Worker Core Architecture
category: architecture
updated: 2026-03-18
---

# Worker Architecture

## Routes
- Public: /, /work, /about, /services, /contact
- Dashboard: /dashboard/agent, /dashboard/overview, /dashboard/finance, /dashboard/chats
- API: /api/agent/chat, /api/r2, /api/search, /api/agent/rag/query

## Bindings
- R2: agent-sam (DASHBOARD), iam-platform (R2 - memory/knowledge)
- D1: inneranimalmedia-business
- AutoRAG: iam-autorag (migrated from inneranimalmedia-aisearch)

## RAG Calls
6 locations use env.AI.autorag('iam-autorag'):
1. /api/search (lines 884-885)
2. runToolLoop knowledge_search (line 1958)
3. /api/agent/chat Agent mode (line 3712)
4. /api/agent/rag/query (line 4467)
5. invokeMcpToolFromChat knowledge_search (line 5300)

## Deploy
Version: 1aba7c9a-2f13-46b3-82a6-4f6716895c79
Command: npm run deploy
EOF

$WRANGLER_CMD $BUCKET/knowledge/architecture/worker-core.md --file=/tmp/worker-core.md --content-type=text/markdown $REMOTE

# 2. Agent modes
cat > /tmp/agent-modes.md << 'EOF'
---
title: Agent Modes
category: features
updated: 2026-03-18
---

# Agent Modes

## Ask Mode
Context: ~2k tokens (core + limited memory)
Tools: None
RAG: Disabled (only runs in Agent mode)
Cost: $0.0001/request
Tokens: 391 avg (96% reduction)

## Plan Mode
Context: ~4k tokens (core + memory + daily)
Tools: None
RAG: Disabled
Visualizer: Can generate inline diagrams
Cost: $0.001/request

## Agent Mode
Context: ~8k tokens (full with caps)
Tools: All 23 MCP tools
RAG: Auto when query >=10 words
Cost: $0.001-0.015/request
RAG cap: 3000 chars (PROMPT_CAPS.RAG_CONTEXT_MAX_CHARS)

## Debug Mode
Context: ~3k tokens (core + schema)
Tools: 5 debug tools only
Cost: $0.0008/request
No RAG injection
EOF

$WRANGLER_CMD $BUCKET/knowledge/features/agent-modes.md --file=/tmp/agent-modes.md --content-type=text/markdown $REMOTE

# 3. Token efficiency
cat > /tmp/token-efficiency.md << 'EOF'
---
title: Token Efficiency Refactor
category: decisions
date: 2026-03-18
---

# Token Efficiency Refactor

## Problem
10,000 input tokens per request
Monthly cost: $25-30

## Solution
Mode-specific prompt builders with hard caps

## Results
Ask mode: 10,000 -> 391 tokens (96% reduction)
Cost: $0.0025 -> $0.0001 (96% savings)
Monthly: $7.20 saved on Haiku at 100 req/day

## Deploy
Version: 1aba7c9a-2f13-46b3-82a6-4f6716895c79
Lines: +812, -45
EOF

$WRANGLER_CMD $BUCKET/knowledge/decisions/token-efficiency.md --file=/tmp/token-efficiency.md --content-type=text/markdown $REMOTE

# 4. Active priorities
cat > /tmp/active-priorities.md << 'EOF'
---
title: Active Priorities
updated: 2026-03-18
---

# March 2026 Priorities

## P0 Token Efficiency
Deployed 96% reduction (391 tokens)

## P1 AutoRAG Migration
Code updated to iam-autorag
Ready to deploy

## P2 Metrics
Fix Anthropic streaming -> agent_costs
Verify mcp_tool_calls writes

## P3 Dashboard
Excalidraw, Playwright, MCP tools, Terminal
EOF

$WRANGLER_CMD $BUCKET/context/active-priorities.md --file=/tmp/active-priorities.md --content-type=text/markdown $REMOTE

# 5. Frontend design skill (from repo)
if [ -f "docs/knowledge/skills/frontend-design.md" ]; then
  $WRANGLER_CMD $BUCKET/knowledge/skills/frontend-design.md --file=docs/knowledge/skills/frontend-design.md --content-type=text/markdown $REMOTE
  echo "Uploaded frontend-design skill"
fi

# 6. Skill creator skill (from repo)
if [ -f "docs/knowledge/skills/skill-creator.md" ]; then
  $WRANGLER_CMD $BUCKET/knowledge/skills/skill-creator.md --file=docs/knowledge/skills/skill-creator.md --content-type=text/markdown $REMOTE
  echo "Uploaded skill-creator skill"
fi

# 7. Web artifacts builder skill (from repo)
if [ -f "docs/knowledge/skills/web-artifacts-builder.md" ]; then
  $WRANGLER_CMD $BUCKET/knowledge/skills/web-artifacts-builder.md --file=docs/knowledge/skills/web-artifacts-builder.md --content-type=text/markdown $REMOTE
  echo "Uploaded web-artifacts-builder skill"
fi

# 8. Webapp testing skill (from repo)
if [ -f "docs/knowledge/skills/webapp-testing.md" ]; then
  $WRANGLER_CMD $BUCKET/knowledge/skills/webapp-testing.md --file=docs/knowledge/skills/webapp-testing.md --content-type=text/markdown $REMOTE
  echo "Uploaded webapp-testing skill"
fi

# 9. Theme factory skill (from repo)
if [ -f "docs/knowledge/skills/theme-factory.md" ]; then
  $WRANGLER_CMD $BUCKET/knowledge/skills/theme-factory.md --file=docs/knowledge/skills/theme-factory.md --content-type=text/markdown $REMOTE
  echo "Uploaded theme-factory skill"
fi

echo ""
echo "Uploaded knowledge files to autorag bucket"
echo ""
echo "Next: Go to AI Search dashboard -> iam-autorag -> Sync"
echo "Then: deploy approved"
