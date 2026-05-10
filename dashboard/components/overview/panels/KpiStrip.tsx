import type { KpiDef } from "../types";
import { T } from "../constants";
import { Card, Skel, Sparkline, Trend } from "../primitives";

function KpiCard({ icon, label, value, trend, compare, spark, color, loading }: KpiDef & { loading: boolean }) {
  return (
    <Card style={{ flex: "1 1 152px", minWidth: 0, padding: "13px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          color: color,
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.07em",
          textTransform: "uppercase",
        }}
      >
        <span style={{ display: "flex" }}>{icon}</span>
        <span style={{ color: T.muted }}>{label}</span>
      </div>
      {loading ? (
        <>
          <Skel h={24} w="55%" />
          <Skel h={36} />
          <Skel h={10} w="60%" />
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>{value}</span>
            <Trend val={trend} />
          </div>
          <Sparkline data={spark} color={color} h={36} w={130} />
          <div style={{ fontSize: 9, color: T.muted }}>{compare}</div>
        </>
      )}
    </Card>
  );
}

export function KpiStrip({ kpis, loading }: { kpis: KpiDef[]; loading: boolean }) {
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
      {kpis.map((k) => (
        <KpiCard key={k.label} {...k} loading={loading} />
      ))}
    </div>
  );
}
