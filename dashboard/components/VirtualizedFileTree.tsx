import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Folder,
  Loader2,
} from 'lucide-react';
import {
  LOCAL_TREE_ROW_HEIGHT_PX,
  type LocalFileTreeRow,
} from '../src/lib/localFileTree';
import { SetiFileIcon } from '../src/components/SetiFileIcon';

const OVERSCAN = 10;

export type VirtualizedFileTreeProps = {
  rows: LocalFileTreeRow[];
  rowHeight?: number;
  className?: string;
  maxHeight?: string;
  onRowClick: (row: LocalFileTreeRow) => void;
};

export const VirtualizedFileTree: React.FC<VirtualizedFileTreeProps> = ({
  rows,
  rowHeight = LOCAL_TREE_ROW_HEIGHT_PX,
  className = '',
  maxHeight = 'min(45vh, 480px)',
  onRowClick,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const [viewportH, setViewportH] = useState(320);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewportH(el.clientHeight || 320);
    });
    ro.observe(el);
    setViewportH(el.clientHeight || 320);
    return () => ro.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollTopRef.current = el.scrollTop;
    setScrollTop(el.scrollTop);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (Math.abs(el.scrollTop - scrollTopRef.current) > 1) {
      el.scrollTop = scrollTopRef.current;
    }
  }, [rows]);

  const totalH = rows.length * rowHeight;
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewportH) / rowHeight) + OVERSCAN);
  const paddingTop = start * rowHeight;
  const paddingBottom = Math.max(0, totalH - paddingTop - (end - start) * rowHeight);
  const slice = rows.slice(start, end);

  if (!rows.length) {
    return (
      <p className="px-2 py-2 text-[10px] text-muted">Empty folder</p>
    );
  }

  const entryCount = rows.filter((r) => r.type === 'entry').length;

  return (
    <div className="flex flex-col min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`overflow-auto overscroll-contain ${className}`}
        style={{ maxHeight }}
        role="tree"
        aria-label="Local files"
      >
        <div style={{ height: totalH, position: 'relative' }}>
          <div style={{ paddingTop, paddingBottom }}>
            {slice.map((row) => {
              if (row.type === 'loading') {
                return (
                  <div
                    key={row.id}
                    role="treeitem"
                    style={{
                      height: rowHeight,
                      paddingLeft: `${row.depth * 10 + 8}px`,
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-muted"
                  >
                    <Loader2 size={12} className="animate-spin shrink-0" aria-hidden />
                    <span>{row.label}</span>
                  </div>
                );
              }

              if (row.type === 'empty') {
                return (
                  <div
                    key={row.id}
                    role="treeitem"
                    aria-disabled
                    style={{
                      height: rowHeight,
                      paddingLeft: `${row.depth * 10 + 8}px`,
                    }}
                    className="flex items-center gap-1.5 text-[11px] italic text-muted cursor-default select-none"
                  >
                    <span className="w-3.5 shrink-0" aria-hidden />
                    <span>{row.label}</span>
                  </div>
                );
              }

              const { node, depth } = row;
              const isDir = node.kind === 'directory';

              return (
                <button
                  key={row.id}
                  type="button"
                  role="treeitem"
                  aria-expanded={isDir ? !!node.isOpen : undefined}
                  onClick={() => onRowClick(row)}
                  style={{
                    height: rowHeight,
                    paddingLeft: `${depth * 10 + 8}px`,
                  }}
                  className="flex w-full items-center gap-1.5 pr-2 text-left text-[13px] text-main hover:bg-[var(--bg-hover)] border-none bg-transparent font-inherit cursor-pointer"
                >
                  {isDir ? (
                    <>
                      {node.isOpen ? (
                        <ChevronDown size={14} className="shrink-0 text-muted opacity-50" aria-hidden />
                      ) : (
                        <ChevronRight size={14} className="shrink-0 text-muted opacity-50" aria-hidden />
                      )}
                      <Folder size={14} className="shrink-0 text-[var(--solar-blue)]" aria-hidden />
                    </>
                  ) : (
                    <>
                      <span className="w-3.5 shrink-0" aria-hidden />
                      <SetiFileIcon filename={node.name} size={14} />
                    </>
                  )}
                  <span className="truncate" title={node.name}>
                    {node.name}
                  </span>
                  {isDir && node.loading ? (
                    <Loader2 size={12} className="ml-auto shrink-0 animate-spin text-muted" aria-hidden />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <p className="shrink-0 px-2 py-0.5 text-[9px] text-muted border-t border-[var(--border-subtle)]/40">
        {entryCount.toLocaleString()} visible
        {entryCount > 500 ? ' — expand folders as needed' : ''}
      </p>
    </div>
  );
};
