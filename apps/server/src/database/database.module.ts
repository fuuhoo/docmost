import {
  Global,
  Logger,
  Module,
  OnApplicationBootstrap,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { InjectKysely, KyselyModule } from 'nestjs-kysely';
import { EnvironmentService } from '../integrations/environment/environment.service';
import { CamelCasePlugin, LogEvent, sql } from 'kysely';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { SpaceRepo } from '@docmost/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@docmost/db/repos/space/space-member.repo';
import { PageRepo } from './repos/page/page.repo';
import { CommentRepo } from './repos/comment/comment.repo';
import { PageHistoryRepo } from './repos/page/page-history.repo';
import { AttachmentRepo } from './repos/attachment/attachment.repo';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import * as process from 'node:process';
import { MigrationService } from '@docmost/db/services/migration.service';
import { UserTokenRepo } from './repos/user-token/user-token.repo';
import { BacklinkRepo } from '@docmost/db/repos/backlink/backlink.repo';
import { ShareRepo } from '@docmost/db/repos/share/share.repo';
import { PageListener } from '@docmost/db/listeners/page.listener';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { normalizePostgresUrl } from '../common/helpers';

@Global()
@Module({
  imports: [
    KyselyModule.forRootAsync({
      imports: [],
      inject: [EnvironmentService],
      useFactory: (environmentService: EnvironmentService) => ({
        dialect: new PostgresJSDialect({
          postgres: postgres(
            normalizePostgresUrl(environmentService.getDatabaseURL()),
            {
              max: environmentService.getDatabaseMaxPool(),
              onnotice: () => {},
              types: {
                bigint: {
                  to: 20,
                  from: [20, 1700],
                  serialize: (value: number) => value.toString(),
                  parse: (value: string) => Number.parseInt(value),
                },
              },
            },
          ),
        }),
        plugins: [new CamelCasePlugin()],
        log: (event: LogEvent) => {
          if (environmentService.getNodeEnv() !== 'development') return;
          const logger = new Logger(DatabaseModule.name);
          if (process.env.DEBUG_DB?.toLowerCase() === 'true') {
            logger.debug(event.query.sql);
            logger.debug('query time: ' + event.queryDurationMillis + ' ms');
          }
        },
      }),
    }),
  ],
  providers: [
    MigrationService,
    WorkspaceRepo,
    UserRepo,
    GroupRepo,
    GroupUserRepo,
    SpaceRepo,
    SpaceMemberRepo,
    PageRepo,
    PageHistoryRepo,
    CommentRepo,
    AttachmentRepo,
    UserTokenRepo,
    BacklinkRepo,
    ShareRepo,
    PageListener,
  ],
  exports: [
    WorkspaceRepo,
    UserRepo,
    GroupRepo,
    GroupUserRepo,
    SpaceRepo,
    SpaceMemberRepo,
    PageRepo,
    PageHistoryRepo,
    CommentRepo,
    AttachmentRepo,
    UserTokenRepo,
    BacklinkRepo,
    ShareRepo,
  ],
})
export class DatabaseModule
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly migrationService: MigrationService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onApplicationBootstrap() {
    await this.establishConnection();

    if (this.environmentService.getNodeEnv() === 'production') {
      await this.migrationService.migrateToLatest();
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (this.db) {
      await this.db.destroy();
    }
  }

  async establishConnection() {
    console.log('====================================');
    console.log('STARTING DATABASE CONNECTION ATTEMPT');
    console.log('====================================');
    console.log('Current time:', new Date().toISOString());
    console.log('Database URL:', this.environmentService.getDatabaseURL());
    
    const retryAttempts = 1;
    const retryDelay = 1000;

    for (let i = 0; i < retryAttempts; i++) {
      try {
        console.log(`\nAttempt ${i + 1}/${retryAttempts}: Connecting to database...`);
        console.log('Executing test query: SELECT 1=1');
        const result = await sql`SELECT 1=1`.execute(this.db);
        console.log('Database connection successful!');
        console.log('Query result:', result);
        break;
      } catch (err: any) {
        console.error(`\nAttempt ${i + 1}/${retryAttempts}: Database connection failed`);
        console.error('Error details:', err);
        console.error('Error stack:', err.stack);

        if (i < retryAttempts - 1) {
          console.log(`Retrying in ${retryDelay / 1000} seconds...`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          console.error(`\nFailed to connect to database after ${retryAttempts} attempts. Exiting...`);
          process.exit(1);
        }
      }
    }
    
    console.log('\n====================================');
    console.log('DATABASE CONNECTION ESTABLISHED');
    console.log('====================================');
  }
}
