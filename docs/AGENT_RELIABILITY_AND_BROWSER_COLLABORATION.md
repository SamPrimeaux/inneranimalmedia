# Agent reliability and browser collaboration

**Purpose:** Clarify “Overload”/529 vs API budget, and how the agent can open URLs in the preview panel so you can complete login/admin flows without leaving the dashboard.

---

## 1. “Overload” / 529 is not your API balance

- **529** is a Cloudflare status code meaning the **Worker** (your server) was temporarily overloaded—e.g. too much CPU, cold start, or too many concurrent requests. It is **not** “out of API credits.”
- Your **Anthropic, Cursor API, OpenAI, and AI Gateway** balances are separate. The agent uses those when the Worker successfully calls them; 529 happens *before* that (Worker capacity), so having plenty of $ in those accounts doesn’t prevent 529.

**What we did:**

- **Frontend:** If the first request returns 529, the dashboard **retries once** after 2 seconds before showing an error. Many transient overloads clear on retry.
- **System prompt:** The agent is instructed to tell the user that Overload/529 means the Worker was busy, not that API balance is low, and that they have sufficient credits.

**If 529 keeps happening:**

- Check **Cloudflare Workers** usage (CPU time, subrequest limits).
- Consider **Workers Paid** or higher limits if you’re on the free tier.
- Reduce work per request (e.g. stream responses, trim schema injection size) so the Worker stays under limits.

---

## 2. Opening URLs in the preview panel (browser collaboration)

When you need to do something in a browser (e.g. `wrangler login`, OAuth, Cloudflare dashboard, admin), the agent can **open that URL in the dashboard’s preview panel** so you complete the step there and keep chatting.

**How it works:**

1. You ask the agent for something that requires a browser step (e.g. “I need to run wrangler login” or “open the Cloudflare dashboard”).
2. The agent replies with a **single line** in its message:  
   `OPEN_IN_PREVIEW: https://…`  
   (full URL, no extra characters on that line.)
3. The dashboard **parses** that line, opens the **preview panel** (right side), loads that URL in the iframe, and **removes the line** from the visible message.
4. You complete login/admin in the preview panel; the agent’s normal text explains what to do next.

**Example:** You say “I need to log in to wrangler.” The agent can respond:

```
OPEN_IN_PREVIEW: https://dash.cloudflare.com/profile/authentication

I've opened the Cloudflare login page in the preview panel. Complete the login there; once you're done, tell me and we can run wrangler commands from your local terminal or continue with the next step.
```

**Limitations:**

- Some sites (e.g. OAuth or strict X-Frame-Options) may **block being loaded in an iframe**. In that case the agent can still output the URL and you can open it in a new tab, or we can add a “Open in new tab” button that uses the same URL.
- The preview panel is the same-origin dashboard iframe; for `wrangler login`, Cloudflare’s auth page may allow iframe—if not, the user can copy the URL from the agent’s message or we can surface it as a clickable “Open in new tab” link.

---

## 3. Quick reference

| Topic | Detail |
|-------|--------|
| **529 / Overload** | Worker overload, not API balance. Dashboard retries once. Agent tells user they have sufficient credits. |
| **OPEN_IN_PREVIEW** | Agent outputs one line: `OPEN_IN_PREVIEW: <url>`. Dashboard opens the URL in the preview panel and strips the line from the message. |
| **Iframe blocked** | Use “Open in new tab” (or copy URL from message) for sites that block iframes. |
