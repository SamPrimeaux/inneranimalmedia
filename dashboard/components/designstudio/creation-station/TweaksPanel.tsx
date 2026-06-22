import React, { useRef } from 'react';
import { Key, Loader2, Sparkles } from 'lucide-react';
import type { MeshyPhase, MeshySettings } from './meshyTypes';
import type { CreationTool } from './useCreationStation';
import { ScenePanel, type SavedSceneRow } from '../shared/ScenePanel';
import { AssetLibrary } from '../shared/AssetLibrary';
import type { CustomAsset } from '../../../types';

const SAMPLE_PROMPT =
  'A chess king piece, ornate gothic crown with four arched buttresses, wide weighted base, ultra high detail.';

type Props = {
  tool: CreationTool;
  meshyPhase: MeshyPhase;
  onMeshyPhase: (p: MeshyPhase) => void;
  settings: MeshySettings;
  onPatch: (p: Partial<MeshySettings>) => void;
  meshyStub: boolean;
  ctaCost: number;
  isGenerating: boolean;
  progressPct?: number;
  onCreate: () => void;
  onQuickGenerate: () => void;
  apiKeyDraft: string;
  onApiKeyDraft: (v: string) => void;
  onSaveApiKey: () => void;
  savingKey: boolean;
  onImportGlb?: (file: File) => void;
  onBlenderExport?: () => void;
  onBlenderTerminal?: () => void;
  sceneName: string;
  onSceneNameChange: (n: string) => void;
  savedScenes: SavedSceneRow[];
  sceneBusy: boolean;
  onSaveScene: () => void;
  onLoadScene: (id: string) => void;
  customAssets: CustomAsset[];
  onSpawnModel: (name: string, url: string, scale: number) => void;
  onAddCustomAsset: (name: string, url: string) => void | Promise<void>;
  onRemoveCustomAsset: (id: string) => void | Promise<void>;
  onRefreshUserAssets?: () => void;
  latestGlbUrl?: string | null;
  onDownloadGlb?: () => void;
  className?: string;
};

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1 text-[11px] text-zinc-400">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-emerald-500' : 'bg-zinc-700'}`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'left-[18px]' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}

export function TweaksPanel({
  tool,
  meshyPhase,
  onMeshyPhase,
  settings,
  onPatch,
  meshyStub,
  ctaCost,
  isGenerating,
  progressPct,
  onCreate,
  onQuickGenerate,
  apiKeyDraft,
  onApiKeyDraft,
  onSaveApiKey,
  savingKey,
  onImportGlb,
  onBlenderExport,
  onBlenderTerminal,
  sceneName,
  onSceneNameChange,
  savedScenes,
  sceneBusy,
  onSaveScene,
  onLoadScene,
  customAssets,
  onSpawnModel,
  onAddCustomAsset,
  onRemoveCustomAsset,
  onRefreshUserAssets,
  latestGlbUrl,
  onDownloadGlb,
  className = '',
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  const title =
    tool === 'text-to-3d'
      ? 'Text to 3D'
      : tool === 'import'
        ? 'Import GLB'
        : tool === 'blender'
          ? 'Blender'
          : 'Scene';

  return (
    <aside
      className={`flex flex-col min-h-0 border-white/[0.06] border-b md:border-b-0 md:border-r bg-[#101218] ${className}`}
    >
      <header className="shrink-0 px-4 pt-4 pb-3 border-b border-white/[0.06]">
        <h2 className="text-[15px] font-semibold text-zinc-100">{title}</h2>
        {tool === 'text-to-3d' && (
          <div className="flex gap-1 mt-3 p-0.5 rounded-lg bg-black/40">
            {(['preview', 'refine'] as MeshyPhase[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onMeshyPhase(p)}
                className={`flex-1 py-1.5 rounded-md text-[11px] font-semibold capitalize ${
                  meshyPhase === p
                    ? 'bg-emerald-500 text-[#041018]'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-4 py-3 space-y-3">
        {tool === 'text-to-3d' && (
          <>
            {meshyStub && (
              <p className="text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                Meshy platform key not set — add BYOK below or use org Worker secret.
              </p>
            )}

            {meshyPhase === 'refine' && (
              <div>
                <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
                  Preview task ID
                </label>
                <input
                  className="mt-1 w-full bg-[#08090d] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] font-mono text-zinc-300"
                  placeholder="From preview step…"
                  value={settings.preview_task_id}
                  onChange={(e) => onPatch({ preview_task_id: e.target.value })}
                />
              </div>
            )}

            <div>
              <label className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">Prompt</label>
              <textarea
                rows={5}
                className="mt-1 w-full bg-[#08090d] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[12px] text-zinc-200 leading-relaxed resize-none focus:border-emerald-500/40 focus:outline-none"
                placeholder={SAMPLE_PROMPT}
                value={meshyPhase === 'refine' ? settings.texture_prompt || settings.prompt : settings.prompt}
                onChange={(e) =>
                  meshyPhase === 'refine'
                    ? onPatch({ texture_prompt: e.target.value })
                    : onPatch({ prompt: e.target.value })
                }
                disabled={isGenerating}
              />
              <p className="mt-1 text-[10px] text-zinc-600 text-right">
                {(meshyPhase === 'refine' ? settings.texture_prompt || settings.prompt : settings.prompt).length}/600
              </p>
            </div>

            <details className="group rounded-xl border border-white/[0.06] bg-[#0c0d12]">
              <summary className="px-3 py-2.5 text-[11px] font-medium text-zinc-400 cursor-pointer list-none flex justify-between">
                Optional settings
                <span className="text-zinc-600 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="px-3 pb-3 space-y-2 border-t border-white/[0.04]">
                <label className="text-[10px] text-zinc-500">AI model</label>
                <select
                  className="w-full bg-[#08090d] border border-white/[0.08] rounded-lg px-2 py-2 text-[11px] text-zinc-300"
                  value={settings.ai_model}
                  onChange={(e) => onPatch({ ai_model: e.target.value })}
                >
                  <option value="meshy-6">Meshy 6</option>
                  <option value="latest">Latest</option>
                  <option value="meshy-5">Meshy 5</option>
                </select>
                <div className="flex gap-1">
                  {(['standard', 'lowpoly'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onPatch({ model_type: m })}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold ${
                        settings.model_type === m
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
                          : 'border border-white/[0.08] text-zinc-500'
                      }`}
                    >
                      {m === 'lowpoly' ? 'Low poly' : 'Standard'}
                    </button>
                  ))}
                </div>
                <label className="text-[10px] text-zinc-500">Target polycount</label>
                <input
                  type="number"
                  min={1000}
                  max={300000}
                  className="w-full bg-[#08090d] border border-white/[0.08] rounded-lg px-2 py-2 text-[11px]"
                  value={settings.target_polycount}
                  onChange={(e) => onPatch({ target_polycount: Number(e.target.value) || 5000 })}
                />
                <Toggle label="Remesh" on={settings.should_remesh} onChange={(v) => onPatch({ should_remesh: v })} />
                <Toggle label="PBR maps" on={settings.enable_pbr} onChange={(v) => onPatch({ enable_pbr: v })} />
                <Toggle label="Auto size" on={settings.auto_size} onChange={(v) => onPatch({ auto_size: v })} />
              </div>
            </details>

            <details className="rounded-xl border border-white/[0.06]">
              <summary className="px-3 py-2.5 text-[11px] font-medium text-zinc-400 cursor-pointer flex items-center gap-2">
                <Key size={12} />
                API key (BYOK)
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="Paste Meshy API key"
                  className="w-full bg-[#08090d] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px]"
                  value={apiKeyDraft}
                  onChange={(e) => onApiKeyDraft(e.target.value)}
                />
                <button
                  type="button"
                  disabled={savingKey || !apiKeyDraft.trim()}
                  onClick={onSaveApiKey}
                  className="w-full py-2 rounded-lg border border-emerald-500/30 text-[11px] font-semibold text-emerald-400 disabled:opacity-40"
                >
                  {savingKey ? 'Saving…' : 'Save to vault'}
                </button>
              </div>
            </details>

            {latestGlbUrl && onDownloadGlb ? (
              <button
                type="button"
                onClick={onDownloadGlb}
                className="w-full py-2 rounded-lg border border-orange-500/30 text-[11px] font-semibold text-orange-400"
              >
                Download latest GLB
              </button>
            ) : null}
          </>
        )}

        {tool === 'import' && onImportGlb && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".glb"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportGlb(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full py-3 rounded-xl bg-emerald-500 text-[#041018] text-[11px] font-bold uppercase"
            >
              Choose GLB file
            </button>
            <AssetLibrary
              customAssets={customAssets}
              onSpawnModel={onSpawnModel}
              onAddCustomAsset={onAddCustomAsset}
              onRemoveCustomAsset={onRemoveCustomAsset}
              onRefreshUserAssets={onRefreshUserAssets}
            />
          </>
        )}

        {tool === 'blender' && (
          <div className="space-y-2 text-[12px] text-zinc-400 leading-relaxed">
            <p>Export scene JSON for Blender, or open the remote PTY terminal for advanced tooling.</p>
            <button
              type="button"
              onClick={onBlenderExport}
              className="w-full py-2.5 rounded-xl bg-zinc-100 text-zinc-900 text-[11px] font-bold uppercase"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={onBlenderTerminal}
              className="w-full py-2.5 rounded-xl border border-orange-500/35 text-orange-400 text-[11px] font-bold uppercase"
            >
              Open terminal
            </button>
          </div>
        )}

        {tool === 'scene' && (
          <ScenePanel
            sceneName={sceneName}
            onSceneNameChange={onSceneNameChange}
            savedScenes={savedScenes}
            sceneBusy={sceneBusy}
            onSaveScene={onSaveScene}
            onLoadScene={onLoadScene}
          />
        )}
      </div>

      {tool === 'text-to-3d' && (
        <footer className="shrink-0 p-4 border-t border-white/[0.06] bg-[#0c0d12] space-y-2">
          {isGenerating && (
            <div className="text-[10px] text-emerald-400/80 text-center">
              Generating{progressPct != null ? ` · ${progressPct}%` : '…'}
            </div>
          )}
          <button
            type="button"
            disabled={isGenerating}
            onClick={onCreate}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[13px] text-[#041018] bg-gradient-to-r from-[#a3e635] via-[#4ade80] to-[#2dd4bf] disabled:opacity-50 shadow-[0_4px_24px_rgba(74,222,128,0.25)]"
          >
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {meshyPhase === 'preview' ? 'Create Preview' : 'Create Refine'}
            <span className="opacity-70 text-[11px]">· {ctaCost} cr</span>
          </button>
          <button
            type="button"
            disabled={isGenerating}
            onClick={onQuickGenerate}
            className="w-full py-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-300"
          >
            Quick: preview + refine chain
          </button>
        </footer>
      )}
    </aside>
  );
}
