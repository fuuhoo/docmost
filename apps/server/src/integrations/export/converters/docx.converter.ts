import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  AlignmentType,
  HeadingLevel,
  UnderlineType,
  BorderStyle,
} from 'docx';
import { Logger } from '@nestjs/common';

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
  ): Promise<Paragraph[]> {
    const sections: Paragraph[] = [];

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
        const blockElements = this.processBlock(block);
        sections.push(...blockElements);
      }
    }

    return sections;
  }

  private processBlock(block: any): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    switch (block.type) {
      case 'heading':
        paragraphs.push(this.createHeading(block));
        break;

      case 'paragraph':
        paragraphs.push(this.createParagraph(block));
        break;

      case 'bulletList':
        paragraphs.push(...this.createBulletList(block));
        break;

      case 'orderedList':
        paragraphs.push(...this.createOrderedList(block));
        break;

      case 'codeBlock':
        paragraphs.push(...this.createCodeBlock(block));
        break;

      case 'blockquote':
        paragraphs.push(this.createBlockquote(block));
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

      case 'table':
        paragraphs.push(...this.createTable(block));
        break;

      case 'image':
        // Images are handled separately if needed
        break;

      case 'listItem':
        // ListItems are processed within their parent list
        break;

      default:
        if (block.content) {
          paragraphs.push(this.createParagraph(block));
        }
    }

    return paragraphs;
  }

  private createHeading(block: any): Paragraph {
    const level = block.attrs?.level || 1;
    const runs = this.createTextRuns(block.content || []);

    const headingLevels: { [key: number]: HeadingLevel } = {
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

  private createParagraph(block: any): Paragraph {
    const runs = this.createTextRuns(block.content || []);

    return new Paragraph({
      spacing: { line: 240, after: 100 },
      children: runs.length > 0 ? runs : [new TextRun('')],
    });
  }

  private createBulletList(block: any): Paragraph[] {
    const items: Paragraph[] = [];

    if (block.content) {
      for (const item of block.content) {
        if (item.type === 'listItem') {
          const runs = this.createTextRuns(item.content || []);
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

  private createOrderedList(block: any): Paragraph[] {
    const items: Paragraph[] = [];

    if (block.content) {
      for (const item of block.content) {
        if (item.type === 'listItem') {
          const runs = this.createTextRuns(item.content || []);
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

  private createCodeBlock(block: any): Paragraph[] {
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

  private createBlockquote(block: any): Paragraph {
    const runs = this.createTextRuns(block.content || []);

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

  private createTable(block: any): Paragraph[] {
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
                    const cellRuns = this.createTextRuns(cell.content || []);
                    const cellText = this.extractBlockText(cell);
                    cells.push(
                      new TableCell({
                        children: [
                          new Paragraph({
                            children: cellRuns.length > 0 ? cellRuns : [new TextRun(cellText || '')],
                          }),
                        ],
                      }),
                    );
                  }
                }

                rows.push(new TableRow({ cells }));
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

  private createTextRuns(content: any[]): TextRun[] {
    const runs: TextRun[] = [];

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
      } else if (item.content) {
        // Handle nested inline content (e.g., marks wrapped around nested elements)
        runs.push(...this.createTextRuns(item.content));
      }
    }

    return runs;
  }
}
