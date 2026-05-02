import React, { useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { SLUG_TO_LABEL, LABEL_TO_SLUG, DEFAULT_SLUG, DEFAULT_LABEL } from './settingsConstants';
import { Package } from 'lucide-react';
import { useSettingsData } from './hooks/useSettingsData';
import { useSettingsSections } from './hooks/useSettingsSections';
import { SectionNav } from './components/SectionNav';
import { initialsFromDisplayName, formatPlanLabel } from './settingsUi';
import { GeneralSection } from './sections/GeneralSection';
import { AgentsSection } from './sections/AgentsSection';
import { AIModelsSection } from './sections/AIModelsSection';
import { ToolsMcpSection } from './sections/ToolsMcpSection';
import { RulesSkillsSection } from './sections/RulesSkillsSection';
import { WorkspaceSection } from './sections/WorkspaceSection';
import { HooksSection } from './sections/HooksSection';
import { GitHubSection } from './sections/GitHubSection';
import { CiCdSection } from './sections/CiCdSection';
import { NetworkSection } from './sections/NetworkSection';
import { ThemesSection } from './sections/ThemesSection';
import { StorageSection } from './sections/StorageSection';
import { SecuritySection } from './sections/SecuritySection';
import { PlanUsageSection } from './sections/PlanUsageSection';
import { NotificationsSection } from './sections/NotificationsSection';
import { DocsSection } from './sections/DocsSection';
import { IntegrationsSection } from './sections/IntegrationsSection';

export interface SettingsPanelProps {
  onClose: () => void;
  onFileSelect?: (file: { name: string; content: string }) => void;
  onOpenInMonaco?: (content: string, virtualPath: string) => void;
  workspaceId?: string | null;
}

export default function SettingsPanel({
  onClose,
  onFileSelect,
  onOpenInMonaco,
  workspaceId,
}: SettingsPanelProps) {
  const { sectionSlug } = useParams<{ sectionSlug: string }>();
  const navigateTo = useNavigate();
  const [searchParams] = useSearchParams();

  const resolvedLabel: string =
    sectionSlug && SLUG_TO_LABEL[sectionSlug] ? SLUG_TO_LABEL[sectionSlug] : DEFAULT_LABEL;

  const legacySection = searchParams.get('section');
  useEffect(() => {
    if (!legacySection) return;
    navigateTo(`/dashboard/settings/${LABEL_TO_SLUG[legacySection] ?? DEFAULT_SLUG}`, { replace: true });
  }, [legacySection, navigateTo]);

  const handleSectionSelect = (label: string) => {
    navigateTo(`/dashboard/settings/${LABEL_TO_SLUG[label] ?? DEFAULT_SLUG}`);
  };

  const nav = useSettingsSections(resolvedLabel);
  const data = useSettingsData({
    workspaceId,
    activeSection: nav.activeSection,
    rulesSkillsTab: nav.rulesSkillsTab,
    modelsTab: nav.modelsTab,
  });

  const sectionBody = () => {
    switch (resolvedLabel) {
      case 'General':
        return <GeneralSection />;
      case 'Agents':
        return <AgentsSection data={data} workspaceId={workspaceId} />;
      case 'AI Models':
        return (
          <AIModelsSection
            data={data}
            modelsTab={nav.modelsTab}
            setModelsTab={nav.setModelsTab}
          />
        );
      case 'Tools & MCP':
        return (
          <ToolsMcpSection
            data={data}
            onOpenInMonaco={onOpenInMonaco}
            onFileSelect={onFileSelect}
          />
        );
      case 'Rules & Skills':
        return (
          <RulesSkillsSection
            data={data}
            rulesSkillsTab={nav.rulesSkillsTab}
            setRulesSkillsTab={nav.setRulesSkillsTab}
          />
        );
      case 'Workspace':
        return <WorkspaceSection data={data} />;
      case 'Hooks':
        return <HooksSection data={data} />;
      case 'GitHub':
        return <GitHubSection repos={data.repos} />;
      case 'Integrations':
        return (
          <IntegrationsSection
            userId={data.profileEmail || null}
            onOpenInMonaco={onOpenInMonaco}
          />
        );
      case 'CI/CD':
        return <CiCdSection />;
      case 'Network':
        return <NetworkSection data={data} />;
      case 'Themes':
        return <ThemesSection workspaceId={workspaceId} />;
      case 'Storage':
        return <StorageSection />;
      case 'Security':
        return <SecuritySection data={data} />;
      case 'Plan & Usage':
        return <PlanUsageSection data={data} />;
      case 'Notifications':
        return <NotificationsSection data={data} />;
      case 'Docs':
        return (
          <DocsSection onOpenInMonaco={onOpenInMonaco} onFileSelect={onFileSelect} />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-[var(--text-muted)]">
            <Package size={28} className="opacity-30" />
            <p className="text-[12px]">{resolvedLabel} settings coming soon.</p>
          </div>
        );
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-panel)] text-[var(--text-main)] overflow-hidden">
      <div className="h-10 flex items-center justify-between px-4 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] shrink-0">
        <span className="font-semibold text-[12px] tracking-widest uppercase text-[var(--text-heading)]">
          Settings
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 hover:bg-[var(--bg-hover)] rounded transition-colors text-[var(--text-muted)] hover:text-[var(--text-heading)] text-[11px] uppercase tracking-wider"
        >
          Close
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {!nav.isMobile && (
          <div
            ref={nav.navRef}
            className="shrink-0 border-r border-[var(--border-subtle)] flex flex-col overflow-hidden relative"
            style={{ width: nav.navWidth }}
          >
            <div className="flex items-center gap-2.5 px-3 py-3 border-b border-[var(--border-subtle)]">
              <div className="w-7 h-7 rounded-full bg-[var(--solar-blue)] flex items-center justify-center text-[var(--toggle-knob)] font-bold text-[11px] shrink-0">
                {initialsFromDisplayName(data.profileDisplayName)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-[var(--text-heading)] truncate">
                  {data.profileDisplayName || data.profileEmail || '—'}
                </span>
                <span className="text-[10px] text-[var(--solar-cyan)]">
                  {formatPlanLabel(data.profilePlan)}
                </span>
              </div>
            </div>

            <SectionNav
              sections={nav.filteredMenu}
              activeSection={resolvedLabel}
              onSelect={handleSectionSelect}
              filter={nav.search}
              onFilterChange={nav.setSearch}
            />

            <div
              onMouseDown={nav.onNavDragStart}
              className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-[var(--border-subtle)]"
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
          {nav.isMobile && (
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-[12px] font-black uppercase tracking-widest text-[var(--text-heading)]">
                Section
              </div>
              <select
                value={resolvedLabel}
                onChange={(e) => handleSectionSelect(e.target.value)}
                className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-main)]"
              >
                {nav.filteredMenu.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sectionBody()}
        </div>
      </div>
    </div>
  );
}
