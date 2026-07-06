import { useNavigate } from 'react-router-dom';
import { BookOpen, CheckSquare, Lightbulb, Mail, Video } from 'lucide-react';

type Props = {
  onTasksClick: () => void;
  insightsOpen?: boolean;
  onInsightsToggle?: () => void;
};

/** Right rail on /dashboard/collaborate — Lucide icons. */
export function CollaboratePageRail({ onTasksClick, insightsOpen = false, onInsightsToggle }: Props) {
  const navigate = useNavigate();

  return (
    <aside className="colab-cal-rail" aria-label="Collaborate apps">
      <button
        type="button"
        className={`colab-cal-rail-icon yellow${insightsOpen ? ' active' : ''}`}
        title="Insights"
        aria-label="Insights"
        aria-pressed={insightsOpen}
        onClick={() => onInsightsToggle?.()}
      >
        <Lightbulb size={20} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="colab-cal-rail-icon blue"
        title="Tasks"
        aria-label="Tasks"
        onClick={onTasksClick}
      >
        <CheckSquare size={20} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="colab-cal-rail-icon green"
        title="Meet"
        aria-label="Meet"
        onClick={() => navigate('/dashboard/meet')}
      >
        <Video size={20} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="colab-cal-rail-icon orange"
        title="Mail"
        aria-label="Mail"
        onClick={() => navigate('/dashboard/mail')}
      >
        <Mail size={20} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        className="colab-cal-rail-icon"
        title="Learn"
        aria-label="Learn"
        onClick={() => navigate('/dashboard/learn')}
      >
        <BookOpen size={20} strokeWidth={1.75} />
      </button>
    </aside>
  );
}
