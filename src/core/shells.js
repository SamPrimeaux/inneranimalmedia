/**
 * src/core/shells.js
 * 
 * Embedded HTML shells for the Agent Sam dashboard.
 * Baked directly into the worker build to ensure "it lives in the repo"
 * means it works, regardless of R2 or Static Asset binding state.
 */

export const AGENT_DASHBOARD_SHELL = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Sam Dashboard</title>
    <script>
      (function () {
        const K_CSS = 'inneranimalmedia_theme_css';
        const K_DARK = 'inneranimalmedia_theme_is_dark';
        try {
          const dark = localStorage.getItem(K_DARK);
          if (dark === '1' || dark === '0') {
            document.documentElement.setAttribute('data-theme', dark === '1' ? 'dark' : 'light');
          }
          const raw = localStorage.getItem(K_CSS);
          if (raw) {
            const vars = JSON.parse(raw);
            if (vars && typeof vars === 'object') {
              const root = document.documentElement;
              Object.entries(vars).forEach(([k, v]) => {
                if (v != null) root.style.setProperty(k, String(v));
              });
            }
          }
        } catch (e) {}
      })();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        :root {
            --solar-base03: #00212b;
            --solar-base02: #0a2d38;
            --solar-base01: #4a7a87;
            --solar-base0:  #9cb5bc;
            --solar-cyan:   #2dd4bf;
            --solar-blue:   #3a9fe8;
            --bg-app:       var(--solar-base03);
            --bg-panel:     var(--solar-base02);
            --bg-hover:     rgba(45, 212, 191, 0.08);
            --border-subtle:rgba(45, 212, 191, 0.1);
            --text-main:    var(--solar-base0);
            --text-muted:   var(--solar-base01);
            --text-heading: #fff;
            --accent:       var(--solar-cyan);
            --font-ui:      'Nunito', system-ui, sans-serif;
            --font-mono:    'JetBrains Mono', monospace;
            --rail-width: 64px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg-app); color: var(--text-main); font-family: var(--font-ui); height: 100vh; display: flex; overflow: hidden; }
        .rail { width: var(--rail-width); background: #001b22; border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; align-items: center; padding: 20px 0; gap: 24px; }
        .rail-logo img { width: 34px; height: 34px; border-radius: 8px; }
        .rail-btn { color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; transition: 0.2s; }
        .rail-btn:hover { background: var(--bg-hover); color: var(--accent); }
        .rail-btn.active { background: rgba(45, 212, 191, 0.15); color: var(--accent); }
        .main { flex: 1; display: flex; flex-direction: column; background: var(--bg-app); position: relative; }
        .header { height: 52px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; padding: 0 20px; gap: 20px; }
        .search { flex: 1; max-width: 580px; background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 8px 12px 8px 38px; color: #fff; font-size: 13px; position: relative; }
        .canvas-area { flex: 1; background: #00171e; position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .toolbar { position: absolute; top: 24px; left: 50%; transform: translateX(-50%); background: rgba(10, 45, 56, 0.8); backdrop-filter: blur(12px); border: 1px solid rgba(45, 212, 191, 0.2); border-radius: 14px; display: flex; padding: 5px 8px; gap: 4px; box-shadow: 0 10px 40px rgba(0,0,0,0.5); }
        .tool { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; color: var(--text-muted); cursor: pointer; }
        .tool.active { color: var(--accent); background: rgba(45, 212, 191, 0.15); }
        .agent-sam { width: 340px; background: var(--bg-app); border-left: 1px solid var(--border-subtle); display: flex; flex-direction: column; }
    </style>
</head>
<body>
<div style="display:flex; width:100%; height:100%">
    <nav class="rail">
        <div class="rail-logo"><img src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar"></div>
        <div class="rail-btn" onclick="location.href='/dashboard/overview'"><i data-lucide="layout-grid"></i></div>
        <div class="rail-btn active" onclick="location.href='/dashboard/agent'"><i data-lucide="layers"></i></div>
        <div class="rail-btn"><i data-lucide="database"></i></div>
        <div class="rail-btn"><i data-lucide="terminal"></i></div>
        <div style="flex:1"></div>
        <div class="rail-btn"><i data-lucide="settings"></i></div>
    </nav>
    <main class="main">
        <header class="header">
            <div class="search"><i data-lucide="search" style="position:absolute; left:12px; top:50%; transform:translateY(-50%)" size="16"></i>Search infrastructure...</div>
        </header>
        <section class="canvas-area">
            <div class="toolbar">
                <div class="tool"><i data-lucide="lock" size="14"></i></div>
                <div class="tool active"><i data-lucide="mouse-pointer-2" size="14"></i></div>
                <div class="tool"><i data-lucide="square" size="14"></i></div>
                <div class="tool"><i data-lucide="arrow-right" size="14"></i></div>
                <div class="tool"><i data-lucide="type" size="14"></i></div>
            </div>
            <div style="opacity: 0.1; font-size: 140px; font-weight: 800; user-select: none;">AGENT MODE</div>
        </section>
    </main>
    <aside class="agent-sam">
        <div style="height:52px; border-bottom:1px solid var(--border-subtle); padding:0 16px; display:flex; align-items:center; justify-content:space-between">
            <div style="font-size:11px; font-weight:800; color:var(--solar-blue); text-transform:uppercase">Agent Sam</div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px; text-align:center">
            <i data-lucide="bot" size="48" style="color:var(--text-muted); opacity:0.3; margin-bottom:16px"></i>
            <div style="font-size:16px; color:#fff; font-weight:700">What should we work on?</div>
        </div>
    </aside>
</div>
<script>
    lucide.createIcons();
    (function() {
        const urlParams = new URLSearchParams(window.location.search);
        const version = urlParams.get('v') || 'repo-baked';
        console.log('Shell Version:', version);
    })();
    async function syncActiveTheme() {
        try {
            const res = await fetch('/api/themes/active', { credentials: 'same-origin' });
            if (!res.ok) return;
            const payload = await res.json();
            if (payload && payload.data) {
                const root = document.documentElement;
                Object.entries(payload.data).forEach(([k, v]) => {
                    if (v != null) root.style.setProperty(k, String(v));
                });
            }
        } catch (err) {}
    }
    window.addEventListener('DOMContentLoaded', syncActiveTheme);
</script>
</body>
</html>
`;

export const OVERVIEW_DASHBOARD_SHELL = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Overview | Agent Sam</title>
    <script>
      (function () {
        const K_CSS = 'inneranimalmedia_theme_css';
        const K_DARK = 'inneranimalmedia_theme_is_dark';
        try {
          const dark = localStorage.getItem(K_DARK);
          if (dark === '1' || dark === '0') {
            document.documentElement.setAttribute('data-theme', dark === '1' ? 'dark' : 'light');
          }
          const raw = localStorage.getItem(K_CSS);
          if (raw) {
            const vars = JSON.parse(raw);
            if (vars && typeof vars === 'object') {
              const root = document.documentElement;
              Object.entries(vars).forEach(([k, v]) => {
                if (v != null) root.style.setProperty(k, String(v));
              });
            }
          }
        } catch (e) {}
      })();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        :root {
            --solar-base03: #00212b;
            --solar-base02: #0a2d38;
            --solar-base01: #4a7a87;
            --solar-base0:  #9cb5bc;
            --solar-cyan:   #2dd4bf;
            --solar-blue:   #3a9fe8;
            --bg-app:       var(--solar-base03);
            --bg-panel:     var(--solar-base02);
            --border-subtle:rgba(45, 212, 191, 0.1);
            --text-main:    var(--solar-base0);
            --text-muted:   var(--solar-base01);
            --text-heading: #fff;
            --accent:       var(--solar-cyan);
            --font-ui:      'Nunito', system-ui, sans-serif;
            --font-mono:    'JetBrains Mono', monospace;
            --rail-width: 64px;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg-app); color: var(--text-main); font-family: var(--font-ui); height: 100vh; display: flex; overflow: hidden; }
        .rail { width: var(--rail-width); background: #001b22; border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; align-items: center; padding: 20px 0; gap: 24px; }
        .rail-logo img { width: 34px; height: 34px; border-radius: 8px; }
        .rail-btn { color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; transition: 0.2s; }
        .rail-btn:hover { background: rgba(45, 212, 191, 0.08); color: var(--accent); }
        .rail-btn.active { background: rgba(45, 212, 191, 0.15); color: var(--accent); }
        .main { flex: 1; display: flex; flex-direction: column; overflow-y: auto; background: var(--bg-app); }
        .header { height: 52px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; padding: 0 24px; justify-content: space-between; }
        .content { padding: 32px; max-width: 1200px; margin: 0 auto; width: 100%; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; margin-bottom: 40px; }
        .stat-card { background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 16px; padding: 24px; }
        .stat-label { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-muted); }
        .stat-value { font-size: 28px; font-weight: 700; color: #fff; margin: 4px 0; }
        .agent-sam { width: 340px; border-left: 1px solid var(--border-subtle); background: color-mix(in srgb, var(--bg-app) 95%, black); }
    </style>
</head>
<body>
<nav class="rail">
    <div class="rail-logo"><img src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar"></div>
    <div class="rail-btn active" onclick="location.href='/dashboard/overview'"><i data-lucide="layout-grid"></i></div>
    <div class="rail-btn" onclick="location.href='/dashboard/agent'"><i data-lucide="layers"></i></div>
    <div class="rail-btn"><i data-lucide="database"></i></div>
    <div style="flex:1"></div>
    <div class="rail-btn"><i data-lucide="settings"></i></div>
</nav>
<main class="main">
    <header class="header">
        <div style="font-size:14px; color:var(--text-muted)">Overview Dashboard</div>
    </header>
    <div class="content">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Active Deployments</div>
                <div class="stat-value">124</div>
                <div style="font-size:12px; color:var(--solar-cyan)">Healthy Stack</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Global Traffic</div>
                <div class="stat-value">22.4M</div>
                <div style="font-size:12px; color:var(--solar-blue)">99.98% uptime</div>
            </div>
        </div>
        <div style="font-size:20px; font-weight:700; color:#fff; margin-bottom:24px">Active Infrastructure</div>
        <div style="background:var(--bg-panel); border:1px solid var(--border-subtle); border-radius:20px; padding:32px; text-align:center; color:var(--text-muted)">
            Project analytics baked into repo. Deployment sync active.
        </div>
    </div>
</main>
<aside class="agent-sam">
    <div style="height:52px; border-bottom:1px solid var(--border-subtle); padding:0 16px; display:flex; align-items:center; justify-content:space-between">
        <div style="font-size:11px; font-weight:800; color:var(--solar-blue); text-transform:uppercase">Agent Sam</div>
    </div>
</aside>
<script>
    lucide.createIcons();
    async function syncActiveTheme() {
        try {
            const res = await fetch('/api/themes/active', { credentials: 'same-origin' });
            if (!res.ok) return;
            const payload = await res.json();
            if (payload && payload.data) {
                const root = document.documentElement;
                Object.entries(payload.data).forEach(([k, v]) => {
                    if (v != null) root.style.setProperty(k, String(v));
                });
            }
        } catch (err) {}
    }
    window.addEventListener('DOMContentLoaded', syncActiveTheme);
</script>
</body>
</html>
`;
