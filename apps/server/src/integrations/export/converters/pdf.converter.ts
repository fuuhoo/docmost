import PDFDocument from 'pdfkit';
import { Logger } from '@nestjs/common';

/**
 * Convert ProseMirror JSON to PDF format
 */
export class PdfExporter {
  private readonly logger = new Logger(PdfExporter.name);

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
          doc
            .fontSize(24)
            .font('Helvetica-Bold')
            .text(title, { underline: false });
          doc.moveDown(0.5);
        }

        // Reset font for content
        doc.fontSize(11).font('Helvetica');

        // Process content
        if (prosemirrorJson.content) {
          for (const block of prosemirrorJson.content) {
            this.processBlock(doc, block);
          }
        }

        doc.end();
      });
    } catch (error) {
      this.logger.error('Error exporting to PDF:', error);
      throw error;
    }
  }

  private processBlock(doc: PDFDocument, block: any): void {
    switch (block.type) {
      case 'heading':
        this.addHeading(doc, block);
        break;

      case 'paragraph':
        this.addParagraph(doc, block);
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

    doc
      .fontSize(fontSize)
      .font('Helvetica-Bold')
      .text(text, { align: 'left' });

    doc.fontSize(11).font('Helvetica');
    doc.moveDown(0.3);
  }

  private addParagraph(doc: PDFDocument, block: any): void {
    const text = this.extractBlockText(block);

    if (text.trim()) {
      doc.fontSize(11).font('Helvetica').text(text, {
        align: 'left',
        wordBreak: true,
      });
      doc.moveDown(0.2);
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
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`[${language}]`, { color: '#666666' });
    }

    doc.save();
    doc
      .rect(doc.x, doc.y, doc.page.width - 100, doc.heightOfString(text, { width: doc.page.width - 100 }) + 20)
      .fill('#f5f5f5');
    doc.restore();

    doc
      .fontSize(9)
      .font('Courier')
      .text(text, {
        align: 'left',
        wordBreak: true,
      });

    doc.fontSize(11).font('Helvetica');
    doc.moveDown(0.2);
  }

  private addBlockquote(doc: PDFDocument, block: any): void {
    const text = this.extractBlockText(block);
    const indent = 20;

    doc.save();
    doc.rect(doc.x + indent, doc.y, 3, doc.heightOfString(text, { width: 450 })).fill('#4472c4');

    doc.fontSize(11).font('Helvetica-Oblique').text(text, {
      indent: indent + 10,
      wordBreak: true,
      color: '#555555',
    });

    doc.fontSize(11).font('Helvetica');
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
    doc.fillColor('#000000').fontSize(10).font('Helvetica-Bold');

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
    doc.fontSize(10).font('Helvetica');

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
