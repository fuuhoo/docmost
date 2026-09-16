import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .addColumn('enable_registration', 'boolean', (col) =>
      col.defaultTo(false).notNull(),
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .dropColumn('enable_registration')
    .execute();
}
