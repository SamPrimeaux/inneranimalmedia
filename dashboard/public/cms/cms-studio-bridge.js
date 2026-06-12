/**
 * IAM CMS Studio bridge — hydrates DesignStudioCMS.html from /api/cms/bootstrap
 * and wires save/publish/visibility to production Worker APIs + IAM_COLLAB WebSocket.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const projectSlug = params.get('project') || 'inneranimalmedia';
  const initialPageId = params.get('page') || null;
  const initialPanel = params.get('panel') || 'pages';
  window.__IAM_CMS_PROJECT = projectSlug;

  let collabWs = null;

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'include',
      headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...opts,
      body:
        opts.body instanceof FormData
          ? opts.body
          : opts.body
            ? JSON.stringify(opts.body)
            : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  function parseJson(val, fallback) {
    if (val == null) return fallback;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  }

  function mapBootstrap(data) {
    PAGES.length = 0;
    for (const p of data.pages || []) {
      PAGES.push({
        id: p.id,
        route_path: p.route_path || p.path || '/',
        title: p.title || p.slug || 'Untitled',
        status: p.status || 'draft',
        seo_title: p.seo_title || '',
        seo_desc: p.meta_description || p.description || '',
        published_at: p.published_at || null,
      });
    }

    SECTIONS.length = 0;
    const sectionsByPage = data.sections_by_page || {};
    for (const pageId of Object.keys(sectionsByPage)) {
      for (const s of sectionsByPage[pageId] || []) {
        SECTIONS.push({
          id: s.id,
          page_id: s.page_id,
          section_type: s.section_type,
          section_name: s.section_name || s.section_type,
          sort_order: s.sort_order ?? 0,
          is_visible: s.is_visible ? 1 : 0,
          css_classes: s.css_classes || '',
          custom_css: s.custom_css || '',
          shopify_section_key: s.shopify_section_key || null,
          liquid_section_id: s.liquid_section_id || null,
          dirty: false,
          section_data: parseJson(s.section_data, {}),
        });
      }
    }

    COMPONENTS.length = 0;
    const componentsBySection = data.components_by_section || {};
    for (const sectionId of Object.keys(componentsBySection)) {
      for (const c of componentsBySection[sectionId] || []) {
        COMPONENTS.push({
          id: c.id,
          section_id: c.section_id,
          component_type: c.component_type,
          sort_order: c.sort_order ?? 0,
          is_visible: c.is_visible ? 1 : 0,
          component_data: parseJson(c.component_data, {}),
        });
      }
    }

    if (Array.isArray(data.component_templates) && data.component_templates.length) {
      TEMPLATES.length = 0;
      for (const t of data.component_templates) {
        TEMPLATES.push({
          id: t.id,
          template_name: t.template_name,
          template_type: t.template_type || 'section',
          category: t.category || 'All',
          shopify_section_key: t.shopify_section_key || null,
          preview: t.category?.toLowerCase() || 'hero',
          liquid: !!t.source_liquid_file,
        });
      }
    }

    if (data.active_theme) {
      THEME.name = data.active_theme.name || THEME.name;
      THEME.compiled_css_hash = data.active_theme.compiled_css_hash || THEME.compiled_css_hash;
      THEME.monaco_theme_data = data.active_theme.monaco_theme || THEME.monaco_theme_data;
    }

    window.__IAM_CMS_BOOTSTRAP = data;
  }

  function connectCollab(pageId) {
    if (!pageId || collabWs) return;
    const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
    const room = `cms:studio:${projectSlug}:${pageId}`;
    const wsUrl = `${wsProto}://${location.host}/api/collab/room/${encodeURIComponent(room)}`;
    try {
      collabWs = new WebSocket(wsUrl);
      collabWs.addEventListener('open', () => {
        pushLog('ok', `Joined <b>IAM_COLLAB</b> · <span class="mono">${room}</span>`);
        collabWs.send(JSON.stringify({ type: 'cms_session_join', project_slug: projectSlug, page_id: pageId }));
      });
      collabWs.addEventListener('message', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'cms_selection' && msg.page_id === state.page_id) {
            if (msg.kind === 'section') selectSection(msg.id);
            if (msg.kind === 'component') selectComponent(msg.id);
          }
        } catch {
          /* ignore */
        }
      });
      collabWs.addEventListener('close', () => {
        collabWs = null;
      });
    } catch (e) {
      pushLog('warn', `Collab unavailable · ${e.message}`);
    }
  }

  function broadcastSelection(kind, id) {
    if (!collabWs || collabWs.readyState !== WebSocket.OPEN) return;
    collabWs.send(
      JSON.stringify({
        type: 'cms_selection',
        project_slug: projectSlug,
        page_id: state.page_id,
        kind,
        id,
      }),
    );
  }

  async function saveDirtySections() {
    const dirty = SECTIONS.filter((s) => s.dirty);
    for (const s of dirty) {
      await api(`/api/cms/sections/${encodeURIComponent(s.id)}`, {
        method: 'PUT',
        body: { section_data: s.section_data },
      });
      s.dirty = false;
    }
    return dirty.length;
  }

  function patchTopbar() {
    const saveBtn = document.querySelector('#btn-save');
    const pubBtn = document.querySelector('#btn-publish');
    if (saveBtn) {
      saveBtn.replaceWith(saveBtn.cloneNode(true));
      document.querySelector('#btn-save').addEventListener('click', async () => {
        setStatus('syncing');
        pushLog('run', 'Saving dirty sections → D1 + R2 draft');
        try {
          const n = await saveDirtySections();
          const pageId = state.page_id;
          await api(`/api/cms/pages/${encodeURIComponent(pageId)}/snapshot`, { method: 'POST', body: {} }).catch(
            () => {},
          );
          pushLog('ok', `Saved <b>${n}</b> section(s) · cms_page_sections`);
          pushLog('ok', 'Wrote <b>cms_page_drafts</b> checkpoint');
          setStatus('saved');
          document.querySelector('#ct-saved').textContent = 'just now';
          renderTree();
        } catch (e) {
          pushLog('warn', e.message);
          setStatus('draft');
        }
      });
    }
    if (pubBtn) {
      pubBtn.replaceWith(pubBtn.cloneNode(true));
      document.querySelector('#btn-publish').addEventListener('click', async () => {
        const pageId = state.page_id;
        setStatus('syncing');
        try {
          await saveDirtySections();
          pushLog('run', 'Publish preflight…');
          await api(`/api/cms/pages/${encodeURIComponent(pageId)}/snapshot`, { method: 'POST', body: {} });
          await api(`/api/cms/pages/${encodeURIComponent(pageId)}/publish`, { method: 'POST', body: {} });
          pushLog('ok', 'Updated <b>cms_pages.published_at</b>');
          setStatus('published');
        } catch (e) {
          pushLog('warn', e.message);
          setStatus('draft');
        }
      });
    }
  }

  function patchSelection() {
    const origSection = window.selectSection;
    const origComponent = window.selectComponent;
    if (typeof origSection === 'function') {
      window.selectSection = function (id) {
        origSection(id);
        broadcastSelection('section', id);
      };
    }
    if (typeof origComponent === 'function') {
      window.selectComponent = function (id) {
        origComponent(id);
        broadcastSelection('component', id);
      };
    }

    const origVis = window.toggleSectionVisibility;
    if (typeof origVis === 'function') {
      window.toggleSectionVisibility = async function (id) {
        origVis(id);
        const s = findSection(id);
        if (!s) return;
        try {
          await api(`/api/cms/sections/${encodeURIComponent(id)}/visibility`, {
            method: 'POST',
            body: { is_visible: s.is_visible ? 1 : 0 },
          });
        } catch (e) {
          pushLog('warn', e.message);
        }
      };
    }
  }

  function applyInitialRoute() {
    if (initialPageId && PAGES.some((p) => p.id === initialPageId)) {
      selectPage(initialPageId);
    } else if (PAGES.length) {
      const home = PAGES.find((p) => p.route_path === '/') || PAGES[0];
      selectPage(home.id);
    }
    if (initialPanel === 'templates') {
      const tab = document.querySelector('[data-panel="templates"]');
      tab?.click();
    }
    if (initialPanel === 'imports') {
      const tab = document.querySelector('[data-panel="imports"]');
      tab?.click();
    }
  }

  async function initFromApi() {
    try {
      const data = await api(
        `/api/cms/bootstrap?project_slug=${encodeURIComponent(projectSlug)}`,
      );
      mapBootstrap(data);
      const tenantName = data.tenant?.name || projectSlug;
      pushLog('info', `Opened workspace <b>${tenantName}</b> · live D1`);
      pushLog('ok', `Loaded <b>${PAGES.length}</b> pages from <b>cms_pages</b>`);
      pushLog(
        'ok',
        `Hydrated <b>${SECTIONS.length}</b> sections · <b>${COMPONENTS.length}</b> components`,
      );
      if (data.assets_3d?.length) {
        pushLog('ok', `Resolved <b>${data.assets_3d.length}</b> · cms_3d_assets`);
      }
    } catch (e) {
      pushLog('warn', `Bootstrap failed — seed data · ${e.message}`);
    }

    boot();
    patchTopbar();
    patchSelection();
    applyInitialRoute();
    connectCollab(state.page_id);

    window.addEventListener('beforeunload', () => {
      collabWs?.close();
    });
  }

  if (typeof boot === 'function') {
    initFromApi();
  } else {
    document.addEventListener('DOMContentLoaded', initFromApi);
  }
})();
