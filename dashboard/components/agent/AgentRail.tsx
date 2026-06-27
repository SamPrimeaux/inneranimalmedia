import {
  PanelLeft,
  Plus,
  Search,
  Bell,
  Folder,
  Code2,
  Briefcase,
  Palette,
  ChevronDown,
  Download,
} from 'lucide-react';
import './AgentRail.css';

interface AgentRailProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNavigate: (target: string) => void;
  userInitials: string;
  hasUpdate?: boolean;
}

const RAIL_ITEMS = [
  { id: 'new', icon: Plus, label: 'New', target: '/dashboard/agent' },
  { id: 'search', icon: Search, label: 'Search', target: '?search=1' },
  { id: 'notifications', icon: Bell, label: 'Notifications', target: '?notifications=1' },
  { id: 'workspace', icon: Folder, label: 'Workspace', target: '/dashboard/agent/workspace' },
  { id: 'editor', icon: Code2, label: 'Editor', target: '/dashboard/agent/editor' },
  { id: 'systems', icon: Briefcase, label: 'Systems', target: '/dashboard/agent/systems' },
  { id: 'examples', icon: Palette, label: 'Examples', target: '/dashboard/agent/examples' },
];

export function AgentRail({
  collapsed,
  onToggleCollapsed,
  onNavigate,
  userInitials,
  hasUpdate,
}: AgentRailProps) {
  return (
    <nav className="agent-rail" aria-label="Agent navigation">
      <button
        type="button"
        className="agent-rail__btn agent-rail__btn--active"
        onClick={onToggleCollapsed}
        aria-label={collapsed ? 'Expand layout' : 'Collapse layout'}
        aria-pressed={!collapsed}
      >
        <PanelLeft size={18} strokeWidth={1.5} />
      </button>

      <div className="agent-rail__items">
        {RAIL_ITEMS.map(({ id, icon: Icon, label, target }) => (
          <button
            key={id}
            type="button"
            className="agent-rail__btn"
            aria-label={label}
            onClick={() => onNavigate(target)}
          >
            <Icon size={18} strokeWidth={1.5} />
          </button>
        ))}
      </div>

      <button type="button" className="agent-rail__btn" aria-label="More">
        <ChevronDown size={16} strokeWidth={1.5} />
      </button>

      <div className="agent-rail__footer">
        <button type="button" className="agent-rail__btn" aria-label="Download">
          <Download size={18} strokeWidth={1.5} />
          {hasUpdate && <span className="agent-rail__dot" />}
        </button>
        <div className="agent-rail__avatar" aria-label="Account">
          {userInitials}
        </div>
      </div>
    </nav>
  );
}
