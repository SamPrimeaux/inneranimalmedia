-- Add notes and changed_files to deployments for backfill and richer tracking
-- Database: inneranimalmedia-business (D1)
-- Run: ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/146_deployments_notes_and_changed_files.sql

ALTER TABLE deployments ADD COLUMN notes TEXT;
ALTER TABLE deployments ADD COLUMN changed_files TEXT;
