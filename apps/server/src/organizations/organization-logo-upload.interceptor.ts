import {
  Injectable,
  PayloadTooLargeException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ORGANIZATION_LOGO_MAX_BYTES, ORGANIZATION_LOGO_TYPES } from '@redova/contracts';
import { ApiException } from '../common/api-exception';

const MultipartLogo = FileInterceptor('file', {
  limits: { fileSize: ORGANIZATION_LOGO_MAX_BYTES, files: 1, fields: 0, parts: 2 },
  fileFilter: (_request, file, callback) => {
    if (!(ORGANIZATION_LOGO_TYPES as readonly string[]).includes(file.mimetype))
      return callback(new ApiException('ORG_LOGO_INVALID'), false);
    callback(null, true);
  },
});
@Injectable()
export class OrganizationLogoUploadInterceptor extends MultipartLogo {
  async intercept(context: ExecutionContext, next: CallHandler) {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) throw new ApiException('ORG_LOGO_TOO_LARGE');
      throw error;
    }
  }
}
