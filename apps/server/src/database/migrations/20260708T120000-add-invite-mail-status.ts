import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Idempotent: workspace_invitations already includes mail_status and mail_error
  // since migration 20240324T086200. This migration is kept as a no-op for ordering
  // but uses IF NOT EXISTS so it can be safely re-run.
  await sql`ALTER TABLE workspace_invitations ADD COLUMN IF NOT EXISTS mail_status varchar`.execute(db);
  await sql`ALTER TABLE workspace_invitations ADD COLUMN IF NOT EXISTS mail_error text`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE workspace_invitations DROP COLUMN IF EXISTS mail_error`.execute(db);
  await sql`ALTER TABLE workspace_invitations DROP COLUMN IF EXISTS mail_status`.execute(db);
}