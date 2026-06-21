import React, { useEffect } from 'react';
import { useParams } from 'react-router-dom';

const EXECOS_ZONES_ORIGIN = 'https://execos.inneranimalmedia.com';

/** Legacy /dashboard/mcp* → ExecOS zones SPA (UI moved out of IAM dashboard). */
export function McpLegacyRedirect() {
  const { agentSlug } = useParams<{ agentSlug?: string }>();

  useEffect(() => {
    const raw = agentSlug?.trim();
    const suffix = raw ? `/${encodeURIComponent(decodeURIComponent(raw))}` : '';
    window.location.replace(`${EXECOS_ZONES_ORIGIN}/zones${suffix}`);
  }, [agentSlug]);

  return (
    <div className="flex h-full min-h-[240px] items-center justify-center text-[13px] text-[var(--text-muted)]">
      Redirecting to ExecOS MCP zones…
    </div>
  );
}

export default McpLegacyRedirect;
