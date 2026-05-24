// @auth-pipeline-v1

const SUPABASE_TOKEN_URL = "/auth/v1/token";
const SUPABASE_USER_URL = "/auth/v1/user";

export function getSupabaseAuthUrl({ supabaseUrl, clientId, redirectUri, state, codeChallenge, scope } = {}) {
  const url = new URL(`${String(supabaseUrl || "").replace(/\/$/, "")}/auth/v1/authorize`);
  url.searchParams.set("provider", "supabase");
  url.searchParams.set("client_id", clientId || "");
  url.searchParams.set("redirect_uri", redirectUri || "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope || "openid email profile");
  url.searchParams.set("state", state || "");
  url.searchParams.set("code_challenge", codeChallenge || "");
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export async function exchangeSupabaseCode({ supabaseUrl, code, codeVerifier, clientId, clientSecret, redirectUri }) {
  try {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code || "");
    body.set("code_verifier", codeVerifier || "");
    body.set("client_id", clientId || "");
    if (clientSecret) body.set("client_secret", clientSecret);
    body.set("redirect_uri", redirectUri || "");

    const res = await fetch(`${String(supabaseUrl || "").replace(/\/$/, "")}${SUPABASE_TOKEN_URL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: clientSecret ? `Bearer ${clientSecret}` : undefined,
      },
      body,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSupabaseProfile({ supabaseUrl, accessToken }) {
  try {
    const res = await fetch(`${String(supabaseUrl || "").replace(/\/$/, "")}${SUPABASE_USER_URL}`, {
      headers: { Authorization: `Bearer ${accessToken}`, apikey: accessToken || "" },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
