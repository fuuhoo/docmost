import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { AuthProviders } from '../../types/db';
import { InjectKysely } from 'nestjs-kysely';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthProvidersRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(id: string, workspaceId: string, trx?: KyselyTransaction): Promise<any | null> {
    const query = (trx || this.db)
      .selectFrom('authProviders')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId);

    return query.executeTakeFirst();
  }

  async create(data: any, trx?: KyselyTransaction): Promise<any> {
    const query = (trx || this.db)
      .insertInto('authProviders')
      .values(data)
      .returningAll();

    return query.executeTakeFirstOrThrow();
  }

  async update(id: string, workspaceId: string, data: any, trx?: KyselyTransaction): Promise<any> {
    const query = (trx || this.db)
      .updateTable('authProviders')
      .set(data)
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returningAll();

    return query.executeTakeFirstOrThrow();
  }

  async delete(id: string, workspaceId: string, trx?: KyselyTransaction): Promise<void> {
    const query = (trx || this.db)
      .deleteFrom('authProviders')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId);

    await query.execute();
  }

  async findAll(workspaceId: string, trx?: KyselyTransaction): Promise<any[]> {
    const query = (trx || this.db)
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId);

    return query.execute();
  }

  async findEnabled(workspaceId: string, trx?: KyselyTransaction): Promise<any[]> {
    const query = (trx || this.db)
      .selectFrom('authProviders')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('isEnabled', '=', true);

    return query.execute();
  }
}
