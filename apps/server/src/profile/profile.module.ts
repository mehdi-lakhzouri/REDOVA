import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OriginGuard } from '../authz/origin.guard';
import { MediaModule } from '../media/media.module';
import { AvatarController } from './avatar.controller';
import { AvatarService } from './avatar.service';

@Module({
  imports: [MediaModule, AuditModule],
  controllers: [AvatarController],
  providers: [AvatarService, OriginGuard],
})
export class ProfileModule {}
