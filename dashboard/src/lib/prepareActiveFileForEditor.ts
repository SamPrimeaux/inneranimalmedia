import type { ActiveFile } from '../../types';
import { detectFileKind, isBinaryFile, truncateContentForMonaco } from './fileKind';

const BINARY_PREVIEW_MESSAGE = 'Binary file — preview not available in the editor.';

/** Gate explorer/chat opens so Monaco never receives binary bodies or misclassified SQL dumps. */
export function prepareActiveFileForEditor(file: ActiveFile): ActiveFile {
  const kind =
    file.fileKind ||
    (file.isImage
      ? 'image'
      : file.isBinary
        ? 'binary'
        : detectFileKind({
            name: file.name,
            key: file.r2Key,
            contentType: file.contentType,
            size: file.size,
          }));

  if (kind === 'text' && !isBinaryFile(file.name, file.size ?? null)) {
    const originalContent = file.originalContent ?? file.content;
    const { content, truncated, originalSize } = truncateContentForMonaco(file.content ?? '');
    if (truncated) {
      return {
        ...file,
        fileKind: 'truncated',
        content,
        originalContent,
        originalSize: originalSize ?? file.originalSize,
      };
    }
    return { ...file, fileKind: 'text', originalContent, content };
  }

  const previewKind = kind === 'text' ? 'binary' : kind === 'unknown' ? 'binary' : kind;

  return {
    ...file,
    fileKind: previewKind,
    content: '',
    originalContent: '',
    isBinary: true,
    isImage: previewKind === 'image',
    binaryMessage: file.binaryMessage ?? BINARY_PREVIEW_MESSAGE,
  };
}
