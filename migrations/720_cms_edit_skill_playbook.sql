-- Register PrimeTech CMS Edit playbook on skill_iam_cms_edit for cms_edit route/task injection.
-- Requires skill_context_injection feature flag + buildSystemPrompt skill loader (agent-prompt-builder.js).
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/720_cms_edit_skill_playbook.sql
--
-- Optional R2 + Vectorize ingest:
--   npm run run:ingest_skill_playbooks

UPDATE agentsam_skill
SET
  name = 'PrimeTech CMS Edit',
  description = 'Mandatory read → save → publish → verify loop for CMS page revisions on inneranimalmedia.com storefront URLs.',
  content_markdown = '# CMS Edit — PrimeTech Agent Loop

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
```',
  file_path = 'skills/cms_edit/SKILL.md',
  retrieval_strategy = 'db',
  task_types_json = '["cms_edit"]',
  route_keys_json = '["cms_edit"]',
  slash_trigger = 'cms',
  tags_json = '["cms","primetch","publish","studio"]',
  metadata_json = '{"protocol":["read","save","publish","verify"],"playbook":"docs/skills-playbooks/cms_edit/SKILL.md"}',
  token_estimate = 450,
  version = COALESCE(version, 0) + 1,
  sort_order = 4,
  is_active = 1,
  always_apply = 0,
  updated_at = datetime('now')
WHERE id = 'skill_iam_cms_edit';

INSERT OR IGNORE INTO agentsam_skill_revision (skill_id, content_markdown, version, change_note)
SELECT
  'skill_iam_cms_edit',
  content_markdown,
  version,
  '720: PrimeTech CMS agent loop playbook'
FROM agentsam_skill
WHERE id = 'skill_iam_cms_edit';
