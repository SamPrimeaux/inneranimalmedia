import { AgentSam } from '@inneranimalmedia/agentsam-sdk';

export default {
  async fetch(request, env, ctx) {
    const agent = new AgentSam({
      env,
      ctx,
      project: 'my-app',
      lane: 'cms',
      agent: 'orchestrator',
    });

    return agent.handle(request);
  },
};
