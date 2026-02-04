import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { AuthAccounts } from '../../types/db';
import { InjectKysely } from 'nestjs-kysely';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthAccountsRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async create(data: {
    userId: string;
    authProviderId: string;
    providerUserId: string;
    workspaceId: string;
  }, trx?: KyselyTransaction): Promise<any> {
    const query = (trx || this.db)
      .insertInto('authAccounts')
      .values(data)
      .returningAll();

    return query.executeTakeFirstOrThrow();
  }

  async findById(id: string, workspaceId: string, trx?: KyselyTransaction): Promise<any | null> {
    const query = (trx || this.db)
      .selectFrom('authAccounts')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId);

    return query.executeTakeFirst();
  }

  async findByUserId(userId: string, workspaceId: string, trx?: KyselyTransaction): Promise<any[]> {
    const query = (trx || this.db)
      .selectFrom('authAccounts')
      .selectAll()
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId);

    return query.execute();
  }

  async findByProviderUserId(providerUserId: string, authProviderId: string, workspaceId: string, trx?: KyselyTransaction): Promise<any | null> {
    const query = (trx || this.db)
      .selectFrom('authAccounts')
      .selectAll()
      .where('providerUserId', '=', providerUserId)
      .where('authProviderId', '=', authProviderId)
      .where('workspaceId', '=', workspaceId);

    return query.executeTakeFirst();
  }

  async update(id: string, workspaceId: string, data: any, trx?: KyselyTransaction): Promise<any> {
    const query = (trx || this.db)
      .updateTable('authAccounts')
      .set(data)
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returningAll();

    return query.executeTakeFirstOrThrow();
  }

  async delete(id: string, workspaceId: string, trx?: KyselyTransaction): Promise<void> {
    const query = (trx || this.db)
      .deleteFrom('authAccounts')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId);

    await query.execute();
  }

  async deleteByUserId(userId: string, workspaceId: string, trx?: KyselyTransaction): Promise<void> {
    const query = (trx || this.db)
      .deleteFrom('authAccounts')
      .where('userId', '=', userId)
      .where('workspaceId', '=', workspaceId);

    await query.execute();
  }

  async deleteByProviderId(authProviderId: string, workspaceId: string, trx?: KyselyTransaction): Promise<void> {
    const query = (trx || this.db)
      .deleteFrom('authAccounts')
      .where('authProviderId', '=', authProviderId)
      .where('workspaceId', '=', workspaceId);

    await query.execute();
  }
}
