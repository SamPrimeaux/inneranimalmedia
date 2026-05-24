// @auth-pipeline-v1
// UNUSED — do not route from index.js. Scaffold targets auth_identities / JWT session cookie,
// not production account_identities + auth_sessions. Use finalizeInboundOAuth in oauth-login-callbacks.js.

import { normalizeProviderProfile, buildIdentityRecord, safeIdentityFromRow } from "./identity.js";
import { encryptVerifier, decryptVerifier, createPkceVerifier, createPkceChallenge, createSessionPayload, signSession, buildSetCookie } from "./session.js";
import { upsertIdentity, upsertUserSession, recordAuthEvent } from "./side-effects.js";
import { exchangeGoogleCode, fetchGoogleProfile, getGoogleAuthUrl } from "./providers/google.js";
import { exchangeGithubCode, fetchGithubProfile, getGithubAuthUrl } from "./providers/github.js";
import { exchangeSupabaseCode, fetchSupabaseProfile, getSupabaseAuthUrl } from "./providers/supabase.js";

function safeUrl(origin, path) {
  try {
    return new URL(path, origin).toString();
  } catch {
    return path;
  }
}

export async function startAuthPipeline({ provider, request, env }) {
  try {
    const state = crypto.randomUUID();
    const verifier = createPkceVerifier();
    const challenge = await createPkceChallenge(verifier);
    const encryptedVerifier = await encryptVerifier(verifier, env);

    if (!encryptedVerifier) {
      return { ok: false, redirect: null, error: "pkce_unavailable" };
    }

    const redirectUri = safeUrl(request.url, `/auth/callback/${provider}`);
    const common = {
      clientId: env?.[`${String(provider).toUpperCase()}_CLIENT_ID`] || "",
      redirectUri,
      state,
      codeChallenge: challenge,
    };

    const authUrl =
      provider === "google"
        ? getGoogleAuthUrl({ ...common, scope: "openid email profile" })
        : provider === "github"
          ? getGithubAuthUrl({ ...common, scope: "read:user user:email" })
          : provider === "supabase"
            ? getSupabaseAuthUrl({
                supabaseUrl: env?.SUPABASE_URL || "",
                ...common,
                scope: "openid email profile",
              })
            : null;

    if (!authUrl) return { ok: false, redirect: null, error: "unsupported_provider" };

    return {
      ok: true,
      redirect: authUrl,
      state,
      verifier: encryptedVerifier,
      cookie: buildSetCookie(`pkce_${provider}`, encryptedVerifier, { maxAge: 600, secure: true }),
    };
  } catch {
    return { ok: false, redirect: null, error: "auth_start_failed" };
  }
}

export async function completeAuthPipeline({ provider, request, env, db }) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const returnedState = url.searchParams.get("state");
    if (!code) return { ok: false, error: "missing_code" };

    const encryptedVerifier = request.headers.get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`pkce_${provider}=`))
      ?.split("=")
      .slice(1)
      .join("=");

    const codeVerifier = await decryptVerifier(encryptedVerifier, env);
    if (!codeVerifier) return { ok: false, error: "missing_pkce" };

    const redirectUri = safeUrl(request.url, `/auth/callback/${provider}`);
    const clientId = env?.[`${String(provider).toUpperCase()}_CLIENT_ID`] || "";
    const clientSecret = env?.[`${String(provider).toUpperCase()}_CLIENT_SECRET`] || "";

    const token =
      provider === "google"
        ? await exchangeGoogleCode({ code, codeVerifier, clientId, clientSecret, redirectUri })
        : provider === "github"
          ? await exchangeGithubCode({ code, codeVerifier, clientId, clientSecret, redirectUri })
          : provider === "supabase"
            ? await exchangeSupabaseCode({
                supabaseUrl: env?.SUPABASE_URL || "",
                code,
                codeVerifier,
                clientId,
                clientSecret,
                redirectUri,
              })
            : null;

    const accessToken = token?.access_token || token?.session?.access_token || null;
    if (!accessToken) return { ok: false, error: "token_exchange_failed" };

    const profile =
      provider === "google"
        ? await fetchGoogleProfile(accessToken)
        : provider === "github"
          ? await fetchGithubProfile(accessToken)
          : provider === "supabase"
            ? await fetchSupabaseProfile({ supabaseUrl: env?.SUPABASE_URL || "", accessToken })
            : null;

    const normalized = normalizeProviderProfile(provider, profile || {});
    const identity = buildIdentityRecord(normalized);

    if (db) {
      await upsertIdentity(db, identity);
      await recordAuthEvent(db, {
        event_id: crypto.randomUUID(),
        event_type: "login",
        provider,
        subject: normalized.providerAccountId,
        detail_json: JSON.stringify({ state: returnedState || null }),
        created_at: new Date().toISOString(),
      });
    }

    const sessionPayload = createSessionPayload(safeIdentityFromRow(identity), {
      provider,
      state: returnedState || null,
    });
    const sessionToken = await signSession(sessionPayload, env);

    if (db && sessionToken) {
      await upsertUserSession(db, {
        session_id: crypto.randomUUID(),
        user_id: identity.provider_account_id,
        provider,
        payload_json: JSON.stringify(sessionPayload),
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    return {
      ok: true,
      identity,
      sessionToken,
      cookie: sessionToken ? buildSetCookie("session", sessionToken, { maxAge: 60 * 60 * 24 * 7, secure: true }) : null,
    };
  } catch {
    return { ok: false, error: "auth_complete_failed" };
  }
}

export async function handleAuthPipeline({ provider, request, env, db }) {
  try {
    const url = new URL(request.url);
    const isCallback = url.searchParams.has("code");
    return isCallback
      ? await completeAuthPipeline({ provider, request, env, db })
      : await startAuthPipeline({ provider, request, env, db });
  } catch {
    return { ok: false, error: "auth_pipeline_failed" };
  }
}
