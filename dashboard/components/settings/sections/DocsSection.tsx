import React from 'react';

export type DocsSectionProps = {
  onOpenInMonaco?: (content: string, virtualPath: string) => void;
  onFileSelect?: (file: { name: string; content: string }) => void;
};

export function DocsSection({ onOpenInMonaco, onFileSelect }: DocsSectionProps) {
  const openSnippet = (title: string, body: string) => {
    const path = `${title.replace(/\s+/g, '-').toLowerCase()}.md`;
    if (onOpenInMonaco) onOpenInMonaco(body, path);
    else if (onFileSelect) onFileSelect({ name: path, content: body });
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
        Documentation
      </h2>
      <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
        Quick links to dashboard routes and reference snippets. Storage buckets and tenant-specific resources are
        provisioned per account and are not enumerated here.
      </p>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-5 space-y-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Dashboard routes
        </div>
        <div className="flex flex-col gap-2">
          {[
            ['Overview', '/dashboard/overview'],
            ['Agent Sam', '/dashboard/agent'],
            ['Database', '/dashboard/database'],
            ['Storage', '/dashboard/storage'],
            ['Mail', '/dashboard/mail'],
          ].map(([label, path]) => (
            <div key={path} className="flex items-center justify-between gap-3 text-[12px]">
              <span className="text-[var(--text-main)]">{label}</span>
              <a href={path} className="font-mono text-[var(--solar-cyan)] text-[11px] hover:underline">
                {path}
              </a>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)] p-5">
        <div className="text-[12px] font-semibold text-[var(--text-main)]">Deploy scripts (reference)</div>
        <p className="text-[11px] text-[var(--text-muted)] mt-2">
          Sandbox first, then promote. Open as a read-only snippet in the editor.
        </p>
        <button
          type="button"
          onClick={() =>
            openSnippet(
              'deploy-scripts',
              `# Sandbox\n./scripts/deploy-sandbox.sh\n\n# Production promote\n./scripts/promote-to-prod.sh`,
            )
          }
          className="mt-3 px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--solar-cyan)] hover:border-[var(--solar-cyan)]/40"
        >
          Open in Monaco
        </button>
      </div>
    </div>
  );
}
