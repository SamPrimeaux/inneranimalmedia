import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { cmsApi } from './cmsApi';
import { resolveStorefrontUrl, storefrontDisplayHost } from './cmsStorefrontUrl';
import { StorefrontPreview } from './StorefrontPreview';
import { TemplateLibraryStudio } from './TemplateLibraryStudio';
import type {
  CmsBootstrapData,
  CmsSiteRow,
  PrimeTechCmsLiteProps,
} from './cmsTypes';

const api = cmsApi;

const STYLES = `
.pt-cms-lite{--bg:var(--dashboard-canvas,var(--bg-canvas,#f4f4f5));--panel:var(--dashboard-panel,var(--bg-panel,#fff));--panel2:var(--bg-elevated,var(--dashboard-panel,#fafafa));--panel3:var(--bg-app,var(--dashboard-canvas,#f4f4f5));--text:var(--dashboard-text,var(--text-main,#202223));--muted:var(--dashboard-muted,var(--text-muted,#616161));--faint:var(--text-muted,#8a8a8a);--line:var(--dashboard-border,var(--border-subtle,rgba(0,0,0,.08)));--line2:var(--border-focus,var(--border,rgba(0,0,0,.14)));--blue:var(--color-primary,var(--solar-blue,#3a9fe8));--blue2:var(--accent-hover,var(--color-primary,#6ea8ff));--green:var(--solar-green,#25c878);--orange:var(--solar-orange,#ff8a3d);--red:var(--solar-red,#ff6d6d);--shadow:0 12px 40px color-mix(in srgb, var(--text) 8%, transparent);display:flex;flex-direction:column;min-height:0;height:100%;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow:hidden}.pt-compact-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;padding:0 2px}.pt-compact-title{margin:0;font-size:17px;font-weight:750;letter-spacing:-.02em;color:var(--text)}.pt-cms-lite *{box-sizing:border-box}.pt-cms-lite button,.pt-cms-lite input,.pt-cms-lite select,.pt-cms-lite textarea{font:inherit}.pt-page{flex:1;min-height:0;overflow:auto;padding:28px}.pt-page-inner{max-width:1280px;margin:0 auto}.pt-compact-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px;padding:0 2px}.pt-compact-title{margin:0;font-size:17px;font-weight:750;letter-spacing:-.02em;color:var(--text)}.pt-kicker{display:inline-flex;align-items:center;gap:9px;color:var(--muted);font-size:12px;font-weight:760;letter-spacing:.14em;text-transform:uppercase;margin-bottom:10px}.pt-kicker:before{content:"";width:9px;height:9px;border-radius:99px;background:var(--green);box-shadow:0 0 0 6px color-mix(in srgb, var(--green) 12%, transparent)}.pt-title{margin:0;font-size:clamp(28px,4vw,44px);line-height:1.02;letter-spacing:-.055em;font-weight:860}.pt-copy{max-width:760px;margin:12px 0 0;color:var(--muted);font-size:15px;line-height:1.55}.pt-actions{display:flex;align-items:center;justify-content:flex-end;gap:10px;flex-wrap:wrap}.pt-btn{height:38px;border:1px solid var(--line2);background:var(--bg-hover,color-mix(in srgb, var(--text) 4%, transparent));color:var(--text);border-radius:10px;padding:0 14px;font-size:13px;font-weight:760;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;transition:background .18s,border-color .18s}.pt-btn:hover{background:color-mix(in srgb, var(--text) 8%, transparent);border-color:var(--line2)}.pt-btn.primary{background:var(--blue);color:var(--bg-app,var(--bg-canvas,#fff));border-color:color-mix(in srgb, var(--blue) 40%, transparent);box-shadow:0 8px 24px color-mix(in srgb, var(--blue) 18%, transparent)}.pt-btn.primary:hover{background:var(--blue2)}.pt-btn.danger{color:var(--red);border-color:color-mix(in srgb, var(--red) 24%, transparent);background:color-mix(in srgb, var(--red) 8%, transparent)}.pt-btn:disabled{opacity:.45;cursor:not-allowed}.pt-icon-btn{width:38px;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--bg-hover,color-mix(in srgb, var(--text) 3%, transparent));color:var(--muted);display:grid;place-items:center;cursor:pointer}.pt-icon-btn:hover{color:var(--text);background:color-mix(in srgb, var(--text) 7%, transparent)}.pt-card{background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:0 1px 0 color-mix(in srgb, var(--text) 3%, transparent) inset}.pt-metrics{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1.3fr;overflow:hidden;margin:20px 0}.pt-metric{min-height:88px;padding:18px 20px;border-right:1px solid var(--line);display:flex;flex-direction:column;justify-content:center;gap:9px}.pt-metric:last-child{border-right:0}.pt-label{color:var(--muted);font-size:12px;font-weight:780;letter-spacing:.08em;text-transform:uppercase}.pt-value{font-size:22px;line-height:1;font-weight:850;letter-spacing:-.04em;display:flex;align-items:baseline;gap:8px}.pt-value span{color:var(--faint);font-size:13px;font-weight:620;letter-spacing:0}.pt-bars{display:grid;grid-template-columns:5fr 1fr;gap:4px;margin-top:6px}.pt-bars i{height:2px;background:var(--blue2);border-radius:99px}.pt-bars i:last-child{background:#8e63ff}.pt-feature{display:grid;grid-template-columns:minmax(0,1.1fr)360px;overflow:hidden;margin-bottom:26px}.pt-stage{min-height:310px;padding:0;background:var(--panel3);display:flex;align-items:center;justify-content:center;overflow:hidden}.pt-feature-meta{padding:24px;display:flex;flex-direction:column;justify-content:space-between;border-left:1px solid var(--line);background:var(--panel)}.pt-site-name{display:flex;align-items:center;gap:11px;font-size:22px;font-weight:850;letter-spacing:-.035em}.pt-mark{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:var(--panel2);border:1px solid var(--line);color:var(--blue);font-size:12px;font-weight:900}.pt-domain{color:var(--muted);margin-top:8px;font-size:13px}.pt-badges{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}.pt-badge{height:26px;border-radius:999px;display:inline-flex;align-items:center;gap:7px;padding:0 10px;font-size:12px;font-weight:790;color:#baf8d7;background:rgba(37,200,120,.1);border:1px solid rgba(37,200,120,.18)}.pt-badge:before{content:"";width:7px;height:7px;border-radius:99px;background:var(--green)}.pt-badge.neutral{color:var(--muted);background:rgba(255,255,255,.045);border-color:var(--line)}.pt-badge.neutral:before{background:var(--faint)}.pt-feature-stats{display:grid;gap:10px;margin:28px 0}.pt-mini-stat{display:flex;justify-content:space-between;gap:14px;padding:12px 0;border-bottom:1px solid var(--line);color:var(--muted);font-size:13px}.pt-mini-stat:last-child{border-bottom:0}.pt-mini-stat strong{color:var(--text);font-size:13px}.pt-toolbar{margin:20px 0 14px;display:grid;grid-template-columns:minmax(220px,1fr) auto auto;gap:10px;align-items:center}.pt-input,.pt-select,.pt-textarea{border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:12px;padding:0 14px;outline:none}.pt-input,.pt-select{height:42px}.pt-input::placeholder{color:var(--faint)}.pt-textarea{min-height:110px;padding:12px;resize:vertical;line-height:1.45}.pt-list{overflow:hidden}.pt-site-row{display:grid;grid-template-columns:132px minmax(0,1fr) auto;gap:18px;align-items:center;padding:18px;border-bottom:1px solid var(--line);transition:background .18s}.pt-site-row:last-child{border-bottom:0}.pt-site-row:hover{background:var(--bg-hover,color-mix(in srgb, var(--text) 3%, transparent))}.pt-thumb{height:86px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);display:grid;place-items:center;color:var(--muted);font-size:11px;text-align:center;padding:14px;overflow:hidden}.pt-thumb.warm,.pt-thumb.blue,.pt-thumb.green{background:var(--panel2);color:var(--muted)}.pt-row-title{font-size:16px;font-weight:830;letter-spacing:-.025em;margin-bottom:5px}.pt-row-sub{color:var(--muted);font-size:13px;margin-bottom:10px}.pt-row-meta{display:flex;align-items:center;gap:12px;flex-wrap:wrap;color:var(--faint);font-size:12px}.pt-row-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end}.pt-table-wrap{overflow:auto}.pt-table{width:100%;border-collapse:collapse;min-width:760px}.pt-table th,.pt-table td{border-bottom:1px solid var(--line);padding:14px 16px;text-align:left;vertical-align:middle}.pt-table th{color:var(--faint);font-size:11px;letter-spacing:.1em;text-transform:uppercase}.pt-table tbody tr{cursor:pointer}.pt-table tbody tr:hover{background:var(--bg-hover,color-mix(in srgb, var(--text) 3%, transparent))}.pt-main-grid{display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:18px;align-items:start}.pt-editor-shell{height:100%;min-height:0;display:flex;flex-direction:column;background:#f1f1f1;color:#202124;overflow:hidden}.pt-editor-shell .pt-btn{color:#202124;border-color:#cfd4da;background:#fff}.pt-editor-shell .pt-btn.primary{background:#101214;color:#fff;border-color:#101214}.pt-editor-top{height:54px;display:flex;align-items:center;gap:10px;padding:0 20px;border-bottom:1px solid #d9dde3;background:#f7f7f7;flex-shrink:0}.pt-editor-layout{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:18px;padding:18px 24px 32px;align-items:start}.pt-editor-main{min-width:0;display:grid;gap:18px;align-content:start}.pt-editor-sidebar{width:320px;min-width:320px;display:grid;gap:18px;align-content:start}.pt-editor-crumb{display:flex;align-items:center;gap:10px;font-weight:700;min-width:0;overflow:hidden}.pt-editor-crumb span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pt-editor-more{position:relative}.pt-editor-more-menu{position:absolute;right:0;top:calc(100% + 6px);z-index:40;min-width:168px;background:#fff;border:1px solid #d9dde3;border-radius:10px;box-shadow:0 10px 32px rgba(0,0,0,.12);padding:6px;display:grid;gap:2px}.pt-editor-more-menu button{border:0;background:transparent;text-align:left;padding:8px 10px;border-radius:8px;color:#202124;cursor:pointer}.pt-editor-more-menu button:hover{background:#f4f4f4}.pt-section-list{display:grid;gap:4px;margin-bottom:14px}.pt-section-row{width:100%;border:0;background:#f7f7f7;text-align:left;cursor:pointer}.pt-section-visibility{margin-left:auto;font-size:12px;color:#666}.pt-section-inspector{margin-top:12px;padding-top:12px;border-top:1px solid #eceff2}.pt-editor-section-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.pt-light-card{background:#fff;border:1px solid #d9dde3;border-radius:14px;box-shadow:0 1px 0 rgba(0,0,0,.05),0 10px 32px rgba(0,0,0,.06);padding:18px}.pt-light-field{display:grid;gap:8px;margin-bottom:18px}.pt-light-field label{font-weight:700;color:#383d42}.pt-light-field input,.pt-light-field select,.pt-light-field textarea{border:1px solid #bfc5cc;border-radius:8px;background:#fff;color:#22262b;min-height:40px;padding:9px 12px;outline:none}.pt-light-field textarea{min-height:130px;resize:vertical}.pt-richbar{height:39px;border:1px solid #bfc5cc;border-bottom:0;border-radius:9px 9px 0 0;display:flex;align-items:center;gap:4px;padding:0 9px;background:#fbfbfb;color:#474d54}.pt-richarea{min-height:190px;border:1px solid #bfc5cc;border-radius:0 0 9px 9px;background:#fff;padding:16px;color:#3d434a;line-height:1.55}.pt-seo-title{color:#1a0dab;font-size:19px;margin-top:13px}.pt-side-stack{display:grid;gap:18px;align-content:start}.pt-radio-row{display:flex;gap:11px;align-items:flex-start;margin:13px 0;color:#4c5258}.pt-radio{width:18px;height:18px;border:1px solid #b7bdc4;border-radius:50%;margin-top:1px;display:grid;place-items:center}.pt-radio.active:after{content:"";width:8px;height:8px;border-radius:50%;background:#202124}.pt-subtext{color:#666b72;font-size:14px;margin-top:4px}.pt-studio-grid{display:grid;grid-template-columns:286px minmax(0,1fr) 340px;min-height:680px;border:1px solid #d9dde3;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 18px 50px rgba(0,0,0,.08)}.pt-studio-left{border-right:1px solid #d9dde3;background:#fff;display:flex;flex-direction:column;min-height:0}.pt-studio-left-head{height:45px;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #eceff2;font-weight:760}.pt-sections{overflow:auto;flex:1}.pt-group{padding:12px;border-bottom:1px solid #eceff2}.pt-group-label{font-size:14px;font-weight:820;margin-bottom:8px;color:#202124}.pt-section-row{height:32px;display:flex;align-items:center;gap:9px;padding:0 8px;border-radius:7px;color:#3d434a;font-size:13px;cursor:pointer}.pt-section-row:hover{background:#f4f4f4}.pt-section-row.active{background:#0b73e8;color:#fff}.pt-code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;opacity:.8}.pt-add{color:#0b73e8;font-weight:700}.pt-canvas{background:var(--panel3);min-width:0;overflow:auto}.pt-preview{min-height:900px;background:var(--panel2);color:var(--text);position:relative;border:2px solid var(--blue)}.pt-selected-tab{position:absolute;top:-2px;left:-2px;background:#0b73e8;color:white;height:26px;display:inline-flex;align-items:center;padding:0 9px;border-radius:0 0 6px 0;font-size:12px;font-weight:740;z-index:5}.pt-preview-head{height:72px;display:flex;align-items:center;padding:0 54px;gap:40px;background:rgba(0,0,0,.38)}.pt-preview-logo{width:43px;height:30px;border:1px solid rgba(201,132,67,.6);color:#c88443;display:grid;place-items:center;font-weight:850;letter-spacing:-.06em;font-size:16px;transform:skew(-8deg)}.pt-preview-nav{margin-left:auto;display:flex;gap:42px;font-weight:840;letter-spacing:.12em;font-size:14px}.pt-preview-nav span:first-child{text-decoration:underline;text-decoration-color:#c88443;text-decoration-thickness:2px;text-underline-offset:10px}.pt-hero{min-height:560px;display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:76px;background:var(--panel3)}.pt-hero-copy{max-width:450px;text-align:center;justify-self:center}.pt-hero-kicker{letter-spacing:.34em;color:var(--muted);font-size:18px}.pt-hero-title{margin:10px 0 18px;font-size:48px;line-height:1.03;letter-spacing:.05em;font-weight:900;color:var(--orange);text-transform:uppercase}.pt-hero-text{color:var(--muted);line-height:1.65;font-size:18px}.pt-hero-cta{margin-top:28px;height:52px;border-radius:999px;border:0;background:var(--blue);color:var(--bg-app,var(--bg-canvas,#fff));padding:0 32px;font-weight:850;letter-spacing:.12em;box-shadow:0 10px 28px color-mix(in srgb, var(--blue) 20%, transparent)}.pt-preview-lower{min-height:360px;padding:80px 76px;background:var(--panel2);text-align:center}.pt-preview-lower small{color:var(--orange);letter-spacing:.32em;font-weight:850}.pt-preview-lower h2{margin:16px auto;max-width:680px;font-size:52px;line-height:.97;letter-spacing:.03em;color:var(--text)}.pt-inspector{background:#fff;color:#202124;border-left:1px solid #d9dde3;display:flex;flex-direction:column;min-height:0}.pt-inspector-head{height:45px;display:flex;align-items:center;gap:8px;padding:0 14px;border-bottom:1px solid #eceff2;font-weight:830}.pt-inspector-body{overflow:auto;padding:14px}.pt-json{height:210px;border:1px solid #d0d4da;border-radius:8px;background:#fbfbfb;padding:11px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:#3d434a;white-space:pre;resize:vertical;width:100%}.pt-toast{position:fixed;right:18px;bottom:18px;background:#111;color:#fff;border-radius:12px;padding:12px 14px;box-shadow:0 18px 40px rgba(0,0,0,.2);z-index:80}.pt-template-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.pt-template{padding:18px;min-height:220px;display:flex;flex-direction:column;justify-content:space-between}.pt-template-preview{height:95px;border-radius:14px;border:1px solid var(--line);background:var(--panel2);margin-bottom:14px}.pt-import-drop{border:1px dashed var(--line2);border-radius:18px;background:var(--bg-hover,color-mix(in srgb, var(--text) 3%, transparent));padding:28px;text-align:center;color:var(--muted);cursor:pointer;transition:border-color .18s,background .18s}.pt-import-drop-active{border-color:var(--blue);background:color-mix(in srgb,var(--blue) 8%,transparent)}.pt-online-active{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,360px);overflow:hidden;margin:18px 0 26px;min-height:360px}.pt-online-previews{display:grid;grid-template-columns:1fr 180px;gap:14px;padding:22px;background:var(--panel3)}.pt-online-desktop,.pt-online-mobile{border-radius:14px;border:1px solid var(--line);overflow:hidden;background:var(--panel2);min-height:240px}.pt-online-meta{padding:22px;border-left:1px solid var(--line);display:flex;flex-direction:column;justify-content:space-between;gap:18px}.pt-theme-editor{display:grid;grid-template-columns:380px minmax(0,1fr);gap:0;min-height:0;height:100%;overflow:hidden;border-top:1px solid var(--line)}.pt-theme-form{padding:22px;overflow:auto;border-right:1px solid var(--line);background:var(--panel)}.pt-theme-form .pt-light-field label{font-size:11px;font-weight:780;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.pt-theme-form .pt-light-field input,.pt-theme-form .pt-light-field textarea{width:100%;border:1px solid var(--line);background:var(--panel);color:var(--text);border-radius:10px;padding:10px 12px;min-height:42px}.pt-theme-form .pt-light-field textarea{min-height:96px}.pt-theme-preview-wrap{min-width:0;display:flex;flex-direction:column;background:var(--panel3)}.pt-theme-preview-head{height:52px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;border-bottom:1px solid var(--line);color:var(--muted);font-size:13px}.pt-theme-preview-canvas{flex:1;min-height:0;overflow:auto;padding:24px;display:grid;place-items:center}.pt-theme-hero-preview{width:min(920px,100%);min-height:420px;border-radius:18px;border:1px solid var(--line);background:var(--panel2);padding:48px 56px;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:24px}.pt-theme-hero-copy small{display:block;color:var(--muted);letter-spacing:.28em;font-size:12px;text-transform:uppercase}.pt-theme-hero-copy h2{margin:10px 0 14px;font-size:clamp(28px,4vw,44px);line-height:1.02;color:var(--text);text-transform:uppercase;letter-spacing:.04em}.pt-theme-hero-copy p{color:var(--muted);line-height:1.6;font-size:15px;max-width:420px}.pt-theme-hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}.pt-theme-hero-actions button{height:40px;border-radius:999px;border:0;padding:0 18px;font-weight:760;cursor:pointer}.pt-theme-hero-actions .primary{background:var(--blue);color:var(--bg-app,var(--bg-canvas,#fff))}.pt-theme-hero-actions .secondary{background:var(--bg-hover,color-mix(in srgb, var(--text) 6%, transparent));color:var(--text);border:1px solid var(--line)}.pt-theme-hero-visual{justify-self:center;width:min(280px,100%);aspect-ratio:1;border-radius:999px;background:var(--panel3);border:1px solid var(--line);display:grid;place-items:center;color:var(--orange);font-weight:900;font-size:28px;overflow:hidden}.pt-theme-hero-visual img{width:100%;height:100%;object-fit:cover}.pt-status-ok{color:var(--green);font-size:12px;margin-top:8px}.pt-store-frame{display:flex;flex-direction:column;height:100%;min-height:280px;background:var(--panel2);border-radius:inherit;overflow:hidden}.pt-store-frame-chrome{height:32px;display:flex;align-items:center;gap:6px;padding:0 12px;background:var(--panel);border-bottom:1px solid var(--line);flex-shrink:0}.pt-store-frame-dot{width:8px;height:8px;border-radius:99px;background:color-mix(in srgb, var(--text) 18%, transparent)}.pt-store-frame-url{margin-left:8px;font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pt-store-frame-viewport{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--panel2);display:flex;align-items:flex-start;justify-content:center}.pt-store-iframe-scaler{position:relative;overflow:hidden;flex-shrink:0}.pt-store-iframe{border:0;background:#fff;display:block;pointer-events:none}.pt-store-frame--mobile .pt-store-frame-viewport{min-height:300px}.pt-store-frame--thumb{min-height:86px;height:86px;border-radius:12px;border:1px solid var(--line)}.pt-store-frame--thumb .pt-store-frame-chrome{display:none}.pt-feature .pt-stage{padding:0;background:var(--panel3);min-height:320px}.pt-online-desktop,.pt-online-mobile{padding:0;min-height:320px;background:var(--panel2);display:flex}.pt-thumb.pt-thumb-live{padding:0;overflow:hidden;border:1px solid var(--line)}.pt-theme-preview-canvas{padding:0;display:block;min-height:480px}.pt-theme-preview-canvas .pt-store-frame{min-height:480px;border-radius:0}@media(max-width:1100px){.pt-feature,.pt-main-grid,.pt-studio-grid,.pt-online-active,.pt-theme-editor{grid-template-columns:1fr}.pt-editor-layout{grid-template-columns:1fr;padding:14px}.pt-editor-sidebar{width:100%;min-width:0}.pt-feature-meta{border-left:0;border-top:1px solid var(--line)}.pt-online-meta{border-left:0;border-top:1px solid var(--line)}.pt-metrics{grid-template-columns:repeat(2,1fr)}.pt-template-grid,.pt-template-skeleton-grid{grid-template-columns:repeat(2,1fr)}.pt-studio-left,.pt-inspector{min-height:260px}.pt-hero,.pt-theme-hero-preview{grid-template-columns:1fr}}@media(max-width:760px){.pt-page{padding:18px 14px}.pt-head,.pt-site-row{grid-template-columns:1fr;flex-direction:column}.pt-toolbar,.pt-metrics,.pt-template-grid,.pt-template-skeleton-grid,.pt-online-previews{grid-template-columns:1fr}.pt-metric{border-right:0;border-top:1px solid var(--line)}.pt-metric:first-child{border-top:0}.pt-site-row{display:grid}.pt-row-actions,.pt-actions{justify-content:flex-start}.pt-editor-body{padding:14px}.pt-blinks{display:none}.pt-hero{padding:42px 24px}.pt-preview-head{padding:0 20px}.pt-preview-nav{display:none}}.pt-template-skeleton-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.pt-template-skeleton{padding:18px;min-height:220px;display:flex;flex-direction:column;gap:14px}.pt-skel-block{border-radius:14px;background:linear-gradient(90deg,color-mix(in srgb,var(--text) 5%,transparent) 0%,color-mix(in srgb,var(--text) 11%,transparent) 50%,color-mix(in srgb,var(--text) 5%,transparent) 100%);background-size:200% 100%;animation:pt-shimmer 1.25s ease-in-out infinite}.pt-skel-preview{height:95px}.pt-skel-line{height:14px;border-radius:8px}.pt-skel-line.short{width:45%}.pt-skel-line.mid{width:72%}@keyframes pt-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}.pt-template-preview--live{cursor:pointer;position:relative;overflow:hidden;transition:border-color .18s,box-shadow .18s}.pt-template-preview--live:hover{border-color:color-mix(in srgb,var(--blue) 45%,transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--blue) 18%,transparent)}.pt-template-preview--live:hover .pt-template-preview__badge{opacity:1}.pt-template-preview__badge{position:absolute;inset:0;display:grid;place-items:center;background:color-mix(in srgb,var(--bg) 42%,transparent);color:var(--text);font-size:11px;font-weight:780;letter-spacing:.1em;text-transform:uppercase;opacity:0;transition:opacity .18s;pointer-events:none}.pt-modal-overlay{position:fixed;inset:0;z-index:120;background:color-mix(in srgb,var(--bg) 58%,transparent);backdrop-filter:blur(8px);display:grid;place-items:center;padding:24px}.pt-modal{width:min(1120px,100%);max-height:min(92vh,900px);background:var(--panel);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);display:flex;flex-direction:column;overflow:hidden}.pt-template-modal{width:min(1180px,100%)}.pt-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 22px;border-bottom:1px solid var(--line)}.pt-modal-title{margin:0;font-size:22px;font-weight:850;letter-spacing:-.03em}.pt-modal-sub{margin:6px 0 0;color:var(--muted);font-size:13px}.pt-modal-body{flex:1;min-height:0;overflow:auto;padding:18px 22px 22px}.pt-template-modal-frame{min-height:520px;border-radius:14px;border:1px solid var(--line);overflow:hidden}.pt-template-modal-inline{display:grid;gap:18px;place-items:center;padding:24px 12px}.pt-inline-demo{display:grid;gap:12px;place-items:center;width:min(520px,100%)}.pt-inline-demo__loading{color:var(--muted);font-size:14px;padding:24px}.pt-inline-demo__phase-control{display:grid;gap:8px;width:min(520px,100%)}
.pt-inline-demo__phase-control input[type=range]{width:100%;accent-color:var(--blue)}.pt-inline-demo__meta code{font-size:11px}.pt-template-modal-empty{padding:40px 20px;text-align:center;color:var(--muted)}
`;

function useStyle() {
  useEffect(() => {
    const id = 'iam-cms-suite-styles';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.textContent = STYLES;
    document.head.appendChild(s);
    return () => {};
  }, []);
}

function siteInitials(name?: string | null, slug?: string | null): string {
  const src = (name || slug || 'CM').trim();
  const parts = src.split(/[\s·-]+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function formatDate(value) {
  if (!value) return 'Not yet';
  const n = Number(value);
  const d = Number.isFinite(n) && n > 100000 ? new Date(n * 1000) : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function statusLabel(status) {
  const s = String(status || 'draft').toLowerCase();
  if (s === 'published') return 'Visible';
  if (s === 'draft') return 'Draft';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildPath(panel, site, pageId) {
  const qs = site ? `?site=${encodeURIComponent(site)}` : '';
  if (panel === 'online-store') return `/dashboard/cms/online-store${qs}`;
  if (panel === 'theme-editor') return `/dashboard/cms/theme-editor${qs}`;
  if (panel === 'templates') return `/dashboard/cms/templates${qs}`;
  if (panel === 'imports') return `/dashboard/cms/imports${qs}`;
  if (pageId) return `/dashboard/cms/pages/${encodeURIComponent(pageId)}${qs}`;
  return `/dashboard/cms/pages${qs}`;
}

function withQuery(path, params = {}) {
  const [base, raw = ''] = path.split('?');
  const sp = new URLSearchParams(raw);
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') sp.delete(key);
    else sp.set(key, String(value));
  }
  const q = sp.toString();
  return q ? `${base}?${q}` : base;
}

function CmsCompactHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="pt-compact-head">
      <h1 className="pt-compact-title">{title}</h1>
      {actions ? <div className="pt-actions">{actions}</div> : null}
    </header>
  );
}

function CmsMetrics({ pages = [], themes = [], assets = [], imports = [], summary = null }: {
  pages?: CmsBootstrapData['pages'];
  themes?: unknown[];
  assets?: unknown[];
  imports?: unknown[];
  summary?: { totalPages?: number; published?: number | null; drafts?: number | null; themes?: number | null; assets?: number | null; imports?: number | null } | null;
}) {
  const pageTotal = summary?.totalPages ?? pages.length;
  const published = summary?.published ?? pages.filter((p) => String(p.status).toLowerCase() === 'published').length;
  const drafts = summary?.drafts ?? pages.filter((p) => String(p.status).toLowerCase() === 'draft').length;
  const themeCount = summary?.themes ?? themes.length;
  const assetCount = summary?.assets ?? assets.length;
  const importCount = summary?.imports ?? imports.length;
  return <section className="pt-card pt-metrics"><div className="pt-metric"><div className="pt-label">Pages</div><div className="pt-value">{pageTotal}<span>total</span></div></div><div className="pt-metric"><div className="pt-label">Live pages</div><div className="pt-value">{published}<span>published</span></div></div><div className="pt-metric"><div className="pt-label">Draft changes</div><div className="pt-value">{drafts}<span>pending</span></div></div><div className="pt-metric"><div className="pt-label">Themes</div><div className="pt-value">{themeCount}<span>available</span></div></div><div className="pt-metric"><div className="pt-label">Assets and imports</div><div className="pt-value">{assetCount}<span>assets</span>{importCount}<span>imports</span></div><div className="pt-bars"><i /><i /></div></div></section>;
}

function Loading({ label = 'Loading CMS…' }) { return <div className="pt-page"><div className="pt-page-inner"><div className="pt-card" style={{ padding: 24, color: 'var(--muted)' }}>{label}</div></div></div>; }
function ErrorBox({ error, onRetry }) { return <div className="pt-card" style={{ padding: 20, color: 'var(--muted)' }}><strong style={{ color: 'var(--text)' }}>Could not load CMS data.</strong><p>{error}</p>{onRetry && <button className="pt-btn" onClick={onRetry}>Retry</button>}</div>; }

function SitesView({
  sites = [],
  primaryProjectSlug = null,
  workspaceSlug = null,
  publicDomain = null,
  loadingSites = false,
  sitesError = '',
  onNavigatePath,
  onRetry,
}: {
  sites?: CmsSiteRow[];
  primaryProjectSlug?: string | null;
  workspaceSlug?: string | null;
  publicDomain?: string | null;
  loadingSites?: boolean;
  sitesError?: string;
  onNavigatePath: (path: string) => void;
  onRetry?: () => void;
}) {
  const rows = sites || [];
  const featured = rows.find((s) => s.slug === primaryProjectSlug)
    || rows.find((s) => s.slug === workspaceSlug)
    || rows[0];
  const otherSites = featured ? rows.filter((s) => s.slug !== featured.slug) : rows;
  const metricsSummary = useMemo(() => {
    const totalPages = rows.reduce((n, s) => n + (Number(s.page_count) || 0), 0);
    return { totalPages, published: null, drafts: null, themes: null, assets: null, imports: null };
  }, [rows]);
  const siteUrl = (site: CmsSiteRow) =>
    resolveStorefrontUrl({
      projectSlug: site.slug,
      siteDomain: site.domain,
      publicDomain:
        site.slug === primaryProjectSlug || site.slug === workspaceSlug ? publicDomain : null,
    });
  const featuredUrl = featured
    ? resolveStorefrontUrl({ projectSlug: featured.slug, siteDomain: featured.domain, publicDomain })
    : resolveStorefrontUrl({ projectSlug: primaryProjectSlug, publicDomain });
  useEffect(() => {
    for (const slug of ['anythingfloorsandmore', 'meauxbility', 'nicoc'] as const) {
      const site = rows.find((s) => s.slug === slug);
      if (!site) continue;
      const url = siteUrl(site);
      console.info('[CMS Sites] storefront preview URL', {
        slug: site.slug,
        domain: site.domain ?? null,
        source: site.source ?? null,
        url,
        fallback: url.includes('.meauxbility.workers.dev') ? 'workers.dev guess' : 'domain map or tenant',
      });
    }
  }, [rows, primaryProjectSlug, workspaceSlug, publicDomain]);
  return (
    <div className="pt-page">
      <div className="pt-page-inner">
        <CmsCompactHeader
          title="Sites"
          actions={
            <>
              <button type="button" className="pt-btn" onClick={() => onNavigatePath(buildPath('imports', featured?.slug || null))}>Import site</button>
              {featured ? (
                <button type="button" className="pt-btn" onClick={() => onNavigatePath(buildPath('online-store', featured.slug))}>Online store</button>
              ) : null}
              <button type="button" className="pt-btn primary" disabled={!featured} onClick={() => featured && onNavigatePath(buildPath('pages', featured.slug))}>Open pages</button>
            </>
          }
        />
        {sitesError ? <ErrorBox error={sitesError} onRetry={onRetry} /> : null}
        {loadingSites ? <Loading label="Loading connected sites..." /> : (
          <>
            <CmsMetrics summary={{ ...metricsSummary, published: 0, drafts: 0, themes: 0, assets: 0, imports: 0 }} />
            {featured ? (
              <section className="pt-card pt-feature">
                <div className="pt-stage">
                  <StorefrontPreview url={featuredUrl} variant="desktop" title={storefrontDisplayHost(featuredUrl)} />
                </div>
                <aside className="pt-feature-meta">
                  <div>
                    <div className="pt-site-name"><span className="pt-mark">{siteInitials(featured.name, featured.slug)}</span>{featured.name || featured.slug}</div>
                    <div className="pt-domain">{storefrontDisplayHost(featuredUrl)}</div>
                    <div className="pt-badges">
                      <span className="pt-badge">Live</span>
                      <span className="pt-badge neutral">{featured.page_count || 0} pages</span>
                      <span className="pt-badge neutral">CMS Lite</span>
                    </div>
                  </div>
                  <div className="pt-feature-stats">
                    <div className="pt-mini-stat"><span>Last edited</span><strong>{formatDate(featured.updated_at)}</strong></div>
                    <div className="pt-mini-stat"><span>Project slug</span><strong>{featured.slug}</strong></div>
                    <div className="pt-mini-stat"><span>Surface</span><strong>CMS Suite</strong></div>
                  </div>
                  <div className="pt-actions" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" className="pt-btn primary" onClick={() => onNavigatePath(buildPath('online-store', featured.slug))}>Customize</button>
                    <button type="button" className="pt-btn" onClick={() => onNavigatePath(buildPath('pages', featured.slug))}>Pages</button>
                    <button type="button" className="pt-btn" onClick={() => onNavigatePath(buildPath('theme-editor', featured.slug))}>Theme editor</button>
                  </div>
                </aside>
              </section>
            ) : (
              <div className="pt-card" style={{ padding: 24, color: 'var(--muted)' }}>No CMS sites are registered for this workspace yet.</div>
            )}
            {otherSites.length ? (
              <>
                <div className="pt-head" style={{ marginTop: 28 }}>
                  <div>
                    <h2 className="pt-title" style={{ fontSize: 26 }}>Connected sites</h2>
                    <p className="pt-copy" style={{ marginTop: 6, display: 'none' }}>Connected sites</p>
                  </div>
                </div>
                <section className="pt-card pt-list">
                  {otherSites.map((site) => (
                    <article className="pt-site-row" key={site.slug || site.id}>
                      <div className="pt-thumb pt-thumb-live">
                        <StorefrontPreview
                          url={siteUrl(site)}
                          variant="thumb"
                          title={site.name || site.slug}
                        />
                      </div>
                      <div>
                        <div className="pt-row-title">{site.name || `CMS · ${site.slug}`}</div>
                        <div className="pt-row-sub">{storefrontDisplayHost(siteUrl(site))}</div>
                        <div className="pt-row-meta">
                          <span className="pt-badge">Live</span>
                          <span>{site.page_count || 0} pages</span>
                          <span>Last edited {formatDate(site.updated_at)}</span>
                        </div>
                      </div>
                      <div className="pt-row-actions">
                        <button type="button" className="pt-btn primary" onClick={() => onNavigatePath(buildPath('online-store', site.slug))}>Customize</button>
                        <button type="button" className="pt-btn" onClick={() => onNavigatePath(buildPath('pages', site.slug))}>Pages</button>
                        <button type="button" className="pt-btn" onClick={() => window.open(siteUrl(site), '_blank', 'noopener')}>View</button>
                      </div>
                    </article>
                  ))}
                </section>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function useBootstrap(projectSlug: string | null | undefined, pageId: string | null | undefined) {
  const [state, setState] = useState<{ loading: boolean; error: string; data: CmsBootstrapData | null }>({ loading: true, error: '', data: null });
  const load = useCallback(() => {
    if (!projectSlug) { setState({ loading: false, error: 'CMS site not resolved.', data: null }); return; }
    setState((s) => ({ ...s, loading: true, error: '' }));
    const q = new URLSearchParams({ project_slug: projectSlug });
    if (pageId) q.set('page_id', pageId);
    api<CmsBootstrapData>(`/api/cms/bootstrap?${q}`).then((d) => setState({ loading: false, error: '', data: d })).catch((e: Error) => setState({ loading: false, error: e.message, data: null }));
  }, [projectSlug, pageId]);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

function PagesList({ projectSlug, onNavigatePath, workspaceLabel }) {
  const { loading, error, data, reload } = useBootstrap(projectSlug, null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const pages = data?.pages || [];
  const filtered = pages.filter((p) => `${p.title || ''} ${p.slug || ''} ${p.route_path || ''}`.toLowerCase().includes(query.toLowerCase()));
  const createPage = async () => {
    const title = window.prompt('Page title');
    if (!title) return;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `page-${Date.now()}`;
    setCreating(true);
    try {
      const created = await api('/api/cms/pages', { method: 'POST', body: { project_id: projectSlug, slug, title, content: `<main><h1>${title}</h1></main>`, content_type: 'text/html' } });
      onNavigatePath(buildPath('pages', projectSlug, created.id));
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  };
  if (loading) return <Loading label="Loading pages..." />;
  return <div className="pt-page"><div className="pt-page-inner"><CmsCompactHeader title="Pages" actions={<><button className="pt-btn" onClick={() => onNavigatePath(buildPath('templates', projectSlug))}>Templates</button><button className="pt-btn" onClick={() => onNavigatePath(buildPath('theme-editor', projectSlug))}>Theme editor</button><button className="pt-btn primary" disabled={creating} onClick={createPage}>{creating ? 'Creating...' : 'Add page'}</button></>} />{error && <ErrorBox error={error} onRetry={reload} />}<CmsMetrics pages={pages} themes={data?.themes || []} assets={data?.assets_3d || data?.assets || []} imports={data?.imports || []} /><div className="pt-toolbar"><input className="pt-input" placeholder="Search pages, slugs, routes..." value={query} onChange={(e) => setQuery(e.target.value)} /><select className="pt-select"><option>All statuses</option><option>Published</option><option>Draft</option></select><button className="pt-btn" onClick={reload}>Refresh</button></div><section className="pt-card pt-table-wrap"><table className="pt-table"><thead><tr><th>Title</th><th>Visibility</th><th>Route</th><th>Content</th><th>Updated</th></tr></thead><tbody>{filtered.map((p) => <tr key={p.id} onClick={() => onNavigatePath(buildPath('pages', projectSlug, p.id))}><td><strong>{p.title || p.slug}</strong>{p.is_homepage ? <div className="pt-row-meta">Homepage</div> : null}</td><td><span className={`pt-badge ${String(p.status).toLowerCase() === 'published' ? '' : 'neutral'}`}>{statusLabel(p.status)}</span></td><td>{p.route_path || `/${p.slug || ''}`}</td><td className="pt-row-sub">{p.meta_description || p.seo_title || 'Open to edit'}</td><td>{formatDate(p.updated_at)}</td></tr>)}</tbody></table>{!filtered.length && <div style={{ padding: 24, color: 'var(--muted)', textAlign: 'center' }}>No pages match this search.</div>}</section></div></div>;
}

const MARKETING_TEMPLATES = [
  {
    id: 'tpl_london_train_ref',
    template_name: 'London Dream Railway',
    template_type: 'marketing_page',
    category: 'Marketing',
    is_system: 1,
    slug: 'marketing-london-dream-railway',
    source_html_r2_key: 'static/pages/marketing/london-train/index.html',
    template_data: JSON.stringify({
      title: 'London Dream Railway',
      description: 'Immersive Three.js animated railway marketing page.',
      stack: ['Three.js', 'Procedural animation', 'GLSL shaders'],
      source_branch: 'marketing/london-train-ref',
      source_url: 'https://petergpt.github.io/london-train/',
    }),
  },
  {
    id: 'tpl_bridge_fly_ref',
    template_name: 'Golden Gate Fly Scene',
    template_type: 'marketing_page',
    category: 'Marketing',
    is_system: 1,
    slug: 'marketing-golden-gate-fly',
    source_html_r2_key: 'static/pages/marketing/bridge-fly/index.html',
    template_data: JSON.stringify({
      title: 'Golden Gate Fly Scene',
      description: 'Autopilot + manual WASD flight over a procedural bay scene with GLSL water shader.',
      stack: ['Three.js', 'GLSL water', 'Pointer Lock API'],
      source_branch: 'marketing/bridge-fly-ref',
      source_url: 'https://openai-miniapps-examples.vercel.app/bridge-5p5/',
    }),
  },
];

function ImportsView({ projectSlug, onNavigatePath }) {
  const [imports, setImports] = useState(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('Shopify theme import');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = useCallback(() => { setError(''); api('/api/cms/liquid-imports').then((d) => setImports(d.imports || [])).catch((e) => setError(e.message)); }, []);
  useEffect(() => { load(); }, [load]);
  const uploadFile = async (file: File) => {
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.zip') && !lower.endsWith('.tar.gz') && !lower.endsWith('.tgz') && !lower.endsWith('.tar')) {
      alert('Upload a Shopify theme .zip or .tar.gz archive');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('import_name', name || file.name.replace(/\.[^.]+$/, ''));
      const qs = projectSlug ? `?project_slug=${encodeURIComponent(projectSlug)}` : '';
      const res = await fetch(`/api/cms/liquid-imports/upload${qs}`, { method: 'POST', credentials: 'include', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || res.statusText);
      setName('Shopify theme import');
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setDragOver(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };
  return <div className="pt-page"><div className="pt-page-inner"><CmsCompactHeader title="Imports" actions={<><button className="pt-btn" onClick={() => onNavigatePath(buildPath('pages', projectSlug))}>Pages</button><button type="button" className="pt-btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>{busy ? 'Uploading…' : 'Choose file'}</button></>} />{error && <ErrorBox error={error} onRetry={load} />}<section className="pt-card" style={{ padding: 20, marginBottom: 18 }}><div className="pt-main-grid"><div className={`pt-import-drop${dragOver ? ' pt-import-drop-active' : ''}`} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') fileRef.current?.click(); }}><strong style={{ color: 'var(--text)' }}>Drop Shopify theme archive</strong><p style={{ color: 'var(--muted)', margin: '8px 0 12px', fontSize: 13 }}>.zip or .tar.gz — extracts Liquid sections to R2, then Agent Sam can map them into CMS pages.</p><input ref={fileRef} type="file" accept=".zip,.tar,.tar.gz,.tgz" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ''; }} /><input className="pt-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Import name" style={{ maxWidth: 360 }} /></div><div className="pt-card" style={{ padding: 18 }}><div className="pt-label">After import</div><p style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>Sections land in <code>cms_liquid_sections</code>. Use studio editor or Agent Sam to map sections → pages. Liquid is stored for reference; live editing uses HTML sections.</p></div></div></section>{!imports ? <Loading label="Loading imports..." /> : <section className="pt-card pt-list">{imports.map((imp) => <article className="pt-site-row" key={imp.id}><div className="pt-thumb blue">Liquid import</div><div><div className="pt-row-title">{imp.import_name}</div><div className="pt-row-sub">{imp.source_type || 'manual'} · {imp.import_key || imp.id}</div><div className="pt-row-meta"><span className="pt-badge neutral">{imp.status || 'queued'}</span><span>{imp.sections_found || 0} found</span><span>{imp.sections_mapped || 0} mapped</span></div></div><div className="pt-row-actions"><button type="button" className="pt-btn" onClick={() => onNavigatePath(buildPath('pages', projectSlug))}>Pages</button><button type="button" className="pt-btn primary" onClick={() => { const qs = projectSlug ? `?project=${encodeURIComponent(projectSlug)}` : ''; window.location.href = `/studio/editor${qs}`; }}>Studio</button></div></article>)}{!imports.length && <div style={{ padding: 24, color: 'var(--muted)' }}>No imports yet — drop your Shopify theme zip above.</div>}</section>}</div></div>;
}

function OnlineStoreView({
  projectSlug,
  workspaceLabel,
  publicDomain,
  onNavigatePath,
}: {
  projectSlug: string | null | undefined;
  workspaceLabel?: string | null;
  publicDomain?: string | null;
  onNavigatePath: (path: string) => void;
}) {
  const { loading, error, data, reload } = useBootstrap(projectSlug, null);
  const theme = data?.active_theme;
  const pages = data?.pages || [];
  const published = pages.filter((p) => String(p.status).toLowerCase() === 'published').length;
  const publicUrl = resolveStorefrontUrl({
    projectSlug,
    tenantDomain: data?.tenant?.domain,
    publicDomain,
  });
  const lastSaved = pages.reduce<string | null>((latest, p) => {
    const ts = p.updated_at || p.published_at;
    if (!ts) return latest;
    if (!latest) return ts;
    return new Date(ts) > new Date(latest) ? ts : latest;
  }, null);

  return (
    <div className="pt-page">
      <div className="pt-page-inner">
        <CmsCompactHeader
          title="Online store"
          actions={
            <>
              <span className="pt-badge">Public</span>
              <button type="button" className="pt-btn" onClick={() => window.open(publicUrl, '_blank', 'noopener')}>View store</button>
              <button type="button" className="pt-btn primary" onClick={() => onNavigatePath(buildPath('theme-editor', projectSlug))}>Edit theme</button>
            </>
          }
        />
        {error ? <ErrorBox error={error} onRetry={reload} /> : null}
        {loading ? (
          <div className="pt-card" style={{ padding: 16, color: 'var(--muted)', marginBottom: 18 }}>Loading page stats…</div>
        ) : (
          <CmsMetrics pages={pages} themes={data?.themes || []} assets={data?.assets_3d || data?.assets || []} imports={data?.imports || []} />
        )}
        <section className="pt-card pt-online-active">
          <div className="pt-online-previews">
            <div className="pt-online-desktop">
              <StorefrontPreview url={publicUrl} variant="desktop" title={storefrontDisplayHost(publicUrl)} />
            </div>
            <div className="pt-online-mobile">
              <StorefrontPreview url={publicUrl} variant="mobile" title="Mobile" />
            </div>
          </div>
          <aside className="pt-online-meta">
            <div>
              <div className="pt-site-name"><span className="pt-mark">{siteInitials(theme?.name || workspaceLabel, projectSlug)}</span>{theme?.name || workspaceLabel || projectSlug}</div>
              <div className="pt-domain">{storefrontDisplayHost(publicUrl)}</div>
              <div className="pt-badges" style={{ marginTop: 12 }}>
                <span className="pt-badge">Active</span>
                <span className="pt-badge neutral">{loading ? '…' : `${published} live pages`}</span>
              </div>
            </div>
            <div className="pt-feature-stats">
              <div className="pt-mini-stat"><span>Last saved</span><strong>{formatDate(lastSaved)}</strong></div>
              <div className="pt-mini-stat"><span>Theme slug</span><strong>{theme?.slug || 'default'}</strong></div>
              <div className="pt-mini-stat"><span>Project</span><strong>{projectSlug}</strong></div>
            </div>
            <div className="pt-actions" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="pt-btn primary" onClick={() => onNavigatePath(buildPath('theme-editor', projectSlug))}>Edit theme</button>
              <button type="button" className="pt-btn" onClick={() => onNavigatePath(buildPath('pages', projectSlug))}>Pages</button>
            </div>
          </aside>
        </section>
        <section className="pt-card" style={{ padding: 20, color: 'var(--muted)' }}>Use Edit theme to open the full storefront editor.</section>
      </div>
    </div>
  );
}

export function PrimeTechCmsLite({
  workspaceId = '',
  workspaceLabel = null,
  workspaceSlug = null,
  publicDomain = null,
  sites = [],
  primaryProjectSlug = null,
  loadingSites = false,
  sitesError = '',
  onRetrySites = () => {},
  view = 'sites',
  projectSlug = null,
  pageId = null,
  addToPageId = null,
  loadingProject = false,
  projectError = '',
  onNavigatePath = () => {},
}: PrimeTechCmsLiteProps) {
  useStyle();
  if (loadingProject && view !== 'sites') return <div className="pt-cms-lite"><Loading label="Loading…" /></div>;
  if (projectError && view !== 'sites') return <div className="pt-cms-lite"><div className="pt-page"><div className="pt-page-inner"><ErrorBox error={projectError} /></div></div></div>;
  return (
    <div className="pt-cms-lite" data-brand="CMS Suite">
      {view === 'sites' ? (
        <SitesView
          sites={sites}
          primaryProjectSlug={primaryProjectSlug}
          workspaceSlug={workspaceSlug}
          publicDomain={publicDomain}
          loadingSites={loadingSites}
          sitesError={sitesError}
          onNavigatePath={onNavigatePath}
          onRetry={onRetrySites}
        />
      ) : null}
      {view === 'online-store' ? (
        <OnlineStoreView
          projectSlug={projectSlug}
          workspaceLabel={workspaceLabel}
          publicDomain={publicDomain}
          onNavigatePath={onNavigatePath}
        />
      ) : null}
      {view === 'templates' ? (
        <TemplateLibraryStudio
          projectSlug={projectSlug}
          addToPageId={addToPageId}
          onNavigatePath={onNavigatePath}
          marketingTemplates={MARKETING_TEMPLATES}
        />
      ) : null}
      {view === 'imports' ? <ImportsView projectSlug={projectSlug} onNavigatePath={onNavigatePath} /> : null}
      {view === 'pages' && !pageId ? <PagesList workspaceLabel={workspaceLabel} projectSlug={projectSlug} onNavigatePath={onNavigatePath} /> : null}
    </div>
  );
}

export default PrimeTechCmsLite;
