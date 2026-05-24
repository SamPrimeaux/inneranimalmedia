import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import McpAuthorizationScreen from "./AuthOAuthConsentPage";

type ConsentPayload = {
  authorization_id: string;
  client?: { name?: string; domain?: string; logo_url?: string; type_label?: string };
  scopes?: string[];
  workspaces?: Array<{ id: string; name: string; subtitle?: string }>;
  signed_in_email?: string;
};

export default function IamMcpOAuthConsentRoute() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") || "";
  const [payload, setPayload] = useState<ConsentPayload | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!authorizationId.startsWith("oaa_")) {
      setLoadError("Missing or invalid IAM MCP authorization id.");
      return;
    }
    let cancelled = false;
    (async () => {
      const res = await fetch(
        `/api/oauth/mcp/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
        { credentials: "include", headers: { Accept: "application/json" } },
      );
      const json = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(json.error || `Could not load consent (${res.status}).`);
        return;
      }
      setPayload(json);
    })().catch(() => {
      if (!cancelled) setLoadError("Network error loading consent.");
    });
    return () => {
      cancelled = true;
    };
  }, [authorizationId]);

  const permissions = useMemo(
    () =>
      (payload?.scopes || []).map((scope) => ({
        label: scope,
        tone: scope.includes("write") ? ("write" as const) : ("read" as const),
      })),
    [payload?.scopes],
  );

  if (loadError) {
    return (
      <main className="min-h-screen bg-[#0d0d10] p-8 text-white">
        <p>{loadError}</p>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="min-h-screen bg-[#0d0d10] p-8 text-white">
        <p>Loading authorization…</p>
      </main>
    );
  }

  return (
    <McpAuthorizationScreen
      client={{
        name: payload.client?.name || "MCP client",
        domain: payload.client?.domain,
        logoUrl: payload.client?.logo_url,
        typeLabel: payload.client?.type_label || "MCP OAuth client",
      }}
      workspaces={payload.workspaces || []}
      permissions={permissions}
      onAuthorize={async ({ workspaceId }) => {
        const res = await fetch("/api/oauth/mcp/consent", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            authorization_id: authorizationId,
            workspace_id: workspaceId,
            action: "approve",
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.redirect_url) {
          throw new Error(json.error || "Approve failed");
        }
        window.location.href = json.redirect_url;
      }}
      onDecline={async () => {
        await fetch("/api/oauth/mcp/consent", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ authorization_id: authorizationId, action: "deny" }),
        });
      }}
    />
  );
}
