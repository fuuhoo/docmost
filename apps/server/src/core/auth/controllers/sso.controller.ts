import {
  Controller,
  Get,
  Logger,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Public } from '../../../common/decorators/public.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { SkipTransform } from '../../../common/decorators/skip-transform.decorator';
import { Workspace } from '@docmost/db/types/entity.types';
import { SsoService } from '../services/sso.service';
import { DomainService } from '../../../integrations/environment/domain.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

@Controller('sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private ssoService: SsoService,
    private domainService: DomainService,
    private environmentService: EnvironmentService,
  ) {}

  @Public()
  @SkipTransform()
  @Get(':providerId/callback')
  async callback(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @Param('providerId') providerId: string,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      let workspaceId: string;
      try {
        const stateObj = JSON.parse(state);
        workspaceId = stateObj.workspaceId;
      } catch (parseError) {
        throw new Error('Invalid state parameter');
      }

      const authToken = await this.ssoService.handleCallback(
        providerId,
        code,
        state,
        workspaceId,
      );

      const workspace = await this.ssoService.getWorkspaceById(workspaceId);
      this.setAuthCookie(res, authToken);
      res.statusCode = 302;
      return res.redirect(this.domainService.getUrl(workspace?.hostname));
    } catch (error) {
      this.logger.error('SSO callback error:', (error as Error).message);
      res.statusCode = 302;
      const errorUrl = new URL(this.domainService.getUrl());
      errorUrl.searchParams.set('error', 'sso_failed');
      return res.redirect(errorUrl.toString());
    }
  }

  @Public()
  @SkipTransform()
  @Get('oidc/:providerId/callback')
  async oidcCallback(
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) res: FastifyReply,
    @Param('providerId') providerId: string,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    try {
      let workspaceId: string;
      try {
        const stateObj = JSON.parse(state);
        workspaceId = stateObj.workspaceId;
      } catch (parseError) {
        throw new Error('Invalid state parameter');
      }

      if (!workspaceId) {
        throw new Error('No workspaceId in state');
      }

      const authToken = await this.ssoService.handleCallback(
        providerId,
        code,
        state,
        workspaceId,
      );

      const workspace = await this.ssoService.getWorkspaceById(workspaceId);
      this.setAuthCookie(res, authToken);
      res.statusCode = 302;
      return res.redirect(this.domainService.getUrl(workspace?.hostname));
    } catch (error) {
      this.logger.error('OIDC callback error:', (error as Error).message);
      res.statusCode = 302;
      const errorUrl = new URL(this.domainService.getUrl());
      errorUrl.searchParams.set('error', 'oidc_failed');
      return res.redirect(errorUrl.toString());
    }
  }

  @Public()
  @Get(':providerId')
  async login(
    @Req() req: FastifyRequest,
    @Res() res: FastifyReply,
    @Param('providerId') providerId: string,
    @AuthWorkspace() workspace: Workspace,
  ) {
    try {
      const { url } = await this.ssoService.getAuthorizationUrl(
        providerId,
        workspace.id,
      );

      res.statusCode = 302;
      return res.redirect(url);
    } catch (error) {
      this.logger.error('SSO login error:', (error as Error).message);
      res.statusCode = 302;
      return res.redirect(this.domainService.getUrl(workspace.hostname));
    }
  }

  private setAuthCookie(res: FastifyReply, token: string) {
    res.setCookie('authToken', token, {
      httpOnly: true,
      path: '/',
      expires: this.environmentService.getCookieExpiresIn(),
      secure: this.environmentService.isHttps(),
    });
  }
}
