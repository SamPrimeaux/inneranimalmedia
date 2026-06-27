/**
 * SiteDeployWizard — 7-step site provisioning (Site → Infra → Repo → Domain → CMS → Review → Deploy).
 * POST /api/cms/projects/create + optional POST /api/cms/liquid-imports/upload for theme .zip.
 */
import React, { useState, useCallback, useRef, useId } from 'react';
import {
  Check,
  Plus,
  Upload,
  Users,
  Zap,
  Link2,
  SkipForward,
  Globe,
  Lock,
  Clock,
  LayoutTemplate,
  Square,
  LayoutGrid,
  Database,
  Github,
  Layout,
  Bot,
  X,
  FileArchive,
  ExternalLink,
  Pencil,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import './SiteDeployWizard.css';

interface ImportZipState {
  file: File | null;
  error: string | null;
}

interface WState {
  site: { name: string; slug: string; type: 'new' | 'import' | 'client'; _se?: boolean };
  importZip: ImportZipState;
  infra: { worker: 'existing' | 'new'; workerName: string; bucket: 'cms' | 'new'; kv: boolean };
  repo: { mode: 'existing' | 'new' | 'skip'; org: string; repoName: string; branch: string; builds: boolean };
  domain: { mode: 'subdomain' | 'custom' | 'later'; sub: string; custom: string; cf: boolean };
  cms: { tpl: 'blank' | 'starter' | 'shopify'; secs: string[]; agentic: boolean; pipeline: boolean };
  deploy: { status: 'idle' | 'running' | 'done' | 'error'; error?: string; importUploaded?: boolean };
}

const STEPS = ['Site', 'Infra', 'Repo', 'Domain', 'CMS', 'Review', 'Deploy'];
const ALL_SECS = ['hero', 'nav', 'features', 'pricing', 'testimonials', 'cta', 'footer', 'gallery', 'faq'];
const ZIP_ACCEPT = '.zip,.tar.gz,.tgz,.tar';
const ZIP_MAX_MB = 80;

const INIT: WState = {
  site: { name: '', slug: '', type: 'new' },
  importZip: { file: null, error: null },
  infra: { worker: 'existing', workerName: '', bucket: 'cms', kv: false },
  repo: { mode: 'skip', org: 'SamPrimeaux', repoName: '', branch: 'main', builds: true },
  domain: { mode: 'subdomain', sub: '', custom: '', cf: true },
  cms: { tpl: 'starter', secs: ['hero', 'nav', 'cta'], agentic: true, pipeline: true },
  deploy: { status: 'idle' },
};

function toSlug(s: string) {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function isAllowedZip(file: File) {
  const name = file.name.toLowerCase();
  return (
    name.endsWith('.zip') ||
    name.endsWith('.tar.gz') ||
    name.endsWith('.tgz') ||
    name.endsWith('.tar')
  );
}

function validateZipFile(file: File): string | null {
  if (!isAllowedZip(file)) return 'Use a .zip or .tar.gz theme archive';
  if (file.size > ZIP_MAX_MB * 1024 * 1024) return `File must be under ${ZIP_MAX_MB} MB`;
  return null;
}

/* ── primitives ─────────────────────────────────────────────────────────── */

function Prog({ cur }: { cur: number }) {
  return (
    <div className="flex items-center mb-8" role="list" aria-label="Setup steps">
      {STEPS.map((label, i) => (
        <div key={label} className="flex-1 flex flex-col items-center relative" role="listitem">
          {i < STEPS.length - 1 && (
            <div
              className="absolute top-[14px] left-[50%] w-full h-[1.5px] z-0"
              style={{ background: i < cur ? 'var(--border-accent)' : 'var(--border)' }}
            />
          )}
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-medium z-[1]"
            style={{
              background: i < cur ? 'var(--fill-accent)' : i === cur ? 'var(--bg-accent)' : 'var(--surface-2)',
              border: `1.5px solid ${i <= cur ? 'var(--border-accent)' : 'var(--border)'}`,
              color: i < cur ? 'white' : i === cur ? 'var(--fill-accent)' : 'var(--text-secondary)',
            }}
          >
            {i < cur ? <Check size={14} strokeWidth={2.5} aria-hidden /> : i + 1}
          </div>
          <span
            className={`text-[11px] mt-1.5 text-center whitespace-nowrap sw-step-label ${
              i === cur ? 'sw-step-label--current' : i < cur ? 'sw-step-label--done' : 'sw-step-label--pending'
            }`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

function Head({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-[18px] font-semibold mb-1.5" style={{ color: 'var(--text-primary)' }}>
        {title}
      </h2>
      <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        {desc}
      </p>
    </div>
  );
}

function Card({
  sel,
  onClick,
  icon: Icon,
  title,
  sub,
}: {
  sel: boolean;
  onClick: () => void;
  icon: LucideIcon;
  title: React.ReactNode;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl p-4 mb-2.5 cursor-pointer sw-card ${sel ? 'sw-card--selected' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: sel ? 'var(--bg-accent)' : 'var(--surface-1)',
            color: sel ? 'var(--text-accent)' : 'var(--text-secondary)',
          }}
        >
          <Icon size={17} strokeWidth={2} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-[14px] font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            <span className="min-w-0">{title}</span>
            {sel && (
              <span
                className="ml-auto text-[10px] px-2 py-0.5 rounded shrink-0"
                style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}
              >
                selected
              </span>
            )}
          </div>
          <div className="text-[13px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
            {sub}
          </div>
        </div>
      </div>
    </button>
  );
}

function ZipDropZone({
  file,
  error,
  onFile,
  onError,
  onClear,
  compact = false,
}: {
  file: File | null;
  error: string | null;
  onFile: (f: File) => void;
  onError: (msg: string) => void;
  onClear: () => void;
  compact?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickFile = useCallback(
    (candidate: File | null | undefined) => {
      if (!candidate) return;
      const err = validateZipFile(candidate);
      if (err) {
        onError(err);
        return;
      }
      onFile(candidate);
    },
    [onError, onFile],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      pickFile(e.dataTransfer.files?.[0]);
    },
    [pickFile],
  );

  if (file) {
    return (
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{ background: 'var(--surface-1)', border: '0.5px solid var(--border-accent)' }}
      >
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--bg-accent)', color: 'var(--text-accent)' }}
        >
          <FileArchive size={18} aria-hidden />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {file.name}
          </div>
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
            {formatBytes(file.size)} — ready to import after deploy
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 rounded-md shrink-0 hover:opacity-80"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Remove file"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className={compact ? 'mt-1' : 'mt-3'}>
      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-xl cursor-pointer transition-colors sw-dropzone ${
          dragOver ? 'sw-dropzone--active' : ''
        }`}
        style={{
          padding: compact ? '1rem 1.25rem' : '1.25rem 1.5rem',
          minHeight: compact ? 88 : 112,
        }}
      >
        <Upload
          size={compact ? 18 : 22}
          strokeWidth={2}
          style={{ color: dragOver ? 'var(--fill-accent)' : 'var(--text-muted)', marginBottom: 8 }}
          aria-hidden
        />
        <span className="text-[13px] font-semibold text-center" style={{ color: 'var(--text-primary)' }}>
          Drop theme .zip here
        </span>
        <span className="text-[12px] mt-1 text-center font-medium" style={{ color: 'var(--text-secondary)' }}>
          or tap to browse · max {ZIP_MAX_MB} MB
        </span>
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={ZIP_ACCEPT}
        className="sr-only"
        onChange={(e) => {
          pickFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {error ? (
        <p className="text-[12px] mt-2" style={{ color: 'var(--text-danger)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Fld({ label, hint, children }: { label: React.ReactNode; hint?: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-[13px] font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
        {label}
      </label>
      {children}
      {hint ? (
        <div className="text-[12px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function Inp({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2.5 text-[14px] rounded-[var(--radius)] outline-none"
      style={{ border: '1px solid var(--border-strong)', background: 'var(--surface-1)', color: 'var(--text-primary)' }}
      onFocus={(e) => {
        e.target.style.borderColor = 'var(--border-accent)';
      }}
      onBlur={(e) => {
        e.target.style.borderColor = 'var(--border)';
      }}
    />
  );
}

function Tog({ on, onClick, label, sub }: { on: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <div className="flex items-center justify-between py-2.5" style={{ borderBottom: '0.5px solid var(--border)' }}>
      <div>
        <div className="text-[14px]" style={{ color: 'var(--text-primary)' }}>
          {label}
        </div>
        <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          {sub}
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={on}
        className="ml-4 shrink-0 w-9 h-5 rounded-full relative"
        style={{ background: on ? 'var(--fill-accent)' : 'var(--border-strong)' }}
      >
        <span
          className="absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white"
          style={{ left: on ? '19px' : '3px', transition: 'left .2s' }}
        />
      </button>
    </div>
  );
}

function Div({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 my-3 sw-divider">
      <span style={{ flex: 1, height: '1px', background: 'var(--border)', display: 'block' }} />
      {label}
      <span style={{ flex: 1, height: '1px', background: 'var(--border)', display: 'block' }} />
    </div>
  );
}

function Bdg({ children, v = 'opt' }: { children: React.ReactNode; v?: 'opt' | 'new' | 'cn' }) {
  const styles: Record<string, React.CSSProperties> = {
    opt: { background: 'var(--surface-1)', color: 'var(--text-muted)', border: '0.5px solid var(--border)' },
    new: { background: 'var(--bg-success)', color: 'var(--text-success)' },
    cn: { background: 'var(--bg-accent)', color: 'var(--text-accent)' },
  };
  return (
    <span className="text-[11px] px-1.5 py-0.5 rounded ml-1.5 font-medium" style={styles[v]}>
      {children}
    </span>
  );
}

/* ── steps ──────────────────────────────────────────────────────────────── */

function S0({
  s,
  u,
  uZip,
}: {
  s: WState;
  u: (p: Partial<WState['site']>) => void;
  uZip: (p: Partial<ImportZipState>) => void;
}) {
  const setZip = useCallback(
    (file: File) => {
      const err = validateZipFile(file);
      if (err) {
        uZip({ file: null, error: err });
        return;
      }
      uZip({ file, error: null });
      u({ type: 'import' });
    },
    [u, uZip],
  );

  return (
    <>
      <Head title="What are you building?" desc="Give your project a name and choose how it fits into your setup." />
      <Fld label="Project name" hint="Used as the display name across the CMS and dashboard">
        <Inp
          value={s.site.name}
          placeholder="Fuel & Free Time"
          onChange={(v) => u({ name: v, slug: s.site._se ? s.site.slug : toSlug(v) })}
        />
      </Fld>
      <Fld
        label={
          <>
            Project slug <Bdg>auto</Bdg>
          </>
        }
        hint="URL-safe identifier — letters, numbers, hyphens only"
      >
        <Inp value={s.site.slug} placeholder="fuel-and-free-time" onChange={(v) => u({ slug: v, _se: true })} />
      </Fld>
      <Div label="project type" />
      <Card
        sel={s.site.type === 'new'}
        onClick={() => u({ type: 'new' })}
        icon={Plus}
        title="New site from scratch"
        sub="Start with a blank canvas or a starter template. Recommended if you're building something new."
      />
      <Card
        sel={s.site.type === 'import'}
        onClick={() => u({ type: 'import' })}
        icon={Upload}
        title={
          <>
            Import existing site <Bdg v="cn">Shopify / HTML</Bdg>
          </>
        }
        sub="Upload a Shopify theme zip or existing HTML — the pipeline parses and converts sections automatically."
      />
      {s.site.type === 'import' ? (
        <div className="mb-3 pl-1">
          <ZipDropZone
            compact
            file={s.importZip.file}
            error={s.importZip.error}
            onFile={setZip}
            onError={(msg) => uZip({ file: null, error: msg })}
            onClear={() => uZip({ file: null, error: null })}
          />
        </div>
      ) : null}
      <Card
        sel={s.site.type === 'client'}
        onClick={() => u({ type: 'client' })}
        icon={Users}
        title="Client site"
        sub="Tenant-scoped project for a client workspace. Isolated CMS, separate DNS, same infrastructure."
      />
    </>
  );
}

function S1({ s, u }: { s: WState; u: (p: Partial<WState['infra']>) => void }) {
  return (
    <>
      <Head
        title="Cloudflare infrastructure"
        desc="Choose how this site's Worker and storage are set up. Connect existing resources or create new ones."
      />
      <Div label="worker" />
      <Card
        sel={s.infra.worker === 'existing'}
        onClick={() => u({ worker: 'existing' })}
        icon={Zap}
        title="Connect existing Worker"
        sub="Attach this site to inneranimalmedia — your main Worker handles routing and CMS hydration."
      />
      <Card
        sel={s.infra.worker === 'new'}
        onClick={() => u({ worker: 'new' })}
        icon={Plus}
        title={
          <>
            Deploy a new Worker <Bdg v="new">new</Bdg>
          </>
        }
        sub="Spin up a dedicated Worker for this site. Useful for isolated client projects or custom routing logic."
      />
      {s.infra.worker === 'new' ? (
        <div className="pl-6 mb-2">
          <Fld label="Worker name">
            <Inp value={s.infra.workerName} placeholder="my-site-worker" onChange={(v) => u({ workerName: v })} />
          </Fld>
        </div>
      ) : null}
      <Div label="R2 storage" />
      <Card
        sel={s.infra.bucket === 'cms'}
        onClick={() => u({ bucket: 'cms' })}
        icon={Database}
        title={
          <>
            Shared CMS bucket <Bdg v="cn">cms.inneranimalmedia.com</Bdg>
          </>
        }
        sub="Pages and sections land in the cms R2 bucket — default for all new sites."
      />
      <Card
        sel={s.infra.bucket === 'new'}
        onClick={() => u({ bucket: 'new' })}
        icon={Plus}
        title="Create dedicated bucket"
        sub="Isolated storage for this project — useful for client sites needing separate asset management."
      />
      <div className="mt-4" style={{ borderTop: '0.5px solid var(--border)', paddingTop: '1rem' }}>
        <Tog
          on={s.infra.kv}
          onClick={() => u({ kv: !s.infra.kv })}
          label="KV draft cache"
          sub="Stores draft CMS state between saves for faster preview loads"
        />
      </div>
    </>
  );
}

function S2({ s, u }: { s: WState; u: (p: Partial<WState['repo']>) => void }) {
  return (
    <>
      <Head
        title="GitHub repository"
        desc="Connect a repo for CI/CD auto-deploys. Skipping this is fine — you can always push manually."
      />
      <Card
        sel={s.repo.mode === 'existing'}
        onClick={() => u({ mode: 'existing' })}
        icon={Link2}
        title="Connect existing repo"
        sub="Link this project to a GitHub repo you already have. Pushes to main auto-deploy."
      />
      <Card
        sel={s.repo.mode === 'new'}
        onClick={() => u({ mode: 'new' })}
        icon={Plus}
        title={
          <>
            Create a new repo <Bdg v="new">new</Bdg>
          </>
        }
        sub="Scaffold a fresh repo under your GitHub org with the correct wrangler config and deploy scripts pre-wired."
      />
      <Card
        sel={s.repo.mode === 'skip'}
        onClick={() => u({ mode: 'skip' })}
        icon={SkipForward}
        title="Skip for now"
        sub="Deploy manually via wrangler deploy. You can connect a repo later from the dashboard."
      />
      {s.repo.mode !== 'skip' ? (
        <div className="mt-4" style={{ borderTop: '0.5px solid var(--border)', paddingTop: '1rem' }}>
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <Fld label="Organization">
              <Inp value={s.repo.org} placeholder="SamPrimeaux" onChange={(v) => u({ org: v })} />
            </Fld>
            <Fld label="Repo name">
              <Inp value={s.repo.repoName} placeholder="my-site" onChange={(v) => u({ repoName: v })} />
            </Fld>
          </div>
          <Fld label="Deploy branch" hint="Pushes to this branch trigger production deploys">
            <Inp value={s.repo.branch} placeholder="main" onChange={(v) => u({ branch: v })} />
          </Fld>
          <Tog
            on={s.repo.builds}
            onClick={() => u({ builds: !s.repo.builds })}
            label="Connect Cloudflare Builds"
            sub="Auto-deploy on every push without running wrangler locally"
          />
        </div>
      ) : null}
    </>
  );
}

function S3({ s, u }: { s: WState; u: (p: Partial<WState['domain']>) => void }) {
  return (
    <>
      <Head
        title="Domain and DNS"
        desc="Where should this site live? Use a subdomain of inneranimalmedia.com or connect your own."
      />
      <Card
        sel={s.domain.mode === 'subdomain'}
        onClick={() => u({ mode: 'subdomain' })}
        icon={Globe}
        title={
          <>
            Use a subdomain <Bdg v="cn">*.inneranimalmedia.com</Bdg>
          </>
        }
        sub="Quick setup — DNS is managed automatically. Great for prototypes and client previews."
      />
      <Card
        sel={s.domain.mode === 'custom'}
        onClick={() => u({ mode: 'custom' })}
        icon={Lock}
        title="Custom domain"
        sub="Point an existing domain or register a new one. Cloudflare handles SSL automatically once nameservers transfer."
      />
      <Card
        sel={s.domain.mode === 'later'}
        onClick={() => u({ mode: 'later' })}
        icon={Clock}
        title="Set up later"
        sub="Site will be available on the .workers.dev default URL until you attach a domain."
      />
      {s.domain.mode === 'subdomain' ? (
        <div className="mt-4" style={{ borderTop: '0.5px solid var(--border)', paddingTop: '1rem' }}>
          <Fld label="Prefix">
            <div
              className="flex items-center"
              style={{
                border: '0.5px solid var(--border)',
                borderRadius: 'var(--radius)',
                overflow: 'hidden',
                background: 'var(--surface-2)',
              }}
            >
              <input
                type="text"
                value={s.domain.sub}
                onChange={(e) => u({ sub: e.target.value })}
                placeholder="fuel"
                className="flex-1 px-3 py-2 text-[14px] outline-none bg-transparent"
                style={{ color: 'var(--text-primary)', border: 'none' }}
              />
              <span
                className="px-3 text-[13px] h-9 flex items-center shrink-0"
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--surface-1)',
                  borderLeft: '0.5px solid var(--border)',
                }}
              >
                .inneranimalmedia.com
              </span>
            </div>
          </Fld>
          <Tog
            on={s.domain.cf}
            onClick={() => u({ cf: !s.domain.cf })}
            label="Cloudflare proxy (orange cloud)"
            sub="Enable DDoS protection and caching — recommended"
          />
        </div>
      ) : null}
      {s.domain.mode === 'custom' ? (
        <div className="mt-4" style={{ borderTop: '0.5px solid var(--border)', paddingTop: '1rem' }}>
          <Fld label="Domain name" hint="Nameservers must point to Cloudflare. SSL issued automatically.">
            <Inp value={s.domain.custom} placeholder="fuelnfreetime.com" onChange={(v) => u({ custom: v })} />
          </Fld>
        </div>
      ) : null}
    </>
  );
}

function S4({
  s,
  u,
  uZip,
}: {
  s: WState;
  u: (p: Partial<WState['cms']>) => void;
  uZip: (p: Partial<ImportZipState>) => void;
}) {
  const toggleSec = useCallback(
    (sec: string) => {
      const next = s.cms.secs.includes(sec) ? s.cms.secs.filter((x) => x !== sec) : [...s.cms.secs, sec];
      u({ secs: next });
    },
    [s.cms.secs, u],
  );

  const setZip = useCallback(
    (file: File) => {
      const err = validateZipFile(file);
      if (err) {
        uZip({ file: null, error: err });
        return;
      }
      uZip({ file, error: null });
      u({ tpl: 'shopify' });
    },
    [u, uZip],
  );

  return (
    <>
      <Head
        title="CMS setup"
        desc="Pick a starting template and choose which sections to scaffold. You can add or remove anything later in the studio."
      />
      <Div label="starting template" />
      <Card
        sel={s.cms.tpl === 'blank'}
        onClick={() => u({ tpl: 'blank' })}
        icon={Square}
        title="Blank canvas"
        sub="No sections pre-loaded — build exactly what you need from the studio or via Agent Sam."
      />
      <Card
        sel={s.cms.tpl === 'starter'}
        onClick={() => u({ tpl: 'starter' })}
        icon={LayoutGrid}
        title={
          <>
            Starter page <Bdg v="new">hero + nav + CTA</Bdg>
          </>
        }
        sub="Three scaffolded sections ready to edit in the Content tab — the fastest path to a live page."
      />
      <Card
        sel={s.cms.tpl === 'shopify'}
        onClick={() => u({ tpl: 'shopify' })}
        icon={Upload}
        title="Import Shopify theme"
        sub="Upload a .zip — the Python pipeline parses sections/*.liquid schema blocks and seeds D1 + R2 automatically."
      />
      {s.cms.tpl === 'shopify' || s.importZip.file ? (
        <ZipDropZone
          compact
          file={s.importZip.file}
          error={s.importZip.error}
          onFile={setZip}
          onError={(msg) => uZip({ file: null, error: msg })}
          onClear={() => uZip({ file: null, error: null })}
        />
      ) : null}
      <Div label="sections to scaffold" />
      <div className="flex flex-wrap gap-1.5 mb-5">
        {ALL_SECS.map((sec) => {
          const on = s.cms.secs.includes(sec);
          return (
            <button
              key={sec}
              type="button"
              onClick={() => toggleSec(sec)}
              className="text-[12px] px-2.5 py-1.5 rounded-full font-medium"
              style={{
                background: on ? 'var(--bg-accent)' : 'var(--surface-1)',
                color: on ? 'var(--text-accent)' : 'var(--text-muted)',
                border: `0.5px solid ${on ? 'var(--border-accent)' : 'var(--border)'}`,
              }}
            >
              {sec}
            </button>
          );
        })}
      </div>
      <Div label="agentic features" />
      <Tog
        on={s.cms.agentic}
        onClick={() => u({ agentic: !s.cms.agentic })}
        label="Agent Sam CMS tools"
        sub="agentsam_cms_read / write / publish available in the agent panel"
      />
      <Tog
        on={s.cms.pipeline}
        onClick={() => u({ pipeline: !s.cms.pipeline })}
        label="Python pipeline"
        sub="iam-cms-pipeline service binding for AI section generation and search"
      />
    </>
  );
}

function S5({ s, goTo }: { s: WState; goTo: (i: number) => void }) {
  const slug = s.site.slug || toSlug(s.site.name) || '—';
  const domain =
    s.domain.mode === 'subdomain'
      ? `${s.domain.sub || slug}.inneranimalmedia.com`
      : s.domain.mode === 'custom'
        ? s.domain.custom || '—'
        : 'workers.dev (set up later)';
  const repo =
    s.repo.mode === 'skip' ? 'manual deploy' : `${s.repo.org || 'org'}/${s.repo.repoName || 'repo'} (${s.repo.branch || 'main'})`;
  const tpl =
    s.cms.tpl === 'blank' ? 'blank canvas' : s.cms.tpl === 'starter' ? 'starter (hero + nav + CTA)' : 'Shopify import';
  const rows: [string, string, number][] = [
    ['Project', s.site.name || '—', 0],
    ['Slug', slug, 0],
    ['Type', s.site.type, 0],
    ...(s.importZip.file ? [['Theme zip', s.importZip.file.name, 0] as [string, string, number]] : []),
    ['Worker', s.infra.worker === 'existing' ? 'inneranimalmedia (shared)' : s.infra.workerName || 'new worker', 1],
    ['R2 bucket', s.infra.bucket === 'cms' ? 'cms (shared)' : 'dedicated', 1],
    ['Repository', repo, 2],
    ['Domain', domain, 3],
    ['CMS template', tpl, 4],
    ['Sections', s.cms.secs.join(', ') || 'none', 4],
    ['Agent Sam', s.cms.agentic ? 'enabled' : 'disabled', 4],
    ['Python pipeline', s.cms.pipeline ? 'enabled' : 'disabled', 4],
  ];
  return (
    <>
      <Head title="Review your setup" desc="Everything looks good below. Tap any row to go back and edit." />
      <div className="rounded-xl px-5 sw-panel" style={{ background: 'var(--surface-1)', border: '1px solid var(--border)' }}>
        {rows.map(([label, value, step], i) => (
          <div
            key={label}
            className="flex items-start gap-2.5 py-2.5"
            style={{ borderBottom: i < rows.length - 1 ? '0.5px solid var(--border)' : 'none' }}
          >
            <span className="text-[13px] w-36 shrink-0" style={{ color: 'var(--text-secondary)' }}>
              {label}
            </span>
            <span className="text-[13px] font-medium flex-1 break-all" style={{ color: 'var(--text-primary)' }}>
              {value}
            </span>
            <button
              type="button"
              onClick={() => goTo(step)}
              className="text-[12px] shrink-0 hover:underline"
              style={{ color: 'var(--text-accent)' }}
            >
              Edit
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

function DeployStepIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: 'var(--surface-1)', color: 'var(--text-secondary)' }}
    >
      <Icon size={16} strokeWidth={2} aria-hidden />
    </div>
  );
}

function S6({ s, onDeploy }: { s: WState; onDeploy: () => Promise<void> }) {
  const slug = s.site.slug || toSlug(s.site.name) || 'my-site';
  const domain =
    s.domain.mode === 'subdomain'
      ? `${s.domain.sub || slug}.inneranimalmedia.com`
      : s.domain.mode === 'custom'
        ? s.domain.custom
        : `${slug}.workers.dev`;
  const items: { icon: LucideIcon; label: string; sub: string }[] = [
    { icon: Database, label: 'Register project in D1', sub: `cms_pages + workspace entry for ${slug}` },
    {
      icon: Zap,
      label: 'Provision Worker route',
      sub: s.infra.worker === 'existing' ? 'Add route to inneranimalmedia Worker' : 'Deploy new Worker',
    },
    ...(s.infra.bucket === 'new' ? [{ icon: Database, label: 'Create R2 bucket', sub: `${slug}-assets` }] : []),
    ...(s.repo.mode !== 'skip'
      ? [{ icon: Github, label: 'Link GitHub repo', sub: `${s.repo.org || 'org'}/${s.repo.repoName || 'repo'}` }]
      : []),
    ...(s.domain.mode === 'subdomain'
      ? [
          {
            icon: Globe,
            label: 'Add DNS record',
            sub: `CNAME ${s.domain.sub || slug}.inneranimalmedia.com → inneranimalmedia.com`,
          },
        ]
      : []),
    ...(s.domain.mode === 'custom' ? [{ icon: Lock, label: 'Configure custom domain', sub: s.domain.custom }] : []),
    {
      icon: Layout,
      label: 'Seed CMS pages',
      sub: `Template: ${s.cms.tpl} · Sections: ${s.cms.secs.join(', ') || 'none'}`,
    },
    ...(s.importZip.file
      ? [{ icon: Upload, label: 'Upload theme archive', sub: s.importZip.file.name }]
      : []),
    ...(s.cms.pipeline
      ? [{ icon: Bot, label: 'Register pipeline bindings', sub: 'CMS_PIPELINE service binding + agent tools' }]
      : []),
  ];

  if (s.deploy.status === 'done') {
    return (
      <>
        <div
          className="rounded-xl p-5 text-center mb-4"
          style={{ background: 'var(--bg-success)', border: '0.5px solid var(--border-success)' }}
        >
          <div className="flex justify-center mb-2" style={{ color: 'var(--text-success)' }}>
            <Check size={32} strokeWidth={2.5} aria-hidden />
          </div>
          <h3 className="text-[16px] font-medium mb-1" style={{ color: 'var(--text-success)' }}>
            Site deployed
          </h3>
          <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            Your site is live and registered in the CMS.
            {s.deploy.importUploaded ? ' Theme import has been queued.' : ''}
          </p>
        </div>
        <div className="mb-4">
          <div className="text-[13px] font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Live URLs
          </div>
          <a
            href={`https://${domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-[13px] mr-2 mb-2 font-mono"
            style={{
              background: 'var(--surface-1)',
              border: '0.5px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <ExternalLink size={14} aria-hidden />
            https://{domain}
          </a>
          <a
            href="/dashboard/cms"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius)] px-3 py-1.5 text-[13px] font-mono"
            style={{
              background: 'var(--surface-1)',
              border: '0.5px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            <Pencil size={14} aria-hidden />
            Open in CMS studio
          </a>
        </div>
        <div className="rounded-xl px-5 py-1" style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
          <div className="text-[13px] font-medium py-3" style={{ color: 'var(--text-secondary)' }}>
            Next steps
          </div>
          {[
            { icon: LayoutTemplate, text: 'Add sections in the studio' },
            { icon: Upload, text: 'Import a Shopify theme' },
            { icon: Sparkles, text: 'Generate a page with Agent Sam' },
          ].map(({ icon: Icon, text }) => (
            <div
              key={text}
              className="py-2.5 text-[14px] flex items-center gap-2.5"
              style={{ color: 'var(--text-primary)', borderBottom: '0.5px solid var(--border)' }}
            >
              <Icon size={15} style={{ color: 'var(--text-muted)' }} aria-hidden />
              {text}
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <Head
        title={s.deploy.status === 'running' ? 'Deploying…' : 'Deploy'}
        desc={
          s.deploy.status === 'running'
            ? 'Hang tight — provisioning your site.'
            : 'Tap "Deploy now" to provision your site end-to-end. This takes about 30–60 seconds.'
        }
      />
      <div className="rounded-xl px-5 py-1 mb-4" style={{ background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
        {items.map((item, i) => (
          <div
            key={item.label}
            className="flex items-center gap-3 py-3"
            style={{ borderBottom: i < items.length - 1 ? '0.5px solid var(--border)' : 'none' }}
          >
            <DeployStepIcon icon={item.icon} />
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                {item.label}
              </div>
              <div className="text-[12px] truncate" style={{ color: 'var(--text-secondary)' }}>
                {item.sub}
              </div>
            </div>
            <div
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: s.deploy.status === 'running' ? 'var(--fill-warning)' : 'var(--border-strong)' }}
            />
          </div>
        ))}
      </div>
      {s.deploy.status === 'error' ? (
        <div
          className="rounded-lg p-3 mb-4 text-[13px]"
          style={{
            background: 'var(--bg-danger)',
            border: '0.5px solid var(--border-danger)',
            color: 'var(--text-danger)',
          }}
        >
          {s.deploy.error || 'Deploy failed. Check the terminal for details.'}
        </div>
      ) : null}
    </>
  );
}

/* ── main export ─────────────────────────────────────────────────────────── */

export interface SiteDeployWizardProps {
  workspaceId?: string;
  onClose?: () => void;
  onDeployed?: (slug: string) => void;
}

export function SiteDeployWizard({ workspaceId, onClose, onDeployed }: SiteDeployWizardProps) {
  const [cur, setCur] = useState(0);
  const [s, setS] = useState<WState>(INIT);

  const upSite = useCallback((p: Partial<WState['site']>) => setS((prev) => ({ ...prev, site: { ...prev.site, ...p } })), []);
  const upZip = useCallback(
    (p: Partial<ImportZipState>) => setS((prev) => ({ ...prev, importZip: { ...prev.importZip, ...p } })),
    [],
  );
  const upInfra = useCallback(
    (p: Partial<WState['infra']>) => setS((prev) => ({ ...prev, infra: { ...prev.infra, ...p } })),
    [],
  );
  const upRepo = useCallback((p: Partial<WState['repo']>) => setS((prev) => ({ ...prev, repo: { ...prev.repo, ...p } })), []);
  const upDomain = useCallback(
    (p: Partial<WState['domain']>) => setS((prev) => ({ ...prev, domain: { ...prev.domain, ...p } })),
    [],
  );
  const upCms = useCallback((p: Partial<WState['cms']>) => setS((prev) => ({ ...prev, cms: { ...prev.cms, ...p } })), []);
  const upDeploy = useCallback(
    (p: Partial<WState['deploy']>) => setS((prev) => ({ ...prev, deploy: { ...prev.deploy, ...p } })),
    [],
  );

  const goTo = useCallback((i: number) => {
    if (i >= 0 && i < STEPS.length) setCur(i);
  }, []);

  const handleDeploy = useCallback(async () => {
    upDeploy({ status: 'running', error: undefined });
    try {
      const slug = s.site.slug || toSlug(s.site.name);
      const publicDomain =
        s.domain.mode === 'subdomain'
          ? `${s.domain.sub || slug}.inneranimalmedia.com`
          : s.domain.mode === 'custom'
            ? s.domain.custom
            : null;
      const cmsTemplate = s.importZip.file || s.site.type === 'import' ? 'shopify' : s.cms.tpl;

      const res = await fetch('/api/cms/projects/create', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          project_name: s.site.name,
          project_slug: slug,
          project_type: s.site.type,
          worker: s.infra.worker,
          worker_name: s.infra.workerName || null,
          bucket: s.infra.bucket,
          kv_draft_cache: s.infra.kv,
          repo_mode: s.repo.mode,
          repo_org: s.repo.org || null,
          repo_name: s.repo.repoName || null,
          repo_branch: s.repo.branch || 'main',
          cf_builds: s.repo.builds,
          domain_mode: s.domain.mode,
          subdomain: s.domain.sub || null,
          custom_domain: s.domain.custom || null,
          cf_proxy: s.domain.cf,
          cms_template: cmsTemplate,
          sections: s.cms.secs,
          agentic_tools: s.cms.agentic,
          pipeline_binding: s.cms.pipeline,
          public_domain: publicDomain,
        }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as { error?: string };
        upDeploy({ status: 'error', error: e.error || `Deploy failed (${res.status})` });
        return;
      }

      let importUploaded = false;
      if (s.importZip.file) {
        const fd = new FormData();
        fd.append('file', s.importZip.file);
        fd.append('import_name', `${s.site.name || slug} theme`);
        fd.append('project_slug', slug);
        const up = await fetch('/api/cms/liquid-imports/upload', {
          method: 'POST',
          credentials: 'same-origin',
          body: fd,
        });
        if (!up.ok) {
          const ue = (await up.json().catch(() => ({ error: `HTTP ${up.status}` }))) as { error?: string };
          upDeploy({
            status: 'error',
            error: ue.error || `Project created but theme upload failed (${up.status})`,
          });
          return;
        }
        importUploaded = true;
      }

      upDeploy({ status: 'done', importUploaded });
      onDeployed?.(slug);
    } catch (e) {
      upDeploy({ status: 'error', error: e instanceof Error ? e.message : 'Deploy failed' });
    }
  }, [s, workspaceId, upDeploy, onDeployed]);

  const isLast = cur === STEPS.length - 1;
  const isDone = s.deploy.status === 'done';

  return (
    <div className="flex flex-col h-full min-h-0 site-deploy-wizard" style={{ background: 'var(--surface-0)', fontFamily: 'var(--font-sans)' }}>
      <div
        className="flex items-center justify-between px-6 py-4 shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface-1)' }}
      >
        <h1 className="text-[16px] font-semibold" style={{ color: 'var(--text-primary)' }}>
          Deploy a new site
        </h1>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md opacity-60 hover:opacity-100"
            style={{ color: 'var(--text-primary)' }}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        ) : null}
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6">
        <Prog cur={cur} />
        {cur === 0 && <S0 s={s} u={upSite} uZip={upZip} />}
        {cur === 1 && <S1 s={s} u={upInfra} />}
        {cur === 2 && <S2 s={s} u={upRepo} />}
        {cur === 3 && <S3 s={s} u={upDomain} />}
        {cur === 4 && <S4 s={s} u={upCms} uZip={upZip} />}
        {cur === 5 && <S5 s={s} goTo={goTo} />}
        {cur === 6 && <S6 s={s} onDeploy={handleDeploy} />}
      </div>
      {!isDone ? (
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-1)' }}
        >
          {cur > 0 && !isLast ? (
            <button
              type="button"
              onClick={() => goTo(cur - 1)}
              className="px-4 py-2 text-[14px] font-semibold"
              style={{ border: 'none', background: 'transparent', color: 'var(--text-secondary)' }}
            >
              Back
            </button>
          ) : (
            <div />
          )}
          {isLast ? (
            s.deploy.status === 'running' ? (
              <button
                type="button"
                disabled
                className="px-5 py-2 rounded-[var(--radius)] text-[14px] font-medium opacity-60 cursor-not-allowed"
                style={{ background: 'var(--fill-accent)', color: 'white' }}
              >
                Deploying…
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDeploy}
                className="px-5 py-2 rounded-[var(--radius)] text-[14px] font-medium"
                style={{ background: 'var(--fill-accent)', color: 'white', border: 'none' }}
              >
                Deploy now
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => goTo(cur + 1)}
              className="px-5 py-2 rounded-[var(--radius)] text-[14px] font-medium"
              style={{ background: 'var(--fill-accent)', color: 'white', border: 'none' }}
            >
              {cur === STEPS.length - 2 ? 'Review' : 'Continue'}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default SiteDeployWizard;
