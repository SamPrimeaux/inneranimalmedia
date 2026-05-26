import { useMemo, useState } from 'react';

type Page = 'overview' | 'lab' | 'report';

type Metric = {
  label: string;
  value: string;
  detail: string;
};

const modelCandidates = [
  { name: 'gpt-5.3-codex', role: 'Primary reasoning + code' },
  { name: 'gpt-5.4-mini', role: 'Fast default worker' },
  { name: 'gpt-5.4-nano', role: 'Cheap fallback / prefilter' },
];

const overviewMetrics: Metric[] = [
  { label: 'Pass Rate', value: '96.8%', detail: 'Thompson routing on eval traffic' },
  { label: 'Latency', value: '420 ms', detail: 'P95 end-to-end response time' },
  { label: 'Cost', value: '$0.018', detail: 'Average cost per successful task' },
  { label: 'Alpha / Beta', value: '0.72 / 0.28', detail: 'Exploit vs explore balance' },
];

const evalSignals = [
  'Routing confidence improved on long-context prompts.',
  'gpt-5.3-codex wins hard tasks; gpt-5.4-mini dominates balanced flows.',
  'gpt-5.4-nano reduces cost on low-risk classification and triage.',
];

export default function App() {
  const [page, setPage] = useState<Page>('overview');
  const [exploreBias, setExploreBias] = useState(28);
  const [taskDifficulty, setTaskDifficulty] = useState<'simple' | 'mixed' | 'hard'>('mixed');

  const simulatedRoute = useMemo(() => {
    const codex = taskDifficulty === 'hard' ? 0.61 : taskDifficulty === 'mixed' ? 0.42 : 0.19;
    const mini = taskDifficulty === 'mixed' ? 0.46 : taskDifficulty === 'simple' ? 0.58 : 0.33;
    const nano = 1 - codex - mini;
    return [
      { ...modelCandidates[0], score: Math.max(0.05, codex) },
      { ...modelCandidates[1], score: Math.max(0.05, mini) },
      { ...modelCandidates[2], score: Math.max(0.05, nano) },
    ];
  }, [taskDifficulty]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AS</div>
          <div>
            <div className="brand-title">Agent Sam</div>
            <div className="brand-subtitle">Command Center</div>
          </div>
        </div>

        <nav className="nav">
          <button className={page === 'overview' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('overview')}>Overview</button>
          <button className={page === 'lab' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('lab')}>Routing Lab</button>
          <button className={page === 'report' ? 'nav-item active' : 'nav-item'} onClick={() => setPage('report')}>Eval Report</button>
        </nav>

        <div className="sidebar-panel">
          <div className="sidebar-label">Active router</div>
          <div className="sidebar-value">Thompson Sampling</div>
          <div className="sidebar-copy">Adaptive choice among gpt-5.3-codex, gpt-5.4-mini, and gpt-5.4-nano.</div>
        </div>
      </aside>

      <main className="main">
        <header className="hero">
          <div>
            <span className="eyebrow">Agent Sam / production eval workspace</span>
            <h1>Agent Sam Command Center</h1>
            <p className="hero-copy">
              Monitor Thompson routing, inspect candidate models, and review eval outcomes in a polished three-page console.
            </p>
          </div>
          <div className="hero-card">
            <div className="hero-card-label">Current mode</div>
            <div className="hero-card-value">Adaptive routing</div>
            <div className="hero-chip-row">
              <span className="chip">Safe</span>
              <span className="chip">Fast</span>
              <span className="chip">Cost-aware</span>
            </div>
          </div>
        </header>

        {page === 'overview' && (
          <section className="page">
            <div className="grid metrics-grid">
              {overviewMetrics.map((metric) => (
                <article className="card metric-card" key={metric.label}>
                  <div className="metric-label">{metric.label}</div>
                  <div className="metric-value">{metric.value}</div>
                  <div className="metric-detail">{metric.detail}</div>
                </article>
              ))}
            </div>

            <div className="grid content-grid">
              <article className="card panel">
                <h2>Routing snapshot</h2>
                <p>
                  Thompson routing is balancing exploration and exploitation while holding latency under control.
                </p>
                <div className="progress-list">
                  {simulatedRoute.map((m) => (
                    <div className="progress-row" key={m.name}>
                      <div>
                        <div className="progress-name">{m.name}</div>
                        <div className="progress-role">{m.role}</div>
                      </div>
                      <div className="progress-bar-wrap">
                        <div className="progress-bar" style={{ width: `${Math.round(m.score * 100)}%` }} />
                      </div>
                      <div className="progress-score">{Math.round(m.score * 100)}%</div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="card panel accent-panel">
                <h2>Key signals</h2>
                <ul className="signal-list">
                  {evalSignals.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </article>
            </div>
          </section>
        )}

        {page === 'lab' && (
          <section className="page">
            <div className="grid content-grid lab-grid">
              <article className="card panel">
                <h2>Routing Lab</h2>
                <p>Adjust a simplified exploration knob and choose a task profile to simulate the router.</p>

                <label className="control">
                  <div className="control-row">
                    <span>Exploration bias</span>
                    <strong>{exploreBias}%</strong>
                  </div>
                  <input type="range" min="0" max="100" value={exploreBias} onChange={(e) => setExploreBias(Number(e.target.value))} />
                </label>

                <div className="segmented">
                  {(['simple', 'mixed', 'hard'] as const).map((mode) => (
                    <button key={mode} className={taskDifficulty === mode ? 'segment active' : 'segment'} onClick={() => setTaskDifficulty(mode)}>
                      {mode}
                    </button>
                  ))}
                </div>

                <div className="lab-result">
                  <div className="lab-result-title">Recommended route</div>
                  <div className="lab-route">{taskDifficulty === 'hard' ? 'gpt-5.3-codex' : taskDifficulty === 'simple' ? 'gpt-5.4-nano' : 'gpt-5.4-mini'}</div>
                  <div className="lab-copy">Higher exploration can reveal cheaper wins; lower exploration favors stable high-confidence picks.</div>
                </div>
              </article>

              <article className="card panel">
                <h2>Candidate comparison</h2>
                <div className="candidate-list">
                  {modelCandidates.map((m, idx) => (
                    <div className="candidate-item" key={m.name}>
                      <div>
                        <div className="candidate-name">{m.name}</div>
                        <div className="candidate-role">{m.role}</div>
                      </div>
                      <div className="candidate-badge">#{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          </section>
        )}

        {page === 'report' && (
          <section className="page">
            <div className="grid content-grid">
              <article className="card panel report-panel">
                <h2>Eval Report</h2>
                <div className="report-stats">
                  <div>
                    <div className="stat-label">Pass rate</div>
                    <div className="stat-value">96.8%</div>
                  </div>
                  <div>
                    <div className="stat-label">P95 latency</div>
                    <div className="stat-value">420 ms</div>
                  </div>
                  <div>
                    <div className="stat-label">Avg cost</div>
                    <div className="stat-value">$0.018</div>
                  </div>
                </div>
                <div className="report-table">
                  <div className="report-row header"><span>Model</span><span>Win rate</span><span>Notes</span></div>
                  <div className="report-row"><span>gpt-5.3-codex</span><span>54%</span><span>Best on hard reasoning</span></div>
                  <div className="report-row"><span>gpt-5.4-mini</span><span>39%</span><span>Best all-around balance</span></div>
                  <div className="report-row"><span>gpt-5.4-nano</span><span>7%</span><span>Used for cheap triage</span></div>
                </div>
              </article>

              <article className="card panel accent-panel">
                <h2>Decision</h2>
                <p>
                  Keep Thompson routing enabled with a moderate exploration budget. Route difficult tasks to gpt-5.3-codex,
                  use gpt-5.4-mini for most traffic, and reserve gpt-5.4-nano for low-risk shortcuts.
                </p>
                <div className="status-box">
                  <span className="status-dot" />
                  Ready for rollout
                </div>
              </article>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}