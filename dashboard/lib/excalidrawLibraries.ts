/** Excalidraw library catalog + hydration (draw_libraries D1 + .excalidrawlib URLs). */

export type DrawLibraryRow = {
  slug: string;
  name: string;
  filename?: string;
  category?: string;
  icon?: string;
  public_url?: string;
  r2_dev_url?: string;
  auto_load?: number | boolean;
  agent_tags?: string;
  description?: string;
  item_count?: number;
  enabled?: boolean;
  pinned?: boolean;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ExcalidrawLibraryItem = any;

export async function fetchDrawLibraryCatalog(): Promise<DrawLibraryRow[]> {
  const res = await fetch('/api/draw/libraries', { credentials: 'same-origin' });
  if (!res.ok) return [];
  const data = (await res.json()) as { libraries?: DrawLibraryRow[] };
  return Array.isArray(data.libraries) ? data.libraries : [];
}

export async function fetchDrawLibraryPrefs(): Promise<{ slug: string; enabled: boolean; pinned: boolean }[]> {
  const res = await fetch('/api/draw/library-prefs', { credentials: 'same-origin' });
  if (!res.ok) return [];
  const data = (await res.json()) as { prefs?: { slug: string; enabled: boolean; pinned: boolean }[] };
  return Array.isArray(data.prefs) ? data.prefs : [];
}

export async function saveDrawLibraryPrefs(
  slugs: string[],
): Promise<void> {
  await fetch('/api/draw/library-prefs', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled_slugs: slugs }),
  });
}

export async function fetchLibraryItemsBySlug(slug: string): Promise<ExcalidrawLibraryItem[]> {
  const res = await fetch('/api/draw/library', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { libraryItems?: ExcalidrawLibraryItem[] };
  return Array.isArray(data.libraryItems) ? data.libraryItems : [];
}

function parseLibraryPayload(raw: unknown): ExcalidrawLibraryItem[] {
  if (!raw || typeof raw !== 'object') return [];
  const o = raw as Record<string, unknown>;
  const items = o.libraryItems ?? o.library ?? o.items;
  return Array.isArray(items) ? items : [];
}

export async function fetchLibraryItemsFromUrl(url: string): Promise<ExcalidrawLibraryItem[]> {
  const trimmed = url.trim();
  if (!trimmed) return [];
  const res = await fetch(trimmed, { credentials: 'omit' });
  if (!res.ok) return [];
  try {
    const json = await res.json();
    return parseLibraryPayload(json);
  } catch {
    return [];
  }
}

/** Merge library item arrays by id (later wins). */
export function mergeLibraryItemArrays(
  ...groups: ExcalidrawLibraryItem[][]
): ExcalidrawLibraryItem[] {
  const byId = new Map<string, ExcalidrawLibraryItem>();
  for (const group of groups) {
    for (const item of group) {
      const id = String(item?.id ?? '').trim();
      if (id) byId.set(id, item);
    }
  }
  return [...byId.values()];
}

/** Resolve which slugs to load: user prefs > auto_load defaults. */
export function resolveEnabledLibrarySlugs(
  catalog: DrawLibraryRow[],
  prefs: { slug: string; enabled: boolean }[],
): string[] {
  const prefMap = new Map(prefs.map((p) => [p.slug, p.enabled]));
  if (prefMap.size > 0) {
    return catalog.filter((row) => prefMap.get(row.slug) === true).map((r) => r.slug);
  }
  return catalog.filter((row) => row.auto_load === 1 || row.auto_load === true).map((r) => r.slug);
}

export async function hydrateLibraryItemsForSlugs(
  catalog: DrawLibraryRow[],
  slugs: string[],
): Promise<ExcalidrawLibraryItem[]> {
  const slugSet = new Set(slugs);
  const targets = catalog.filter((row) => slugSet.has(row.slug));
  const batches = await Promise.all(
    targets.map(async (row) => {
      const url = row.public_url || row.r2_dev_url || '';
      if (!url) return fetchLibraryItemsBySlug(row.slug);
      return fetchLibraryItemsFromUrl(url);
    }),
  );
  return mergeLibraryItemArrays(...batches);
}
