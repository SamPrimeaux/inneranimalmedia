/**
 * src/core/shells.js
 * 
 * AUTHORITATIVE PRODUCTION SHELL REPLICA (1:1)
 * This is a direct port of the live inneranimalmedia.com dashboard shell.
 * DO NOT refactor or simplify. 
 */

export const renderDashboardShell = (type, data) => {
  const { 
    workspaceId = 'ws_inneranimalmedia', 
    version = data.version || 'v1.2.0-1775835017650'
  } = data;

  // Exact replication of the live shell provided by user
  return `
<!DOCTYPE html>
<html lang="en" data-theme="dark" style="--bg-canvas: #1c1e22; --bg-elevated: #262a30; --bg-nav: #1c1e22; --color-text: #e4e7eb; --text-muted: #a6adbb; --color-border: rgba(255,255,255,0.08); --color-primary: #8ab4f8; --text-primary: #e4e7eb; --text-secondary: #a6adbb; --border: rgba(255,255,255,0.08); --bg-surface: #202329; --bg-panel: #262a30; --radius: 8px; --bg-overlay: #1c1e22; --bg-primary: #1c1e22; --bg-secondary: #262a30; --text-nav: #e4e7eb; --text-nav-muted: #a6adbb; --border-nav: rgba(255,255,255,0.08); --accent: #8ab4f8; --accent-primary: #8ab4f8; --border-radius: 8px; --transition: all 0.2s ease; --bg-app: #1c1e22; --text-main: #e4e7eb; --text-heading: #e4e7eb; --border-subtle: rgba(255,255,255,0.08); --border-focus: #8ab4f8; --scene-bg: #1c1e22; --terminal-surface: #262a30; --terminal-chrome: #262a30; --terminal-tab-muted: #a6adbb; --solar-cyan: #8ab4f8; --solar-blue: #8ab4f8;">
<head>
    <script>window.__WORKSPACE_ID__ = "${workspaceId}";</script>
    <meta charset="UTF-8">
    <script>
      (function () {
        var K_CSS = 'inneranimalmedia_theme_css';
        var K_DARK = 'inneranimalmedia_theme_is_dark';
        var L_CSS = 'mcad_theme_css';
        var L_DARK = 'mcad_theme_is_dark';
        try {
          if (!localStorage.getItem(K_CSS) && localStorage.getItem(L_CSS)) {
            localStorage.setItem(K_CSS, localStorage.getItem(L_CSS));
            localStorage.removeItem(L_CSS);
          }
          var d = localStorage.getItem(K_DARK);
          if (d !== '1' && d !== '0') {
            var ld = localStorage.getItem(L_DARK);
            if (ld === '1' || ld === '0') {
              localStorage.setItem(K_DARK, ld);
              localStorage.removeItem(L_DARK);
              d = ld;
            }
          }
          if (d === '1' || d === '0') {
            document.documentElement.setAttribute('data-theme', d === '1' ? 'dark' : 'light');
          }
          var raw = localStorage.getItem(K_CSS);
          if (!raw) return;
          var vars = JSON.parse(raw);
          if (!vars || typeof vars !== 'object') return;
          var root = document.documentElement;
          Object.keys(vars).forEach(function (k) {
            if (vars[k] != null) root.style.setProperty(k, String(vars[k]));
          });
        } catch (e) {}
      })();
    </script>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Inner Animal Media — Agent Sam</title>
    <link rel="preconnect" href="https://inneranimalmedia.com" crossorigin="">
    <link rel="dns-prefetch" href="https://inneranimalmedia.com">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      body {
        margin: 0;
        overflow: hidden;
        font-family: system-ui, -apple-system, sans-serif;
        background-color: var(--bg-app);
        color: var(--text-main);
      }
      .nav-search-container kbd { font-family: monospace; }
    </style>
</head>
<body>
    <div id="root">
        <div class="w-full h-[100dvh] bg-[var(--bg-app)] overflow-hidden text-[var(--text-main)] font-sans flex flex-col">
            <!-- Top Header -->
            <div class="h-10 border-b border-[var(--border-subtle)] bg-[var(--bg-panel)] flex items-center justify-between px-3 shrink-0">
                <div class="flex items-center gap-1 opacity-80 pl-1 shrink-0 min-w-0">
                    <img alt="" class="w-7 h-7 object-contain drop-shadow shrink-0 cursor-pointer" title="Inner Animal Media" src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail">
                </div>
                <div class="flex-1 flex justify-center items-center min-w-0 px-2 gap-2">
                    <div class="nav-search-container w-full max-w-lg hidden lg:block">
                        <button type="button" class="flex flex-col items-stretch w-full px-3 py-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-app)] text-left hover:border-[var(--solar-cyan)]/40 transition-colors gap-0.5">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-[11px] text-[var(--text-muted)] truncate flex-1">workspace: <span class="text-[var(--text-main)] font-medium">${workspaceId}</span></span>
                                <kbd class="hidden xl:inline text-[9px] px-1 py-px rounded border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">Cmd+K</kbd>
                            </div>
                        </button>
                    </div>
                </div>
                <div class="flex gap-0.5 items-center mr-1 shrink-0">
                    <div class="p-1.5 text-[var(--text-muted)]">AGENT SAM</div>
                    <div class="p-1.5"><div class="w-1.5 h-1.5 rounded-full bg-[var(--solar-cyan)]"></div></div>
                </div>
            </div>

            <div class="flex flex-1 overflow-hidden">
                <!-- Sidebar -->
                <div class="hidden md:flex w-12 bg-[var(--bg-panel)] flex-col items-center py-4 gap-4 border-r border-[var(--border-subtle)] shrink-0 z-50">
                    <div class="p-3 text-[var(--text-muted)] active"><i data-lucide="layout-grid"></i></div>
                    <div class="p-3 text-[var(--text-muted)]"><i data-lucide="layers"></i></div>
                    <div class="p-3 text-[var(--text-muted)]"><i data-lucide="database"></i></div>
                    <div class="flex-1"></div>
                    <div class="p-3 text-[var(--text-muted)]"><i data-lucide="settings"></i></div>
                </div>

                <!-- Main Content -->
                <div class="flex-1 flex flex-col min-w-0 relative">
                    <div class="flex-1 flex items-center justify-center relative overflow-hidden">
                        <div class="absolute inset-0 flex items-center justify-center opacity-[0.03] select-none pointer-events-none">
                            <div class="text-[15vw] font-black tracking-tighter">AGENT SAM</div>
                        </div>
                        
                        <div class="relative z-10 flex flex-col items-center gap-4 text-center px-6">
                            <img src="https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/11f6af46-0a3c-482a-abe8-83edc5a8a200/avatar" class="w-16 h-16 rounded-2xl shadow-2xl opacity-80 mb-2">
                            <h2 class="text-2xl font-bold text-[var(--text-heading)]">Ready to optimize?</h2>
                            <p class="text-[var(--text-muted)] max-w-sm">Connected to ${workspaceId}</p>
                        </div>
                    </div>

                    <!-- Status Bar -->
                    <div class="h-7 bg-[var(--bg-panel)] border-t border-[var(--border-subtle)] flex items-center justify-between px-3 text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                        <div class="flex items-center gap-4">
                            <div class="flex items-center gap-1.5">
                                <div class="w-1.5 h-1.5 rounded-full bg-[var(--solar-cyan)]"></div>
                                <span>IAM-OK</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <span>main</span>
                            <div class="flex items-center gap-1">
                                <span>70529c0</span>
                            </div>
                            <span class="text-[var(--text-main)]">${version}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <script src="https://unpkg.com/lucide@latest"></script>
    <script>lucide.createIcons();</script>
</body>
</html>
  `;
};
