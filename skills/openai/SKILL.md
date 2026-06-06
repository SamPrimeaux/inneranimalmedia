---
name: openai
description: "Use for OpenAI provider research before changing Agent Sam OpenAI integration — Responses API, Agents SDK, Agent Builder, ChatGPT/ChatKit, function calling, structured outputs, remote MCP, Secure MCP Tunnel, pricing, prompt caching, and agent safety. Load the companion research doc for source-grounded answers. Do NOT use for IAM stack decisions (D1 agentsam_tools, Cloudflare Workers, Vectorize lanes) without also reading skills/agentsam-vectorize-lanes. Research only — not an implementation plan."
license: Proprietary — Inner Animal Media
---

# OpenAI — Agent Building (provider index)

**STOP.** Model memory about OpenAI APIs, pricing, and tool support goes stale quickly. **Prefer retrieval** over pretraining.

## Canonical research doc (read this)

**Full provider notes:** [`openai-agent-building-current-docs.md`](./openai-agent-building-current-docs.md)

R2: `inneranimalmedia-autorag/skills/openai/openai-agent-building-current-docs.md`  
Public: `https://rag.inneranimalmedia.com/skills/openai/openai-agent-building-current-docs.md`

D1: `agentsam_skill.id = skill_openai_agent_building` · `retrieval_strategy = r2`

## When to load

| User / task | Action |
|-------------|--------|
| OpenAI Responses vs Agents SDK vs Agent Builder | Read research doc §1 |
| Function tools vs MCP vs tool search | Read research doc §2 |
| Secure MCP Tunnel / private MCP | Read research doc §3 |
| Strict JSON schema / structured outputs | Read research doc §4 |
| Token cost, caching, reasoning billing | Read research doc §5–6 |
| Approvals, tracing, safety | Read research doc §7 |
| “What does OpenAI docs say?” | Official docs or OpenAI Docs MCP — research doc §8 |

## What this is NOT

- Not the Inner Animal Media architecture rewrite
- Not a mandate to migrate off Cloudflare Workers / D1 / Supabase Vectorize lanes
- Not production implementation steps — see **Parking lot** in the research doc

## IAM cross-reference (comparison only)

| IAM today | OpenAI doc topic |
|-----------|------------------|
| `agentsam_model_catalog` + provider dispatch | Responses / Agents SDK model selection |
| `mcp.inneranimalmedia.com` public OAuth MCP | Remote MCP + Secure MCP Tunnel (private) |
| R2 + Vectorize + Supabase RAG | OpenAI file search / hosted retrieval |
| `skills/agentsam-vectorize-lanes` | Our embedding/index law (separate skill) |

## Maintenance

1. Edit `openai-agent-building-current-docs.md` when OpenAI ships material doc changes
2. `./scripts/upload-iam-skills-autorag.sh` (SKILL.md) + upload reference doc to R2 (see migration 590 notes)
3. Optional semantic index: `ingest_repo_skills_rag.mjs --only openai`
