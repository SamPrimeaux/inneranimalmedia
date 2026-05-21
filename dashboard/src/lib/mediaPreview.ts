import type { ActiveFile } from '../../types';
import { detectFileKind, isBinaryFile, type FileKind } from './fileKind';

const BINARY_PREVIEW_MESSAGE = 'Binary file — preview not available in the editor.';

/** Gate explorer/chat opens so Monaco never receives binary bodies or misclassified SQL dumps. */
export function prepareActiveFileForEditor(file: ActiveFile): ActiveFile {
  const kind =
    file.fileKind ||
    (file.isImage ? 'image' : file.isBinary ? 'binary' : detectFileKind({
      name: file.name,
      key: file.r2Key,
      contentType: file.contentType,
      size: file.size,
    }));

  if (kind === 'text' && !isBinaryFile(file.name, file.size ?? null)) {
    const originalContent = file.originalContent ?? file.content;
    return { ...file, fileKind: 'text', originalContent };
  }

  const previewKind: FileKind =
    kind === 'text' ? 'binary' : kind === 'unknown' ? 'binary' : kind;

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

export function buildR2ObjectUrl(bucket: string, key: string): string {
  return `/api/r2/buckets/${encodeURIComponent(bucket)}/object/${encodeURIComponent(key)}`;
}

export function buildR2FileMetaUrl(bucket: string, key: string): string {
  const qs = new URLSearchParams({ bucket, key });
  return `/api/r2/file?${qs}`;
}

export type R2FileMetaResponse = {
  bucket?: string;
  key?: string;
  content?: string;
  contentType?: string;
  size?: number;
  fileKind?: FileKind;
  isImage?: boolean;
  isBinary?: boolean;
  previewUrl?: string;
  url?: string;
  message?: string;
};

export function activeFileFromPreview(input: {
  name: string;
  kind: FileKind;
  previewUrl: string;
  contentType?: string | null;
  size?: number | null;
  r2Key?: string;
  r2Bucket?: string;
  localObjectUrl?: string;
  workspacePath?: string;
  handle?: FileSystemFileHandle;
  binaryMessage?: string;
}): ActiveFile {
  const isImage = input.kind === 'image';
  const isBinary = input.kind !== 'text';
  return {
    name: input.name,
    content: '',
    originalContent: '',
    fileKind: input.kind,
    isImage,
    isBinary,
    previewUrl: input.previewUrl,
    contentType: input.contentType || undefined,
    size: input.size ?? undefined,
    r2Key: input.r2Key,
    r2Bucket: input.r2Bucket,
    workspacePath: input.workspacePath,
    handle: input.handle,
    binaryMessage: input.binaryMessage,
    localObjectUrl: input.localObjectUrl,
  };
}

export function activeFileFromText(input: {
  name: string;
  content: string;
  r2Key?: string;
  r2Bucket?: string;
  workspacePath?: string;
  handle?: FileSystemFileHandle;
  githubPath?: string;
  githubRepo?: string;
  githubSha?: string;
  githubBranch?: string;
  driveFileId?: string;
}): ActiveFile {
  return {
    name: input.name,
    content: input.content,
    originalContent: input.content,
    fileKind: 'text',
    workspacePath: input.workspacePath,
    handle: input.handle,
    r2Key: input.r2Key,
    r2Bucket: input.r2Bucket,
    githubPath: input.githubPath,
    githubRepo: input.githubRepo,
    githubSha: input.githubSha,
    githubBranch: input.githubBranch,
    driveFileId: input.driveFileId,
  };
}

export async function fetchR2FileMeta(bucket: string, key: string): Promise<R2FileMetaResponse | null> {
  const qs = new URLSearchParams({ bucket, key });
  const res = await fetch(`/api/r2/file?${qs}`, { credentials: 'same-origin' });
  const data = (await res.json().catch(() => ({}))) as R2FileMetaResponse;
  if (!res.ok) return null;
  return data;
}

export function resolveKindFromR2Meta(
  data: R2FileMetaResponse,
  name: string,
  key: string,
): FileKind {
  if (data.fileKind) return data.fileKind;
  if (data.isImage) return 'image';
  if (data.isBinary) {
    const k = detectFileKind({
      key,
      name,
      contentType: data.contentType,
      size: data.size,
    });
    return k === 'text' ? 'binary' : k;
  }
  return detectFileKind({ key, name, contentType: data.contentType, size: data.size });
}

export async function openR2KeyInEditor(
  bucket: string,
  key: string,
  onOpen: (file: ActiveFile) => void,
): Promise<boolean> {
  const base = key.split('/').pop() || key;
  const data = await fetchR2FileMeta(bucket, key);
  if (!data) return false;

  const kind = resolveKindFromR2Meta(data, base, key);
  const bucketName = data.bucket || bucket;
  const streamUrl = buildR2ObjectUrl(bucketName, key);
  const previewUrl = data.previewUrl || streamUrl;

  if (kind !== 'text') {
    onOpen(
      activeFileFromPreview({
        name: base,
        kind,
        previewUrl,
        contentType: data.contentType,
        size: data.size,
        r2Key: key,
        r2Bucket: bucketName,
        binaryMessage: data.message,
      }),
    );
    return true;
  }

  if (typeof data.content !== 'string') return false;
  onOpen(
    activeFileFromText({
      name: base,
      content: data.content,
      r2Key: key,
      r2Bucket: bucketName,
    }),
  );
  return true;
}

export async function openLocalFileInEditor(
  file: File,
  handle: FileSystemFileHandle | undefined,
  workspacePath: string,
  onOpen: (file: ActiveFile) => void,
): Promise<void> {
  const kind = detectFileKind({
    name: file.name,
    contentType: file.type,
    size: file.size,
  });

  if (kind !== 'text') {
    const objectUrl = URL.createObjectURL(file);
    onOpen(
      activeFileFromPreview({
        name: file.name,
        kind,
        previewUrl: objectUrl,
        contentType: file.type,
        size: file.size,
        workspacePath,
        handle,
        localObjectUrl: objectUrl,
      }),
    );
    return;
  }

  const content = await file.text();
  onOpen(
    activeFileFromText({
      name: file.name,
      content,
      workspacePath,
      handle,
    }),
  );
}
