# Worker Function Index — agent-dashboard

## looksLikeShellCommandText
- **Line:** 21
- **Project:** agent-dashboard  
- **Purpose:** True if string looks like a shell one-liner (for slash-picker instant /run).
- **Params:** text
- **Calls:** none
- **Tags:** none

## langToExt
- **Line:** 164
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** lang
- **Calls:** none
- **Tags:** none

## extractLargestCodeBlock
- **Line:** 179
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** text
- **Calls:** none
- **Tags:** none

## parseFencedParts
- **Line:** 193
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** text
- **Calls:** none
- **Tags:** none

## toolOutputSummaryLine
- **Line:** 216
- **Project:** agent-dashboard  
- **Purpose:** Heuristic: fenced blocks that look like MCP / tool JSON or shell tool output — render collapsed like Claude tool rows.
- **Params:** lang, code
- **Calls:** none
- **Tags:** mcp

## splitTextWithImageUrls
- **Line:** 245
- **Project:** agent-dashboard  
- **Purpose:** Split plain text into alternating text and image URL segments for inline chat rendering.
- **Params:** text
- **Calls:** none
- **Tags:** none

## isAgentThemeDark
- **Line:** 352
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## resolveAgentModeCssValue
- **Line:** 360
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** row, isDark
- **Calls:** none
- **Tags:** none

## applyAgentModeVarsToDocument
- **Line:** 369
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** rows
- **Calls:** isAgentThemeDark, resolveAgentModeCssValue
- **Tags:** none

## DiffProposalCard
- **Line:** 389
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** ?
- **Calls:** none
- **Tags:** none

## TerminalOutputCard
- **Line:** 434
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** ?
- **Calls:** none
- **Tags:** none

## normalizeTerminalCommand
- **Line:** 582
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** raw
- **Calls:** none
- **Tags:** none

## classifyGitTerminalCommand
- **Line:** 591
- **Project:** agent-dashboard  
- **Purpose:** Classify a shell command string as a git action, or null.
- **Params:** rawCommand
- **Calls:** normalizeTerminalCommand
- **Tags:** none

## resolveGitActionType
- **Line:** 602
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** msg
- **Calls:** classifyGitTerminalCommand
- **Tags:** none

## parseGitOutputSummary
- **Line:** 610
- **Project:** agent-dashboard  
- **Purpose:** One-line summary from git stdout/stderr for card header (terminal_execute / local terminal).
- **Params:** gitType, output, command
- **Calls:** normalizeTerminalCommand
- **Tags:** none

## GitActionCard
- **Line:** 653
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** ?
- **Calls:** parseGitOutputSummary
- **Tags:** none

## DeployStatusPill
- **Line:** 791
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** ?
- **Calls:** none
- **Tags:** none

## AssistantFencedContent
- **Line:** 836
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** ?
- **Calls:** none
- **Tags:** none

## AgentDashboard
- **Line:** 1096
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** auth, cron, mcp, r2, streaming, workers-ai

## fn
- **Line:** 1384
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## onMessage
- **Line:** 1435
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** event
- **Calls:** none
- **Tags:** auth

## postLoadImageToDrawFrame
- **Line:** 1454
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** url, attempt
- **Calls:** none
- **Tags:** none

## onIamDrawMessage
- **Line:** 1472
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** event
- **Calls:** fn, postLoadImageToDrawFrame
- **Tags:** none

## handleShellNav
- **Line:** 1498
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## onDocClick
- **Line:** 1725
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## handleKeyboardShortcut
- **Line:** 1779
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** streaming

## onDocDown
- **Line:** 1930
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** streaming

## onMove
- **Line:** 1947
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## onUp
- **Line:** 1955
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## onMove
- **Line:** 1981
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e2
- **Calls:** none
- **Tags:** none

## onUp
- **Line:** 1987
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## onMove
- **Line:** 2008
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e2
- **Calls:** none
- **Tags:** none

## onUp
- **Line:** 2014
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## toggleMic
- **Line:** 2073
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## sendMessage
- **Line:** 2096
- **Project:** agent-dashboard  
- **Purpose:** ── Send message ──────────────────────────────────────────────────────────
- **Params:** textOverride
- **Calls:** extractLargestCodeBlock, sendMessage
- **Tags:** auth, streaming

## applySlashCommandSelection
- **Line:** 2521
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** cmd
- **Calls:** buildSendLine, looksLikeShellCommandText, sendMessage
- **Tags:** streaming

## buildSendLine
- **Line:** 2551
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## stopGeneration
- **Line:** 2568
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## scrollVault
- **Line:** 2850
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** none
- **Calls:** none
- **Tags:** none

## isImageFile
- **Line:** 2861
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** file
- **Calls:** none
- **Tags:** none

## isTextFile
- **Line:** 2866
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** file
- **Calls:** none
- **Tags:** none

## arrayBufferToBase64
- **Line:** 2871
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** buffer
- **Calls:** none
- **Tags:** none

## onImageSelect
- **Line:** 2878
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## onFileSelect
- **Line:** 2898
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## onDropFiles
- **Line:** 2927
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## onDragOverFiles
- **Line:** 2983
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## onDragEnterFiles
- **Line:** 2988
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## onDragLeaveFiles
- **Line:** 2991
- **Project:** agent-dashboard  
- **Purpose:** Worker helper or handler.
- **Params:** e
- **Calls:** none
- **Tags:** none

## providerBorderColor
- **Line:** 3023
- **Project:** agent-dashboard  
- **Purpose:** ── Provider bubble color ─────────────────────────────────────────────────
- **Params:** provider
- **Calls:** none
- **Tags:** none
