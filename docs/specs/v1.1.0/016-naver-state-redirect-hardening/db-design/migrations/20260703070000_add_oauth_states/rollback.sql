-- Rollback for 20260703070000_add_oauth_states
-- Manual reference only — Prisma Migrate has no native down-migration runner.
-- Not auto-executed; apply explicitly via `psql` (or equivalent) if this migration must be reverted.
-- Safe to run standalone: oauth_states has no FK from/to other tables (P-001 module boundary,
-- 016 plan.md ADR-001) and CSRF nonces are transient (10min TTL) — no cross-table cascade, no
-- durable data loss beyond in-flight naver login attempts during the drop window.

DROP INDEX IF EXISTS "users"."oauth_states_expiresAt_idx";
DROP INDEX IF EXISTS "users"."oauth_states_state_key";
DROP TABLE IF EXISTS "users"."oauth_states";
