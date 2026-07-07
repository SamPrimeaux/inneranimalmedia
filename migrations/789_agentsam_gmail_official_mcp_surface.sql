-- 789: Register Google's official Gmail MCP server tools (generated).
-- Source: tools/list from https://gmailmcp.googleapis.com/mcp/v1, 12 tools, generated 2026-07-07T03:52:19.006Z.
-- Regenerate: node scripts/generate-gmail-mcp-tools-migration.js
--
-- Depends on 788_register_gmail_official_mcp_server.sql and executeMcpCatalogRow()
-- google_gmail OAuth forwarding in src/core/catalog-tool-executor.js.
--
-- Multi-tenant: each call uses the signed-in user's google_gmail OAuth token(s).
-- Platform GMAIL_DELEGATED_USER / service-account JWT is NOT used for these tools.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/789_agentsam_gmail_official_mcp_surface.sql

INSERT INTO agentsam_tools
  (tool_key, tool_name, display_name, tool_category,
   description, input_schema,
   handler_type, handler_config,
   risk_level, requires_approval, workspace_scope, modes_json,
   oauth_visible, is_active, is_global,
   updated_at)
VALUES
(
  'agentsam_gmail_mcp_create_draft', 'agentsam_gmail_mcp_create_draft',
  'Gmail Create Draft', 'gmail.official',
  'Creates a new draft email in the authenticated user''s Gmail account.

This tool takes recipient addresses, a subject, and body content as inputs. It returns the ID of the created Gmail draft. If the draft is created as a reply to an existing message, the ID of the original message should be passed to the tool in the replyToMessageId field. Creating drafts with attachments is not supported yet.
',
  '{"$defs":{"Attachment":{"description":"Represents an attachment to be included in an email.","properties":{"content":{"description":"Required. The base64-encoded content of the attachment.","format":"byte","type":"string"},"filename":{"description":"Optional. The name of the file to be attached, e.g. \"invoice.pdf\". For inline attachments, this is used for Content-ID generation. For regular attachments, filename is used to specify the filename to email clients. If not provided, the attachment may be received with no name.","type":"string"},"id":{"description":"Optional. Output only. When present, contains the ID of an external attachment that can be retrieved in a separate `GetMessageAttachment` request.","readOnly":true,"type":"string"},"inline":{"description":"Optional. If true, this attachment is handled as inline. An inline attachment is a content that is intended to be displayed within the body of an HTML email, as opposed to being listed as a separate file for download. If false or absent, defaults to false, and it''s treated as a regular attachment.","type":"boolean"},"mimeType":{"description":"Optional. The field representing a content or media type must use IANA MIME type, https://www.iana.org/assignments/media-types/media-types.xhtml. If not provided, defaults to \"application/octet-stream\".","type":"string"}},"required":["content"],"type":"object"}},"description":"Request message for CreateDraft RPC.","properties":{"attachments":{"description":"Optional. The attachments to include in the email. The combined size of attachments in the message cannot exceed 25MB. If you need to send files larger than 25MB, upload the file to Drive first and then insert the Drive link into body or html_body.","items":{"$ref":"#/$defs/Attachment"},"type":"array"},"bcc":{"description":"Optional. The blind carbon copy recipients of the email draft. Each string MUST be a valid plain email address (e.g., \"user@example.com\"). The \"Name \" format is NOT supported by this tool.","items":{"type":"string"},"type":"array"},"body":{"description":"Optional. The main body content of the email draft. If html_body is also provided, this field is treated as the plain-text alternative.","type":"string"},"cc":{"description":"Optional. The carbon copy recipients of the email draft. Each string MUST be a valid plain email address (e.g., \"user@example.com\"). The \"Name \" format is NOT supported by this tool.","items":{"type":"string"},"type":"array"},"htmlBody":{"description":"The HTML content of the email draft. If provided, this will be used as the rich-text version of the email.","type":"string"},"replyToMessageId":{"description":"Optional. The ID of the message to reply to. If provided, this will be used as the reply-to message ID for the email draft, and the `body` and `html_body` will be appended to the original message body.","type":"string"},"subject":{"description":"Optional. The subject line of the email. Defaults to empty if not provided.","type":"string"},"to":{"description":"Optional. The primary recipients of the email draft. Each string MUST be a valid plain email address (e.g., \"user@example.com\"). The \"Name \" format is NOT supported by this tool.","items":{"type":"string"},"type":"array"}},"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"create_draft","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'high', 1,
  '["*"]', '["agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_list_drafts', 'agentsam_gmail_mcp_list_drafts',
  'Gmail List Drafts', 'gmail.official',
  'Lists draft emails from the authenticated user''s Gmail account.

This tool can filter drafts based on a query string and supports pagination. It returns a list of drafts, including their IDs and subjects (unless `view` is set to `DRAFT_VIEW_METADATA_ONLY`). `page_token` can be used to paginate the results. To retrieve subsequent pages of results, use the `page_token` returned in the previous response.

The `view` parameter controls which fields are populated in the response. By default (or with ',
  '{"description":"Request message for ListDrafts RPC.","properties":{"pageSize":{"description":"Optional. The maximum number of drafts to return. If unspecified, defaults to 20. The maximum allowed value is 50.","format":"int32","type":"integer"},"pageToken":{"description":"Optional. A token received from a previous list_drafts call to retrieve the next page of results. Leave empty to fetch the first page. This is primarily used for pagination to continue fetching results from where the previous `ListDraft` call left off, especially when the number of drafts matching the query exceeds the page_size limit.","type":"string"},"query":{"description":"Examples: \"subject:OneMCP Update\" \"from:gduser1@workspacesamples.dev\" \"to:gduser2@workspacesamples.dev AND newer_than:7d\" \"project proposal has:attachment\" \"is:unread\" A space or a dash (`-`) will separate a number while a dot (`.`) will be a decimal. For example, `01.2047-100` is considered two numbers: `01.2047` and `100`. Note: If we want to ensure all drafts for the query are returned, we can paginate the results by making repeated calls to the tool until the response contains an empty list of drafts.","type":"string"},"view":{"description":"Optional. Controls the fields populated for drafts in the draft list.","enum":["DRAFT_VIEW_UNSPECIFIED","DRAFT_VIEW_METADATA_ONLY","DRAFT_VIEW_FULL"],"type":"string","x-google-enum-descriptions":["Maps to DRAFT_VIEW_FULL for backward compatibility.","Metadata only: does not include subject, plaintext_body, html_body.","Metadata + UGC (Default behavior)."]}},"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"list_drafts","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_get_thread', 'agentsam_gmail_mcp_get_thread',
  'Gmail Get Thread', 'gmail.official',
  'Retrieves a specific email thread from the authenticated user''s Gmail account, including a list of its messages.

The `message_format` parameter controls the format of the messages returned. By default (or with `FULL_CONTENT`), it returns the full content of messages. Use `MINIMAL` to include only subject and snippet (excluding body). Use `METADATA_ONLY` to exclude subject, snippet, body, and attachment filenames. 
',
  '{"description":"Request message for GetThread RPC.","properties":{"messageFormat":{"description":"Optional. Specifies the format of the messages returned within the thread. Defaults to FULL_CONTENT. Note: If you need body content or attachments, use FULL_CONTENT. When using MINIMAL, the plaintext_body and attachment_ids fields will not be populated. If you are unsure which format to use, rely on the default behavior by using FULL_CONTENT.","enum":["MESSAGE_FORMAT_UNSPECIFIED","MINIMAL","FULL_CONTENT","METADATA_ONLY"],"type":"string","x-google-enum-descriptions":["Defaults to FULL_CONTENT.","Returns message snippets and key headers (Subject, From, To, Cc, Date).","Returns all information in \"MINIMAL\" plus the full body content of each message.","Metadata only: does not include subject, snippet, body, attachment filenames."]},"threadId":{"description":"Required. The unique identifier of the thread to fetch.","type":"string"}},"required":["threadId"],"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"get_thread","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_search_threads', 'agentsam_gmail_mcp_search_threads',
  'Gmail Search Threads', 'gmail.official',
  'Lists email threads from the authenticated user''s Gmail account.

This tool can filter threads based on a query string and supports pagination. It returns a list of threads, including their IDs and related messages. Each related message contains details like a snippet of the message body, the subject, the sender, the recipients etc. The `view` parameter controls which fields are populated in the related messages. By default (or with `THREAD_VIEW_MINIMAL`), it includes subject and snippet. Use `T',
  '{"description":"Request message for SearchThreads RPC.","properties":{"includeTrash":{"description":"Optional. Include drafts from TRASH in the results. Defaults to false.","type":"boolean"},"pageSize":{"description":"Optional. The maximum number of threads to return. If unspecified, defaults to 20. The maximum allowed value is 50.","format":"int32","type":"integer"},"pageToken":{"description":"Optional. Page token to retrieve a specific page of results in the list. Leave empty to fetch the first page. This is primarily used for pagination to continue fetching results from where the previous `SearchThreads` call left off, especially when the number of threads matching the query exceeds the page_size limit.","type":"string"},"query":{"description":"Optional. A query string to filter the threads. Natural language queries must be pre-converted into Gmail syntax queries to use this tool. If omitted, all threads (excluding spam and trash by default) are listed. Supported Operators by Category: Sender & Recipient: from: - Sent from a specific person. to: - Sent to a specific person. cc: - Specific people in Cc. bcc: - Specific people in Bcc. deliveredto: - Delivered to a specific address. list: - From a specific mailing list. Time & Date: after:YYYY/MM/DD / newer:YYYY/MM/DD - Received after a date. before:YYYY/MM/DD / older:YYYY/MM/DD - Received before a date. older_than: - Older than a duration (e.g., 1y, 2d). newer_than: - Newer than a duration. Content: subject: - Words in the subject line. has: - Has specific content types (attachment, drive, youtube, document). filename: - Attachment with a specific name or type. \"\" - Search for an exact word or phrase. (e.g., \"holiday\", \"holiday vacation\"). + - Match a word exactly. (e.g., +holiday, +unicorn) rfc822msgid: - Specific message ID header. AROUND - Find words near each other (e.g., holiday AROUND 10 vacation). Labels & Categories: label: - Under a specific label. The tool accepts label IDs, not display names. Use the list_labels tool to get the ID. category: - In a category (primary, social, promotions, updates, forums, reservations, purchases). in: - Search in specific labels (archive, snoozed, trash, sent, inbox). E.g., `in:trash`, `in:inbox`. Archived and sent messages are included by default; use `-in:archive` and `-in:sent` to exclude them. Drafts are explicitly excluded by default by the tool. Use `in:inbox` to restrict search to the inbox only. has:userlabels - Has any user labels. has:nouserlabels - Does not have any user labels. has:*-star - Specific star colors (if enabled, e.g., has:yellow-star). in:draft - Search in drafts. -in:draft means exclude drafts from the search results. in:sent - Search in sent messages. in:anywhere - Search in all folders (including spam and trash). Status: is: - Search by status (important, starred, unread, read, muted). Size: size: - Specific size in bytes. larger: / smaller: - Larger or smaller than a size (e.g., 10M for 10 MB). Logic & Grouping: AND - Match all criteria (default behavior). OR or { } - Match one or more criteria (e.g., from:amy OR from:david, {from:amy from:david}). - (minus) - Exclude criteria (e.g., -movie). ( ) - Group multiple search terms (e.g., subject:(dinner film)). Examples: \"subject:OneMCP Update\" \"from:user@example.com\" \"to:user2@example.com AND newer_than:7d\" \"project proposal has:attachment\" \"is:unread -in:draft\"","type":"string"},"view":{"description":"Optional. Controls the fields populated for threads in the thread list.","enum":["THREAD_VIEW_UNSPECIFIED","THREAD_VIEW_METADATA_ONLY","THREAD_VIEW_MINIMAL"],"type":"string","x-google-enum-descriptions":["Maps to DRAFT_VIEW_FULL for backward compatibility.","Metadata only: does not include subject, plaintext_body, html_body.","Minimal: includes subject and snippet, but no body."]}},"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"search_threads","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_label_thread', 'agentsam_gmail_mcp_label_thread',
  'Gmail Label Thread', 'gmail.official',
  'Adds labels to an entire thread in the authenticated user''s Gmail account. This operation affects all messages currently in the thread and any future messages added to it.

If unsure of the thread ID, use the `search_threads` tool first.

If unsure of a user label''s ID, use the `list_labels` tool first to discover available labels and their IDs.
',
  '{"description":"Request message for LabelThread RPC.","properties":{"labelIds":{"description":"Required. The unique identifiers of the labels to add. Can be a system label ID (e.g., ''INBOX'', ''TRASH'', ''SPAM'', ''STARRED'', ''UNREAD'', ''IMPORTANT'') or a user-defined label ID. The tool accepts `label_ids` and not label names. Use the list_labels tool to get the corresponding label id to a display name for user-defined labels.","items":{"type":"string"},"type":"array"},"threadId":{"description":"Required. The unique identifier of the thread to add labels to.","type":"string"}},"required":["threadId","labelIds"],"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"label_thread","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'medium', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_unlabel_thread', 'agentsam_gmail_mcp_unlabel_thread',
  'Gmail Unlabel Thread', 'gmail.official',
  'Removes labels from an entire thread in the authenticated user''s Gmail account. If unsure of the thread ID, use the `search_threads` tool first. If unsure of a user label''s ID, use the `list_labels` tool first.',
  '{"description":"Request message for UnlabelThread RPC.","properties":{"labelIds":{"description":"Required. The unique identifiers of the labels to remove. Can be a system label ID (e.g., ''INBOX'', ''TRASH'', ''SPAM'', ''STARRED'', ''UNREAD'', ''IMPORTANT'') or a user-defined label ID. The tool accepts `label_ids` and not label names. Use the list_labels tool to get the corresponding label id to a display name for user-defined labels.","items":{"type":"string"},"type":"array"},"threadId":{"description":"Required. The unique identifier of the thread to remove labels from.","type":"string"}},"required":["threadId","labelIds"],"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"unlabel_thread","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'medium', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_apply_sensitive_thread_label', 'agentsam_gmail_mcp_apply_sensitive_thread_label',
  'Gmail Apply Sensitive Thread Label', 'gmail.official',
  'Adds a sensitive label (Trash or Spam) to an entire thread in the authenticated user''s Gmail account. This operation affects all messages currently in the thread and any future messages added to it.

Use this tool to trash or mark a thread as spam. If unsure of the thread ID, use the `search_threads` tool first.
',
  '{"description":"Request message for ApplySensitiveThreadLabel RPC.","properties":{"labelOption":{"description":"Required. The sensitive label option to add.","enum":["LABEL_OPTION_UNSPECIFIED","TRASH","SPAM"],"type":"string","x-google-enum-descriptions":["Unspecified label option.","Trash label.","Spam label."]},"threadId":{"description":"Required. The ID of the thread to add the label to.","type":"string"}},"required":["threadId","labelOption"],"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"apply_sensitive_thread_label","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'high', 1,
  '["*"]', '["agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_list_labels', 'agentsam_gmail_mcp_list_labels',
  'Gmail List Labels', 'gmail.official',
  'Lists all user-defined labels available in the authenticated user''s Gmail account. Use this tool to discover the `id` of a user label before calling `label_thread`, `unlabel_thread`, `label_message`, or `unlabel_message`. System labels are not returned by this tool but can be used with their well-known IDs: ''INBOX'', ''TRASH'', ''SPAM'', ''STARRED'', ''UNREAD'', ''IMPORTANT'', ''CHAT'', ''DRAFT'', ''SENT''.',
  '{"description":"Request message for ListLabels RPC.","properties":{"pageSize":{"description":"Optional. The maximum number of labels to return.","format":"int32","type":"integer"},"pageToken":{"description":"Optional. Page token to retrieve a specific page of results in the list.","type":"string"}},"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"list_labels","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'low', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_label_message', 'agentsam_gmail_mcp_label_message',
  'Gmail Label Message', 'gmail.official',
  'Adds one or more labels to a specific message in the authenticated user''s Gmail account.

To find the message ID, use tools like `search_threads` or `get_thread`. If unsure of a user label''s ID, use the `list_labels` tool first to discover available labels and their IDs.
',
  '{"description":"Request message for LabelMessage RPC.","properties":{"labelIds":{"description":"Required. The IDs of the labels to add. Can be a system label ID (e.g., ''INBOX'', ''TRASH'', ''SPAM'', ''STARRED'', ''UNREAD'', ''IMPORTANT'') or a user-defined label ID. The tool accepts `label_ids` and not label names. Use the list_labels tool to get the corresponding label id to a display name for user-defined labels.","items":{"type":"string"},"type":"array"},"messageId":{"description":"Required. The ID of the message to add the labels to.","type":"string"}},"required":["messageId","labelIds"],"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"label_message","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'medium', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_unlabel_message', 'agentsam_gmail_mcp_unlabel_message',
  'Gmail Unlabel Message', 'gmail.official',
  'Removes one or more labels from a specific message in the authenticated user''s Gmail account. To find the message ID, use tools like `search_threads` or `get_thread`. If unsure of a user label''s ID, use the `list_labels` tool first to discover available labels and their IDs.',
  '{"description":"Request message for UnlabelMessage RPC.","properties":{"labelIds":{"description":"Required. The IDs of the labels to remove. Can be a system label ID (e.g., ''INBOX'', ''TRASH'', ''SPAM'', ''STARRED'', ''UNREAD'', ''IMPORTANT'') or a user-defined label ID. The tool accepts `label_ids` and not label names. Use the list_labels tool to get the corresponding label id to a display name for user-defined labels.","items":{"type":"string"},"type":"array"},"messageId":{"description":"Required. The ID of the message to remove the labels from.","type":"string"}},"required":["messageId","labelIds"],"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"unlabel_message","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'medium', 0,
  '["*"]', '["ask","plan","debug","agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_apply_sensitive_message_label', 'agentsam_gmail_mcp_apply_sensitive_message_label',
  'Gmail Apply Sensitive Message Label', 'gmail.official',
  'Adds a sensitive label (Trash or Spam) to a specific message in the authenticated user''s Gmail account.

Use this tool to trash or mark a message as spam. To find the message ID, use tools like `search_threads` or `get_thread`.
',
  '{"description":"Request message for ApplySensitiveMessageLabel RPC.","properties":{"labelOption":{"description":"Required. The sensitive label option to add.","enum":["LABEL_OPTION_UNSPECIFIED","TRASH","SPAM"],"type":"string","x-google-enum-descriptions":["Unspecified label option.","Trash label.","Spam label."]},"messageId":{"description":"Required. The ID of the message to add the label to.","type":"string"}},"required":["messageId","labelOption"],"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"apply_sensitive_message_label","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'high', 1,
  '["*"]', '["agent","multitask"]',
  1, 1, 1, unixepoch()
),
(
  'agentsam_gmail_mcp_create_label', 'agentsam_gmail_mcp_create_label',
  'Gmail Create Label', 'gmail.official',
  'Creates a new label in the authenticated user''s Gmail account.
Supports creating nested labels (sub-labels) using a forward slash (e.g., ''Projects/Alpha/Sprint-1'').
By default, parent labels will be automatically created if they do not exist.
',
  '{"$defs":{"LabelColor":{"description":"The color of the label.","properties":{"backgroundColor":{"description":"The background color of the label, represented as a hex string (e.g., \"#ffffff\"). Only the following predefined set of color values are allowed: # 000000, #434343, #666666, #999999, #cccccc, #efefef, #f3f3f3, #ffffff, # fb4c2f, #ffad47, #fad165, #16a766, #43d692, #4a86e8, #a479e2, #f691b3, # f6c5be, #ffe6c7, #fef1d1, #b9e4d0, #c6f3de, #c9daf8, #e4d7f5, #fcdee8, # efa093, #ffd6a2, #fce8b3, #89d3b2, #a0eac9, #a4c2f4, #d0bcf1, #fbc8d9, # e66550, #ffbc6b, #fcda83, #44b984, #68dfa9, #6d9eeb, #b694e8, #f7a7c0, # cc3a21, #eaa041, #f2c960, #149e60, #3dc789, #3c78d8, #8e63ce, #e07798, # ac2b16, #cf8933, #d5ae49, #0b804b, #2a9c68, #285bac, #653e9b, #b65775, # 822111, #a46a21, #aa8831, #076239, #1a764d, #1c4587, #41236d, #83334c, # 464646, #e7e7e7, #0d3472, #b6cff5, #0d3b44, #98d7e4, #3d188e, #e3d7ff, # 711a36, #fbd3e0, #8a1c0a, #f2b2a8, #7a2e0b, #ffc8af, #7a4706, #ffdeb5, # 594c05, #fbe983, #684e07, #fdedc1, #0b4f30, #b3efd3, #04502e, #a2dcc1, # c2c2c2, #4986e7, #2da2bb, #b99aff, #994a64, #f691b2, #ff7537, #ffad46, # 662e37, #ebdbde, #cca6ac, #094228, #42d692, #16a765","type":"string"},"textColor":{"description":"The text color of the label, represented as a hex string (e.g., \"#000000\"). Only the following predefined set of color values are allowed: # 000000, #434343, #666666, #999999, #cccccc, #efefef, #f3f3f3, #ffffff, # fb4c2f, #ffad47, #fad165, #16a766, #43d692, #4a86e8, #a479e2, #f691b3, # f6c5be, #ffe6c7, #fef1d1, #b9e4d0, #c6f3de, #c9daf8, #e4d7f5, #fcdee8, # efa093, #ffd6a2, #fce8b3, #89d3b2, #a0eac9, #a4c2f4, #d0bcf1, #fbc8d9, # e66550, #ffbc6b, #fcda83, #44b984, #68dfa9, #6d9eeb, #b694e8, #f7a7c0, # cc3a21, #eaa041, #f2c960, #149e60, #3dc789, #3c78d8, #8e63ce, #e07798, # ac2b16, #cf8933, #d5ae49, #0b804b, #2a9c68, #285bac, #653e9b, #b65775, # 822111, #a46a21, #aa8831, #076239, #1a764d, #1c4587, #41236d, #83334c, # 464646, #e7e7e7, #0d3472, #b6cff5, #0d3b44, #98d7e4, #3d188e, #e3d7ff, # 711a36, #fbd3e0, #8a1c0a, #f2b2a8, #7a2e0b, #ffc8af, #7a4706, #ffdeb5, # 594c05, #fbe983, #684e07, #fdedc1, #0b4f30, #b3efd3, #04502e, #a2dcc1, # c2c2c2, #4986e7, #2da2bb, #b99aff, #994a64, #f691b2, #ff7537, #ffad46, # 662e37, #ebdbde, #cca6ac, #094228, #42d692, #16a765","type":"string"}},"type":"object"}},"description":"Request message for CreateLabel RPC.","properties":{"autoCreateParentLabels":{"description":"Optional. Whether to automatically create parent labels for nested labels (separated by ''/''). Defaults to true.","type":"boolean"},"color":{"$ref":"#/$defs/LabelColor","description":"Optional. The color of the label."},"displayName":{"description":"Required. The display name of the label to create.","type":"string"}},"required":["displayName"],"type":"object"}',
  'mcp', '{"mcp_service_url":"https://gmailmcp.googleapis.com/mcp/v1","operation":"create_label","auth_source":"user_oauth_tokens","provider":"google_gmail","server_key":"gmail-official"}',
  'high', 1,
  '["*"]', '["agent","multitask"]',
  1, 1, 1, unixepoch()
)
ON CONFLICT(tool_name) DO UPDATE SET
  tool_key = excluded.tool_key,
  display_name = excluded.display_name,
  tool_category = excluded.tool_category,
  description = excluded.description,
  input_schema = excluded.input_schema,
  handler_type = excluded.handler_type,
  handler_config = excluded.handler_config,
  risk_level = excluded.risk_level,
  requires_approval = excluded.requires_approval,
  workspace_scope = excluded.workspace_scope,
  modes_json = excluded.modes_json,
  oauth_visible = excluded.oauth_visible,
  is_active = excluded.is_active,
  is_global = excluded.is_global,
  updated_at = unixepoch();

UPDATE agentsam_tools
SET mcp_service_url = 'https://gmailmcp.googleapis.com/mcp/v1',
    handler_config = json_set(
      CASE WHEN json_valid(handler_config) THEN handler_config ELSE '{}' END,
      '$.server_key', 'gmail-official'
    ),
    dispatch_target = 'both',
    updated_at = unixepoch()
WHERE tool_key LIKE 'agentsam_gmail_mcp_%';
