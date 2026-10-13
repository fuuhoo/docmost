import { Module } from '@nestjs/common';
import { PageService } from './services/page.service';
import { PageController } from './page.controller';
import { PageHistoryService } from './services/page-history.service';
import { TrashCleanupService } from './services/trash-cleanup.service';
import { StorageModule } from '../../integrations/storage/storage.module';
import { DocumentParserModule } from '../document-parser/document-parser.module';
import { AttachmentModule } from '../attachment/attachment.module';

@Module({
  controllers: [PageController],
  providers: [PageService, PageHistoryService, TrashCleanupService],
  exports: [PageService, PageHistoryService],
  imports: [StorageModule, DocumentParserModule, AttachmentModule],
})
export class PageModule {}
