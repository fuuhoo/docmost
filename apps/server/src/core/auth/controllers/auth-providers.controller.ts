import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { AuthProvidersRepo } from '../../../database/repos/auth/auth-providers.repo';

@Controller('sso')
export class AuthProvidersController {
  private readonly logger = new Logger(AuthProvidersController.name);

  constructor(private authProvidersRepo: AuthProvidersRepo) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('create')
  async createSsoProvider(
    @Body() data: {
      type: string;
      name: string;
    },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.authProvidersRepo.create({
      type: data.type,
      name: data.name,
      creatorId: user.id,
      workspaceId: workspace.id,
      isEnabled: false,
      allowSignup: false,
      groupSync: false,
    });
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateSsoProvider(
    @Body() data: any,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const providerId = data.providerId || data.id;
    // Remove providerId from data before update
    if (data.providerId) delete data.providerId;
    if (data.id) delete data.id;
    return this.authProvidersRepo.update(providerId, workspace.id, data);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteSsoProvider(
    @Body() data: {
      providerId: string;
    },
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.authProvidersRepo.delete(data.providerId, workspace.id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('providers')
  async getSsoProviders(@AuthWorkspace() workspace: Workspace) {
    const providers = await this.authProvidersRepo.findAll(workspace.id);
    return {
      items: providers,
      total: providers.length,
      page: 1,
      limit: providers.length,
    };
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getSsoProviderById(
    @Body() data: {
      providerId: string;
    },
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.authProvidersRepo.findById(data.providerId, workspace.id);
  }
}
