import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

const app = new AgentSam({ project: 'my-app', lane: 'cms', agent: 'orchestrator' });
const res = await app.handle(new Request('https://example.com/api/health'));
const data = await res.json();

if (!data.ok) {
  console.error(data);
  process.exit(1);
}

console.log('AgentSam smoke test passed:', data);
