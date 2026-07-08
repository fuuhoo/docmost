import { Node } from '@tiptap/pm/model';
import { jsonToNode } from '../../collaboration/collaboration.util';
import { isAttachmentNode } from '../../common/helpers/prosemirror/utils';

/**
 * Utility class for converting ProseMirror documents to various formats
 */
export class ProseMirrorConverter {
  /**
   * Convert ProseMirror JSON to node tree
   */
  static toNode(prosemirrorJson: any): Node | null {
    return jsonToNode(prosemirrorJson);
  }

  /**
   * Extract text content from ProseMirror JSON
   */
  static extractText(prosemirrorJson: any): string {
    const doc = jsonToNode(prosemirrorJson);
    if (!doc) return '';

    let text = '';
    doc.descendants((node: Node) => {
      if (node.isText) {
        text += node.text;
      }
      // Add newlines for blocks
      if (
        node.type.name === 'paragraph' ||
        node.type.name === 'heading' ||
        node.type.name === 'listItem'
      ) {
        text += '\n';
      }
    });

    return text.trim();
  }

  /**
   * Extract structured content from ProseMirror JSON
   */
  static extractStructuredContent(prosemirrorJson: any): ContentBlock[] {
    const doc = jsonToNode(prosemirrorJson);
    if (!doc) return [];

    const blocks: ContentBlock[] = [];
    let currentParagraph: string[] = [];

    doc.descendants((node: Node) => {
      if (node.type.name === 'text' && node.isText) {
        currentParagraph.push(node.text);
      }
    });

    // Process blocks
    if (prosemirrorJson.content) {
      for (const block of prosemirrorJson.content) {
        blocks.push(this.processBlock(block));
      }
    }

    return blocks;
  }

  /**
   * Process individual block
   */
  private static processBlock(block: any): ContentBlock {
    const result: ContentBlock = {
      type: block.type,
      content: '',
      level: block.attrs?.level,
      marks: [],
    };

    if (block.content) {
      result.content = block.content
        .map((item: any) => {
          if (item.type === 'text') {
            return item.text;
          }
          return '';
        })
        .join('');
    }

    if (block.content) {
      for (const item of block.content) {
        if (item.marks) {
          result.marks.push(
            ...item.marks.map((mark: any) => mark.type),
          );
        }
      }
    }

    return result;
  }

  /**
   * Get all links from content
   */
  static extractLinks(prosemirrorJson: any): LinkInfo[] {
    const doc = jsonToNode(prosemirrorJson);
    if (!doc) return [];

    const links: LinkInfo[] = [];

    doc.descendants((node: Node) => {
      if (node.isText) {
        for (const mark of node.marks) {
          if (mark.type.name === 'link' && mark.attrs.href) {
            links.push({
              text: node.text,
              href: mark.attrs.href,
              target: mark.attrs.target || '_blank',
            });
          }
        }
      }
    });

    return links;
  }

  /**
   * Get heading structure
   */
  static extractHeadings(prosemirrorJson: any): HeadingInfo[] {
    const headings: HeadingInfo[] = [];

    if (prosemirrorJson.content) {
      for (const block of prosemirrorJson.content) {
        if (block.type === 'heading') {
          const text = block.content
            ?.map((item: any) => (item.type === 'text' ? item.text : ''))
            .join('');

          headings.push({
            level: block.attrs?.level || 1,
            text: text || '',
          });
        }
      }
    }

    return headings;
  }

  /**
   * Get all images/attachments
   */
  static extractAttachments(prosemirrorJson: any): AttachmentInfo[] {
    const attachments: AttachmentInfo[] = [];

    const processNode = (node: any) => {
      if (node.type === 'image' || node.type === 'attachment') {
        attachments.push({
          type: node.type,
          src: node.attrs?.src,
          title: node.attrs?.title,
          alt: node.attrs?.alt,
          url: node.attrs?.url,
        });
      }

      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          processNode(child);
        }
      }
    };

    if (prosemirrorJson.content) {
      for (const block of prosemirrorJson.content) {
        processNode(block);
      }
    }

    return attachments;
  }

  /**
   * Get table data
   */
  static extractTables(prosemirrorJson: any): TableInfo[] {
    const tables: TableInfo[] = [];

    const processNode = (node: any) => {
      if (node.type === 'table') {
        const rows: string[][] = [];

        if (node.content) {
          for (const tableBody of node.content) {
            if (tableBody.type === 'tableBody' || tableBody.type === 'tableHead') {
              if (tableBody.content) {
                for (const row of tableBody.content) {
                  if (row.type === 'tableRow') {
                    const cells: string[] = [];
                    if (row.content) {
                      for (const cell of row.content) {
                        const cellText = this.extractCellText(cell);
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

        tables.push({
          rows: rows,
        });
      }

      if (node.content && Array.isArray(node.content)) {
        for (const child of node.content) {
          processNode(child);
        }
      }
    };

    if (prosemirrorJson.content) {
      for (const block of prosemirrorJson.content) {
        processNode(block);
      }
    }

    return tables;
  }

  private static extractCellText(cell: any): string {
    let text = '';
    if (cell.content) {
      for (const item of cell.content) {
        if (item.type === 'paragraph' && item.content) {
          for (const content of item.content) {
            if (content.type === 'text') {
              text += content.text;
            }
          }
        }
      }
    }
    return text;
  }
}

export interface ContentBlock {
  type: string;
  content: string;
  level?: number;
  marks: string[];
}

export interface LinkInfo {
  text: string;
  href: string;
  target: string;
}

export interface HeadingInfo {
  level: number;
  text: string;
}

export interface AttachmentInfo {
  type: string;
  src?: string;
  title?: string;
  alt?: string;
  url?: string;
}

export interface TableInfo {
  rows: string[][];
}
