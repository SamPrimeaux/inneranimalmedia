/** Live Collaborate Mail context for Agent Sam (parallel to database studio events). */

export type MailInboxPreviewRow = {
  id?: string;
  subject: string;
  from: string;
  date?: string;
  is_read?: number;
};

export type MailSurfaceFocus = {
  subject: string;
  from: string;
  to?: string;
  bodyPreview?: string;
};

export type MailSurfaceContext = {
  surface: 'mail';
  route: string;
  folder: string;
  account: string | null;
  search: string;
  gmailConnected: boolean;
  inboxPreview: MailInboxPreviewRow[];
  selected?: MailSurfaceFocus | null;
};

export function publishMailSurfaceContext(payload: MailSurfaceContext) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('iam-mail-surface-context', { detail: payload }));
}
