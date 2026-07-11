/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ChatGPT-shaped image turn: quiet placeholder while generating,
 * then a clean image (no card chrome). Click opens a lightbox to inspect.
 */

import React, { useCallback, useEffect, useId, useState } from 'react';
import { IAM_AGENT_CHAT_COMPOSE } from '../agentChatConstants';
import type { ImageGenerationState } from './ChatAssistant/types';
import { ProgressiveImagePreview } from './ProgressiveImagePreview';
import {
  commitImageDraft,
  discardImageDraft,
} from '../lib/imageDraftActions';
import '../styles/image-generation.css';

export type AgentImageGenerationCardProps = {
  state: ImageGenerationState;
  workspaceId?: string | null;
  /** Legacy prop — lightbox is owned here; kept for call-site compatibility. */
  onImagePreview?: (url: string) => void;
};

export function AgentImageGenerationCard({
  state,
  workspaceId,
}: AgentImageGenerationCardProps) {
  const titleId = useId();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [committedUrl, setCommittedUrl] = useState<string | null>(state.committedUrl || null);

  const previewUrl =
    state.previewFrames.find((f) => f.frameIndex === state.activeFrameIndex)?.previewUrl ||
    state.previewFrames[state.previewFrames.length - 1]?.previewUrl ||
    state.previewUrl ||
    state.imageUrl;

  const isComplete = state.phase === 'completed' && Boolean(previewUrl);
  const isFailed = state.phase === 'failed';
  const isDraft = isComplete && (state.status === 'draft' || !state.persist);
  const displayUrl = committedUrl || previewUrl;

  const openLightbox = useCallback(() => {
    if (!displayUrl) return;
    setLightboxOpen(true);
  }, [displayUrl]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [lightboxOpen, closeLightbox]);

  const handleDownload = async () => {
    const url = displayUrl;
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

  const handleEditPrompt = () => {
    const url = displayUrl;
    if (!url) return;
    const prompt = window.prompt('Describe edits:', state.prompt || '');
    if (!prompt?.trim()) return;
    closeLightbox();
    window.dispatchEvent(
      new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
        detail: {
          message: `Edit this image: ${prompt.trim()}\n\nImage URL: ${url}`,
          send: true,
        },
      }),
    );
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
      setActionMsg('Saved');
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDiscard = async () => {
    if (!state.generationId || !isDraft) return;
    if (!window.confirm('Discard this draft?')) return;
    setBusyAction('discard');
    setActionMsg(null);
    try {
      await discardImageDraft(state.generationId);
      setActionMsg('Discarded');
      closeLightbox();
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Discard failed');
    } finally {
      setBusyAction(null);
    }
  };

  if (isFailed) {
    return (
      <p className="iam-image-gen-fail" role="alert">
        {state.message || 'Image generation failed'}
      </p>
    );
  }

  return (
    <>
      <div
        className={`iam-image-gen${isComplete ? ' iam-image-gen--ready' : ' iam-image-gen--pending'}`}
        aria-busy={!isComplete}
      >
        {!isComplete ? (
          <p className="iam-image-gen-status" aria-live="polite">
            {state.message?.trim() || 'Generating image…'}
          </p>
        ) : null}
        <ProgressiveImagePreview
          phase={state.phase}
          progress={state.progress}
          previewUrl={previewUrl}
          finalUrl={displayUrl}
          onImageClick={isComplete ? openLightbox : undefined}
        />
        {isComplete ? (
          <button type="button" className="iam-image-gen-expand-hint" onClick={openLightbox}>
            Click to enlarge
          </button>
        ) : null}
      </div>

      {lightboxOpen && displayUrl ? (
        <div
          className="iam-image-gen-lightbox"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={closeLightbox}
        >
          <div
            className="iam-image-gen-lightbox__panel"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="iam-image-gen-lightbox__bar">
              <button
                type="button"
                className="iam-image-gen-lightbox__icon-btn"
                onClick={closeLightbox}
                aria-label="Close"
              >
                ×
              </button>
              <h2 id={titleId} className="iam-image-gen-lightbox__title">
                {(state.prompt || 'Generated image').slice(0, 80)}
              </h2>
              <div className="iam-image-gen-lightbox__actions">
                {isDraft ? (
                  <button
                    type="button"
                    disabled={busyAction != null}
                    onClick={() => void handleSaveToLibrary()}
                  >
                    {busyAction === 'save' ? 'Saving…' : 'Save'}
                  </button>
                ) : null}
                <button type="button" onClick={handleEditPrompt}>
                  Edit
                </button>
                <button type="button" onClick={() => void handleDownload()}>
                  Download
                </button>
                {isDraft ? (
                  <button
                    type="button"
                    disabled={busyAction != null}
                    onClick={() => void handleDiscard()}
                  >
                    Discard
                  </button>
                ) : null}
              </div>
            </header>
            <div className="iam-image-gen-lightbox__stage">
              <img src={displayUrl} alt={state.prompt || 'Generated image'} />
            </div>
            {actionMsg ? (
              <p className="iam-image-gen-lightbox__msg" aria-live="polite">
                {actionMsg}
              </p>
            ) : null}
            <form
              className="iam-image-gen-lightbox__edit"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const text = String(fd.get('edit') || '').trim();
                if (!text || !displayUrl) return;
                closeLightbox();
                window.dispatchEvent(
                  new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
                    detail: {
                      message: `Edit this image: ${text}\n\nImage URL: ${displayUrl}`,
                      send: true,
                    },
                  }),
                );
              }}
            >
              <input
                name="edit"
                type="text"
                placeholder="Describe edits"
                autoComplete="off"
                aria-label="Describe edits"
              />
              <button type="submit" aria-label="Send edit">
                ↑
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
