/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import type { ImageGenerationState } from '../features/agent-chat/types';
import { ProgressiveImagePreview } from './ProgressiveImagePreview';
import '../styles/image-generation.css';

export type AgentImageGenerationCardProps = {
  state: ImageGenerationState;
  onImagePreview?: (url: string) => void;
};

function providerLabel(provider?: string, model?: string): string {
  const p = provider ? provider.replace(/_/g, ' ') : '';
  const m = model ? model : '';
  if (p && m) return `${p} · ${m}`;
  return p || m || 'image';
}

export function AgentImageGenerationCard({ state, onImagePreview }: AgentImageGenerationCardProps) {
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);

  const activeFrame =
    selectedFrame != null
      ? state.previewFrames.find((f) => f.frameIndex === selectedFrame)
      : state.previewFrames.find((f) => f.frameIndex === state.activeFrameIndex) ||
        state.previewFrames[state.previewFrames.length - 1];

  const previewUrl = activeFrame?.previewUrl || state.imageUrl;
  const isComplete = state.phase === 'completed' && Boolean(state.imageUrl);
  const statusLine =
    state.phase === 'completed'
      ? ''
      : state.phase === 'failed'
        ? state.message || 'Image generation failed'
        : state.message || 'Creating image…';

  const title =
    state.phase === 'completed'
      ? 'Image ready'
      : state.phase === 'failed'
        ? 'Generation failed'
        : 'Creating image';

  const handleDownload = async () => {
    const url = state.imageUrl || previewUrl;
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
    const url = state.imageUrl || previewUrl;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  const handleShare = async () => {
    const url = state.imageUrl || previewUrl;
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Agent Sam image', url });
        return;
      } catch {
        /* fall through */
      }
    }
    await handleCopy();
  };

  const handleEdit = () => {
    const url = state.imageUrl || previewUrl;
    if (!url) return;
    const prompt = window.prompt('Describe how to edit this image:', state.prompt || '');
    if (!prompt?.trim()) return;
    window.dispatchEvent(
      new CustomEvent('iam:agent-chat-compose', {
        detail: {
          message: `Edit this image: ${prompt.trim()}\n\nImage URL: ${url}`,
        },
      }),
    );
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
      </header>
      {statusLine ? (
        <p key={statusLine} className="iam-image-gen-card__status">
          {statusLine}
        </p>
      ) : null}
      <ProgressiveImagePreview
        phase={state.phase}
        progress={state.progress}
        previewUrl={previewUrl}
        finalUrl={state.imageUrl}
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
        <div className="iam-image-gen-actions">
          <button type="button" onClick={handleEdit}>
            Edit
          </button>
          <button type="button" onClick={() => void handleCopy()}>
            Copy
          </button>
          <button type="button" onClick={() => void handleShare()}>
            Share
          </button>
          <button type="button" onClick={() => void handleDownload()}>
            Download
          </button>
        </div>
      ) : null}
    </article>
  );
}
