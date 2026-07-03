/** File source rail icons — `/public/icons/fs-sources/` (Simple Icons + local.svg). */
export type FsSourceIconId = 'local' | 'react' | 'r2' | 'github' | 'drive' | 'container';

export const FS_SOURCE_ICON_META: Record<
  FsSourceIconId,
  { src: string; label: string; title: string }
> = {
  local: {
    src: '/icons/fs-sources/local.svg',
    label: 'Local',
    title: 'Local folder (native File System Access)',
  },
  react: {
    src: '/icons/fs-sources/react.svg',
    label: 'React',
    title: 'Workspace React repo (GitHub tree)',
  },
  r2: {
    src: '/icons/fs-sources/r2.svg',
    label: 'R2',
    title: 'Cloudflare R2 object storage',
  },
  github: {
    src: '/icons/fs-sources/github.svg',
    label: 'GitHub',
    title: 'GitHub repositories',
  },
  drive: {
    src: '/icons/fs-sources/googledrive.svg',
    label: 'Drive',
    title: 'Google Drive',
  },
  container: {
    src: '/icons/fs-sources/container.svg',
    label: 'Sandbox',
    title: 'CF container sandbox workspace',
  },
};

/** Default display size for the source rail (CSS px). */
export const FS_SOURCE_ICON_PX = 20;
