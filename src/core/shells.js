/**
 * src/core/shells.js
 * 
 * High-Fidelity Dashboard Templates for Agent Sam.
 * Pixel-perfect replication of production UI with server-side hydration.
 */

export const renderDashboardShell = (type, data) => {
  const { 
    themeVars = {}, 
    isDark = true, 
    workspaceId = 'ws_sandbox', 
    version = 'v--' 
  } = data;

  // Stable Solarized Dark Defaults (Prevent white screen)
  const defaultVars = {
    '--bg-app': '#00212b',
    '--bg-panel': '#0a2d38',
    '--text-main': '#9cb5bc',
    '--text-muted': '#4a7a87',
    '--text-heading': '#ffffff',
    '--accent': '#2dd4bf',
    '--border-subtle': 'rgba(45, 212, 191, 0.1)'
  };

  // Merge Production DB Variables over Defaults
  const mergedVars = { ...defaultVars, ...themeVars };
  const cssVarsString = Object.entries(mergedVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n            ');

  const shellTitle = type === 'overview' ? 'Overview' : 'Agent Sam';
  
  return `
<!DOCTYPE html>
<html lang="en" data-theme="${isDark ? 'dark' : 'light'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${shellTitle} | Inner Animal Media</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        :root {
            ${cssVarsString}
            --rail-width: 64px;
            --font-ui: 'Nunito', system-ui, sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            background: var(--bg-app); 
            color: var(--text-main); 
            font-family: var(--font-ui); 
            height: 100vh; 
            display: flex; 
            overflow: hidden; 
        }

        /* ICON RAIL */
        .rail { width: var(--rail-width); background: #001b22; border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; align-items: center; padding: 16px 0; gap: 20px; }
        .rail-logo { margin-bottom: 20px; }
        .rail-logo img { width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--border-subtle); }
        .rail-btn { color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; transition: 0.2s; position: relative; }
        .rail-btn:hover { background: rgba(255, 255, 255, 0.05); color: var(--accent); }
        .rail-btn.active { color: var(--accent); background: rgba(45, 212, 191, 0.1); }
        .rail-btn.active::after { content: ''; position: absolute; left: -16px; width: 3px; height: 20px; background: var(--accent); border-radius: 0 4px 4px 0; }

        .shell-main { flex: 1; display: flex; flex-direction: column; background: var(--bg-app); border-right: 1px solid var(--border-subtle); min-width: 0; }
        
        /* HEADER */
        .header { height: 48px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; padding: 0 16px; justify-content: space-between; background: var(--bg-app); }
        .header-left { display: flex; align-items: center; gap: 16px; }
        .workspace-id { font-family: var(--font-mono); font-size: 11px; color: var(--text-heading); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
        .header-right { display: flex; align-items: center; gap: 20px; color: var(--text-muted); }

        .content-area { flex: 1; position: relative; overflow: hidden; display: flex; flex-direction: column; }
        
        /* OVERVIEW DASHBOARD CONTENT */
        .dashboard-container { padding: 48px; max-width: 1000px; width: 100%; margin: 0 auto; }
        .view-title { font-size: 28px; font-weight: 800; color: var(--text-heading); margin-bottom: 24px; }
        .view-desc { font-size: 14px; color: var(--text-muted); margin-bottom: 40px; }

        /* AGENT READY STATE */
        .ready-state { position: absolute; bottom: 100px; right: 48px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; }
        .ready-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; opacity: 0.25; }
        .ready-text h3 { font-size: 16px; font-weight: 800; color: var(--text-heading); margin-bottom: 4px; }
        .ready-text p { font-size: 13px; color: var(--text-muted); }

        /* STATUS BAR */
        .status-bar { height: 28px; background: var(--bg-app); border-top: 1px solid var(--border-subtle); display: flex; align-items: center; padding: 0 12px; font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); gap: 20px; }
        .status-item { display: flex; align-items: center; gap: 6px; }
        .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

        /* CHAT PANEL */
        .side-panel { width: 340px; background: var(--bg-app); display: flex; flex-direction: column; }
        .side-header { height: 48px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; padding: 0 16px; justify-content: flex-end; }
        .side-title { font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--text-heading); letter-spacing: 1px; }

        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 5px; border: 3px solid var(--bg-app); }
    </style>
</head>
<body>
    <nav class="rail">
        <div class="rail-logo"><img src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar"></div>
        <div class="rail-btn ${type === 'overview' ? 'active' : ''}" onclick="location.href='/dashboard/overview'"><i data-lucide="layout-grid"></i></div>
        <div class="rail-btn ${type === 'agent' ? 'active' : ''}" onclick="location.href='/dashboard/agent'"><i data-lucide="layers"></i></div>
        <div class="rail-btn"><i data-lucide="database"></i></div>
        <div style="flex:1"></div>
        <div class="rail-btn"><i data-lucide="settings"></i></div>
    </nav>

    <main class="shell-main">
        <header class="header">
            <div class="header-left">
                <i data-lucide="menu" size="18" style="color:var(--text-muted); cursor:pointer"></i>
                <div class="workspace-id">${workspaceId}</div>
            </div>
            <div class="header-right">
                <i data-lucide="search" size="18"></i>
                <i data-lucide="bell" size="18"></i>
                <div style="font-size:11px; font-weight:800; letter-spacing:1px">AGENT SAM</div>
            </div>
        </header>

        <section class="content-area">
            ${type === 'overview' ? `
                <div class="dashboard-container">
                    <h1 class="view-title">System Overview</h1>
                    <p class="view-desc">Authoritative live infrastructure registry for ${workspaceId}.</p>
                </div>
            ` : `
                <div style="flex:1; display:flex; align-items:center; justify-content:center">
                    <div style="font-size:140px; font-weight:800; opacity:0.04; letter-spacing:12px; user-select:none">AGENT MODE</div>
                </div>
            `}

            <div class="ready-state">
                <div class="ready-icon"><i data-lucide="bot" size="48"></i></div>
                <div class="ready-text">
                    <h3>Ready to optimize?</h3>
                    <p>Connected to ${workspaceId}</p>
                </div>
            </div>
        </section>

        <footer class="status-bar">
            <div class="status-item"><div class="dot"></div> IAM-OK</div>
            <div style="flex:1"></div>
            <div class="status-item">main</div>
            <div class="status-item"><i data-lucide="git-branch" size="12"></i> 70529c0</div>
            <div class="status-item" style="color:var(--text-heading)">${version}</div>
        </footer>
    </main>

    <aside class="side-panel">
        <div class="side-header">
            <div class="side-title">Agent Sam</div>
        </div>
    </aside>

    <script>
        lucide.createIcons();
    </script>
</body>
</html>
  `;
};
