import type { ImageGenerationState, Message } from '../components/ChatAssistant/types';

export type AgentShellMessage = {
  role: 'user' | 'assistant';
  content: string;
  imageGenerationState?: ImageGenerationState | null;
};

const MD_IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/i;

/** Hide legacy client-prepended Project memory/instructions from the chat bubble. */
export function stripInjectedProjectBriefForDisplay(content: string): string {
  let s = String(content || '');
  if (!/^Project memory:/im.test(s) && !/^Project instructions:/im.test(s)) return s;
  const parts = s.split(/\r?\n\r?\n---\r?\n\r?\n/);
  if (parts.length > 1) {
    s = parts[parts.length - 1].trim();
  } else {
    s = s
      .replace(/^Project memory:\s*[\s\S]*?(?=\n\nProject instructions:|\n\n---\n\n|$)/i, '')
      .replace(/^Project instructions:\s*[\s\S]*?(?=\n\n---\n\n|$)/i, '')
      .trim();
  }
  return s;
}

function readTextFromUnknown(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map(readTextFromUnknown).filter(Boolean).join('\n');
  }
  if (typeof value !== 'object') return '';
  const o = value as Record<string, unknown>;
  if (typeof o.text === 'string' && o.text.trim()) return o.text;
  if (typeof o.content === 'string' && o.content.trim()) return o.content;
  if (typeof o.message === 'string' && o.message.trim()) return o.message;
  if (o.agent_output && typeof o.agent_output === 'object') {
    const ao = o.agent_output as Record<string, unknown>;
    if (typeof ao.text === 'string' && ao.text.trim()) return ao.text;
    if (typeof ao.content === 'string' && ao.content.trim()) return ao.content;
  }
  if (Array.isArray(o.parts)) {
    return o.parts
      .map((part) => {
        if (!part || typeof part !== 'object') return '';
        const p = part as Record<string, unknown>;
        if (p.type === 'text' && typeof p.text === 'string') return p.text;
        return readTextFromUnknown(part);
      })
      .filter(Boolean)
      .join('\n');
  }
  if (Array.isArray(o.blocks)) {
    return o.blocks.map(readTextFromUnknown).filter(Boolean).join('\n');
  }
  try {
    const raw = JSON.stringify(value);
    if (raw === '{}' || raw === '[]') return '';
    return raw;
  } catch {
    return '';
  }
}

export function normalizeAgentSessionMessageContent(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return readTextFromUnknown(JSON.parse(trimmed)).trim();
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }
  return readTextFromUnknown(raw).trim();
}

/** Rebuild clean image-gen state from persisted markdown so refresh keeps the image. */
export function imageGenerationStateFromMarkdown(content: string): ImageGenerationState | null {
  const m = String(content || '').match(MD_IMAGE_RE);
  if (!m) return null;
  const alt = (m[1] || 'Generated image').trim() || 'Generated image';
  const url = (m[2] || '').trim();
  if (!url) return null;
  return {
    generationId: `restored_${url.slice(-12).replace(/[^a-zA-Z0-9]/g, '')}`,
    phase: 'completed',
    progress: 100,
    message: '',
    prompt: alt,
    previewUrl: url,
    imageUrl: url,
    previewFrames: [{ frameIndex: 0, previewUrl: url }],
    activeFrameIndex: 0,
    status: 'draft',
    persist: false,
    failed: false,
  };
}

export function mapAgentSessionMessages(rows: unknown): AgentShellMessage[] {
  if (!Array.isArray(rows)) return [];
  const mapped: AgentShellMessage[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const o = row as { role?: string; content?: unknown; status?: string };
    const role = o.role === 'user' ? 'user' : o.role === 'assistant' ? 'assistant' : null;
    if (!role) continue;
    const status = o.status != null ? String(o.status).trim().toLowerCase() : '';
    const content = normalizeAgentSessionMessageContent(o.content);
    const imageGenerationState =
      role === 'assistant' ? imageGenerationStateFromMarkdown(content) : null;
    // beginChatTurn reserves a pending assistant row with content ''. Never show that as "(empty)".
    if (!content && !imageGenerationState) {
      if (status === 'pending' || role === 'assistant') continue;
    }
    const displayContent = stripInjectedProjectBriefForDisplay(
      content ||
        (imageGenerationState ? `![Generated image](${imageGenerationState.imageUrl})` : ''),
    );
    if (!displayContent && !imageGenerationState) continue;
    mapped.push({
      role,
      content: displayContent,
      ...(imageGenerationState ? { imageGenerationState } : {}),
    });
  }
  return mapped;
}

export function agentTabMessagesNeedHydration(
  messages: AgentShellMessage[] | undefined,
  opts?: { hasConversationId?: boolean },
): boolean {
  if (!messages?.length) return true;
  const hasConv = opts?.hasConversationId !== false;
  const placeholderOnly = (c: string) => {
    const t = c.trim();
    return !t || t === '(empty)' || t === 'Loading conversation…';
  };
  if (messages.every((m) => placeholderOnly(m.content) && !m.imageGenerationState)) return true;
  if (
    hasConv &&
    messages.length === 1 &&
    messages[0].role === 'assistant' &&
    placeholderOnly(messages[0].content) &&
    !messages[0].imageGenerationState
  ) {
    return true;
  }
  return false;
}

export async function fetchAgentSessionMessages(conversationId: string): Promise<AgentShellMessage[]> {
  const convId = String(conversationId || '').trim();
  if (!convId) return [];
  const r = await fetch(`/api/agent/sessions/${encodeURIComponent(convId)}/messages`, {
    credentials: 'same-origin',
  });
  if (!r.ok) return [];
  const rows = await r.json().catch(() => []);
  return mapAgentSessionMessages(rows);
}

/** Narrow helper for App message state typing. */
export function asChatMessages(rows: AgentShellMessage[]): Message[] {
  return rows as Message[];
}
