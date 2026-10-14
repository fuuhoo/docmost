import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { PageService } from './services/page.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { MovePageDto, MovePageToSpaceDto } from './dto/move-page.dto';
import {
  DeletePageDto,
  PageHistoryIdDto,
  PageIdDto,
  PageInfoDto,
} from './dto/page.dto';
import { PageHistoryService } from './services/page-history.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { User, Workspace } from '@docmost/db/types/entity.types';
import { SidebarPageDto } from './dto/sidebar-page.dto';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { RecentPageDto } from './dto/recent-page.dto';
import { DuplicatePageDto } from './dto/duplicate-page.dto';
import { DeletedPageDto } from './dto/deleted-page.dto';
import { DocumentParserService } from '../document-parser/document-parser.service';
import { AttachmentService } from '../attachment/services/attachment.service';
import { AttachmentType } from '../attachment/attachment.constants';
import { prepareFile } from '../attachment/attachment.utils';
import { htmlToJson, jsonToText, tiptapExtensions } from '../../collaboration/collaboration.util';
import { TiptapTransformer } from '@hocuspocus/transformer';
import * as Y from 'yjs';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import * as bytes from 'bytes';
import { generateSlugId } from '../../common/helpers';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PageController {
  constructor(
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly pageHistoryService: PageHistoryService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly documentParser: DocumentParserService,
    private readonly attachmentService: AttachmentService,
    private readonly environmentService: EnvironmentService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/info')
  async getPage(@Body() dto: PageInfoDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(dto.pageId, {
      includeSpace: true,
      includeContent: true,
      includeCreator: true,
      includeLastUpdatedBy: true,
      includeContributors: true,
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return page;
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() createPageDto: CreatePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(
      user,
      createPageDto.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.pageService.create(user.id, workspace.id, createPageDto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(@Body() updatePageDto: UpdatePageDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(updatePageDto.pageId);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.pageService.update(page, updatePageDto, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() deletePageDto: DeletePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(deletePageDto.pageId);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);

    if (deletePageDto.permanentlyDelete) {
      // Permanent deletion requires space admin permissions
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        throw new ForbiddenException(
          'Only space admins can permanently delete pages',
        );
      }
      await this.pageService.forceDelete(deletePageDto.pageId, workspace.id);
    } else {
      // Soft delete requires page manage permissions
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
      await this.pageService.removePage(
        deletePageDto.pageId,
        user.id,
        workspace.id,
      );
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('restore')
  async restore(
    @Body() pageIdDto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(pageIdDto.pageId);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    await this.pageRepo.restorePage(pageIdDto.pageId, workspace.id);

    return this.pageRepo.findById(pageIdDto.pageId, {
      includeHasChildren: true,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('recent')
  async getRecentPages(
    @Body() recentPageDto: RecentPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    if (recentPageDto.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        recentPageDto.spaceId,
      );

      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      return this.pageService.getRecentSpacePages(
        recentPageDto.spaceId,
        pagination,
      );
    }

    return this.pageService.getRecentPages(user.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('trash')
  async getDeletedPages(
    @Body() deletedPageDto: DeletedPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    if (deletedPageDto.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        deletedPageDto.spaceId,
      );

      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      return this.pageService.getDeletedSpacePages(
        deletedPageDto.spaceId,
        pagination,
      );
    }
  }

  // TODO: scope to workspaces
  @HttpCode(HttpStatus.OK)
  @Post('/history')
  async getPageHistory(
    @Body() dto: PageIdDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.pageHistoryService.findHistoryByPageId(page.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/history/info')
  async getPageHistoryInfo(
    @Body() dto: PageHistoryIdDto,
    @AuthUser() user: User,
  ) {
    const history = await this.pageHistoryService.findById(dto.historyId);
    if (!history) {
      throw new NotFoundException('Page history not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      history.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    return history;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/sidebar-pages')
  async getSidebarPages(
    @Body() dto: SidebarPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    if (!dto.spaceId && !dto.pageId) {
      throw new BadRequestException(
        'Either spaceId or pageId must be provided',
      );
    }
    let spaceId = dto.spaceId;

    if (dto.pageId) {
      const page = await this.pageRepo.findById(dto.pageId);
      if (!page) {
        throw new ForbiddenException();
      }

      spaceId = page.spaceId;
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.pageService.getSidebarPages(spaceId, pagination, dto.pageId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('move-to-space')
  async movePageToSpace(
    @Body() dto: MovePageToSpaceDto,
    @AuthUser() user: User,
  ) {
    const movedPage = await this.pageRepo.findById(dto.pageId);
    if (!movedPage) {
      throw new NotFoundException('Page to move not found');
    }
    if (movedPage.spaceId === dto.spaceId) {
      throw new BadRequestException('Page is already in this space');
    }

    const abilities = await Promise.all([
      this.spaceAbility.createForUser(user, movedPage.spaceId),
      this.spaceAbility.createForUser(user, dto.spaceId),
    ]);

    if (
      abilities.some((ability) =>
        ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
      )
    ) {
      throw new ForbiddenException();
    }

    return this.pageService.movePageToSpace(movedPage, dto.spaceId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('duplicate')
  async duplicatePage(@Body() dto: DuplicatePageDto, @AuthUser() user: User) {
    const copiedPage = await this.pageRepo.findById(dto.pageId);
    if (!copiedPage) {
      throw new NotFoundException('Page to copy not found');
    }

    // If spaceId is provided, it's a copy to different space
    if (dto.spaceId) {
      const abilities = await Promise.all([
        this.spaceAbility.createForUser(user, copiedPage.spaceId),
        this.spaceAbility.createForUser(user, dto.spaceId),
      ]);

      if (
        abilities.some((ability) =>
          ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
        )
      ) {
        throw new ForbiddenException();
      }

      return this.pageService.duplicatePage(copiedPage, dto.spaceId, user);
    } else {
      // If no spaceId, it's a duplicate in same space
      const ability = await this.spaceAbility.createForUser(
        user,
        copiedPage.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      return this.pageService.duplicatePage(copiedPage, undefined, user);
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('move')
  async movePage(@Body() dto: MovePageDto, @AuthUser() user: User) {
    const movedPage = await this.pageRepo.findById(dto.pageId);
    if (!movedPage) {
      throw new NotFoundException('Moved page not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      movedPage.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    return this.pageService.movePage(dto, movedPage);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/breadcrumbs')
  async getPageBreadcrumbs(@Body() dto: PageIdDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
    return this.pageService.getPageBreadCrumbs(page.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create-from-document')
  async createPageFromDocument(
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Body() body: { spaceId?: string; parentPageId?: string; title?: string },
  ) {
    // 1. 获取上传的文件（配置大小限制）
    const maxSizeStr = this.environmentService.getFileUploadSizeLimit() || '50mb';
    const maxFileSize = bytes.parse(maxSizeStr);
    
    let file = null;
    try {
      file = await req.file({
        limits: { fileSize: maxFileSize, fields: 4, files: 1 },
      });
    } catch (err: any) {
      if (err?.statusCode === 413) {
        throw new BadRequestException(
          `File too large. Exceeds the ${maxSizeStr} limit`,
        );
      }
      throw err;
    }
    
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const buffer = await file.toBuffer();
    const filename = file.filename;
    const mimetype = file.mimetype;
    
    // 从 multipart 字段中提取参数
    const spaceId = file.fields?.spaceId?.value as string | undefined;
    const parentPageId = file.fields?.parentPageId?.value as string | undefined;
    const titleField = file.fields?.title?.value as string | undefined;

    // 2. 验证文件类型
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'text/markdown',
      'text/x-markdown',
      'text/plain',
    ];

    if (!allowedTypes.includes(mimetype)) {
      throw new BadRequestException(
        'Only PDF, Word, PowerPoint, and Markdown files are supported',
      );
    }

    // 3. 确定目标空间
    const targetSpaceId = spaceId || workspace.defaultSpaceId;
    if (!targetSpaceId) {
      throw new BadRequestException('No target space specified');
    }

    // 4. 检查权限
    const ability = await this.spaceAbility.createForUser(user, targetSpaceId);
    if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    // 5. 提取标题
    const userTitle = titleField ? String(titleField).trim() : '';
    const title = userTitle || filename || 'Untitled';

    // 6. 先创建页面（内容为空或简单提示）
    const emptyContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '文档加载中...',
            },
          ],
        },
      ],
    };

    const page = await this.pageRepo.insertPage({
      slugId: generateSlugId(),
      title,
      content: emptyContent,
      ydoc: Buffer.from([]), // 临时空 YDoc，稍后更新
      textContent: '文档加载中...',
      creatorId: user.id,
      lastUpdatedById: user.id,
      spaceId: targetSpaceId,
      workspaceId: workspace.id,
      parentPageId: parentPageId || null,
    });

    // 7. 上传原始文件作为附件
    let attachmentId: string | null = null;
    try {
      // 创建一个兼容 Fastify MultipartFile 的对象
      const { Readable } = await import('stream');
      const mockFile = {
        filename,
        mimetype,
        toBuffer: async () => buffer,
        file: {
          pipe: (dest: any) => {
            const readable = Readable.from(buffer);
            return readable.pipe(dest);
          },
          on: (event: string, handler: any) => {
            // No-op for mock
            return this;
          },
        },
      } as any;

      const attachment = await this.attachmentService.uploadFile({
        filePromise: Promise.resolve(mockFile),
        pageId: page.id,
        userId: user.id,
        spaceId: targetSpaceId,
        workspaceId: workspace.id,
      });
      attachmentId = attachment.id;
    } catch (error) {
      // 附件上传失败不影响页面创建，只记录日志
      console.error('Failed to attach original file:', error);
      throw new BadRequestException('Failed to upload file');
    }

    // 8. 更新页面内容为附件引用
    const attachmentContent = {
      type: 'doc',
      content: [
        {
          type: 'attachment',
          attrs: {
            url: `/api/files/${attachmentId}/${filename}`,
            name: filename,
            mime: mimetype,
            size: buffer.length,
            attachmentId: attachmentId,
          },
        },
      ],
    };

    // 生成新的 YDoc
    const ydoc = TiptapTransformer.toYdoc(
      attachmentContent,
      'default',
      tiptapExtensions,
    );
    const ydocBuffer = Buffer.from(Y.encodeStateAsUpdate(ydoc));

    // 更新页面
    await this.pageRepo.updatePage({
      content: attachmentContent,
      ydoc: ydocBuffer,
      textContent: filename,
    }, page.id);

    return {
      pageId: page.id,
      slugId: page.slugId,
      title: page.title,
    };
  }

  /**
   * 从 ProseMirror JSON 中提取第一个 heading 作为标题
   */
  private extractTitle(json: any): string | null {
    const findHeading = (nodes: any[]): string | null => {
      for (const node of nodes) {
        if (node.type === 'heading' && node.attrs?.level === 1) {
          return node.content?.[0]?.text || null;
        }
        if (node.content) {
          const found = findHeading(node.content);
          if (found) return found;
        }
      }
      return null;
    };

    return findHeading(json.content || []);
  }
}
