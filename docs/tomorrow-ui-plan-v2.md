# Tomorrow's Plan - Agent + MCP Page Polish

## Morning (9am-12pm): Agent Page Input Bar
1. Fix mobile layout (flexbox, breakpoints)
2. Wire context gauge to real token count
3. Test on iPhone
4. Deploy

## Afternoon (1pm-4pm): Agent Page Features
5. Chat rename/star/delete
6. Loading spinners everywhere
7. Fix any remaining UI bugs
8. Deploy

## Evening (4pm-7pm): MCP Page - Make It Real

### Theme System
- Inject loadThemes() (copy from agent.html)
- Wire to /api/themes
- Remove hardcoded 3-theme cycle

### Workspace Functionality
- "Open Workspace" opens agent interface
- Each agent gets unique conversation_id
- Tool sidebar actually invokes tools
- Activity feed shows real tool calls

### Data Wiring
- Connect to agent_sessions table
- Track cost per agent
- Show real session status (idle/running/complete)
- Tool history from mcp_tool_calls

### Polish
- Loading states
- Error handling
- Mobile responsive
- Test all 4 agents

## Success Metrics
- Agent page: Clean input bar, working features, looks good on iPhone
- MCP page: All 4 agents functional, tools work, themes work, actually usable

## No Rabbit Holes
- No new infrastructure
- No database migrations unless blocking UI
- No backend work unless required for UI
