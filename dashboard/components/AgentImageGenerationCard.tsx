/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { IAM_AGENT_CHAT_COMPOSE } from '../agentChatConstants';
import type { ImageGenerationState } from './ChatAssistant/types';
import { ProgressiveImagePreview } from './ProgressiveImagePreview';
import {
  applyAgentHomeBackdropToTheme,
  commitImageDraft,
  discardImageDraft,
  previewAgentHomeBackdropImage,
  type ImageDraftDayPart,
} from '../lib/imageDraftActions';
import '../styles/image-generation.css';

export type AgentImageGenerationCardProps = {
  state: ImageGenerationState;
  workspaceId?: string | null;
  onImagePreview?: (url: string) => void;
};

function providerLabel(provider?: string, model?: string): string {
  const p = provider ? provider.replace(/_/g, ' ') : '';
  const m = model ? model : '';
  if (p && m) return `${p} · ${m}`;
  return p || m || 'image';
}

export function AgentImageGenerationCard({
  state,
  workspaceId,
  onImagePreview,
}: AgentImageGenerationCardProps) {
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [dayPart, setDayPart] = useState<ImageDraftDayPart>('dusk');
  const [previewingBackdrop, setPreviewingBackdrop] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [committedUrl, setCommittedUrl] = useState<string | null>(state.committedUrl || null);

  const activeFrame =
    selectedFrame != null
      ? state.previewFrames.find((f) => f.frameIndex === selectedFrame)
      : state.previewFrames.find((f) => f.frameIndex === state.activeFrameIndex) ||
        state.previewFrames[state.previewFrames.length - 1];

  const previewUrl = activeFrame?.previewUrl || state.previewUrl || state.imageUrl;
  const isComplete = state.phase === 'completed' && Boolean(previewUrl);
  const isDraft = isComplete && (state.status === 'draft' || !state.persist);
  const canonicalUrl = committedUrl || (state.status === 'saved' ? previewUrl : null);

  const statusLine =
    state.phase === 'completed'
      ? previewingBackdrop
        ? 'Previewing draft backdrop (not saved)'
        : isDraft
          ? 'Draft preview — not saved to library or theme'
          : 'Saved to library'
      : state.phase === 'failed'
        ? state.message || 'Image generation failed'
        : state.message || 'Creating image…';

  const title =
    state.phase === 'completed'
      ? isDraft
        ? 'Draft image'
        : 'Image saved'
      : state.phase === 'failed'
        ? 'Generation failed'
        : 'Creating image';

  const handleDownload = async () => {
    const url = previewUrl;
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `agentsam-${state.generationId.slice(0, 8)}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopy = async () => {
    const url = canonicalUrl || previewUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setActionMsg('URL copied');
    } catch {
      setActionMsg('Could not copy URL');
    }
  };

  const handleEditPrompt = () => {
    const url = previewUrl;
    if (!url) return;
    const prompt = window.prompt('Describe how to edit this image:', state.prompt || '');
    if (!prompt?.trim()) return;
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
        detail: {
          message: `Edit this image: ${prompt.trim()}\n\nImage URL: ${url}`,
        },
      }),
    );
  };

  const handlePreviewBackdrop = () => {
    const url = previewUrl;
    if (!url) return;
    previewAgentHomeBackdropImage(url, dayPart);
    setPreviewingBackdrop(true);
    setActionMsg('Previewing on Agent Home (session only)');
  };

  const handleSaveToLibrary = async () => {
    if (!state.generationId) return;
    setBusyAction('save');
    setActionMsg(null);
    try {
      const out = await commitImageDraft(state.generationId, {
        workspaceId,
        label: state.prompt?.slice(0, 120) || 'Generated image',
        category: 'agent_backdrops',
        register_cms_asset: true,
      });
      const url = out.url || out.public_url;
      if (url) setCommittedUrl(url);
      setActionMsg('Saved to library');
      setPreviewingBackdrop(false);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleApplyToAgentHome = async () => {
    if (!workspaceId?.trim()) {
      setActionMsg('Select a workspace to apply theme');
      return;
    }
    setBusyAction('apply');
    setActionMsg(null);
    try {
      let url = canonicalUrl;
      if (!url && isDraft) {
        const out = await commitImageDraft(state.generationId, {
          workspaceId,
          label: state.prompt?.slice(0, 120) || 'Agent backdrop',
          category: 'agent_backdrops',
          register_cms_asset: true,
        });
        url = out.url || out.public_url || '';
        if (url) setCommittedUrl(url);
      }
      if (!url) throw new Error('No image URL to apply');
      await applyAgentHomeBackdropToTheme(workspaceId, url, dayPart);
      setPreviewingBackdrop(false);
      setActionMsg('Applied to Agent Home theme');
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Apply failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDiscard = async () => {
    if (!state.generationId || !isDraft) return;
    if (!window.confirm('Discard this draft? It will be removed from temporary storage.')) return;
    setBusyAction('discard');
    setActionMsg(null);
    try {
      await discardImageDraft(state.generationId);
      setActionMsg('Draft discarded');
      setPreviewingBackdrop(false);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Discard failed');
    } finally {
      setBusyAction(null);
    }
  };

  const timeline = useMemo(
    () => [...state.previewFrames].sort((a, b) => a.frameIndex - b.frameIndex),
    [state.previewFrames],
  );

  return (
    <article
      className={`iam-image-gen-card${isComplete ? ' iam-image-gen-card--complete' : ''}`}
      aria-busy={!isComplete && state.phase !== 'failed'}
    >
      <header className="iam-image-gen-card__header">
        <span className="iam-image-gen-card__title">{title}</span>
        {(state.provider || state.model) && (
          <span className="iam-image-gen-card__badge">{providerLabel(state.provider, state.model)}</span>
        )}
        {isDraft ? <span className="iam-image-gen-card__badge">draft</span> : null}
      </header>
      {statusLine ? (
        <p key={statusLine} className="iam-image-gen-card__status">
          {statusLine}
        </p>
      ) : null}
      {state.expiresAt && isDraft ? (
        <p className="iam-image-gen-card__status iam-image-gen-card__status--muted">
          Draft expires {new Date(state.expiresAt).toLocaleString()}
        </p>
      ) : null}
      {actionMsg ? (
        <p className="iam-image-gen-card__status iam-image-gen-card__status--muted">{actionMsg}</p>
      ) : null}
      <ProgressiveImagePreview
        phase={state.phase}
        progress={state.progress}
        previewUrl={previewUrl}
        finalUrl={previewUrl}
        onImageClick={onImagePreview}
      />
      {timeline.length > 1 ? (
        <div className="iam-image-gen-timeline" role="tablist" aria-label="Generation previews">
          {timeline.map((frame) => (
            <button
              key={frame.frameIndex}
              type="button"
              className={`iam-image-gen-timeline__thumb${
                (selectedFrame ?? state.activeFrameIndex) === frame.frameIndex
                  ? ' iam-image-gen-timeline__thumb--active'
                  : ''
              }`}
              onClick={() => setSelectedFrame(frame.frameIndex)}
              aria-label={`Preview frame ${frame.frameIndex}`}
            >
              <img src={frame.previewUrl} alt="" draggable={false} />
            </button>
          ))}
        </div>
      ) : null}
      {isComplete ? (
        <div className="iam-image-gen-actions iam-image-gen-actions--stacked">
          <label className="iam-image-gen-daypart">
            <span>Day-part</span>
            <select
              value={dayPart}
              onChange={(e) => setDayPart(e.target.value as ImageDraftDayPart)}
              disabled={busyAction != null}
            >
              <option value="dawn">Dawn</option>
              <option value="day">Day</option>
              <option value="dusk">Dusk</option>
              <option value="night">Night</option>
              <option value="minimal-dark">Minimal dark</option>
            </select>
          </label>
          <div className="iam-image-gen-actions">
            {isDraft ? (
              <button type="button" disabled={busyAction != null} onClick={() => void handleSaveToLibrary()}>
                {busyAction === 'save' ? 'Saving…' : 'Save to library'}
              </button>
            ) : null}
            <button type="button" disabled={busyAction != null} onClick={handlePreviewBackdrop}>
              Preview as Agent backdrop
            </button>
            <button
              type="button"
              disabled={busyAction != null}
              onClick={() => void handleApplyToAgentHome()}
            >
              {busyAction === 'apply' ? 'Applying…' : 'Save & apply to Agent Home'}
            </button>
            <button type="button" onClick={handleEditPrompt}>Edit prompt</button>
            <button type="button" onClick={() => void handleCopy()}>Copy URL</button>
            <button type="button" onClick={() => void handleDownload()}>Download</button>
            {isDraft ? (
              <button type="button" disabled={busyAction != null} onClick={() => void handleDiscard()}>
                Discard
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}
