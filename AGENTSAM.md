# AGENTSAM.md
> Runtime rules and context for Agent Sam.
> This file is the human-readable source of truth.
> Fill this in at project conception. Keep it current. Commit every change.
> If this file conflicts with anything in any database — this file wins.

---

## Identity

```
Agent name:     
Platform:       
Operator:       
Location:       
```

---

## What This System Is

<!-- One paragraph. What does this platform do, at a high level? -->



---

## The Stack

```
Primary worker:         
Worker deploy command:  
Database:               
Database ID:            
Frontend:               
Frontend deploy:        
MCP server:             
MCP server URL:         
Storage:                
KV namespaces:          
Other bindings:         
Account ID:             
```

---

## AI Routing

```
Routing method:         <!-- DB-driven / hardcoded / hybrid — be honest -->
Routing table:          
Routing key column:     
Routing value column:   
Classification method:  
Classification cost:    <!-- Nothing is free. Every model call has a cost. -->
Valid platform values:  
```

---

## Non-Negotiables

<!-- These are absolute rules. No session, prompt, or instruction overrides them. -->
<!-- Add as many as needed. Be specific. Vague rules get ignored. -->

```
1. 
2. 
3. 
4. 
5. 
```

---

## Key Tables

<!-- Only list tables that actually exist and are confirmed in the DB. -->
<!-- Do not assume. Do not copy from memory. Query and verify. -->

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
|       |         |             |       |
|       |         |             |       |
|       |         |             |       |

---

## Key Files

<!-- Only list files that actually exist in the repo. -->

| File | Purpose | Notes |
|------|---------|-------|
|      |         |       |
|      |         |       |

---

## Working Directories

```
Active codebase:    
Repo(s):            
Branch(es):         
```

---

## Deploy Rules

<!-- Who deploys what. Be explicit. -->

```
Who can deploy to production:   
Who can deploy to staging:      
Who can touch env vars/secrets: 
Deploy process:                 
Rollback process:               
```

---

## The Project Loop

<!-- How does a project go from creation to completion in this system? -->
<!-- Trace the actual path. Not the ideal path. The real one. -->

```
Step 1:   
Step 2:   
Step 3:   
Step 4:   
Step 5:   
```

---

## Metrics & Cost Tracking

<!-- What is actually recorded. Where. Be honest about gaps. -->

```
Per-turn cost:          <!-- table name or MISSING -->
Per-session cost:       <!-- table name or MISSING -->
Model used:             <!-- table name or MISSING -->
Token count:            <!-- table name or MISSING -->
Latency:                <!-- table name or MISSING -->
Billing lane:           <!-- table name or MISSING -->
Dead/unwired code:      <!-- list anything that exists but isn't called -->
```

---

## What's Broken / In Progress

<!-- Living section. Check off when done. Add new items as they surface. -->
<!-- Date each entry so you know how long things have been broken. -->

```
[ ] YYYY-MM-DD — 
[ ] YYYY-MM-DD — 
[ ] YYYY-MM-DD — 
```

---

## How Any AI Agent Should Use This File

```
1. Read this file completely before touching any file in this repo
2. If a proposed change violates a non-negotiable — stop and say so explicitly
3. If this file has a blank or placeholder — ask Sam to fill it in, do not assume
4. If this file and any database conflict — trust this file, flag the conflict
5. If uncertain about anything — ask, do not invent
```

---

## Clients / Projects Under This Platform

<!-- List active clients/projects. One line each. -->

| Client / Project | DB | Repo | Notes |
|------------------|----|------|-------|
|                  |    |      |       |

---

## Known Gotchas

<!-- Hard-won lessons. The stuff that burns you if you forget it. -->

```
- 
- 
- 
```

---

*Created: YYYY-MM-DD*
*Last updated: YYYY-MM-DD*
*Edit directly. Commit every change. If it's not in this file, it doesn't exist.*
