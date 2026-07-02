import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isChatImageUpload,
  chatUploadHasVisionImages,
  buildVisionUserMessage,
  applyVisionBlocksToChatMessages,
  chatMessagesHaveVisionUpload,
  collectChatVisionUploadFiles,
  resolveImageHandlingMode,
  parseChatVisionFiles,
  resolveChatVisionUpload,
  visionErrorUserMessage,
  IMAGE_HANDLING_MODES,
  VISION_ERROR_CODES,
  MAX_CHAT_IMAGE_BYTES,
} from '../../src/core/chat-composer-attachments.js';

test('isChatImageUpload detects mime and extension', () => {
  assert.equal(isChatImageUpload({ type: 'image/png', name: 'x.bin' }), true);
  assert.equal(isChatImageUpload({ type: '', name: 'photo.jpeg' }), true);
  assert.equal(isChatImageUpload({ type: 'text/plain', name: 'notes.txt' }), false);
});

test('collectChatVisionUploadFiles merges images and files', () => {
  const png = { type: 'image/png', name: 'a.png', size: 10 };
  const txt = { type: 'text/plain', name: 'b.txt', size: 5 };
  const body = { images: [png], files: [png, txt] };
  const collected = collectChatVisionUploadFiles(body);
  assert.equal(collected.length, 1);
  assert.equal(collected[0].name, 'a.png');
});

test('chatUploadHasVisionImages', () => {
  assert.equal(chatUploadHasVisionImages([{ type: 'image/webp', name: 'a' }]), true);
  assert.equal(chatUploadHasVisionImages([{ type: 'application/pdf', name: 'a.pdf' }]), false);
});

test('resolveImageHandlingMode defaults to ephemeral', () => {
  assert.equal(resolveImageHandlingMode({}, 'what do you see?'), IMAGE_HANDLING_MODES.EPHEMERAL_VISION);
});

test('resolveImageHandlingMode detects persisted and temporary intents', () => {
  assert.equal(
    resolveImageHandlingMode({}, 'save this to the project'),
    IMAGE_HANDLING_MODES.PERSISTED_ASSET,
  );
  assert.equal(
    resolveImageHandlingMode({}, 'keep this screenshot in context while debugging'),
    IMAGE_HANDLING_MODES.TEMPORARY_CONTEXT,
  );
});

test('parseChatVisionFiles rejects empty candidate list', async () => {
  const out = await parseChatVisionFiles([]);
  assert.equal(out.ok, false);
  assert.equal(out.code, VISION_ERROR_CODES.NO_IMAGE_FILE_IN_REQUEST);
});

test('parseChatVisionFiles rejects unsupported mime', async () => {
  const file = {
    type: 'image/svg+xml',
    name: 'diagram.svg',
    size: 100,
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  };
  const out = await parseChatVisionFiles([file]);
  assert.equal(out.ok, false);
  assert.equal(out.code, VISION_ERROR_CODES.UNSUPPORTED_IMAGE_MIME);
});

test('parseChatVisionFiles accepts png upload', async () => {
  const file = {
    type: 'image/png',
    name: 'shot.png',
    size: 4,
    arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer,
  };
  const out = await parseChatVisionFiles([file]);
  assert.equal(out.ok, true);
  assert.equal(out.blocks.length, 1);
  assert.equal(out.blocks[0].source.media_type, 'image/png');
});

test('parseChatVisionFiles rejects oversized image', async () => {
  const file = {
    type: 'image/jpeg',
    name: 'big.jpg',
    size: MAX_CHAT_IMAGE_BYTES + 1,
    arrayBuffer: async () => new Uint8Array(MAX_CHAT_IMAGE_BYTES + 1).buffer,
  };
  const out = await parseChatVisionFiles([file]);
  assert.equal(out.ok, false);
  assert.equal(out.code, VISION_ERROR_CODES.IMAGE_TOO_LARGE);
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

test('resolveChatVisionUpload ephemeral does not require env storage', async () => {
  const file = {
    type: 'image/png',
    name: 'a.png',
    size: 4,
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  };
  const vision = await resolveChatVisionUpload(
    { images: [file], image_handling_mode: 'ephemeral_vision' },
    { message: 'describe this' },
  );
  assert.equal(vision.ok, true);
  assert.equal(vision.mode, IMAGE_HANDLING_MODES.EPHEMERAL_VISION);
  assert.equal(vision.blocks.length, 1);
});

test('visionErrorUserMessage maps codes', () => {
  assert.match(
    visionErrorUserMessage(VISION_ERROR_CODES.IMAGE_TOO_LARGE),
    /too large/i,
  );
});
