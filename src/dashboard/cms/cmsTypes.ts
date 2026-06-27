/**
 * Dashboard CMS types — re-export canonical contracts from src/types/cms.ts.
 * Add dashboard-only prop types here; do not duplicate API shapes.
 */
import type { CmsWorkspaceSite } from '../../../dashboard/hooks/useCmsWorkspaceContext';

export type {
  CmsAgentLoopStep,
  CmsAgentPublishResponse,
  CmsAgentReadResponse,
  CmsAgentSaveInjectedResponse,
  CmsAgentSavePageHtmlResponse,
  CmsAgentVerifyLiveChecks,
  CmsAgentVerifyLiveResponse,
  CmsApiProfile,
  CmsBootstrapData,
  CmsHostingMode,
  CmsHtmlExcerpt,
  CmsPage,
  CmsPageDetailResponse,
  CmsPageSection,
  CmsPageStatus,
  CmsPreviewMode,
  CmsPreviewUrls,
  CmsPublishPhase,
  CmsPublishResponse,
  CmsSaveDraftResponse,
  CmsSection,
  CmsSectionStatus,
  CmsTenant,
  CmsWorkspaceContext,
} from '../../types/cms';

export {
  CMS_PRIMETECH_AGENT_LOOP,
  CMS_PUBLISH_PHASE_LABEL,
  inferCmsPublishPhase,
  toCmsSection,
} from '../../types/cms';

/** @deprecated Use CmsPage from src/types/cms.ts */
export type CmsBootstrapPage = import('../../types/cms').CmsPage;

/** @deprecated Use CmsPageSection from src/types/cms.ts */
export type CmsBootstrapSection = import('../../types/cms').CmsPageSection;

export type CmsView =
  | 'sites'
  | 'pages'
  | 'templates'
  | 'imports'
  | 'online-store'
  | 'theme-editor';

export type CmsSiteRow = CmsWorkspaceSite & { id?: string };

export type HeroFields = {
  eyebrow: string;
  headline: string;
  subheadline: string;
  heroImageUrl: string;
  primaryCtaLabel: string;
  primaryCtaLink: string;
  secondaryCtaLabel: string;
  secondaryCtaLink: string;
};

export type PrimeTechCmsLiteProps = {
  workspaceId?: string;
  workspaceLabel?: string | null;
  workspaceSlug?: string | null;
  publicDomain?: string | null;
  sites?: CmsSiteRow[];
  primaryProjectSlug?: string | null;
  loadingSites?: boolean;
  sitesError?: string | null;
  onRetrySites?: () => void;
  view?: CmsView;
  projectSlug?: string | null;
  pageId?: string | null;
  studioPanel?: string;
  addToPageId?: string | null;
  loadingProject?: boolean;
  projectError?: string | null;
  onNavigatePath?: (path: string) => void;
  onOpenDeployWizard?: () => void;
};
