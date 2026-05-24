// @auth-pipeline-v1

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

export function getGoogleAuthUrl({ clientId, redirectUri, state, codeChallenge, scope } = {}) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", clientId || "");
  url.searchParams.set("redirect_uri", redirectUri || "");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope || "openid email profile");
  url.searchParams.set("state", state || "");
  url.searchParams.set("code_challenge", codeChallenge || "");
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "consent");
  return url.toString();
}

export async function exchangeGoogleCode({ code, codeVerifier, clientId, clientSecret, redirectUri }) {
  try {
    const body = new URLSearchParams();
    body.set("grant_type", "authorization_code");
    body.set("code", code || "");
    body.set("code_verifier", codeVerifier || "");
    body.set("client_id", clientId || "");
    if (clientSecret) body.set("client_secret", clientSecret);
    body.set("redirect_uri", redirectUri || "");

    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchGoogleProfile(accessToken) {
  try {
    const res = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
