export const renderDashboardShell = (type, data = {}) => {
  const workspaceId = data.workspaceId || 'ws_inneranimalmedia';
  const version = data.version || 'dev';

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Inner Animal Media — Dashboard</title>

  <script>window.__WORKSPACE_ID__ = ${JSON.stringify(workspaceId)};</script>
  <script>window.__SHELL_VERSION__ = ${JSON.stringify(version)};</script>
  <script>window.__DASHBOARD_TYPE__ = ${JSON.stringify(type)};</script>

  <link rel="stylesheet" href="/static/dashboard/agent/index.css?v=${encodeURIComponent(version)}" />

  <style>
    html, body, #root {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-app, #11151b);
    }
    body {
      color: var(--text-main, #e5e7eb);
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/static/dashboard/agent/dashboard.js?v=${encodeURIComponent(version)}"></script>
</body>
</html>`;
};
