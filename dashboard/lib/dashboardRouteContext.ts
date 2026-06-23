import type { AgentWorkspaceContextPacket } from '../src/ideWorkspace';
import type { CmsWorkspaceContext } from '../hooks/useCmsWorkspaceContext';

export type DashboardRouteQuickAction = {
  id: string;
  label: string;
  message: string;
  route_key?: string;
  task_type?: string;
};

export type DashboardRouteAgentContext = {
  route_key: string;
  context_label: string;
  contextMode: string;
  workspaceContext: Partial<AgentWorkspaceContextPacket>;
  quickActions: DashboardRouteQuickAction[];
};

function normalizePath(pathname: string): string {
  const p = String(pathname || '').trim() || '/dashboard/agent';
  return p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Route-aware AgentSam context — Cursor-equivalent wiring per /dashboard/* surface.
 */
export function resolveDashboardRouteAgentContext(opts: {
  pathname: string;
  search?: string;
  workspaceId?: string | null;
  cmsContext?: CmsWorkspaceContext | null;
  activeTab?: string;
  browserUrl?: string | null;
  openFiles?: string[];
  planId?: string | null;
}): DashboardRouteAgentContext {
  const path = normalizePath(opts.pathname);
  const search = opts.search || '';
  const ws = (opts.workspaceId || '').trim();
  const basePacket: Partial<AgentWorkspaceContextPacket> = {
    activeTab: opts.activeTab || 'Workspace',
    browserUrl: opts.browserUrl?.trim() || null,
    openFiles: opts.openFiles || [],
    plan_id: opts.planId || null,
    workflow_run_id: null,
  };

  if (path.startsWith('/dashboard/cms')) {
    const cms = opts.cmsContext;
    const slug = cms?.project_slug || null;
    const isClientWorker = cms?.cms_hosting === 'client_worker';
    const apiProfile = cms?.api_profile || '';
    const routeKey =
      apiProfile === 'fuel_admin'
        ? 'fuel_cms_admin'
        : isClientWorker
          ? 'cms_client_worker'
          : 'cms_edit';
    return {
      route_key: routeKey,
      context_label: slug
        ? `CMS · ${cms?.project_name || slug}${isClientWorker ? ' (client worker)' : ''}`
        : 'CMS · pick a site',
      contextMode: isClientWorker ? 'cms_client_worker' : 'cms_platform',
      workspaceContext: {
        ...basePacket,
        project_slug: slug,
        bootstrap_cache_key: slug && ws ? `cms:bootstrap:${ws}:${slug}` : null,
      },
      quickActions: isClientWorker
        ? [
            {
              id: 'fuel-list-pages',
              label: 'List CMS pages',
              message: 'List all CMS pages for this client worker site using the bridge admin API.',
              route_key: 'fuel_cms_admin',
              task_type: 'cms_schema',
            },
            {
              id: 'fuel-publish-check',
              label: 'Verify publish path',
              message: 'Explain the D1 → R2 → KV publish contract for this client worker CMS site.',
              route_key: 'fuel_cms_admin',
            },
          ]
        : [
            {
              id: 'cms-list-pages',
              label: 'List pages',
              message: 'List CMS pages for the active PrimeTech site in this workspace.',
              route_key: 'cms_edit',
              task_type: 'cms_schema',
            },
            {
              id: 'cms-bootstrap',
              label: 'Bootstrap context',
              message: 'Load CMS bootstrap KV context for the active site and summarize editable pages.',
              route_key: 'cms_edit',
            },
          ],
    };
  }

  if (path.startsWith('/dashboard/designstudio')) {
    return {
      route_key: 'design_studio',
      context_label: 'Design Studio',
      contextMode: 'design_studio',
      workspaceContext: basePacket,
      quickActions: [
        {
          id: 'ds-scene',
          label: 'Scene help',
          message: 'Help me with the active Design Studio scene — materials, lighting, and export.',
          route_key: 'design_studio',
        },
      ],
    };
  }

  if (path.startsWith('/dashboard/database')) {
    return {
      route_key: 'database_studio',
      context_label: 'Database Studio',
      contextMode: 'database',
      workspaceContext: basePacket,
      quickActions: [
        {
          id: 'db-schema',
          label: 'Schema overview',
          message: 'Summarize the schema for my connected database in this workspace.',
          route_key: 'database_studio',
          task_type: 'database_schema',
        },
      ],
    };
  }

  if (path.startsWith('/dashboard/workflows')) {
    return {
      route_key: 'workflows',
      context_label: 'Workflows',
      contextMode: 'workflows',
      workspaceContext: basePacket,
      quickActions: [],
    };
  }

  if (path.startsWith('/dashboard/agent')) {
    const tab = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('tab');
    const cms = opts.cmsContext;
    const slug = cms?.project_slug || null;
    const ws = (opts.workspaceId || '').trim();
    const cmsPacket: Partial<AgentWorkspaceContextPacket> = slug
      ? {
          project_slug: slug,
          bootstrap_cache_key: ws ? `cms:bootstrap:${ws}:${slug}` : null,
          preview_url: cms?.public_domain
            ? `https://${cms.public_domain}`
            : cms?.worker_base_url || null,
          public_domain: cms?.public_domain || null,
          cms_hosting: cms?.cms_hosting || null,
          api_profile: cms?.api_profile || null,
          capabilities: ['cms'],
        }
      : {};
    return {
      route_key: tab === 'examples' ? 'agent_examples' : 'agent_sam',
      context_label: slug
        ? tab === 'examples'
          ? 'Agent · Examples'
          : `Agent · Workbench · CMS ${cms?.project_name || slug}`
        : tab === 'examples'
          ? 'Agent · Examples'
          : 'Agent · Workbench',
      contextMode: 'agent',
      workspaceContext: { ...basePacket, ...cmsPacket },
      quickActions: slug
        ? cms?.cms_hosting === 'client_worker'
          ? [
              {
                id: 'agent-fuel-list-pages',
                label: 'List CMS pages',
                message: 'List all CMS pages for this client worker site using the bridge admin API.',
                route_key: 'fuel_cms_admin',
                task_type: 'cms_schema',
              },
            ]
          : [
              {
                id: 'agent-cms-list-pages',
                label: 'List CMS pages',
                message: 'List CMS pages for the active PrimeTech site in this workspace.',
                route_key: 'cms_edit',
                task_type: 'cms_schema',
              },
            ]
        : [],
    };
  }

  return {
    route_key: 'dashboard',
    context_label: 'Dashboard',
    contextMode: 'dashboard',
    workspaceContext: basePacket,
    quickActions: [],
  };
}
