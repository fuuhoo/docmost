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
    this.logger.log(`getAuthorizationUrl called with providerId: ${providerId}, workspaceId: ${workspaceId}`);
    
    const provider = await this.authProvidersRepo.findById(providerId, workspaceId);
    this.logger.log(`Found provider: ${JSON.stringify(provider)}`);
    
    if (!provider || !provider.isEnabled) {
      this.logger.error('SSO provider not found or disabled');
      throw new NotFoundException('SSO provider not found or disabled');
    }

    if (provider.type !== 'oidc' || !provider.oidcIssuer || !provider.oidcClientId || !provider.oidcClientSecret) {
      this.logger.error('Invalid OIDC provider configuration');
      throw new BadRequestException('Invalid OIDC provider configuration');
    }

    this.logger.log(`Creating client for provider: ${provider.id}`);
    const client = await this.getOrCreateClient(provider);
    this.logger.log(`Created client: ${client.client_id}`);
    // Include workspaceId in state to recover it in callback
    const state = JSON.stringify({
      random: nanoid(),
      workspaceId: workspaceId
    });

    const callbackUrl = await this.getCallbackUrl(providerId, workspaceId, provider.type);
    this.logger.log(`Generated callback URL: ${callbackUrl}`);
    
    // Ensure redirect_uri is properly encoded
    const encodedCallbackUrl = encodeURIComponent(callbackUrl);
    this.logger.log(`Encoded callback URL: ${encodedCallbackUrl}`);
    
    const url = client.authorizationUrl({
      scope: 'openid email profile',
      state,
      redirect_uri: callbackUrl,
    });
    
    this.logger.log(`Generated authorization URL: ${url}`);

    return { url, state };
  }

  async handleCallback(providerId: string, code: string, state: string, workspaceId: string) {
    this.logger.log(`handleCallback called with providerId: ${providerId}, workspaceId: ${workspaceId}`);
    this.logger.log(`Received code: ${code}`);
    this.logger.log(`Received state: ${state}`);
    
    const provider = await this.authProvidersRepo.findById(providerId, workspaceId);
    if (!provider || !provider.isEnabled) {
      this.logger.error('SSO provider not found or disabled');
      throw new NotFoundException('SSO provider not found or disabled');
    }

    if (provider.type !== 'oidc' || !provider.oidcIssuer || !provider.oidcClientId || !provider.oidcClientSecret) {
      this.logger.error('Invalid OIDC provider configuration');
      throw new BadRequestException('Invalid OIDC provider configuration');
    }

    const client = await this.getOrCreateClient(provider);
    this.logger.log(`Created client: ${client.client_id}`);

    const callbackUrl = await this.getCallbackUrl(providerId, workspaceId, provider.type);
    this.logger.log(`Using callback URL for token exchange: ${callbackUrl}`);
    
    // Extract just the random part for OIDC client validation
    let oidcState = state;
    try {
      const stateObj = JSON.parse(state);
      oidcState = stateObj.random;
    } catch (e) {
      // If state is not JSON, use it as-is
      this.logger.warn('State is not JSON format, using as-is for OIDC validation');
    }
    
    this.logger.log(`Using OIDC state for validation: ${oidcState}`);
    
    this.logger.log(`Calling client.callback() with:`);
    this.logger.log(`  callbackUrl: ${callbackUrl}`);
    this.logger.log(`  code: ${code.substring(0, 20)}...`);
    this.logger.log(`  state: ${state}`);
    
    let tokenSet;
    let userInfo;
    
    try {
      tokenSet = await client.callback(
        callbackUrl,
        { code, state },
        { state },
      );
      
      this.logger.log(`Token exchange successful, received token set`);
      this.logger.log(`Token set has access_token: ${!!tokenSet.access_token}`);
      this.logger.log(`Token set has id_token: ${!!tokenSet.id_token}`);
      this.logger.log(`Token set has refresh_token: ${!!tokenSet.refresh_token}`);
      this.logger.log(`Token set expires_at: ${tokenSet.expires_at}`);

      if (!tokenSet.access_token) {
        throw new Error('No access token received from OIDC server');
      }

      this.logger.log(`Calling client.userinfo() with access_token`);
      userInfo = await client.userinfo(tokenSet.access_token as string);
      this.logger.log(`User info received: ${JSON.stringify(userInfo)}`);
      
      if (!userInfo) {
        throw new Error('No user info received from OIDC server');
      }
      
      if (!userInfo.sub) {
        throw new Error('No subject identifier (sub) in user info');
      }
      
      // Log detailed user info fields
      this.logger.log(`User info details:`);
      this.logger.log(`  sub: ${userInfo.sub}`);
      this.logger.log(`  email: ${userInfo.email}`);
      this.logger.log(`  name: ${userInfo.name}`);
      this.logger.log(`  preferred_username: ${userInfo.preferred_username}`);
      this.logger.log(`  given_name: ${userInfo.given_name}`);
      this.logger.log(`  family_name: ${userInfo.family_name}`);
      
    } catch (callbackError) {
      const error = callbackError as Error;
      this.logger.error('Error in OIDC token exchange or user info request:', error);
      this.logger.error('Error stack:', error.stack);
      throw new Error(`OIDC authentication failed: ${error.message}`);
    }

    this.logger.log(`Calling findOrCreateUser with userInfo`);
    let user = await this.findOrCreateUser(userInfo, provider, workspaceId);
    this.logger.log(`User found or created: ${user.id}`);
    this.logger.log(`User details: ${JSON.stringify(user)}`);
    
    const authToken = await this.tokenService.generateAccessToken(user);
    this.logger.log(`Auth token generated successfully`);

    return authToken;
  }

  private async findOrCreateUser(userInfo: any, provider: AuthProviders, workspaceId: string): Promise<User> {
    this.logger.log(`findOrCreateUser called with userInfo: ${JSON.stringify(userInfo)}`);
    
    // Check if user already exists via SSO
    const existingAuthAccount = await this.authAccountsRepo.findByProviderUserId(
      userInfo.sub || '',
      provider.id as unknown as string,
      workspaceId,
    );

    this.logger.log(`Existing auth account: ${JSON.stringify(existingAuthAccount)}`);

    if (existingAuthAccount) {
      const user = await this.userRepo.findById(existingAuthAccount.userId, workspaceId);
      this.logger.log(`Found existing user by auth account: ${JSON.stringify(user)}`);
      if (user) {
        return user;
      }
    }

    // Use sub (phone number) as email if email is not provided
    const userEmail = userInfo.email || userInfo.sub || '';
    const userName = userInfo.name || userInfo.sub || userInfo.preferred_username || 'Unknown User';

    this.logger.log(`User email: ${userEmail}, User name: ${userName}`);

    // Check if user exists by email
    let user = await this.userRepo.findByEmail(userEmail, workspaceId);
    this.logger.log(`Found user by email: ${JSON.stringify(user)}`);

    if (!user) {
      if (!provider.allowSignup) {
        throw new BadRequestException('Signup via SSO is not allowed');
      }

      // Create new user with default values
      this.logger.log(`Creating new user with email: ${userEmail}, name: ${userName}`);
      user = await this.userRepo.createUser({
        email: userEmail,
        name: userName,
        workspaceId,
        role: UserRole.MEMBER, // Default role
      });
      this.logger.log(`Created new user: ${JSON.stringify(user)}`);
    }

    // Link SSO account to user if not already linked
    if (!existingAuthAccount) {
      this.logger.log(`Linking SSO account to user ${user.id}`);
      await this.authAccountsRepo.create({
        userId: user.id,
        authProviderId: provider.id as unknown as string,
        providerUserId: userInfo.sub || '',
        workspaceId,
      });
      this.logger.log(`SSO account linked successfully`);
    }

    return user;
  }

  private async getOrCreateClient(provider: AuthProviders): Promise<Client> {
    const cacheKey = `${provider.id as unknown as string}:${provider.oidcIssuer}:${this.environmentService.getAppUrl()}`;

    if (this.clientCache.has(cacheKey)) {
      return this.clientCache.get(cacheKey) as Client;
    }

    const callbackUrl = await this.getCallbackUrl(provider.id as unknown as string, provider.workspaceId!, provider.type);
    this.logger.log(`Generated callback URL: ${callbackUrl}`);
    
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
    const workspace = await this.db.selectFrom('workspaces').select('hostname').where('id', '=', workspaceId).executeTakeFirst();
    const hostname = workspace?.hostname;
    const appUrl = this.domainService.getUrl(hostname);
    this.logger.log(`Domain service returned app URL: ${appUrl}`);
    
    // For OIDC providers, include /oidc in the callback URL
    let callbackUrl: string;
    if (providerType === 'oidc') {
      callbackUrl = `${appUrl}/api/sso/oidc/${providerId}/callback`;
    } else {
      callbackUrl = `${appUrl}/api/sso/${providerId}/callback`;
    }
    
    this.logger.log(`Generated callback URL: ${callbackUrl}`);
    return callbackUrl;
  }

  async getWorkspaceById(workspaceId: string): Promise<{ id: string; hostname: string } | undefined> {
    const workspace = await this.db.selectFrom('workspaces')
      .select(['id', 'hostname'])
      .where('id', '=', workspaceId)
      .executeTakeFirst();
    return workspace;
  }
}
