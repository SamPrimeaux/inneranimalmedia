import type { DashboardBundle } from "../types";
import { T, fmt, seedArr } from "../constants";
import { Card, Sparkline } from "../primitives";

export function ActiveProjects({ projects, plans }: { projects: any[]; plans?: DashboardBundle["active_plans"] }) {
  const fromPlans =
    plans?.map((p, i) => {
      const tt = Number(p.tasks_total) || 0;
      const td = Number(p.tasks_done) || 0;
      const prog = tt > 0 ? Math.round((td / tt) * 100) : 0;
      const colors = [T.accent, T.blue, T.green, T.violet, T.amber];
      return {
        name: String(p.title || p.id || "Plan"),
        status: String(p.status || "active"),
        agent: String(p.id || "").slice(0, 18),
        progress: prog,
        deploys: Number(p.tasks_blocked) || 0,
        hrs: Number(p.cost_usd) || 0,
        c: colors[i % colors.length],
      };
    }) || [];
  const defs = [
    { name: "Swamp Blood Gator Guides — CF-Native Rebuild", status: "development", agent: "Swamp_Bot", progress: 82, deploys: 14, hrs: 38.4, c: T.accent },
    { name: "IAM TOOLS agent workspace", status: "development", agent: "Tools_Agent", progress: 68, deploys: 9, hrs: 26.1, c: T.blue },
    { name: "Companions of CPAS — Rescue Mgmt Platform", status: "development", agent: "CPAS_Rescue", progress: 74, deploys: 11, hrs: 31.7, c: T.green },
    { name: "Agent Sam Dashboard", status: "discovery", agent: "Dashboard", progress: 35, deploys: 3, hrs: 12.9, c: T.violet },
  ];
  const merged = fromPlans.length ? fromPlans : defs.map((d, i) => (projects[i] ? { ...d, name: projects[i].name, status: projects[i].status } : d));
  const rows = merged;
  const sc: Record<string, string> = {
    development: T.accent,
    discovery: T.violet,
    maintenance: T.amber,
    production: T.green,
    active: T.accent,
    draft: T.amber,
    complete: T.green,
    abandoned: T.muted,
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: T.muted }}>Active Projects</span>
          <span style={{ fontSize: 10, color: T.muted, background: T.surface, border: `1px solid ${T.border}`, padding: "0 7px", borderRadius: 20 }}>{rows.length}</span>
        </div>
        <a href="/dashboard/projects" style={{ fontSize: 10, color: T.accent, textDecoration: "none" }}>
          View All →
        </a>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 10 }}>
        {rows.map((p, i) => (
          <Card key={i} style={{ padding: 14, borderLeft: `3px solid ${p.c}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.35, flex: 1 }}>{p.name}</span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: sc[p.status] || T.muted,
                  background: `color-mix(in srgb, ${sc[p.status] || T.muted} 16%, transparent)`,
                  padding: "2px 7px",
                  borderRadius: 3,
                  flexShrink: 0,
                }}
              >
                {p.status}
              </span>
            </div>
            <div style={{ fontSize: 9, color: T.muted, marginBottom: 10 }}>
              Plan: {p.agent} · blocked tasks: {p.deploys}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, height: 5, background: T.track, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${p.progress}%`, background: `linear-gradient(90deg,${p.c},${T.violet})`, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>{p.progress}%</span>
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
              {(
                [
                  ["Blocked", String(p.deploys)],
                  ["Plan $", fmt.usd(p.hrs)],
                ] as const
              ).map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
                  <div style={{ fontSize: 9, color: T.muted }}>{l}</div>
                </div>
              ))}
              <div style={{ flex: 1 }}>
                <Sparkline data={seedArr(p.progress, 10)} color={p.c} h={28} w={80} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
