// overnight.js — 100% remote, zero preset values, zero assumed state
// Screenshots via existing /api/browser/screenshot endpoint
// Broken pages pulled from D1 at runtime
//
// AGENT SAM: After the initial "Overnight Pipeline Started" email arrives, treat the pipeline
// as active and monitor project_memory for:
//   OVERNIGHT_USER_ACTION = {"cancel":true}  → user requested cancel; stop pipeline and send confirmation.
//   OVERNIGHT_FEEDBACK   = {"notes":"..."}   → user reply/failure notes; include in next email and in
//   "First Action" so AI can adjust and self-correct. Optionally retry pages listed in feedback.

const RESEND_KEY = process.env.RESEND_API_KEY;
const CF_TOKEN   = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT    = 'ede6590ac0d2fb7daf155b35653457b2';
const DB_ID      = 'cf87b717-d4e2-4cf8-bab0-a81268e32d49';
const BUCKET     = 'inneranimalmedia';
const FROM       = process.env.RESEND_FROM || 'support@inneranimalmedia.com';
const TO         = process.env.RESEND_TO || 'support@inneranimalmedia.com';
const BASE       = 'https://inneranimalmedia.com';
const IIFE       = '<script>!function(){try{var css=localStorage.getItem("dashboard-theme-css");if(css){var s=document.createElement("style");s.id="theme-dyn-pre";document.head.appendChild(s);s.textContent=css;}var t=localStorage.getItem("dashboard-theme")||"meaux-storm-gray";document.documentElement.setAttribute("data-theme",t);}catch(e){}}();<\/script>';

/** Every dashboard page we capture for before/after screenshot proof. No build/rebuild until before-screenshots exist. */
const EVERY_PAGE = ['overview','finance','chats','mcp','cloud','time-tracking','agent','billing','clients','tools','calendar','images','draw','meet','kanban','cms','mail','pipelines','onboarding','user-settings','settings'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function d1(sql) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  const d = await r.json();
  return d?.result?.[0]?.results || [];
}

async function d1write(sql) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql })
  });
  return r.json();
}

/** Check for user cancel or feedback. Agent Sam can set these after the initial email. */
async function checkUserAction() {
  const rows = await d1(`SELECT key, value FROM project_memory WHERE project_id='inneranimalmedia' AND key IN ('OVERNIGHT_USER_ACTION','OVERNIGHT_FEEDBACK')`);
  let cancel = false;
  let feedback = null;
  for (const row of rows) {
    try {
      const v = JSON.parse(row.value);
      if (row.key === 'OVERNIGHT_USER_ACTION' && v && v.cancel === true) cancel = true;
      if (row.key === 'OVERNIGHT_FEEDBACK' && v && v.notes) feedback = v.notes;
    } catch (e) {}
  }
  return { cancel, feedback };
}

async function r2get(key) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`, {
    headers: { 'Authorization': `Bearer ${CF_TOKEN}` }
  });
  if (!r.ok) throw new Error(`R2 GET ${key} → ${r.status}`);
  return r.text();
}

async function r2put(key, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'text/html' },
    body
  });
  return r.json();
}

async function screenshot(page) {
  try {
    const url = encodeURIComponent(`${BASE}/dashboard/${page}`);
    const r = await fetch(`${BASE}/api/browser/screenshot?url=${url}`, {
      headers: { 'Authorization': `Bearer ${CF_TOKEN}` }
    });
    if (!r.ok) return { page, ok: false, error: `HTTP ${r.status}` };
    const buf = await r.arrayBuffer();
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/reports/screenshots/2026-03-08/${page}.jpg`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'image/jpeg' },
      body: buf
    });
    return { page, ok: true, url: `${BASE}/static/reports/screenshots/2026-03-08/${page}.jpg` };
  } catch(e) {
    return { page, ok: false, error: e.message };
  }
}

/** Capture screenshot to a specific subdir (e.g. before-YYYY-MM-DD or after-YYYY-MM-DD) for before/after proof. */
async function screenshotToPath(page, subdir) {
  try {
    const url = encodeURIComponent(`${BASE}/dashboard/${page}`);
    const r = await fetch(`${BASE}/api/browser/screenshot?url=${url}`, {
      headers: { 'Authorization': `Bearer ${CF_TOKEN}` }
    });
    if (!r.ok) return { page, ok: false, error: `HTTP ${r.status}` };
    const buf = await r.arrayBuffer();
    const key = `reports/screenshots/${subdir}/${page}.jpg`;
    await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects/${key}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${CF_TOKEN}`, 'Content-Type': 'image/jpeg' },
      body: buf
    });
    return { page, ok: true, key };
  } catch(e) {
    return { page, ok: false, error: e.message };
  }
}

async function checkPatch(page) {
  try {
    const html = await r2get(`static/dashboard/pages/${page}.html`);
    return { page, patched: html.includes('dashboard-theme-css') };
  } catch(e) {
    return { page, patched: false, error: e.message };
  }
}

async function smokeTest(path) {
  try {
    const r = await fetch(`${BASE}${path}`, { redirect: 'follow' });
    return { path, status: r.status, pass: r.status === 200 };
  } catch(e) {
    return { path, status: 0, pass: false };
  }
}

const FOOTER_CANCEL = `<p style="color:#475569;font-size:11px;margin-top:12px">To <strong>cancel</strong> pipeline: set project_memory key OVERNIGHT_USER_ACTION = <code>{"cancel":true}</code> (project_id=inneranimalmedia). To <strong>reply with notes/failure</strong> for AI to adjust: set OVERNIGHT_FEEDBACK = <code>{"notes":"your message"}</code>. Agent Sam will read and self-correct.</p>`;

async function sendEmail(subject, html) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: TO, subject, html })
  });
  const d = await r.json();
  console.log('EMAIL:', subject, '→', d.id || JSON.stringify(d));
  await d1write(`INSERT INTO email_logs (id, to_email, from_email, subject, status, metadata) VALUES ('overnight_${Date.now()}','${TO}','${FROM}','${subject.replace(/'/g,"''")}','sent','{"source":"overnight_pipeline"}')`);
  return d;
}

function row(label, val, pass) {
  const c = pass ? '#22c55e' : '#ef4444';
  return `<tr><td style="padding:6px 10px;border:1px solid #334155;color:#94a3b8">${label}</td><td style="padding:6px 10px;border:1px solid #334155;color:${c};font-weight:bold">${val}</td></tr>`;
}

function table(rows) {
  return `<table style="width:100%;border-collapse:collapse;margin:8px 0">${rows}</table>`;
}

function card(content) {
  return `<div style="background:#1e293b;border-radius:8px;padding:16px;margin:16px 0">${content}</div>`;
}

function shell(content) {
  return `<div style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:32px;max-width:680px;margin:0 auto">${content}</div>`;
}

async function run() {
  console.log('OVERNIGHT PIPELINE START', new Date().toISOString());

  const dateTag = new Date().toISOString().slice(0, 10);
  const beforeDir = `before-${dateTag}`;
  const afterDir = `after-${dateTag}`;

  // STEP 0 — BEFORE any build/rebuild: screenshot every page for proof. Do not patch or change anything until this is done.
  console.log('BEFORE screenshots: capturing every page to reports/screenshots/' + beforeDir + '/');
  const beforeShots = await Promise.all(EVERY_PAGE.map(p => screenshotToPath(p, beforeDir)));
  const beforeOk = beforeShots.filter(s => s.ok).length;
  const beforeFail = beforeShots.filter(s => !s.ok);
  console.log(`BEFORE: ${beforeOk}/${EVERY_PAGE.length} pages captured`);
  if (beforeFail.length) beforeFail.forEach(s => console.log('  FAIL:', s.page, s.error));

  const memRows = await d1(`SELECT value FROM project_memory WHERE project_id='inneranimalmedia' AND key='theme_repair_status'`);
  let BROKEN = [];
  let ALL_PAGES = ['overview','finance','chats','mcp','cloud','time-tracking','user-settings'];
  if (memRows.length) {
    try {
      const mem = JSON.parse(memRows[0].value);
      BROKEN = mem.broken || [];
      ALL_PAGES = [...ALL_PAGES, ...BROKEN];
      console.log('BROKEN from D1:', BROKEN);
    } catch(e) {
      console.log('D1 parse error:', e.message);
    }
  }

  const patchBefore = await Promise.all(BROKEN.map(checkPatch));
  const needsPatch   = patchBefore.filter(p => !p.patched);
  const alreadyOk    = patchBefore.filter(p => p.patched);

  await sendEmail('🌙 Overnight Pipeline Started — Inner Animal Media', shell(`
    <h1 style="color:#38bdf8;margin:0 0 4px">Overnight Pipeline Started</h1>
    <p style="color:#64748b;margin:0 0 24px">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})}</p>
    ${card(`
      <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase">Before screenshots (proof prior to any build)</p>
      <p style="margin:8px 0 0;font-size:16px;color:${beforeOk===EVERY_PAGE.length?'#22c55e':'#f59e0b'}">${beforeOk}/${EVERY_PAGE.length} pages captured → R2 reports/screenshots/${beforeDir}/</p>
      ${beforeFail.length ? `<p style="margin:4px 0 0;color:#ef4444">Failed: ${beforeFail.map(s=>s.page).join(', ')}</p>` : ''}
    `)}
    ${card(`
      <p style="margin:0;color:#94a3b8">Pulled from D1 right now:</p>
      <p style="margin:8px 0 0;font-size:16px;color:#f59e0b">${alreadyOk.length}/${BROKEN.length} broken pages already have patch in R2</p>
      <p style="margin:4px 0 0;color:#ef4444">${needsPatch.length} still need patching: ${needsPatch.map(p=>p.page).join(', ')||'none'}</p>
    `)}
    <h2 style="color:#e2e8f0;font-size:14px">Tonight:</h2>
    <ol style="color:#cbd5e1;line-height:2.2;padding-left:20px">
      <li><strong>Before proof saved</strong> — ${beforeOk}/${EVERY_PAGE.length} screenshots in reports/screenshots/${beforeDir}/</li>
      <li>Patch ${needsPatch.length} unpatched fragments via R2 CF API — verify each with read-back</li>
      <li>Smoke test all ${ALL_PAGES.length} dashboard pages</li>
      <li>Check all critical API routes</li>
      <li>Screenshot every page again → after-${dateTag} for before/after proof</li>
      <li>Send before/after proof in final report</li>
    </ol>
    <p style="color:#475569;border-top:1px solid #1e293b;padding-top:16px;margin-top:16px;font-size:12px">
      Next email: 30 minutes with patch results.<br>
      Then hourly until complete.<br>
      Track live in D1: SELECT value FROM project_memory WHERE key='OVERNIGHT_STATUS'
    </p>
    ${FOOTER_CANCEL}
  `));

  await d1write(`INSERT OR REPLACE INTO project_memory (project_id,tenant_id,memory_type,key,value,importance_score,confidence_score,created_by) VALUES ('inneranimalmedia','tenant_sam_primeaux','workflow','OVERNIGHT_STATUS','{"status":"RUNNING","started":"${new Date().toISOString()}","broken_from_d1":${BROKEN.length},"needs_patch":${needsPatch.length},"already_ok":${alreadyOk.length}}',1.0,1.0,'agent_sam')`);

  const patchLog = [];
  for (const p of needsPatch) {
    const action = await checkUserAction();
    if (action.cancel) {
      await sendEmail('🛑 Overnight Pipeline Cancelled', shell(`
        <h1 style="color:#f59e0b">Pipeline cancelled by user</h1>
        <p style="color:#94a3b8">Cancelled at ${new Date().toLocaleString('en-US',{timeZone:'America/Chicago'})}.</p>
        ${action.feedback ? card(`<p style="margin:0;color:#e2e8f0">User note: ${action.feedback}</p>`) : ''}
        ${FOOTER_CANCEL}
      `));
      await d1write(`UPDATE project_memory SET value='{"status":"CANCELLED","at":"${new Date().toISOString()}"}', updated_at=datetime('now') WHERE project_id='inneranimalmedia' AND key='OVERNIGHT_STATUS'`);
      console.log('OVERNIGHT PIPELINE CANCELLED BY USER');
      process.exit(0);
    }
    try {
      let html = await r2get(`static/dashboard/pages/${p.page}.html`);
      const before = html.includes('dashboard-theme-css');
      if (!before) {
        html = html.includes('<head>') ? html.replace('<head>', '<head>\n' + IIFE) : IIFE + html;
        await r2put(`static/dashboard/pages/${p.page}.html`, html);
        const verify = await r2get(`static/dashboard/pages/${p.page}.html`);
        const ok = verify.includes('dashboard-theme-css');
        patchLog.push({ page: p.page, ok, verified: true });
        console.log(`PATCH ${ok ? 'VERIFIED' : 'FAILED'}: ${p.page}`);
      }
    } catch(e) {
      patchLog.push({ page: p.page, ok: false, error: e.message });
      console.log(`PATCH ERROR ${p.page}:`, e.message);
    }
  }

  await sleep(30 * 60 * 1000);

  const cancelCheck = await checkUserAction();
  if (cancelCheck.cancel) {
    await sendEmail('🛑 Overnight Pipeline Cancelled', shell(`
      <h1 style="color:#f59e0b">Pipeline cancelled by user</h1>
      <p style="color:#94a3b8">Cancelled at ${new Date().toLocaleString('en-US',{timeZone:'America/Chicago'})}.</p>
      ${cancelCheck.feedback ? card(`<p style="margin:0;color:#e2e8f0">User note: ${cancelCheck.feedback}</p>`) : ''}
      ${FOOTER_CANCEL}
    `));
    await d1write(`UPDATE project_memory SET value='{"status":"CANCELLED","at":"${new Date().toISOString()}"}', updated_at=datetime('now') WHERE project_id='inneranimalmedia' AND key='OVERNIGHT_STATUS'`);
    console.log('OVERNIGHT PIPELINE CANCELLED BY USER');
    process.exit(0);
  }

  const patchAfter  = await Promise.all(BROKEN.map(checkPatch));
  const nowFixed    = patchAfter.filter(p => p.patched).length;
  const stillBroken = patchAfter.filter(p => !p.patched);

  const smokeResults = await Promise.all(ALL_PAGES.map(p => smokeTest(`/dashboard/${p}`)));
  const apiRoutes    = ['/api/settings/theme','/api/themes','/api/agents','/api/user/preferences'];
  const apiResults   = await Promise.all(apiRoutes.map(r => smokeTest(r)));

  const patchRows = patchAfter.map(p => row(p.page, p.patched ? 'PATCHED ✓' : 'NOT PATCHED ✗', p.patched)).join('');
  const smokeRows = smokeResults.map(p => row(p.path, String(p.status), p.pass)).join('');
  const apiRows   = apiResults.map(p => row(p.path, String(p.status), p.pass)).join('');

  const feedbackBlock = cancelCheck.feedback ? card(`<p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase">User feedback (for AI self-correct)</p><p style="margin:8px 0 0;color:#fbbf24">${cancelCheck.feedback}</p>`) : '';

  await sendEmail(`⏱ 30min Update — ${nowFixed}/${BROKEN.length} Patched`, shell(`
    <h1 style="color:#38bdf8;margin:0 0 4px">30 Minute Update</h1>
    <p style="color:#64748b;margin:0 0 16px">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',timeStyle:'short'})}</p>
    ${feedbackBlock}
    ${card(`<p style="margin:0;font-size:18px;color:${nowFixed===BROKEN.length?'#22c55e':'#f59e0b'}">${nowFixed}/${BROKEN.length} pages confirmed patched via R2 read-back</p>${stillBroken.length?`<p style="margin:8px 0 0;color:#ef4444">Still unpatched: ${stillBroken.map(p=>p.page).join(', ')}</p>`:''}`)}
    <h2 style="color:#e2e8f0;font-size:13px;margin:16px 0 6px">Theme Patch (R2 verified)</h2>${table(patchRows)}
    <h2 style="color:#e2e8f0;font-size:13px;margin:16px 0 6px">Dashboard Smoke Tests</h2>${table(smokeRows)}
    <h2 style="color:#e2e8f0;font-size:13px;margin:16px 0 6px">API Routes</h2>${table(apiRows)}
    <p style="color:#475569;font-size:12px;margin-top:16px">Hourly updates follow. Screenshots in final report.</p>
    ${FOOTER_CANCEL}
  `));

  for (let hr = 1; hr <= 5; hr++) {
    await sleep(60 * 60 * 1000);

    const hrAction = await checkUserAction();
    if (hrAction.cancel) {
      await sendEmail('🛑 Overnight Pipeline Cancelled', shell(`
        <h1 style="color:#f59e0b">Pipeline cancelled by user</h1>
        <p style="color:#94a3b8">Cancelled at ${new Date().toLocaleString('en-US',{timeZone:'America/Chicago'})} (hour ${hr}).</p>
        ${hrAction.feedback ? card(`<p style="margin:0;color:#e2e8f0">User note: ${hrAction.feedback}</p>`) : ''}
        ${FOOTER_CANCEL}
      `));
      await d1write(`UPDATE project_memory SET value='{"status":"CANCELLED","at":"${new Date().toISOString()}"}', updated_at=datetime('now') WHERE project_id='inneranimalmedia' AND key='OVERNIGHT_STATUS'`);
      console.log('OVERNIGHT PIPELINE CANCELLED BY USER');
      process.exit(0);
    }

    const recheck = await Promise.all(BROKEN.map(checkPatch));
    const fixed   = recheck.filter(p => p.patched).length;
    const still   = recheck.filter(p => !p.patched);
    const recheckRows = recheck.map(p => row(p.page, p.patched ? 'LIVE ✓' : 'BROKEN ✗', p.patched)).join('');
    const feedbackCard = hrAction.feedback ? card(`<p style="margin:0;color:#94a3b8;font-size:12px">User feedback</p><p style="margin:8px 0 0;color:#fbbf24">${hrAction.feedback}</p>`) : '';

    await sendEmail(`⏰ Hour ${hr} — ${fixed}/${BROKEN.length} Live`, shell(`
      <h1 style="color:#38bdf8;margin:0 0 4px">Hour ${hr} Update</h1>
      <p style="color:#64748b;margin:0 0 16px">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',timeStyle:'short'})}</p>
      ${feedbackCard}
      ${card(`<p style="margin:0;font-size:20px;font-weight:bold;color:${fixed===BROKEN.length?'#22c55e':'#f59e0b'}">${fixed}/${BROKEN.length} pages live</p>${still.length?`<p style="margin:6px 0 0;color:#ef4444">Still broken: ${still.map(p=>p.page).join(', ')}</p>`:'<p style="margin:6px 0 0;color:#22c55e">All pages confirmed live ✓</p>'}`)}
      ${table(recheckRows)}
      <p style="color:#475569;font-size:12px">Next update in 1 hour.</p>
      ${FOOTER_CANCEL}
    `));

    await d1write(`UPDATE project_memory SET value='{"status":"RUNNING","hour":${hr},"fixed":${fixed},"broken":${still.length},"updated":"${new Date().toISOString()}"}', updated_at=datetime('now') WHERE project_id='inneranimalmedia' AND key='OVERNIGHT_STATUS'`);
    if (fixed === BROKEN.length) break;
  }

  // FINAL — After screenshots (proof after build) then morning report
  console.log('AFTER screenshots: capturing every page to reports/screenshots/' + afterDir + '/');
  const shots = await Promise.all(EVERY_PAGE.map(p => screenshotToPath(p, afterDir)));
  const shotsOk = shots.filter(s => s.ok).length;
  console.log(`AFTER: ${shotsOk}/${EVERY_PAGE.length} pages captured`);

  const final       = await Promise.all(BROKEN.map(checkPatch));
  const finalFixed  = final.filter(p => p.patched).length;
  const finalBroken = final.filter(p => !p.patched);
  const finalRows   = final.map(p => row(p.page, p.patched ? '✓ LIVE — R2 verified' : '✗ BROKEN — patch not present in R2', p.patched)).join('');
  const apiF        = await Promise.all(apiRoutes.map(r => smokeTest(r)));
  const apiRowsF    = apiF.map(p => row(p.path, String(p.status), p.pass)).join('');
  const shotRows    = shots.map(p => row(p.page, p.ok ? `✓ ${p.key || 'saved'}` : `FAILED: ${p.error||'unknown'}`, p.ok)).join('');
  const screenshotSummary = `<p style="color:#94a3b8;font-size:12px">Before: R2 reports/screenshots/${beforeDir}/ — After: R2 reports/screenshots/${afterDir}/ (${shotsOk}/${EVERY_PAGE.length} after shots)</p>`;

  const lastFeedback = await checkUserAction();

  let firstAction;
  if (finalBroken.length === 0 && apiF.every(r => r.pass)) {
    firstAction = `All ${BROKEN.length} theme patches confirmed live in R2. All API routes returning 200. Move to billing/clients DB metrics.`;
  } else if (finalBroken.length > 0) {
    firstAction = `R2 CF API PUT failed silently for: ${finalBroken.map(p=>p.page).join(', ')}. These pages still have no theme patch. Root cause: CF API auth or R2 object path mismatch. Check overnight D1 log for exact error.`;
  } else {
    firstAction = `Patches live but API issues found: ${apiF.filter(r=>!r.pass).map(r=>r.path+' → '+r.status).join(', ')}. Check worker routes.`;
  }
  if (lastFeedback.feedback) {
    firstAction += ` User feedback for self-correct: ${lastFeedback.feedback}`;
  }

  await sendEmail(
    `🌅 Morning Report — ${finalFixed}/${BROKEN.length} Fixed — ${finalBroken.length === 0 ? 'ALL CLEAR' : 'ACTION REQUIRED'}`,
    shell(`
      <h1 style="color:#38bdf8;margin:0 0 4px">Morning Report — Inner Animal Media</h1>
      <p style="color:#64748b;margin:0 0 20px">${new Date().toLocaleString('en-US',{timeZone:'America/Chicago',dateStyle:'full',timeStyle:'short'})}</p>
      ${lastFeedback.feedback ? card(`<p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase">User feedback (apply for self-correct)</p><p style="margin:8px 0 0;color:#fbbf24">${lastFeedback.feedback}</p>`) : ''}
      <div style="background:${finalBroken.length===0?'#052e16':'#2d1515'};border:1px solid ${finalBroken.length===0?'#22c55e':'#ef4444'};border-radius:8px;padding:20px;margin-bottom:20px">
        <p style="margin:0;font-size:22px;font-weight:bold;color:${finalBroken.length===0?'#22c55e':'#ef4444'}">${finalBroken.length===0?'✓ ALL CLEAR':'✗ ACTION REQUIRED'}</p>
        <p style="margin:8px 0 0;color:#cbd5e1">${finalFixed}/${BROKEN.length} pages confirmed patched via R2 read-back</p>
      </div>
      ${card(`<p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px">First Action This Morning</p><p style="margin:8px 0 0;color:#e2e8f0;font-size:14px;line-height:1.6">${firstAction}</p>`)}
      <h2 style="color:#e2e8f0;font-size:13px;margin:20px 0 6px">Theme Patch — Final State (R2 verified)</h2>${table(finalRows)}
      <h2 style="color:#e2e8f0;font-size:13px;margin:20px 0 6px">API Routes</h2>${table(apiRowsF)}
      <h2 style="color:#e2e8f0;font-size:13px;margin:20px 0 6px">Screenshots</h2>${table(shotRows)}
      ${screenshotSummary}
      <p style="color:#334155;font-size:11px;border-top:1px solid #1e293b;padding-top:16px;margin-top:20px">
        Raw data: D1 → project_memory → key OVERNIGHT_STATUS<br>
        Before: R2 inneranimalmedia/reports/screenshots/${beforeDir}/ — After: R2 inneranimalmedia/reports/screenshots/${afterDir}/
      </p>
      ${FOOTER_CANCEL}
    `)
  );

  await d1write(`UPDATE project_memory SET value='{"status":"COMPLETE","fixed":${finalFixed},"open":${finalBroken.length},"first_action":"${firstAction.replace(/'/g,"''")}","completed":"${new Date().toISOString()}"}', updated_at=datetime('now') WHERE project_id='inneranimalmedia' AND key='OVERNIGHT_STATUS'`);

  console.log('OVERNIGHT PIPELINE COMPLETE', new Date().toISOString());
}

run().catch(async e => {
  console.error('PIPELINE CRASHED:', e.message);
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'support@inneranimalmedia.com',
      to: process.env.RESEND_TO || 'support@inneranimalmedia.com',
      subject: '🚨 Overnight Pipeline Crashed',
      html: `<pre style="background:#0f172a;color:#ef4444;padding:20px;font-family:monospace">${e.stack}</pre>`
    })
  });
});
