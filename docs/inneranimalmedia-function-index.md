# Worker Function Index — inneranimalmedia

## putAgentBrowserScreenshotToR2
- **Line:** 20
- **Project:** inneranimalmedia  
- **Purpose:** Store agent/browser tool screenshots. Prefer env.DOCS_BUCKET (public: docs.inneranimalmedia.com). * Fallback: env.DASHBOARD (legacy pub r2.dev), then env.R2 (legacy URL; pre-deploy safety).
- **Params:** env, buf, contentType
- **Calls:** none
- **Tags:** r2

## normalizeThemeSlug
- **Line:** 44
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** value
- **Calls:** none
- **Tags:** none

## variablesFromCmsThemeConfig
- **Line:** 50
- **Project:** inneranimalmedia  
- **Purpose:** Merge cms_themes.config into API `variables` (GET /api/settings/theme). Supports cssVars (camelCase) and css_vars.
- **Params:** cfg
- **Calls:** mergeCssVars
- **Tags:** none

## mergeCssVars
- **Line:** 53
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** obj
- **Calls:** none
- **Tags:** none

## getSamContext
- **Line:** 107
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** email
- **Calls:** none
- **Tags:** auth

## resolveAgentsamUserKey
- **Line:** 129
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** authUser
- **Calls:** none
- **Tags:** none

## isSamOnlyUser
- **Line:** 136
- **Project:** inneranimalmedia  
- **Purpose:** Zero Trust / mac tunnel — only Sam may restart connections (POST /api/tunnel/restart).
- **Params:** authUser
- **Calls:** none
- **Tags:** none

## defaultAgentsamUserPolicy
- **Line:** 162
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** userKey, workspaceId
- **Calls:** none
- **Tags:** mcp

## normalizeAgentsamFetchHostInput
- **Line:** 205
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** h
- **Calls:** none
- **Tags:** none

## isAgentsamBuiltinFetchHostNormalized
- **Line:** 214
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** hostNorm
- **Calls:** none
- **Tags:** none

## agentsamIsFetchHostAllowed
- **Line:** 222
- **Project:** inneranimalmedia  
- **Purpose:** True if host is platform-built-in allowed or listed in agentsam_fetch_domain_allowlist for user/workspace. * Use before server-side fetch to user-supplied URLs when enforcing the allowlist.
- **Params:** env, userKey, workspaceId, urlOrHost
- **Calls:** isAgentsamBuiltinFetchHostNormalized, normalizeAgentsamFetchHostInput
- **Tags:** d1

## invalidateCompiledContextCache
- **Line:** 245
- **Project:** inneranimalmedia  
- **Purpose:** Call after any write to agent_memory_index or ai_knowledge_base so agent_sam context cache is invalidated.
- **Params:** env
- **Calls:** run
- **Tags:** d1

## ensureHeadlessTerminalSessionForHistory
- **Line:** 251
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** run
- **Tags:** auth, d1

## resolveTerminalSessionIdForHistory
- **Line:** 263
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, request
- **Calls:** ensureHeadlessTerminalSessionForHistory, getAuthUser
- **Tags:** auth, d1

## notifySam
- **Line:** 284
- **Project:** inneranimalmedia  
- **Purpose:** Resend notification + email_logs. Optional opts.to overrides default recipient. * Use executionCtx.waitUntil when provided so the fetch path never blocks.
- **Params:** env, opts, executionCtx
- **Calls:** run
- **Tags:** auth, d1, http-client

## run
- **Line:** 293
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** run
- **Tags:** auth, d1, http-client

## IAMCollaborationSession.constructor
- **Line:** 341
- **Project:** inneranimalmedia  
- **Purpose:** @param {import('@cloudflare/workers-types').DurableObjectState} state * @param {Record<string, unknown>} env
- **Params:** state, env
- **Calls:** none
- **Tags:** durable-objects

## IAMCollaborationSession.fetch
- **Line:** 348
- **Project:** inneranimalmedia  
- **Purpose:** @param {Request} request
- **Params:** request
- **Calls:** none
- **Tags:** auth

## IAMCollaborationSession.webSocketMessage
- **Line:** 377
- **Project:** inneranimalmedia  
- **Purpose:** @param {WebSocket} ws @param {string | ArrayBuffer} message
- **Params:** ws, message
- **Calls:** none
- **Tags:** none

## IAMCollaborationSession.webSocketClose
- **Line:** 384
- **Project:** inneranimalmedia  
- **Purpose:** @param {WebSocket} ws
- **Params:** ws
- **Calls:** none
- **Tags:** none

## IAMSession.fetch
- **Line:** 392
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request
- **Calls:** none
- **Tags:** auth

## MeauxSession.fetch
- **Line:** 400
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request
- **Calls:** none
- **Tags:** auth

## ChessRoom.fetch
- **Line:** 408
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request
- **Calls:** none
- **Tags:** none

## selectAutoModel
- **Line:** 489
- **Project:** inneranimalmedia  
- **Purpose:** Select best model for Auto mode based on intent and cost
- **Params:** env, lastUserContent
- **Calls:** classifyIntent
- **Tags:** d1

## syntheticWorkersAiChatModelRow
- **Line:** 567
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** modelId
- **Calls:** none
- **Tags:** none

## extractWorkersAiImageBytes
- **Line:** 583
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** result
- **Calls:** none
- **Tags:** none

## handleDeploymentLog
- **Line:** 619
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env, ctx
- **Calls:** ensureWorkSessionAndSignal, jsonResponse, notifySam, run
- **Tags:** auth, d1

## handleDeploymentsRecent
- **Line:** 707
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** jsonResponse
- **Tags:** d1

## normalizeUnifiedSpendTs
- **Line:** 727
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** val
- **Calls:** none
- **Tags:** none

## unifiedSpendDayUTC
- **Line:** 739
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** tsSec
- **Calls:** none
- **Tags:** streaming

## fetchUnifiedSpendGrouped
- **Line:** 749
- **Project:** inneranimalmedia  
- **Purpose:** Unified spend: parallel reads from five tables, merge rows, group by provider | model | day. * periodDays 0 = all time (no time filter).
- **Params:** env, periodDays, groupKey
- **Calls:** unifiedSpendDayUTC
- **Tags:** d1

## getVaultSecrets
- **Line:** 1017
- **Project:** inneranimalmedia  
- **Purpose:** (Crypto matches /api/env/* _vaultDecrypt; defined at module scope so fetch can call it.)
- **Params:** env
- **Calls:** decryptRow
- **Tags:** d1

## importKey
- **Line:** 1020
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** b64
- **Calls:** importKey
- **Tags:** none

## decryptRow
- **Line:** 1024
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** encB64, ivB64, vaultKeyB64
- **Calls:** importKey
- **Tags:** none

## timingSafeEqualUtf8
- **Line:** 1054
- **Project:** inneranimalmedia  
- **Purpose:** hook_subscriptions (is_active, run_order), hook_executions (subscription_id first, error_message, status, TEXT datetimes), deployment_tracking (full deploy row).
- **Params:** a, b
- **Calls:** none
- **Tags:** none

## hmacSha256HexFromUtf8Key
- **Line:** 1061
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** secretUtf8, messageUtf8
- **Calls:** importKey
- **Tags:** none

## hmacSha256HexFromRawKey
- **Line:** 1073
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** keyBytes, messageUtf8
- **Calls:** importKey
- **Tags:** none

## decodeStripeSigningSecret
- **Line:** 1079
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** secret
- **Calls:** none
- **Tags:** none

## verifyGithubHubSignature256
- **Line:** 1092
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** secret, rawBody, sigHeader
- **Calls:** hmacSha256HexFromUtf8Key, timingSafeEqualUtf8
- **Tags:** none

## verifySha256EqualsSecretHmac
- **Line:** 1099
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** secret, rawBody, sigHeader
- **Calls:** hmacSha256HexFromUtf8Key, timingSafeEqualUtf8
- **Tags:** none

## verifyStripeSignatureHeader
- **Line:** 1108
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** secret, rawBody, sigHeader
- **Calls:** decodeStripeSigningSecret, hmacSha256HexFromRawKey, push, timingSafeEqualUtf8
- **Tags:** none

## base64FromArrayBuffer
- **Line:** 1135
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** buf
- **Calls:** none
- **Tags:** none

## verifySvixResendSignature
- **Line:** 1142
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** secret, rawBody, svixId, svixTimestamp, svixSigHeader
- **Calls:** base64FromArrayBuffer, decodeStripeSigningSecret, importKey, timingSafeEqualUtf8
- **Tags:** none

## verifySupabaseWebhookSignature
- **Line:** 1168
- **Project:** inneranimalmedia  
- **Purpose:** Supabase / Edge Function webhooks: header `x-supabase-signature: sha256=<hex>` (lowercase hex). * Must match HMAC-SHA256 of the raw request body using secret as UTF-8 key (aligns with pgcrypto HMAC on same bytes). * Secret: wrangler `SUPABASE_WEBHOOK_SECRET` (or vault); see verif
- **Params:** secret, rawBody, sigHeader
- **Calls:** hmacSha256HexFromUtf8Key, timingSafeEqualUtf8
- **Tags:** none

## normalizeWebhookRequestPath
- **Line:** 1177
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** pathname
- **Calls:** none
- **Tags:** none

## webhookCaptureHeaders
- **Line:** 1192
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request
- **Calls:** none
- **Tags:** none

## webhookResolveEventType
- **Line:** 1217
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** source, request, rawBody
- **Calls:** none
- **Tags:** none

## verifyWebhookSignature
- **Line:** 1270
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** verifyKind, resolveSecret, request, rawBody
- **Calls:** verifyGithubHubSignature256, verifySha256EqualsSecretHmac, verifyStripeSignatureHeader, verifySupabaseWebhookSignature, verifySvixResendSignature
- **Tags:** streaming

## webhookPayloadGetByPath
- **Line:** 1339
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** root, pathStr
- **Calls:** none
- **Tags:** none

## resolveWebhookEndpoint
- **Line:** 1352
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** db, source, requestPath
- **Calls:** normalizeWebhookRequestPath
- **Tags:** d1

## extractWebhookDeliveryContext
- **Line:** 1371
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** source, eventType, rawBody, request
- **Calls:** none
- **Tags:** none

## githubActorFromWebhookPayload
- **Line:** 1414
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** rawBody
- **Calls:** none
- **Tags:** none

## githubCommitMessageFromWebhookPayload
- **Line:** 1429
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** rawBody
- **Calls:** none
- **Tags:** none

## recordGithubCicdFollowups
- **Line:** 1442
- **Project:** inneranimalmedia  
- **Purpose:** After a successful cicd_runs row insert: mirror to deployments + optional cicd_events. * Uses github_repositories.cloudflare_worker_name when repo matches; else heuristics.
- **Params:** env, row, rawBody
- **Calls:** githubActorFromWebhookPayload, githubCommitMessageFromWebhookPayload, run
- **Tags:** d1

## runWriteD1MapInsert
- **Line:** 1524
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, cfg, ctx
- **Calls:** recordGithubCicdFollowups, run, webhookPayloadGetByPath
- **Tags:** d1

## runWriteD1GithubRaw
- **Line:** 1578
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, cfg, ctx
- **Calls:** run
- **Tags:** d1

## executeHookSubscriptionAction
- **Line:** 1598
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, actionType, actionConfigJson, ctx
- **Calls:** invalidateCompiledContextCache, notifySam, run, runWriteD1GithubRaw, runWriteD1MapInsert, webhookPayloadGetByPath
- **Tags:** d1

## hookSubscriptionMatchesEventFilter
- **Line:** 1808
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** eventFilter, eventType
- **Calls:** none
- **Tags:** none

## handleHooksHealth
- **Line:** 1817
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** jsonResponse
- **Tags:** d1

## handleInboundWebhook
- **Line:** 1836
- **Project:** inneranimalmedia  
- **Purpose:** opts: { verifyKind, source, endpointPath } * verifyKind: github | stripe | cursor | resend | supabase | cloudflare | internal | none
- **Params:** env, request, resolveSecret, opts, executionCtx
- **Calls:** executeHookSubscriptionAction, extractWebhookDeliveryContext, jsonResponse, normalizeWebhookRequestPath, notifySam, push, resolveWebhookEndpoint, run, verifyWebhookSignature, webhookCaptureHeaders, webhookResolveEventType
- **Tags:** d1, streaming

## handlePhase1PlatformD1Routes
- **Line:** 1991
- **Project:** inneranimalmedia  
- **Purpose:** Phase 1 SettingsPanel D1 routes (auth). Returns Response if handled, else null.
- **Params:** request, url, env, pathLower
- **Calls:** fetchUnifiedSpendGrouped, getAuthUser, getSession, jsonResponse, push, resolveAgentsamUserKey, run
- **Tags:** auth, d1, mcp, vectorize, workers-ai

## fetch
- **Line:** 2535
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env, ctx
- **Calls:** _vaultAudit, _vaultDecrypt, _vaultEncrypt, chunkByTokenApprox, contentType, find, getAuthUser, getIntegrationToken, getSession, getVaultSecrets, handleAgentApi, handleAgentsamApi, handleBackupCodeLogin, handleBillingSummary, handleBrowserRequest, handleCicdApi, handleClients, handleColorsAll, handleDeploymentLog, handleDeploymentsRecent, handleDrawApi, handleEmailPasswordLogin, handleFederatedSearch, handleFinance, handleGitHubOAuthCallback, handleGitHubOAuthStart, handleGoogleOAuthCallback, handleGoogleOAuthStart, handleHooksHealth, handleHubRoadmap, handleHubStats, handleHubTaskCreate, handleHubTaskUpdate, handleHubTasks, handleHubTerminal, handleInboundWebhook, handleLogout, handleMcpApi, handleOvernightStart, handleOvernightValidate, handleOverviewActivityStrip, handleOverviewCheckpoints, handleOverviewDeployments, handleOverviewStats, handlePhase1PlatformD1Routes, handleProjects, handleR2Api, handleRecentActivity, handleReindexCodebase, handleTimeTrack, handleTimeTrackManual, handleVaultRequest, hashPassword, invalidateCompiledContextCache, isSamOnlyUser, jsonResponse, normalizeThemeSlug, notFound, pgMatchDocuments, push, randomCode, recordWorkerAnalyticsError, respondWithDashboardHtml, respondWithR2Object, run, sha256Hex, variablesFromCmsThemeConfig, vectorizeRagSearch, verifyPassword, writeAuditLog, writeKnowledgePostDeploy
- **Tags:** auth, browser, d1, durable-objects, http-client, kv, mcp, r2, streaming, vectorize, workers-ai

## secret
- **Line:** 2540
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** key
- **Calls:** none
- **Tags:** none

## _vaultImportKey
- **Line:** 3632
- **Project:** inneranimalmedia  
- **Purpose:** ── Crypto helpers (Web Crypto API — works in Workers runtime) ──
- **Params:** b64
- **Calls:** importKey
- **Tags:** none

## _vaultEncrypt
- **Line:** 3636
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** plaintext, vaultKeyB64
- **Calls:** _vaultImportKey
- **Tags:** none

## _vaultDecrypt
- **Line:** 3649
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** encB64, ivB64, vaultKeyB64
- **Calls:** _vaultImportKey
- **Tags:** none

## _vaultAudit
- **Line:** 3658
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** db, keyName, action, note
- **Calls:** run
- **Tags:** d1

## sha256Hex
- **Line:** 4112
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** str
- **Calls:** none
- **Tags:** none

## randomCode
- **Line:** 4116
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## queue
- **Line:** 4498
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** batch, env, ctx
- **Calls:** putAgentBrowserScreenshotToR2, run
- **Tags:** browser, d1, r2

## respondWithDashboardHtml
- **Line:** 4546
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** obj, url, options
- **Calls:** respondWithR2Object
- **Tags:** vectorize

## respondWithR2Object
- **Line:** 4564
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** obj, contentType, options
- **Calls:** none
- **Tags:** none

## contentType
- **Line:** 4577
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** path
- **Calls:** none
- **Tags:** none

## notFound
- **Line:** 4591
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** path
- **Calls:** none
- **Tags:** none

## handleBrowserRequest
- **Line:** 4599
- **Project:** inneranimalmedia  
- **Purpose:** Playwright (Cloudflare Browser Rendering): health + metrics + GET screenshot. Only runs when env.MYBROWSER is set.
- **Params:** request, url, env
- **Calls:** notFound
- **Tags:** browser, kv

## resolveAnthropicModelKey
- **Line:** 4696
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** modelKey
- **Calls:** none
- **Tags:** none

## calculateCost
- **Line:** 4706
- **Project:** inneranimalmedia  
- **Purpose:** Compute cost from ai_models row (D1). Never use a hardcoded map.
- **Params:** model, inputTokens, outputTokens
- **Calls:** none
- **Tags:** none

## getGatewayModel
- **Line:** 4716
- **Project:** inneranimalmedia  
- **Purpose:** AI Gateway compat: model string for gateway (provider/model). Used only when AI_GATEWAY_BASE_URL is set.
- **Params:** provider, modelKey
- **Calls:** resolveAnthropicModelKey
- **Tags:** none

## getSpendRates
- **Line:** 4724
- **Project:** inneranimalmedia  
- **Purpose:** Per-token rates (USD) for spend_ledger. Used when ai_models row lacks input_rate_per_mtok.
- **Params:** provider, modelKey
- **Calls:** none
- **Tags:** none

## writeAuditLog
- **Line:** 4746
- **Project:** inneranimalmedia  
- **Purpose:** Write one row to agent_audit_log. Fire-and-forget; never throw.
- **Params:** env, ?
- **Calls:** run
- **Tags:** d1

## recordWorkerAnalyticsError
- **Line:** 4762
- **Project:** inneranimalmedia  
- **Purpose:** INSERT worker_analytics_errors (best-effort; table from migrations/167_worker_analytics_errors.sql).
- **Params:** env, ?
- **Calls:** run
- **Tags:** d1

## generateConversationName
- **Line:** 4780
- **Project:** inneranimalmedia  
- **Purpose:** Use Workers AI to generate a short conversation name and UPDATE agent_conversations. Call from waitUntil so chat response is not blocked.
- **Params:** env, conversationId, firstUserMessage
- **Calls:** run
- **Tags:** d1, workers-ai

## persistAgentMemoryHyperdrive
- **Line:** 4799
- **Project:** inneranimalmedia  
- **Purpose:** Persist user + assistant turns to Supabase agent_memory (Hyperdrive pg + Workers AI embed). Never throws.
- **Params:** env, ?
- **Calls:** run
- **Tags:** auth, vectorize, workers-ai

## streamDoneDbWrites
- **Line:** 4847
- **Project:** inneranimalmedia  
- **Purpose:** Shared: insert agent_messages (assistant), agent_telemetry, spend_ledger and return payload for done event. ctx optional for non-blocking spend_ledger.
- **Params:** env, conversationId, modelRow, fullText, inputTokens, outputTokens, costUsd, agent_id, ctx, lastUserTextForMemory
- **Calls:** getSpendRates, persistAgentMemoryHyperdrive, run, spendAndUsage
- **Tags:** auth, d1, mcp

## spendAndUsage
- **Line:** 4871
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** run
- **Tags:** auth, d1

## getLastUserMessageText
- **Line:** 4937
- **Project:** inneranimalmedia  
- **Purpose:** Return the text of the last user message in apiMessages (for intent classification).
- **Params:** messages
- **Calls:** none
- **Tags:** none

## capWithMarker
- **Line:** 4970
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** text, maxChars
- **Calls:** none
- **Tags:** none

## buildUnifiedAgentContextBlock
- **Line:** 4978
- **Project:** inneranimalmedia  
- **Purpose:** pgvector + D1 memory: merge, sort by score DESC, drop D1 rows whose key/value text appears in pgvector blob, cap total chars.
- **Params:** d1Rows, pgRows
- **Calls:** capWithMarker, push
- **Tags:** none

## getContextIndexSearchTerm
- **Line:** 5016
- **Project:** inneranimalmedia  
- **Purpose:** Up to 3 terms (length > 3) joined for context_index LIKE search; empty if none.
- **Params:** query
- **Calls:** none
- **Tags:** none

## fetchContextIndex
- **Line:** 5026
- **Project:** inneranimalmedia  
- **Purpose:** Keyword search on context_index (no vectors). Returns [] if table missing or no terms. * scope: tenant or bucket scope; rows match scope = 'global' OR scope = ?
- **Params:** db, query, scope
- **Calls:** getContextIndexSearchTerm
- **Tags:** d1

## contextIndexWarrantsR2FullFetch
- **Line:** 5061
- **Project:** inneranimalmedia  
- **Purpose:** When true, load full R2 body for this hit; otherwise summary-only (or short fallback).
- **Params:** queryLower, row
- **Calls:** none
- **Tags:** none

## buildContextIndexPromptBlock
- **Line:** 5077
- **Project:** inneranimalmedia  
- **Purpose:** Build prompt text from context_index rows: inline_content verbatim (capped); R2 = summary unless warrant full fetch. * @returns {{ text: string, ids: string[] }}
- **Params:** env, rows, queryLower
- **Calls:** capWithMarker, contextIndexWarrantsR2FullFetch, getR2Binding, push
- **Tags:** none

## logContextSearch
- **Line:** 5126
- **Project:** inneranimalmedia  
- **Purpose:** Expects table context_search_log(id, searched_at, query_snippet, scope, search_term, context_ids_used, result_count, was_helpful). * No-op if table missing.
- **Params:** db, ?
- **Calls:** run
- **Tags:** d1

## charsToTokens
- **Line:** 5146
- **Project:** inneranimalmedia  
- **Purpose:** Approximate token count from character length (for prompt telemetry).
- **Params:** chars
- **Calls:** none
- **Tags:** none

## logPromptTelemetry
- **Line:** 5152
- **Project:** inneranimalmedia  
- **Purpose:** Log section-level prompt telemetry for /api/agent/chat. Logs approximate chars/tokens per section, mode, provider, stream, tool count, message count.
- **Params:** env, payload
- **Calls:** charsToTokens
- **Tags:** streaming

## buildAskContext
- **Line:** 5190
- **Project:** inneranimalmedia  
- **Purpose:** Mode-specific prompt builders. Sections: { core, memory, kb, mcp, schema, daily, full }. Each section is a string (may be empty). Do not share full payload by default.
- **Params:** sections, ragContext, fileContext, model, indexedContext
- **Calls:** capWithMarker
- **Tags:** none

## buildPlanContext
- **Line:** 5202
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** sections, ragContext, fileContext, model, indexedContext
- **Calls:** capWithMarker
- **Tags:** none

## buildAgentContext
- **Line:** 5215
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** sections, ragContext, fileContext, model, compiledContextBlob, indexedContext
- **Calls:** capWithMarker, push
- **Tags:** mcp

## buildDebugContext
- **Line:** 5226
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** sections, ragContext, fileContext, model, indexedContext
- **Calls:** capWithMarker
- **Tags:** none

## buildModeContext
- **Line:** 5236
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** mode, sections, compiledContextBlob, ragContext, fileContext, model, indexedContext
- **Calls:** buildAgentContext, buildAskContext, buildDebugContext, buildPlanContext
- **Tags:** none

## filterToolsByMode
- **Line:** 5244
- **Project:** inneranimalmedia  
- **Purpose:** Filter tools by mode: Plan mode has no tools; Ask and Agent get all (subject to panel policy); Debug gets only terminal/log/read tools.
- **Params:** mode, toolDefinitions
- **Calls:** none
- **Tags:** d1, r2

## panelColumnFromRequestAgentId
- **Line:** 5263
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** agentId
- **Calls:** none
- **Tags:** mcp

## filterToolRowsByPanel
- **Line:** 5271
- **Project:** inneranimalmedia  
- **Purpose:** @param {string|null|undefined} requestAgentId @param {any[]} rows from mcp_registered_tools
- **Params:** requestAgentId, rows
- **Calls:** none
- **Tags:** mcp

## classifyIntent
- **Line:** 5285
- **Project:** inneranimalmedia  
- **Purpose:** Use Haiku to classify intent of the last user message. Returns { intent: 'sql'|'shell'|'question'|'mixed', tasks?: [{ type, content }] }.
- **Params:** env, lastMessageText
- **Calls:** resolveAnthropicModelKey
- **Tags:** d1, http-client, mcp

## singleRoundNoTools
- **Line:** 5332
- **Project:** inneranimalmedia  
- **Purpose:** One round with the main model, no tools. Used for "question" intent and for aggregate step of mixed.
- **Params:** env, provider, modelKey, systemWithBlurb, messages
- **Calls:** callGatewayChat, getGatewayModel
- **Tags:** auth, http-client

## toParts
- **Line:** 5377
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** m
- **Calls:** none
- **Tags:** none

## runMixedTasks
- **Line:** 5427
- **Project:** inneranimalmedia  
- **Purpose:** Execute mixed tasks in order, persist to agent_tasks, aggregate results and return one response.
- **Params:** env, request, provider, modelKey, systemWithBlurb, messages, modelRow, conversationId, tasks, executionCtx
- **Calls:** push, resolveAnthropicModelKey, run, runTerminalCommand, singleRoundNoTools
- **Tags:** d1

## stripAdditionalProperties
- **Line:** 5491
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** obj
- **Calls:** stripAdditionalProperties
- **Tags:** none

## splitTopLevelCommaListSql
- **Line:** 5503
- **Project:** inneranimalmedia  
- **Purpose:** Split SQL parenthesized list at top-level commas; respects single-quoted strings (including '').
- **Params:** expr
- **Calls:** push
- **Tags:** none

## ensureAgentMemoryIndexInsertDefaults
- **Line:** 5539
- **Project:** inneranimalmedia  
- **Purpose:** d1_write guard: INSERT INTO agent_memory_index without agent_config_id / tenant_id gets canonical defaults. * Does not alter other statements or tables.
- **Params:** sql
- **Calls:** push, splitTopLevelCommaListSql
- **Tags:** none

## runToolLoop
- **Line:** 5603
- **Project:** inneranimalmedia  
- **Purpose:** Multi-provider tool loop (non-streaming). Supports anthropic, openai, google. Returns final assistant text.
- **Params:** env, request, provider, modelKey, systemWithBlurb, apiMessages, toolDefinitions, modelRow, agent_id, conversationId, attachedFilesFromRequest, executionCtx
- **Calls:** aiSearchIsConfigured, autoragAiSearchQuery, calculateCost, classifyIntent, ensureAgentMemoryIndexInsertDefaults, find, getAuthUser, getIntegrationToken, getLastUserMessageText, push, run, runCdpBuiltinTool, runCfImagesEnvBuiltinTool, runCloudConvertBuiltinTool, runCursorCloudAgentBuiltinTool, runGdriveOauthBuiltinTool, runGithubPatBuiltinTool, runImgxBuiltinTool, runInternalPlaywrightTool, runKnowledgeSearchMerged, runMeshyBuiltinTool, runMixedTasks, runResendBuiltinTool, runTerminalCommand, singleRoundNoTools, writeAuditLog
- **Tags:** auth, browser, d1, http-client, mcp, r2

## toParts
- **Line:** 5687
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** m
- **Calls:** none
- **Tags:** none

## aggregateTerminalRunOutput
- **Line:** 6214
- **Project:** inneranimalmedia  
- **Purpose:** Merge WS frames from iam-pty run: JSON session_id/error/output, or raw PTY UTF-8 (onData sends raw strings).
- **Params:** parts
- **Calls:** none
- **Tags:** auth

## terminalExecHttpUrlFromEnv
- **Line:** 6250
- **Project:** inneranimalmedia  
- **Purpose:** Same host as TERMINAL_WS_URL: POST /exec (iam-pty server.js). Workers often receive zero WS frames on outbound fetch() upgrades; HTTP is reliable.
- **Params:** env
- **Calls:** none
- **Tags:** none

## runTerminalCommandViaHttpExec
- **Line:** 6265
- **Project:** inneranimalmedia  
- **Purpose:** Returns { ok: true, text } on 200 JSON from /exec; { ok: false } to fall back to WebSocket.
- **Params:** env, cmd
- **Calls:** pushTok, terminalExecHttpUrlFromEnv
- **Tags:** auth

## pushTok
- **Line:** 6269
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** t
- **Calls:** push
- **Tags:** none

## runTerminalCommand
- **Line:** 6324
- **Project:** inneranimalmedia  
- **Purpose:** Run a command: prefer POST /exec on the terminal host (reliable from Workers), else PTY WebSocket run. * Used by POST /api/agent/terminal/run and runToolLoop (terminal_execute). * Returns { output, command, exitCode }. Throws on connect/error so callers can try/catch.
- **Params:** env, request, command, sessionId, executionCtx
- **Calls:** notifySam, resolveTerminalSessionIdForHistory, run, runTerminalCommandViaHttpExec
- **Tags:** auth, d1

## finish
- **Line:** 6365
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** aggregateTerminalRunOutput
- **Tags:** none

## emitCodeBlocksFromText
- **Line:** 6441
- **Project:** inneranimalmedia  
- **Purpose:** Parse first markdown fenced code block from fullText and emit one SSE code event via send(obj). * Format: ```language optional_filename\ncode\n``` * send(obj) is called once with { type: 'code', code, filename, language } or not at all.
- **Params:** fullText, send
- **Calls:** none
- **Tags:** none

## streamOpenAI
- **Line:** 6457
- **Project:** inneranimalmedia  
- **Purpose:** OpenAI streaming: same SSE contract as Anthropic. * POST to chat/completions with stream: true, stream_options: { include_usage: true }.
- **Params:** env, systemWithBlurb, apiMessages, modelRow, images, conversationId, agent_id, ctx
- **Calls:** jsonResponse
- **Tags:** auth, cron, http-client, streaming

## pull
- **Line:** 6487
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** calculateCost, emitCodeBlocksFromText, enqueue, getLastUserMessageText, streamDoneDbWrites
- **Tags:** cron

## runCursorCloudAgentBuiltinTool
- **Line:** 6535
- **Project:** inneranimalmedia  
- **Purpose:** Builtin MCP: Cursor Cloud Agents API (async coding agents). * https://cursor.com/docs/cloud-agent/api/endpoints — Basic auth: btoa(CURSOR_API_KEY + ':').
- **Params:** env, toolName, params
- **Calls:** none
- **Tags:** http-client

## streamGoogle
- **Line:** 6615
- **Project:** inneranimalmedia  
- **Purpose:** Google (Gemini) streaming: streamGenerateContent, same SSE contract.
- **Params:** env, systemWithBlurb, apiMessages, modelRow, images, conversationId, agent_id, ctx
- **Calls:** jsonResponse
- **Tags:** cron, streaming

## pull
- **Line:** 6645
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** calculateCost, emitCodeBlocksFromText, enqueue, getLastUserMessageText, streamDoneDbWrites
- **Tags:** cron

## streamWorkersAI
- **Line:** 6695
- **Project:** inneranimalmedia  
- **Purpose:** Cloudflare Workers AI streaming: env.AI.run(model_key, { messages, stream: true }). * Same SSE contract; cost_usd: 0 (neurons). Handle all chunk shapes; null-coerce before D1.
- **Params:** env, systemWithBlurb, apiMessages, modelRow, conversationId, agent_id, ctx
- **Calls:** jsonResponse, run
- **Tags:** cron, streaming, workers-ai

## pull
- **Line:** 6711
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** emitCodeBlocksFromText, enqueue, getLastUserMessageText, streamDoneDbWrites
- **Tags:** cron

## parseDataUrl
- **Line:** 6758
- **Project:** inneranimalmedia  
- **Purpose:** Parse data URL to { mediaType, base64 } for vision APIs
- **Params:** dataUrl
- **Calls:** none
- **Tags:** none

## buildAnthropicContent
- **Line:** 6766
- **Project:** inneranimalmedia  
- **Purpose:** Build last user message content with images for Anthropic (content block array)
- **Params:** text, images
- **Calls:** parseDataUrl, push
- **Tags:** none

## buildOpenAIContent
- **Line:** 6778
- **Project:** inneranimalmedia  
- **Purpose:** Build last user message content with images for OpenAI (content array)
- **Params:** text, images
- **Calls:** push
- **Tags:** none

## buildGoogleParts
- **Line:** 6789
- **Project:** inneranimalmedia  
- **Purpose:** Build last user message parts for Google (parts array)
- **Params:** text, images
- **Calls:** parseDataUrl, push
- **Tags:** none

## callGatewayChat
- **Line:** 6803
- **Project:** inneranimalmedia  
- **Purpose:** Call Cloudflare AI Gateway OpenAI-compat endpoint. Returns { ok, status, data } (data is OpenAI-format). *  OpenAI URL must be: https://gateway.ai.cloudflare.com/v1/{account_id}/inneranimalmedia/openai/chat/completions *  (set AI_GATEWAY_OPENAI_BASE_URL or AI_GATEWAY_BASE_URL end
- **Params:** env, systemWithBlurb, apiMessages, gatewayModel, images
- **Calls:** none
- **Tags:** auth

## getR2Binding
- **Line:** 6854
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, bucketName
- **Calls:** none
- **Tags:** r2, streaming

## getContentTypeFromKey
- **Line:** 6864
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** key
- **Calls:** none
- **Tags:** none

## sha256hex
- **Line:** 6880
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** message
- **Calls:** none
- **Tags:** none

## hmacHex
- **Line:** 6885
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** key, message
- **Calls:** importKey
- **Tags:** none

## hmacBytes
- **Line:** 6891
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** key, message
- **Calls:** importKey
- **Tags:** none

## getSigningKey
- **Line:** 6903
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** secret, date, region, service
- **Calls:** hmacBytes
- **Tags:** none

## signR2Request
- **Line:** 6910
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** method, bucket, path, query, env
- **Calls:** getSigningKey, hmacHex, sha256hex
- **Tags:** none

## parseListObjectsV2Xml
- **Line:** 6945
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** xml
- **Calls:** push
- **Tags:** none

## buildR2Query
- **Line:** 6980
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** params
- **Calls:** none
- **Tags:** none

## handleR2Api
- **Line:** 6986
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** buildR2Query, getContentTypeFromKey, getR2Binding, jsonResponse, parseListObjectsV2Xml, push, run, signR2Request
- **Tags:** auth, d1, streaming

## parseDataUrlToBytes
- **Line:** 7463
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** dataUrl
- **Calls:** none
- **Tags:** none

## handleDrawApi
- **Line:** 7477
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** getAuthUser, jsonResponse, parseDataUrlToBytes, run
- **Tags:** auth, d1, r2

## riskLevelFromCommandProposalText
- **Line:** 7540
- **Project:** inneranimalmedia  
- **Purpose:** Risk tier for agent_command_proposals from raw command text.
- **Params:** cmd
- **Calls:** none
- **Tags:** none

## chunkTextForCodebaseReindex
- **Line:** 7554
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** text, size, overlap
- **Calls:** push
- **Tags:** none

## reindexCodebaseFromDocsBucket
- **Line:** 7568
- **Project:** inneranimalmedia  
- **Purpose:** List iam-docs (DOCS_BUCKET), chunk, embed, upsert Supabase documents (Hyperdrive). source = codebase:{key}
- **Params:** env
- **Calls:** chunkTextForCodebaseReindex, push, run
- **Tags:** r2, streaming, vectorize, workers-ai

## handleAgentApi
- **Line:** 7626
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env, ctx
- **Calls:** appendAttachedFilesToUserText, buildContextIndexPromptBlock, buildModeContext, buildUnifiedAgentContextBlock, callGatewayChat, capWithMarker, charsToTokens, chatWithToolsAnthropic, compactAgentChatsToR2, ensureWorkSessionAndSignal, executeAgentWorkflowSteps, extractWorkersAiImageBytes, fetchContextIndex, filterToolRowsByPanel, filterToolsByMode, find, generateConversationName, getAuthUser, getContextIndexSearchTerm, getGatewayModel, getIntegrationToken, getLatestUserPlainText, getSession, getSpendRates, indexMemoryMarkdownToVectorize, invalidateCompiledContextCache, invokeMcpToolFromChat, jsonResponse, logContextSearch, logPromptTelemetry, matchAgentChatWorkflowIntent, normalize, notifySam, persistAgentMemoryHyperdrive, pgMatchDocuments, push, reindexCodebaseFromDocsBucket, resolveAnthropicModelKey, riskLevelFromCommandProposalText, run, runTerminalCommand, runTerminalCommandViaHttpExec, runToolLoop, selectAutoModel, streamDoneDbWrites, streamGoogle, streamOpenAI, streamWorkersAI, syntheticWorkersAiChatModelRow, upsertMcpAgentSession, vectorizeRagSearch
- **Tags:** auth, browser, cron, d1, http-client, kv, mcp, r2, streaming, vectorize, workers-ai

## normalize
- **Line:** 8111
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** s
- **Calls:** none
- **Tags:** none

## logClose
- **Line:** 8256
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** source
- **Calls:** none
- **Tags:** none

## closeFromBrowserLeg
- **Line:** 8263
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** logClose
- **Tags:** none

## closeFromUpstreamLeg
- **Line:** 8269
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** logClose
- **Tags:** none

## done
- **Line:** 8281
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## messageContentChars
- **Line:** 9405
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** m
- **Calls:** none
- **Tags:** none

## pull
- **Line:** 9558
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** calculateCost, emitCodeBlocksFromText, enqueue, getSpendRates, persistAgentMemoryHyperdrive, run
- **Tags:** auth, cron, d1

## triggerWorkflowRun
- **Line:** 10573
- **Project:** inneranimalmedia  
- **Purpose:** Start an MCP minion workflow run or return a dry-run preview. Shared by POST /api/mcp/workflows/:id/run * and the Agent Sam /workflow slash builtin (avoids Worker self-fetch, which can fail with 522).
- **Params:** env, ctx, workflow_id, session_id, triggered_by, dry_run
- **Calls:** executeWorkflowSteps, run
- **Tags:** auth, d1, mcp

## handleAgentsamApi
- **Line:** 10626
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** defaultAgentsamUserPolicy, getAuthUser, isAgentsamBuiltinFetchHostNormalized, jsonResponse, mergeFetchDomainAllowlistWithBuiltin, normalizeAgentsamFetchHostInput, normalizeFetchHost, push, readBody, resolveAgentsamUserKey, run
- **Tags:** auth, d1, http-client, mcp, r2, streaming, vectorize, workers-ai

## readBody
- **Line:** 10638
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## normalizeFetchHost
- **Line:** 10646
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** h
- **Calls:** none
- **Tags:** none

## mergeFetchDomainAllowlistWithBuiltin
- **Line:** 10655
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** dbResults
- **Calls:** push
- **Tags:** none

## handleMcpApi
- **Line:** 11684
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** req, u, e, ctx
- **Calls:** filterToolRowsByPanel, getAuthUser, invokeMcpToolFromChat, jsonResponse, listImgxProviders, push, run, runImgxBuiltinTool, triggerWorkflowRun
- **Tags:** auth, cron, d1, mcp, streaming

## emit
- **Line:** 12037
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** obj, controller
- **Calls:** enqueue
- **Tags:** cron

## pull
- **Line:** 12045
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** emit, invokeMcpToolFromChat
- **Tags:** auth, mcp

## CI/CD D1 API handler
- **Line:** 12258
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler for the CI/CD REST surface (legacy path segment and function name in `worker.js` may predate the CICD rename; locate by route prefix or full-text search).
- **Params:** request, url, env, ctx
- **Calls:** getAuthUser, jsonResponse, push, run
- **Tags:** auth, d1, mcp, streaming

## cicdMcpStatus
- **Line:** 12283
- **Project:** inneranimalmedia  
- **Purpose:** Production: call handleMcpApi in-process — HTTP fetch to this Worker returns 522 (recursive subrequest). Identifier in `worker.js` may still use a legacy abbreviated prefix; use line number or search `McpStatus` inside the CI/CD API handler.
- **Params:** none
- **Calls:** handleMcpApi
- **Tags:** mcp

## cicdMcpInvoke
- **Line:** 12295
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler. Identifier in `worker.js` may still use a legacy abbreviated prefix; use line number or search `McpInvoke` inside the CI/CD API handler.
- **Params:** toolName, params
- **Calls:** handleMcpApi
- **Tags:** auth, mcp

## recordMcpToolCall
- **Line:** 12504
- **Project:** inneranimalmedia  
- **Purpose:** Record MCP tool call to mcp_tool_calls, mcp_usage_log, and mcp_services. All DB writes in try/catch so missing tables/columns do not break flow.
- **Params:** env, opts
- **Calls:** run
- **Tags:** auth, d1, mcp

## upsertMcpAgentSession
- **Line:** 12545
- **Project:** inneranimalmedia  
- **Purpose:** Create or update MCP agent session at chat start. Uses conversation_id (migration 135). panel from request agent_id (migration 162). No-op if columns missing.
- **Params:** env, conversationId, panelAgentId
- **Calls:** panelColumnFromRequestAgentId, run
- **Tags:** auth, d1, mcp

## runGithubPatBuiltinTool
- **Line:** 12566
- **Project:** inneranimalmedia  
- **Purpose:** GitHub REST via env.GITHUB_TOKEN (PAT). Exact env name — no OAuth in this path.
- **Params:** env, toolName, params
- **Calls:** none
- **Tags:** auth, http-client

## runCfImagesEnvBuiltinTool
- **Line:** 12602
- **Project:** inneranimalmedia  
- **Purpose:** Cloudflare Images REST. Use env names exactly: CLOUDFLARE_IMAGES_TOKEN + CLOUDFLARE_IMAGES_ACCOUNT_HASH.
- **Params:** env, toolName, params
- **Calls:** none
- **Tags:** auth, http-client

## tryRefreshGoogleDriveAccess
- **Line:** 12654
- **Project:** inneranimalmedia  
- **Purpose:** Refresh google_drive row after 401; uses GOOGLE_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET.
- **Params:** env, integrationUserId, tokenRow
- **Calls:** run
- **Tags:** auth, d1, http-client

## runGdriveOauthBuiltinTool
- **Line:** 12682
- **Project:** inneranimalmedia  
- **Purpose:** Google Drive v3. Token: params.oauth_token / params.access_token, OR D1 user_oauth_tokens (google_drive) * for params.user_id | params.integration_user_id | opts.oauthUserId (email/id after Connect Drive callback). * Callback stores tokens in user_oauth_tokens (handleGoogleOAuthC
- **Params:** env, toolName, params, opts
- **Calls:** fetchDrive, getIntegrationToken
- **Tags:** auth, d1

## authHeader
- **Line:** 12702
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** auth

## fetchDrive
- **Line:** 12704
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** url, init
- **Calls:** authHeader, getIntegrationToken, tryRefreshGoogleDriveAccess
- **Tags:** d1

## invokeMcpToolFromChat
- **Line:** 12751
- **Project:** inneranimalmedia  
- **Purpose:** Invoke MCP tool from chat (same logic as /api/mcp/invoke). Returns { result } or { error }. opts.skipApprovalCheck: when true, skip requires_approval check (caller is execute-approved-tool). opts.suppressTelemetry: when true, skip recordMcpToolCall (workflow runner records its ow
- **Params:** env, tool_name, params, conversationId, opts
- **Calls:** aiSearchIsConfigured, autoragAiSearchQuery, ensureAgentMemoryIndexInsertDefaults, ensureRagSearchToolRegistered, find, push, rec, run, runCdpBuiltinTool, runCfImagesEnvBuiltinTool, runCloudConvertBuiltinTool, runCursorCloudAgentBuiltinTool, runGdriveOauthBuiltinTool, runGithubPatBuiltinTool, runImgxBuiltinTool, runInternalPlaywrightTool, runKnowledgeSearchMerged, runMeshyBuiltinTool, runResendBuiltinTool, runTerminalCommand, safeAll, writeAuditLog
- **Tags:** auth, browser, d1, http-client, mcp, r2, streaming

## rec
- **Line:** 12754
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** o
- **Calls:** recordMcpToolCall
- **Tags:** mcp

## safeAll
- **Line:** 13572
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## workflowSleep
- **Line:** 13834
- **Project:** inneranimalmedia  
- **Purpose:** Sleep for agent workflow polling; prefers runtime scheduler (Workers) over setTimeout.
- **Params:** ms
- **Calls:** none
- **Tags:** none

## broadcastAgentWorkflowEvent
- **Line:** 13848
- **Project:** inneranimalmedia  
- **Purpose:** Broadcast JSON to IAM_COLLAB room `workflow:<runId>` (Durable Object POST /broadcast).
- **Params:** env, workflowRunId, payload
- **Calls:** none
- **Tags:** durable-objects

## waitForAgentProposalResolution
- **Line:** 13870
- **Project:** inneranimalmedia  
- **Purpose:** Poll agent_command_proposals until approved, denied, or 1h max (720 x 5s). * @returns {'approved'|'denied'|'timeout'}
- **Params:** env, proposalId
- **Calls:** workflowSleep
- **Tags:** d1

## getLatestUserPlainText
- **Line:** 13885
- **Project:** inneranimalmedia  
- **Purpose:** Most recent user message text only (skip trailing assistant / tool entries in `messages`).
- **Params:** msgList
- **Calls:** none
- **Tags:** none

## appendAttachedFilesToUserText
- **Line:** 13896
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** baseText, attachedFiles
- **Calls:** none
- **Tags:** none

## matchWorkerHealthWorkflowIntent
- **Line:** 13913
- **Project:** inneranimalmedia  
- **Purpose:** Worker health workflow: avoid matching pasted assistant copy like "Worker Health Check" or * "Starting Worker Health Check" (bare \\bhealth\\s+check\\b matched inside those strings).
- **Params:** raw
- **Calls:** none
- **Tags:** none

## matchAgentChatWorkflowIntent
- **Line:** 13930
- **Project:** inneranimalmedia  
- **Purpose:** Map last user text to agent workflow (workflow_runs.workflow_name / AGENT_BUILTIN_WORKFLOW_STEPS). * Returns null if no intent matched.
- **Params:** userText
- **Calls:** matchWorkerHealthWorkflowIntent
- **Tags:** none

## runWorkflowHttpHealthStep
- **Line:** 14025
- **Project:** inneranimalmedia  
- **Purpose:** GET JSON health endpoint; ok when HTTP ok and body JSON has ok === true.
- **Params:** env, url
- **Calls:** none
- **Tags:** none

## runWorkflowGithubDiffReviewStep
- **Line:** 14049
- **Project:** inneranimalmedia  
- **Purpose:** Heuristic diff summary for /review (no LLM — Architect role is static analysis only).
- **Params:** env, triggerUserId, step
- **Calls:** getIntegrationToken, push
- **Tags:** auth, d1, http-client

## agentWorkflowRecordStepSuccess
- **Line:** 14136
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, workflowRunId, stepNum, stepName, stepType, t0, lastSummary
- **Calls:** broadcastAgentWorkflowEvent, run
- **Tags:** d1

## executeAgentWorkflowSteps
- **Line:** 14175
- **Project:** inneranimalmedia  
- **Purpose:** Agent `workflow_runs` executor (separate from MCP `executeWorkflowSteps` at ~9788 and ~12625). * Runs inside ctx.waitUntil only — HTTP response has already returned.
- **Params:** env, ctx, workflowRunId, workflowId, workflowName
- **Calls:** agentWorkflowRecordStepSuccess, broadcastAgentWorkflowEvent, notifySam, run, runTerminalCommandViaHttpExec, runWorkflowGithubDiffReviewStep, runWorkflowHttpHealthStep, waitForAgentProposalResolution
- **Tags:** auth, d1

## dispatchMcpTool
- **Line:** 14647
- **Project:** inneranimalmedia  
- **Purpose:** Delegate MCP tool execution for workflow steps (skips approval; telemetry recorded per step by executeWorkflowSteps).
- **Params:** env, tool_name, input_template, session_id
- **Calls:** invokeMcpToolFromChat
- **Tags:** auth, mcp

## executeWorkflowSteps
- **Line:** 14659
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, workflow, run_id, session_id
- **Calls:** dispatchMcpTool, push, run
- **Tags:** auth, d1, mcp

## runInternalPlaywrightTool
- **Line:** 14787
- **Project:** inneranimalmedia  
- **Purpose:** Run Playwright/browser tools internally (MCP invoke). Used for UI validation, screenshots, and live page content.
- **Params:** env, toolName, params
- **Calls:** putAgentBrowserScreenshotToR2
- **Tags:** browser

## runResendBuiltinTool
- **Line:** 14815
- **Project:** inneranimalmedia  
- **Purpose:** Resend REST builtins (D1: resend_send_email, resend_list_domains, resend_send_broadcast, resend_create_api_key).
- **Params:** env, toolName, params
- **Calls:** none
- **Tags:** auth, cron, http-client

## runCdpBuiltinTool
- **Line:** 14883
- **Project:** inneranimalmedia  
- **Purpose:** IAM cdt_* tools (26 in D1): Playwright-first on MYBROWSER. IAM names mirror Cursor-style browser MCP, not raw CDP method names. * Stateless: one launch per invocation; pass url for DOM/network tools. Multi-tab tools only report the single active page. * Raw CDP (Tracing/Performan
- **Params:** env, toolName, params
- **Calls:** normalizeUrl, putAgentBrowserScreenshotToR2, withPage
- **Tags:** auth, browser, streaming

## normalizeUrl
- **Line:** 14888
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** raw
- **Calls:** none
- **Tags:** none

## withPage
- **Line:** 14894
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** fn
- **Calls:** normalizeUrl
- **Tags:** browser

## uploadImgxToDashboard
- **Line:** 15230
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, bytes, contentType, baseName
- **Calls:** none
- **Tags:** r2

## listImgxProviders
- **Line:** 15240
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** none
- **Tags:** workers-ai

## runImgxBuiltinTool
- **Line:** 15261
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, toolName, params
- **Calls:** listImgxProviders, run, uploadImgxToDashboard
- **Tags:** auth, http-client, r2, streaming, workers-ai

## cloudconvertCollectTasksFromJob
- **Line:** 15428
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** data
- **Calls:** none
- **Tags:** none

## cloudconvertExtractExportFromJob
- **Line:** 15435
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** data
- **Calls:** cloudconvertCollectTasksFromJob
- **Tags:** none

## runCloudConvertBuiltinTool
- **Line:** 15447
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, toolName, params
- **Calls:** cloudconvertExtractExportFromJob
- **Tags:** auth, http-client, r2

## runMeshyBuiltinTool
- **Line:** 15531
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, toolName, params
- **Calls:** none
- **Tags:** auth, http-client, r2, streaming

## isActionTool
- **Line:** 15621
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** toolName
- **Calls:** none
- **Tags:** none

## toolApprovalPreview
- **Line:** 15624
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** toolName, params
- **Calls:** push
- **Tags:** none

## chatWithToolsAnthropic
- **Line:** 15635
- **Project:** inneranimalmedia  
- **Purpose:** Anthropic chat with tools; runs tool_use loop. When opts.stream is true, returns SSE stream with tool_start/tool_result/text/done.
- **Params:** env, systemWithBlurb, apiMessages, model, conversationId, agent_id, ctx, opts
- **Calls:** calculateCost, filterToolRowsByPanel, find, getLastUserMessageText, invokeMcpToolFromChat, jsonResponse, push, resolveAnthropicModelKey, streamDoneDbWrites, toolApprovalPreview
- **Tags:** auth, cron, d1, http-client, mcp, r2, streaming

## enqueue
- **Line:** 15682
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller, obj
- **Calls:** enqueue
- **Tags:** cron

## flushPendingToolStates
- **Line:** 15700
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** enqueue
- **Tags:** cron

## start
- **Line:** 15751
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** emitCodeBlocksFromText, enqueue, flushPendingToolStates
- **Tags:** cron

## start
- **Line:** 15786
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** emitCodeBlocksFromText, enqueue, flushPendingToolStates
- **Tags:** cron

## start
- **Line:** 15875
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** controller
- **Calls:** emitCodeBlocksFromText, enqueue, flushPendingToolStates
- **Tags:** cron

## processQueues
- **Line:** 15893
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** run
- **Tags:** auth, d1

## runAgentMemoryDecay
- **Line:** 15923
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** run
- **Tags:** cron, d1, streaming

## runFinancialCommandCron
- **Line:** 15941
- **Project:** inneranimalmedia  
- **Purpose:** Daily 09:00 UTC: compare spend_ledger today vs ai_guardrails metadata daily budget; email if over.
- **Params:** env, ctx
- **Calls:** notifySam
- **Tags:** cron, d1

## retentionConditionIsSafe
- **Line:** 16013
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** cond
- **Calls:** none
- **Tags:** none

## runRetentionPurge
- **Line:** 16028
- **Project:** inneranimalmedia  
- **Purpose:** Midnight cron: batch-delete old rows per data_retention_policies (LIMIT 500 per table per run). * Unknown table_name values are skipped. Optional policy.condition appended as AND (...); use D1 for e.g. * agent_messages: session_id NOT IN (SELECT id FROM agent_sessions WHERE statu
- **Params:** env
- **Calls:** push, retentionConditionIsSafe, run, writeAuditLog
- **Tags:** cron, d1

## runWebhookEventsMaintenanceCron
- **Line:** 16110
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** run
- **Tags:** cron, d1, streaming

## origin
- **Line:** 16206
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** url
- **Calls:** none
- **Tags:** none

## jsonResponse
- **Line:** 16208
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** body, status
- **Calls:** recordWorkerAnalyticsError
- **Tags:** none

## handleFederatedSearch
- **Line:** 16239
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** getSession, jsonResponse, vectorizeRagSearch
- **Tags:** auth, d1, vectorize

## ensureWorkSessionAndSignal
- **Line:** 16334
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, userId, workspaceId, signalType, source, payload
- **Calls:** run
- **Tags:** auth, d1

## getSession
- **Line:** 16352
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, request
- **Calls:** getSamContext
- **Tags:** auth, d1

## getAuthUser
- **Line:** 16368
- **Project:** inneranimalmedia  
- **Purpose:** Returns { id: user_id, email? } for auth_sessions user, or null. Use for routes that need current user id. For session list and OAuth tokens use email || id (id is auth_sessions.user_id; for superadmin id is sam_primeaux, email is the login email).
- **Params:** request, env
- **Calls:** getSession
- **Tags:** auth

## vaultGetKey
- **Line:** 16378
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** masterKeyB64
- **Calls:** importKey
- **Tags:** none

## vaultEncrypt
- **Line:** 16383
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** plaintext, masterKeyB64
- **Calls:** vaultGetKey
- **Tags:** none

## vaultDecrypt
- **Line:** 16394
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** encryptedB64, masterKeyB64
- **Calls:** vaultGetKey
- **Tags:** none

## vaultLast4
- **Line:** 16403
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** str
- **Calls:** none
- **Tags:** none

## vaultNewId
- **Line:** 16407
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** prefix
- **Calls:** none
- **Tags:** none

## vaultWriteAudit
- **Line:** 16411
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** db, ?
- **Calls:** run
- **Tags:** d1

## vaultJson
- **Line:** 16421
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** data, status
- **Calls:** none
- **Tags:** none

## vaultErr
- **Line:** 16425
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** message, status
- **Calls:** vaultJson
- **Tags:** none

## vaultCreateSecret
- **Line:** 16429
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** run, vaultEncrypt, vaultErr, vaultJson, vaultLast4, vaultNewId, vaultWriteAudit
- **Tags:** d1

## vaultListSecrets
- **Line:** 16445
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** push, vaultJson
- **Tags:** d1

## vaultGetSecret
- **Line:** 16456
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** id, env
- **Calls:** vaultErr, vaultJson
- **Tags:** d1

## vaultRevealSecret
- **Line:** 16464
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** id, eventType, request, env
- **Calls:** run, vaultDecrypt, vaultErr, vaultJson, vaultWriteAudit
- **Tags:** d1

## vaultEditSecret
- **Line:** 16478
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** id, request, env
- **Calls:** run, vaultErr, vaultJson, vaultWriteAudit
- **Tags:** d1

## vaultRotateSecret
- **Line:** 16490
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** id, request, env
- **Calls:** run, vaultDecrypt, vaultEncrypt, vaultErr, vaultJson, vaultLast4, vaultWriteAudit
- **Tags:** d1

## vaultRevokeSecret
- **Line:** 16509
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** id, env, request
- **Calls:** run, vaultErr, vaultJson, vaultWriteAudit
- **Tags:** d1

## vaultGetSecretAudit
- **Line:** 16517
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** id, env
- **Calls:** vaultJson
- **Tags:** d1

## vaultListProjects
- **Line:** 16522
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** vaultJson
- **Tags:** d1

## vaultFullAudit
- **Line:** 16529
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** push, vaultJson
- **Tags:** d1

## vaultRegistry
- **Line:** 16553
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** vaultJson
- **Tags:** auth, mcp

## handleVaultRequest
- **Line:** 16597
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** vaultCreateSecret, vaultEditSecret, vaultErr, vaultFullAudit, vaultGetSecret, vaultGetSecretAudit, vaultListProjects, vaultListSecrets, vaultRegistry, vaultRevealSecret, vaultRevokeSecret, vaultRotateSecret
- **Tags:** none

## getIntegrationToken
- **Line:** 16629
- **Project:** inneranimalmedia  
- **Purpose:** Returns { access_token, refresh_token, expires_at } from user_oauth_tokens for the given user, provider, and optional account_identifier. For github with accountId empty, returns first row.
- **Params:** DB, userId, provider, accountId
- **Calls:** none
- **Tags:** auth, d1

## aiSearchIsConfigured
- **Line:** 16646
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** none
- **Tags:** none

## normKbTitle
- **Line:** 16651
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** t
- **Calls:** none
- **Tags:** none

## d1KbRowToHit
- **Line:** 16655
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** row
- **Calls:** none
- **Tags:** none

## parseAutoragHits
- **Line:** 16667
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** raw
- **Calls:** none
- **Tags:** none

## push
- **Line:** 16669
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** x
- **Calls:** push
- **Tags:** none

## autoragAiSearchQuery
- **Line:** 16714
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, queryStr, maxResults
- **Calls:** parseAutoragHits
- **Tags:** auth, http-client

## mergeD1AndAiKbHits
- **Line:** 16756
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** d1Rows, aiHits, maxR
- **Calls:** normKbTitle, push
- **Tags:** none

## runKnowledgeSearchMerged
- **Line:** 16783
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, query, max_results
- **Calls:** autoragAiSearchQuery, mergeD1AndAiKbHits
- **Tags:** d1

## ensureRagSearchToolRegistered
- **Line:** 16800
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** run
- **Tags:** d1, mcp

## pgMatchDocuments
- **Line:** 16837
- **Project:** inneranimalmedia  
- **Purpose:** Embed query with Workers AI, then call Supabase match_documents via Hyperdrive (raw pg). * Expects DB function: match_documents(vector, float, int, text). Embedding dims must match the DB (bge-large-en-v1.5 = 1024).
- **Params:** env, queryText, opts
- **Calls:** fail, run
- **Tags:** vectorize, workers-ai

## fail
- **Line:** 16838
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** msg
- **Calls:** none
- **Tags:** vectorize

## formatPgvectorRowsForPrompt
- **Line:** 16873
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** rows
- **Calls:** none
- **Tags:** none

## vectorizeRagSearch
- **Line:** 16894
- **Project:** inneranimalmedia  
- **Purpose:** RAG search using Vectorize index (VECTORIZE_INDEX or VECTORIZE). Embeds query, runs vector search, resolves content from metadata or R2. * Returns { results, data } for compatibility with code that expected AI.autorag().search().
- **Params:** env, query, opts
- **Calls:** push, run
- **Tags:** r2, vectorize, workers-ai

## chunkByTokenApprox
- **Line:** 16935
- **Project:** inneranimalmedia  
- **Purpose:** Chunk markdown text into overlapping segments for embedding.
- **Params:** text, maxChars, overlapChars
- **Calls:** push
- **Tags:** none

## chunkMarkdown
- **Line:** 16953
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** text, maxChars, overlap
- **Calls:** push
- **Tags:** none

## extractSchema
- **Line:** 16979
- **Project:** inneranimalmedia  
- **Purpose:** D1-compatible schema extraction: use sql from sqlite_master (no PRAGMA).
- **Params:** env
- **Calls:** none
- **Tags:** d1

## writeKnowledgePostDeploy
- **Line:** 16993
- **Project:** inneranimalmedia  
- **Purpose:** Post-deploy: write worker structure, D1 schema, and optional cursor rules to R2 knowledge/. * Call from deploy script: curl -X POST .../api/internal/post-deploy -H "X-Internal-Secret: $INTERNAL_API_SECRET" [-d '{"cursor_rules_md":"..."}'] * Returns array of R2 keys written.
- **Params:** env, body
- **Calls:** extractSchema, push
- **Tags:** auth, d1, mcp, r2, vectorize

## runKnowledgeDailySync
- **Line:** 17041
- **Project:** inneranimalmedia  
- **Purpose:** Daily knowledge sync: write agent_memory_index (score >= 7) and active roadmap_steps to R2 knowledge/. * Called from cron 0 6 * * *.
- **Params:** env
- **Calls:** none
- **Tags:** d1, r2

## compactConversationToKnowledge
- **Line:** 17079
- **Project:** inneranimalmedia  
- **Purpose:** Auto-compact: when a conversation has > 50 messages, summarize with AI, save to R2 knowledge/conversations/{id}-summary.md, then delete oldest messages (keep last 50).
- **Params:** env, conversationId
- **Calls:** find, run
- **Tags:** d1, http-client, r2, workers-ai

## compactAgentChatsToR2
- **Line:** 17155
- **Project:** inneranimalmedia  
- **Purpose:** Compact recent agent_messages from D1 into a single markdown file and upload to R2. * Used so RAG can search over recent chat context without manual sync. Writes to memory/compacted-chats/YYYY-MM-DD.md. * Returns { conversations: number, messages: number, key: string, error?: str
- **Params:** env
- **Calls:** push, run
- **Tags:** d1, r2, workers-ai

## indexMemoryMarkdownToVectorize
- **Line:** 17236
- **Project:** inneranimalmedia  
- **Purpose:** Index R2 memory markdown (memory/daily/*.md, memory/schema-and-records.md) into Vectorize. * Uses Workers AI @cf/baai/bge-large-en-v1.5 (1024 dims). Requires Vectorize index with dimensions=1024, metric=cosine (matches AI Search iam-docs-search). * Returns { indexed: number of ke
- **Params:** env
- **Calls:** chunkMarkdown, push, run
- **Tags:** r2, vectorize, workers-ai

## chunkCodeFile
- **Line:** 17315
- **Project:** inneranimalmedia  
- **Purpose:** Chunk a code/markdown file by lines for embedding (overlapping windows).
- **Params:** content, filePath
- **Calls:** push
- **Tags:** none

## generateVectorId
- **Line:** 17335
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** filePath, startLine, endLine
- **Calls:** none
- **Tags:** none

## performCodebaseIndexing
- **Line:** 17348
- **Project:** inneranimalmedia  
- **Purpose:** Index R2 DASHBOARD bucket source/ (worker.js, agent-dashboard, mcp-server, docs) into Vectorize for code search.
- **Params:** env
- **Calls:** chunkCodeFile, run
- **Tags:** r2, streaming, vectorize, workers-ai

## handleReindexCodebase
- **Line:** 17414
- **Project:** inneranimalmedia  
- **Purpose:** Handle POST /api/admin/reindex-codebase — sync or async codebase indexing into Vectorize.
- **Params:** request, env, ctx
- **Calls:** performCodebaseIndexing
- **Tags:** none

## sendDailyDigest
- **Line:** 17430
- **Project:** inneranimalmedia  
- **Purpose:** Daily digest: pull DB data, have Claude write summary, send email. Cron 0 0 * * * (6pm CST = midnight UTC).
- **Params:** env
- **Calls:** run, safe
- **Tags:** auth, d1, http-client, r2, streaming

## safe
- **Line:** 17431
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## sendDailyPlanEmail
- **Line:** 17564
- **Project:** inneranimalmedia  
- **Purpose:** 8:30am CST (13:30 UTC) daily plan: D1 context + Workers AI + Resend. Cron 30 13 * * *
- **Params:** env
- **Calls:** run
- **Tags:** auth, cron, d1, http-client, vectorize, workers-ai

## overviewStatsPayload
- **Line:** 17643
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** overrides
- **Calls:** none
- **Tags:** none

## handleOverviewStats
- **Line:** 17662
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** jsonResponse, num, overviewStatsPayload, safe, sum
- **Tags:** d1

## safe
- **Line:** 17664
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## num
- **Line:** 17665
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** r, key
- **Calls:** none
- **Tags:** none

## sum
- **Line:** 17666
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** r, key
- **Calls:** none
- **Tags:** none

## handleRecentActivity
- **Line:** 17725
- **Project:** inneranimalmedia  
- **Purpose:** Recent activity for overview card: last 48 hours, simple English.
- **Params:** request, url, env
- **Calls:** jsonResponse, safe
- **Tags:** auth, d1

## safe
- **Line:** 17728
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## handleOverviewActivityStrip
- **Line:** 17784
- **Project:** inneranimalmedia  
- **Purpose:** GET /api/overview/activity-strip -- session required. Returns weekly_activity, recent_activity, worked_this_week, projects.
- **Params:** request, url, env
- **Calls:** find, getSession, jsonResponse, num, safe
- **Tags:** auth, d1

## safe
- **Line:** 17798
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## num
- **Line:** 17799
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** r, k
- **Calls:** none
- **Tags:** none

## handleOverviewDeployments
- **Line:** 17949
- **Project:** inneranimalmedia  
- **Purpose:** GET /api/overview/deployments -- session required. Returns deployments[] (20) and cicd_runs (10).
- **Params:** request, url, env
- **Calls:** getSession, jsonResponse
- **Tags:** auth, d1

## handleOverviewCheckpoints
- **Line:** 18007
- **Project:** inneranimalmedia  
- **Purpose:** Workflow checkpoints: list (GET) or create/update (POST). Used for realtime alignment and reducing backtracking.
- **Params:** request, url, env
- **Calls:** getSession, jsonResponse, run
- **Tags:** auth, d1

## handleTimeTrackManual
- **Line:** 18065
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** run
- **Tags:** d1

## handleTimeTrackHeartbeat
- **Line:** 18094
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** none
- **Tags:** auth, d1

## handleTimeTrack
- **Line:** 18180
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** ensureWorkSessionAndSignal, getSession, handleTimeTrackHeartbeat, jsonResponse, pathToSegments, run
- **Tags:** auth, d1

## pathToSegments
- **Line:** 18261
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** pathname
- **Calls:** none
- **Tags:** none

## handleColorsAll
- **Line:** 18265
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** jsonResponse
- **Tags:** none

## safeQuery
- **Line:** 18285
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env, fn
- **Calls:** none
- **Tags:** d1

## handleFinance
- **Line:** 18290
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** handleFinanceAccounts, handleFinanceAiSpend, handleFinanceBreakdown, handleFinanceCategories, handleFinanceHealth, handleFinanceImportCsv, handleFinanceMrr, handleFinanceSummary, handleFinanceTransactionCreate, handleFinanceTransactionGet, handleFinanceTransactionMutate, handleFinanceTransactionsList, jsonResponse, pathToSegments
- **Tags:** none

## handleFinanceSummary
- **Line:** 18332
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** url, env
- **Calls:** jsonResponse, safe
- **Tags:** d1

## safe
- **Line:** 18334
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## handleFinanceHealth
- **Line:** 18434
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** jsonResponse, safe
- **Tags:** d1

## safe
- **Line:** 18435
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## handleFinanceBreakdown
- **Line:** 18457
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** url, env
- **Calls:** jsonResponse, safe
- **Tags:** d1

## safe
- **Line:** 18459
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## handleFinanceCategories
- **Line:** 18474
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** jsonResponse, safe
- **Tags:** d1

## safe
- **Line:** 18475
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## handleFinanceAccounts
- **Line:** 18490
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** jsonResponse, safe
- **Tags:** d1

## safe
- **Line:** 18491
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## handleFinanceMrr
- **Line:** 18503
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** jsonResponse
- **Tags:** none

## handleFinanceAiSpend
- **Line:** 18507
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** url, env
- **Calls:** jsonResponse, safe
- **Tags:** d1

## safe
- **Line:** 18509
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## handleFinanceTransactionsList
- **Line:** 18541
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** jsonResponse
- **Tags:** d1

## handleFinanceTransactionGet
- **Line:** 18553
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env, id
- **Calls:** jsonResponse, safe
- **Tags:** d1

## safe
- **Line:** 18554
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** p
- **Calls:** none
- **Tags:** none

## handleFinanceTransactionCreate
- **Line:** 18562
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** jsonResponse, run
- **Tags:** d1

## handleFinanceImportCsv
- **Line:** 18583
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** find, jsonResponse, run
- **Tags:** d1

## find
- **Line:** 18601
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** terms
- **Calls:** none
- **Tags:** none

## handleFinanceTransactionMutate
- **Line:** 18628
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env, id, method
- **Calls:** jsonResponse, push, run
- **Tags:** d1

## handleClients
- **Line:** 18668
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** jsonResponse, run
- **Tags:** d1

## handleProjects
- **Line:** 18723
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** jsonResponse
- **Tags:** d1

## handleHubRoadmap
- **Line:** 18743
- **Project:** inneranimalmedia  
- **Purpose:** ----- API: Mission Control Hub (read-only + task create/update) -----
- **Params:** request, env
- **Calls:** none
- **Tags:** d1

## handleHubTasks
- **Line:** 18756
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** none
- **Tags:** d1

## handleHubStats
- **Line:** 18772
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** none
- **Tags:** d1

## handleHubTerminal
- **Line:** 18789
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** none
- **Tags:** d1

## handleHubTaskCreate
- **Line:** 18801
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** run
- **Tags:** d1

## handleHubTaskUpdate
- **Line:** 18820
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, env, taskId
- **Calls:** run
- **Tags:** d1

## handleBillingSummary
- **Line:** 18835
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** jsonResponse
- **Tags:** d1

## hexToBytes
- **Line:** 18851
- **Project:** inneranimalmedia  
- **Purpose:** Hex string to Uint8Array for PBKDF2 salt.
- **Params:** hex
- **Calls:** push
- **Tags:** none

## verifyPassword
- **Line:** 18858
- **Project:** inneranimalmedia  
- **Purpose:** Verify password against PBKDF2-SHA256 stored hash (hex) and salt (hex). Returns true if match.
- **Params:** password, saltHex, hashHex
- **Calls:** hexToBytes, importKey
- **Tags:** none

## hashPassword
- **Line:** 18871
- **Project:** inneranimalmedia  
- **Purpose:** Generate new salt (32 bytes hex) and PBKDF2-SHA256 hash for change-password. Returns { saltHex, hashHex }.
- **Params:** password
- **Calls:** importKey
- **Tags:** none

## handleEmailPasswordLogin
- **Line:** 18885
- **Project:** inneranimalmedia  
- **Purpose:** POST /api/auth/login -- body: { email, password, next? }. JSON clients get { ok, redirect } + Set-Cookie; others 302.
- **Params:** request, url, env
- **Calls:** finishLogin, loginJson, origin, timingSafeEqualUtf8, verifyPassword
- **Tags:** auth, d1

## loginJson
- **Line:** 18890
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** ok, data, status
- **Calls:** none
- **Tags:** auth

## finishLogin
- **Line:** 18902
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** userId, redirectPath
- **Calls:** loginJson, origin, run
- **Tags:** auth, d1

## handleBackupCodeLogin
- **Line:** 18996
- **Project:** inneranimalmedia  
- **Purpose:** POST /api/auth/backup-code -- body: { email, code }. Verifies one-time backup code, marks it used, creates session. Returns 200 + Set-Cookie + { ok, redirect }.
- **Params:** request, url, env
- **Calls:** run
- **Tags:** auth, d1

## handleLogout
- **Line:** 19039
- **Project:** inneranimalmedia  
- **Purpose:** POST /api/auth/logout -- clear session cookie and redirect to sign-in.
- **Params:** request, url, env
- **Calls:** origin
- **Tags:** auth

## arrayBufferToBase64
- **Line:** 19052
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** ab
- **Calls:** none
- **Tags:** none

## handleOvernightValidate
- **Line:** 19063
- **Project:** inneranimalmedia  
- **Purpose:** POST /api/admin/overnight/validate -- run in worker (remote). D1 check, before screenshots to R2, one proof email WITH screenshot attachments.
- **Params:** env, baseUrl
- **Calls:** push, run
- **Tags:** auth, browser, cron, d1, http-client, r2

## handleOvernightStart
- **Line:** 19135
- **Project:** inneranimalmedia  
- **Purpose:** POST /api/admin/overnight/start -- run in worker (remote). Before screenshots + first pipeline email WITH attachments, set D1 OVERNIGHT_STATUS for cron progress.
- **Params:** env, baseUrl
- **Calls:** push, run
- **Tags:** auth, browser, cron, d1, http-client, r2

## loadScreenshotAttachments
- **Line:** 19241
- **Project:** inneranimalmedia  
- **Purpose:** Load screenshot attachments from R2 (before_dir) for progress emails.
- **Params:** env, beforeDir
- **Calls:** arrayBufferToBase64, push
- **Tags:** r2

## runOvernightCronStep
- **Line:** 19257
- **Project:** inneranimalmedia  
- **Purpose:** Cron every 30 min: send 30min, hourly, and morning progress emails when OVERNIGHT_STATUS is RUNNING.
- **Params:** env
- **Calls:** loadScreenshotAttachments, run
- **Tags:** auth, cron, d1, http-client

## oauthPostLoginGlobeRedirectUrl
- **Line:** 19370
- **Project:** inneranimalmedia  
- **Purpose:** After Google/GitHub OAuth login, bounce through sign-in HTML so the same globe exit animation runs.
- **Params:** originBase, returnToFullUrl
- **Calls:** none
- **Tags:** none

## handleGoogleOAuthStart
- **Line:** 19380
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** origin
- **Tags:** auth, kv

## handleGoogleOAuthCallback
- **Line:** 19410
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** getAuthUser, oauthPostLoginGlobeRedirectUrl, origin, run
- **Tags:** auth, d1, http-client, kv

## handleGitHubOAuthStart
- **Line:** 19510
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** origin
- **Tags:** auth, kv

## handleGitHubOAuthCallback
- **Line:** 19533
- **Project:** inneranimalmedia  
- **Purpose:** Worker helper or handler.
- **Params:** request, url, env
- **Calls:** find, getAuthUser, oauthPostLoginGlobeRedirectUrl, origin, run
- **Tags:** auth, d1, http-client, kv
