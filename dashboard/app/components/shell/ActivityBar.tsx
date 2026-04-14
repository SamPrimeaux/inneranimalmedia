import React from 'react';
import { 
  Search, GitBranch, Cloud, Database, Monitor, 
  PenTool, Box, LayoutGrid, Landmark, Calendar, 
  Mail, Video, Image, Clock, Settings, Bell,
  HelpCircle, MoreHorizontal
} from 'lucide-react';
import { DashboardRoute } from '../../hooks/useWorkbench';

interface ActivityBarProps {
  activeRoute: DashboardRoute;
  onNavigate: (route: DashboardRoute) => void;
  onSearchToggle: () => void;
  onSettingsToggle: () => void;
  notificationCount?: number;
}

export const ActivityBar: React.FC<ActivityBarProps> = ({
  activeRoute,
  onNavigate,
  onSearchToggle,
  onSettingsToggle,
  notificationCount = 0
}) => {
  return (
    <aside className="w-14 shrink-0 bg-[var(--bg-app)] border-r border-[var(--border-subtle)] flex flex-col items-center py-4 gap-4 z-50">
      
      {/* ── IDE TOOLS (Top) ────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2">
        <ActivityIcon icon={Monitor} title="Agent Workspace" active={activeRoute === 'agent'} onClick={() => onNavigate('agent')} />
        <ActivityIcon icon={Cloud}   title="Cloud Storage"   active={activeRoute === 'cloud'} onClick={() => onNavigate('cloud')} />
        <ActivityIcon icon={GitBranch} title="Source Control" active={false} onClick={() => {}} />
        <ActivityIcon icon={Database} title="Database"       active={false} onClick={() => {}} />
        <ActivityIcon icon={PenTool}  title="Design/Draw"    active={false} onClick={() => {}} />
        <ActivityIcon icon={Box}      title="3D Studio"     active={false} onClick={() => {}} />
      </div>

      <div className="w-6 h-[1px] bg-[var(--border-subtle)] my-1" />

      {/* ── DASHBOARD PAGES (Middle) ───────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-2">
        <ActivityIcon icon={LayoutGrid} title="Overview" active={activeRoute === 'overview'} onClick={() => onNavigate('overview')} />
        <ActivityIcon icon={Landmark}   title="Finance"  active={activeRoute === 'finance'}  onClick={() => onNavigate('finance')} />
        <ActivityIcon icon={Calendar}   title="Calendar" active={activeRoute === 'calendar'} onClick={() => onNavigate('calendar')} />
        <ActivityIcon icon={Mail}       title="Mail"     active={activeRoute === 'mail'}     onClick={() => onNavigate('mail')} />
        <ActivityIcon icon={Video}      title="Meet"     active={activeRoute === 'meet'}     onClick={() => onNavigate('meet')} />
        <ActivityIcon icon={Image}      title="Assets"   active={activeRoute === 'images'}   onClick={() => onNavigate('images')} />
        <ActivityIcon icon={Clock}      title="Time"     active={activeRoute === 'time-tracking'} onClick={() => onNavigate('time-tracking')} />
        <ActivityIcon icon={Settings}   title="CMS"      active={activeRoute === 'cms'}      onClick={() => onNavigate('cms')} />
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 mt-auto">
        <ActivityIcon icon={Bell} title="Notifications" active={false} onClick={() => {}} badge={notificationCount} />
        <ActivityIcon icon={HelpCircle} title="Help" active={false} onClick={() => {}} />
        <ActivityIcon icon={MoreHorizontal} title="More" active={false} onClick={onSettingsToggle} />
      </div>

    </aside>
  );
};

interface IconProps {
  icon: any;
  title: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}

const ActivityIcon: React.FC<IconProps> = ({ icon: Icon, title, active, onClick, badge }) => (
  <button
    onClick={onClick}
    title={title}
    className={`relative group w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 ${
      active 
        ? 'bg-[var(--solar-cyan)]/10 text-[var(--solar-cyan)] shadow-[0_0_15px_rgba(45,212,191,0.1)]' 
        : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-hover)]'
    }`}
  >
    <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
    {active && <div className="absolute left-[-15px] w-[3px] h-6 bg-[var(--solar-cyan)] rounded-r-full" />}
    {badge > 0 && (
      <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-[var(--solar-red)] text-white text-[8px] font-bold rounded-full flex items-center justify-center">
        {badge > 9 ? '9+' : badge}
      </span>
    )}
  </button>
);
