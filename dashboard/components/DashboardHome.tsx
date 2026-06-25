import { useNavigate } from 'react-router-dom';
import {
  Bot,
  Box,
  FolderOpen,
  Database,
  LayoutTemplate,
  Github,
  Cloud,
  Sparkles,
  Plus,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { IAM_AGENT_CHAT_COMPOSE } from '../agentChatConstants';
import './DashboardHome.css';

type HomeIconId =
  | 'agent'
  | 'cube'
  | 'folder'
  | 'chat'
  | 'studio'
  | 'database'
  | 'cms'
  | 'drive'
  | 'github'
  | 'cloud'
  | 'supabase';

type HomeAction = {
  id: string;
  title: string;
  body: string;
  label: string;
  path: string;
  tone: 'blue' | 'dark' | 'purple';
  icon: HomeIconId;
};

type ToolCard = {
  id: string;
  title: string;
  cta: string;
  path: string;
  tone: 'blue' | 'purple' | 'green' | 'orange' | 'dark';
  icon: HomeIconId;
};

type ConnectCard = {
  id: string;
  title: string;
  path: string;
  tone: 'red' | 'dark' | 'blue' | 'green';
  icon: HomeIconId;
};

type ProjectCard = {
  id: string;
  title: string;
  updated: string;
  tone: 'violet' | 'blue' | 'green';
  path: string;
};

const HOME_ICONS: Record<HomeIconId, LucideIcon> = {
  agent: Bot,
  cube: Box,
  folder: FolderOpen,
  chat: Sparkles,
  studio: Box,
  database: Database,
  cms: LayoutTemplate,
  drive: Cloud,
  github: Github,
  cloud: Cloud,
  supabase: Database,
};

function HomeIcon({ id, size = 20 }: { id: HomeIconId; size?: number }) {
  const Icon = HOME_ICONS[id];
  return <Icon size={size} strokeWidth={1.75} aria-hidden />;
}

const FEATURED_ACTIONS: HomeAction[] = [
  {
    id: 'resume-agent',
    title: 'Resume latest build session',
    body: 'Continue the most recent repo, design, or deployment task.',
    label: 'Open',
    path: '/dashboard/agent',
    tone: 'blue',
    icon: 'agent',
  },
  {
    id: 'new-surface',
    title: 'Create a new visual surface',
    body: 'Start Design Studio with brand, UI, image, or model direction.',
    label: 'Build',
    path: '/dashboard/designstudio',
    tone: 'dark',
    icon: 'cube',
  },
  {
    id: 'files',
    title: 'Find files and artifacts',
    body: 'Open Drive, R2, generated files, previews, and uploads.',
    label: 'View',
    path: '/dashboard/artifacts',
    tone: 'purple',
    icon: 'folder',
  },
];

const QUICK_STARTS: ToolCard[] = [
  { id: 'agent', title: 'Agent Sam', cta: 'Chat', path: '/dashboard/agent', tone: 'blue', icon: 'chat' },
  { id: 'studio', title: 'Design Studio', cta: 'Build', path: '/dashboard/designstudio', tone: 'purple', icon: 'studio' },
  { id: 'database', title: 'Database', cta: 'Inspect', path: '/dashboard/database', tone: 'green', icon: 'database' },
  { id: 'cms', title: 'CMS Suite', cta: 'Edit', path: '/dashboard/cms', tone: 'orange', icon: 'cms' },
];

const CONNECT_CARDS: ConnectCard[] = [
  { id: 'drive', title: 'Google Drive', path: '/dashboard/settings/integrations', tone: 'red', icon: 'drive' },
  { id: 'github', title: 'GitHub Repo', path: '/dashboard/settings/integrations', tone: 'dark', icon: 'github' },
  { id: 'cloudflare', title: 'Cloudflare', path: '/dashboard/settings/integrations', tone: 'blue', icon: 'cloud' },
  { id: 'supabase', title: 'Supabase', path: '/dashboard/settings/integrations', tone: 'green', icon: 'supabase' },
];

const RECENT_PROJECTS: ProjectCard[] = [
  { id: 'cpas', title: 'Companions of Caddo', updated: 'Updated 2h ago', tone: 'violet', path: '/dashboard/artifacts?view=projects' },
  { id: 'iam', title: 'InnerAnimal Website', updated: 'Updated 5h ago', tone: 'blue', path: '/dashboard/artifacts?view=projects' },
  { id: 'meaux', title: 'Meauxbility Rebrand', updated: 'Updated 1d ago', tone: 'green', path: '/dashboard/artifacts?view=projects' },
];

function openAgentComposer() {
  window.dispatchEvent(
    new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
      detail: { message: '', send: false, ensureAgentPanel: true },
    }),
  );
}

export function DashboardHome() {
  const navigate = useNavigate();

  return (
    <main className="iam-home" aria-label="Dashboard home">
      <section className="iam-home-shell">
        <section className="iam-home-hero" aria-labelledby="home-title">
          <p className="iam-home-eyebrow">Ready when you are.</p>
          <h1 id="home-title">
            What are we building, <span>Sam?</span>
          </h1>
          <p>
            Pick a workflow below, or open Agent Sam from the panel to start with full context.
          </p>
          <button type="button" className="iam-hero-agent-cta" onClick={openAgentComposer}>
            <Sparkles size={16} strokeWidth={1.75} aria-hidden />
            Ask Agent Sam
            <ArrowRight size={16} strokeWidth={1.75} aria-hidden />
          </button>
        </section>

        <section className="iam-home-lane" aria-label="Suggested actions">
          {FEATURED_ACTIONS.map((action, index) => (
            <button
              key={action.id}
              type="button"
              className={`iam-feature-card iam-feature-card--${action.tone} ${index === 0 ? 'is-featured' : ''}`}
              onClick={() => navigate(action.path)}
            >
              <span className="iam-feature-glyph" aria-hidden>
                <HomeIcon id={action.icon} size={22} />
              </span>
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
                  <span className={`iam-tool-glyph iam-tool-glyph--${tool.tone}`} aria-hidden>
                    <HomeIcon id={tool.icon} size={22} />
                  </span>
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
                <span className="iam-connect-icon" aria-hidden>
                  <HomeIcon id={item.icon} size={18} />
                </span>
                <strong>{item.title}</strong>
                <span className="iam-connect-plus" aria-hidden><Plus size={18} strokeWidth={2} /></span>
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
              <span><Plus size={22} strokeWidth={1.75} aria-hidden /></span>
              <strong>New project</strong>
              <small>Create a fresh workspace</small>
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}

export default DashboardHome;
