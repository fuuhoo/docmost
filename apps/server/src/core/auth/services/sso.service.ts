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
import { JwtOidcSignupPayload } from '../dto/jwt-payload';
import { DomainService } from '../../../integrations/environment/domain.service';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { User } from '@docmost/db/types/entity.types';
import { nanoid } from 'nanoid';
import { UserRole } from '../../../common/helpers/types/permission';

type SsoCallbackResult =
  | { type: 'login'; authToken: string }
  | { type: 'signup'; signupToken: string; email: string };

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

  async handleCallback(providerId: string, code: string, state: string, workspaceId: string): Promise<SsoCallbackResult> {
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

    return this.resolveUser(userInfo, provider, workspaceId);
  }

  private async resolveUser(userInfo: any, provider: AuthProviders, workspaceId: string): Promise<SsoCallbackResult> {
    const providerId = provider.id as unknown as string;

    // Check if user already exists via SSO
    const existingAuthAccount = await this.authAccountsRepo.findByProviderUserId(
      userInfo.sub,
      providerId,
      workspaceId,
    );

    if (existingAuthAccount) {
      const user = await this.userRepo.findById(existingAuthAccount.userId, workspaceId);
      if (user) {
        const authToken = await this.tokenService.generateAccessToken(user);
        return { type: 'login', authToken };
      }
    }

    const userEmail = userInfo.email;

    // Check if user exists by email
    let user = await this.userRepo.findByEmail(userEmail, workspaceId);

    if (user) {
      // Link SSO account to existing user
      await this.authAccountsRepo.create({
        userId: user.id,
        authProviderId: providerId,
        providerUserId: userInfo.sub,
        workspaceId,
      });
      const authToken = await this.tokenService.generateAccessToken(user);
      return { type: 'login', authToken };
    }

    if (!provider.allowSignup) {
      throw new BadRequestException('Signup via SSO is not allowed');
    }

    const usableName = this.getUsableName(userInfo);

    if (usableName) {
      user = await this.userRepo.createUser({
        email: userEmail,
        name: usableName,
        workspaceId,
        role: UserRole.MEMBER,
      });

      await this.authAccountsRepo.create({
        userId: user.id,
        authProviderId: providerId,
        providerUserId: userInfo.sub,
        workspaceId,
      });

      const authToken = await this.tokenService.generateAccessToken(user);
      return { type: 'login', authToken };
    }

    // No usable name from OIDC - require frontend signup flow
    const signupToken = await this.tokenService.generateOidcSignupToken({
      providerUserId: userInfo.sub,
      email: userEmail,
      workspaceId,
      providerId,
    });

    return { type: 'signup', signupToken, email: userEmail };
  }

  async completeSignup(signupToken: string, name: string): Promise<User> {
    const payload = await this.tokenService.verifyOidcSignupToken(signupToken);
    const provider = await this.authProvidersRepo.findById(
      payload.providerId,
      payload.workspaceId,
    );

    if (!provider || !provider.isEnabled) {
      throw new NotFoundException('SSO provider not found or disabled');
    }

    if (provider.type !== 'oidc' || !provider.oidcIssuer || !provider.oidcClientId || !provider.oidcClientSecret) {
      throw new BadRequestException('Invalid OIDC provider configuration');
    }

    if (!provider.allowSignup) {
      throw new BadRequestException('Signup via SSO is not allowed');
    }

    const providerId = provider.id as unknown as string;

    // User may have been created in another session while the token was valid
    let user = await this.userRepo.findByEmail(payload.email, payload.workspaceId);

    if (!user) {
      user = await this.userRepo.createUser({
        email: payload.email,
        name,
        workspaceId: payload.workspaceId,
        role: UserRole.MEMBER,
      });
    }

    const existingAuthAccount = await this.authAccountsRepo.findByProviderUserId(
      payload.sub,
      providerId,
      payload.workspaceId,
    );

    if (!existingAuthAccount) {
      await this.authAccountsRepo.create({
        userId: user.id,
        authProviderId: providerId,
        providerUserId: payload.sub,
        workspaceId: payload.workspaceId,
      });
    }

    return user;
  }

  private getUsableName(userInfo: any): string | undefined {
    const name = userInfo.name || userInfo.preferred_username || userInfo.nickname;
    const trimmed = typeof name === 'string' ? name.trim() : '';
    return trimmed.length > 0 ? trimmed.slice(0, 50) : undefined;
  }

  async getSignupTokenPayload(token: string): Promise<JwtOidcSignupPayload> {
    return this.tokenService.verifyOidcSignupToken(token);
  }

  async generateAccessTokenForUser(user: User): Promise<string> {
    return this.tokenService.generateAccessToken(user);
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

    // In development, allow overriding the frontend URL for OAuth callbacks
    // so that the provider can redirect back to the client dev server while
    // the backend still runs on its own port. FRONTEND_URL should be set to
    // e.g. http://127.0.0.1:5173 in development.
    let appUrl: string;
    const frontendUrl = this.environmentService.getFrontendUrl?.();
    if (this.environmentService.isDevelopment() && frontendUrl) {
      appUrl = frontendUrl;
    } else {
      appUrl = this.domainService.getUrl(hostname);
    }

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
