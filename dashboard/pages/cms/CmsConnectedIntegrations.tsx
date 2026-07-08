import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { CmsConnectedIntegration } from './useCmsConnectedIntegrations';

type Props = {
  items: CmsConnectedIntegration[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function CmsConnectedIntegrations({ items, loading, error, onRetry }: Props) {
  return (
    <section className="iam-cms-card">
      <div className="iam-cms-panel-head">Connected integrations</div>
      {loading ? (
        <p className="iam-cms-integrations__empty">Loading workspace integrations…</p>
      ) : error ? (
        <div className="iam-cms-integrations__empty">
          <p>{error}</p>
          {onRetry ? (
            <button type="button" className="iam-cms-shell__nav-link mt-2" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : items.length === 0 ? (
        <div className="iam-cms-integrations__empty">
          <p>No integrations connected for this workspace yet.</p>
          <Link to="/dashboard/settings?section=integrations" className="iam-cms-integrations__manage">
            Connect services
            <ArrowRight size={14} strokeWidth={2} aria-hidden />
          </Link>
        </div>
      ) : (
        <>
          <ul className="iam-cms-integrations">
            {items.map((item) => (
              <li key={item.providerKey}>
                <span
                  className="iam-cms-integrations__dot"
                  style={item.primaryColor ? { background: item.primaryColor } : undefined}
                  aria-hidden
                />
                <span className="iam-cms-integrations__name">{item.displayName}</span>
                <span className={`iam-cms-integrations__status is-${item.status}`}>
                  {item.status === 'degraded' ? 'Needs attention' : 'Connected'}
                </span>
              </li>
            ))}
          </ul>
          <div className="iam-cms-integrations__foot">
            <Link to="/dashboard/settings?section=integrations" className="iam-cms-integrations__manage">
              Manage integrations
              <ArrowRight size={14} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
