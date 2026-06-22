import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GalleryItem } from './cadStudioTypes';

type AssetRow = {
  id?: string;
  label?: string;
  public_url?: string;
  thumbnail_url?: string;
  scale?: number;
  created_at?: number;
};

type JobRow = {
  id: string;
  engine?: string;
  prompt?: string;
  public_url?: string | null;
  result_url?: string | null;
  status?: string;
  created_at?: number;
};

type MeshyTaskRow = {
  id?: string;
  task_id?: string;
  prompt?: string;
  public_url?: string;
  thumbnail_url?: string;
  status?: string;
  created_at?: number;
};

function normalizeUrl(url?: string | null): string {
  if (!url) return '';
  return String(url).trim();
}

function dedupeGallery(items: GalleryItem[]): GalleryItem[] {
  const seen = new Set<string>();
  const out: GalleryItem[] = [];
  for (const item of items) {
    const key = item.url || item.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

export function useStudioGallery() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'asset' | 'job' | 'meshy'>('all');
  const [page, setPage] = useState(0);
  const pageSize = 12;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [assetsRes, jobsRes, meshyRes] = await Promise.all([
        fetch('/api/designstudio/assets?category=3d_studio_user&is_live=1', { credentials: 'include' }),
        fetch('/api/cad/jobs?limit=50', { credentials: 'include' }),
        fetch('/api/cad/meshy/tasks?page_size=20', { credentials: 'include' }),
      ]);

      const merged: GalleryItem[] = [];

      if (assetsRes.ok) {
        const data = await assetsRes.json();
        const rows = Array.isArray(data?.results) ? data.results : [];
        for (const row of rows as AssetRow[]) {
          const url = normalizeUrl(row.public_url);
          if (!url) continue;
          merged.push({
            id: String(row.id || url),
            name: String(row.label || row.id || 'Asset'),
            url,
            thumbnail: row.thumbnail_url,
            source: 'asset',
            scale: typeof row.scale === 'number' ? row.scale : 1,
            createdAt: row.created_at,
          });
        }
      }

      if (jobsRes.ok) {
        const data = await jobsRes.json();
        const rows = Array.isArray(data?.jobs) ? data.jobs : [];
        for (const row of rows as JobRow[]) {
          const url = normalizeUrl(row.public_url || row.result_url);
          if (!url) continue;
          const st = String(row.status || '').toLowerCase();
          if (st !== 'done' && st !== 'complete') continue;
          merged.push({
            id: `job_${row.id}`,
            name: row.prompt?.slice(0, 48) || `${row.engine || 'CAD'} export`,
            url,
            source: 'job',
            createdAt: row.created_at,
          });
        }
      }

      if (meshyRes.ok) {
        const data = await meshyRes.json();
        const rows = Array.isArray(data?.tasks) ? data.tasks : Array.isArray(data?.results) ? data.results : [];
        for (const row of rows as MeshyTaskRow[]) {
          const url = normalizeUrl(row.public_url);
          if (!url) continue;
          merged.push({
            id: `meshy_${row.task_id || row.id || url}`,
            name: row.prompt?.slice(0, 48) || 'Meshy task',
            url,
            thumbnail: row.thumbnail_url,
            source: 'meshy',
            createdAt: row.created_at,
          });
        }
      }

      const deduped = dedupeGallery(merged);
      setItems(deduped);
      if (deduped.length === 0) {
        console.info('[CAD Studio Assets] No GLBs found in designstudio/assets, cad/jobs, or meshy/tasks');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((item) => {
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      if (!q) return true;
      return item.name.toLowerCase().includes(q) || item.url.toLowerCase().includes(q);
    });
  }, [items, filter, sourceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);

  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  return {
    items: pageItems,
    total: filtered.length,
    loading,
    error,
    filter,
    setFilter,
    sourceFilter,
    setSourceFilter,
    page,
    setPage,
    pageCount,
    refresh,
  };
}
