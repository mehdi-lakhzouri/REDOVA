import {
  Injectable,
  mixin,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { fileExtension, MEDIA_POLICIES, type MediaKind } from '@redova/contracts';
import { ApiException } from '../common/api-exception';

/**
 * Multipart parser for one field named `file`, in memory, with no other field. Rejects early on
 * declared type, extension and size; the real content is checked later by `ImageProcessor`.
 */
export function MediaUploadInterceptor(kind: MediaKind): Type<NestInterceptor> {
  const policy = MEDIA_POLICIES[kind];
  const Multipart = FileInterceptor('file', {
    limits: { fileSize: policy.maxBytes, files: 1, fields: 0, parts: 2 },
    fileFilter: (_request, file, callback) => {
      const extension = fileExtension(file.originalname);
      const allowed =
        (policy.mimeTypes as readonly string[]).includes(file.mimetype) &&
        (extension === null || policy.extensions.includes(extension));
      if (!allowed) return callback(new ApiException(policy.errors.invalid), false);
      callback(null, true);
    },
  });

  @Injectable()
  class MediaUpload extends Multipart {
    async intercept(context: ExecutionContext, next: CallHandler) {
      try {
        return await super.intercept(context, next);
      } catch (error) {
        if (error instanceof PayloadTooLargeException)
          throw new ApiException(policy.errors.tooLarge);
        throw error;
      }
    }
  }
  return mixin(MediaUpload);
}
