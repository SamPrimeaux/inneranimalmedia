#!/usr/bin/env node
import { mintAgentSessionCookie } from './lib/mint-agent-session.mjs';

const r = await mintAgentSessionCookie();
console.log(`mint ok session_id=${String(r.sessionId || '').slice(0, 16)}...`);
