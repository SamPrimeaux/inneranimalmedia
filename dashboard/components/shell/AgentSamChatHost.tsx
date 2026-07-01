import type { ComponentProps, PointerEvent } from 'react';
import { ChatAssistantWithStudioContext } from '../designstudio/ChatAssistantWithStudioContext';
import type { AgentChatLayout } from '../../lib/shellLayoutMeta';

const AGENT_RESIZER_HIT_PX = 10;

type StudioChatProps = ComponentProps<typeof ChatAssistantWithStudioContext>;

export type AgentSamChatHostProps = StudioChatProps & {
  layout: AgentChatLayout;
  agentW: number;
  isNarrowViewport: boolean;
  activeActivity: string | null;
  narrowNeedsBack: boolean;
  mobileEdgeSwipeHandlers?: Record<string, unknown>;
  productLabel: string;
  onResizePointerDown?: (e: PointerEvent<HTMLDivElement>) => void;
};

/** Single ChatAssistant mount — center (portals), left rail, or right rail. */
export function AgentSamChatHost({
  layout,
  agentW,
  isNarrowViewport,
  activeActivity,
  narrowNeedsBack,
  mobileEdgeSwipeHandlers,
  productLabel,
  onResizePointerDown,
  atmosphericHomeMode,
  composerPortalTarget,
  messagesPortalTarget,
  ...chatProps
}: AgentSamChatHostProps) {
  if (layout === 'hidden') return null;

  const chat = (
    <ChatAssistantWithStudioContext
      {...chatProps}
      atmosphericHomeMode={atmosphericHomeMode}
      composerPortalTarget={composerPortalTarget}
      messagesPortalTarget={messagesPortalTarget}
    />
  );

  if (layout === 'center') {
    return (
      <div
        className={`absolute inset-0 z-20 flex flex-col min-h-0 min-w-0 w-full overflow-hidden ${
          atmosphericHomeMode
            ? 'pointer-events-none bg-transparent [&_*]:pointer-events-auto'
            : 'bg-[var(--dashboard-panel)]'
        }`}
        aria-label="Agent Sam chat"
      >
        {chat}
      </div>
    );
  }

  const isLeft = layout === 'left-rail';
  const borderStyle = isLeft
    ? { borderRight: '1px solid var(--dashboard-border)' }
    : { borderLeft: '1px solid var(--dashboard-border)' };

  const panel = (
    <div
      className={`bg-[var(--dashboard-panel)] flex flex-col shrink-0 transition-opacity relative group z-30 opacity-100 max-phone:fixed max-phone:inset-0 max-phone:z-[45] max-phone:w-full max-phone:max-w-none max-phone:shrink ${
        activeActivity ? 'max-phone:hidden' : ''
      }`}
      style={
        isNarrowViewport ? borderStyle : { width: agentW, ...borderStyle }
      }
      {...(narrowNeedsBack && !activeActivity ? mobileEdgeSwipeHandlers : {})}
    >
      {!isNarrowViewport ? (
        <div className="h-9 min-h-9 max-phone:hidden border-b border-[var(--dashboard-border)] flex items-center px-3 font-semibold text-[10px] tracking-widest uppercase text-muted shrink-0 truncate">
          {productLabel}
        </div>
      ) : null}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{chat}</div>
    </div>
  );

  const resizer =
    !isNarrowViewport && onResizePointerDown ? (
      <div
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize Agent Sam panel"
        aria-label="Resize Agent Sam panel"
        className="max-phone:hidden shrink-0 z-50 flex justify-center cursor-col-resize touch-none select-none group relative"
        style={{ width: AGENT_RESIZER_HIT_PX }}
        onPointerDown={onResizePointerDown}
      >
        <span
          className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--dashboard-border)] group-hover:bg-[var(--solar-cyan)] group-active:bg-[var(--solar-cyan)] transition-colors"
          aria-hidden
        />
      </div>
    ) : null;

  if (isLeft) {
    return (
      <>
        {panel}
        {resizer}
      </>
    );
  }

  return (
    <>
      {resizer}
      {panel}
    </>
  );
}
