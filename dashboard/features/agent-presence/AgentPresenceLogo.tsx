/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import type { AgentLogoMotion } from './presenceTypes';
import { presenceIconMarkup, presenceStateToIcon } from './presenceIcons';

const DEFAULT_LOGO =
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail';

export type AgentPresenceLogoProps = {
  motion: AgentLogoMotion;
  presenceState?: string;
  sizePx?: number;
  className?: string;
  src?: string;
  alt?: string;
  /** Use animated SVG from Loading States Lab (default true). */
  useSvgIcon?: boolean;
  /** Larger icon slot (54px base). */
  large?: boolean;
};

export const AgentPresenceLogo: React.FC<AgentPresenceLogoProps> = ({
  motion,
  presenceState,
  sizePx = 24,
  className = '',
  src = DEFAULT_LOGO,
  alt = 'Agent Sam',
  useSvgIcon = true,
  large = false,
}) => {
  const stateKey = presenceState || motion || 'idle';
  const iconKey = presenceStateToIcon(stateKey);
  const iconHtml = useMemo(() => presenceIconMarkup(iconKey), [iconKey]);

  return (
    <span
      className={`agent-sam-logo-wrap ${className}`}
      data-state={stateKey}
      aria-hidden={alt === ''}
    >
      {useSvgIcon ? (
        <span
          className={`iam-presence-icon-slot${large ? ' large' : ''}`}
          data-icon={iconKey}
          style={large ? undefined : { ['--size' as string]: `${sizePx}px` }}
          dangerouslySetInnerHTML={{ __html: iconHtml }}
        />
      ) : (
        <img
          src={src}
          alt={alt}
          width={sizePx}
          height={sizePx}
          data-motion={motion}
          className="agent-sam-logo"
          draggable={false}
        />
      )}
      <span className="agent-sam-logo-ring" aria-hidden />
    </span>
  );
};
