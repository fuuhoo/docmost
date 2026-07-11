import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  HeadingLevel,
  UnderlineType,
  BorderStyle,
} from 'docx';
import { Logger } from '@nestjs/common';
import * as sharp from 'sharp';

/**
 * Convert ProseMirror JSON to DOCX format
 */
export class DocxExporter {
  private readonly logger = new Logger(DocxExporter.name);

  /**
   * Export ProseMirror JSON to DOCX document
   */
  async exportToDocx(prosemirrorJson: any, title?: string): Promise<Buffer> {
    try {
      const sections = await this.createDocumentSections(
        prosemirrorJson,
        title,
      );

      const doc = new Document({
        sections: [
          {
            children: sections,
          },
        ],
        numbering: {
          config: [
            {
              reference: 'my-numbering',
              levels: [
                {
                  level: 0,
                  format: 'decimal',
                  text: '%1.',
                  alignment: AlignmentType.LEFT,
                },
              ],
            },
          ],
        },
      });

      return new Promise((resolve, reject) => {
        Packer.toBuffer(doc).then((buffer) => {
          resolve(buffer);
        }).catch((error) => {
          this.logger.error('Error packing DOCX:', error);
          reject(error);
        });
      });
    } catch (error) {
      this.logger.error('Error exporting to DOCX:', error);
      throw error;
    }
  }

  private async createDocumentSections(
    prosemirrorJson: any,
    title?: string,
  ): Promise<(Paragraph | Table)[]> {
    const sections: (Paragraph | Table)[] = [];

    // Add title if provided
    if (title) {
      sections.push(
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
          thematicBreak: false,
        }),
      );
    }

    // Process content blocks
    if (prosemirrorJson.content) {
      for (const block of prosemirrorJson.content) {
        const blockElements = await this.processBlock(block);
        sections.push(...blockElements);
      }
    }

    return sections;
  }

  private async processBlock(block: any): Promise<(Paragraph | Table)[]> {
    const paragraphs: (Paragraph | Table)[] = [];

    switch (block.type) {
      case 'heading':
        paragraphs.push(await this.createHeading(block));
        break;

      case 'paragraph':
        paragraphs.push(await this.createParagraph(block));
        break;

      case 'bulletList':
        paragraphs.push(...(await this.createBulletList(block)));
        break;

      case 'orderedList':
        paragraphs.push(...(await this.createOrderedList(block)));
        break;

      case 'taskList':
        paragraphs.push(...(await this.createTaskList(block)));
        break;

      case 'codeBlock':
        paragraphs.push(...(await this.createCodeBlock(block)));
        break;

      case 'blockquote':
        paragraphs.push(await this.createBlockquote(block));
        break;

      case 'callout':
        paragraphs.push(...(await this.createCallout(block)));
        break;

      case 'details':
        paragraphs.push(...(await this.createDetails(block)));
        break;

      case 'horizontalRule':
        paragraphs.push(
          new Paragraph({
            border: {
              bottom: {
                color: 'cccccc',
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
              },
            },
            spacing: { after: 200 },
          }),
        );
        break;

      case 'mathBlock':
        paragraphs.push(...(await this.createMathBlock(block)));
        break;

      case 'attachment':
        paragraphs.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: `📎 ${block.attrs?.name || block.attrs?.attachmentId || 'attachment'}`,
                italics: true,
              }),
            ],
          }),
        );
        break;

      case 'video':
        paragraphs.push(
          new Paragraph({
            spacing: { after: 100 },
            children: [
              new TextRun({
                text: `🎬 ${block.attrs?.src || block.attrs?.placeholder?.name || 'video'}`,
                italics: true,
              }),
            ],
          }),
        );
        break;

      case 'table':
        paragraphs.push(...(await this.createTable(block)));
        break;

      case 'image':
      case 'excalidraw':
      case 'drawio':
      case 'kityminder':
      case 'embed':
        paragraphs.push(...(await this.createEmbeddedImage(block)));
        break;

      case 'listItem':
      case 'taskItem':
        // ListItems and taskItems are processed within their parent list
        break;

      default:
        if (block.content) {
          paragraphs.push(await this.createParagraph(block));
        }
    }

    return paragraphs;
  }

  private async createHeading(block: any): Promise<Paragraph> {
    const level = block.attrs?.level || 1;
    const runs = await this.createTextRuns(block.content || []);

    const headingLevels: { [key: number]: (typeof HeadingLevel)[keyof typeof HeadingLevel] } = {
      1: HeadingLevel.HEADING_1,
      2: HeadingLevel.HEADING_2,
      3: HeadingLevel.HEADING_3,
      4: HeadingLevel.HEADING_4,
      5: HeadingLevel.HEADING_5,
      6: HeadingLevel.HEADING_6,
    };

    return new Paragraph({
      heading: headingLevels[level] || HeadingLevel.HEADING_1,
      spacing: { after: 200 },
      children: runs.length > 0 ? runs : [new TextRun('')],
    });
  }

  private async createParagraph(block: any): Promise<Paragraph> {
    const runs = await this.createTextRuns(block.content || []);

    return new Paragraph({
      spacing: { line: 240, after: 100 },
      children: runs.length > 0 ? runs : [new TextRun('')],
    });
  }

  private async createBulletList(block: any): Promise<Paragraph[]> {
    const items: Paragraph[] = [];

    if (block.content) {
      for (const item of block.content) {
        if (item.type === 'listItem') {
          const runs = await this.createTextRuns(item.content || []);
          items.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { after: 100 },
              children: runs.length > 0 ? runs : [new TextRun('')],
            }),
          );
        }
      }
    }

    return items;
  }

  private async createOrderedList(block: any): Promise<Paragraph[]> {
    const items: Paragraph[] = [];

    if (block.content) {
      for (const item of block.content) {
        if (item.type === 'listItem') {
          const runs = await this.createTextRuns(item.content || []);
          items.push(
            new Paragraph({
              numbering: { level: 0, reference: 'my-numbering' },
              spacing: { after: 100 },
              children: runs.length > 0 ? runs : [new TextRun('')],
            }),
          );
        }
      }
    }

    return items;
  }

  private async createTaskList(block: any): Promise<Paragraph[]> {
    const items: Paragraph[] = [];

    if (block.content) {
      for (const item of block.content) {
        if (item.type === 'taskItem') {
          const checked = item.attrs?.checked === true;
          const prefix = checked ? '[x] ' : '[ ] ';
          const runs = await this.createTextRuns(item.content || []);
          items.push(
            new Paragraph({
              spacing: { after: 100 },
              children: [
                new TextRun({ text: prefix, bold: true }),
                ...(runs.length > 0 ? runs : [new TextRun('')]),
              ],
            }),
          );
        }
      }
    }

    return items;
  }

  private async createCodeBlock(block: any): Promise<Paragraph[]> {
    const text = this.extractBlockText(block);
    const language = block.attrs?.language || 'text';

    return [
      new Paragraph({
        spacing: { after: 0 },
        border: {
          top: {
            color: 'cccccc',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
        children: [new TextRun({ text: language ? `[${language}]` : '', bold: true })],
      }),
      new Paragraph({
        shading: { fill: 'f5f5f5' },
        spacing: { after: 200 },
        border: {
          bottom: {
            color: 'cccccc',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
        children: [new TextRun({ text: text || '', font: 'Courier New' })],
      }),
    ];
  }

  private async createMathBlock(block: any): Promise<Paragraph[]> {
    const text = block.attrs?.text || '';
    return [
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: `$$${text}$$`, font: 'Courier New' }),
        ],
      }),
    ];
  }

  private async createBlockquote(block: any): Promise<Paragraph> {
    const runs = await this.createTextRuns(block.content || []);

    return new Paragraph({
      indent: { left: 720 },
      border: {
        left: {
          color: '4472c4',
          space: 24,
          style: BorderStyle.SINGLE,
          size: 24,
        },
      },
      spacing: { after: 200 },
      children: runs.length > 0 ? runs : [new TextRun('')],
    });
  }

  private async createCallout(block: any): Promise<Paragraph[]> {
    const paragraphs: Paragraph[] = [];
    const calloutType = block.attrs?.type || 'info';
    const typeColors: { [key: string]: string } = {
      default: '808080',
      info: '4472c4',
      success: '16a34a',
      warning: 'd97706',
      danger: 'dc2626',
    };
    const color = typeColors[calloutType] || typeColors.info;
    const icon = block.attrs?.icon || calloutType;

    paragraphs.push(
      new Paragraph({
        border: {
          left: {
            color,
            space: 24,
            style: BorderStyle.SINGLE,
            size: 24,
          },
        },
        spacing: { after: 0 },
        children: [
          new TextRun({ text: `${icon.toUpperCase()}: `, bold: true, color }),
        ],
      }),
    );

    if (block.content) {
      for (const child of block.content) {
        const childParagraphs = await this.processBlock(child);
        for (const childParagraph of childParagraphs) {
          const p = childParagraph as Paragraph;
          paragraphs.push(
            new Paragraph({
              indent: { left: 240 },
              border: {
                left: {
                  color,
                  space: 24,
                  style: BorderStyle.SINGLE,
                  size: 24,
                },
              },
              spacing: { after: 100 },
              children: (p as any).children || [new TextRun('')],
            }),
          );
        }
      }
    }

    return paragraphs;
  }

  private async createDetails(block: any): Promise<Paragraph[]> {
    const paragraphs: Paragraph[] = [];
    let summaryText = '';

    if (block.content) {
      for (const child of block.content) {
        if (child.type === 'detailsSummary') {
          summaryText = this.extractBlockText(child);
        } else if (child.type === 'detailsContent') {
          if (child.content) {
            for (const contentChild of child.content) {
              const childParagraphs = await this.processBlock(contentChild);
              paragraphs.push(...childParagraphs);
            }
          }
        }
      }
    }

    return [
      new Paragraph({
        spacing: { after: 100 },
        children: [
          new TextRun({ text: '▶ ', bold: true }),
          new TextRun({ text: summaryText || 'Details', bold: true }),
        ],
      }),
      ...paragraphs.map((p) =>
        new Paragraph({
          indent: { left: 360 },
          spacing: { after: 100 },
          children: (p as any).children || [new TextRun('')],
        }),
      ),
    ];
  }

  private async createTable(block: any): Promise<Table[]> {
    const rows: TableRow[] = [];

    if (block.content) {
      for (const section of block.content) {
        if (
          section.type === 'tableHead' ||
          section.type === 'tableBody'
        ) {
          if (section.content) {
            for (const row of section.content) {
              if (row.type === 'tableRow') {
                const cells: TableCell[] = [];

                if (row.content) {
                  for (const cell of row.content) {
                    const cellParagraphs: Paragraph[] = [
                      new Paragraph({
                        children: [new TextRun(this.extractBlockText(cell) || '')],
                      }),
                    ];

                    for (const child of cell.content || []) {
                      if (['image', 'excalidraw', 'drawio', 'kityminder', 'embed'].includes(child.type)) {
                        cellParagraphs.push(...(await this.createEmbeddedImage(child)));
                      }
                    }

                    cells.push(
                      new TableCell({
                        children: cellParagraphs,
                      }),
                    );
                  }
                }

                rows.push(new TableRow({ children: cells }));
              }
            }
          }
        }
      }
    }

    return rows.length > 0
      ? [
          new Table({
            rows: rows,
            width: { size: 100, type: 'pct' },
          }),
        ]
      : [];
  }

  private async createEmbeddedImage(block: any): Promise<Paragraph[]> {
    const src = block.attrs?.src;
    this.logger.debug(`[DOCX export] Embedding ${block.type}, src prefix: ${src?.substring(0, 80)}`);
    if (!src) {
      this.logger.warn(`[DOCX export] ${block.type} has no src`);
      return [
        new Paragraph({
          children: [new TextRun({ text: `[${block.type}]`, italics: true })],
        }),
      ];
    }

    try {
      const imageBuffer = await this.fetchImageBuffer(src);
      if (!imageBuffer) {
        this.logger.error(`[DOCX export] Failed to get buffer for ${block.type}, src: ${src?.substring(0, 120)}`);
        return [
          new Paragraph({
            children: [new TextRun({ text: `[${block.type}]`, italics: true })],
          }),
        ];
      }

      const imageType = this.getImageType(imageBuffer, src);
      this.logger.debug(`[DOCX export] Detected image type for ${block.type}: ${imageType}, buffer size: ${imageBuffer.length}`);
      if (!imageType) {
        this.logger.error(`[DOCX export] Unknown image type for ${block.type}, src: ${src?.substring(0, 120)}, buffer head: ${imageBuffer.slice(0, 80).toString('utf-8')}`);
        return [
          new Paragraph({
            children: [new TextRun({ text: `[${block.type}]`, italics: true })],
          }),
        ];
      }

      let finalBuffer = imageBuffer;
      let finalType = imageType;

      if (imageType === 'svg') {
        try {
          finalBuffer = await sharp(imageBuffer)
            .resize({ width: 580 })
            .png()
            .toBuffer();
          finalType = 'png';
          this.logger.debug(`[DOCX export] Converted SVG to PNG, size: ${finalBuffer.length}`);
        } catch (svgError) {
          this.logger.warn(`[DOCX export] Failed to convert SVG to PNG for ${block.type}, falling back to embedded SVG:`, svgError);
          // 转换失败时回退到嵌入 SVG，Word 2013+ 通常支持直接显示 SVG
          finalBuffer = imageBuffer;
          finalType = 'svg';
        }
      }

      const dimensions = await this.getImageDimensions(finalBuffer, finalType);
      this.logger.debug(`[DOCX export] Image dimensions for ${block.type}: ${JSON.stringify(dimensions)}`);

      const imageOptions: any = {
        type: finalType as any,
        data: finalBuffer,
        transformation: dimensions,
      };

      // SVG 嵌入 Word 需要提供 fallback 位图
      if (finalType === 'svg') {
        imageOptions.fallback = {
          type: 'png',
          data: await this.createTransparentPng(dimensions.width, dimensions.height),
        };
      }

      this.logger.debug(`[DOCX export] Creating ImageRun for ${block.type} with type ${finalType}`);
      return [
        new Paragraph({
          spacing: { after: 200 },
          children: [new ImageRun(imageOptions)],
        }),
      ];
    } catch (error) {
      this.logger.error(`[DOCX export] Error embedding ${block.type} image:`, error);
      return [
        new Paragraph({
          children: [new TextRun({ text: `[${block.type}]`, italics: true })],
        }),
      ];
    }
  }

  /**
   * 生成一个指定尺寸的透明 PNG，用作 SVG 在 Word 中的 fallback 占位图
   */
  private async createTransparentPng(width: number, height: number): Promise<Buffer> {
    try {
      return await sharp({
        create: {
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        },
      })
        .png()
        .toBuffer();
    } catch (error) {
      this.logger.error('Error creating transparent PNG fallback:', error);
      // 极端 fallback：1x1 透明 PNG
      return Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      );
    }
  }

  private async fetchImageBuffer(src: string): Promise<Buffer | null> {
    try {
      if (src.startsWith('data:')) {
        const base64 = src.split(',')[1];
        if (!base64) {
          this.logger.error(`[DOCX export] Empty base64 data URL: ${src?.substring(0, 120)}`);
          return null;
        }
        this.logger.debug(`[DOCX export] Decoding base64 data URL, mime prefix: ${src.substring(0, src.indexOf(',') + 1)}`);
        return Buffer.from(base64, 'base64');
      }

      const url = src.startsWith('http') ? src : `${process.env.APP_URL || ''}${src}`;
      this.logger.debug(`[DOCX export] Fetching image from URL: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.error(`[DOCX export] Failed to fetch image: ${url} - ${response.status}`);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      this.logger.debug(`[DOCX export] Fetched image from URL: ${url}, size: ${arrayBuffer.byteLength}`);
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error('[DOCX export] Error fetching image buffer:', error);
      return null;
    }
  }

  private async getImageDimensions(buffer: Buffer, imageType?: string): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata();
      this.logger.debug(`[DOCX export] sharp metadata: ${JSON.stringify(metadata)}`);
      let width = metadata.width || 580;
      let height = metadata.height || 320;

      // 对于 SVG，如果 sharp 没有解析出尺寸，尝试从 viewBox/width/height 属性读取
      if ((!width || !height) && imageType === 'svg') {
        const svgString = buffer.toString('utf-8').slice(0, 2000);
        const widthMatch = svgString.match(/<svg[^>]*\swidth=["']([\d.]+)/i);
        const heightMatch = svgString.match(/<svg[^>]*\sheight=["']([\d.]+)/i);
        const viewBoxMatch = svgString.match(/<svg[^>]*\sviewBox=["'][^"'\s]+\s[^"'\s]+\s([\d.]+)\s([\d.]+)["']/i);
        if (widthMatch) width = parseFloat(widthMatch[1]);
        if (heightMatch) height = parseFloat(heightMatch[1]);
        if ((!width || !height) && viewBoxMatch) {
          width = parseFloat(viewBoxMatch[1]);
          height = parseFloat(viewBoxMatch[2]);
        }
      }

      if (!width || !height) {
        width = 580;
        height = 320;
      }

      const maxWidth = 580;
      const scale = width > maxWidth ? maxWidth / width : 1;
      return {
        width: Math.round(width * scale),
        height: Math.round(height * scale),
      };
    } catch (error) {
      this.logger.error('Error getting image dimensions:', error);
      return { width: 580, height: 320 };
    }
  }

  private getImageType(buffer: Buffer, src: string): string | null {
    if (src.startsWith('data:image/png')) return 'png';
    if (src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg')) return 'jpg';
    if (src.startsWith('data:image/gif')) return 'gif';
    if (src.startsWith('data:image/bmp')) return 'bmp';
    if (src.startsWith('data:image/svg')) return 'svg';

    if (buffer.length < 4) return null;
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'png';
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'jpg';
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'gif';
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'bmp';
    // SVG 可能以 XML 声明开头，需要搜索更大范围
    if (buffer.slice(0, 500).toString().toLowerCase().includes('<svg')) return 'svg';

    return null;
  }

  private extractBlockText(block: any): string {
    if (block.content && Array.isArray(block.content)) {
      return block.content
        .map((item: any) => {
          if (item.type === 'text') {
            return item.text;
          }
          if (item.content) {
            return this.extractBlockText(item);
          }
          return '';
        })
        .join('');
    }
    return '';
  }

  private async createTextRuns(content: any[]): Promise<(TextRun | ImageRun)[]> {
    const runs: (TextRun | ImageRun)[] = [];

    for (const item of content) {
      if (item.type === 'text') {
        const marks = item.marks || [];
        const isBold = marks.some((m: any) => m.type === 'bold');
        const isItalic = marks.some((m: any) => m.type === 'italic');
        const isUnderline = marks.some((m: any) => m.type === 'underline');
        const isStrikethrough = marks.some(
          (m: any) => m.type === 'strike',
        );
        const isCode = marks.some((m: any) => m.type === 'code');
        const linkMark = marks.find((m: any) => m.type === 'link');

        const runOptions: any = {
          text: item.text,
          bold: isBold,
          italic: isItalic,
          underline: isUnderline ? { type: UnderlineType.SINGLE } : undefined,
          strike: isStrikethrough,
          font: isCode ? 'Courier New' : undefined,
          shading: isCode ? { fill: 'f0f0f0' } : undefined,
        };

        if (linkMark?.attrs?.href) {
          runOptions.hyperlink = {
            link: linkMark.attrs.href,
            tooltip: linkMark.attrs.href,
          };
        }

        runs.push(new TextRun(runOptions));
      } else if (['image', 'excalidraw', 'drawio', 'kityminder', 'embed'].includes(item.type)) {
        const imageParagraphs = await this.createEmbeddedImage(item);
        for (const paragraph of imageParagraphs) {
          const children = (paragraph as any).children;
          if (children && children.length > 0) {
            runs.push(children[0]);
          }
        }
      } else if (item.type === 'mention') {
        const label = item.attrs?.label || item.attrs?.entityId || 'mention';
        const isUser = item.attrs?.entityType === 'user';
        runs.push(new TextRun({ text: `${isUser ? '@' : ''}${label}`, bold: true, color: '4472c4' }));
      } else if (item.type === 'mathInline') {
        const text = item.attrs?.text || '';
        runs.push(new TextRun({ text: `$${text}$`, font: 'Courier New' }));
      } else if (item.content) {
        // Handle nested inline content (e.g., marks wrapped around nested elements)
        runs.push(...(await this.createTextRuns(item.content)));
      }
    }

    return runs;
  }
}
