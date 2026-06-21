/**
 * Dashboard shell navigation — single source for sidebar + mobile drawer.
 * Phase 1: core rows, Code / Create / Collaborate product menus.
 */

export type ShellProductId = 'code' | 'create' | 'collaborate';

export type ShellCoreItem =
  | { id: string; kind: 'action'; label: string; action: 'new-chat' | 'open-chats' }
  | { id: string; kind: 'route'; label: string; path: string; match?: 'exact' | 'prefix' };

export type ShellProductItem = {
  id: string;
  label: string;
  path?: string;
  match?: 'exact' | 'prefix';
  action?: 'movie-mode';
  /** Nested sub-nav (Shopify-style parent → children). */
  children?: ShellProductItem[];
};

/** CMS Suite — workspace-scoped URLs (project resolved via /api/cms/workspace-context + agentsam_bootstrap) */
export const CMS_SUITE_NAV: ShellProductItem[] = [
  { id: 'cms-sites', label: 'Sites', path: '/dashboard/cms', match: 'exact' },
  { id: 'cms-editor', label: 'Pages', path: '/dashboard/cms/pages', match: 'prefix' },
  { id: 'cms-templates', label: 'Templates', path: '/dashboard/cms/templates', match: 'prefix' },
  { id: 'cms-imports', label: 'Imports', path: '/dashboard/cms/imports', match: 'prefix' },
];

export type ShellProduct = {
  id: ShellProductId;
  label: string;
  home: string;
  items: ShellProductItem[];
};

export const SHELL_CORE_NAV: ShellCoreItem[] = [
  { id: 'new-chat', kind: 'action', label: 'New chat', action: 'new-chat' },
  { id: 'chats', kind: 'action', label: 'Chats', action: 'open-chats' },
  { id: 'projects', kind: 'route', label: 'Projects', path: '/dashboard/projects', match: 'exact' },
  { id: 'artifacts', kind: 'route', label: 'Artifacts', path: '/dashboard/artifacts', match: 'exact' },
  {
    id: 'customize',
    kind: 'route',
    label: 'Customize',
    path: '/dashboard/settings/general',
    match: 'prefix',
  },
];

export const SHELL_PRODUCTS: ShellProduct[] = [
  {
    id: 'code',
    label: 'Code',
    home: '/dashboard/agent',
    items: [
      { id: 'agent', label: 'Agent', path: '/dashboard/agent', match: 'exact' },
      { id: 'examples', label: 'Examples', path: '/dashboard/agent/examples', match: 'exact' },
      { id: 'workflows', label: 'Workflows', path: '/dashboard/workflows', match: 'exact' },
      { id: 'database', label: 'Database', path: '/dashboard/database', match: 'exact' },
    ],
  },
  {
    id: 'create',
    label: 'Create',
    home: '/dashboard/designstudio',
    items: [
      { id: 'designstudio', label: 'Design Studio', path: '/dashboard/designstudio', match: 'exact' },
      { id: 'draw', label: 'Draw', path: '/dashboard/draw', match: 'exact' },
      {
        id: 'cms-suite',
        label: 'CMS Suite',
        path: '/dashboard/cms',
        match: 'prefix',
        children: CMS_SUITE_NAV,
      },
      { id: 'images', label: 'Images', path: '/dashboard/images', match: 'exact' },
      { id: 'moviemode', label: 'Movie Mode', path: '/dashboard/moviemode', match: 'prefix' },
    ],
  },
  {
    id: 'collaborate',
    label: 'Collaborate',
    home: '/dashboard/collaborate',
    items: [
      { id: 'calendar', label: 'Calendar', path: '/dashboard/collaborate', match: 'exact' },
      { id: 'mail', label: 'Mail', path: '/dashboard/mail', match: 'exact' },
      { id: 'meet', label: 'Meet', path: '/dashboard/meet', match: 'prefix' },
      { id: 'learn', label: 'Learn', path: '/dashboard/learn', match: 'exact' },
    ],
  },
];

/** Legacy paths → canonical (router redirects). */
export const SHELL_ROUTE_ALIASES: Record<string, string> = {
  '/dashboard/library': '/dashboard/artifacts',
  '/dashboard/launch-desk': '/dashboard/collaborate',
  '/dashboard/calendar': '/dashboard/collaborate',
};
