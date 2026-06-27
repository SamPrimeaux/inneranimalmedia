import type { CmsWorkspaceSite } from '../../../dashboard/hooks/useCmsWorkspaceContext';

export type CmsView =
  | 'sites'
  | 'pages'
  | 'templates'
  | 'imports'
  | 'online-store'
  | 'theme-editor';

export type CmsSiteRow = CmsWorkspaceSite & { id?: string };

export type CmsBootstrapPage = {
  id: string;
  title?: string;
  slug?: string;
  route_path?: string;
  status?: string;
  is_homepage?: boolean | number;
  updated_at?: string;
  published_at?: string;
  seo_title?: string;
  meta_description?: string;
  page_type?: string;
  robots?: string;
};

export type CmsBootstrapSection = {
  id: string;
  page_id?: string;
  section_type?: string;
  section_name?: string;
  section_data?: unknown;
  is_visible?: boolean | number;
};

export type CmsBootstrapData = {
  pages?: CmsBootstrapPage[];
  sections_by_page?: Record<string, CmsBootstrapSection[]>;
  sections?: CmsBootstrapSection[];
  themes?: unknown[];
  assets_3d?: unknown[];
  assets?: unknown[];
  imports?: unknown[];
  active_theme?: { name?: string; slug?: string } | null;
  tenant?: { domain?: string | null; name?: string | null } | null;
  page?: CmsBootstrapPage | null;
};

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
