import React from 'react';
import type { RulesSkillsTabId } from '../hooks/useSettingsSections';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { RulesSkillsDrawers } from '../components/RulesSkillsDrawers';
import { RulesSkillsSkillsTab } from '../components/rulesSkills/RulesSkillsSkillsTab';
import { RulesSkillsSubagentsTab } from '../components/rulesSkills/RulesSkillsSubagentsTab';
import { RulesSkillsCommandsTab } from '../components/rulesSkills/RulesSkillsCommandsTab';
import { RulesSkillsRulesTab } from '../components/rulesSkills/RulesSkillsRulesTab';

export type RulesSkillsSectionProps = {
  data: SettingsPanelModel;
  rulesSkillsTab: RulesSkillsTabId;
  setRulesSkillsTab: (t: RulesSkillsTabId) => void;
};

export function RulesSkillsSection({ data, rulesSkillsTab, setRulesSkillsTab }: RulesSkillsSectionProps) {
  return (
    <div className="flex flex-col gap-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
          Rules &amp; Skills
        </h2>
        <div className="flex items-center gap-2">
          {rulesSkillsTab === 'skills' ? (
            <button
              type="button"
              onClick={() => {
                data.setEditingSkill(null);
                data.setSkillDraft({
                  name: '',
                  description: '',
                  content_markdown: '',
                  slash_trigger: '',
                  globs: '',
                  always_apply: false,
                  tags: '',
                });
                data.setSkillDrawerOpen(true);
              }}
              className="px-3 py-1.5 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30"
            >
              New Skill
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {(['skills', 'subagents', 'commands', 'rules'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setRulesSkillsTab(t)}
            className={`px-3 py-1.5 rounded-lg text-[11px] border transition-colors ${
              rulesSkillsTab === t
                ? 'border-[var(--solar-cyan)]/40 text-[var(--solar-cyan)] bg-[var(--solar-cyan)]/10'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
            }`}
          >
            {t === 'skills'
              ? 'Skills'
              : t === 'subagents'
                ? 'Subagents'
                : t === 'commands'
                  ? 'Commands'
                  : 'Rules'}
          </button>
        ))}
      </div>

      {rulesSkillsTab === 'skills' && <RulesSkillsSkillsTab data={data} />}
      {rulesSkillsTab === 'subagents' && <RulesSkillsSubagentsTab data={data} />}
      {rulesSkillsTab === 'commands' && <RulesSkillsCommandsTab data={data} />}
      {rulesSkillsTab === 'rules' && <RulesSkillsRulesTab data={data} />}

      <RulesSkillsDrawers data={data} />
    </div>
  );
}
