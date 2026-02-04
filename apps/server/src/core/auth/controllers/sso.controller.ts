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

@Controller('sso')
export class SsoController {
  private readonly logger = new Logger(SsoController.name);

  constructor(
    private ssoService: SsoService,
    private domainService: DomainService,
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
      // Extract workspaceId from state
      let workspaceId: string;
      try {
        const stateObj = JSON.parse(state);
        workspaceId = stateObj.workspaceId;
      } catch (parseError) {
        // If state is not JSON, throw error
        throw new Error('State is not JSON format');
      }

      const authToken = await this.ssoService.handleCallback(
        providerId,
        code,
        state,
        workspaceId,
      );

      // Get workspace hostname for redirect
      const workspace = await this.ssoService.getWorkspaceById(workspaceId);
      this.setAuthCookie(res, authToken);
      res.statusCode = 302;
      return res.redirect(this.domainService.getUrl(workspace?.hostname));
    } catch (error) {
      this.logger.error('SSO callback error:', error);
      res.statusCode = 302;
      return res.redirect(this.domainService.getUrl());
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
    this.logger.log(`OIDC callback received:`);
    this.logger.log(`  providerId: ${providerId}`);
    this.logger.log(`  code: ${code ? code.substring(0, 20) + '...' : 'null'}`);
    this.logger.log(`  state: ${state}`);
    this.logger.log(`  request URL: ${req.raw.url}`);
    
    try {
      // Extract workspaceId from state
      let workspaceId: string;
      try {
        this.logger.log(`Parsing state to extract workspaceId`);
        const stateObj = JSON.parse(state);
        workspaceId = stateObj.workspaceId;
        this.logger.log(`Extracted workspaceId: ${workspaceId}`);
      } catch (parseError) {
        this.logger.error('Error parsing state:', parseError);
        // If state is not JSON, try to get workspace from request
        // Note: This is a fallback, but in OIDC callback requests, we should always get workspaceId from state
        throw new Error('State is not JSON format, and no workspace found in request');
        // const workspace = req.raw?.workspace ?? (req as any)?.user?.workspace;
        // if (!workspace) {
        //   throw new Error('No workspace found in state or request');
        // }
        // workspaceId = workspace.id;
        // this.logger.log(`Got workspaceId from request: ${workspaceId}`);
      }

      if (!workspaceId) {
        throw new Error('No workspaceId found');
      }

      this.logger.log(`Calling ssoService.handleCallback with workspaceId: ${workspaceId}`);
      const authToken = await this.ssoService.handleCallback(
        providerId,
        code,
        state,
        workspaceId,
      );
      this.logger.log(`handleCallback returned authToken: ${!!authToken}`);

      // Get workspace hostname for redirect
      this.logger.log(`Getting workspace by id: ${workspaceId}`);
      const workspace = await this.ssoService.getWorkspaceById(workspaceId);
      this.logger.log(`Got workspace: ${workspace ? workspace.id : 'null'}`);
      
      this.logger.log(`Setting auth cookie and redirecting`);
      this.setAuthCookie(res, authToken);
      res.statusCode = 302;
      const redirectUrl = this.domainService.getUrl(workspace?.hostname);
      this.logger.log(`Redirecting to: ${redirectUrl}`);
      return res.redirect(redirectUrl);
    } catch (error) {
      this.logger.error('OIDC callback error:', error);
      this.logger.error('Error stack:', (error as any).stack);
      res.statusCode = 302;
      const errorRedirectUrl = this.domainService.getUrl();
      this.logger.log(`Redirecting to error URL: ${errorRedirectUrl}`);
      return res.redirect(errorRedirectUrl);
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
      this.logger.log(`Login endpoint called with providerId: ${providerId}, workspaceId: ${workspace.id}`);
      
      const { url } = await this.ssoService.getAuthorizationUrl(
        providerId,
        workspace.id,
      );
      this.logger.log(`Generated authorization URL: ${url}`);
      
      res.statusCode = 302;
      return res.redirect(url);
    } catch (error) {
      this.logger.error(`Error in login endpoint: ${error}`);
      res.statusCode = 302;
      return res.redirect(this.domainService.getUrl(workspace.hostname));
    }
  }

  private setAuthCookie(res: FastifyReply, token: string) {
    res.setCookie('authToken', token, {
      httpOnly: true,
      path: '/',
      secure: false, // Set to true in production with HTTPS
      domain: '127.0.0.1', // Set domain to 127.0.0.1 for local development
    });
  }
}
