import React, { useRef } from 'react';
import { Coins, Key, Loader2, Sparkles } from 'lucide-react';
import type { MeshyPhase, MeshySettings } from './meshyTypes';
import type { CreationTool } from './useCreationStation';
import { ScenePanel, type SavedSceneRow } from '../shared/ScenePanel';
import { AssetLibrary } from '../shared/AssetLibrary';
import type { CustomAsset } from '../../../types';

type Props = {
  tool: CreationTool;
  open: boolean;
  onClose: () => void;
  meshyPhase: MeshyPhase;
  onMeshyPhase: (p: MeshyPhase) => void;
  settings: MeshySettings;
  onPatch: (p: Partial<MeshySettings>) => void;
  balance: number | null;
  meshyStub: boolean;
  ctaCost: number;
  isGenerating: boolean;
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
    <label className="flex items-center justify-between gap-2 py-1.5 text-[10px] text-[var(--text-muted)]">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`w-9 h-5 rounded-full relative transition-colors ${on ? 'bg-[var(--solar-cyan)]' : 'bg-[var(--bg-hover)]'}`}
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
  open,
  onClose,
  meshyPhase,
  onMeshyPhase,
  settings,
  onPatch,
  balance,
  meshyStub,
  ctaCost,
  isGenerating,
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
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  return (
    <aside className="flex flex-col w-full md:w-[min(360px,92vw)] lg:w-[320px] border-[var(--border-subtle)] border-b md:border-b-0 md:border-r bg-[var(--bg-panel)] shrink-0 max-h-[45vh] md:max-h-none overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)] shrink-0">
        <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-heading)]">
          {tool === 'text-to-3d' ? 'Text to 3D' : tool === 'import' ? 'Import' : tool === 'blender' ? 'Blender' : 'Scene'}
        </span>
        <button type="button" onClick={onClose} className="md:hidden text-[10px] text-[var(--text-muted)]">
          Close
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
        {tool === 'text-to-3d' && (
          <>
            <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-hover)]">
              {(['preview', 'refine'] as MeshyPhase[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onMeshyPhase(p)}
                  className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide ${
                    meshyPhase === p
                      ? 'bg-[var(--solar-cyan)] text-black'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {meshyStub && (
              <p className="text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2 py-1.5">
                Platform Meshy key missing — save your BYOK below or contact admin.
              </p>
            )}

            <div className="flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
              <Coins size={12} className="text-[var(--solar-cyan)]" />
              {balance != null ? `${balance} credits` : meshyStub ? 'Credits unavailable' : '…'}
            </div>

            {meshyPhase === 'refine' && (
              <input
                className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-[10px] font-mono"
                placeholder="Preview task ID"
                value={settings.preview_task_id}
                onChange={(e) => onPatch({ preview_task_id: e.target.value })}
              />
            )}

            <textarea
              rows={4}
              className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-[11px] resize-none"
              placeholder="Describe your 3D model…"
              value={meshyPhase === 'refine' ? settings.texture_prompt || settings.prompt : settings.prompt}
              onChange={(e) =>
                meshyPhase === 'refine'
                  ? onPatch({ texture_prompt: e.target.value })
                  : onPatch({ prompt: e.target.value })
              }
              disabled={isGenerating}
            />

            <details className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-hover)]/50">
              <summary className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide cursor-pointer text-[var(--text-muted)]">
                Optional settings
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <label className="block text-[9px] text-[var(--text-muted)] uppercase">AI model</label>
                <select
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-[10px]"
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
                      className={`flex-1 py-1.5 rounded-lg text-[9px] font-bold uppercase ${
                        settings.model_type === m
                          ? 'bg-[var(--solar-cyan)]/20 text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/40'
                          : 'border border-[var(--border-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      {m === 'lowpoly' ? 'Low poly' : 'Standard'}
                    </button>
                  ))}
                </div>

                <label className="block text-[9px] text-[var(--text-muted)]">Target polycount</label>
                <input
                  type="number"
                  min={1000}
                  max={300000}
                  step={500}
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-[10px]"
                  value={settings.target_polycount}
                  onChange={(e) => onPatch({ target_polycount: Number(e.target.value) || 5000 })}
                />

                <Toggle label="Should remesh" on={settings.should_remesh} onChange={(v) => onPatch({ should_remesh: v })} />
                <Toggle label="Generate PBR maps" on={settings.enable_pbr} onChange={(v) => onPatch({ enable_pbr: v })} />
                <Toggle label="HD texture" on={settings.hd_texture} onChange={(v) => onPatch({ hd_texture: v })} />
                <Toggle label="Remove lighting" on={settings.remove_lighting} onChange={(v) => onPatch({ remove_lighting: v })} />
                <Toggle label="Auto size" on={settings.auto_size} onChange={(v) => onPatch({ auto_size: v })} />
                <Toggle label="Moderation" on={settings.moderation} onChange={(v) => onPatch({ moderation: v })} />

                <div className="flex flex-wrap gap-2 pt-1">
                  {['glb', 'fbx', 'obj', 'stl', 'usdz'].map((fmt) => (
                    <label key={fmt} className="flex items-center gap-1 text-[9px] text-[var(--text-muted)]">
                      <input
                        type="checkbox"
                        checked={settings.target_formats.includes(fmt)}
                        onChange={(e) => {
                          const next = e.target.checked
                            ? [...settings.target_formats, fmt]
                            : settings.target_formats.filter((f) => f !== fmt);
                          onPatch({ target_formats: next.length ? next : ['glb'] });
                        }}
                      />
                      {fmt}
                    </label>
                  ))}
                </div>
              </div>
            </details>

            <details className="rounded-xl border border-[var(--border-subtle)]">
              <summary className="px-3 py-2 text-[10px] font-bold uppercase tracking-wide cursor-pointer text-[var(--text-muted)] flex items-center gap-2">
                <Key size={12} />
                API key (BYOK)
              </summary>
              <div className="px-3 pb-3 space-y-2">
                <input
                  type="password"
                  autoComplete="off"
                  placeholder="msk-… or platform uses Worker secret"
                  className="w-full bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg px-2 py-1.5 text-[10px]"
                  value={apiKeyDraft}
                  onChange={(e) => onApiKeyDraft(e.target.value)}
                />
                <button
                  type="button"
                  disabled={savingKey || !apiKeyDraft.trim()}
                  onClick={onSaveApiKey}
                  className="w-full py-2 rounded-lg border border-[var(--solar-cyan)]/40 text-[10px] font-bold text-[var(--solar-cyan)] disabled:opacity-40"
                >
                  {savingKey ? 'Saving…' : 'Save to vault'}
                </button>
              </div>
            </details>

            <button
              type="button"
              disabled={isGenerating}
              onClick={onCreate}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-black text-[11px] uppercase tracking-widest text-black bg-gradient-to-r from-[#b8ff3c] via-[#7dffb0] to-[#ff6bcb] disabled:opacity-50"
            >
              {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {meshyPhase === 'preview' ? 'Create preview' : 'Create refine'}
              <span className="opacity-80">· {ctaCost}</span>
            </button>

            <button
              type="button"
              disabled={isGenerating}
              onClick={onQuickGenerate}
              className="w-full py-2.5 rounded-xl border border-[var(--border-subtle)] text-[10px] font-bold uppercase text-[var(--text-muted)] hover:border-[var(--solar-cyan)]/30"
            >
              Quick: preview + refine
            </button>

            {latestGlbUrl && onDownloadGlb ? (
              <button
                type="button"
                onClick={onDownloadGlb}
                className="w-full py-2 rounded-xl border border-[var(--solar-orange)]/40 text-[10px] font-bold text-[var(--solar-orange)]"
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
              className="w-full py-3 rounded-xl bg-[var(--solar-cyan)] text-black text-[10px] font-black uppercase"
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
          <div className="space-y-2">
            <p className="text-[10px] text-[var(--text-muted)] leading-relaxed">
              Export scene JSON for Blender, or open the Mac PTY terminal to run blender on your scene assets.
            </p>
            <button
              type="button"
              onClick={onBlenderExport}
              className="w-full py-2.5 rounded-xl bg-[var(--text-main)] text-[var(--bg-app)] text-[10px] font-black uppercase"
            >
              Export Blender JSON
            </button>
            <button
              type="button"
              onClick={onBlenderTerminal}
              className="w-full py-2.5 rounded-xl border border-[var(--solar-orange)]/40 text-[var(--solar-orange)] text-[10px] font-black uppercase"
            >
              Open terminal (Blender)
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
    </aside>
  );
}
