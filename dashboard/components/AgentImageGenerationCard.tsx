/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * ChatGPT-shaped image turn: quiet placeholder while generating,
 * then a clean image (no card chrome). Click opens a lightbox to inspect.
 */

import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IAM_AGENT_CHAT_COMPOSE } from '../agentChatConstants';
import type { ImageGenerationState } from './ChatAssistant/types';
import { ProgressiveImagePreview } from './ProgressiveImagePreview';
import {
  commitImageDraft,
  discardImageDraft,
  rateImageDraft,
} from '../lib/imageDraftActions';
import '../styles/image-generation.css';

export type AgentImageGenerationCardProps = {
  state: ImageGenerationState;
  workspaceId?: string | null;
  /** Legacy prop — lightbox is owned here; kept for call-site compatibility. */
  onImagePreview?: (url: string) => void;
};

function titleFromPrompt(prompt?: string): string {
  const raw = String(prompt || '')
    .replace(/^create a visual for\s*/i, '')
    .replace(/^generate an image of\s*/i, '')
    .replace(/^edit this image:\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!raw) return 'Generated image';
  const words = raw.split(' ').slice(0, 8).join(' ');
  return words.length > 56 ? `${words.slice(0, 53)}…` : words;
}

function shortId(generationId?: string): string {
  const id = String(generationId || '').replace(/^igen_/, '');
  return id ? id.slice(0, 8) : 'draft';
}

export function AgentImageGenerationCard({
  state,
  workspaceId,
}: AgentImageGenerationCardProps) {
  const titleId = useId();
  const pathId = useId();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [editText, setEditText] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [committedUrl, setCommittedUrl] = useState<string | null>(state.committedUrl || null);
  const [userRating, setUserRating] = useState<1 | -1 | null>(state.userRating ?? null);

  const previewUrl =
    state.previewFrames.find((f) => f.frameIndex === state.activeFrameIndex)?.previewUrl ||
    state.previewFrames[state.previewFrames.length - 1]?.previewUrl ||
    state.previewUrl ||
    state.imageUrl;

  const isComplete = state.phase === 'completed' && Boolean(previewUrl);
  const isFailed = state.phase === 'failed';
  const isDraft = isComplete && (state.status === 'draft' || !state.persist);
  const displayUrl = committedUrl || previewUrl;
  const imageTitle = useMemo(() => titleFromPrompt(state.prompt), [state.prompt]);
  const pathLabel = useMemo(
    () => `Agent / Images / ${isDraft ? 'Draft' : 'Library'} / ${shortId(state.generationId)}`,
    [isDraft, state.generationId],
  );

  const openLightbox = useCallback(() => {
    if (!displayUrl) return;
    setActionMsg(null);
    setEditText('');
    setLightboxOpen(true);
  }, [displayUrl]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
    setEditBusy(false);
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

  const submitEdit = useCallback(
    (text: string) => {
      const url = displayUrl;
      const trimmed = text.trim();
      if (!url || !trimmed || editBusy) return;
      setEditBusy(true);
      setActionMsg('Sending edit…');
      closeLightbox();
      window.dispatchEvent(
        new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
          detail: {
            message: `Edit this image: ${trimmed}\n\nImage URL: ${url}`,
            send: true,
          },
        }),
      );
    },
    [closeLightbox, displayUrl, editBusy],
  );

  const handleRate = async (rating: 1 | -1) => {
    if (!state.generationId || busyAction === 'rate') return;
    setBusyAction('rate');
    setActionMsg(null);
    try {
      await rateImageDraft(state.generationId, rating, workspaceId);
      setUserRating(rating);
      setActionMsg(rating === 1 ? 'Thanks — noted' : 'Thanks — we will learn from that');
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Rating failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownload = async () => {
    const url = displayUrl;
    if (!url) return;
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `agentsam-${shortId(state.generationId)}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleSaveToLibrary = async () => {
    if (!state.generationId) return;
    setBusyAction('save');
    setActionMsg(null);
    try {
      const out = await commitImageDraft(state.generationId, {
        workspaceId,
        label: imageTitle,
        category: 'agent_backdrops',
        register_cms_asset: true,
      });
      const url = out.url || out.public_url;
      if (url) setCommittedUrl(url);
      setActionMsg('Saved to library');
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

  const renderRatingControls = () =>
    isComplete && state.generationId ? (
      <div className="iam-image-gen-rate" role="group" aria-label="Rate this image">
        <button
          type="button"
          className={`iam-image-gen-rate__btn${userRating === 1 ? ' is-active' : ''}`}
          aria-pressed={userRating === 1}
          aria-label="Thumbs up"
          disabled={busyAction === 'rate'}
          onClick={() => void handleRate(1)}
        >
          ▲
        </button>
        <button
          type="button"
          className={`iam-image-gen-rate__btn${userRating === -1 ? ' is-active' : ''}`}
          aria-pressed={userRating === -1}
          aria-label="Thumbs down"
          disabled={busyAction === 'rate'}
          onClick={() => void handleRate(-1)}
        >
          ▼
        </button>
      </div>
    ) : null;

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
          <div className="iam-image-gen-footer">
            {renderRatingControls()}
            <button type="button" className="iam-image-gen-expand-hint" onClick={openLightbox}>
              Click to enlarge
            </button>
          </div>
        ) : null}
      </div>

      {lightboxOpen && displayUrl
        ? createPortal(
            <div
              className="iam-image-gen-lightbox"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              aria-describedby={pathId}
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
                  <div className="iam-image-gen-lightbox__meta">
                    <p id={pathId} className="iam-image-gen-lightbox__path">
                      {pathLabel}
                    </p>
                    <h2 id={titleId} className="iam-image-gen-lightbox__title">
                      {imageTitle}
                    </h2>
                  </div>
                  <div className="iam-image-gen-lightbox__actions">
                    {renderRatingControls()}
                    {isDraft ? (
                      <button
                        type="button"
                        disabled={busyAction != null}
                        onClick={() => void handleSaveToLibrary()}
                      >
                        {busyAction === 'save' ? 'Saving…' : 'Save'}
                      </button>
                    ) : null}
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
                  <img src={displayUrl} alt={imageTitle} />
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
                    submitEdit(editText);
                  }}
                >
                  <input
                    name="edit"
                    type="text"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    placeholder="Describe edits"
                    autoComplete="off"
                    aria-label="Describe edits"
                    disabled={editBusy}
                    autoFocus
                  />
                  <button
                    type="submit"
                    aria-label="Send edit"
                    disabled={editBusy || !editText.trim()}
                  >
                    ↑
                  </button>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
