import { detectFileKind } from '../fileKind';
import type { LibraryDisplayKind } from './types';

export function inferDisplayKind(input: {
  name: string;
  mimeType?: string | null;
  artifactType?: string | null;
  isFolder?: boolean;
}): LibraryDisplayKind {
  if (input.isFolder) return 'folder';

  const artifactType = String(input.artifactType || '').toLowerCase();
  const name = input.name || '';

  if (artifactType.includes('glb') || artifactType === '3d' || /\.(glb|gltf)$/i.test(name)) return 'glb';
  if (artifactType === 'html' || artifactType.includes('markdown') || artifactType === 'document') return 'doc';

  const fk = detectFileKind({ name, contentType: input.mimeType ?? undefined });
  if (fk === 'image') return 'photo';
  if (fk === 'pdf') return 'pdf';
  if (fk === 'video') return 'video';
  if (/\.(py|js|ts|tsx|jsx|sql|css|json|sh|yaml|yml)$/i.test(name)) return 'spark';

  return 'doc';
}
