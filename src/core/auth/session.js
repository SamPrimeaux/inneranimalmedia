// @auth-pipeline-v1

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function b64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unb64url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveAesKey(masterKey) {
  const input = typeof masterKey === "string" ? textEncoder.encode(masterKey) : masterKey;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptVerifier(verifier, env) {
  try {
    const key = await deriveAesKey(env?.VAULT_MASTER_KEY || "");
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = textEncoder.encode(String(verifier || ""));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
    const packed = new Uint8Array(iv.length + ciphertext.byteLength);
    packed.set(iv, 0);
    packed.set(new Uint8Array(ciphertext), iv.length);
    return b64url(packed);
  } catch {
    return null;
  }
}

export async function decryptVerifier(token, env) {
  try {
    if (!token) return null;
    const packed = unb64url(String(token));
    if (packed.byteLength < 13) return null;
    const iv = packed.slice(0, 12);
    const ciphertext = packed.slice(12);
    const key = await deriveAesKey(env?.VAULT_MASTER_KEY || "");
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return textDecoder.decode(plaintext);
  } catch {
    return null;
  }
}

export function createPkceVerifier() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64url(bytes);
}

export async function createPkceChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(verifier));
  return b64url(new Uint8Array(digest));
}

export function createSessionPayload(identity, extras = {}) {
  const now = new Date();
  return {
    sub: identity?.id ?? null,
    provider: identity?.provider ?? null,
    email: identity?.email ?? null,
    name: identity?.displayName ?? null,
    picture: identity?.avatarUrl ?? null,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor((now.getTime() + (extras.ttlMs || 1000 * 60 * 60 * 24 * 7)) / 1000),
    ...extras,
  };
}

export async function signSession(payload, env) {
  try {
    const keyMaterial = await crypto.subtle.digest(
      "SHA-256",
      textEncoder.encode(String(env?.SESSION_SIGNING_SECRET || env?.VAULT_MASTER_KEY || ""))
    );
    const key = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const body = textEncoder.encode(JSON.stringify(payload || {}));
    const sig = await crypto.subtle.sign("HMAC", key, body);
    return `${b64url(body)}.${b64url(new Uint8Array(sig))}`;
  } catch {
    return null;
  }
}

export async function verifySession(token, env) {
  try {
    if (!token || typeof token !== "string") return null;
    const [bodyB64, sigB64] = token.split(".");
    if (!bodyB64 || !sigB64) return null;
    const body = unb64url(bodyB64);
    const provided = unb64url(sigB64);
    const keyMaterial = await crypto.subtle.digest(
      "SHA-256",
      textEncoder.encode(String(env?.SESSION_SIGNING_SECRET || env?.VAULT_MASTER_KEY || ""))
    );
    const key = await crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const ok = await crypto.subtle.verify("HMAC", key, provided, body);
    if (!ok) return null;
    const payload = JSON.parse(textDecoder.decode(body));
    if (payload?.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function buildSetCookie(name, value, options = {}) {
  const parts = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (options.secure !== false) parts.push("Secure");
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join("; ");
}
