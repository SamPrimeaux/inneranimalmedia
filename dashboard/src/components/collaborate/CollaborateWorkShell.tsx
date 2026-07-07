/**
 * Unified GCP-style work surface header — Calendar · Tasks · Mail.
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './collaborate-work-shell.css';

export type WorkSurface = 'calendar' | 'tasks' | 'mail';

type Props = {
  surface: WorkSurface;
  title?: string;
  trailing?: React.ReactNode;
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

export function CollaborateWorkShell({ surface, title, trailing, children }: Props) {
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
        <div className="colab-work-shell-brand">
          <span className="colab-work-shell-product">Collaborate</span>
          <span className="colab-work-shell-sep">/</span>
          <span className="colab-work-shell-title">{label}</span>
        </div>
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
    </div>
  );
}
