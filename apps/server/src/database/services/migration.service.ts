import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import { promises as fs } from 'fs';
import { Migrator, FileMigrationProvider, sql } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';

/** Columns this build relies on; startup fails if any are missing after migrate. */
const REQUIRED_COLUMNS: Array<{ table: string; column: string }> = [
  { table: 'workspaces', column: 'enable_registration' },
  { table: 'workspaces', column: 'email_domains' },
];

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(`Database${MigrationService.name}`);

  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async migrateToLatest(): Promise<void> {
    const migrator = new Migrator({
      db: this.db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '..', 'migrations'),
      }),
    });

    const { error, results } = await migrator.migrateToLatest();

    if (results && results.length === 0) {
      this.logger.log('No pending database migrations');
      return;
    }

    results?.forEach((it) => {
      if (it.status === 'Success') {
        this.logger.log(
          `Migration "${it.migrationName}" executed successfully`,
        );
      } else if (it.status === 'Error') {
        this.logger.error(`Failed to execute migration "${it.migrationName}"`);
      }
    });

    if (error) {
      this.logger.error('Failed to run database migration. Exiting program.');
      this.logger.error(error);
      process.exit(1);
    }
  }

  async verifySchema(): Promise<void> {
    const missing: string[] = [];

    for (const { table, column } of REQUIRED_COLUMNS) {
      const result = await sql<{ column_name: string }>`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = ${table}
          AND column_name = ${column}
      `.execute(this.db);

      if (!result.rows?.length) {
        missing.push(`${table}.${column}`);
      }
    }

    if (missing.length > 0) {
      this.logger.error(
        `Database schema is incomplete. Missing columns: ${missing.join(', ')}`,
      );
      this.logger.error(
        'Run pending migrations (pnpm --filter server run migration:up) and restart.',
      );
      process.exit(1);
    }

    this.logger.log('Database schema check passed');
  }
}
