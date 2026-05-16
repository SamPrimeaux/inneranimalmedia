/**
 * Shared file classification for R2 API + dashboard (keep in sync with dashboard/src/lib/fileKind.ts).
 */

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp', 'ico']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'm4v', 'avi', 'mkv']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac']);
const TEXT_EXT = new Set([
  'txt', 'md', 'json', 'jsonl', 'js', 'jsx', 'ts', 'tsx', 'css', 'html', 'htm', 'xml',
  'yml', 'yaml', 'sql', 'py', 'sh', 'env', 'toml', 'ini', 'csv', 'tsv', 'liquid',
  'mjs', 'cjs', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'vue', 'svelte', 'graphql', 'gql',
  'wrangler',
]);

const LARGE_BINARY_BYTES = 512 * 1024;

function extFromName(name, key) {
  const raw = String(name || key || '').split(/[?#]/)[0];
  const dot = raw.lastIndexOf('.');
  if (dot < 0) return '';
  return raw.slice(dot + 1).toLowerCase();
}

function ctBase(contentType) {
  return String(contentType || '').split(';')[0].trim().toLowerCase();
}

/** @returns {'text'|'image'|'video'|'audio'|'pdf'|'binary'|'unknown'} */
export function detectFileKind({ key, name, contentType, size }) {
  const ext = extFromName(name, key);
  const ct = ctBase(contentType);

  if (ct.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';
  if (ct.startsWith('video/') || VIDEO_EXT.has(ext)) return 'video';
  if (ct.startsWith('audio/') || AUDIO_EXT.has(ext)) return 'audio';
  if (ct === 'application/pdf' || ext === 'pdf') return 'pdf';

  if (
    ct.startsWith('text/') ||
    ct === 'application/json' ||
    ct === 'application/xml' ||
    ct === 'application/javascript' ||
    ct === 'application/typescript' ||
    ct === 'application/x-yaml' ||
    ct === 'application/yaml' ||
    ct === 'application/sql' ||
    TEXT_EXT.has(ext)
  ) {
    return 'text';
  }

  if (ct === 'application/octet-stream') return 'binary';

  if (!ct && (IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext) || AUDIO_EXT.has(ext))) {
    if (IMAGE_EXT.has(ext)) return 'image';
    if (VIDEO_EXT.has(ext)) return 'video';
    return 'audio';
  }

  if (size != null && size > LARGE_BINARY_BYTES && !TEXT_EXT.has(ext)) return 'binary';

  if (ext && !TEXT_EXT.has(ext) && ct && !ct.startsWith('text/')) return 'binary';

  return 'unknown';
}

export function isEditableTextKind(kind) {
  return kind === 'text';
}
