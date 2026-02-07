import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { WorkspaceService } from '../../workspace/services/workspace.service';
import { CreateWorkspaceDto } from '../../workspace/dto/create-workspace.dto';
import { CreateAdminUserDto } from '../dto/create-admin-user.dto';
import { UserRepo } from '@docmost/db/repos/user/user.repo';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { GroupRepo } from '@docmost/db/repos/group/group.repo';
import { SpaceService } from '../../space/services/space.service';
import { SpaceMemberService } from '../../space/services/space-member.service';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { executeTx } from '@docmost/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { GroupUserRepo } from '@docmost/db/repos/group/group-user.repo';
import { UserRole, SpaceRole } from '../../../common/helpers/types/permission';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { CreateSpaceDto } from '../../space/dto/create-space.dto';

@Injectable()
export class SignupService {
  constructor(
    private userRepo: UserRepo,
    private workspaceService: WorkspaceService,
    private workspaceRepo: WorkspaceRepo,
    private groupRepo: GroupRepo,
    private groupUserRepo: GroupUserRepo,
    private spaceService: SpaceService,
    private spaceMemberService: SpaceMemberService,
    private environmentService: EnvironmentService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  private validateEmailDomain(email: string): void {
    const allowedDomains = this.environmentService.getEmailAllowedDomains();
    if (allowedDomains.length > 0) {
      const emailDomain = email.split('@')[1];
      if (!allowedDomains.includes(emailDomain)) {
        throw new BadRequestException(
          'Your email domain is not allowed to register. Please contact your administrator.',
        );
      }
    }
  }

  async signup(
    createUserDto: CreateUserDto,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<User> {
    // Validate email domain
    this.validateEmailDomain(createUserDto.email);

    // Validate workspace exists
    const workspace = await this.db.selectFrom('workspaces').select(['id']).where('id', '=', workspaceId).executeTakeFirst();
    if (!workspace) {
      throw new BadRequestException('Workspace not found');
    }

    const userCheck = await this.userRepo.findByEmail(
      createUserDto.email,
      workspaceId,
    );

    if (userCheck) {
      throw new BadRequestException(
        'An account with this email already exists in this workspace',
      );
    }

    return await executeTx(
      this.db,
      async (trx) => {
        // create user
        const user = await this.userRepo.insertUser(
          {
            ...createUserDto,
            workspaceId: workspaceId,
            role: UserRole.ADMIN,
          },
          trx,
        );

        // add user to workspace
        await this.workspaceService.addUserToWorkspace(
          user.id,
          workspaceId,
          undefined,
          trx,
        );

        // add user to default group
        await this.groupUserRepo.addUserToDefaultGroup(
          user.id,
          workspaceId,
          trx,
        );
        return user;
      },
      trx,
    );
  }

  async initialSetup(
    createAdminUserDto: CreateAdminUserDto,
    trx?: KyselyTransaction,
  ) {
    // Validate email domain
    this.validateEmailDomain(createAdminUserDto.email);

    let user: User,
      workspace: Workspace = null;

    await executeTx(
      this.db,
      async (trx) => {
        // create workspace first
        const workspaceData: CreateWorkspaceDto = {
          name: createAdminUserDto.workspaceName || 'My workspace',
          hostname: createAdminUserDto.hostname,
        };

        // Create workspace without user (will be added later)
        workspace = await this.workspaceRepo.insertWorkspace(
          {
            name: workspaceData.name,
            hostname: workspaceData.hostname,
          },
          trx,
        );

        // create user with workspaceId
        user = await this.userRepo.insertUser(
          {
            name: createAdminUserDto.name,
            email: createAdminUserDto.email,
            password: createAdminUserDto.password,
            role: UserRole.OWNER,
            workspaceId: workspace.id,
            emailVerifiedAt: new Date(),
          },
          trx,
        );

        // create default group
        const group = await this.groupRepo.createDefaultGroup(workspace.id, {
          userId: user.id,
          trx: trx,
        });

        // add user to default group
        await this.groupUserRepo.insertGroupUser(
          {
            userId: user.id,
            groupId: group.id,
          },
          trx,
        );

        // create default space
        const spaceInfo: CreateSpaceDto = {
          name: 'General',
          slug: 'general',
        };

        const createdSpace = await this.spaceService.create(
          user.id,
          workspace.id,
          spaceInfo,
          trx,
        );

        // and add user to space as owner
        await this.spaceMemberService.addUserToSpace(
          user.id,
          createdSpace.id,
          SpaceRole.ADMIN,
          workspace.id,
          trx,
        );

        // add default group to space as writer
        await this.spaceMemberService.addGroupToSpace(
          group.id,
          createdSpace.id,
          SpaceRole.WRITER,
          workspace.id,
          trx,
        );

        // update default spaceId
        await this.workspaceRepo.updateWorkspace(
          {
            defaultSpaceId: createdSpace.id,
          },
          workspace.id,
          trx,
        );

        return user;
      },
      trx,
    );

    return { user, workspace };
  }
}
