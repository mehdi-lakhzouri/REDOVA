import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OriginGuard } from '../authz/origin.guard';
import { StorageModule } from '../storage/storage.module';
import { AvatarController } from './avatar.controller';
import { AvatarImageService } from './avatar-image.service';
import { AvatarMutationGuard } from './avatar-mutation.guard';
import { AvatarService } from './avatar.service';

@Module({
  imports: [StorageModule, AuditModule],
  controllers: [AvatarController],
  providers: [AvatarService, AvatarImageService, AvatarMutationGuard, OriginGuard],
})
export class ProfileModule {}
