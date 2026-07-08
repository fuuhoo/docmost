import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { AuthAccountsRepo } from '@docmost/db/repos/auth/auth-accounts.repo';

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepo, AuthAccountsRepo],
  exports: [UserService, UserRepo],
})
export class UserModule {}
