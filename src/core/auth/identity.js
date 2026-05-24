// @auth-pipeline-v1

export function normalizeProviderProfile(provider, profile) {
  const p = provider?.toLowerCase?.() || "";
  const id =
    profile?.id != null
      ? String(profile.id)
      : profile?.sub != null
        ? String(profile.sub)
        : profile?.user_id != null
          ? String(profile.user_id)
          : "";

  const email = typeof profile?.email === "string" ? profile.email.trim().toLowerCase() : null;
  const emailVerified =
    profile?.email_verified === true ||
    profile?.verified_email === true ||
    profile?.email_verified === "true";

  const name =
    typeof profile?.name === "string"
      ? profile.name.trim()
      : [profile?.given_name, profile?.family_name].filter(Boolean).join(" ").trim() || null;

  const avatarUrl =
    typeof profile?.picture === "string"
      ? profile.picture
      : typeof profile?.avatar_url === "string"
        ? profile.avatar_url
        : typeof profile?.avatarUrl === "string"
          ? profile.avatarUrl
          : null;

  const username =
    typeof profile?.login === "string"
      ? profile.login
      : typeof profile?.preferred_username === "string"
        ? profile.preferred_username
        : typeof profile?.nickname === "string"
          ? profile.nickname
          : null;

  return {
    provider: p,
    providerAccountId: id,
    email,
    emailVerified,
    name,
    avatarUrl,
    username,
    raw: profile && typeof profile === "object" ? profile : null,
  };
}

export function buildIdentityRecord(normalized) {
  const now = new Date().toISOString();
  return {
    provider: normalized.provider,
    provider_account_id: normalized.providerAccountId,
    email: normalized.email,
    email_verified: normalized.emailVerified ? 1 : 0,
    display_name: normalized.name,
    avatar_url: normalized.avatarUrl,
    username: normalized.username,
    profile_json: normalized.raw ? JSON.stringify(normalized.raw) : null,
    created_at: now,
    updated_at: now,
  };
}

export function safeIdentityFromRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    id: row.id != null ? String(row.id) : null,
    provider: row.provider ?? null,
    providerAccountId: row.provider_account_id ?? null,
    email: row.email ?? null,
    emailVerified: !!row.email_verified,
    displayName: row.display_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    username: row.username ?? null,
    profile: row.profile_json ? safeJsonParse(row.profile_json) : null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export function safeJsonParse(value) {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function mergeIdentity(base, patch) {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(patch || {}).filter(([, v]) => v !== undefined)
    ),
  };
}
