#!/usr/bin/env node
/**
 * Build 8 full dashboard pages: shell from cloud.html + fragment from agent-sam/static/dashboard/pages/<name>.html
 * Output: dashboard/<name>.html (for upload to R2 static/dashboard/<name>.html)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CLOUD = path.join(ROOT, 'dashboard', 'cloud.html');
const PAGES_DIR = path.join(ROOT, 'agent-sam', 'static', 'dashboard', 'pages');
const OUT_DIR = path.join(ROOT, 'dashboard');

const PAGES = [
  { name: 'tools', title: 'Dev Tools — Inner Animal Media', activeHref: '/dashboard/tools' },
  { name: 'calendar', title: 'Calendar — Inner Animal Media', activeHref: '/dashboard/calendar' },
  { name: 'kanban', title: 'Kanban — Inner Animal Media', activeHref: '/dashboard/kanban' },
  { name: 'cms', title: 'CMS — Inner Animal Media', activeHref: '/dashboard/cms' },
  { name: 'mail', title: 'Mail — Inner Animal Media', activeHref: '/dashboard/mail' },
  { name: 'pipelines', title: 'Pipelines — Inner Animal Media', activeHref: '/dashboard/pipelines' },
  { name: 'onboarding', title: 'Onboarding — Inner Animal Media', activeHref: '/dashboard/onboarding' },
  { name: 'images', title: 'Images — Inner Animal Media', activeHref: '/dashboard/images' },
];

const cloudRaw = fs.readFileSync(CLOUD, 'utf8');
const cloudLines = cloudRaw.split('\n');

// Shell head: lines 1-292 (no cloud-specific CSS) + "    </style>\n</head>\n"
const shellHeadLines = cloudLines.slice(0, 292);
const shellHead = shellHeadLines.join('\n') + '\n    </style>\n</head>\n';

// Body shell: lines 394-484 (header through </aside>, no <main>)
const bodyStart = cloudLines.slice(393, 484).join('\n');
const mainOpen = '        <main class="main-content">\n';
const mainClose = '        </main>\n        <div class="overlay" id="overlay"></div>\n        <div class="dashboard-mobile-footer"></div>\n';
// Generic script: cloud lines 1065-1110 (profile, agent drawer, hamburger, overlay, sidenav, theme)
const genericScript = cloudLines.slice(1064, 1111).join('\n');

function setActiveNav(html, activeHref) {
  // Remove active from cloud link
  let out = html.replace(/<a href="\/dashboard\/cloud" class="nav-item active">/g, '<a href="/dashboard/cloud" class="nav-item">');
  // Set active on the requested page link (exact href match)
  const linkInactive = '<a href="' + activeHref + '" class="nav-item">';
  const linkActive = '<a href="' + activeHref + '" class="nav-item active">';
  out = out.replace(linkInactive, linkActive);
  return out;
}

function setTitle(html, title) {
  return html.replace(/<title>Cloud — Inner Animal Media<\/title>/, '<title>' + title + '</title>');
}

function getFragmentContent(name) {
  const fragPath = path.join(PAGES_DIR, name + '.html');
  const raw = fs.readFileSync(fragPath, 'utf8');
  const lines = raw.split('\n');
  // Strip first line if it's the theme script
  const first = lines[0] || '';
  const start = (first.trim().startsWith('<script>!function()') && first.includes('dashboard-theme')) ? 1 : 0;
  return lines.slice(start).join('\n');
}

for (const page of PAGES) {
  const fragment = getFragmentContent(page.name);
  let head = setTitle(shellHead, page.title);
  let bodyShell = setActiveNav(bodyStart, page.activeHref);
  const full = head + '\n<body>\n' + bodyShell + mainOpen + '\n' + fragment + '\n' + mainClose + '\n    <script>\n' + genericScript + '\n    </script>\n</body>\n</html>\n';
  const outPath = path.join(OUT_DIR, page.name + '.html');
  fs.writeFileSync(outPath, full, 'utf8');
  console.log('Wrote', outPath);
}
console.log('Done. Upload each to R2: static/dashboard/<name>.html');
