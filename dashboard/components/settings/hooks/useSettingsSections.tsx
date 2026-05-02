import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Cpu,
  Layers,
  Wrench,
  Cloud,
  Zap,
  GitBranch,
  Plug,
  Network,
  Palette,
  Database,
  Shield,
  BarChart2,
  Bell,
  BookOpen,
  Settings2,
} from 'lucide-react';
import type { NavSectionItem } from '../types';

export type RulesSkillsTabId = 'skills' | 'subagents' | 'commands' | 'rules';
export type ModelsTabId = 'models' | 'routing';

export function useSettingsSections(activeSection: string) {
  const [search, setSearch] = useState('');
  const navRef = useRef<HTMLDivElement>(null);
  const [navWidth, setNavWidth] = useState(() => {
    try {
      const v = localStorage.getItem('settings_nav_width');
      const n = v ? Number.parseInt(v, 10) : 220;
      return Number.isFinite(n) ? n : 220;
    } catch {
      return 220;
    }
  });
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false,
  );
  const [rulesSkillsTab, setRulesSkillsTab] = useState<RulesSkillsTabId>('skills');
  const [modelsTab, setModelsTab] = useState<ModelsTabId>('models');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const onNavDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX;
    const startW = navWidth;
    const onMove = (ev: MouseEvent) => {
      const w = Math.max(60, Math.min(360, startW + ev.clientX - startX));
      setNavWidth(w);
      if (w > 80) localStorage.setItem('settings_nav_width', String(w));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const menu = useMemo<NavSectionItem[]>(
    () => [
      { id: 'General', icon: <Settings2 size={14} /> },
      { id: 'Agents', icon: <Bot size={14} /> },
      { id: 'AI Models', icon: <Cpu size={14} /> },
      { id: 'Tools & MCP', icon: <Layers size={14} /> },
      { id: 'Rules & Skills', icon: <Wrench size={14} /> },
      { id: 'Workspace', icon: <Cloud size={14} /> },
      { id: 'Hooks', icon: <Zap size={14} /> },
      { id: 'GitHub', icon: <GitBranch size={14} /> },
      { id: 'Integrations', icon: <Plug size={14} /> },
      { id: 'CI/CD', icon: <Zap size={14} /> },
      { id: 'Network', icon: <Network size={14} /> },
      { id: 'Themes', icon: <Palette size={14} /> },
      { id: 'Storage', icon: <Database size={14} /> },
      { id: 'Security', icon: <Shield size={14} /> },
      { id: 'Plan & Usage', icon: <BarChart2 size={14} /> },
      { id: 'Notifications', icon: <Bell size={14} /> },
      { id: 'Docs', icon: <BookOpen size={14} /> },
    ],
    [],
  );

  const filteredMenu = menu.filter(
    (m) => !search || m.id.toLowerCase().includes(search.toLowerCase()),
  );

  return {
    activeSection,
    search,
    setSearch,
    navRef,
    navWidth,
    setNavWidth,
    onNavDragStart,
    isMobile,
    rulesSkillsTab,
    setRulesSkillsTab,
    modelsTab,
    setModelsTab,
    menu,
    filteredMenu,
  };
}
