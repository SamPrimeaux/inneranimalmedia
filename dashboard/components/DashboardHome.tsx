import { useNavigate } from 'react-router-dom';
import './DashboardHome.css';

type HomeAction = {
  id: string;
  title: string;
  body: string;
  label: string;
  path: string;
  tone: 'blue' | 'dark' | 'purple';
  glyph: string;
};

type ToolCard = {
  id: string;
  title: string;
  cta: string;
  path: string;
  tone: 'blue' | 'purple' | 'green' | 'orange' | 'dark';
  glyph: string;
};

type ConnectCard = {
  id: string;
  title: string;
  path: string;
  tone: 'red' | 'dark' | 'blue' | 'green';
};

type ProjectCard = {
  id: string;
  title: string;
  updated: string;
  tone: 'violet' | 'blue' | 'green';
  path: string;
};

const FEATURED_ACTIONS: HomeAction[] = [
  {
    id: 'resume-agent',
    title: 'Resume latest build session',
    body: 'Continue the most recent repo, design, or deployment task.',
    label: 'Open',
    path: '/dashboard/agent',
    tone: 'blue',
    glyph: 'AS',
  },
  {
    id: 'new-surface',
    title: 'Create a new visual surface',
    body: 'Start Design Studio with brand, UI, image, or model direction.',
    label: 'Build',
    path: '/dashboard/designstudio',
    tone: 'dark',
    glyph: '3D',
  },
  {
    id: 'files',
    title: 'Find files and artifacts',
    body: 'Open Drive, R2, generated files, previews, and uploads.',
    label: 'View',
    path: '/dashboard/artifacts',
    tone: 'purple',
    glyph: 'DR',
  },
];

const QUICK_STARTS: ToolCard[] = [
  { id: 'agent', title: 'Agent Sam', cta: 'Chat', path: '/dashboard/agent', tone: 'blue', glyph: 'AI' },
  { id: 'studio', title: 'Design Studio', cta: 'Build', path: '/dashboard/designstudio', tone: 'purple', glyph: '3D' },
  { id: 'database', title: 'Database', cta: 'Inspect', path: '/dashboard/database', tone: 'green', glyph: 'DB' },
  { id: 'cms', title: 'CMS Suite', cta: 'Edit', path: '/dashboard/cms', tone: 'orange', glyph: 'CMS' },
];

const CONNECT_CARDS: ConnectCard[] = [
  { id: 'drive', title: 'Google Drive', path: '/dashboard/settings/integrations', tone: 'red' },
  { id: 'github', title: 'GitHub Repo', path: '/dashboard/settings/integrations', tone: 'dark' },
  { id: 'cloudflare', title: 'Cloudflare', path: '/dashboard/settings/integrations', tone: 'blue' },
  { id: 'supabase', title: 'Supabase', path: '/dashboard/settings/integrations', tone: 'green' },
];

const RECENT_PROJECTS: ProjectCard[] = [
  { id: 'cpas', title: 'Companions of Caddo', updated: 'Updated 2h ago', tone: 'violet', path: '/dashboard/artifacts?view=projects' },
  { id: 'iam', title: 'InnerAnimal Website', updated: 'Updated 5h ago', tone: 'blue', path: '/dashboard/artifacts?view=projects' },
  { id: 'meaux', title: 'Meauxbility Rebrand', updated: 'Updated 1d ago', tone: 'green', path: '/dashboard/artifacts?view=projects' },
];

function SparkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2L12 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DashboardHome() {
  const navigate = useNavigate();

  const sendPrompt = () => {
    window.dispatchEvent(
      new CustomEvent('iam-agent-external-send', {
        detail: { message: 'Help me decide what to work on next in this workspace.' },
      }),
    );
  };

  return (
    <main className="iam-home" aria-label="Dashboard home">
      <section className="iam-home-shell">
        <div className="iam-home-main">
          <section className="iam-home-hero" aria-labelledby="home-title">
            <p className="iam-home-eyebrow">Ready when you are.</p>
            <h1 id="home-title">
              What are we building, <span>Sam?</span>
            </h1>
            <p>
              Start from the composer, or tap a card to launch the right workflow with context already attached.
            </p>
          </section>

          <section className="iam-home-lane" aria-label="Suggested actions">
            {FEATURED_ACTIONS.map((action, index) => (
              <button
                key={action.id}
                type="button"
                className={`iam-feature-card iam-feature-card--${action.tone} ${index === 0 ? 'is-featured' : ''}`}
                onClick={() => navigate(action.path)}
              >
                <span className="iam-feature-glyph">{action.glyph}</span>
                <span className="iam-feature-copy">
                  <strong>{action.title}</strong>
                  <small>{action.body}</small>
                </span>
                <span className="iam-feature-cta">{action.label}</span>
              </button>
            ))}
          </section>

          <section className="iam-home-section" aria-labelledby="quick-starts-title">
            <div className="iam-section-head">
              <div>
                <h2 id="quick-starts-title">Quick starts</h2>
                <p>Tap the thing you want to do.</p>
              </div>
              <button type="button" onClick={() => navigate('/dashboard/agent')}>See all</button>
            </div>
            <div className="iam-tool-grid">
              {QUICK_STARTS.map((tool) => (
                <article key={tool.id} className="iam-tool-card">
                  <div>
                    <span className={`iam-tool-glyph iam-tool-glyph--${tool.tone}`}>{tool.glyph}</span>
                    <h3>{tool.title}</h3>
                  </div>
                  <button type="button" onClick={() => navigate(tool.path)}>{tool.cta}</button>
                </article>
              ))}
            </div>
          </section>

          <section className="iam-home-section" aria-labelledby="connect-context-title">
            <div className="iam-section-head">
              <div>
                <h2 id="connect-context-title">Connect context</h2>
                <p>Make future chats smarter.</p>
              </div>
              <button type="button" onClick={() => navigate('/dashboard/settings/integrations')}>See all</button>
            </div>
            <div className="iam-connect-grid">
              {CONNECT_CARDS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`iam-connect-card iam-connect-card--${item.tone}`}
                  onClick={() => navigate(item.path)}
                >
                  <strong>{item.title}</strong>
                  <span><PlusIcon /></span>
                </button>
              ))}
            </div>
          </section>

          <section className="iam-home-section" aria-labelledby="recent-title">
            <div className="iam-section-head">
              <div>
                <h2 id="recent-title">Recent projects</h2>
              </div>
              <button type="button" onClick={() => navigate('/dashboard/artifacts?view=projects')}>View all</button>
            </div>
            <div className="iam-project-lane">
              {RECENT_PROJECTS.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`iam-project-card iam-project-card--${project.tone}`}
                  onClick={() => navigate(project.path)}
                >
                  <span />
                  <strong>{project.title}</strong>
                  <small>{project.updated}</small>
                </button>
              ))}
              <button type="button" className="iam-project-card iam-project-card--new" onClick={() => navigate('/dashboard/projects')}>
                <span><PlusIcon /></span>
                <strong>New project</strong>
                <small>Create a fresh workspace</small>
              </button>
            </div>
          </section>
        </div>

        <aside className="iam-home-side" aria-label="Workspace activity">
          <section className="iam-activity-card">
            <div className="iam-side-head">
              <h2>Activity</h2>
              <button type="button">View</button>
            </div>
            <div className="iam-activity-list">
              <div><span className="ok" /><strong>Render complete</strong><small>Companions scene</small></div>
              <div><span className="info" /><strong>Drive synced</strong><small>12 files indexed</small></div>
              <div><span className="purple" /><strong>Email drafted</strong><small>Client update</small></div>
              <div><span className="warn" /><strong>Workflow ready</strong><small>Deploy checklist</small></div>
            </div>
          </section>
        </aside>
      </section>

      <section className="iam-home-composer" aria-label="Message Agent Sam">
        <button type="button" className="iam-composer-icon" aria-label="Attach context"><PlusIcon /></button>
        <button type="button" className="iam-composer-input" onClick={sendPrompt}>Message Agent Sam…</button>
        <button type="button" className="iam-composer-send" aria-label="Send prompt" onClick={sendPrompt}><ArrowIcon /></button>
      </section>
    </main>
  );
}

export default DashboardHome;
