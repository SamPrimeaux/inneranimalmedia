-- Edge session invalidation counter: bump to revoke all signed session JWTs for a user.
-- Hot path reads auth_rev from KV (synced at login); D1 is SSOT.

ALTER TABLE auth_users ADD COLUMN auth_rev INTEGER NOT NULL DEFAULT 0;
