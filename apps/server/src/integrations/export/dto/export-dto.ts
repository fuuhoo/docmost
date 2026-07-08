import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export enum ExportFormat {
  HTML = 'html',
  Markdown = 'markdown',
  DOCX = 'docx',
  PDF = 'pdf',
}

export class ExportPageDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsOptional()
  @IsString()
  @IsIn(['html', 'markdown', 'docx', 'pdf'])
  format?: ExportFormat;

  @IsOptional()
  @IsBoolean()
  includeChildren?: boolean;

  @IsOptional()
  @IsBoolean()
  includeAttachments?: boolean;
}

export class ExportSpaceDto {
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @IsString()
  @IsIn(['html', 'markdown', 'docx', 'pdf'])
  format: ExportFormat;

  @IsOptional()
  @IsBoolean()
  includeAttachments?: boolean;
}