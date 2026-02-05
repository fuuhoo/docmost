import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../../integrations/environment/environment.service';

@Injectable()
export class SetupGuard implements CanActivate {
  constructor(
    private workspaceRepo: WorkspaceRepo,
    private environmentService: EnvironmentService,
  ) {}

  async canActivate(): Promise<boolean> {
    if (this.environmentService.isCloud()) {
      return false;
    }

    return true;
  }
}
