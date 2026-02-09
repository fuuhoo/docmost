import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { SsoController } from './controllers/sso.controller';
import { AuthProvidersController } from './controllers/auth-providers.controller';
import { AuthService } from './services/auth.service';
import { SsoService } from './services/sso.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { WorkspaceModule } from '../workspace/workspace.module';
import { SpaceModule } from '../space/space.module';
import { SignupService } from './services/signup.service';
import { TokenModule } from './token.module';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { AuthAccountsRepo } from '@docmost/db/repos/auth/auth-accounts.repo';
import { AuthProvidersRepo } from '@docmost/db/repos/auth/auth-providers.repo';
import { DomainService } from '../../integrations/environment/domain.service';

@Module({
  imports: [TokenModule, WorkspaceModule, SpaceModule],
  controllers: [AuthController, SsoController, AuthProvidersController],
  providers: [
    AuthService,
    SsoService,
    SignupService,
    JwtStrategy,
    UserRepo,
    AuthAccountsRepo,
    AuthProvidersRepo,
    DomainService,
  ],
  exports: [SignupService],
})
export class AuthModule {}
