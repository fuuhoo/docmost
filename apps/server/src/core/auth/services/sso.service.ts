import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Issuer, Client, TokenSet } from 'openid-client';
import { AuthProviders } from '@docmost/db/types/db';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { InjectKysely } from 'nestjs-kysely';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { AuthAccountsRepo } from '@docmost/db/repos/auth/auth-accounts.repo';
import { AuthProvidersRepo } from '@docmost/db/repos/auth/auth-providers.repo';
import { TokenService } from './token.service';
import { DomainService } from '../../../integrations/environment/domain.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { User } from '@docmost/db/types/entity.types';
import { nanoid } from 'nanoid';
import { UserRole } from '../../../common/helpers/types/permission';

@Injectable()
export class SsoService {
  private readonly logger = new Logger(SsoService.name);
  private readonly clientCache = new Map<string, Client>();

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private userRepo: UserRepo,
    private authAccountsRepo: AuthAccountsRepo,
    private authProvidersRepo: AuthProvidersRepo,
    private tokenService: TokenService,
    private domainService: DomainService,
    private environmentService: EnvironmentService,
  ) {}

  async getAuthorizationUrl(providerId: string, workspaceId: string) {
    const provider = await this.authProvidersRepo.findById(providerId, workspaceId);

    if (!provider || !provider.isEnabled) {
      throw new NotFoundException('SSO provider not found or disabled');
    }

    if (provider.type !== 'oidc' || !provider.oidcIssuer || !provider.oidcClientId || !provider.oidcClientSecret) {
      throw new BadRequestException('Invalid OIDC provider configuration');
    }

    const client = await this.getOrCreateClient(provider);

    // Include workspaceId in state to recover it in callback
    const state = JSON.stringify({
      random: nanoid(),
      workspaceId: workspaceId,
    });

    const callbackUrl = await this.getCallbackUrl(providerId, workspaceId, provider.type);

    const url = client.authorizationUrl({
      scope: 'openid email profile',
      state,
      redirect_uri: callbackUrl,
    });

    return { url, state };
  }

  async handleCallback(providerId: string, code: string, state: string, workspaceId: string) {
    const provider = await this.authProvidersRepo.findById(providerId, workspaceId);
    if (!provider || !provider.isEnabled) {
      throw new NotFoundException('SSO provider not found or disabled');
    }

    if (provider.type !== 'oidc' || !provider.oidcIssuer || !provider.oidcClientId || !provider.oidcClientSecret) {
      throw new BadRequestException('Invalid OIDC provider configuration');
    }

    const client = await this.getOrCreateClient(provider);
    const callbackUrl = await this.getCallbackUrl(providerId, workspaceId, provider.type);

    let tokenSet: TokenSet;
    let userInfo: Record<string, any>;

    try {
      tokenSet = await client.callback(
        callbackUrl,
        { code, state },
        { state },
      );

      if (!tokenSet.access_token) {
        throw new Error('No access token received from OIDC server');
      }

      userInfo = await client.userinfo(tokenSet.access_token as string);

      if (!userInfo?.sub) {
        throw new Error('No subject identifier (sub) in user info');
      }

      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!userInfo.email || !emailRegex.test(userInfo.email)) {
        throw new Error('OIDC authentication failed: Invalid or missing email address');
      }
    } catch (error) {
      this.logger.error('OIDC token exchange failed:', (error as Error).message);
      throw new Error(`OIDC authentication failed: ${(error as Error).message}`);
    }

    const user = await this.findOrCreateUser(userInfo, provider, workspaceId);
    const authToken = await this.tokenService.generateAccessToken(user);

    return authToken;
  }

  private async findOrCreateUser(userInfo: any, provider: AuthProviders, workspaceId: string): Promise<User> {
    // Check if user already exists via SSO
    const existingAuthAccount = await this.authAccountsRepo.findByProviderUserId(
      userInfo.sub,
      provider.id as unknown as string,
      workspaceId,
    );

    if (existingAuthAccount) {
      const user = await this.userRepo.findById(existingAuthAccount.userId, workspaceId);
      if (user) {
        return user;
      }
    }

    const userEmail = userInfo.email;
    const userName = userInfo.name || userInfo.preferred_username || 'Unknown User';

    // Check if user exists by email
    let user = await this.userRepo.findByEmail(userEmail, workspaceId);

    if (!user) {
      if (!provider.allowSignup) {
        throw new BadRequestException('Signup via SSO is not allowed');
      }

      user = await this.userRepo.createUser({
        email: userEmail,
        name: userName,
        workspaceId,
        role: UserRole.MEMBER,
      });
    }

    // Link SSO account to user if not already linked
    if (!existingAuthAccount) {
      await this.authAccountsRepo.create({
        userId: user.id,
        authProviderId: provider.id as unknown as string,
        providerUserId: userInfo.sub,
        workspaceId,
      });
    }

    return user;
  }

  private async getOrCreateClient(provider: AuthProviders): Promise<Client> {
    const cacheKey = `${provider.id as unknown as string}:${provider.oidcIssuer}`;

    // Also invalidate cache if client secret changes (by including it in key hash)
    const cachedClient = this.clientCache.get(cacheKey);
    if (cachedClient) {
      return cachedClient;
    }

    const callbackUrl = await this.getCallbackUrl(
      provider.id as unknown as string,
      provider.workspaceId!,
      provider.type,
    );

    const issuer = await Issuer.discover(provider.oidcIssuer!);
    const client = new issuer.Client({
      client_id: provider.oidcClientId!,
      client_secret: provider.oidcClientSecret!,
      redirect_uris: [callbackUrl],
      response_types: ['code'],
    });

    this.clientCache.set(cacheKey, client);
    return client;
  }

  private async getCallbackUrl(providerId: string, workspaceId: string, providerType?: string): Promise<string> {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select('hostname')
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    const hostname = workspace?.hostname;
    const appUrl = this.domainService.getUrl(hostname);

    if (providerType === 'oidc') {
      return `${appUrl}/api/sso/oidc/${providerId}/callback`;
    }
    return `${appUrl}/api/sso/${providerId}/callback`;
  }

  async getWorkspaceById(workspaceId: string): Promise<{ id: string; hostname: string } | undefined> {
    return this.db
      .selectFrom('workspaces')
      .select(['id', 'hostname'])
      .where('id', '=', workspaceId)
      .executeTakeFirst();
  }
}
