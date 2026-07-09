import { IAM_AGENT_CHAT_NEW_THREAD, IAM_AGENT_ENSURE_PANEL } from '../agentChatConstants';

export type MailInboxPreview = {
  id?: string;
  subject: string;
  from: string;
  date?: string;
  is_read?: number;
};

export type MailAgentFocus = {
  subject: string;
  from: string;
  to?: string;
  bodyPreview?: string;
};

/** Open Agent Sam side rail on Mail with optional inbox/email context (replaces in-page triage pane). */
export function openMailAgent(opts?: {
  message?: string;
  inboxPreview?: MailInboxPreview[];
  focus?: MailAgentFocus;
}) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(new CustomEvent(IAM_AGENT_ENSURE_PANEL));

  const base =
    opts?.message?.trim() ||
    'Help me triage my inbox — what needs a reply, what can wait, and what should I archive?';

  const chunks: string[] = [];
  if (opts?.focus) {
    chunks.push(
      [
        'Focused email:',
        `From: ${opts.focus.from}`,
        `Subject: ${opts.focus.subject}`,
        opts.focus.to ? `To: ${opts.focus.to}` : '',
        opts.focus.bodyPreview
          ? `Body preview:\n${opts.focus.bodyPreview.slice(0, 3000)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    );
  } else if (opts?.inboxPreview?.length) {
    chunks.push(
      `Inbox snapshot (${opts.inboxPreview.length} messages, metadata only):\n${JSON.stringify(
        opts.inboxPreview.slice(0, 30),
        null,
        0,
      )}`,
    );
  }

  chunks.push(base);

  window.dispatchEvent(
    new CustomEvent(IAM_AGENT_CHAT_NEW_THREAD, {
      detail: {
        message: chunks.join('\n\n'),
        ensureAgentPanel: false,
        surface: 'mail',
        route_key: 'mail_triage',
      },
    }),
  );
}
