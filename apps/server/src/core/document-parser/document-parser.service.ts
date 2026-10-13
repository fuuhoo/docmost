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
      case 'application/vnd.openxmlformats-officedocument.presentationml.presentation':
      case 'application/vnd.ms-powerpoint':
        return this.parsePptx(file, mimeType);
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
   * PPTX/PPT 解析
   * - 从 ZIP 中提取幻灯片 XML
   * - 提取文本内容并按幻灯片组织
   */
  private async parsePptx(buffer: Buffer, mimeType: string): Promise<ParsedDocument> {
    try {
      const yauzl = await import('yauzl');
      const { parseStringPromise } = await import('xml2js');
      
      let fullHtml = '';
      let slideCount = 0;
      
      // 将 buffer 转换为 yauzl 可读取的格式
      const tempFilePath = `/tmp/pptx-${Date.now()}.pptx`;
      const fs = await import('fs');
      fs.writeFileSync(tempFilePath, buffer);
      
      await new Promise<void>((resolve, reject) => {
        yauzl.open(tempFilePath, { lazyEntries: true }, (err, zipfile) => {
          if (err) {
            reject(err);
            return;
          }
          
          const slides: Array<{ index: number; text: string }> = [];
          let processedCount = 0;
          
          zipfile.on('entry', (entry) => {
            // PPTX 中的幻灯片文件路径如: ppt/slides/slide1.xml
            const slideMatch = entry.fileName.match(/ppt\/slides\/slide(\d+)\.xml$/i);
            
            if (slideMatch) {
              const slideIndex = parseInt(slideMatch[1], 10);
              
              zipfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                  processedCount++;
                  zipfile.readEntry();
                  return;
                }
                
                let xmlData = '';
                readStream.on('data', (chunk) => {
                  xmlData += chunk.toString();
                });
                
                readStream.on('end', async () => {
                  try {
                    const result = await parseStringPromise(xmlData);
                    const text = this.extractTextFromPptxXml(result);
                    slides.push({ index: slideIndex, text });
                  } catch (e) {
                    // 忽略解析错误
                  } finally {
                    processedCount++;
                    zipfile.readEntry();
                  }
                });
              });
            } else {
              zipfile.readEntry();
            }
          });
          
          zipfile.on('end', () => {
            slideCount = slides.length;
            
            // 按幻灯片顺序组织 HTML
            slides.sort((a, b) => a.index - b.index);
            
            for (const slide of slides) {
              if (slide.text.trim()) {
                fullHtml += `<h2>Slide ${slide.index}</h2>\n`;
                const paragraphs = slide.text.split('\n').filter(p => p.trim());
                for (const para of paragraphs) {
                  fullHtml += `<p>${this.escapeHtml(para.trim())}</p>\n`;
                }
                fullHtml += '\n';
              }
            }
            
            // 清理临时文件
            fs.unlinkSync(tempFilePath);
            resolve();
          });
          
          zipfile.on('error', (err) => {
            fs.unlinkSync(tempFilePath);
            reject(err);
          });
          
          zipfile.readEntry();
        });
      });
      
      this.logger.log(`Successfully parsed PPTX with ${slideCount} slides`);
      
      return {
        html: fullHtml,
        metadata: {
          pageCount: slideCount,
        },
      };
    } catch (error) {
      this.logger.error('Failed to parse PPTX:', error);
      throw new BadRequestException('Failed to parse PowerPoint document');
    }
  }

  /**
   * 从 PPTX XML 中提取文本
   */
  private extractTextFromPptxXml(xml: any): string {
    const texts: string[] = [];
    
    const extract = (obj: any): void => {
      if (!obj || typeof obj !== 'object') return;
      
      // PPTX 文本通常在 <a:t> 标签中
      if (obj['a:t']) {
        const text = Array.isArray(obj['a:t']) 
          ? obj['a:t'].join('') 
          : obj['a:t'];
        if (text.trim()) {
          texts.push(text);
        }
      }
      
      // 递归遍历所有子节点
      for (const key of Object.keys(obj)) {
        if (key !== 'a:t') {
          const value = obj[key];
          if (Array.isArray(value)) {
            value.forEach(item => extract(item));
          } else if (typeof value === 'object' && value !== null) {
            extract(value);
          }
        }
      }
    };
    
    extract(xml);
    return texts.join('\n');
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
