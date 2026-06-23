/** Resolve Database Studio path for the active workspace (named URL when collab D1 exists). */
export function databaseStudioPathFromName(databaseName?: string | null): string {
  const name = databaseName?.trim();
  if (name) return `/dashboard/database/${encodeURIComponent(name)}`;
  return '/dashboard/database';
}

export function databaseStudioPathForWorkspace(row?: {
  database_studio_name?: string | null;
  slug?: string | null;
} | null): string {
  const fromCatalog = row?.database_studio_name?.trim();
  if (fromCatalog) return databaseStudioPathFromName(fromCatalog);
  const slug = row?.slug?.trim();
  if (slug && slug !== 'inneranimalmedia' && slug !== 'inneranimalmedia-mcp') {
    return databaseStudioPathFromName(slug);
  }
  return '/dashboard/database';
}
