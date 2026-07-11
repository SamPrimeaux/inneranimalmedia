/**
 * Unified GCP-style work surface header — Calendar · Tasks · Mail.
 * Mobile: top tabs hidden, replaced by fixed bottom tab strip.
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckSquare, Mail, Menu } from 'lucide-react';
import './collaborate-work-shell.css';
import './collaborate-work-layout.css';

export type WorkSurface = 'calendar' | 'tasks' | 'mail';

type Props = {
  surface: WorkSurface;
  title?: string;
  trailing?: React.ReactNode;
  /** Called when the hamburger is tapped on mobile (mail drawer toggle). */
  onMenuTap?: () => void;
  children?: React.ReactNode;
};

function surfaceFromPath(pathname: string, search: string): WorkSurface {
  if (pathname.includes('/mail')) return 'mail';
  const seg = new URLSearchParams(search).get('seg');
  if (seg === 'tasks') return 'tasks';
  return 'calendar';
}

export function useWorkSurface(): WorkSurface {
  const { pathname, search } = useLocation();
  return surfaceFromPath(pathname, search);
}

export function CollaborateWorkShell({ surface, title, trailing, onMenuTap, children }: Props) {
  const navigate = useNavigate();

  const goCalendar = () => navigate('/dashboard/collaborate');
  const goTasks = () => navigate('/dashboard/collaborate?seg=tasks');
  const goMail = () => navigate('/dashboard/mail');

  const label =
    title ||
    (surface === 'mail' ? 'Mail' : surface === 'tasks' ? 'Tasks' : 'Calendar');

  return (
    <div className="colab-work-shell">
      <header className="colab-work-shell-topbar">
        {/* Hamburger — only rendered when onMenuTap is provided (mail on mobile) */}
        {onMenuTap ? (
          <button
            type="button"
            className="colab-cal-hamb"
            aria-label="Open sidebar"
            onClick={onMenuTap}
          >
            <Menu size={18} />
          </button>
        ) : null}

        <div className="colab-work-shell-brand">
          <span className="colab-work-shell-product">Collaborate</span>
          <span className="colab-work-shell-sep">/</span>
          <span className="colab-work-shell-title">{label}</span>
        </div>

        {/* Desktop tab nav — hidden on mobile via CSS */}
        <nav className="colab-work-shell-tabs" aria-label="Work surfaces">
          <button
            type="button"
            className={surface === 'calendar' ? 'active' : ''}
            onClick={goCalendar}
          >
            Calendar
          </button>
          <button
            type="button"
            className={surface === 'tasks' ? 'active' : ''}
            onClick={goTasks}
          >
            Tasks
          </button>
          <button
            type="button"
            className={surface === 'mail' ? 'active' : ''}
            onClick={goMail}
          >
            Mail
          </button>
        </nav>

        {trailing ? <div className="colab-work-shell-trailing">{trailing}</div> : null}
      </header>

      <div className="colab-work-shell-body">{children}</div>

      {/* Mobile bottom tab strip — hidden on desktop via CSS */}
      <nav className="colab-bottom-tabs" aria-label="Work surfaces">
        <button
          type="button"
          className={surface === 'calendar' ? 'active' : ''}
          onClick={goCalendar}
          aria-current={surface === 'calendar' ? 'page' : undefined}
        >
          <CalendarDays size={20} strokeWidth={1.75} />
          Calendar
        </button>
        <button
          type="button"
          className={surface === 'tasks' ? 'active' : ''}
          onClick={goTasks}
          aria-current={surface === 'tasks' ? 'page' : undefined}
        >
          <CheckSquare size={20} strokeWidth={1.75} />
          Tasks
        </button>
        <button
          type="button"
          className={surface === 'mail' ? 'active' : ''}
          onClick={goMail}
          aria-current={surface === 'mail' ? 'page' : undefined}
        >
          <Mail size={20} strokeWidth={1.75} />
          Mail
        </button>
      </nav>
    </div>
  );
}
