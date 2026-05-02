// src/tools/builtin/imessage.js
/**
 * Agent Sam Built-in Tool: iMessage
 * Orchestrates iMessage capabilities via the BlueBubbles implementation.
 */
import * as bb from "../../integrations/bluebubbles.js";

export const imessageTools = {
  /**
   * imessage.send: Sends a text message to a chat GUID.
   */
  "imessage.send": async ({ env }, args) => {
    let { chatGuid, phone, text } = args;
    if (!text) throw new Error("Missing text for imessage.send");
    if (!chatGuid && phone) {
      // Auto-format for US numbers if no chatGuid is provided
      const cleanPhone = phone.replace(/\D/g, '');
      chatGuid = `iMessage;-;${cleanPhone.length === 10 ? '+1' + cleanPhone : '+' + cleanPhone}`;
    }
    if (!chatGuid) throw new Error("Missing chatGuid or phone for imessage.send");
    
    return bb.sendMessage(env, { chatGuid, text });
  },

  /**
   * imessage.send_and_wait: Sends a message and registers a hook for a reply.
   */
  "imessage.send_and_wait": async ({ env, session }, args) => {
    let { chatGuid, phone, text, conversationId } = args;
    if (!text || !conversationId) {
      throw new Error("Missing text or conversationId for imessage.send_and_wait");
    }

    if (!chatGuid && phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      chatGuid = `iMessage;-;${cleanPhone.length === 10 ? '+1' + cleanPhone : '+' + cleanPhone}`;
    }
    if (!chatGuid) throw new Error("Missing chatGuid or phone for imessage.send_and_wait");

    // 1. Send the message
    const res = await bb.sendMessage(env, { chatGuid, text });

    // 2. Register the hook
    await env.DB.prepare(
      `INSERT INTO agentsam_hook (id, user_id, provider, external_id, trigger, target_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      session?.user_id || 'system',
      'imessage',
      chatGuid,
      'imessage_reply',
      conversationId,
      1
    ).run();

    return { 
      status: 'sent_and_hooked', 
      chatGuid, 
      conversationId,
      result: res
    };
  },

  /**
   * imessage.list_chats: Retrieves the list of recent chats.
   */
  "imessage.list_chats": async ({ env }) => {
    return bb.listChats(env);
  },

  /**
   * imessage.get_history: Retrieves message history for a chat GUID.
   */
  "imessage.get_history": async ({ env }, args) => {
    if (!args.chatGuid) {
      throw new Error("Missing chatGuid for imessage.get_history");
    }
    return bb.getMessages(env, args.chatGuid, args.limit || 25);
  },
};
