import * as PDFDocument from 'pdfkit';
import { Logger } from '@nestjs/common';
import * as sharp from 'sharp';
import * as fs from 'fs';

// fontkit is a transitive dependency of pdfkit; it is used to load .ttc collections
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fontkit = require('fontkit');

interface FontInfo {
  regular: any;
  bold: any;
}

/**
 * Convert ProseMirror JSON to PDF format
 */
export class PdfExporter {
  private readonly logger = new Logger(PdfExporter.name);
  private readonly fonts: FontInfo | null;

  constructor() {
    this.fonts = this.loadCjkFonts();
  }

  private loadCjkFonts(): FontInfo | null {
    const candidates = [
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf',
      '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttf',
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttf',
      '/usr/share/fonts/noto/NotoSansCJK-Regular.ttc',
      '/usr/share/fonts/noto/NotoSansCJK-Regular.ttf',
    ];

    const regularPath = candidates.find((p) => fs.existsSync(p));
    if (!regularPath) {
      this.logger.warn(
        'No CJK font found. PDF Chinese text may render as garbled characters.',
      );
      return null;
    }

    const boldCandidates = [
      regularPath.replace('Regular', 'Bold'),
      regularPath.replace('Regular', 'Bold').replace('.ttc', '.otf'),
      regularPath.replace('Regular', 'Bold').replace('.ttc', '.ttf'),
    ];
    const boldPath = boldCandidates.find((p) => fs.existsSync(p));

    try {
      this.logger.log(`Loading PDF regular font from ${regularPath}`);
      const regular = this.openFont(regularPath);
      this.logger.log('PDF regular font loaded successfully');

      let bold = regular;
      if (boldPath && boldPath !== regularPath) {
        this.logger.log(`Loading PDF bold font from ${boldPath}`);
        bold = this.openFont(boldPath);
      }

      return { regular, bold };
    } catch (err) {
      this.logger.error('Failed to load CJK font for PDF', err);
      return null;
    }
  }

  private openFont(fontPath: string): any {
    const opened = fontkit.openSync(fontPath);
    // TrueType Collections expose multiple sub-fonts; pick the first one.
    if (opened && typeof opened.getFont === 'function') {
      return opened.getFont(0);
    }
    if (opened && Array.isArray(opened.fonts) && opened.fonts.length > 0) {
      return opened.fonts[0];
    }
    return opened;
  }

  private applyFont(doc: PDFDocument, bold = false): void {
    if (this.fonts) {
      doc.font(bold ? this.fonts.bold : this.fonts.regular);
    } else {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    }
  }

  /**
   * Export ProseMirror JSON to PDF
   */
  async exportToPdf(
    prosemirrorJson: any,
    title?: string,
  ): Promise<Buffer> {
    try {
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({
          size: 'A4',
          margin: 50,
        });

        doc.on('data', (chunk: any) => {
          chunks.push(chunk as Buffer);
        });

        doc.on('end', () => {
          resolve(Buffer.concat(chunks));
        });

        doc.on('error', (err) => {
          this.logger.error('PDF generation error:', err);
          reject(err);
        });

        // Add title
        if (title) {
          this.applyFont(doc, true);
          doc.fontSize(24).text(title, { underline: false });
          doc.moveDown(0.5);
        }

        // Reset font for content
        this.applyFont(doc, false);
        doc.fontSize(11);

        // Process content
        (async () => {
          try {
            if (prosemirrorJson.content) {
              for (const block of prosemirrorJson.content) {
                await this.processBlock(doc, block);
              }
            }
            doc.end();
          } catch (error) {
            this.logger.error('Error processing PDF content:', error);
            reject(error);
          }
        })();
      });
    } catch (error) {
      this.logger.error('Error exporting to PDF:', error);
      throw error;
    }
  }

  private async processBlock(doc: PDFDocument, block: any): Promise<void> {
    switch (block.type) {
      case 'heading':
        this.addHeading(doc, block);
        break;

      case 'paragraph':
        await this.addParagraph(doc, block);
        break;

      case 'bulletList':
        this.addBulletList(doc, block);
        break;

      case 'orderedList':
        this.addOrderedList(doc, block);
        break;

      case 'codeBlock':
        this.addCodeBlock(doc, block);
        break;

      case 'blockquote':
        this.addBlockquote(doc, block);
        break;

      case 'horizontalRule':
        this.addHorizontalRule(doc);
        break;

      case 'table':
        this.addTable(doc, block);
        break;

      case 'image':
      case 'excalidraw':
      case 'drawio':
      case 'kityminder':
      case 'embed':
        await this.addImage(doc, block);
        break;

      default:
        break;
    }
  }

  private addHeading(doc: PDFDocument, block: any): void {
    const level = block.attrs?.level || 1;
    const text = this.extractBlockText(block);

    const fontSizes: { [key: number]: number } = {
      1: 20,
      2: 16,
      3: 14,
      4: 12,
      5: 11,
      6: 10,
    };

    const fontSize = fontSizes[level] || 20;

    this.applyFont(doc, true);
    doc.fontSize(fontSize).text(text, { align: 'left' });

    this.applyFont(doc, false);
    doc.fontSize(11);
    doc.moveDown(0.3);
  }

  private async addParagraph(doc: PDFDocument, block: any): Promise<void> {
    if (!block.content || block.content.length === 0) {
      return;
    }

    const inlineNodes = await this.createInlineNodes(block.content);

    if (inlineNodes.length > 0) {
      for (const node of inlineNodes) {
        if (node.type === 'text') {
          this.applyFont(doc, false);
          doc.fontSize(11).text(node.text, {
            align: 'left',
            wordBreak: true,
          });
          doc.moveDown(0.2);
        } else if (node.type === 'image') {
          await this.addImage(doc, node.block);
        }
      }
    }
  }

  private addBulletList(doc: PDFDocument, block: any): void {
    const indent = 20;

    if (block.content) {
      for (const item of block.content) {
        if (item.type === 'listItem') {
          const text = this.extractBlockText(item);
          doc.text(`• ${text}`, {
            indent: indent,
            wordBreak: true,
          });
        }
      }
    }

    doc.moveDown(0.2);
  }

  private addOrderedList(doc: PDFDocument, block: any): void {
    const indent = 20;
    let index = 1;

    if (block.content) {
      for (const item of block.content) {
        if (item.type === 'listItem') {
          const text = this.extractBlockText(item);
          doc.text(`${index}. ${text}`, {
            indent: indent,
            wordBreak: true,
          });
          index++;
        }
      }
    }

    doc.moveDown(0.2);
  }

  private addCodeBlock(doc: PDFDocument, block: any): void {
    const text = this.extractBlockText(block);
    const language = block.attrs?.language || 'code';

    if (language && language !== 'text') {
      this.applyFont(doc, true);
      doc.fontSize(9).text(`[${language}]`, { color: '#666666' });
    }

    doc.save();
    const boxHeight = doc.heightOfString(text, { width: doc.page.width - 100 }) + 20;
    doc
      .rect(doc.x, doc.y, doc.page.width - 100, boxHeight)
      .fill('#f5f5f5');
    doc.restore();

    this.applyFont(doc, false);
    doc.fontSize(9).text(text, {
      align: 'left',
      wordBreak: true,
    });

    this.applyFont(doc, false);
    doc.fontSize(11);
    doc.moveDown(0.2);
  }

  private addBlockquote(doc: PDFDocument, block: any): void {
    const text = this.extractBlockText(block);
    const indent = 20;

    doc.save();
    doc.rect(doc.x + indent, doc.y, 3, doc.heightOfString(text, { width: 450 })).fill('#4472c4');

    this.applyFont(doc, false);
    doc.fontSize(11).text(text, {
      indent: indent + 10,
      wordBreak: true,
      color: '#555555',
      oblique: true,
    });

    this.applyFont(doc, false);
    doc.fontSize(11);
    doc.restore();
    doc.moveDown(0.3);
  }

  private addHorizontalRule(doc: PDFDocument): void {
    const y = doc.y;
    doc.moveTo(doc.x, y).lineTo(doc.page.width - 50, y).stroke('#cccccc');
    doc.moveDown(0.3);
  }

  private addTable(doc: PDFDocument, block: any): void {
    const rows: string[][] = [];

    if (block.content) {
      for (const section of block.content) {
        if (
          section.type === 'tableHead' ||
          section.type === 'tableBody'
        ) {
          if (section.content) {
            for (const row of section.content) {
              if (row.type === 'tableRow') {
                const cells: string[] = [];

                if (row.content) {
                  for (const cell of row.content) {
                    const cellText = this.extractBlockText(cell);
                    cells.push(cellText);
                  }
                }

                rows.push(cells);
              }
            }
          }
        }
      }
    }

    if (rows.length > 0) {
      this.drawTable(doc, rows);
    }

    doc.moveDown(0.3);
  }

  private drawTable(doc: PDFDocument, rows: string[][]): void {
    const colCount = rows[0]?.length || 0;
    if (colCount === 0) return;

    const colWidth = (doc.page.width - 100) / colCount;
    const rowHeight = 25;
    let y = doc.y;

    // Draw header row with background
    doc.fillColor('#f0f0f0');
    doc.rect(doc.x, y, doc.page.width - 100, rowHeight).fill();

    // Draw header text
    this.applyFont(doc, true);
    doc.fillColor('#000000').fontSize(10);

    if (rows[0]) {
      let x = doc.x;
      for (const cell of rows[0]) {
        doc.text(cell, x + 5, y + 5, {
          width: colWidth - 10,
          height: rowHeight - 10,
        });
        x += colWidth;
      }
    }

    y += rowHeight;

    // Draw data rows
    this.applyFont(doc, false);
    doc.fontSize(10);

    for (let i = 1; i < rows.length; i++) {
      // Draw row border
      doc
        .strokeColor('#cccccc')
        .rect(doc.x, y, doc.page.width - 100, rowHeight)
        .stroke();

      // Draw cell content
      doc.fillColor('#000000');
      let x = doc.x;

      for (const cell of rows[i]) {
        doc.text(cell, x + 5, y + 5, {
          width: colWidth - 10,
          height: rowHeight - 10,
        });
        x += colWidth;
      }

      y += rowHeight;
    }

    doc.y = y;
  }

  private async addImage(doc: PDFDocument, block: any): Promise<void> {
    const src = block.attrs?.src;
    if (!src) {
      this.logger.warn(`[PDF export] ${block.type} has no src`);
      return;
    }

    this.logger.debug(`[PDF export] Embedding ${block.type}, src prefix: ${src.substring(0, 80)}`);

    try {
      const imageBuffer = await this.fetchImageBuffer(src);
      if (!imageBuffer) {
        this.logger.error(`[PDF export] Failed to get buffer for ${block.type}, src: ${src.substring(0, 120)}`);
        return;
      }

      let imageType = this.getImageType(imageBuffer, src);
      let finalBuffer = imageBuffer;
      let finalType = imageType;

      this.logger.debug(`[PDF export] Detected image type for ${block.type}: ${imageType}, buffer size: ${imageBuffer.length}`);

      if (imageType === 'svg') {
        try {
          finalBuffer = await sharp(imageBuffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .png()
            .toBuffer();
          finalType = 'png';
          this.logger.debug(`[PDF export] Converted SVG to PNG, size: ${finalBuffer.length}`);
        } catch (svgError) {
          this.logger.warn(`[PDF export] Failed to convert SVG to PNG for ${block.type}:`, svgError);
          return;
        }
      }

      if (!finalType || !['png', 'jpg', 'jpeg', 'gif'].includes(finalType)) {
        this.logger.error(`[PDF export] Unsupported image type for ${block.type}: ${finalType}`);
        return;
      }

      const dimensions = await this.getImageDimensions(finalBuffer, finalType);
      this.logger.debug(`[PDF export] Image dimensions for ${block.type}: ${JSON.stringify(dimensions)}`);

      const maxWidth = doc.page.width - 100;
      const scale = dimensions.width > maxWidth ? maxWidth / dimensions.width : 1;
      const width = Math.round(dimensions.width * scale);
      const height = Math.round(dimensions.height * scale);

      doc.image(finalBuffer, {
        fit: [width, height],
        align: 'center',
        valign: 'top',
      });
      doc.moveDown(0.5);
    } catch (error) {
      this.logger.error(`[PDF export] Error embedding ${block.type} image:`, error);
    }
  }

  private async fetchImageBuffer(src: string): Promise<Buffer | null> {
    try {
      if (src.startsWith('data:')) {
        const base64 = src.split(',')[1];
        if (!base64) {
          this.logger.error('[PDF export] Empty base64 data URL');
          return null;
        }
        return Buffer.from(base64, 'base64');
      }

      const url = src.startsWith('http') ? src : `${process.env.APP_URL || ''}${src}`;
      this.logger.debug(`[PDF export] Fetching image from URL: ${url}`);
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.error(`[PDF export] Failed to fetch image: ${url} - ${response.status}`);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error('[PDF export] Error fetching image buffer:', error);
      return null;
    }
  }

  private async getImageDimensions(buffer: Buffer, imageType?: string): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(buffer).metadata();
      let width = metadata.width || 580;
      let height = metadata.height || 320;

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

      return { width, height };
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
    if (buffer.slice(0, 500).toString().toLowerCase().includes('<svg')) return 'svg';

    return null;
  }

  private async createInlineNodes(content: any[]): Promise<{ type: 'text' | 'image'; text?: string; block?: any }[]> {
    const nodes: { type: 'text' | 'image'; text?: string; block?: any }[] = [];

    for (const item of content) {
      if (item.type === 'text') {
        nodes.push({ type: 'text', text: item.text });
      } else if (['image', 'excalidraw', 'drawio', 'kityminder', 'embed'].includes(item.type)) {
        nodes.push({ type: 'image', block: item });
      } else if (item.content) {
        nodes.push(...(await this.createInlineNodes(item.content)));
      }
    }

    return nodes;
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
}
