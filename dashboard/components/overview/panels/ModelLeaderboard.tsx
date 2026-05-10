import type { DashboardBundle } from "../types";
import { T, PC, fmt, providerPcKey, decayedScore01 } from "../constants";
import { Card, CardHeader, Pill, Ico } from "../primitives";

export function ModelLeaderboard({ perfRows }: { perfRows?: DashboardBundle["model_leaderboard"] }) {
  const rows = perfRows?.length
    ? perfRows.map((r, i) => {
        const prov = String(r.provider || "—");
        const pk = providerPcKey(prov);
        const runs = Math.round(Number(r.runs) || 0);
        const success = Math.round((Number(r.success_pct) || 0) * 10) / 10;
        const lat = (Number(r.avg_latency_ms) || 0) / 1000;
        const tok = Number(r.total_tokens) || 0;
        const spent = Number(r.total_cost_usd) || 0;
        const costPer1k = tok > 0 ? (spent / tok) * 1000 : 0;
        return {
          rank: i + 1,
          model: String(r.model_key || "—").slice(0, 32),
          prov,
          pk,
          runs,
          success,
          lat,
          costPer1k,
          decayed: r.decayed_score,
        };
      })
    : [
        { rank: 1, model: "gpt-4o", prov: "OpenAI", pk: "openai", runs: 28400, success: 98.5, lat: 2.3, costPer1k: 0.021, decayed: 0.72 },
        { rank: 2, model: "claude-3-5-sonnet", prov: "Anthropic", pk: "anthropic", runs: 19700, success: 97.1, lat: 3.1, costPer1k: 0.018, decayed: 0.65 },
      ];
  const maxR = Math.max(...rows.map((r) => r.runs), 1);
  return (
    <Card>
      <CardHeader icon={Ico.list} title="Model Leaderboard" action={<Pill label="agentsam_agent_run" />} />
      <div
        style={{
          fontSize: 9,
          display: "grid",
          gridTemplateColumns: "16px minmax(0,1fr) 58px 40px 46px 38px 50px",
          gap: "0 8px",
          color: T.muted,
          paddingBottom: 7,
          borderBottom: `1px solid ${T.border}`,
          marginBottom: 6,
        }}
      >
        <span>#</span>
        <span>Model</span>
        <span>Provider</span>
        <span>Runs</span>
        <span>Success</span>
        <span>Avg s</span>
        <span>$/1K</span>
      </div>
      {rows.map((r) => (
        <div key={r.rank} style={{ marginBottom: 8 }}>
          <div
            style={{
              fontSize: 10,
              display: "grid",
              gridTemplateColumns: "16px minmax(0,1fr) 58px 40px 46px 38px 50px",
              gap: "0 8px",
              alignItems: "center",
              marginBottom: 3,
            }}
          >
            <span style={{ color: T.muted }}>{r.rank}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.model}</span>
            <span style={{ color: PC[r.pk] || T.muted, fontSize: 9 }}>{r.prov}</span>
            <span style={{ color: T.muted }}>{fmt.num(r.runs)}</span>
            <span style={{ color: r.success > 95 ? T.green : T.amber }}>{r.success}%</span>
            <span style={{ color: T.muted }}>{r.lat.toFixed(2)}s</span>
            <span style={{ color: T.muted }}>${r.costPer1k.toFixed(3)}</span>
          </div>
          <div style={{ height: 3, background: T.track, borderRadius: 2, marginLeft: 24, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(r.runs / maxR) * 100}%`, background: PC[r.pk] || T.accent, borderRadius: 2, opacity: 0.7 }} />
          </div>
          <div style={{ height: 2, background: T.track, borderRadius: 2, marginLeft: 24, marginTop: 4, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${decayedScore01(r.decayed) * 100}%`,
                background: T.accent,
                borderRadius: 2,
                opacity: 0.85,
              }}
            />
          </div>
        </div>
      ))}
    </Card>
  );
}
