# CMS Edit — PrimeTech Agent Loop

Use when `task_type` or `route_key` is `cms_edit`, or the user is revising/remastering a CMS page from the studio or agent workspace browser.

## Protocol (mandatory order)

1. **`agentsam_cms_read`** `{ page_id }` — load page, sections, HTML excerpts, `preview_urls.live_url`
2. **Edit** — one of:
   - **`cms_pipeline_prototype`** `{ goal, page_id }` — AI HTML proposal (Python pipeline)
   - **`agentsam_cms_save_page_html`** `{ page_id, html }` — full-page remaster
   - **`agentsam_cms_save_injected`** `{ page_id, section_name, html }` — section fragment
   - **`agentsam_cms_write`** `{ section_id, section_data }` — structured section JSON
3. **`agentsam_cms_publish`** `{ page_id }` — draft R2 → published, D1 `status=published`
4. **`agentsam_cms_verify_live`** `{ page_id, expect_title? }` — confirm official URL (no `?cms=1`) returns real HTML

**Do not claim success until step 4 passes.** Reject "Clean canvas", 404, or `<500 bytes` as incomplete publish.

## Context from studio

When opened from CMS studio or workspace browser, use injected `page_id`, `live_url`, `r2_key`, and `picked_element` — never invent IDs.

## Remastering guidance

- Read current `html_published.excerpt` before rewriting
- Preserve route_path and slug unless user asks to change URL
- Full-page HTML must include `<!DOCTYPE html>` or `<html>`
- After save on a published page, live URL serves old content until **publish**

## Example (Agent Sam page)

```
agentsam_cms_read({ page_id: "5de91aa0-10cc-45e5-9607-199d5c2f8467" })
→ agentsam_cms_save_page_html({ page_id: "...", html: "<!DOCTYPE html>..." })
→ agentsam_cms_publish({ page_id: "..." })
→ agentsam_cms_verify_live({ page_id: "...", expect_title: "AgentSam" })
```
