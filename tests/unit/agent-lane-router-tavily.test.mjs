import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyAgentExecutionLane,
  messageRequestsOpenWebSearch,
  messageRequestsWebFetch,
  messageRequestsWorkspaceGrep,
  messageRequestsBrowserInspect,
} from '../../src/core/agent-lane-router.js';
import {
  isSimpleGreeting,
  messageRequestsInternalKnowledge,
  hasTavilyApiKey,
  resolveOpenWebBackendLabel,
} from '../../src/core/tavily-open-web-search.js';

test('smoke A: latest Cloudflare docs → open_web_search', () => {
  const msg = 'What are the latest Cloudflare AI Search docs updates?';
  const lane = classifyAgentExecutionLane(msg, { requestedMode: 'agent' });
  assert.equal(lane.primary_lane, 'open_web_search');
  assert.equal(messageRequestsOpenWebSearch(msg), true);
  assert.equal(messageRequestsBrowserInspect(msg), false);
  assert.equal(messageRequestsWorkspaceGrep(msg), false);
});

test('smoke B: fetch known URL → web_fetch not Tavily lane', () => {
  const msg = 'Fetch https://developers.cloudflare.com/ai-search/';
  const lane = classifyAgentExecutionLane(msg, { requestedMode: 'agent' });
  assert.equal(lane.primary_lane, 'web_fetch');
  assert.equal(messageRequestsWebFetch(msg), true);
  assert.equal(messageRequestsOpenWebSearch(msg), false);
});

test('smoke C: dashboard screenshot → browser_inspect', () => {
  const msg = 'Screenshot my dashboard login page';
  const lane = classifyAgentExecutionLane(msg, { requestedMode: 'agent' });
  assert.equal(lane.primary_lane, 'browser_inspect');
  assert.equal(messageRequestsOpenWebSearch(msg), false);
});

test('smoke D: repo symbol → workspace_grep', () => {
  const msg = 'Find resolveModelForTask in my repo';
  const lane = classifyAgentExecutionLane(msg, { requestedMode: 'agent' });
  assert.equal(lane.primary_lane, 'workspace_grep');
  assert.equal(messageRequestsOpenWebSearch(msg), false);
});

test('smoke E: agentsam table question → internal knowledge', () => {
  const msg = 'What does agentsam_routing_arms do?';
  const lane = classifyAgentExecutionLane(msg, { requestedMode: 'agent' });
  assert.equal(lane.primary_lane, 'internal_knowledge_search');
  assert.equal(messageRequestsInternalKnowledge(msg), true);
  assert.equal(messageRequestsOpenWebSearch(msg), false);
});

test('smoke F: simple greeting → no open web', () => {
  assert.equal(isSimpleGreeting('Hello!'), true);
  assert.equal(messageRequestsOpenWebSearch('Hello!'), false);
  const lane = classifyAgentExecutionLane('Hello!', { requestedMode: 'agent' });
  assert.notEqual(lane.primary_lane, 'open_web_search');
});

test('smoke G: backend label tavily only with TAVILY_API_KEY', () => {
  assert.equal(hasTavilyApiKey({ TAVILY_API_KEY: 'tvly-test' }), true);
  assert.equal(resolveOpenWebBackendLabel({ TAVILY_API_KEY: 'tvly-test' }), 'tavily');
  assert.equal(resolveOpenWebBackendLabel({ SEARCH_API_KEY: 'legacy-only' }), 'search_api');
  assert.equal(resolveOpenWebBackendLabel({}), 'none');
});
