/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import type { AgentLogoMotion } from './presenceTypes';

const DEFAULT_LOGO =
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail';

export type AgentPresenceLogoProps = {
  motion: AgentLogoMotion;
  presenceState?: string;
  sizePx?: number;
  className?: string;
  src?: string;
  alt?: string;
};

export const AgentPresenceLogo: React.FC<AgentPresenceLogoProps> = ({
  motion,
  presenceState,
  sizePx = 24,
  className = '',
  src = DEFAULT_LOGO,
  alt = 'Agent Sam',
}) => (
  <span
    className={`agent-sam-logo-wrap ${className}`}
    aria-hidden={alt === ''}
    {...(presenceState ? { 'data-state': presenceState } : {})}
  >
    <img
      src={src}
      alt={alt}
      width={sizePx}
      height={sizePx}
      data-motion={motion}
      className="agent-sam-logo"
      draggable={false}
    />
    <span className="agent-sam-logo-ring" aria-hidden />
  </span>
);
