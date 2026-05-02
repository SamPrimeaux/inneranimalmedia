// src/integrations/bluebubbles.js
/**
 * BlueBubbles Integration: iMessage Bridge
 * Thin client wrapper around the BlueBubbles Server (local M4 Mac).
 */

export async function bbRequest(env, path, options = {}) {
  const base = env.BLUEBUBBLES_URL;
  const password = env.BLUEBUBBLES_PASSWORD;

  if (!base || !password) {
    throw new Error('BlueBubbles configuration missing (BLUEBUBBLES_URL/PASSWORD)');
  }

  const url = new URL(`/api/v1${path}`, base);
  url.searchParams.set("guid", password);

  const res = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`BlueBubbles error ${res.status}: ${text}`);
  }

  return res.json();
}

/**
 * ✅ send iMessage
 */
export async function sendMessage(env, { chatGuid, text }) {
  return bbRequest(env, "/message/text", {
    method: "POST",
    body: {
      chatGuid,
      message: text,
    },
  });
}

/**
 * ✅ list chats
 */
export async function listChats(env) {
  return bbRequest(env, "/chats");
}

/**
 * ✅ get messages
 */
export async function getMessages(env, chatGuid, limit = 25) {
  return bbRequest(env, `/messages?chatGuid=${chatGuid}&limit=${limit}`);
}

/**
 * ✅ health check
 */
export async function ping(env) {
  return bbRequest(env, "/ping");
}
