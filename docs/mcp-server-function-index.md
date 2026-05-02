# Worker Function Index — mcp-server

## unauthorized
- **Line:** 8
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** message
- **Calls:** none
- **Tags:** none

## validateBearer
- **Line:** 15
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** request, env
- **Calls:** unauthorized
- **Tags:** auth, mcp

## sseResponse
- **Line:** 27
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** json
- **Calls:** none
- **Tags:** streaming

## textContent
- **Line:** 36
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** text
- **Calls:** none
- **Tags:** none

## getRegisteredTools
- **Line:** 40
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** env
- **Calls:** none
- **Tags:** d1, mcp

## parseToolInputSchema
- **Line:** 55
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** raw
- **Calls:** none
- **Tags:** none

## recordToolCall
- **Line:** 64
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** env, ?
- **Calls:** none
- **Tags:** auth, d1, mcp

## fetch
- **Line:** 98
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** request, env, ctx
- **Calls:** getRegisteredTools, recordToolCall, sseResponse, textContent, validateBearer
- **Tags:** auth, d1, http-client, mcp, r2, streaming, vectorize

## queue
- **Line:** 396
- **Project:** mcp-server  
- **Purpose:** Worker helper or handler.
- **Params:** batch, env, ctx
- **Calls:** none
- **Tags:** none
