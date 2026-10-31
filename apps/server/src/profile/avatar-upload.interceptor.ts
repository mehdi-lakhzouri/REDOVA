import {
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiException } from '../common/api-exception';
import { AVATAR_MAX_BYTES } from '../storage/avatar-storage';

const MultipartAvatar = FileInterceptor('file', {
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1, fields: 0, parts: 2 },
  fileFilter: (_req, file, callback) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return callback(new ApiException('AVATAR_INVALID'), false);
    }
    callback(null, true);
  },
});

@Injectable()
export class AvatarUploadInterceptor extends MultipartAvatar {
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw new ApiException('AVATAR_TOO_LARGE');
      throw error;
    }
  }
}
