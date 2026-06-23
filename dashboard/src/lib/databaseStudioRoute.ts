/** Resolve Database Studio path for the active workspace (named URL when collab D1 exists). */
export function databaseStudioPathFromName(databaseName?: string | null): string {
  const name = databaseName?.trim();
  if (name) return `/dashboard/database/${encodeURIComponent(name)}`;
  return '/dashboard/database';
}

/** Collab D1 database_name for this workspace, if any. */
export function expectedDatabaseNameForWorkspace(row?: {
  database_studio_name?: string | null;
  slug?: string | null;
  github_repo?: string | null;
} | null): string | null {
  const fromCatalog = row?.database_studio_name?.trim();
  if (fromCatalog) return fromCatalog;
  const slug = row?.slug?.trim();
  if (slug && slug !== 'inneranimalmedia' && slug !== 'inneranimalmedia-mcp') {
    return slug;
  }
  const repo = row?.github_repo?.trim();
  if (repo) {
    const short = repo.includes('/') ? repo.split('/').pop()?.trim() : repo;
    if (short && short !== 'inneranimalmedia') return short;
  }
  return null;
}

export function databaseStudioPathForWorkspace(row?: {
  database_studio_name?: string | null;
  slug?: string | null;
  github_repo?: string | null;
} | null): string {
  const name = expectedDatabaseNameForWorkspace(row);
  if (name) return databaseStudioPathFromName(name);
  return '/dashboard/database';
}

export function isPlatformWorkspace(row?: { slug?: string | null; id?: string | null } | null): boolean {
  const slug = row?.slug?.trim().toLowerCase();
  const id = row?.id?.trim().toLowerCase();
  return slug === 'inneranimalmedia' || slug === 'inneranimalmedia-mcp' || id === 'ws_inneranimalmedia';
}

/** Workspace collab R2 bucket name when not on platform workspace. */
export function expectedR2BucketForWorkspace(row?: {
  database_studio_name?: string | null;
  slug?: string | null;
  github_repo?: string | null;
} | null): string | null {
  if (isPlatformWorkspace(row)) return null;
  return expectedDatabaseNameForWorkspace(row);
}
