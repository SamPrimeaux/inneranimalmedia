import React from 'react';

type Props = {
  className?: string;
};

/** Embeds the standalone examples gallery prototype (public/prototypes/examples-gallery.html). */
export function AgentExamplesGalleryEmbed({ className = 'flex-1 w-full min-h-0 border-0 bg-[#f7f5ef]' }: Props) {
  return (
    <iframe
      title="IAM Examples Gallery"
      src="/prototypes/examples-gallery.html"
      className={className}
      sandbox="allow-scripts allow-same-origin allow-forms"
    />
  );
}
