import { useMemo, useState } from 'react';

type Page = 'Overview' | 'Routing Lab' | 'Eval Report';

type Candidate = {
  name: string;
  quality: number;
  latencyMs: number;
  costPer1k: number;
  alpha: number;
  beta: number;
};

const candidates: Candidate[] = [
  {
    name: 'gpt-5.3-codex',
    quality: 91.8,
    latencyMs: 1020,
    costPer1k: 0.024,
    alpha: 7.2,
    beta: 1.6
  },
  {
    name: 'gpt-5.4-mini',
    quality: 89.6,
    latencyMs: 640,
    costPer1k: 0.013,
    alpha: 9.4,
    beta: 2.1
  },
  {
    name: 'gpt-5.4-nano',
    quality: 84.9,
    latencyMs: 310,
    costPer1k: 0.004,
    alpha: 12.7,
    beta: 3.8
  }
];

export default function App() {
  const [page, setPage] = useState<Page>('Overview');
  const [traffic, setTraffic] = useState(65);

  const totals = useMemo(() => {
    const passRate = 92.4;
    const avgLatency = Math.round(
      candidates.reduce((sum, c) => sum + c.latencyMs, 0) / candidates.length
    );
    const avgCost = (
      candidates.reduce((sum, c) => sum + c.costPer1k, 0) / candidates.length
    ).toFixed(3);

    return {
      passRate,
      avgLatency,
      avgCost
    };
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <h1>Agent Sam</h1>
            <p>Command Center</p>
          </div>
        </div>
        <nav>
          {(['Overview', 'Routing Lab', 'Eval Report'] as Page[]).map((item) => (
            <button
              key={item}
              className={`nav-btn ${page === item ? 'active' : ''}`}
              onClick={() => setPage(item)}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="side-note">
          <h4>Thompson Router</h4>
          <p>Adaptive exploration for model selection and cost-aware quality tuning.</p>
        </div>
      </aside>

      <main className="content">
        <section className="hero">
          <div>
            <h2>Agent Sam Command Center</h2>
            <p>
              Monitor routing performance, inspect alpha/beta confidence signals, and ship
              faster model decisions.
            </p>
          </div>
          <div className="hero-badge">Live Simulation</div>
        </section>

        {page === 'Overview' && (
          <section className="grid three">
            <MetricCard title="Pass Rate" value={`${totals.passRate}%`} trend="+1.8%" />
            <MetricCard title="Avg Latency" value={`${totals.avgLatency} ms`} trend="-72 ms" />
            <MetricCard title="Avg Cost / 1K" value={`$${totals.avgCost}`} trend="-11%" />

            <div className="card wide">
              <h3>Model Candidates</h3>
              <div className="chips">
                {candidates.map((c) => (
                  <span key={c.name} className="chip">
                    {c.name}
                  </span>
                ))}
              </div>
              <p className="muted">Current strategy favors mini during peak load, codex for high-complexity prompts.</p>
            </div>

            <div className="card wide">
              <h3>Thompson Sampling Snapshot</h3>
              <div className="rows">
                {candidates.map((c) => (
                  <div key={c.name} className="row">
                    <span>{c.name}</span>
                    <span>
                      α {c.alpha.toFixed(1)} / β {c.beta.toFixed(1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {page === 'Routing Lab' && (
          <section className="grid two">
            <div className="card">
              <h3>Traffic Split Simulator</h3>
              <p className="muted">Adjust exploration pressure between premium and low-latency models.</p>
              <label htmlFor="traffic">Mini/Codex Preference: {traffic}%</label>
              <input
                id="traffic"
                type="range"
                min={0}
                max={100}
                value={traffic}
                onChange={(e) => setTraffic(Number(e.target.value))}
              />
              <div className="rows compact">
                <div className="row">
                  <span>gpt-5.4-mini</span>
                  <span>{traffic}%</span>
                </div>
                <div className="row">
                  <span>gpt-5.3-codex</span>
                  <span>{Math.max(0, 100 - traffic - 15)}%</span>
                </div>
                <div className="row">
                  <span>gpt-5.4-nano</span>
                  <span>15%</span>
                </div>
              </div>
            </div>

            <div className="card">
              <h3>Routing Health</h3>
              <div className="rows compact">
                <div className="row"><span>Estimated pass rate</span><strong>{(88 + traffic * 0.08).toFixed(1)}%</strong></div>
                <div className="row"><span>Estimated latency</span><strong>{(760 - traffic * 2.1).toFixed(0)} ms</strong></div>
                <div className="row"><span>Estimated cost / 1K</span><strong>${(0.019 - traffic * 0.00007).toFixed(3)}</strong></div>
              </div>
              <p className="muted">Higher mini allocation lowers latency while preserving quality in most eval buckets.</p>
            </div>
          </section>
        )}

        {page === 'Eval Report' && (
          <section className="grid one">
            <div className="card">
              <h3>Eval Summary (Last 24h)</h3>
              <table>
                <thead>
                  <tr>
                    <th>Model</th>
                    <th>Pass Rate</th>
                    <th>Latency</th>
                    <th>Cost / 1K</th>
                    <th>Alpha / Beta</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.name}>
                      <td>{c.name}</td>
                      <td>{c.quality}%</td>
                      <td>{c.latencyMs} ms</td>
                      <td>${c.costPer1k.toFixed(3)}</td>
                      <td>
                        {c.alpha.toFixed(1)} / {c.beta.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function MetricCard({ title, value, trend }: { title: string; value: string; trend: string }) {
  return (
    <div className="card metric">
      <p>{title}</p>
      <h3>{value}</h3>
      <span>{trend}</span>
    </div>
  );
}
