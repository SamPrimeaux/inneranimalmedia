// @auth-pipeline-v1

export async function upsertIdentity(db, identity) {
  try {
    if (!db || !identity) return null;
    await db.prepare(
      `INSERT INTO "auth_identities"
       ("provider","provider_account_id","email","email_verified","display_name","avatar_url","username","profile_json","created_at","updated_at")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT("provider","provider_account_id")
       DO UPDATE SET
         "email"=excluded."email",
         "email_verified"=excluded."email_verified",
         "display_name"=excluded."display_name",
         "avatar_url"=excluded."avatar_url",
         "username"=excluded."username",
         "profile_json"=excluded."profile_json",
         "updated_at"=excluded."updated_at"`
    ).bind(
      identity.provider,
      identity.provider_account_id,
      identity.email,
      identity.email_verified,
      identity.display_name,
      identity.avatar_url,
      identity.username,
      identity.profile_json,
      identity.created_at,
      identity.updated_at
    ).run();
    return true;
  } catch {
    return null;
  }
}

export async function upsertUserSession(db, session) {
  try {
    if (!db || !session) return null;
    await db.prepare(
      `INSERT INTO "auth_sessions"
       ("session_id","user_id","provider","payload_json","expires_at","created_at","updated_at")
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT("session_id")
       DO UPDATE SET
         "payload_json"=excluded."payload_json",
         "expires_at"=excluded."expires_at",
         "updated_at"=excluded."updated_at"`
    ).bind(
      session.session_id,
      session.user_id,
      session.provider,
      session.payload_json,
      session.expires_at,
      session.created_at,
      session.updated_at
    ).run();
    return true;
  } catch {
    return null;
  }
}

export async function recordAuthEvent(db, event) {
  try {
    if (!db || !event) return null;
    await db.prepare(
      `INSERT INTO "auth_events"
       ("event_id","event_type","provider","subject","detail_json","created_at")
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(
      event.event_id,
      event.event_type,
      event.provider,
      event.subject,
      event.detail_json,
      event.created_at
    ).run();
    return true;
  } catch {
    return null;
  }
}
