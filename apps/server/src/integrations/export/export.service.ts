import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { jsonToHtml, jsonToNode } from '../../collaboration/collaboration.util';
import { ExportFormat } from './dto/export-dto';
import { Page } from '@docmost/db/types/entity.types';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import * as JSZip from 'jszip';
import { StorageService } from '../storage/storage.service';
import {
  buildTree,
  computeLocalPath,
  getExportExtension,
  getPageTitle,
  PageExportTree,
  replaceInternalLinks,
  updateAttachmentUrlsToLocalPaths,
} from './utils';
import {
  ExportMetadata,
  ExportPageMetadata,
} from '../../common/helpers/types/export-metadata.types';
import { PageRepo } from '@docmost/db/repos/page/page.repo';
import { Node } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';
// eslint-disable-next-line @typescript-eslint/no-require-imports
import slugify = require('@sindresorhus/slugify');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('../../../package.json');
import { EnvironmentService } from '../environment/environment.service';
import {
  getAttachmentIds,
  getProsemirrorContent,
} from '../../common/helpers/prosemirror/utils';
import { htmlToMarkdown } from '@docmost/editor-ext';
import { DocxExporter } from './converters/docx.converter';
import { PdfExporter } from './converters/pdf.converter';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);
  private readonly docxExporter = new DocxExporter();
  private readonly pdfExporter = new PdfExporter();

  constructor(
    private readonly pageRepo: PageRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly storageService: StorageService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async exportPage(format: string, page: Page, singlePage?: boolean) {
    const titleNode = {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: getPageTitle(page.title) }],
    };

    let prosemirrorJson: any;

    if (singlePage) {
      prosemirrorJson = await this.turnPageMentionsToLinks(
        getProsemirrorContent(page.content),
        page.workspaceId,
      );
    } else {
      // mentions is already turned to links during the zip process
      prosemirrorJson = getProsemirrorContent(page.content);
    }

    if (page.title) {
      prosemirrorJson.content.unshift(titleNode);
    }

    const pageHtml = jsonToHtml(prosemirrorJson);

    if (format === ExportFormat.HTML) {
      return `<!DOCTYPE html>
      <html>
        <head>
         <title>${getPageTitle(page.title)}</title>
        </head>
        <body>${pageHtml}</body>
      </html>`;
    }

    if (format === ExportFormat.Markdown) {
      const newPageHtml = pageHtml.replace(
        /<colgroup[^>]*>[\s\S]*?<\/colgroup>/gim,
        '',
      );
      return htmlToMarkdown(newPageHtml);
    }

    if (format === ExportFormat.DOCX) {
      const jsonWithEmbeddedImages = await this.embedAttachmentsAsBase64(
        prosemirrorJson,
        page.spaceId,
      );
      return this.docxExporter.exportToDocx(
        jsonWithEmbeddedImages,
        getPageTitle(page.title),
      );
    }

    if (format === ExportFormat.PDF) {
      return this.pdfExporter.exportToPdf(
        prosemirrorJson,
        getPageTitle(page.title),
      );
    }

    return;
  }

  async exportPageAsBuffer(
    pageId: string,
    format: ExportFormat,
    includeAttachments?: boolean,
  ): Promise<{ buffer: Buffer; fileName: string }> {
    const page = await this.pageRepo.findById(pageId, {
      includeContent: true,
    });

    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    let prosemirrorJson = await this.turnPageMentionsToLinks(
      getProsemirrorContent(page.content),
      page.workspaceId,
    );

    if (includeAttachments) {
      const attachmentIds = getAttachmentIds(prosemirrorJson);
      if (attachmentIds.length > 0) {
        this.logger.warn(
          'Attachments cannot be embedded into single DOCX/PDF exports yet. They will remain as links.',
        );
      }
    }

    const buffer = await this.exportPage(
      format,
      { ...page, content: prosemirrorJson },
      true,
    );

    if (!Buffer.isBuffer(buffer)) {
      throw new BadRequestException(
        'Invalid export format for direct file export',
      );
    }

    const extension = getExportExtension(format);
    const fileName = `${getPageTitle(page.title)}${extension}`;

    return { buffer, fileName };
  }

  async exportPages(
    pageId: string,
    format: string,
    includeAttachments: boolean,
    includeChildren: boolean,
  ) {
    let pages: Page[];

    if (includeChildren) {
      //@ts-ignore
      pages = await this.pageRepo.getPageAndDescendants(pageId, {
        includeContent: true,
      });
    } else {
      // Only fetch the single page when includeChildren is false
      const page = await this.pageRepo.findById(pageId, {
        includeContent: true,
      });
      if (page) {
        pages = [page];
      }
    }

    if (!pages || pages.length === 0) {
      throw new BadRequestException('No pages to export');
    }

    const parentPageIndex = pages.findIndex((obj) => obj.id === pageId);
    // set to null to make export of pages with parentId work
    pages[parentPageIndex].parentPageId = null;

    const tree = buildTree(pages as Page[]);

    const zip = new JSZip();
    await this.zipPages(tree, format, zip, includeAttachments);

    const zipFile = zip.generateNodeStream({
      type: 'nodebuffer',
      streamFiles: true,
      compression: 'DEFLATE',
    });

    return zipFile;
  }

  async exportSpace(
    spaceId: string,
    format: string,
    includeAttachments: boolean,
  ) {
    const space = await this.db
      .selectFrom('spaces')
      .selectAll()
      .where('id', '=', spaceId)
      .executeTakeFirst();

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    const pages = await this.db
      .selectFrom('pages')
      .select([
        'pages.id',
        'pages.slugId',
        'pages.title',
        'pages.icon',
        'pages.position',
        'pages.content',
        'pages.parentPageId',
        'pages.spaceId',
        'pages.workspaceId',
        'pages.createdAt',
        'pages.updatedAt',
      ])
      .where('spaceId', '=', spaceId)
      .where('deletedAt', 'is', null)
      .execute();

    const tree = buildTree(pages as Page[]);

    const zip = new JSZip();

    await this.zipPages(tree, format, zip, includeAttachments);

    const zipFile = zip.generateNodeStream({
      type: 'nodebuffer',
      streamFiles: true,
      compression: 'DEFLATE',
    });

    const fileName = `${space.name}-space-export.zip`;
    return {
      fileStream: zipFile,
      fileName,
    };
  }

  async zipPages(
    tree: PageExportTree,
    format: string,
    zip: JSZip,
    includeAttachments: boolean,
  ): Promise<void> {
    const slugIdToPath: Record<string, string> = {};
    const pageIdToFilePath: Record<string, string> = {};
    const pagesMetadata: Record<string, ExportPageMetadata> = {};

    computeLocalPath(tree, format, null, '', slugIdToPath);

    const stack: { folder: JSZip; parentPageId: string | null }[] = [
      { folder: zip, parentPageId: null },
    ];

    while (stack.length > 0) {
      const { folder, parentPageId } = stack.pop();
      const children = tree[parentPageId] || [];

      for (const page of children) {
        const childPages = tree[page.id] || [];

        const prosemirrorJson = await this.turnPageMentionsToLinks(
          getProsemirrorContent(page.content),
          page.workspaceId,
        );

        const currentPagePath = slugIdToPath[page.slugId];

        let updatedJsonContent = replaceInternalLinks(
          prosemirrorJson,
          slugIdToPath,
          currentPagePath,
        );

        if (includeAttachments) {
          await this.zipAttachments(updatedJsonContent, page.spaceId, folder);
          updatedJsonContent =
            updateAttachmentUrlsToLocalPaths(updatedJsonContent);
        }

        const pageTitle = getPageTitle(page.title);
        const pageExportContent = await this.exportPage(format, {
          ...page,
          content: updatedJsonContent,
        });

        folder.file(
          `${pageTitle}${getExportExtension(format)}`,
          pageExportContent,
        );

        pageIdToFilePath[page.id] = currentPagePath;

        const parentPath = parentPageId ? pageIdToFilePath[parentPageId] : null;
        pagesMetadata[currentPagePath] = {
          pageId: page.id,
          slugId: page.slugId,
          icon: page.icon ?? null,
          position: page.position,
          parentPath,
          createdAt: page.createdAt?.toISOString() ?? new Date().toISOString(),
          updatedAt: page.updatedAt?.toISOString() ?? new Date().toISOString(),
        };

        if (childPages.length > 0) {
          const pageFolder = folder.folder(pageTitle);
          stack.push({ folder: pageFolder, parentPageId: page.id });
        }
      }
    }

    const metadata: ExportMetadata = {
      exportedAt: new Date().toISOString(),
      source: 'docmost',
      version: packageJson.version,
      pages: pagesMetadata,
    };

    zip.file('docmost-metadata.json', JSON.stringify(metadata, null, 2));
  }

  private async embedAttachmentsAsBase64(
    prosemirrorJson: any,
    spaceId: string,
  ): Promise<any> {
    if (!prosemirrorJson?.content || prosemirrorJson.content.length === 0) {
      return prosemirrorJson;
    }

    const attachmentIds = new Set<string>();
    this.collectAttachmentIds(prosemirrorJson, attachmentIds);

    if (attachmentIds.size === 0) {
      return prosemirrorJson;
    }

    const attachments = await this.db
      .selectFrom('attachments')
      .select(['id', 'filePath', 'mimeType', 'fileName'])
      .where('id', 'in', Array.from(attachmentIds))
      .where('spaceId', '=', spaceId)
      .execute();

    const attachmentMap = new Map<
      string,
      { filePath: string; mimeType: string; fileName: string }
    >();
    for (const attachment of attachments) {
      attachmentMap.set(attachment.id, attachment);
    }

    const cloned = JSON.parse(JSON.stringify(prosemirrorJson));
    await this.replaceAttachmentSrcWithBase64(cloned, attachmentMap);
    return cloned;
  }

  private extractAttachmentIdFromSrc(src: string): string | null {
    if (!src) return null;
    const match = src.match(/\/api\/files\/([0-9a-fA-F-]{36})\//);
    return match?.[1] || null;
  }

  private collectAttachmentIds(block: any, ids: Set<string>) {
    if (!block) return;

      if (['image', 'excalidraw', 'drawio', 'kityminder', 'embed'].includes(block.type)) {
        let attachmentId: string | null = null;
        if (block.type === 'kityminder') {
          // For kityminder, src is the preview image attachment, while
          // attachmentId points to the JSON data file. Use the preview for export.
          attachmentId = this.extractAttachmentIdFromSrc(block.attrs?.src) || block.attrs?.attachmentId;
          this.logger.debug(`[KityMinder export] collectAttachmentId: src=${block.attrs?.src?.substring(0, 120)}, extractedAttachmentId=${attachmentId}`);
        } else {
          attachmentId = block.attrs?.attachmentId || this.extractAttachmentIdFromSrc(block.attrs?.src);
        }
        if (attachmentId && this.isValidUUID(attachmentId) && !ids.has(attachmentId)) {
          ids.add(attachmentId);
        }
      }

    if (Array.isArray(block.content)) {
      for (const child of block.content) {
        this.collectAttachmentIds(child, ids);
      }
    }
  }

  private async replaceAttachmentSrcWithBase64(
    block: any,
    attachmentMap: Map<string, { filePath: string; mimeType: string; fileName: string }>,
  ) {
    if (!block) return;

      if (['image', 'excalidraw', 'drawio', 'kityminder', 'embed'].includes(block.type)) {
        let attachmentId: string | null = null;
        if (block.type === 'kityminder') {
          // For kityminder, src is the preview image attachment, while
          // attachmentId points to the JSON data file. Use the preview for export.
          attachmentId = this.extractAttachmentIdFromSrc(block.attrs?.src) || block.attrs?.attachmentId;
          this.logger.debug(`[KityMinder export] replaceAttachmentSrc: src=${block.attrs?.src?.substring(0, 120)}, extractedAttachmentId=${attachmentId}`);
        } else {
          attachmentId = block.attrs?.attachmentId || this.extractAttachmentIdFromSrc(block.attrs?.src);
        }
        if (attachmentId && attachmentMap.has(attachmentId)) {
          const attachment = attachmentMap.get(attachmentId);
          try {
            const fileBuffer = await this.storageService.read(attachment.filePath);
            const mimeType = attachment.mimeType || this.guessMimeType(attachment.fileName);
            const base64 = fileBuffer.toString('base64');
            const oldSrc = block.attrs.src;
            block.attrs.src = `data:${mimeType};base64,${base64}`;
            block.attrs.attachmentId = attachmentId;
            this.logger.debug(`[KityMinder export] Embedded attachment ${attachmentId} as base64 for ${block.type}: mimeType=${mimeType}, oldSrc=${oldSrc?.substring(0, 80)}, newSrc=${block.attrs.src?.substring(0, 120)}`);
          } catch (err) {
            this.logger.error(`[KityMinder export] Failed to read attachment ${attachmentId}:`, err);
          }
        } else if (attachmentId) {
          this.logger.warn(`[KityMinder export] Attachment ${attachmentId} not found for ${block.type}`);
        } else {
          this.logger.debug(`[KityMinder export] No attachmentId for ${block.type}, src: ${block.attrs?.src}`);
        }
      }

    if (Array.isArray(block.content)) {
      for (const child of block.content) {
        await this.replaceAttachmentSrcWithBase64(child, attachmentMap);
      }
    }
  }

  private isValidUUID(id: string): boolean {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/i.test(id);
  }

  private guessMimeType(fileName: string): string {
    if (!fileName) return 'image/png';
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'gif':
        return 'image/gif';
      case 'bmp':
        return 'image/bmp';
      case 'svg':
      case 'svgz':
        return 'image/svg+xml';
      default:
        return 'image/png';
    }
  }

  async zipAttachments(prosemirrorJson: any, spaceId: string, zip: JSZip) {
    const attachmentIds = getAttachmentIds(prosemirrorJson);

    if (attachmentIds.length > 0) {
      const attachments = await this.db
        .selectFrom('attachments')
        .selectAll()
        .where('id', 'in', attachmentIds)
        .where('spaceId', '=', spaceId)
        .execute();

      await Promise.all(
        attachments.map(async (attachment) => {
          try {
            const fileBuffer = await this.storageService.read(
              attachment.filePath,
            );
            const filePath = `/files/${attachment.id}/${attachment.fileName}`;
            zip.file(filePath, fileBuffer);
          } catch (err) {
            this.logger.debug(`Attachment export error ${attachment.id}`, err);
          }
        }),
      );
    }
  }

  async turnPageMentionsToLinks(prosemirrorJson: any, workspaceId: string) {
    const doc = jsonToNode(prosemirrorJson);

    const pageMentionIds = [];

    doc.descendants((node: Node) => {
      if (node.type.name === 'mention' && node.attrs.entityType === 'page') {
        if (node.attrs.entityId) {
          pageMentionIds.push(node.attrs.entityId);
        }
      }
    });

    if (pageMentionIds.length < 1) {
      return prosemirrorJson;
    }

    const pages = await this.db
      .selectFrom('pages')
      .select(['id', 'slugId', 'title', 'creatorId', 'spaceId', 'workspaceId'])
      .select((eb) => this.pageRepo.withSpace(eb))
      .where('id', 'in', pageMentionIds)
      .where('workspaceId', '=', workspaceId)
      .execute();

    const pageMap = new Map(pages.map((page) => [page.id, page]));

    let editorState = EditorState.create({
      doc: doc,
    });

    const transaction = editorState.tr;

    let offset = 0;

    /**
     * Helper function to replace a mention node with a link node.
     */
    const replaceMentionWithLink = (
      node: Node,
      pos: number,
      title: string,
      slugId: string,
      spaceSlug: string,
    ) => {
      const linkTitle = title || 'untitled';
      const truncatedTitle = linkTitle?.substring(0, 70);
      const pageSlug = `${slugify(truncatedTitle)}-${slugId}`;

      // Create the link URL
      const link = `${this.environmentService.getAppUrl()}/s/${spaceSlug}/p/${pageSlug}`;

      // Create a link mark and a text node with that mark
      const linkMark = editorState.schema.marks.link.create({ href: link });
      const linkTextNode = editorState.schema.text(linkTitle, [linkMark]);

      // Calculate positions (adjusted by the current offset)
      const from = pos + offset;
      const to = pos + offset + node.nodeSize;

      // Replace the node in the transaction and update the offset
      transaction.replaceWith(from, to, linkTextNode);
      offset += linkTextNode.nodeSize - node.nodeSize;
    };

    // find and convert page mentions to links
    editorState.doc.descendants((node: Node, pos: number) => {
      // Check if the node is a page mention
      if (node.type.name === 'mention' && node.attrs.entityType === 'page') {
        const { entityId: pageId, slugId, label } = node.attrs;
        const page = pageMap.get(pageId);

        if (page) {
          replaceMentionWithLink(
            node,
            pos,
            page.title,
            page.slugId,
            page.space.slug,
          );
        } else {
          // if page is not found, default to the node label and slugId
          replaceMentionWithLink(node, pos, label, slugId, 'undefined');
        }
      }
    });

    if (transaction.docChanged) {
      editorState = editorState.apply(transaction);
    }

    const updatedDoc = editorState.doc;

    return updatedDoc.toJSON();
  }
}

