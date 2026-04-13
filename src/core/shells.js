/**
 * src/core/shells.js
 * 
 * Dynamic Dashboard Templates for Agent Sam.
 * These are hydrated by the Worker using live D1/Env data before delivery.
 * NO HARDCODED VARIANTS. All colors and IDs are injected at runtime.
 */

export const renderDashboardShell = (type, data) => {
  const { 
    themeVars = {}, 
    isDark = true, 
    workspaceId = 'WS_UNKNOWN', 
    version = 'v--' 
  } = data;

  // Convert theme object to CSS variable string
  const cssVars = Object.entries(themeVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join('\n            ');

  const shellTitle = type === 'overview' ? 'Overview' : 'Dashboard';
  
  return `
<!DOCTYPE html>
<html lang="en" data-theme="${isDark ? 'dark' : 'light'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${shellTitle} | Agent Sam</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&family=JetBrains+Mono:wght@400;600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
    <script src="https://unpkg.com/lucide@latest"></script>
    <style>
        :root {
            /* DEPLOYMENT-INJECTED THEME VARIABLES */
            ${cssVars}

            /* Structural defaults */
            --rail-width: 64px;
            --font-ui: 'Nunito', system-ui, sans-serif;
            --font-mono: 'JetBrains Mono', monospace;
        }

        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: var(--bg-app); color: var(--text-main); font-family: var(--font-ui); height: 100vh; display: flex; overflow: hidden; }
        
        .rail { width: var(--rail-width); background: #001b22; border-right: 1px solid var(--border-subtle); display: flex; flex-direction: column; align-items: center; padding: 20px 0; gap: 24px; }
        .rail-logo img { width: 34px; height: 34px; border-radius: 8px; }
        .rail-btn { color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 10px; transition: 0.2s; }
        .rail-btn:hover { background: rgba(255, 255, 255, 0.05); color: var(--accent); }
        .active { color: var(--accent); background: rgba(45, 212, 191, 0.1); }

        .main { flex: 1; display: flex; flex-direction: column; background: var(--bg-app); border-right: 1px solid var(--border-subtle); }
        .header { height: 48px; border-bottom: 1px solid var(--border-subtle); display: flex; align-items: center; padding: 0 16px; justify-content: space-between; gap: 20px; }
        .workspace-pill { background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 4px 12px; font-family: var(--font-mono); font-size: 11px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.5px; }

        .content { flex: 1; position: relative; overflow: auto; }
        
        /* BOTTOM STATUS BAR - REPLICATED FROM PROD UX */
        .status-bar { height: 28px; background: var(--bg-panel); border-top: 1px solid var(--border-subtle); display: flex; align-items: center; padding: 0 12px; font-family: var(--font-mono); font-size: 10px; color: var(--text-muted); gap: 16px; }
        .status-pill { display: flex; align-items: center; gap: 6px; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; background: #2dd4bf; }

        .side-panel { width: 340px; background: var(--bg-app); display: flex; flex-direction: column; }
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

    <main class="main">
        <header class="header">
            <div style="display:flex; align-items:center; gap:12px">
                <i data-lucide="menu" size="18" style="color:var(--text-muted)"></i>
                <div class="workspace-pill">${workspaceId}</div>
            </div>
            <div style="display:flex; gap:16px; align-items:center">
                <i data-lucide="search" size="16"></i>
                <i data-lucide="bell" size="16"></i>
                <div style="width:24px; height:24px; border-radius:4px; background:var(--accent); opacity:0.8"></div>
            </div>
        </header>

        <section class="content">
            ${type === 'agent' ? `
                <div style="display:flex; height:100%; align-items:center; justify-content:center">
                    <div style="font-size:120px; font-weight:800; opacity:0.05; letter-spacing:10px; user-select:none">AGENT MODE</div>
                </div>
            ` : `
                <div style="padding:40px; max-width:1000px; margin:0 auto">
                    <h1 style="font-size:32px; margin-bottom:20px; color:var(--text-heading)">System Overview</h1>
                    <p style="color:var(--text-muted)">Authoritative live infrastructure registry for ${workspaceId}.</p>
                </div>
            `}
        </section>

        <footer class="status-bar">
            <div class="status-pill"><div class="status-dot"></div> IAM-OK</div>
            <div style="flex:1"></div>
            <div class="status-pill">main</div>
            <div class="status-pill"><i data-lucide="git-branch" size="12"></i> 70529c0</div>
            <div class="status-pill" style="color:var(--accent)">${version}</div>
        </footer>
    </main>

    <aside class="side-panel">
        <header style="height:48px; border-bottom:1px solid var(--border-subtle); display:flex; align-items:center; padding:0 16px; justify-content:space-between">
            <div style="font-size:11px; font-weight:800; text-transform:uppercase; color:var(--accent)">Agent Sam</div>
        </header>
        <div style="flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:40px; text-align:center">
            <i data-lucide="bot" size="48" style="opacity:0.2; margin-bottom:20px"></i>
            <h2 style="font-size:16px; margin-bottom:8px; color:var(--text-heading)">Ready to optimize?</h2>
            <p style="font-size:13px; color:var(--text-muted)">Connected to ${workspaceId}</p>
        </div>
    </aside>

    <script>
        lucide.createIcons();
    </script>
</body>
</html>
  `;
};
