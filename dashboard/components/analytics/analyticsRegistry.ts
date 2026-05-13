import { lazy } from 'react';

export interface AnalyticsTab {
  id: string;
  label: string;
  dataSources: string[];
  status: 'live' | 'beta' | 'coming_soon';
  component: React.LazyExoticComponent<any>;
}

export type AnalyticsTabId =
  | 'overview'
  | 'agent'
  | 'workers'
  | 'mcp'
  | 'models'
  | 'd1'
  | 'advisors'
  | 'deploys'
  | 'costs'
  | 'rag'
  | 'codebase';

export const ANALYTICS_TABS: Array<AnalyticsTab & { id: AnalyticsTabId }> = [
  {
    id: 'overview',
    label: 'Overview',
    status: 'live',
    dataSources: ['systemPulse', 'workflowRuns', 'toolCalls', 'errorInbox', 'deployHealth', 'dataHealth'],
    component: lazy(() => import('./tabs/OverviewTab')),
  },
  {
    id: 'agent',
    label: 'Agent',
    status: 'live',
    dataSources: ['workflowRuns', 'workflowGraph', 'dependencyGraph', 'executionPerf', 'errorInbox', 'guardrails', 'approvals', 'skills'],
    component: lazy(() => import('./tabs/AgentTab')),
  },
  {
    id: 'workers',
    label: 'Workers',
    status: 'live',
    dataSources: ['workersSummary', 'r2Inventory', 'dashboardVersions', 'dataHealth'],
    component: lazy(() => import('./tabs/WorkersTab')),
  },
  {
    id: 'mcp',
    label: 'MCP',
    status: 'live',
    dataSources: ['toolCalls'],
    component: lazy(() => import('./tabs/McpTab')),
  },
  {
    id: 'models',
    label: 'Models',
    status: 'live',
    dataSources: [
      'modelLeaderboard',
      'modelsDrift',
      'modelsPromptCache',
      'routingArms',
      'supabaseRoutingDecisions',
      'supabaseEvalRuns',
    ],
    component: lazy(() => import('./tabs/ModelsTab')),
  },
  {
    id: 'd1',
    label: 'D1 Telemetry',
    status: 'live',
    dataSources: ['executionPerf', 'dataHealth'],
    component: lazy(() => import('./tabs/D1TelemetryTab')),
  },
  {
    id: 'advisors',
    label: 'Advisors',
    status: 'live',
    dataSources: ['d1ErrorLog', 'advisorsFindings', 'advisorsGuardrails', 'dataHealth', 'supabaseErrorEvents'],
    component: lazy(() => import('./tabs/AdvisorsTab')),
  },
  {
    id: 'deploys',
    label: 'Deploys',
    status: 'live',
    dataSources: ['deployHealth', 'dashboardVersions'],
    component: lazy(() => import('./tabs/DeploysTab')),
  },
  {
    id: 'costs',
    label: 'Costs',
    status: 'live',
    dataSources: ['costTrend', 'modelLeaderboard', 'systemPulse', 'promptCache'],
    component: lazy(() => import('./tabs/CostsTab')),
  },
  {
    id: 'rag',
    label: 'RAG',
    status: 'live',
    dataSources: ['ragHealth'],
    component: lazy(() => import('./tabs/RagTab')),
  },
  {
    id: 'codebase',
    label: 'Codebase',
    status: 'live',
    dataSources: ['codebaseHealth'],
    component: lazy(() => import('./tabs/CodebaseTab')),
  },
];

