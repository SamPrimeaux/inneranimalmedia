import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isChatImageUpload,
  chatUploadHasVisionImages,
  buildVisionUserMessage,
  applyVisionBlocksToChatMessages,
  chatMessagesHaveVisionUpload,
} from '../../src/core/chat-composer-attachments.js';

test('isChatImageUpload detects mime and extension', () => {
  assert.equal(isChatImageUpload({ type: 'image/png', name: 'x.bin' }), true);
  assert.equal(isChatImageUpload({ type: '', name: 'photo.jpeg' }), true);
  assert.equal(isChatImageUpload({ type: 'text/plain', name: 'notes.txt' }), false);
});

test('chatUploadHasVisionImages', () => {
  assert.equal(chatUploadHasVisionImages([{ type: 'image/webp', name: 'a' }]), true);
  assert.equal(chatUploadHasVisionImages([{ type: 'application/pdf', name: 'a.pdf' }]), false);
});

test('buildVisionUserMessage merges text and image blocks', () => {
  const blocks = [
    {
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'abc' },
      _filename: 'shot.png',
    },
  ];
  const msg = buildVisionUserMessage('Describe this', blocks);
  assert.equal(msg.role, 'user');
  assert.ok(Array.isArray(msg.content));
  assert.equal(msg.content[0].type, 'text');
  assert.equal(msg.content[1].type, 'image');
  assert.equal(msg.content[1]._filename, undefined);
});

test('applyVisionBlocksToChatMessages replaces last user turn', () => {
  const next = applyVisionBlocksToChatMessages(
    [{ role: 'assistant', content: 'hi' }, { role: 'user', content: 'look' }],
    'look',
    [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'x' } }],
  );
  assert.equal(next.length, 2);
  assert.ok(Array.isArray(next[1].content));
});

test('chatMessagesHaveVisionUpload detects image blocks', () => {
  assert.equal(
    chatMessagesHaveVisionUpload([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'abc' } },
        ],
      },
    ]),
    true,
  );
});
