import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type PointerEvent, type ReactNode } from 'react';
import { ChatAssistantWithStudioContext } from '../designstudio/ChatAssistantWithStudioContext';
import { ChatScratchpadRail } from '../ChatAssistant/components/ChatScratchpadRail';
import type { AgentGeneratedFile } from '../ChatAssistant/types';
import type { AgentChatLayout } from '../../lib/shellLayoutMeta';

const AGENT_RESIZER_HIT_PX = 10;
const SCRATCHPAD_RAIL_W_PX = 220;

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

function ChatWithScratchpadRail({
  chat,
  messages,
  onFileSelect,
  scratchpadOpen,
  showScratchpadRail,
}: {
  chat: ReactNode;
  messages: StudioChatProps['messages'];
  onFileSelect?: StudioChatProps['onFileSelect'];
  scratchpadOpen: boolean;
  showScratchpadRail: boolean;
}) {
  const openScratchpadFile = useCallback(
    (file: AgentGeneratedFile) => {
      if (file.kind === 'image' || /\.(png|jpe?g|webp|gif)$/i.test(file.filename)) {
        if (file.r2Url && typeof window !== 'undefined') {
          window.open(file.r2Url, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      if (file.content) {
        onFileSelect?.({
          name: file.filename,
          content: file.content,
          workspacePath: file.workspacePath,
        });
        return;
      }
      if (file.r2Url) {
        void fetch(file.r2Url, { credentials: 'include' })
          .then((r) => r.text())
          .then((content) =>
            onFileSelect?.({
              name: file.filename,
              content,
              workspacePath: file.workspacePath,
            }),
          )
          .catch((e) => console.warn('[AgentSamChatHost] scratchpad open failed', e));
      }
    },
    [onFileSelect],
  );

  return (
    <div className="flex flex-row flex-1 min-h-0 min-w-0 overflow-hidden">
      <div className="flex flex-1 min-w-0 min-h-0 overflow-hidden flex-col">{chat}</div>
      {scratchpadOpen && showScratchpadRail ? (
        <div
          className="shrink-0 min-h-0 max-phone:hidden flex flex-col"
          style={{ width: SCRATCHPAD_RAIL_W_PX }}
        >
          <ChatScratchpadRail messages={messages} onOpenFile={openScratchpadFile} />
        </div>
      ) : null}
    </div>
  );
}

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
  messages,
  onFileSelect,
  ...chatProps
}: AgentSamChatHostProps) {
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  // Total files across all messages (uploaded attachments + agent-generated + image frames).
  const scratchpadFileCount = useMemo(() => {
    if (!messages) return 0;
    let n = 0;
    for (const m of messages) {
      n += (m.attachmentPreviews ?? []).length;
      const agentN = (m.agentFiles ?? []).length;
      if (agentN > 0) {
        n += agentN;
      } else {
        n += (m.imageGenerationState?.previewFrames ?? []).filter((f) => f.previewUrl).length;
      }
    }
    return n;
  }, [messages]);

  // Auto-open the scratchpad the first time a file appears in the conversation.
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (scratchpadFileCount > 0 && !isNarrowViewport && !atmosphericHomeMode) {
      setScratchpadOpen(true);
      autoOpenedRef.current = true;
    }
  }, [scratchpadFileCount, isNarrowViewport, atmosphericHomeMode]);

  // Reset auto-open guard when conversation changes (new chat).
  const prevFileCount = useRef(scratchpadFileCount);
  useEffect(() => {
    if (scratchpadFileCount === 0 && prevFileCount.current > 0) {
      autoOpenedRef.current = false;
      setScratchpadOpen(false);
    }
    prevFileCount.current = scratchpadFileCount;
  }, [scratchpadFileCount]);

  if (layout === 'hidden') return null;

  const showScratchpadRail = !isNarrowViewport && !atmosphericHomeMode;

  const chat = (
    <ChatAssistantWithStudioContext
      {...chatProps}
      messages={messages}
      onFileSelect={onFileSelect}
      atmosphericHomeMode={atmosphericHomeMode}
      composerPortalTarget={composerPortalTarget}
      messagesPortalTarget={messagesPortalTarget}
      onToggleScratchpad={() => setScratchpadOpen((v) => !v)}
      scratchpadOpen={scratchpadOpen}
      scratchpadFileCount={scratchpadFileCount}
    />
  );

  const chatColumn = (
    <ChatWithScratchpadRail
      chat={chat}
      messages={messages}
      onFileSelect={onFileSelect}
      scratchpadOpen={scratchpadOpen}
      showScratchpadRail={showScratchpadRail}
    />
  );

  if (layout === 'center') {
    return (
      <div
        className={`absolute inset-0 z-20 flex flex-col min-h-0 min-w-0 w-full overflow-hidden ${
          atmosphericHomeMode ? 'pointer-events-none bg-transparent' : 'bg-[var(--dashboard-panel)]'
        }`}
        aria-label="Agent Sam chat"
      >
        {chatColumn}
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
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">{chatColumn}</div>
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
