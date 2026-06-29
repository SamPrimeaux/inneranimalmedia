import { useEffect } from 'react';
import { DashboardSidebar } from './DashboardSidebar';

type MobileNavDrawerProps = {
  open: boolean;
  onClose: () => void;
  onNewChat?: () => void;
  onOpenChats?: () => void;
  onOpenMovieMode?: () => void;
  onSelectChat?: (conversationId: string, title?: string) => void;
  onDeleteActiveChat?: (conversationId: string) => void;
  activeConversationId?: string | null;
  workspaceLabel?: string | null;
  avatarInitial?: string | null;
  avatarUrl?: string | null;
  workspaceSubtitle?: string | null;
};

export function MobileNavDrawer({
  open,
  onClose,
  onNewChat,
  onOpenChats,
  onOpenMovieMode,
  onSelectChat,
  onDeleteActiveChat,
  activeConversationId,
  workspaceLabel,
  avatarInitial,
  avatarUrl,
  workspaceSubtitle,
}: MobileNavDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open ? (
        <button
          type="button"
          className="iam-mobile-nav-drawer-overlay hidden max-phone:block"
          aria-label="Close navigation menu"
          onClick={onClose}
        />
      ) : null}
      <nav
        className="iam-mobile-nav-drawer-panel hidden max-phone:block"
        data-open={open ? 'true' : 'false'}
        aria-label="Primary navigation"
        aria-hidden={!open}
        style={open ? undefined : { pointerEvents: 'none' }}
      >
        <DashboardSidebar
          expanded
          onItemActivate={onClose}
          onNewChat={onNewChat}
          onOpenChats={onOpenChats}
          onOpenMovieMode={onOpenMovieMode}
          onSelectChat={onSelectChat}
          onDeleteActiveChat={onDeleteActiveChat}
          activeConversationId={activeConversationId}
          workspaceLabel={workspaceLabel}
          avatarInitial={avatarInitial}
          avatarUrl={avatarUrl}
          workspaceSubtitle={workspaceSubtitle}
        />
      </nav>
    </>
  );
}
