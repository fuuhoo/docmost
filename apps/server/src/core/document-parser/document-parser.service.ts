import { Injectable, Logger, BadRequestException } from '@nestjs/common';

export interface ParsedDocument {
  html: string;
  metadata: {
    pageCount?: number;
    [key: string]: any;
  };
}

@Injectable()
export class DocumentParserService {
  private readonly logger = new Logger(DocumentParserService.name);

  /**
   * 主入口：根据文件类型自动选择解析器
   */
  async parseDocument(file: Buffer, mimeType: string): Promise<ParsedDocument> {
    switch (mimeType) {
      case 'application/pdf':
        return this.parsePdf(file);
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return this.parseDocx(file);
      case 'text/markdown':
      case 'text/x-markdown':
      case 'text/plain':
        return this.parseMarkdown(file.toString('utf-8'));
      default:
        throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }
  }

  /**
   * PDF 解析
   * - 提取文本内容
   * - 按页组织内容
   */
  private async parsePdf(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      
      // 配置 worker（使用 Node.js 环境）
      const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs');
      pdfjsLib.GlobalWorkerOptions.workerPort = worker.WorkerMessageHandler;
      
      const loadingTask = pdfjsLib.getDocument({ data: buffer });
      const pdf = await loadingTask.promise;
      
      let fullHtml = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        
        // 提取文本并简单处理段落
        const items = textContent.items as any[];
        let pageText = '';
        let lastY = -1;
        
        for (const item of items) {
          // 如果 Y 坐标变化较大，认为是新行
          if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
            pageText += '\n';
          }
          pageText += item.str;
          lastY = item.transform[5];
        }
        
        // 将文本转换为简单的 HTML 段落
        const paragraphs = pageText.split('\n\n').filter(p => p.trim());
        fullHtml += `<h2>Page ${i}</h2>\n`;
        
        for (const para of paragraphs) {
          const trimmed = para.trim();
          if (trimmed) {
            // 简单的标题检测（全大写或较短的文本可能是标题）
            if (trimmed.length < 100 && trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
              fullHtml += `<h3>${this.escapeHtml(trimmed)}</h3>\n`;
            } else {
              fullHtml += `<p>${this.escapeHtml(trimmed)}</p>\n`;
            }
          }
        }
        
        fullHtml += '\n';
      }
      
      this.logger.log(`Successfully parsed PDF with ${pdf.numPages} pages`);
      
      return {
        html: fullHtml,
        metadata: {
          pageCount: pdf.numPages,
        },
      };
    } catch (error) {
      this.logger.error('Failed to parse PDF:', error);
      throw new BadRequestException('Failed to parse PDF document');
    }
  }

  /**
   * DOCX 解析
   * - 使用 mammoth 转换为 HTML
   * - 保留标题、列表、表格等结构
   */
  private async parseDocx(buffer: Buffer): Promise<ParsedDocument> {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.convertToHtml({ buffer });
      
      if (result.messages.length > 0) {
        this.logger.warn('Mammoth conversion warnings:', result.messages);
      }
      
      this.logger.log('Successfully parsed DOCX document');
      
      return {
        html: result.value,
        metadata: {},
      };
    } catch (error) {
      this.logger.error('Failed to parse DOCX:', error);
      throw new BadRequestException('Failed to parse Word document');
    }
  }

  /**
   * Markdown 解析
   * - 复用现有的 markdownToHtml 工具
   */
  private async parseMarkdown(content: string): Promise<ParsedDocument> {
    try {
      // 动态导入以避免循环依赖
      const { markdownToHtml } = await import('@docmost/editor-ext');
      const html = await markdownToHtml(content);
      
      this.logger.log('Successfully parsed Markdown document');
      
      return {
        html,
        metadata: {},
      };
    } catch (error) {
      this.logger.error('Failed to parse Markdown:', error);
      throw new BadRequestException('Failed to parse Markdown document');
    }
  }

  /**
   * 转义 HTML 特殊字符
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
