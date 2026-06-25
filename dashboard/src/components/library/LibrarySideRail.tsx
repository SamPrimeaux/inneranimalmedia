import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Lightbulb, NotebookPen, Plus, Users, X } from 'lucide-react';
import { collaborateDeepLink, type CollaborateRailPanel } from '../../lib/collaborate/collaborateRailNav';
import { CollaborateRailPanels } from '../collaborate/CollaborateRailPanels';

type RailItem = {
  id: CollaborateRailPanel;
  label: string;
  title: string;
  icon: 'calendar-badge' | 'keep' | 'notes' | 'contacts';
};

const RAIL_ITEMS: RailItem[] = [
  { id: 'calendar', label: 'Calendar', title: 'Calendar', icon: 'calendar-badge' },
  { id: 'keep', label: 'Keep', title: 'Keep', icon: 'keep' },
  { id: 'notes', label: 'Notes', title: 'Notes', icon: 'notes' },
  { id: 'contacts', label: 'Contacts', title: 'Contacts', icon: 'contacts' },
];

function CalendarBadgeIcon() {
  const { month, day, weekday } = useMemo(() => {
    const now = new Date();
    return {
      month: now.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
      day: String(now.getDate()),
      weekday: now.toLocaleDateString('en-US', { weekday: 'short' }),
    };
  }, []);

  return (
    <span className="rail-cal-badge" aria-hidden>
      <span className="rail-cal-month">{month}</span>
      <span className="rail-cal-day">{day}</span>
      <span className="sr-only">{weekday}</span>
    </span>
  );
}

function RailIcon({ kind }: { kind: RailItem['icon'] }) {
  if (kind === 'calendar-badge') return <CalendarBadgeIcon />;
  if (kind === 'keep') return <Lightbulb size={20} strokeWidth={1.75} className="rail-icon rail-icon--keep" />;
  if (kind === 'notes') return <NotebookPen size={20} strokeWidth={1.75} className="rail-icon rail-icon--notes" />;
  return <Users size={20} strokeWidth={1.75} className="rail-icon rail-icon--contacts" />;
}

export function LibrarySideRail({ onPanelChange }: { onPanelChange?: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<CollaborateRailPanel | null>(null);

  const togglePanel = (id: CollaborateRailPanel) => {
    setActivePanel((cur) => {
      const next = cur === id ? null : id;
      onPanelChange?.(next !== null);
      return next;
    });
  };

  const closePanel = () => {
    setActivePanel(null);
    onPanelChange?.(false);
  };

  const activeMeta = RAIL_ITEMS.find((r) => r.id === activePanel);

  return (
    <>
      {activePanel && activeMeta ? (
        <aside className="lib-rail-panel open" aria-label={`${activeMeta.title} panel`}>
          <div className="lib-rail-panel-head">
            <div>
              <span className="lib-rail-panel-kicker">{activeMeta.title.toUpperCase()}</span>
              <strong>{activeMeta.title}</strong>
            </div>
            <div className="lib-rail-panel-actions">
              <button
                type="button"
                className="icon-btn"
                title="Open in Collaborate"
                aria-label="Open in Collaborate"
                onClick={() => navigate(collaborateDeepLink(activePanel))}
              >
                <ExternalLink size={18} strokeWidth={1.75} />
              </button>
              <button type="button" className="icon-btn" onClick={closePanel} aria-label="Close panel">
                <X size={18} strokeWidth={1.75} />
              </button>
            </div>
          </div>
          <CollaborateRailPanels panel={activePanel} />
        </aside>
      ) : null}

      <aside className="drive-rail" aria-label="Quick apps">
        {RAIL_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`rbtn${activePanel === item.id ? ' active' : ''}`}
            title={item.title}
            aria-label={item.label}
            aria-pressed={activePanel === item.id}
            onClick={() => togglePanel(item.id)}
          >
            <RailIcon kind={item.icon} />
          </button>
        ))}
        <div className="plus">
          <button
            type="button"
            className="rbtn"
            title="Open Collaborate"
            aria-label="Open Collaborate"
            onClick={() => navigate('/dashboard/collaborate')}
          >
            <Plus size={20} strokeWidth={1.75} />
          </button>
        </div>
      </aside>
    </>
  );
}

export default LibrarySideRail;
