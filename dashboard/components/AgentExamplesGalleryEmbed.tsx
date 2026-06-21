import React from 'react';

/** Production R2 path (Vite public/ → dist/prototypes/ → static/dashboard/app/prototypes/). */
export const EXAMPLES_GALLERY_SRC = '/static/dashboard/app/prototypes/examples-gallery.html';

type Props = {
  className?: string;
};

/** Embeds the standalone examples gallery prototype. */
export function AgentExamplesGalleryEmbed({ className = 'flex-1 w-full min-h-0 border-0 bg-[#f7f5ef]' }: Props) {
  return (
    <iframe
      title="IAM Examples Gallery"
      src={EXAMPLES_GALLERY_SRC}
      className={className}
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
