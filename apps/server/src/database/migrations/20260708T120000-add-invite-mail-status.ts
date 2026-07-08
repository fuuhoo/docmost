import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspace_invitations')
    .addColumn('mail_status', 'varchar', (col) => col)
    .addColumn('mail_error', 'text', (col) => col)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspace_invitations')
    .dropColumn('mail_error')
    .dropColumn('mail_status')
    .execute();
}
