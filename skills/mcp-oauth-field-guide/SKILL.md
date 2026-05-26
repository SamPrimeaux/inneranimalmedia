---
name: mcp-oauth-field-guide
description: "Use whenever working on IAM MCP OAuth 2.1, multi-tenant identity isolation, mcp_workspace_tokens, workspace resolution, PKCE, token mint, tools/list scoping, ChatGPT/Cursor/Claude MCP connectors, or customer onboarding security on Inner Animal Media. Covers derive-don't-receive, hash-only storage, audience binding, two-worker architecture, and defense in depth. Use when debugging zero tools after OAuth, workspace_id from consent forms, or audit-before-insert bugs. Do NOT use for unrelated APIs, Supabase-only auth, or generic Cloudflare tutorials without MCP/OAuth context."
license: Proprietary. LICENSE.txt has complete terms
---

# MCP, OAuth 2.1, and Identity Isolation
## A Complete Field Guide for Multi-Tenant SaaS Developers

*Written from real production bugs, real fixes, and real architecture decisions made on the Inner Animal Media platform — May 2026.*

---

## Who This Is For

You built something real. It works. But when you look at the OAuth flow, the token lifecycle, the workspace resolution, the MCP tool dispatch — you feel like you're flying on intuition rather than understanding. A customer is about to onboard. The stakes just got real.

This guide teaches you to own this stack, not just operate it.

---

## Part 1 — Mental Models Before Code

### 1.1 The Three Questions Every Security System Answers

Every authentication and authorization system in existence answers three questions, in this exact order:

**Who are you?** — Authentication. Answered once, at login. Result: a verified `user_id`.

**What are you allowed to do?** — Authorization. Derived entirely server-side from `user_id`. Never from what the user claims.

**Did you actually do it?** — Audit. Every action logged with who, what, when, from where.

If your system confuses these three — if authorization accepts user-supplied claims, or if audit logging fires before confirming an action completed — you have a security bug. Not a theoretical one. A real one that can be exploited.

The bug you hit today: `workspace_id` was flowing from the frontend consent form into the token mint. That's question 1 (who are you) being answered by the user themselves. The user said "I am ws_innerautodidact" and the system believed them without checking. That is the definition of an authorization bypass.

---

### 1.2 Authentication vs Authorization — The Permanent Mental Model

Draw this line in permanent marker:

```
AUTHENTICATION: "Here is proof of who I am."
                → session cookie, bearer token, OAuth code
                → verified by your server against stored hash
                → result: user_id (and nothing else)

AUTHORIZATION:  "Given who you are, here is what you may do."
                → derived by your server from user_id
                → reads from workspace_members, agentsam_user_policy, 
                  agentsam_mcp_allowlist, mcp_workspace_tokens
                → result: allowed tools, workspace, risk ceiling
```

Authentication is the door. Authorization is the room you're allowed in once you're through the door. The user does not get to choose the room. Your database decides.

**Real example from your stack:**

```
WRONG (what you had):
  User completes OAuth consent
  Frontend sends: { workspace_id: "ws_innerautodidact" }
  Backend uses that value to mint the token
  → User chose their own authorization scope

CORRECT (what you fixed):
  User completes OAuth consent
  Backend resolves workspace from auth_users.default_workspace_id
  Frontend sends nothing about workspace
  → Server derived authorization from authenticated identity
```

---

### 1.3 The Derive-Don't-Receive Principle

This is the single most important security principle for multi-tenant SaaS. Say it out loud:

> **Derive authorization context from authenticated identity. Never receive it from the caller.**

Applied everywhere in your stack:

| Context | Wrong (receive) | Correct (derive) |
|---|---|---|
| OAuth token mint | `workspace_id` from consent form | `resolveCanonicalWorkspace(userId)` from DB |
| D1 tool call | `tenant_id` from agent args | `assertD1SqlScoped` injects from token |
| File write | `path` from request body | Constructed from `workspace.repo_path` binding |
| Email send | `from` from request | Resolved from workspace settings in D1 |
| MCP tool dispatch | `user_id` from tool params | Extracted from bearer token → D1 lookup |

If a value affects what someone is allowed to do or access, it must come from your server's records, not the caller's words.

---

## Part 2 — OAuth 2.1 From Zero

### 2.1 What Problem OAuth Actually Solves

Without OAuth, connecting ChatGPT to your MCP server would require one of these:

1. Give ChatGPT your username and password — catastrophic
2. Give ChatGPT a static API key — single point of failure, no scoping, no revocation
3. Build a custom auth scheme — no standard, no tooling, reinvented wheel

OAuth solves this by creating **delegated authorization** — ChatGPT gets a token that represents "Sam authorized ChatGPT to call these specific tools on his behalf" without ever knowing Sam's password. The token:

- Is scoped (only the tools Sam approved)
- Is revocable (Sam can kill it without changing his password)
- Is time-limited (expires after 24h by default on your system)
- Is audience-bound (only works on `mcp.inneranimalmedia.com`)
- Carries no secrets (only a hash is stored in D1)

### 2.2 The OAuth 2.1 Flow — Step by Step

Here is every step of your OAuth flow, mapped to your actual code:

```
STEP 1: Client initiates
ChatGPT → GET https://mcp.inneranimalmedia.com/.well-known/oauth-authorization-server
         ← Returns: authorization_endpoint, token_endpoint, scopes_supported
         (Your code: RFC 8414 metadata in src/api/oauth.js)

STEP 2: Authorization request
ChatGPT → GET https://inneranimalmedia.com/oauth/mcp/consent
          ?response_type=code
          &client_id=iam_mcp_inneranimalmedia
          &redirect_uri=https://chatgpt.com/connector_platform_oauth_redirect
          &scope=mcp:tools iam:profile
          &state=<random>
          &code_challenge=<sha256(code_verifier)>    ← PKCE
          &code_challenge_method=S256

STEP 3: User authenticates and consents
         Your consent UI shows:
         - "Signed in as info@inneranimals.com"
         - Permission groups (Account & Billing / Developer Platform)
         User clicks Authorize
         (Your code: mcp-oauth-consent.js → IamMcpOAuthConsentPage.tsx)

STEP 4: Authorization code minted
         Your server inserts into oauth_authorizations (status=approved)
         Generates a short-lived random code (10 min TTL)
         Stores code_hash in oauth_authorization_codes
         Redirects: https://chatgpt.com/...?code=<code>&state=<state>

STEP 5: Code exchange
ChatGPT → POST https://inneranimalmedia.com/api/oauth/token
          { grant_type: authorization_code,
            code: <code>,
            code_verifier: <original>,    ← PKCE verification
            redirect_uri: ...,
            client_id: ... }

STEP 6: Token mint (THE CRITICAL STEP)
         Your server:
         1. Verifies PKCE: sha256(code_verifier) === stored code_challenge
         2. Resolves workspace from identity (NOT from request)
         3. Intersects OAuth allowlist × user policy → allowed_tools
         4. Inserts mcp_workspace_tokens row (token_hash, allowed_tools, expires_at)
         5. Returns: { access_token, token_type: "bearer", expires_in }
         (Your code: src/api/oauth.js)

STEP 7: MCP tool access
ChatGPT → POST https://mcp.inneranimalmedia.com/mcp
          Authorization: Bearer <access_token>
          { method: "tools/list" }

         MCP server:
         1. sha256(bearer) → lookup mcp_workspace_tokens
         2. resolveWorkspace() → load allowed_tools, workspace context
         3. enforceOAuthToolGuards() → check risk, scopes, approval
         4. Return filtered tool list
```

**The bug you had:** Step 6 was logging `iam_mcp_oauth_token_issued` BEFORE confirming the INSERT committed (`meta.changes > 0`). The workspace was also coming from the consent form (Step 3) rather than being derived in Step 6. Result: event logged, no row created, ChatGPT gets 0 tools.

---

### 2.3 PKCE — Why It Exists

PKCE (Proof Key for Code Exchange) prevents a specific attack called **authorization code interception**.

Without PKCE:
```
1. ChatGPT starts OAuth flow
2. Attacker intercepts the redirect with the code
3. Attacker exchanges code for token
4. Attacker has full access
```

With PKCE:
```
1. ChatGPT generates random code_verifier (secret, never sent)
2. ChatGPT sends code_challenge = sha256(code_verifier) with the request
3. Attacker intercepts code — useless without code_verifier
4. ChatGPT exchanges code + code_verifier for token
5. Server verifies: sha256(code_verifier) === stored code_challenge
6. Only the original requester can complete the exchange
```

Your system uses S256 (SHA-256) method. Plain PKCE (no hash) offers no protection. Never allow plain.

---

### 2.4 Token Security — Why You Never Store Raw Tokens

Your `mcp_workspace_tokens` table stores `token_hash` not `token`. This is the same reason passwords are stored as hashes. If D1 is ever compromised:

```
With raw token stored:
  Attacker reads token → calls /mcp → full access to all tools

With token_hash stored:
  Attacker reads SHA-256 hash → cannot reverse to original token
  Cannot call /mcp → useless
```

The bearer token exists in exactly two places:
1. In transit (HTTPS, so encrypted in flight)
2. In ChatGPT's memory (you have no control over this)

It never touches your disk. Your DB has only the hash. This is called **hash-only storage** and is non-negotiable for production auth systems.

The verification path:
```js
// Incoming request
const rawBearer = request.headers.get('Authorization').replace('Bearer ', '');
const hash = await sha256hex(rawBearer);
const tokenRow = await env.DB.prepare(
  'SELECT * FROM mcp_workspace_tokens WHERE token_hash=? AND is_active=1'
).bind(hash).first();
// rawBearer is never stored. Ever.
```

---

### 2.5 Audience Binding — Why Tokens Are Locked to One Server

Your token endpoint requires a `resource` parameter matching `https://mcp.inneranimalmedia.com/mcp`. The MCP server rejects tokens whose `audience` column doesn't match.

Why this matters:

```
WITHOUT audience binding:
  Token for your MCP server
  → Could be replayed at any other server
  → If another service accepts bearer tokens, attacker reuses yours

WITH audience binding:
  Token minted with audience = "https://mcp.inneranimalmedia.com/mcp"
  → Only accepted by your MCP server
  → Replaying at another server returns 401
```

This is RFC 8707. Your code checks it in `resolveWorkspace()` as `oauthTokenAudienceMatches`.

---

## Part 3 — Multi-Tenant Identity Isolation

### 3.1 What Multi-Tenancy Actually Means

Your platform serves multiple clients:
- `ws_inneranimalmedia` — your own platform workspace
- `ws_connector_mcneely` — Connor's workspace  
- `ws_shinshusolutions` — Jake's workspace
- Future: dozens more

Multi-tenancy means each tenant's data is completely invisible to every other tenant. Not "hidden by the UI" — invisible at the database query level. Even if a bug in your UI showed the wrong screen, the D1 queries must return zero rows from another tenant.

This is **tenant isolation** and it is your most important customer promise. Violating it — even accidentally — is the kind of incident that ends SaaS companies.

### 3.2 How Your System Enforces It

**Layer 1: Token scope**
Every `mcp_workspace_tokens` row has `workspace_id` and `tenant_id`. The MCP server loads these from the token at authentication time. Every subsequent operation uses these values — not anything from the request.

**Layer 2: D1 query scoping**
`assertD1SqlScoped()` in your codebase checks that every SQL statement hitting D1 via a tool call includes `WHERE workspace_id=?` or `WHERE tenant_id=?`. If a query arrives without these constraints, it's rejected.

```js
// This query would be blocked:
"SELECT * FROM agentsam_plans"

// This passes:
"SELECT * FROM agentsam_plans WHERE workspace_id=?"
// Bound to: [token.workspace_id] — never from user input
```

**Layer 3: Workspace execution scope**
`applyWorkspaceExecutionScope()` in the MCP server mutates tool arguments before dispatch — injects `workspace_id`, `tenant_id`, repo paths, R2 prefixes. The tool never sees raw user-supplied context.

**Layer 4: OAuth tool allowlist**
`agentsam_mcp_oauth_tool_allowlist` caps what tools an OAuth client can ever see or call. Even if a bug elsewhere granted a token with `allowed_tools: null` (unrestricted), this table is a hard ceiling.

### 3.3 The Isolation Stack Visualized

```
ChatGPT request arrives
        │
        ▼
Bearer token → sha256 → mcp_workspace_tokens lookup
        │
        ├── workspace_id extracted (DERIVED, not received)
        ├── tenant_id extracted
        ├── allowed_tools extracted
        └── risk ceiling extracted
        │
        ▼
Tool call: "d1_query" with SQL from agent
        │
        ├── assertD1SqlScoped() — must reference workspace_id/tenant_id
        ├── isClientToolAllowed() — must be in allowed_tools
        ├── enforceOAuthToolGuards() — risk ≤ ceiling, approval if required
        └── applyWorkspaceExecutionScope() — inject workspace context
        │
        ▼
D1 executes:
  SELECT * FROM agentsam_plans
  WHERE workspace_id = ?   ← bound to token.workspace_id
  AND tenant_id = ?        ← bound to token.tenant_id
        │
        ▼
Returns only THIS tenant's data
```

At no point in this chain does a value from the request body or agent arguments affect which tenant's data is accessed. Only the token determines scope.

### 3.4 What a Tenant Isolation Breach Looks Like

And why `ws_innerautodidact` being selected was a warning sign:

```
You have 50 tenants. User A authenticates.
OAuth consent form asks "which workspace?"
User A types "ws_connormcneely" into a tampered form payload.
Token mints with workspace_id='ws_connormcneely'.
User A calls tools/list — sees Connor's allowed tools.
User A calls d1_query — if not scoped server-side, reads Connor's data.
```

Even in your single-user scenario today, the wrong workspace being selected caused real breakage — ChatGPT got zero tools. With multiple customers, the wrong workspace being accepted from input could expose one customer's data to another. That's a GDPR incident. That's a breach notification. That's the end of trust.

The fix — server-side workspace resolution from authenticated identity — makes this entire class of attack impossible, not just unlikely.

---

## Part 4 — The Token Lifecycle

### 4.1 Full Token Lifecycle

```
BIRTH
  OAuth consent approved
  → INSERT mcp_workspace_tokens (token_hash, allowed_tools, expires_at)
  → auth_event_log: iam_mcp_oauth_token_issued
  → Token returned to client ONCE — never stored raw

LIFE
  Each request: sha256(bearer) → mcp_workspace_tokens lookup
  → KV cache (1hr TTL) for performance: token_hash:{hash}
  → Tool calls log to agentsam_tool_call_log
  → rate_limit_per_hour checked against tool call count
  → last_used_at updated

DEATH — natural (expiry)
  expires_at < unixepoch()
  → Midnight cron deletes row
  → Next request: token not found → 401
  → Client must re-authorize via OAuth

DEATH — forced (revocation)
  User revokes in Settings → Access Management
  → revoked_at, revoked_by set
  → is_active set to 0
  → KV cache entry purged immediately
  → Next request: is_active=0 → 401 even if not expired

DEATH — rotation
  Token refresh (if refresh tokens enabled)
  → New token minted
  → Old token hash invalidated
  → rotated_from points to predecessor for audit
```

### 4.2 The Event Log Gap

Your `auth_event_log` was recording `iam_mcp_oauth_token_issued` BEFORE confirming the DB insert committed. This is called **logging before confirmation** and it creates phantom events — your audit trail says a token was issued when no token actually exists.

The rule: **audit events fire after confirmed state changes, never before.**

```js
// WRONG — logs success before confirming insert
await logEvent('iam_mcp_oauth_token_issued', ...);
await env.DB.prepare('INSERT INTO mcp_workspace_tokens ...').run();

// CORRECT — confirms insert, then logs
const result = await env.DB.prepare('INSERT INTO mcp_workspace_tokens ...').bind(...).run();
if (!result.meta?.changes) {
  throw new Error('Token insert produced zero changes');
}
await logEvent('iam_mcp_oauth_token_issued', ...); // only fires if insert confirmed
```

---

## Part 5 — MCP Architecture

### 5.1 What MCP Actually Is

MCP (Model Context Protocol) is a standard for AI models to call tools on remote servers. Before MCP, every AI integration was custom — different auth, different formats, different tool definitions. MCP standardizes all of it.

Your MCP server at `mcp.inneranimalmedia.com/mcp` is a JSON-RPC 2.0 server with three primary methods:

- `tools/list` — return the tools this token is authorized to see
- `tools/call` — execute a specific tool with validated inputs
- `resources/list` — list readable resources (optional, not your primary path)

Any MCP client (Claude Desktop, ChatGPT, Cursor, your own Agent Sam) can connect to your server and get the same tools, same auth, same scoping.

### 5.2 Your Two-Worker Architecture

```
inneranimalmedia.com (IAM Worker)
  Role: Authorization server + dashboard + consent UI
  Owns: OAuth flow, token mint, user sessions, D1 writes
  Key files: src/api/oauth.js, src/api/mcp-oauth-consent.js

mcp.inneranimalmedia.com (MCP Worker)
  Role: Resource server + tool dispatch
  Owns: tools/list, tools/call, workspace execution
  Key files: src/index.js (MCP server), src/agentsam-tools-catalog.js

Shared: D1 inneranimalmedia-business
  Both workers read mcp_workspace_tokens
  IAM writes tokens, MCP reads them
  One D1 = single source of truth
```

This separation is intentional and important:
- IAM is the **authorization server** — it decides who gets what
- MCP is the **resource server** — it executes what authorized tokens request
- They share data (D1) but not code
- Compromising MCP does not compromise the ability to mint tokens
- Compromising IAM does not expose tool execution directly

### 5.3 The Bridge Key — Internal Use Only

`AGENTSAM_BRIDGE_KEY` is a platform-level secret for Worker-to-Worker communication. Never in user hands, never in ChatGPT config, never in any external client.

```
BRIDGE KEY is appropriate for:
  - IAM Worker calling MCP Worker internally
  - Deploy scripts calling internal APIs
  - Agent Sam calling internal telemetry routes
  - Debug validation: "does MCP even work?" (curl from your machine only)

BRIDGE KEY is NEVER appropriate for:
  - Any external client (ChatGPT, Cursor, Claude Desktop)
  - Any per-user token
  - Any OAuth flow
  - Anything that leaves the Cloudflare network
```

Think of it as a service account key between your own servers. The OAuth flow exists precisely because external clients need per-user, scoped, revocable access — not a god key.

### 5.4 Tool Registry — Why D1 Is the Source of Truth

Your `agentsam_tools` table (76 active rows) is the registry. Every tool has:

- `tool_key` — canonical identifier
- `handler_type` — how it executes (d1, r2, terminal, proxy, etc.)
- `handler_config` — JSON with execution parameters
- `input_schema` — JSON Schema for validation
- `risk_level` — low/medium/high/critical
- `requires_approval` — must pause for human confirmation

The MCP server never hardcodes tool logic. It loads the row, validates the config, and dispatches to the handler. This means:

- Adding a tool = INSERT into D1 (no code deploy)
- Changing risk level = UPDATE in D1 (no code deploy)
- Disabling a tool = UPDATE is_active=0 (instant, no deploy)
- Adding per-user restrictions = INSERT into agentsam_mcp_allowlist

Your tools are data, not code. This is the right architecture for a platform.

---

## Part 6 — Policy Layers

### 6.1 The Seven Layers Between a Request and Execution

When ChatGPT calls `tools/call`, your system passes through seven gates. Understanding each gate is what makes you confident in your security posture.

```
Gate 1: Token authentication
  sha256(bearer) → mcp_workspace_tokens
  Fail: 401 Unauthorized

Gate 2: Token validity
  is_active=1, expires_at > now(), audience matches
  Fail: 401 Token expired/revoked

Gate 3: OAuth scope check
  Does token have mcp:tools scope?
  Write tools also require iam:agent scope
  Fail: 403 Insufficient scope

Gate 4: Tool allowlist
  Is tool_key in token.allowed_tools?
  Fail: 403 Tool not in token allowlist

Gate 5: User policy
  agentsam_user_policy: risk ceiling, require_allowlist_for_mcp
  Fail: 403 Risk ceiling exceeded

Gate 6: Guardrails
  agentsam_guardrails: rule-based blocks
  Fail: 403 Guardrail triggered (logged to agentsam_guardrail_events)

Gate 7: Approval gate
  tool.requires_approval=1 → pause for human confirmation
  Fail: 202 Pending approval (not a failure, a pause)
```

A request must pass all seven gates. No gate trusts that a previous gate ran. This is called **defense in depth** — no single failure exposes the system.

### 6.2 The OAuth Allowlist — Your Customer Safety Layer

`agentsam_mcp_oauth_tool_allowlist` is your most important customer protection. It defines the maximum set of tools any OAuth client can ever see or call, regardless of what the user approved at consent.

Your current setup: 46 tools for `client_id=iam_mcp_inneranimalmedia`.

When you onboard a new customer and they connect ChatGPT:
- They go through OAuth consent
- They see the 46 tools in the allowlist
- Their token is minted with `allowed_tools` = intersection of those 46 and their personal allowlist
- Even if you add 100 more tools to `agentsam_tools` tomorrow, the OAuth client still only sees 46

This means you can safely expand your platform's capabilities without accidentally exposing new tools to existing OAuth clients. You explicitly add tools to the allowlist when you're ready. **Opt-in at the allowlist level, not opt-out.**

---

## Part 7 — Customer Safety Checklist

Before onboarding your first paying customer, verify these:

### Token isolation
```sql
-- Every OAuth token must have non-null workspace_id
SELECT COUNT(*) FROM mcp_workspace_tokens 
WHERE token_type='oauth' AND workspace_id IS NULL;
-- Must be 0

-- No token spans multiple tenants (workspace must belong to token's tenant)
SELECT t.id FROM mcp_workspace_tokens t
LEFT JOIN agentsam_workspace w ON w.id = t.workspace_id
WHERE t.token_type='oauth' AND w.id IS NULL;
-- Must be 0
```

### D1 query scoping
```sql
-- Verify no tool has a SQL template missing workspace scope
SELECT tool_key, handler_config FROM agentsam_tools
WHERE handler_type='d1' 
AND is_active=1
AND (handler_config NOT LIKE '%workspace_id%' 
     AND handler_config NOT LIKE '%tenant_id%');
-- Review any results carefully
```

### Expired session cleanup
```sql
-- Verify cron is cleaning up expired tokens
SELECT COUNT(*) FROM mcp_workspace_tokens
WHERE expires_at IS NOT NULL AND expires_at < unixepoch();
-- Should be 0 or low after midnight cron runs
```

### Workspace resolver
```sql
-- Verify every auth_user has either default_workspace_id 
-- or an active owner membership to fall back to
SELECT au.id, au.email FROM auth_users au
WHERE au.default_workspace_id IS NULL
AND NOT EXISTS (
  SELECT 1 FROM workspace_members wm 
  WHERE wm.user_id=au.id AND wm.is_active=1 AND wm.role='owner'
);
-- Users here will hit resolveCanonicalWorkspace returning null
-- → token mint fails → investigate before they onboard
```

### Audit trail
```sql
-- Verify every token issued has a corresponding log event
SELECT 
  COUNT(t.id) as tokens,
  COUNT(e.id) as events
FROM mcp_workspace_tokens t
LEFT JOIN auth_event_log e 
  ON e.event_type='iam_mcp_oauth_token_issued'
WHERE t.token_type='oauth';
-- tokens should equal events (after today's fix)
```

---

## Part 8 — The Things That Still Need Doing

Based on today's session, these gaps remain:

**P0 — OAuth token INSERT not confirmed**
The fix is in progress. Without this, OAuth tokens appear to issue but don't persist. ChatGPT and Claude Desktop get zero tools.

**P1 — Workspace picker removal from consent UI**
Consent UI still shows workspace selector. Must be removed — workspace resolved server-side from identity.

**P1 — MODEL_RESOLUTION_FAILED on /api/agent/chat**
The agent chat route cannot resolve a model. Separate from OAuth — the model catalog resolution path in `src/core/routing.js` / `selectAutoModel()` is failing. Needs its own investigation.

**P2 — Entitlements encryption**
`allowed_tools`, `scopes_json`, `allowed_lanes_json` in `mcp_workspace_tokens` are stored as plaintext JSON. A D1 breach exposes what each token is allowed to do. Encrypting with AES-GCM using a bearer-derived key would close this.

**P2 — routing_arm_id never written to tool logs**
Thompson Sampling gets zero signal from tool calls. Every `agentsam_tool_call_log` row has `routing_arm_id=null`.

**P3 — 48 orphaned tool call logs**
`agent_run_id=null` on 48 rows. Tool calls not linked to runs. Telemetry incomplete.

---

## Summary — The Principles That Never Change

Regardless of how your platform evolves, these principles remain constant:

1. **Derive, don't receive.** Authorization context comes from your DB, not the caller.

2. **Hash-only storage.** Raw secrets — tokens, passwords, API keys — never touch your disk.

3. **Fail closed.** When you can't establish a secure context with certainty, reject. Never fall through to a permissive default.

4. **Audit after confirmation.** Log that something happened only after confirming it happened.

5. **Defense in depth.** Multiple independent gates. No single gate trusts the others ran.

6. **Scope at the token.** Every token knows exactly what it can do. No token has more access than was explicitly granted at consent.

7. **Tenant data never crosses.** No query returns data from a workspace that isn't the token's workspace. Not because the UI hides it — because the SQL can't return it.

These are not IAM-specific rules. These are the rules. Every production auth system that has survived contact with attackers, auditors, and accidents is built on them.

---

*You are not a junior developer who got lucky. You built a production multi-tenant OAuth 2.1 MCP authorization system from scratch, debugged it under real conditions, and fixed real security gaps. That is senior work. Now you understand why every decision was made the way it was.*

## Related docs in this repo

- `docs/auth/EXTERNAL_AI_MCP_OAUTH_INSTRUCTIONS.md` — client setup (ChatGPT, Cursor, Claude)
- `docs/auth/IAM_OAUTH_PROVIDER_EXECUTION_PLAN.md` — D1 forensic plan
- `docs/auth/MCP_OAUTH_UI_AGENT_HANDOFF.md` — consent UI maintenance
