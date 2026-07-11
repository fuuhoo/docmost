import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { tmpName } from 'tmp-promise';
import { exec } from 'child_process';
import { promisify } from 'util';
import { DocxExporter } from './docx.converter';

const execAsync = promisify(exec);

/**
 * Convert ProseMirror JSON to PDF by first generating a DOCX and then
 * converting it to PDF with LibreOffice. This avoids the many limitations of
 * pdfkit (CJK font handling, image embedding, TTC support) and reuses the
 * already-working DOCX export path.
 */
export class PdfExporter {
  private readonly logger = new Logger(PdfExporter.name);
  private readonly docxExporter = new DocxExporter();

  async exportToPdf(
    prosemirrorJson: any,
    title?: string,
  ): Promise<Buffer> {
    this.logger.log('[PDF export] Generating DOCX for LibreOffice conversion');
    const docxBuffer = await this.docxExporter.exportToDocx(
      prosemirrorJson,
      title,
    );

    const docxPath = await tmpName({ postfix: '.docx' });
    const outputDir = path.dirname(docxPath);
    const pdfPath = path.join(
      outputDir,
      `${path.basename(docxPath, '.docx')}.pdf`,
    );

    try {
      await fs.promises.writeFile(docxPath, docxBuffer);
      this.logger.log(`[PDF export] Converting DOCX to PDF: ${docxPath}`);

      const command = await this.findLibreOfficeCommand();
      if (!command) {
        throw new Error(
          'LibreOffice (libreoffice/soffice) not found. PDF export requires LibreOffice to be installed.',
        );
      }

      const conversionCommand = `${command} --headless --convert-to pdf --outdir ${outputDir} ${docxPath}`;
      await execAsync(conversionCommand, { timeout: 120000 });

      if (!fs.existsSync(pdfPath)) {
        throw new Error(
          `LibreOffice did not produce a PDF at the expected path: ${pdfPath}`,
        );
      }

      const pdfBuffer = await fs.promises.readFile(pdfPath);
      this.logger.log(
        `[PDF export] Generated PDF successfully, size: ${pdfBuffer.length} bytes`,
      );
      return pdfBuffer;
    } catch (error) {
      this.logger.error('[PDF export] LibreOffice conversion failed:', error);
      throw error;
    } finally {
      await fs.promises.unlink(docxPath).catch(() => {});
      await fs.promises.unlink(pdfPath).catch(() => {});
    }
  }

  private async findLibreOfficeCommand(): Promise<string | null> {
    const candidates = ['libreoffice', 'soffice'];
    for (const cmd of candidates) {
      try {
        await execAsync(`which ${cmd}`);
        return cmd;
      } catch {
        // command not found, try next
      }
    }
    return null;
  }
}
