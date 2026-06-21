import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  chatSessionR2Prefix,
  execSessionR2Prefix,
  estimateMessagesTokens,
  buildChatDigestText,
  CHAT_COMPACT_TOKEN_THRESHOLD,
} from '../../src/core/exec-context-tier.js';

describe('exec-context-tier', () => {
  it('builds chat R2 prefix', () => {
    assert.equal(
      chatSessionR2Prefix({
        userId: 'au_871d920d1233cbd1',
        workspaceId: 'ws_inneranimalmedia',
        conversationId: 'conv_abc',
      }),
      'context/au_871d920d1233cbd1/ws_inneranimalmedia/chats/conv_abc',
    );
  });

  it('builds exec R2 prefix', () => {
    assert.equal(
      execSessionR2Prefix({
        tenantId: 'tenant_sam_primeaux',
        userId: 'au_871d920d1233cbd1',
        sessionId: 'sess_1',
      }),
      'context/tenant_sam_primeaux/au_871d920d1233cbd1/exec/sess_1',
    );
  });

  it('estimates message tokens and builds digest', () => {
    const messages = [
      { role: 'user', content: 'hello world' },
      { role: 'assistant', content: 'hi there' },
    ];
    const tokens = estimateMessagesTokens(messages);
    assert.ok(tokens > 0);
    assert.ok(tokens < CHAT_COMPACT_TOKEN_THRESHOLD);
    const digest = buildChatDigestText(messages);
    assert.match(digest, /\[USER\] hello world/);
    assert.match(digest, /\[ASSISTANT\] hi there/);
  });
});
