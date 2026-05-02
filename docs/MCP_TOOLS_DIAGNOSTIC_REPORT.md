# MCP Tools Emergency Diagnostic Report

## 1. Git diff – what changed for mcp_registered_tools (last 5 commits)

- **No change** to the main tool-loading query used by the chat handler. The diff only shows:
  - New uses of `mcp_registered_tools` (e.g. list_tools builtin, BUILTIN_TOOLS + mcp_tool_calls INSERT, post-deploy worker-structure.md).
  - Header/body changes in `invokeMcpToolFromChat` (Accept, Authorization, id: Date.now()).
- The query **`SELECT tool_name, description FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name`** in `chatWithToolsAnthropic` was not changed by the diff (it already existed).

---

## 2. Tool loading – is the query still there?

**Yes.** There are two places that load tools for the chat:

**A) Streaming path (used when stream=true): `chatWithToolsAnthropic` (lines 4531–4538)**

```javascript
let tools = [];
try {
  const r = await env.DB.prepare('SELECT tool_name, description FROM mcp_registered_tools WHERE enabled = 1 ORDER BY tool_name').all();
  tools = (r.results || []).map((t) => ({
    name: t.tool_name,
    description: (t.description || t.tool_name).slice(0, 500),
    input_schema: { type: 'object', properties: {}, additionalProperties: true },
  }));
} catch (_) {}
if (tools.length === 0) return null;
```

**B) Non-streaming path (when stream=false): main chat handler (lines 3366–3388)**

```javascript
const toolRows = await env.DB.prepare(
  'SELECT tool_name, description, input_schema FROM mcp_registered_tools WHERE enabled = 1'
).all();
toolDefinitions = (toolRows.results ?? []).map(t => {
  let rawSchema = {};
  try { rawSchema = typeof t.input_schema === 'string' ? JSON.parse(t.input_schema) : (t.input_schema || {}); } catch (_) {}
  // ... builds proper input_schema
  return { name: t.tool_name, description: t.description || t.tool_name, input_schema };
});
```

**Bug:** In **chatWithToolsAnthropic** the `catch (_) {}` swallows any DB error. If the query throws, `tools` stays `[]`, then `if (tools.length === 0) return null`. The caller then falls through to the **fallback** streaming request (lines 3460–3474), which does **not** include `tools` in the body. So Claude receives **no tools** and cannot call d1_query, r2_read, etc. Only behavior that doesn’t rely on the tool list (e.g. terminal_execute from another path or a single known tool) would still work.

---

## 3. Tool formatting and where tools are sent to Claude

**Tool formatting in chatWithToolsAnthropic (current):**

- Load: `tool_name`, `description` only (no `input_schema`).
- Format: `input_schema` is hardcoded to `{ type: 'object', properties: {}, additionalProperties: true }`.

**Where tools are sent to Claude:**

- **chatWithToolsAnthropic** (lines 4553–4568): builds `body = { model, max_tokens, system, messages, tools }` and sends it to `https://api.anthropic.com/v1/messages`. So `tools` **is** present when `tools.length > 0`.

**Conclusion:** When the DB load succeeds, tools are sent. When it fails (or returns no rows), `tools.length === 0` and the function returns `null`, so the streaming fallback runs and **no** `tools` are sent. That matches “MCP tools return not found” and “only terminal_execute works” if the working case is a different path or a single tool.

---

## Root cause (likely)

1. In **chatWithToolsAnthropic**, any failure in the tool-loading query is hidden by `catch (_) {}`, so `tools` becomes `[]` and the function returns `null`.
2. The streaming fallback request does not include `tools`, so Claude never gets the 23 tools.
3. Result: tool calls like d1_query / r2_read appear as “not found” because they were never offered to the model.

---

## Recommended fix

1. **chatWithToolsAnthropic:** Load tools the same way as the non-streaming path: `SELECT tool_name, description, input_schema FROM mcp_registered_tools WHERE enabled = 1`, parse `input_schema`, and build the same `{ name, description, input_schema }` shape.
2. **Do not swallow errors:** In chatWithToolsAnthropic, log the error in the catch (e.g. `console.error('[chatWithToolsAnthropic] tool load failed', e)`) and optionally still return null or a safe fallback so the streaming path can degrade without hiding the failure.

---

## Fix applied (worker.js)

- **chatWithToolsAnthropic** (lines 4530–4559):
  - Query now selects **tool_name, description, input_schema** (same as non-streaming path).
  - **input_schema** is parsed from JSON when needed and normalized (use rawSchema when it has `type: 'object'` and `properties`, otherwise build a minimal schema).
  - On exception, **errors are logged** with `console.error('[chatWithToolsAnthropic] tool load failed:', e?.message ?? e)` instead of being swallowed.
- This aligns the streaming tool list with the non-streaming path and makes DB failures visible so the “no tools sent” case can be diagnosed.
