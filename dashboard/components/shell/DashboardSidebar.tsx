/**
 * Phase 1 shell sidebar — Claude-shaped core nav + Code / Create / Collaborate products.
 */
import { useEffect, useState, type ComponentType, type FC } from 'react';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Code2,
  FolderKanban,
  Layers,
  MessageSquare,
  Palette,
  PanelLeft,
  PanelLeftClose,
  Plus,
  SlidersHorizontal,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SHELL_CORE_NAV, SHELL_PRODUCTS, type ShellProductId } from '../../config/shellNav';
import {
  isCoreRouteActive,
  isProductItemActive,
  resolveActiveProduct,
} from '../../lib/shellNavResolve';
import { ActivityRailItem } from './DashboardActivityNav';

const PRODUCT_ICONS: Record<ShellProductId, ComponentType<{ size?: number; className?: string }>> = {
  code: Code2,
  create: Palette,
  collaborate: CalendarDays,
};

type DashboardSidebarProps = {
  expanded: boolean;
  onToggleExpanded?: () => void;
  onItemActivate?: () => void;
  onNewChat?: () => void;
  onOpenChats?: () => void;
  onOpenMovieMode?: () => void;
  userLabel?: string | null;
  planLabel?: string | null;
};

const CoreIcon: FC<{ id: string; size?: number }> = ({ id, size = 18 }) => {
  const props = { size, strokeWidth: 1, className: 'shrink-0' };
  if (id === 'new-chat') return <Plus {...props} />;
  if (id === 'chats') return <MessageSquare {...props} />;
  if (id === 'projects') return <FolderKanban {...props} />;
  if (id === 'artifacts') return <Layers {...props} />;
  if (id === 'customize') return <SlidersHorizontal {...props} />;
  return <Layers {...props} />;
};

export function DashboardSidebar({
  expanded,
  onToggleExpanded,
  onItemActivate,
  onNewChat,
  onOpenChats,
  onOpenMovieMode,
  userLabel,
  planLabel,
}: DashboardSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeProduct = resolveActiveProduct(location.pathname);
  const [expandedProduct, setExpandedProduct] = useState<ShellProductId | null>(activeProduct);

  useEffect(() => {
    setExpandedProduct(activeProduct);
  }, [activeProduct]);

  const go = (path: string) => {
    navigate(path);
    onItemActivate?.();
  };

  const toggleProduct = (id: ShellProductId) => {
    setExpandedProduct((cur) => (cur === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-0.5">
      <div className="flex flex-col gap-0.5 shrink-0 pb-1 mb-0.5 border-b border-[var(--dashboard-border)]/60">
        <button
          type="button"
          title={expanded ? 'Collapse navigation' : 'Expand navigation'}
          aria-expanded={expanded}
          onClick={() => onToggleExpanded?.()}
          className={`relative flex w-full min-h-[40px] shrink-0 items-center rounded-lg transition-colors ${
            expanded ? 'gap-2.5 px-2 justify-start' : 'justify-center px-0'
          } text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]/60`}
        >
          {expanded ? <PanelLeftClose size={20} strokeWidth={1} /> : <PanelLeft size={18} strokeWidth={1} />}
          {expanded ? (
            <span className="min-w-0 truncate text-left text-[12px] font-medium leading-tight">Collapse</span>
          ) : null}
        </button>
      </div>
      <div className="flex flex-col gap-0.5 shrink-0">
        {SHELL_CORE_NAV.map((item) => {
          if (item.kind === 'action') {
            const active = false;
            return (
              <button
                key={item.id}
                type="button"
                title={item.label}
                onClick={() => {
                  if (item.action === 'new-chat') onNewChat?.();
                  else if (item.action === 'open-chats') onOpenChats?.();
                  onItemActivate?.();
                }}
                className={`relative flex w-full min-h-[40px] shrink-0 items-center rounded-lg transition-colors ${
                  expanded ? 'gap-2.5 px-2 justify-start' : 'justify-center px-0'
                } text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]/60`}
              >
                <CoreIcon id={item.id} size={expanded ? 20 : 18} />
                {expanded ? (
                  <span className="min-w-0 truncate text-left text-[12px] font-medium leading-tight">
                    {item.label}
                  </span>
                ) : null}
                {active ? (
                  <div
                    className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-md bg-[var(--solar-cyan)]"
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          }
          const active = isCoreRouteActive(location.pathname, item.path, item.match ?? 'exact');
          return (
            <button
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => go(item.path)}
              className={`relative flex w-full min-h-[40px] shrink-0 items-center rounded-lg transition-colors ${
                expanded ? 'gap-2.5 px-2 justify-start' : 'justify-center px-0'
              } ${active ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]/60'}`}
            >
              {active ? (
                <div
                  className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-md bg-[var(--solar-cyan)]"
                  aria-hidden
                />
              ) : null}
              <CoreIcon id={item.id} size={expanded ? 20 : 18} />
              {expanded ? (
                <span className="min-w-0 truncate text-left text-[12px] font-medium leading-tight">
                  {item.label}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {expanded ? (
        <div className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] opacity-70">
          Products
        </div>
      ) : (
        <div className="my-1 mx-2 border-t border-[var(--dashboard-border)]" aria-hidden />
      )}

      <div className="flex flex-col gap-0.5 shrink-0">
        {SHELL_PRODUCTS.map((product) => {
          const ProductIcon = PRODUCT_ICONS[product.id];
          const productActive = activeProduct === product.id;
          const isOpen = expandedProduct === product.id;

          return (
            <div key={product.id} className="flex flex-col">
              <div className={`flex items-center ${expanded ? 'pr-1' : ''}`}>
                <ActivityRailItem
                  icon={ProductIcon}
                  label={product.label}
                  expanded={expanded}
                  active={productActive}
                  onClick={() => {
                    go(product.home);
                    setExpandedProduct(product.id);
                  }}
                />
                {expanded ? (
                  <button
                    type="button"
                    className="shrink-0 p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]/60"
                    aria-label={isOpen ? `Collapse ${product.label}` : `Expand ${product.label}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleProduct(product.id);
                    }}
                  >
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                ) : null}
              </div>
              {expanded && isOpen ? (
                <div className="ml-3 pl-2 border-l border-[var(--dashboard-border)]/80 flex flex-col gap-0.5 mb-1">
                  {product.items.map((child) => {
                    const childActive = child.path
                      ? isProductItemActive(location.pathname, child)
                      : false;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => {
                          if (child.path) go(child.path);
                        }}
                        className={`flex items-center gap-2 w-full text-left min-h-[32px] px-2 rounded-md text-[11px] font-medium transition-colors ${
                          childActive
                            ? 'text-[var(--solar-cyan)] bg-[var(--bg-hover)]/50'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]/40'
                        }`}
                      >
                        {child.id === 'moviemode' ? (
                          <Clapperboard size={13} strokeWidth={1.5} className="shrink-0 opacity-80" />
                        ) : null}
                        <span className="truncate">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {expanded ? (
        <>
          <div className="px-2 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] opacity-70">
            Starred
          </div>
          <p className="px-2 pb-2 text-[10px] leading-snug text-[var(--text-muted)] opacity-80">
            Pin chats and artifacts — coming soon.
          </p>
          <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)] opacity-70">
            Recents
          </div>
          <p className="px-2 pb-2 text-[10px] leading-snug text-[var(--text-muted)] opacity-80">
            Recent sessions appear in Chats.
          </p>
        </>
      ) : null}

      <div className="mt-auto pt-2 border-t border-[var(--dashboard-border)] shrink-0">
        <button
          type="button"
          onClick={() => go('/dashboard/settings/general')}
          className={`w-full flex items-center rounded-lg transition-colors hover:bg-[var(--bg-hover)]/60 ${
            expanded ? 'gap-2.5 px-2 py-2 justify-start' : 'justify-center py-2'
          }`}
          title="Account & settings"
        >
          <div
            className="shrink-0 w-7 h-7 rounded-full bg-[var(--bg-hover)] border border-[var(--dashboard-border)] flex items-center justify-center text-[11px] font-semibold text-[var(--text-main)]"
            aria-hidden
          >
            {(userLabel || 'A').charAt(0).toUpperCase()}
          </div>
          {expanded ? (
            <div className="min-w-0 text-left">
              <div className="text-[12px] font-medium text-[var(--text-main)] truncate">
                {userLabel?.trim() || 'Account'}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">{planLabel || 'Workspace'}</div>
            </div>
          ) : null}
        </button>
      </div>
    </div>
  );
}
