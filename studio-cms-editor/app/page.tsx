"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createPage as createIamPage,
  createSection as createIamSection,
  getAssets,
  getBootstrap,
  getContacts,
  getTemplates,
  publishPage as publishIamPage,
  renameSection,
  reorderSections,
  saveSection as saveIamSection,
  savePageMeta,
  saveThemeVars,
  setSectionVisibility,
} from "../../dashboard/pages/cms/studio/iamApi";

type RailMode = "pages" | "sections" | "components" | "templates" | "media" | "crm" | "settings";
type InspectorTab = "content" | "style" | "page" | "theme" | "crm";
type Viewport = "phone" | "tablet" | "desktop";
type Toast = { id: number; type: "success" | "warning" | "error" | "info"; message: string; action?: string };
type Section = { id: string; name: string; type: string; zone: "HEADER" | "BODY" | "FOOTER" | "TEMPLATE"; visible: boolean; color: string; fields: Record<string, any>; css?: Record<string, any> };
type PageData = { id: string; title: string; slug: string; status: "live" | "draft" | "new"; type: string; parent?: string; sections: Section[]; metaTitle: string; metaDescription: string };
type Site = { id: string; name: string; initials: string; domain: string; edited: string; color: string; pages: PageData[] };

const railItems: { id: RailMode; label: string; icon: string }[] = [
  { id: "pages", label: "Pages", icon: "file" }, { id: "sections", label: "Sections", icon: "layers" },
  { id: "components", label: "Components", icon: "puzzle" }, { id: "templates", label: "Templates", icon: "grid" },
  { id: "media", label: "Media", icon: "image" }, { id: "crm", label: "CRM", icon: "users" },
  { id: "settings", label: "Settings", icon: "settings" },
];

const iconPaths: Record<string, React.ReactNode> = {
  file: <><path d="M6 2.75h7l5 5v13.5H6z"/><path d="M13 2.75v5h5M9 12h6M9 16h6"/></>,
  layers: <><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
  puzzle: <path d="M19 13h-2.1a2.9 2.9 0 1 0 0-2H15V6h-4V4.1a2.9 2.9 0 1 0-2 0V6H4v5h2.1a2.9 2.9 0 1 1 0 2H4v5h5v2a3 3 0 0 0 6 0v-2h4z"/>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m3 17 5-5 4 4 3-3 6 5"/></>,
  users: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M18 8a3 3 0 0 1 0 6M22 20v-2a4 4 0 0 0-3-3.87"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.55V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.52-1H3v-4h.08A1.7 1.7 0 0 0 4.6 8.95a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.08V3h4v.08A1.7 1.7 0 0 0 15.05 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.13.62.75 1 1.52 1H21v4h-.08A1.7 1.7 0 0 0 19.4 15Z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>, down: <path d="m6 9 6 6 6-6"/>, more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12"/><circle cx="12" cy="12" r="2.5"/></>, eyeoff: <><path d="m3 3 18 18"/><path d="M10.6 6.2A10 10 0 0 1 12 6c6.5 0 10 6 10 6a18 18 0 0 1-2.1 2.8M6.6 6.6C3.7 8.4 2 12 2 12s3.5 6 10 6a10 10 0 0 0 5.4-1.5"/></>,
  phone: <rect x="7" y="2" width="10" height="20" rx="2"/>, tablet: <rect x="5" y="2" width="14" height="20" rx="2"/>, desktop: <><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  undo: <><path d="m9 7-5 5 5 5"/><path d="M20 17a7 7 0 0 0-7-7H4"/></>, redo: <><path d="m15 7 5 5-5 5"/><path d="M4 17a7 7 0 0 1 7-7h9"/></>,
  external: <><path d="M14 3h7v7M21 3l-10 10"/><path d="M18 13v7H4V6h7"/></>, publish: <><path d="M12 16V3M7 8l5-5 5 5"/><path d="M5 14v7h14v-7"/></>,
  collapse: <><path d="M10 4 4 12l6 8M20 4l-6 8 6 8"/></>, close: <path d="m5 5 14 14M19 5 5 19"/>,
  check: <path d="m4 12 5 5L20 6"/>, warning: <><path d="M12 3 2 21h20z"/><path d="M12 9v5M12 18h.01"/></>, info: <><circle cx="12" cy="12" r="10"/><path d="M12 11v6M12 7h.01"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></>, trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v6h16v-6"/></>, filter: <path d="M3 5h18l-7 8v6l-4 2v-8z"/>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1"/></>,
  code: <><path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/></>, menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
};

function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{iconPaths[name] || iconPaths.info}</svg>;
}

const makeSections = (): Section[] => [
  { id: "nav", name: "Main Navigation", type: "Navigation", zone: "HEADER", visible: true, color: "#0c0c10", fields: { brand_name: "Inner Animal", nav_links: ["Work", "Services", "About", "Contact"], nav_cta_label: "Start a project", nav_cta_url: "/contact", sticky: true } },
  { id: "hero", name: "Cinematic Hero", type: "Hero", zone: "BODY", visible: true, color: "#6358ff", fields: { eyebrow: "Independent creative technology studio", hero_title: "Make ambitious ideas feel inevitable.", hero_body: "Strategy, design, and engineering for organizations building what comes next.", hero_primary_cta: "Explore our work", hero_secondary_cta: "Meet the studio", hero_image_url: "https://images.unsplash.com/photo-1558655146-d09347e92766?auto=format&fit=crop&w=1600&q=80", hero_text_color: "#f4f4f8", hero_overlay_opacity: 42 } },
  { id: "logos", name: "Client Marquee", type: "Logo cloud", zone: "BODY", visible: true, color: "#111115", fields: { heading: "Trusted by teams who care about the details", client_names: ["Meauxbility", "Fuel & Free Time", "Companions", "Aperture"] } },
  { id: "services", name: "Selected Services", type: "Feature grid", zone: "BODY", visible: true, color: "#f0efe9", fields: { section_label: "Capabilities", title: "One studio from first thought to final system.", description: "We unite strategy, identity, product design, and production under one roof.", columns: 3, show_index: true, accent_color: "#6358ff", services_json: JSON.stringify([{ title: "Brand systems", body: "Positioning, identity and a language built to last." }, { title: "Digital products", body: "Web experiences and software people understand." }], null, 2), launch_date: "2026-08-14" } },
  { id: "work", name: "Featured Work", type: "Project gallery", zone: "BODY", visible: true, color: "#1c5e46", fields: { title: "Built with conviction.", layout: "Editorial", projects: ["Meauxbility Platform", "Companions of CPAS", "Fuel & Free Time"], video_url: "https://vimeo.com/76979871" } },
  { id: "quote", name: "Client Perspective", type: "Testimonial", zone: "BODY", visible: true, color: "#cfef5b", fields: { quote: "They turned a scattered idea into a system our whole team could see and use.", author_name: "Avery Cole", author_role: "Executive Director", featured: true } },
  { id: "contact", name: "Project CTA", type: "CTA", zone: "BODY", visible: true, color: "#6358ff", fields: { heading: "Have something worth making?", body: "Tell us where you are headed. We will help shape the path.", button_label: "Start the conversation", button_url: "mailto:hello@inneranimal.media" } },
  { id: "footer", name: "Global Footer", type: "Footer", zone: "FOOTER", visible: true, color: "#09090b", fields: { copyright_text: "© 2026 Inner Animal Media", footer_links: ["Privacy", "Accessibility", "Instagram", "LinkedIn"] } },
];

const pageSet = (prefix: string): PageData[] => [
  { id: `${prefix}-home`, title: "Home", slug: "/", status: "live", type: "Home", sections: makeSections(), metaTitle: "Inner Animal Media — Independent Creative Studio", metaDescription: "Strategy, design, and engineering for ambitious organizations." },
  { id: `${prefix}-work`, title: "Work", slug: "/work", status: "live", type: "Interior", sections: makeSections().slice(0, 6), metaTitle: "Selected Work", metaDescription: "A selection of brand systems, products and experiences." },
  { id: `${prefix}-services`, title: "Services", slug: "/services", status: "draft", type: "Interior", sections: makeSections().slice(0, 5), metaTitle: "Services", metaDescription: "Integrated creative and technical services." },
  { id: `${prefix}-about`, title: "About", slug: "/about", status: "live", type: "Interior", sections: makeSections().slice(0, 4), metaTitle: "About the Studio", metaDescription: "A small senior team for consequential work." },
  { id: `${prefix}-contact`, title: "Contact", slug: "/contact", status: "new", type: "Landing", parent: "Company", sections: makeSections().slice(0, 3), metaTitle: "Start a Project", metaDescription: "Tell us what you are building." },
];

const initialSites: Site[] = [
  { id: "iam", name: "Inner Animal Media", initials: "IA", domain: "inneranimal.media", edited: "Just now", color: "#6358ff", pages: pageSet("iam") },
  { id: "fft", name: "Fuel & Free Time", initials: "FF", domain: "fuelnfreetime.com", edited: "18 min ago", color: "#f08a4b", pages: pageSet("fft").map((p, i) => ({ ...p, title: ["Home", "The Collection", "Our Story", "Journal", "Contact"][i] })) },
  { id: "cpas", name: "Companions of CPAS", initials: "CC", domain: "companionscpas.org", edited: "Yesterday", color: "#21c48c", pages: pageSet("cpas").map((p, i) => ({ ...p, title: ["Home", "Adopt", "Services", "About", "Donate"][i] })) },
];

const fallbackComponents = ["Editorial Hero", "Split Hero", "Minimal Navigation", "Logo Marquee", "Service Index", "Project Grid", "Testimonial Reel", "Pricing Matrix", "FAQ Accordion", "Newsletter CTA", "Contact Split", "Utility Footer"];
const fallbackTemplates = ["Aperture Studio", "Northline Agency", "Field Notes", "Common Ground", "Maison Commerce", "Vector SaaS"];

function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => { if (typeof window === "undefined") return initial; try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : initial; } catch { return initial; } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} }, [key, value]);
  return [value, setValue] as const;
}

function Button({ children, icon, kind = "ghost", onClick, disabled, className = "", title }: any) {
  return <button className={`button ${kind} ${className}`} onClick={onClick} disabled={disabled} title={title}>{icon && <Icon name={icon} />}{children}</button>;
}

function Search({ value, onChange, placeholder = "Search" }: any) {
  return <div className="search"><Icon name="search" size={14}/><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}/>{value && <button onClick={() => onChange("")} aria-label="Clear"><Icon name="close" size={12}/></button>}<kbd>⌘F</kbd></div>;
}

function EmptyState({ icon = "search", title, copy, action, onAction }: any) {
  return <div className="empty"><span><Icon name={icon} size={22}/></span><h4>{title}</h4><p>{copy}</p>{action && <Button kind="secondary" onClick={onAction}>{action}</Button>}</div>;
}

function Wireframe({ variant = 0 }: { variant?: number }) {
  return <svg className="wireframe" viewBox="0 0 220 120" aria-hidden><rect x="1" y="1" width="218" height="118" rx="7" fill="#0c0c10" stroke="#2a2a38"/><rect x="15" y="14" width="42" height="5" rx="2" fill="#5a5a70"/><rect x="155" y="14" width="18" height="4" rx="2" fill="#343441"/><rect x="179" y="14" width="25" height="4" rx="2" fill="#6358ff"/>{variant % 3 === 0 ? <><rect x="15" y="42" width="86" height="8" rx="2" fill="#dadbea"/><rect x="15" y="56" width="70" height="8" rx="2" fill="#dadbea"/><rect x="15" y="73" width="75" height="4" rx="2" fill="#494959"/><rect x="15" y="83" width="44" height="11" rx="3" fill="#6358ff"/><rect x="124" y="36" width="80" height="63" rx="5" fill="#202028"/></> : variant % 3 === 1 ? <><rect x="55" y="40" width="110" height="8" rx="2" fill="#dadbea"/><rect x="75" y="55" width="70" height="4" rx="2" fill="#494959"/><rect x="22" y="76" width="52" height="25" rx="4" fill="#202028"/><rect x="84" y="76" width="52" height="25" rx="4" fill="#202028"/><rect x="146" y="76" width="52" height="25" rx="4" fill="#202028"/></> : <><rect x="15" y="37" width="190" height="18" rx="4" fill="#202028"/><rect x="15" y="64" width="90" height="40" rx="4" fill="#202028"/><rect x="115" y="64" width="90" height="40" rx="4" fill="#202028"/></>}</svg>;
}

function Modal({ title, children, onClose, wide = false }: any) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = ref.current?.querySelector("input,button,textarea") as HTMLElement; el?.focus(); const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", fn); return () => window.removeEventListener("keydown", fn); }, [onClose]);
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><div ref={ref} className={`modal ${wide ? "modal-wide" : ""}`}><header><div><span className="modal-kicker">Studio CMS</span><h2>{title}</h2></div><Button icon="close" onClick={onClose} title="Close"/></header>{children}</div></div>;
}

function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return <div className="toast-stack">{toasts.slice(-3).map(t => <div className={`toast ${t.type}`} key={t.id}><span className="toast-icon"><Icon name={t.type === "success" ? "check" : t.type === "warning" ? "warning" : t.type === "error" ? "close" : "info"}/></span><span>{t.message}</span>{t.action && <button>{t.action}</button>}<button className="toast-x" onClick={() => dismiss(t.id)}><Icon name="close" size={12}/></button>{t.type !== "error" && <i/>}</div>)}</div>;
}

type CmsEditorProps = {
  projectSlug?: string;
  initialPageId?: string | null;
  initialPanel?: "pages" | "sections" | "templates" | "imports" | "theme";
  workspaceId?: string;
  siteCatalog?: Array<{ slug: string; name?: string; domain?: string | null }>;
  onSiteChange?: (slug: string) => void;
};

export default function CmsEditor({ projectSlug = "inneranimalmedia", initialPageId = null, initialPanel = "sections", siteCatalog = [], onSiteChange }: CmsEditorProps) {
  const [sites, setSites] = useState(initialSites);
  const [siteId, setSiteId] = useStored("cms-active-site", projectSlug);
  const site = sites.find(s => s.id === siteId) || sites[0];
  const [pageId, setPageId] = useState(initialPageId || site.pages[0].id);
  const page = site.pages.find(p => p.id === pageId) || site.pages[0];
  const [selectedId, setSelectedId] = useState(page.sections[1]?.id || page.sections[0].id);
  const selected = page.sections.find(s => s.id === selectedId) || page.sections[0];
  const [rail, setRail] = useState<RailMode>(initialPanel === "theme" ? "sections" : initialPanel === "imports" ? "templates" : initialPanel);
  const [tab, setTab] = useState<InspectorTab>(initialPanel === "theme" ? "theme" : "content");
  const [sidebarCollapsed, setSidebarCollapsed] = useStored("cms-sidebar-collapsed", false);
  const [inspectorCollapsed, setInspectorCollapsed] = useStored("cms-inspector-collapsed", false);
  const [viewport, setViewport] = useStored<Viewport>("cms-viewport", "desktop");
  const [zoom, setZoom] = useState("Fit");
  const [responsive, setResponsive] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [search, setSearch] = useState("");
  const [siteSwitcher, setSiteSwitcher] = useState(false);
  const [publishMenu, setPublishMenu] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [pageWizard, setPageWizard] = useState(1);
  const [newPage, setNewPage] = useState({ type: "Interior", title: "", slug: "", parent: "None" });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [history, setHistory] = useState<Section[][]>([]);
  const [future, setFuture] = useState<Section[][]>([]);
  const [mediaView, setMediaView] = useState<"grid" | "list">("grid");
  const [mediaFilter, setMediaFilter] = useState("All");
  const [componentFilter, setComponentFilter] = useState("All");
  const [contactId, setContactId] = useState<number | null>(null);
  const [components, setComponents] = useState<string[]>(fallbackComponents);
  const [templateCards, setTemplateCards] = useState<string[]>(fallbackTemplates);
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapNonce, setBootstrapNonce] = useState(0);
  const [theme, setTheme] = useState<Record<string, string>>({ "--brand-primary": "#6358ff", "--brand-secondary": "#1c5e46", "--brand-accent": "#cfef5b", "--color-bg": "#f5f2ea", "--color-surface": "#ffffff", "--color-text": "#101014", "--color-text-muted": "#73737f", "--font-heading": "Inter", "--font-body": "Inter", "--font-mono": "JetBrains Mono", "--font-size-base": "16px", "--radius-md": "12px", "--radius-lg": "22px", "--space-6": "24px", "--section-padding-y": "92px", "--container-max-width": "1200px" });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const themeSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSaveReadyRef = useRef(false);

  const toast = useCallback((message: string, type: Toast["type"] = "success", action?: string) => {
    const id = Date.now(); setToasts(v => [...v, { id, message, type, action }]);
    if (type !== "error") setTimeout(() => setToasts(v => v.filter(x => x.id !== id)), type === "warning" ? 5000 : 3000);
  }, []);
  const dismissToast = (id: number) => setToasts(v => v.filter(x => x.id !== id));

  useEffect(() => {
    setSiteId(projectSlug);
  }, [projectSlug, setSiteId]);

  useEffect(() => {
    if (!siteCatalog.length) return;
    setSites((current) => siteCatalog.map((entry) => {
      const existing = current.find((site) => site.id === entry.slug);
      const name = entry.name || entry.slug;
      return existing || {
        id: entry.slug,
        name,
        initials: name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
        domain: entry.domain || '',
        edited: 'Available',
        color: '#6358ff',
        pages: [],
      };
    }));
  }, [siteCatalog]);

  useEffect(() => {
    let cancelled = false;
    setBootstrapLoading(true);
    setBootstrapError(null);
    getBootstrap(projectSlug, initialPageId)
      .then(({ site: loadedSite, themeVars, templates, homePageId }) => {
        if (cancelled) return;
        setSites((current) => {
          const withoutCurrent = current.filter((entry) => entry.id !== loadedSite.id);
          return [loadedSite, ...withoutCurrent];
        });
        setSiteId(loadedSite.id);
        const targetPage = loadedSite.pages.find((entry) => entry.id === initialPageId)
          || loadedSite.pages.find((entry) => entry.id === homePageId)
          || loadedSite.pages[0];
        if (targetPage) {
          setPageId(targetPage.id);
          setSelectedId(targetPage.sections[0]?.id || "");
        }
        if (Object.keys(themeVars).length) setTheme((current) => ({ ...current, ...themeVars }));
        if (templates.length) {
          setTemplateCards(templates.map((entry: any) => String(entry.template_name || entry.iam_label || entry.slug || "Template")));
          setComponents(templates.filter((entry: any) => String(entry.template_type || "").toLowerCase() !== "page").map((entry: any) => String(entry.template_name || entry.iam_label || entry.slug || "Component")));
        }
        setBootstrapLoading(false);
        if (initialPanel === "imports") setModal("add-section");
      })
      .catch((error) => {
        if (cancelled) return;
        setBootstrapError(error?.message || "Could not load this CMS site");
        setBootstrapLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectSlug, initialPageId, initialPanel, bootstrapNonce, setSiteId]);

  useEffect(() => {
    if (rail !== "media" || mediaItems.length) return;
    getAssets().then(setMediaItems).catch((error) => toast(error?.message || "Could not load assets", "error"));
  }, [rail, mediaItems.length, toast]);

  useEffect(() => {
    if (rail !== "templates" || templateCards.length !== fallbackTemplates.length) return;
    getTemplates().then((items) => items.length && setTemplateCards(items)).catch(() => undefined);
  }, [rail, templateCards.length]);

  useEffect(() => {
    if ((rail !== "crm" && tab !== "crm") || contacts.length) return;
    getContacts().then(setContacts).catch((error) => toast(error?.message || "Could not load contacts", "error"));
  }, [rail, tab, contacts.length, toast]);

  useEffect(() => {
    if (!pageSaveReadyRef.current) {
      pageSaveReadyRef.current = true;
      return;
    }
    if (bootstrapLoading || !page?.id || String(page.id).startsWith("temp-")) return;
    if (pageSaveTimerRef.current) clearTimeout(pageSaveTimerRef.current);
    pageSaveTimerRef.current = setTimeout(() => {
      savePageMeta(page).catch((error) => toast(error?.message || "Page details could not be saved", "error"));
    }, 700);
    return () => { if (pageSaveTimerRef.current) clearTimeout(pageSaveTimerRef.current); };
  }, [page.title, page.slug, page.type, page.metaTitle, page.metaDescription, page.id, bootstrapLoading, toast]);

  const updatePages = useCallback((fn: (pages: PageData[]) => PageData[]) => {
    setSites(all => all.map(s => s.id === site.id ? { ...s, pages: fn(s.pages) } : s));
  }, [site.id]);
  const mutateSections = (fn: (items: Section[]) => Section[]) => {
    setHistory(h => [...h.slice(-19), page.sections.map(s => ({ ...s, fields: { ...s.fields } }))]); setFuture([]);
    updatePages(pages => pages.map(p => p.id === page.id ? { ...p, sections: fn(p.sections) } : p)); setDirty(true);
  };
  const updateField = (key: string, value: any) => mutateSections(items => items.map(s => s.id === selected.id ? { ...s, fields: { ...s.fields, [key]: value } } : s));
  const updateCss = (key: string, value: any) => { mutateSections(items => items.map(s => s.id === selected.id ? { ...s, css: { ...(s.css || {}), [key]: value } } : s)); iframeRef.current?.contentWindow?.postMessage({ type: "cms:style", sectionId: selected.id, css: { [key]: value } }, "*"); };

  const save = useCallback(() => {
    if (!dirty) return;
    setSaving(true);
    const operation = tab === "theme"
      ? saveThemeVars(projectSlug, theme)
      : selected?.id
        ? Promise.all([saveIamSection(selected.id, selected.fields, selected.css), renameSection(selected.id, selected.name)])
        : Promise.reject(new Error("Select a section to save"));
    operation
      .then(() => { setDirty(false); toast(tab === "theme" ? "Theme saved" : "Section saved"); })
      .catch((error) => toast(error?.message || "Save failed", "error"))
      .finally(() => setSaving(false));
  }, [dirty, selected, tab, projectSlug, theme, toast]);
  const undo = useCallback(() => { const prev = history.at(-1); if (!prev) return; setFuture(f => [page.sections, ...f]); setHistory(h => h.slice(0, -1)); updatePages(ps => ps.map(p => p.id === page.id ? { ...p, sections: prev } : p)); toast("Change undone", "info"); }, [history, page, updatePages, toast]);
  const redo = useCallback(() => { const next = future[0]; if (!next) return; setHistory(h => [...h, page.sections]); setFuture(f => f.slice(1)); updatePages(ps => ps.map(p => p.id === page.id ? { ...p, sections: next } : p)); toast("Change restored", "info"); }, [future, page, updatePages, toast]);

  const chooseSection = (id: string) => { if (dirty && id !== selectedId && !window.confirm("You have unsaved changes. Discard and continue?")) return; setSelectedId(id); setDirty(false); setRail("sections"); setTab("content"); iframeRef.current?.contentWindow?.postMessage({ type: "cms:highlight", sectionId: id }, "*"); };
  const choosePage = (id: string) => { if (dirty && !window.confirm("You have unsaved changes. Discard and continue?")) return; const p = site.pages.find(x => x.id === id); if (!p) return; setPageId(id); setSelectedId(p.sections[0]?.id); setDirty(false); toast(`Opened ${p.title}`, "info"); };
  const chooseSite = (id: string) => { const s = sites.find(x => x.id === id); if (!s) return; setSiteSwitcher(false); if (onSiteChange) { onSiteChange(id); toast(`Opening ${s.name}`, "info"); return; } setSiteId(id); if (s.pages[0]) { setPageId(s.pages[0].id); setSelectedId(s.pages[0].sections[0]?.id || ""); } toast(`Switched to ${s.name}`, "info"); };

  useEffect(() => { const t = dirty ? setTimeout(() => { save(); toast("Auto-save started", "info"); }, 30000) : undefined; return () => t && clearTimeout(t); }, [dirty, selected?.fields, save, toast]);
  useEffect(() => { const before = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", before); return () => window.removeEventListener("beforeunload", before); }, [dirty]);
  useEffect(() => { const receive = (e: MessageEvent) => { const m = e.data; if (m?.type === "cms:section-click") chooseSection(m.sectionId); if (m?.type === "cms:ready") iframeRef.current?.contentWindow?.postMessage({ type: "cms:highlight", sectionId: selectedId }, "*"); }; window.addEventListener("message", receive); return () => window.removeEventListener("message", receive); });
  useEffect(() => { const down = (e: KeyboardEvent) => {
    const cmd = e.metaKey || e.ctrlKey; if (cmd && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    if (cmd && !e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
    if (cmd && e.shiftKey && e.key.toLowerCase() === "z") { e.preventDefault(); redo(); }
    if (cmd && e.key.toLowerCase() === "p" && !e.shiftKey) { e.preventDefault(); setPreview(v => !v); }
    if (cmd && e.key.toLowerCase() === "k") { e.preventDefault(); setModal("palette"); }
    if (cmd && e.key === "/") { e.preventDefault(); setModal("shortcuts"); }
    if (cmd && e.shiftKey && e.key === ".") { e.preventDefault(); setSidebarCollapsed(v => !v); }
    if (cmd && e.shiftKey && e.key === ",") { e.preventDefault(); setInspectorCollapsed(v => !v); }
    if (cmd && /^[1-7]$/.test(e.key)) { e.preventDefault(); setRail(railItems[Number(e.key)-1].id); }
    if (e.key === "Escape") { if (preview) setPreview(false); else if (modal) setModal(null); else { setSelectedId(""); iframeRef.current?.contentWindow?.postMessage({ type: "cms:deselect" }, "*"); } }
  }; window.addEventListener("keydown", down); return () => window.removeEventListener("keydown", down); }, [modal, preview, save, undo, redo, setSidebarCollapsed, setInspectorCollapsed]);

  const frameHtml = useMemo(() => {
    const visible = page.sections.filter(s => s.visible);
    const content = visible.map((s, i) => {
      const f = s.fields; const isNav = s.type === "Navigation"; const isFooter = s.type === "Footer"; const img = f.hero_image_url;
      if (isNav) return `<section data-cms-id="${s.id}" class="nav"><b>${f.brand_name}</b><nav>${(f.nav_links || []).map((x:string) => `<span>${x}</span>`).join("")}</nav><button>${f.nav_cta_label}</button></section>`;
      if (s.type === "Hero") return `<section data-cms-id="${s.id}" class="hero" style="background-image:linear-gradient(90deg,rgba(7,7,10,.8),rgba(7,7,10,.15)),url('${img}')"><div><small>${f.eyebrow}</small><h1>${f.hero_title}</h1><p>${f.hero_body}</p><button>${f.hero_primary_cta}</button><a>${f.hero_secondary_cta} →</a></div></section>`;
      if (isFooter) return `<section data-cms-id="${s.id}" class="footer"><b>Inner Animal</b><p>${f.copyright_text}</p><span>${(f.footer_links || []).join(" · ")}</span></section>`;
      return `<section data-cms-id="${s.id}" class="content s${i}" style="background:${s.color}"><small>${f.section_label || s.type}</small><h2>${f.title || f.heading || f.quote || s.name}</h2><p>${f.description || f.body || f.author_name || "Distinctive systems, thoughtfully made."}</p>${f.button_label ? `<button>${f.button_label}</button>` : ""}</section>`;
    }).join("");
    const vars = Object.entries(theme).map(([k,v]) => `${k}:${v}`).join(";");
    return `<!doctype html><html><head><meta charset="utf-8"><style>:root{${vars}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--font-body),Arial;background:#f5f2ea;color:#101014}section{position:relative;transition:.18s;cursor:default}.nav{height:68px;display:flex;align-items:center;padding:0 clamp(24px,6vw,84px);gap:30px;background:#0c0c10;color:white}.nav b{font-size:18px;margin-right:auto}.nav nav{display:flex;gap:22px;font-size:12px;color:#aaa}.nav button,.hero button,.content button{border:0;border-radius:999px;padding:11px 18px;background:var(--brand-primary);color:white}.hero{min-height:620px;background-size:cover;background-position:center;display:flex;align-items:end;padding:clamp(48px,9vw,120px);color:white}.hero>div{max-width:760px}.hero small,.content small{text-transform:uppercase;letter-spacing:.18em;font-size:11px;font-weight:700}.hero h1{font-size:clamp(44px,6.5vw,92px);line-height:.94;letter-spacing:-.055em;margin:20px 0}.hero p{font-size:18px;max-width:580px;line-height:1.6;color:#d8d8de}.hero a{margin-left:18px;font-size:13px}.content{min-height:390px;padding:clamp(60px,9vw,120px);display:flex;flex-direction:column;justify-content:center}.content h2{font-size:clamp(32px,5vw,66px);line-height:1;margin:20px 0;max-width:880px;letter-spacing:-.04em}.content p{max-width:660px;line-height:1.7}.s2,.s5{color:#0d0d10}.footer{min-height:250px;padding:70px;background:#09090b;color:white;display:grid;gap:30px;align-content:center}.cms-highlight{outline:3px solid #4d8dff!important;outline-offset:-3px}.cms-highlight:after{content:attr(data-cms-name);position:absolute;top:5px;left:5px;background:#3b82f6;color:#fff;padding:4px 7px;border-radius:4px;font:11px Arial;z-index:10}</style></head><body>${content}<script>window.parent.postMessage({type:'cms:ready'},'*');document.querySelectorAll('[data-cms-id]').forEach(el=>{el.dataset.cmsName='Section';el.addEventListener('click',e=>{e.stopPropagation();window.parent.postMessage({type:'cms:section-click',sectionId:el.dataset.cmsId},'*')})});addEventListener('message',e=>{const m=e.data;document.querySelectorAll('[data-cms-id]').forEach(x=>x.classList.remove('cms-highlight'));if(m.type==='cms:highlight'){const x=document.querySelector('[data-cms-id="'+m.sectionId+'"]');x&&x.classList.add('cms-highlight')}if(m.type==='cms:scroll-to'){document.querySelector('[data-cms-id="'+m.sectionId+'"]')?.scrollIntoView({behavior:'smooth'})}if(m.type==='cms:theme-vars'){Object.entries(m.vars||{}).forEach(([k,v])=>document.documentElement.style.setProperty(k,v))}if(m.type==='cms:style'){const x=document.querySelector('[data-cms-id="'+m.sectionId+'"]');Object.assign(x?.style,m.css||{})}});addEventListener('scroll',()=>window.parent.postMessage({type:'cms:scroll',scrollY:scrollY},'*'))</script></body></html>`;
  }, [page, theme]);

  const filteredPages = page ? site.pages.filter(p => p.title.toLowerCase().includes(search.toLowerCase())) : [];
  const filteredSections = page.sections.filter(s => s.name.toLowerCase().includes(search.toLowerCase()));

  const createPage = () => {
    setSaving(true);
    createIamPage(projectSlug, { title: newPage.title || "Untitled Page", slug: newPage.slug || "/untitled", type: newPage.type })
      .then((created) => {
        updatePages((items) => [...items, created as PageData]);
        setPageId(created.id);
        setSelectedId("");
        setModal(null);
        setPageWizard(1);
        toast("New page created");
      })
      .catch((error) => toast(error?.message || "Could not create page", "error"))
      .finally(() => setSaving(false));
  };
  const addSection = (name: string) => {
    const fields = { eyebrow: name, title: `A new ${name.toLowerCase()} section`, description: "Select this section to replace the content and shape its presentation." };
    const tempId = `temp-${Date.now()}`;
    const pending: Section = { id: tempId, name, type: name, zone: "BODY", visible: true, color: "#f1efe7", fields };
    mutateSections((items) => [...items, pending]);
    setSelectedId(tempId);
    setModal(null);
    createIamSection(page.id, name, fields, (page.sections.length + 1) * 10)
      .then((created) => {
        updatePages((pages) => pages.map((item) => item.id === page.id ? { ...item, sections: item.sections.map((section) => section.id === tempId ? created as Section : section) } : item));
        setSelectedId(created.id);
        setDirty(false);
        toast(`${name} added`);
      })
      .catch((error) => {
        updatePages((pages) => pages.map((item) => item.id === page.id ? { ...item, sections: item.sections.filter((section) => section.id !== tempId) } : item));
        toast(error?.message || "Could not add section", "error");
      });
  };

  if (preview) return <div className="preview-mode"><iframe srcDoc={frameHtml}/><div className="preview-toolbar"><Button onClick={() => setPreview(false)}>Exit preview</Button><ViewportSwitcher viewport={viewport} setViewport={setViewport}/><Button icon="external" onClick={() => toast("Preview opened in a new tab", "info")}>Open</Button></div></div>;

  return <main className="cms-shell">
    <header className="topbar">
      <div className="site-trigger-wrap"><button className="site-trigger" onClick={() => setSiteSwitcher(v => !v)}><span className="site-avatar" style={{background:site.color}}>{site.initials}</span><span><b>{site.name}</b><small>{site.domain}</small></span><Icon name="down" size={13}/></button>{siteSwitcher && <SiteSwitcher sites={sites} active={site.id} choose={chooseSite} close={() => setSiteSwitcher(false)} newSite={() => { setSiteSwitcher(false); toast("New site setup opened", "info"); }}/>}</div>
      <div className="breadcrumb"><span>{site.name}</span><Icon name="chevron" size={11}/><b>{page.title}</b>{selected && <><Icon name="chevron" size={11}/><span>{selected.name}</span></>}</div>
      <ViewportSwitcher viewport={viewport} setViewport={setViewport}/>
      <div className="top-actions"><div className="collab"><span>SP</span><span>AC</span><small>2 others editing</small></div><Button icon="undo" onClick={undo} disabled={!history.length} title="Undo ⌘Z"/><Button icon="redo" onClick={redo} disabled={!future.length} title="Redo ⌘⇧Z"/><Button icon="external" onClick={() => setPreview(true)}>Preview</Button><div className="publish-wrap"><Button icon="publish" kind="accent" onClick={() => setPublishMenu(v => !v)}>Publish <Icon name="down" size={11}/></Button>{publishMenu && <PublishMenu close={() => setPublishMenu(false)} action={(m:string) => { if (m === "Schedule") { setModal("schedule"); } else if (m === "Publish Section") { save(); } else { setSaving(true); publishIamPage(page.id).then(() => toast("Page published")).catch((error) => toast(error?.message || "Publish failed", "error")).finally(() => setSaving(false)); } setPublishMenu(false); }}/>}</div><button className="user-avatar" onClick={() => toast("Account menu opened", "info")}>SP</button></div>
      <div className="mobile-top"><Button icon="menu" onClick={() => setSidebarCollapsed(false)}/><b>{page.title}</b><Button kind="accent" onClick={() => setPublishMenu(true)}>Publish</Button></div>
    </header>

    <div className="workspace">
      <nav className="rail">{railItems.map((item, i) => <button key={item.id} className={rail === item.id ? "active" : ""} onClick={() => { setRail(item.id); setSidebarCollapsed(false); }} data-tip={`${item.label}  ⌘${i+1}`}><Icon name={item.icon}/></button>)}<button className="rail-collapse" onClick={() => setSidebarCollapsed(v => !v)} data-tip={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}><Icon name="collapse"/></button></nav>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}><SidebarHeader rail={rail} search={search} setSearch={setSearch} action={() => rail === "pages" ? setModal("page") : rail === "sections" ? setModal("add-section") : rail === "media" ? setModal("upload") : toast("New item created")}/><div className="sidebar-scroll">
        {rail === "pages" && <PagesSidebar pages={filteredPages} active={page.id} choose={choosePage} create={() => setModal("page")} toast={toast}/>}
        {rail === "sections" && <SectionsSidebar sections={filteredSections} selected={selectedId} choose={chooseSection} mutate={mutateSections} add={() => setModal("add-section")} toast={toast} onReorder={(ordered:Section[]) => reorderSections(page.id, ordered).catch((error) => toast(error?.message || "Reorder failed", "error"))} onVisibility={(section:Section, visible:boolean) => setSectionVisibility(section.id, visible).catch((error) => toast(error?.message || "Visibility update failed", "error"))} onRename={(section:Section, name:string) => renameSection(section.id, name).catch((error) => toast(error?.message || "Rename failed", "error"))}/>}
        {rail === "components" && <ComponentsSidebar items={components} filter={componentFilter} setFilter={setComponentFilter} search={search} add={addSection}/>}
        {rail === "templates" && <TemplatesSidebar items={templateCards} preview={(name:string) => { setModal(`template:${name}`); }}/>}
        {rail === "media" && <MediaSidebar view={mediaView} setView={setMediaView} filter={mediaFilter} setFilter={setMediaFilter} items={mediaItems} upload={() => setModal("upload")} toast={toast}/>}
        {rail === "crm" && <CrmSidebar contacts={contacts} search={search} select={setContactId} exportCsv={() => toast("Contacts exported as CSV")}/>}
        {rail === "settings" && <SettingsSidebar site={site} toast={toast}/>}
      </div></aside>

      <section className="canvas-area">
        <div className="canvas-ruler"><span>0</span><i/><span>{viewport === "phone" ? "375" : viewport === "tablet" ? "768" : "1440"} px</span><i/><span>{viewport === "phone" ? "375" : viewport === "tablet" ? "768" : "1440"}</span></div>
        <div className="canvas-stage">
          {bootstrapLoading && <div className="canvas-loading"><div className="skeleton-topbar"/><div className="skeleton-hero"/><div className="skeleton-block"/></div>}
          {bootstrapError && !bootstrapLoading && <div className="canvas-error"><h3>Could not load site</h3><p>{bootstrapError}</p><Button kind="accent" onClick={() => setBootstrapNonce((value) => value + 1)}>Retry</Button></div>}
          <div className="section-markers">{page.sections.map((s,i) => <button key={s.id} className={s.id===selectedId ? "active" : ""} onClick={() => { chooseSection(s.id); iframeRef.current?.contentWindow?.postMessage({ type:"cms:scroll-to", sectionId:s.id }, "*"); }}><span>{i+1}</span><b>{s.name}</b></button>)}</div>
          {responsive ? <div className="responsive-three">{(["phone","tablet","desktop"] as Viewport[]).map(v => <div key={v}><label><Icon name={v}/> {v}</label><iframe srcDoc={frameHtml}/></div>)}</div> : <div className={`device-frame ${viewport}`} style={{transform:`scale(${zoom === "50%" ? .5 : zoom === "75%" ? .75 : 1})`}}><div className="loading-line"/><iframe ref={iframeRef} title={`${page.title} preview`} srcDoc={frameHtml}/></div>}
        </div>
        <footer className="canvas-footer"><div><button className={`toggle ${responsive ? "on" : ""}`} onClick={() => setResponsive(v => !v)}><span/></button><span>Responsive preview</span></div><div className="canvas-metrics"><span>Y 0 px</span><span>286 words</span><span>Modified just now</span></div><div className="zoom"><button onClick={() => setZoom("50%")} className={zoom==="50%"?"active":""}>50</button><button onClick={() => setZoom("75%")} className={zoom==="75%"?"active":""}>75</button><button onClick={() => setZoom("100%")} className={zoom==="100%"?"active":""}>100</button><button onClick={() => setZoom("Fit")} className={zoom==="Fit"?"active":""}>Fit</button></div></footer>
        <button className="mobile-fab" onClick={() => setModal("add-section")}><Icon name="plus"/></button>
      </section>

      <aside className={`inspector ${inspectorCollapsed ? "collapsed" : ""}`}>
        <div className="inspector-tabs">{(["content","style","page","theme","crm"] as InspectorTab[]).map(t => <button key={t} className={tab===t?"active":""} onClick={() => setTab(t)}>{t}</button>)}</div>
        {selected && <div className="selected-head"><div><input value={selected.name} onChange={e => mutateSections(items => items.map(s => s.id===selected.id?{...s,name:e.target.value}:s))}/><span>{selected.type}</span></div><Button disabled={!dirty} onClick={() => { setDirty(false); toast("Local changes reverted", "info"); }}>Revert</Button><Button kind="accent" disabled={!dirty || saving} onClick={save}>{saving ? <span className="spinner"/> : "Save"}</Button></div>}
        <div className="inspector-scroll">{tab === "content" && selected && <ContentInspector section={selected} update={updateField} toast={toast}/>} {tab === "style" && selected && <StyleInspector section={selected} update={updateCss}/>} {tab === "page" && <PageInspector page={page} site={site} updatePages={updatePages} history={() => setModal("history")} toast={toast}/>} {tab === "theme" && <ThemeInspector vars={theme} update={(k:string,v:string) => { const next={...theme,[k]:v}; setTheme(next); iframeRef.current?.contentWindow?.postMessage({type:"cms:theme-vars",vars:next},"*"); setDirty(true); if(themeSaveTimerRef.current)clearTimeout(themeSaveTimerRef.current); themeSaveTimerRef.current=setTimeout(()=>saveThemeVars(projectSlug,next).then(()=>{setDirty(false);toast("Theme saved","info")}).catch((error)=>toast(error?.message||"Theme save failed","error")),500); }} toast={toast}/>} {tab === "crm" && <InspectorCrm contacts={contacts} viewAll={() => setRail("crm")} select={setContactId}/>}</div>
      </aside>
    </div>

    <footer className="statusbar"><div><i/> Connected</div><span>Saved 2 minutes ago</span><span>{page.slug}</span><span>{page.sections.length} sections</span><button onClick={() => setModal("shortcuts")}>Shortcuts <kbd>⌘/</kbd></button></footer>
    <nav className="mobile-tabs">{railItems.slice(0,5).map(i => <button key={i.id} className={rail===i.id?"active":""} onClick={() => setRail(i.id)}><Icon name={i.icon}/><span>{i.label}</span></button>)}</nav>
    <ToastStack toasts={toasts} dismiss={dismissToast}/>

    {modal === "add-section" && (initialPanel === "imports" ? <ImportSectionModal close={() => setModal(null)} add={addSection}/> : <AddSectionModal close={() => setModal(null)} add={addSection}/>)}
    {modal === "page" && <PageModal step={pageWizard} setStep={setPageWizard} data={newPage} setData={setNewPage} close={() => setModal(null)} create={createPage}/>}
    {modal === "upload" && <UploadModal close={() => setModal(null)} done={() => { setModal(null); toast("3 media files uploaded"); }}/>}
    {modal === "schedule" && <ScheduleModal close={() => setModal(null)} done={() => { setModal(null); toast("Publish scheduled"); }}/>}
    {modal === "shortcuts" && <ShortcutsModal close={() => setModal(null)}/>}
    {modal === "palette" && <CommandPalette close={() => setModal(null)} pages={site.pages} sections={page.sections} action={(type:string,id?:string) => { setModal(null); if(type==="page"&&id)choosePage(id); else if(type==="section"&&id)chooseSection(id); else if(type==="publish")setPublishMenu(true); else if(type==="add")setModal("add-section"); else if(type==="media")setRail("media"); }}/>}
    {modal === "history" && <HistoryModal close={() => setModal(null)} restore={() => { setModal(null); toast("Revision restored", "info"); }}/>}
    {modal?.startsWith("template:") && <TemplatePreview name={modal.split(":")[1]} close={() => setModal(null)} apply={() => { setModal(null); toast("Template applied"); }}/>}
    {contactId !== null && <ContactDrawer contact={contacts[contactId]} close={() => setContactId(null)} toast={toast}/>}
  </main>;
}

function ViewportSwitcher({ viewport, setViewport }: any) { return <div className="viewport-switcher">{(["phone","tablet","desktop"] as Viewport[]).map(v => <button key={v} className={viewport===v?"active":""} onClick={() => setViewport(v)} title={`${v} viewport`}><Icon name={v}/></button>)}</div>; }

function SiteSwitcher({ sites, active, choose, close, newSite }: any) { const [q,setQ]=useState(""); return <div className="popover site-switcher"><div className="popover-title"><b>Switch site</b><Button icon="close" onClick={close}/></div><Search value={q} onChange={setQ} placeholder="Search client sites"/><div>{sites.filter((s:Site)=>s.name.toLowerCase().includes(q.toLowerCase())).map((s:Site)=><button className="site-option" key={s.id} onClick={()=>choose(s.id)}><span className="site-avatar" style={{background:s.color}}>{s.initials}</span><span><b>{s.name}</b><small>{s.domain} · {s.edited}</small></span>{s.id===active&&<Icon name="check"/>}</button>)}</div><Button icon="plus" kind="secondary" onClick={newSite}>New site</Button></div>; }
function PublishMenu({ action }: any) { return <div className="popover publish-menu">{["Publish Page","Publish Section","Publish All","Schedule"].map((x,i)=><button key={x} onClick={()=>action(x)}><span><Icon name={i===3?"settings":"publish"}/></span><div><b>{x}</b><small>{i===0?"Only the current page":i===1?"Only the selected section":i===2?"Every pending change":"Choose a future time"}</small></div>{i<3&&<kbd>⌘⇧P</kbd>}</button>)}</div>; }
function SidebarHeader({ rail, search, setSearch, action }: any) { return <header className="sidebar-head"><div><span className="eyebrow">Workspace</span><h2>{rail[0].toUpperCase()+rail.slice(1)}</h2></div><Button icon="plus" kind="secondary" onClick={action} title={`Add ${rail}`}/><Search value={search} onChange={setSearch} placeholder={`Search ${rail}`}/></header>; }

function PagesSidebar({ pages, active, choose, create, toast }: any) { return <div className="sidebar-section"><div className="group-title"><span>Top-level pages</span><b>{pages.filter((p:PageData)=>!p.parent).length}</b></div>{!pages.length?<EmptyState icon="file" title="No pages found" copy="Try another search or create a new page." action="New page" onAction={create}/>:pages.map((p:PageData)=><div className={`page-row ${active===p.id?"selected":""}`} key={p.id} draggable onDragEnd={()=>toast("Page order updated","info")} onClick={()=>choose(p.id)}><i className={`status ${p.status}`}/><span><b>{p.title}</b><small>{p.slug}</small></span><button onClick={e=>{e.stopPropagation();toast(`${p.title} page menu opened`,"info")}}><Icon name="more"/></button></div>)}<div className="group-title"><span>Nested</span><b>{pages.filter((p:PageData)=>p.parent).length}</b></div>{pages.filter((p:PageData)=>p.parent).map((p:PageData)=><div className="page-row nested" key={`nested-${p.id}`}><Icon name="chevron" size={12}/><span><b>{p.title}</b><small>{p.slug}</small></span></div>)}<Button icon="plus" className="wide-action" onClick={()=>toast("New folder created")}>New folder</Button></div>; }

function SectionsSidebar({ sections, selected, choose, mutate, add, toast, onReorder, onVisibility, onRename }: any) { const [open,setOpen]=useState<Record<string,boolean>>({HEADER:true,BODY:true,FOOTER:true,TEMPLATE:true}); const drag=useRef<string|null>(null); return <div className="sidebar-section">{["HEADER","BODY","FOOTER","TEMPLATE"].map(zone=>{const items=sections.filter((s:Section)=>s.zone===zone);return <div key={zone} className="zone"><button className="group-title zone-title" onClick={()=>setOpen({...open,[zone]:!open[zone]})}><Icon name={open[zone]?"down":"chevron"} size={12}/><span>{zone}</span><b>{items.length}</b></button>{open[zone]&&items.map((s:Section)=><div key={s.id} draggable onDragStart={()=>drag.current=s.id} onDragOver={e=>e.preventDefault()} onDrop={()=>{const from=sections.findIndex((x:Section)=>x.id===drag.current),to=sections.findIndex((x:Section)=>x.id===s.id);if(from<0||to<0)return;const copy=[...sections];const [m]=copy.splice(from,1);copy.splice(to,0,m);mutate(()=>copy);onReorder(copy);toast("Section order updated","info")}} className={`section-row ${selected===s.id?"selected":""}`} onClick={()=>choose(s.id)}><span className="drag">⠿</span><i className="swatch" style={{background:s.color}}/><span onDoubleClick={e=>{e.stopPropagation();(e.currentTarget as HTMLElement).contentEditable="true";e.currentTarget.focus()}} onBlur={e=>{(e.currentTarget as HTMLElement).contentEditable="false";const name=(e.currentTarget.childNodes[0]?.textContent||s.name).trim();mutate((list:Section[])=>list.map(x=>x.id===s.id?{...x,name}:x));onRename(s,name)}}>{s.name}<small>{s.zone}</small></span><button onClick={e=>{e.stopPropagation();const visible=!s.visible;mutate((list:Section[])=>list.map(x=>x.id===s.id?{...x,visible}:x));onVisibility(s,visible)}}><Icon name={s.visible?"eye":"eyeoff"} size={14}/></button><button onClick={e=>{e.stopPropagation();toast("Section actions opened","info")}}><Icon name="more" size={14}/></button></div>)}</div>})}<Button icon="plus" kind="accent" className="wide-action" onClick={add}>Add section</Button></div>; }

function ComponentsSidebar({ items, filter, setFilter, search, add }: any) { const cats=["All","Layout","Content","Commerce","Interactive"]; const list=items.filter((x:string)=>x.toLowerCase().includes(search.toLowerCase())); return <div className="sidebar-section"><div className="filter-tabs">{cats.map(x=><button className={filter===x?"active":""} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div><div className="component-grid">{list.map((x:string,i:number)=><article key={x}><Wireframe variant={i}/><div><b>{x}</b><small>{cats[1+(i%4)]}</small></div><Button icon="plus" kind="accent" onClick={()=>add(x)}>Add to page</Button></article>)}</div><div className="group-title"><span>My components</span><b>2</b></div><div className="custom-component"><Icon name="puzzle"/><span><b>Partner Logo Row</b><small>Used on 3 pages</small></span></div><div className="custom-component"><Icon name="puzzle"/><span><b>Project Inquiry Form</b><small>Used on 2 pages</small></span></div></div>; }
function TemplatesSidebar({ items, preview }: any) { const [tab,setTab]=useState("Pages"); const [industry,setIndustry]=useState("All"); return <div className="sidebar-section"><div className="segmented"><button className={tab==="Pages"?"active":""} onClick={()=>setTab("Pages")}>Full pages</button><button className={tab==="Sections"?"active":""} onClick={()=>setTab("Sections")}>Sections</button></div><select value={industry} onChange={e=>setIndustry(e.target.value)}><option>All industries</option>{["Agency","Restaurant","Nonprofit","Portfolio","Ecommerce","SaaS"].map(x=><option key={x}>{x}</option>)}</select><div className="template-grid">{items.map((x:string,i:number)=><article key={x}><Wireframe variant={i}/><b>{x}</b><small>{["Agency","Portfolio","Editorial"][i%3]}</small><div><Button onClick={()=>preview(x)}>Preview</Button><Button kind="accent" onClick={()=>preview(x)}>Apply</Button></div></article>)}</div></div>; }
function MediaSidebar({ view,setView,filter,setFilter,items,upload,toast }: any) { return <div className="sidebar-section"><button className="mini-dropzone" onClick={upload}><Icon name="upload"/><span><b>Upload media</b><small>Drop files or browse</small></span></button><div className="media-controls"><div className="filter-tabs">{["All","Image","Video","Document","Font"].map(x=><button className={filter===x?"active":""} onClick={()=>setFilter(x)} key={x}>{x}</button>)}</div><div><button className={view==="grid"?"active":""} onClick={()=>setView("grid")}><Icon name="grid"/></button><button className={view==="list"?"active":""} onClick={()=>setView("list")}><Icon name="layers"/></button></div></div><div className={`media-grid ${view}`}>{items.filter((x:any)=>filter==="All"||x.type===filter).map((x:any)=><article key={x.id}><div className="media-thumb" style={{background:x.color}}>{x.type==="Image"?<Icon name="image" size={24}/>:<Icon name="file" size={24}/>}<input type="checkbox"/><button onClick={()=>toast("Media URL copied")}><Icon name="copy"/></button></div><span><b>{x.name}</b><small>{x.size}</small></span></article>)}</div><div className="storage"><div><span>Storage</span><b>2.8 GB / 10 GB</b></div><i><span/></i></div></div>; }
function CrmSidebar({ contacts,search,select,exportCsv }: any) { const list=contacts.filter((x:any)=>(x.name+x.email).toLowerCase().includes(search.toLowerCase())); return <div className="sidebar-section"><div className="crm-stats"><div><b>{contacts.length}</b><span>Total contacts</span></div><div><b>{contacts.filter((_:any,i:number)=>i<7).length}</b><span>New this week</span></div><div><b>{contacts.filter((_:any,i:number)=>i<3).length}</b><span>Today</span></div></div><div className="filter-row"><Button icon="filter">Source</Button><Button icon="publish" onClick={exportCsv}>Export CSV</Button></div>{list.map((c:any)=><button className="contact-row" key={c.id} onClick={()=>select(c.id)}><span className="contact-avatar">{c.name.split(" ").map((x:string)=>x[0]).join("")}</span><span><b>{c.name}</b><small>{c.email}</small><em>{c.source}</em></span><time>{c.date}</time></button>)}<div className="group-title"><span>Forms</span><b>3</b></div>{["Project inquiry","Newsletter","Contact form"].map((x,i)=><div className="form-row" key={x}><Icon name="file"/><span><b>{x}</b><small>{contacts.filter((c:any)=>c.source===x).length} submissions</small></span><Icon name="chevron"/></div>)}</div>; }
function SettingsSidebar({ site,toast }: any) { const [analytics,setAnalytics]=useState(true); const [fonts,setFonts]=useState(false); return <div className="sidebar-section settings-form"><SectionLabel title="Site details"/><Field label="Site name"><input defaultValue={site.name}/></Field><Field label="Site slug"><input defaultValue={site.id}/></Field><Field label="Custom domain"><div className="input-action"><input defaultValue={site.domain}/><button onClick={()=>toast("Domain copied")}><Icon name="copy"/></button></div></Field><Field label="Favicon"><button className="file-pick"><span className="site-avatar" style={{background:site.color}}>{site.initials}</span>Replace favicon</button></Field><SectionLabel title="Integrations"/><ToggleRow label="Analytics" copy="Google Analytics and site events" value={analytics} set={setAnalytics}/>{analytics&&<input placeholder="G-XXXXXXXXXX"/>}<ToggleRow label="Google Fonts" copy="Load external font families" value={fonts} set={setFonts}/><Field label="Default meta title"><input defaultValue="%page% — %site%"/></Field><Field label="Default description"><textarea defaultValue="A distinctive experience by Inner Animal Media."/></Field><div className="danger-zone"><b>Delete this site</b><p>Permanently remove the site and its published versions.</p><Button icon="trash" onClick={()=>toast(`Type ${site.name} to confirm deletion`,"warning")}>Delete site</Button></div></div>; }

function SectionLabel({title}:any){return <div className="section-label"><span>{title}</span><i/></div>}
function Field({label,raw,children}:any){return <label className="field"><span>{label}{raw&&<i title={raw}>?</i>}</span>{children}</label>}
function ToggleRow({label,copy,value,set}:any){return <div className="toggle-row"><span><b>{label}</b><small>{copy}</small></span><button className={`toggle ${value?"on":""}`} onClick={()=>set(!value)}><span/></button></div>}

function ContentInspector({ section, update, toast }: any) { const [raw,setRaw]=useState(false); const [rich,setRich]=useState<string>(""); return <div className="panel-form"><div className="panel-note"><Icon name="info"/><p>Fields are mapped to <b>{section.name}</b>. Changes preview instantly and save as structured content.</p></div>{Object.entries(section.fields).map(([key,value])=>{
    const label=key.replace(/_/g," ").replace(/\b\w/g,x=>x.toUpperCase()); if(typeof value==="boolean")return <Field key={key} label={label} raw={key}><ToggleRow label={value?"Enabled":"Disabled"} copy="Boolean field" value={value} set={(v:boolean)=>update(key,v)}/></Field>;
    if(Array.isArray(value))return <ListField key={key} label={label} raw={key} value={value} update={(v:any)=>update(key,v)}/>;
    if(key.includes("color"))return <Field key={key} label={label} raw={key}><div className="color-input"><input type="color" value={String(value)} onChange={e=>update(key,e.target.value)}/><input value={String(value)} onChange={e=>update(key,e.target.value)}/><button onClick={()=>toast("Color copied")}><Icon name="copy"/></button></div><div className="swatches">{["#6358ff","#1c5e46","#cfef5b","#f4f4f8","#09090b"].map(c=><button key={c} style={{background:c}} onClick={()=>update(key,c)}/>)}</div></Field>;
    if(key.includes("image"))return <Field key={key} label={label} raw={key}><div className="image-field"><img src={String(value)} alt="Current media"/><div><input value={String(value)} onChange={e=>update(key,e.target.value)}/><span><Button icon="image" onClick={()=>toast("Media library opened","info")}>Choose</Button><Button icon="upload">Upload</Button></span></div></div></Field>;
    if(key.includes("opacity"))return <Field key={key} label={label} raw={key}><div className="range-input"><input type="range" min="0" max="100" value={Number(value)} onChange={e=>update(key,Number(e.target.value))}/><output>{String(value)}%</output></div></Field>;
    if(key.includes("json"))return <Field key={key} label={label} raw={key}><textarea className="code-area" rows={8} value={String(value)} onChange={e=>update(key,e.target.value)} onBlur={e=>{try{JSON.parse(e.target.value)}catch{toast("This field contains invalid JSON","error")}}}/></Field>;
    if(key.includes("url"))return <Field key={key} label={label} raw={key}><div className="url-field"><select><option>https://</option><option>http://</option><option>mailto:</option><option>tel:</option></select><input value={String(value).replace(/^https?:\/\//,"")} onChange={e=>update(key,e.target.value)}/><button onClick={()=>window.open(String(value),"_blank")}><Icon name="external"/></button></div></Field>;
    if(key.includes("date"))return <Field key={key} label={label} raw={key}><input type="date" value={String(value)} onChange={e=>update(key,e.target.value)}/></Field>;
    if(key==="description"||key.includes("body")||key.includes("quote"))return <Field key={key} label={label} raw={key}><div className="rich-editor"><div className="rich-tools">{["B","I","Link","• List","H2"].map(x=><button key={x} onMouseDown={e=>{e.preventDefault();document.execCommand(x==="B"?"bold":x==="I"?"italic":x==="H2"?"formatBlock":x==="• List"?"insertUnorderedList":"createLink",false,x==="Link"?"https://":"h2")}}>{x}</button>)}</div><div contentEditable suppressContentEditableWarning onInput={e=>{setRich(e.currentTarget.innerHTML);update(key,e.currentTarget.innerHTML)}} dangerouslySetInnerHTML={{__html:rich||String(value)}}/></div></Field>;
    if(typeof value==="number")return <Field key={key} label={label} raw={key}><input type="number" value={value} onChange={e=>update(key,Number(e.target.value))}/></Field>;
    return <Field key={key} label={label} raw={key}>{String(value).length>70?<textarea rows={4} value={String(value)} onChange={e=>update(key,e.target.value)}/>:<input value={String(value)} onChange={e=>update(key,e.target.value)}/>}</Field>;
  })}<button className="disclosure" onClick={()=>setRaw(v=>!v)}><Icon name={raw?"down":"chevron"}/><span>Raw fields JSON</span></button>{raw&&<div className="raw-json"><button onClick={()=>{navigator.clipboard?.writeText(JSON.stringify(section.fields,null,2));toast("Fields JSON copied")}}><Icon name="copy"/></button><pre>{JSON.stringify(section.fields,null,2)}</pre></div>}</div>; }
function ListField({label,raw,value,update}:any){const drag=useRef<number|null>(null);return <Field label={label} raw={raw}><div className="list-field">{value.map((v:any,i:number)=><div key={i} draggable onDragStart={()=>drag.current=i} onDragOver={e=>e.preventDefault()} onDrop={()=>{const a=[...value];const [m]=a.splice(drag.current!,1);a.splice(i,0,m);update(a)}}><span>⠿</span><input value={String(v)} onChange={e=>{const a=[...value];a[i]=e.target.value;update(a)}}/><button onClick={()=>update(value.filter((_:any,x:number)=>x!==i))}><Icon name="close"/></button></div>)}<Button icon="plus" onClick={()=>update([...value,""])}>Add item</Button></div></Field>}

function StyleInspector({ section, update }: any) { const css=section.css||{}; const [linked,setLinked]=useState(true); const [bg,setBg]=useState("Color"); const [display,setDisplay]=useState("block"); return <div className="panel-form"><SectionLabel title="Spacing"/><div className="box-control"><div className="box-grid">{["Top","Right","Bottom","Left"].map((x,i)=><Field key={x} label={x}><input type="number" value={parseInt(css[`padding${x}`]||"24")} onChange={e=>{const v=e.target.value+"px";if(linked)["Top","Right","Bottom","Left"].forEach(y=>update(`padding${y}`,v));else update(`padding${x}`,v)}}/></Field>)}</div><button className={linked?"active":""} onClick={()=>setLinked(v=>!v)}><Icon name="link"/></button></div><SectionLabel title="Background"/><Field label="Type"><select value={bg} onChange={e=>setBg(e.target.value)}>{["None","Color","Gradient","Image","Video"].map(x=><option key={x}>{x}</option>)}</select></Field>{bg==="Color"&&<Field label="Background color"><div className="color-input"><input type="color" value={css.backgroundColor||section.color} onChange={e=>update("backgroundColor",e.target.value)}/><input value={css.backgroundColor||section.color} onChange={e=>update("backgroundColor",e.target.value)}/></div></Field>}{bg==="Gradient"&&<><div className="gradient-preview"/><div className="two-fields"><input type="color" defaultValue="#6358ff"/><input type="color" defaultValue="#cfef5b"/></div><Field label="Angle"><input type="range" min="0" max="360" defaultValue="135"/></Field></>}<SectionLabel title="Typography"/><Field label="Font family"><select onChange={e=>update("fontFamily",e.target.value)}>{["Inter","Manrope","DM Sans","Space Grotesk","Playfair Display","JetBrains Mono"].map(x=><option key={x}>{x}</option>)}</select></Field><div className="two-fields"><Field label="Size"><input type="number" defaultValue="16" onChange={e=>update("fontSize",e.target.value+"px")}/></Field><Field label="Weight"><select onChange={e=>update("fontWeight",e.target.value)}>{[400,500,600,700,800].map(x=><option key={x}>{x}</option>)}</select></Field></div><Field label="Alignment"><div className="button-group">{["left","center","right","justify"].map(x=><button key={x} onClick={()=>update("textAlign",x)}>{x[0].toUpperCase()}</button>)}</div></Field><SectionLabel title="Border & shadow"/><div className="two-fields"><Field label="Width"><input type="number" defaultValue="0" onChange={e=>update("borderWidth",e.target.value+"px")}/></Field><Field label="Style"><select onChange={e=>update("borderStyle",e.target.value)}>{["none","solid","dashed","dotted"].map(x=><option key={x}>{x}</option>)}</select></Field></div><Field label="Radius"><input type="range" min="0" max="64" defaultValue="0" onChange={e=>update("borderRadius",e.target.value+"px")}/></Field><div className="shadow-builder"><b>Shadow 1</b><div className="four-fields">{["X","Y","Blur","Spread"].map((x,i)=><Field key={x} label={x}><input type="number" defaultValue={[0,12,32,0][i]}/></Field>)}</div><ToggleRow label="Inset" copy="Draw inside the element" value={false} set={()=>{}}/></div><SectionLabel title="Layout"/><Field label="Display"><select value={display} onChange={e=>{setDisplay(e.target.value);update("display",e.target.value)}}>{["block","flex","grid"].map(x=><option key={x}>{x}</option>)}</select></Field>{display==="flex"&&<><Field label="Direction"><div className="button-group">{["row","column"].map(x=><button key={x} onClick={()=>update("flexDirection",x)}>{x}</button>)}</div></Field><Field label="Align"><select onChange={e=>update("alignItems",e.target.value)}>{["stretch","start","center","end"].map(x=><option key={x}>{x}</option>)}</select></Field></>}{display==="grid"&&<div className="two-fields"><Field label="Columns"><input type="number" defaultValue="3"/></Field><Field label="Gap"><input type="number" defaultValue="24"/></Field></div>}<SectionLabel title="Effects & motion"/><Field label="Opacity"><div className="range-input"><input type="range" min="0" max="100" defaultValue="100" onChange={e=>update("opacity",Number(e.target.value)/100)}/><output>100%</output></div></Field><Field label="Transition"><select>{["None","Fade in","Slide up","Slide left","Zoom in"].map(x=><option key={x}>{x}</option>)}</select></Field></div>; }

function PageInspector({ page,site,updatePages,history,toast }: any){const update=(k:string,v:any)=>updatePages((ps:PageData[])=>ps.map(p=>p.id===page.id?{...p,[k]:v}:p));return <div className="panel-form"><SectionLabel title="Page details"/><Field label="Page title"><input value={page.title} onChange={e=>update("title",e.target.value)}/></Field><Field label="Slug"><div className="input-action"><input value={page.slug} onChange={e=>update("slug",e.target.value.toLowerCase().replace(/\s+/g,"-"))}/><button onClick={()=>{navigator.clipboard?.writeText(`https://${site.domain}${page.slug}`);toast("Page URL copied")}}><Icon name="copy"/></button></div><small className="url-preview">https://{site.domain}{page.slug}</small></Field><SectionLabel title="Search & sharing"/><Field label="Meta title"><input value={page.metaTitle} onChange={e=>update("metaTitle",e.target.value)}/><CharCount value={page.metaTitle} max={60}/></Field><Field label="Meta description"><textarea rows={4} value={page.metaDescription} onChange={e=>update("metaDescription",e.target.value)}/><CharCount value={page.metaDescription} max={160}/></Field><Field label="Open Graph image"><button className="og-preview"><div><Icon name="image" size={22}/><span>Choose social image</span></div></button></Field><Field label="Canonical URL"><input placeholder={`https://${site.domain}${page.slug}`}/></Field><div className="check-row"><label><input type="checkbox" defaultChecked/> Index</label><label><input type="checkbox" defaultChecked/> Follow</label></div><SectionLabel title="Publishing"/><div className="publish-status"><span className={`status ${page.status}`}/><span><b>{page.status==="live"?"Published":"Draft"}</b><small>Published Jul 18, 2026 at 4:42 PM</small></span></div><Field label="Page type"><select value={page.type} onChange={e=>update("type",e.target.value)}>{["Home","Interior","Landing","Blog post","Product"].map(x=><option key={x}>{x}</option>)}</select></Field><div className="page-metrics"><div><b>286</b><span>Words</span></div><div><b>{page.sections.length}</b><span>Sections</span></div><div><b>2 min</b><span>Read time</span></div></div><Button icon="layers" className="wide-action" onClick={history}>View page history</Button></div>}
function CharCount({value,max}:any){const n=value.length;return <small className={`char-count ${n>max+10?"bad":n>max?"warn":"good"}`}>{n} / {max}</small>}

function ThemeInspector({vars,update,toast}:any){const [open,setOpen]=useState<Record<string,boolean>>({Brand:true,Typography:true,Colors:false,Spacing:false,Radius:false,Shadows:false,Motion:false,Layout:false});const groups:any={Brand:["--brand-primary","--brand-secondary","--brand-accent"],Typography:["--font-heading","--font-body","--font-mono","--font-size-base"],Colors:["--color-bg","--color-surface","--color-text","--color-text-muted"],Spacing:["--space-6","--section-padding-y"],Radius:["--radius-md","--radius-lg"],Shadows:["--shadow-sm","--shadow-md"],Motion:["--duration-fast","--duration-normal"],Layout:["--container-max-width"]};return <div className="panel-form"><div className="theme-actions"><Button onClick={()=>toast("Theme reset to defaults","warning")}>Reset all</Button><Button icon="publish" onClick={()=>{const blob=new Blob([JSON.stringify(vars,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="theme.json";a.click()}}>Export</Button><Button icon="copy" onClick={()=>{navigator.clipboard?.writeText(`:root {\n${Object.entries(vars).map(([k,v])=>`  ${k}: ${v};`).join("\n")}\n}`);toast("CSS variables copied")}}>CSS</Button></div><div className="theme-preview"><span style={{background:vars["--brand-primary"]}}/><div><b>Live brand preview</b><small>Buttons, links, highlights and focus states</small></div><button style={{background:vars["--brand-primary"]}}>Action</button></div>{Object.entries(groups).map(([g,keys]:any)=><div className="theme-group" key={g}><button className="theme-group-head" onClick={()=>setOpen({...open,[g]:!open[g]})}><Icon name={open[g]?"down":"chevron"}/><span>{g}</span><small>{keys.length}</small><em onClick={e=>{e.stopPropagation();toast(`${g} reset`,"info")}}>Reset</em></button>{open[g]&&<div className="theme-group-body">{keys.map((k:string)=>{const val=vars[k]||({"--shadow-sm":"0 2px 8px rgba(0,0,0,.08)","--shadow-md":"0 12px 32px rgba(0,0,0,.12)","--duration-fast":"120ms","--duration-normal":"200ms"} as any)[k]||"16px";const color=k.includes("brand")||k.includes("color");return <Field key={k} label={k.replace("--","").replace(/-/g," ")} raw={k}><div className={color?"color-input":"input-action"}>{color&&<input type="color" value={val} onChange={e=>update(k,e.target.value)}/>}<input value={val} onChange={e=>update(k,e.target.value)}/><button onClick={()=>{navigator.clipboard?.writeText(val);toast("Variable copied")}}><Icon name="copy"/></button></div></Field>})}</div>}</div>)}</div>}

function InspectorCrm({contacts,viewAll,select}:any){return <div className="panel-form"><div className="crm-page-stats"><div><b>{contacts.length}</b><span>Submissions</span></div><div><b>3.8%</b><span>Conversion</span></div><div><b>2:14</b><span>Avg. time</span></div></div><SectionLabel title="Last 7 days"/><div className="bar-chart">{[34,51,38,72,48,91,63].map((v,i)=><div key={i}><i style={{height:`${v}%`}}/><span>{["M","T","W","T","F","S","S"][i]}</span></div>)}</div><div className="list-head"><b>Recent submissions</b><button onClick={viewAll}>View all</button></div>{contacts.slice(0,6).map((c:any)=><button className="mini-contact" key={c.id} onClick={()=>select(c.id)}><span>{c.name.split(" ").map((x:string)=>x[0]).join("")}</span><div><b>{c.name}</b><small>{c.email}</small></div><time>{c.date}</time></button>)}</div>}

function ImportSectionModal({close,add}:any){const [mode,setMode]=useState<"URL"|"HTML">("URL");return <Modal title="Import content" onClose={close} wide><div className="modal-toolbar"><div className="segmented"><button className={mode==="URL"?"active":""} onClick={()=>setMode("URL")}>Import from URL</button><button className={mode==="HTML"?"active":""} onClick={()=>setMode("HTML")}>Paste HTML</button></div></div>{mode==="URL"?<div className="import-pane"><Icon name="external" size={28}/><h3>Import a section from a URL</h3><p>Bring public content into the IAM import workflow and create an editable section.</p><div className="input-action"><input autoFocus placeholder="https://example.com/page"/><Button kind="accent" onClick={()=>add("Imported Section")}>Import</Button></div></div>:<div className="import-pane"><Icon name="code" size={28}/><h3>Paste custom HTML</h3><p>Scripts are removed before the section is created.</p><textarea autoFocus rows={12} placeholder={'<section class="custom">\n  <h2>Your section</h2>\n</section>'}/><Button kind="accent" onClick={()=>add("Custom HTML")}>Add custom section</Button></div>}</Modal>}
function AddSectionModal({close,add}:any){const [cat,setCat]=useState("All");const [q,setQ]=useState("");const [tab,setTab]=useState("Library");const cats=["All","Hero","Navigation","Feature","Testimonial","CTA","Gallery","Pricing","FAQ","Contact","Footer","Custom"];const cards=["Editorial Hero","Immersive Hero","Minimal Nav","Split Feature","Numbered Services","Quote Spotlight","Project Gallery","Pricing Matrix","FAQ Stack","Contact Split","Bold CTA","Utility Footer"];return <Modal title="Add a section" onClose={close} wide><div className="modal-toolbar"><div className="segmented"><button className={tab==="Library"?"active":""} onClick={()=>setTab("Library")}>Section library</button><button className={tab==="URL"?"active":""} onClick={()=>setTab("URL")}>Import from URL</button><button className={tab==="HTML"?"active":""} onClick={()=>setTab("HTML")}>Paste HTML</button></div><Search value={q} onChange={setQ} placeholder="Search section templates"/></div>{tab==="Library"?<div className="add-section-layout"><nav>{cats.map(x=><button className={cat===x?"active":""} key={x} onClick={()=>setCat(x)}>{x}<span>{x==="All"?12:Math.floor(Math.random()*5)+1}</span></button>)}</nav><div className="section-card-grid">{cards.filter(x=>x.toLowerCase().includes(q.toLowerCase())).map((x,i)=><article key={x}><Wireframe variant={i}/><div><b>{x}</b><span>{cats[1+(i%(cats.length-1))]}</span></div><Button kind="accent" icon="plus" onClick={()=>add(x)}>Add</Button></article>)}</div></div>:tab==="URL"?<div className="import-pane"><Icon name="external" size={28}/><h3>Import a section from a URL</h3><p>We will fetch the public page, isolate a region, sanitize the markup, and create an editable custom section.</p><div className="input-action"><input autoFocus placeholder="https://example.com/page"/><Button kind="accent" onClick={()=>add("Imported Section")}>Import</Button></div></div>:<div className="import-pane"><Icon name="code" size={28}/><h3>Paste custom HTML</h3><p>Scripts are removed before the section is added. You can refine HTML and styles in the inspector.</p><textarea autoFocus rows={12} placeholder={'<section class="custom">\n  <h2>Your section</h2>\n</section>'}/><Button kind="accent" onClick={()=>add("Custom HTML")}>Add custom section</Button></div>}</Modal>}

function PageModal({step,setStep,data,setData,close,create}:any){const types=["Home","Interior","Landing","Blog","Product"];return <Modal title="Create a new page" onClose={close} wide><div className="wizard-steps">{[1,2,3,4].map((n,i)=><div className={step>=n?"active":""} key={n}><span>{step>n?<Icon name="check" size={12}/>:n}</span><b>{["Page type","Starter","Details","Confirm"][i]}</b></div>)}</div><div className="wizard-body">{step===1&&<div className="type-grid">{types.map((x,i)=><button className={data.type===x?"active":""} onClick={()=>setData({...data,type:x})} key={x}><Icon name={["file","layers","publish","file","grid"][i]} size={26}/><b>{x}</b><small>{["Primary site entry","Standard content page","Campaign-focused page","Editorial article","Commerce detail"][i]}</small></button>)}</div>}{step===2&&<div className="starter-grid">{["Blank canvas","Editorial","Lead generation","Portfolio"].map((x,i)=><button key={x}><Wireframe variant={i}/><b>{x}</b><small>{i===0?"Start clean":"Prebuilt structure"}</small></button>)}</div>}{step===3&&<div className="details-form"><Field label="Page title"><input autoFocus value={data.title} onChange={e=>setData({...data,title:e.target.value,slug:"/"+e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")})}/></Field><Field label="Slug"><input value={data.slug} onChange={e=>setData({...data,slug:e.target.value})}/></Field><Field label="Parent page"><select value={data.parent} onChange={e=>setData({...data,parent:e.target.value})}><option>None</option><option>Company</option><option>Resources</option></select></Field></div>}{step===4&&<div className="confirm-page"><span><Icon name="check" size={28}/></span><h3>Ready to create {data.title || "your page"}</h3><p>The {data.type.toLowerCase()} page will be created at <b>{data.slug||"/untitled"}</b> with the selected starter structure.</p><div><span>Type</span><b>{data.type}</b><span>Status</span><b>Never published</b><span>Parent</span><b>{data.parent}</b></div></div>}</div><footer className="modal-footer"><Button onClick={close}>Cancel</Button><div><Button disabled={step===1} onClick={()=>setStep(Math.max(1,step-1))}>Back</Button><Button kind="accent" onClick={()=>step===4?create():setStep(step+1)}>{step===4?"Create page":"Continue"}</Button></div></footer></Modal>}

function UploadModal({close,done}:any){const [files,setFiles]=useState<any[]>([]);const add=(list:FileList|null)=>{if(!list)return;const arr=Array.from(list).map((f:any,i)=>({name:f.name,size:(f.size/1e6).toFixed(1)+" MB",progress:0,id:Date.now()+i}));setFiles(arr);arr.forEach((f:any,i)=>{let p=0;const t=setInterval(()=>{p+=20;setFiles(v=>v.map(x=>x.id===f.id?{...x,progress:p}:x));if(p>=100)clearInterval(t)},250+i*100)})};return <Modal title="Upload media" onClose={close}><label className="upload-drop"><input type="file" multiple onChange={e=>add(e.target.files)}/><Icon name="upload" size={28}/><h3>Drop files here to upload</h3><p>Images, video, documents, and fonts up to 50 MB</p><Button kind="secondary">Browse files</Button></label><div className="upload-queue">{files.map(f=><div key={f.id}><span><Icon name="file"/></span><div><b>{f.name}</b><small>{f.size}</small><i><em style={{width:`${f.progress}%`}}/></i></div>{f.progress===100?<Icon name="check"/>:<button onClick={()=>setFiles(v=>v.filter(x=>x.id!==f.id))}><Icon name="close"/></button>}</div>)}</div><footer className="modal-footer"><Button onClick={close}>Cancel</Button><Button kind="accent" disabled={!files.length||files.some(f=>f.progress<100)} onClick={done}>Add {files.length||""} files</Button></footer></Modal>}
function ScheduleModal({close,done}:any){const [now,setNow]=useState(false);return <Modal title="Schedule publishing" onClose={close}><div className="publish-toggle"><button className={now?"":"active"} onClick={()=>setNow(false)}>Schedule</button><button className={now?"active":""} onClick={()=>setNow(true)}>Publish now</button></div>{!now&&<><div className="calendar"><header><button><Icon name="chevron"/></button><b>July 2026</b><button><Icon name="chevron"/></button></header><div>{["S","M","T","W","T","F","S"].map((x,i)=><span key={i}>{x}</span>)}{Array.from({length:35},(_,i)=><button className={i===27?"active":i<3?"muted":""} key={i}>{i<3?29+i:i-2}</button>)}</div></div><div className="two-fields"><Field label="Time"><input type="time" defaultValue="09:00"/></Field><Field label="Timezone"><select><option>America/Chicago</option><option>America/New_York</option><option>UTC</option></select></Field></div></>}<div className="schedule-summary"><Icon name="info"/><p>{now?"All changes to this page will publish immediately.":"Home will publish on July 25, 2026 at 9:00 AM CDT."}</p></div><footer className="modal-footer"><Button onClick={close}>Cancel</Button><Button kind="accent" onClick={done}>{now?"Publish now":"Schedule publish"}</Button></footer></Modal>}
function ShortcutsModal({close}:any){const rows=[["Save active section","⌘ S"],["Undo / Redo","⌘ Z / ⌘ ⇧ Z"],["Toggle preview mode","⌘ P"],["Command palette","⌘ K"],["Publish page","⌘ ⇧ P"],["Collapse sidebar","⌘ ⇧ ."],["Collapse inspector","⌘ ⇧ ,"],["Switch workspace mode","⌘ 1–7"],["Move selected section","⌘ ↑ / ⌘ ↓"],["Close / deselect","Esc"],["Focus sidebar search","⌘ F"],["Open shortcuts","⌘ /"]];return <Modal title="Keyboard shortcuts" onClose={close}><div className="shortcut-list">{rows.map(([x,k])=><div key={x}><span>{x}</span><kbd>{k}</kbd></div>)}</div></Modal>}
function CommandPalette({close,pages,sections,action}:any){const [q,setQ]=useState("");const items=[...pages.map((p:PageData)=>({type:"page",id:p.id,name:p.title,desc:`Open ${p.slug}`,icon:"file"})),...sections.map((s:Section)=>({type:"section",id:s.id,name:s.name,desc:s.type,icon:"layers"})),{type:"publish",name:"Publish current page",desc:"Send pending changes live",icon:"publish"},{type:"add",name:"Add a section",desc:"Browse the section library",icon:"plus"},{type:"media",name:"Open media library",desc:"Browse assets and uploads",icon:"image"}].filter(x=>(x.name+x.desc).toLowerCase().includes(q.toLowerCase()));return <div className="palette-backdrop"><div className="command-palette"><div className="palette-search"><Icon name="search" size={20}/><input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search pages, sections, and actions…"/><kbd>ESC</kbd></div><div className="palette-results"><span>Results</span>{items.map((x:any,i)=><button className={i===0?"active":""} key={`${x.type}-${x.id||x.name}`} onClick={()=>action(x.type,x.id)}><i><Icon name={x.icon}/></i><span><b>{x.name}</b><small>{x.desc}</small></span>{x.type==="page"&&<em>Page</em>}{x.type==="section"&&<em>Section</em>}</button>)}</div><footer><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Select</span></footer></div></div>}
function HistoryModal({close,restore}:any){return <Modal title="Page history" onClose={close}><div className="history-list">{["Updated hero copy and primary CTA","Reordered services and project gallery","Published navigation refinements","Changed brand color variables","Created page from Editorial starter"].map((x,i)=><div key={x}><i/><span><b>{x}</b><small>{["Today, 8:42 PM","Today, 6:18 PM","Yesterday, 11:05 AM","Jul 18, 4:42 PM","Jul 12, 9:14 AM"][i]} · {i%2?"Avery Cole":"Sam Primeaux"}</small></span><Button onClick={restore}>Restore</Button></div>)}</div></Modal>}
function TemplatePreview({name,close,apply}:any){return <Modal title={name} onClose={close} wide><div className="template-preview-large"><Wireframe variant={1}/><div><span>Template preview</span><h3>A confident editorial structure for ambitious work.</h3><p>Includes navigation, cinematic hero, service index, selected projects, testimonial, contact callout and utility footer.</p></div></div><footer className="modal-footer"><Button onClick={close}>Close</Button><div><Button onClick={apply}>Apply as section</Button><Button kind="accent" onClick={apply}>Apply to page</Button></div></footer></Modal>}
function ContactDrawer({contact,close,toast}:any){return <div className="drawer-backdrop" onClick={close}><aside className="contact-drawer" onClick={e=>e.stopPropagation()}><header><div className="contact-avatar large">{contact.name.split(" ").map((x:string)=>x[0]).join("")}</div><div><span>CRM contact</span><h2>{contact.name}</h2><p>{contact.email}</p></div><Button icon="close" onClick={close}/></header><div className="drawer-body"><div className="contact-actions"><Button kind="accent" onClick={()=>toast("Email composer opened","info")}>Send email</Button><Button onClick={()=>toast("Contact exported")}>Export</Button></div><SectionLabel title="Details"/><dl><dt>Email</dt><dd>{contact.email}</dd><dt>Phone</dt><dd>+1 (337) 555-01{contact.id.toString().padStart(2,"0")}</dd><dt>Source</dt><dd>{contact.source}</dd><dt>Date added</dt><dd>July {20-contact.id}, 2026</dd></dl><SectionLabel title="Tags"/><div className="tags"><span>{contact.tag}<button>×</button></span><span>Website<button>×</button></span><button>+ Add tag</button></div><SectionLabel title="Notes"/><textarea rows={5} defaultValue="Interested in a brand and web engagement. Follow up with capability deck and availability."/><Button onClick={()=>toast("Contact note saved")}>Save note</Button><SectionLabel title="Activity"/><div className="timeline"><div><i/><b>Submitted {contact.source}</b><span>{contact.date}</span><p>Requested project details and timeline.</p></div><div><i/><b>Visited Services</b><span>2 days ago</span><p>4 minutes, 18 seconds on page.</p></div><div><i/><b>First website visit</b><span>4 days ago</span><p>Source: Direct</p></div></div></div></aside></div>}
