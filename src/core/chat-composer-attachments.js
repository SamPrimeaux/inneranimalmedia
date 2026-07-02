/**
 * Composer multipart uploads (`files` in /api/agent/chat) → vision message blocks.
 */

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i;
/** Anthropic / OpenAI practical inline limit (~5 MB). */
const MAX_CHAT_IMAGE_BYTES = 4_500_000;

function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function guessImageMime(name) {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  return 'image/png';
}

/** @param {unknown} file */
export function isChatImageUpload(file) {
  if (!file || typeof file !== 'object') return false;
  const type = String(file.type || '').trim();
  if (type && /^image\//i.test(type)) return true;
  return IMAGE_EXT_RE.test(String(file.name || ''));
}

/** @param {unknown} files */
export function chatUploadHasVisionImages(files) {
  const arr = Array.isArray(files) ? files : [];
  return arr.some(isChatImageUpload);
}

/**
 * @param {unknown} files
 * @returns {Promise<Array<{ type: 'image', source: { type: 'base64', media_type: string, data: string }, _filename?: string }>>}
 */
export async function parseChatComposerImageBlocks(files) {
  const arr = Array.isArray(files) ? files : [];
  const blocks = [];
  for (const file of arr) {
    if (!isChatImageUpload(file)) continue;
    let buf;
    try {
      if (typeof file.arrayBuffer === 'function') {
        buf = await file.arrayBuffer();
      } else if (file instanceof ArrayBuffer) {
        buf = file;
      } else if (file instanceof Uint8Array) {
        buf = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
      } else {
        continue;
      }
    } catch {
      continue;
    }
    if (!buf || buf.byteLength === 0) continue;
    if (buf.byteLength > MAX_CHAT_IMAGE_BYTES) {
      console.warn(
        '[chat-composer-attachments] image_too_large',
        JSON.stringify({ name: file.name, bytes: buf.byteLength }),
      );
      continue;
    }
    const media_type =
      String(file.type || '').trim() || guessImageMime(file.name) || 'image/png';
    blocks.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type,
        data: bytesToBase64(new Uint8Array(buf)),
      },
      _filename: String(file.name || 'image').trim() || 'image',
    });
  }
  return blocks;
}

/**
 * @param {string} message
 * @param {Array<{ type: string, source?: { type?: string, media_type?: string, data?: string }, _filename?: string }>} imageBlocks
 */
export function buildVisionUserMessage(message, imageBlocks) {
  const text = String(message || '').trim() || 'The user attached image(s) for you to analyze.';
  const textBlock = { type: 'text', text };
  const images = (imageBlocks || []).map(({ _filename, ...block }) => block);
  return {
    role: 'user',
    content: [textBlock, ...images],
  };
}

/**
 * @param {Array<{ role?: string, content?: unknown }>} chatMessages
 * @param {string} fallbackText
 * @param {Awaited<ReturnType<typeof parseChatComposerImageBlocks>>} imageBlocks
 */
export function applyVisionBlocksToChatMessages(chatMessages, fallbackText, imageBlocks) {
  const next = Array.isArray(chatMessages) ? [...chatMessages] : [];
  const built = buildVisionUserMessage(fallbackText, imageBlocks);
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i]?.role === 'user') {
      next[i] = built;
      return next;
    }
  }
  next.push(built);
  return next;
}

/** @param {unknown} content */
export function userMessageHasVisionContent(content) {
  return (
    Array.isArray(content) &&
    content.some((b) => b && typeof b === 'object' && b.type === 'image' && b.source?.data)
  );
}

/** @param {Array<{ role?: string, content?: unknown }>} chatMessages */
export function chatMessagesHaveVisionUpload(chatMessages) {
  return (Array.isArray(chatMessages) ? chatMessages : []).some(
    (m) => m?.role === 'user' && userMessageHasVisionContent(m.content),
  );
}
