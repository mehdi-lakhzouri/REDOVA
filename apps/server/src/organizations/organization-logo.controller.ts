import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  SetMetadata,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { requireSession, type AuthenticatedRequest } from '../authz/authenticated-request';
import { OriginGuard } from '../authz/origin.guard';
import { OrgPermissionGuard, ORG_PERMISSIONS_KEY } from '../authz/org-permission.guard';
import { ApiException } from '../common/api-exception';
import { MediaMutationGuard } from '../media/media-mutation.guard';
import { MediaUploadInterceptor } from '../media/media-upload.interceptor';
import { OrganizationLogoService } from './organization-logo.service';
import { OrganizationLogoEnvelopeDto, OrganizationLogoErrorDto } from './organization-logo.dto';

@ApiTags('organizations')
@ApiCookieAuth()
@ApiResponse({
  status: 401,
  type: OrganizationLogoErrorDto,
  description: 'Verified session required',
})
@ApiResponse({
  status: 403,
  type: OrganizationLogoErrorDto,
  description: 'Insufficient organization permission or untrusted Origin',
})
@ApiResponse({
  status: 404,
  type: OrganizationLogoErrorDto,
  description: 'Organization or logo unavailable to this member',
})
@Controller('organizations/:organizationId/logo')
export class OrganizationLogoController {
  constructor(private readonly logos: OrganizationLogoService) {}
  @Post()
  @HttpCode(200)
  @SetMetadata(ORG_PERMISSIONS_KEY, { organization: ['update'] })
  @UseGuards(OriginGuard, OrgPermissionGuard, MediaMutationGuard)
  @UseInterceptors(MediaUploadInterceptor('organizationLogo'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload or replace an organization logo (2 MiB, JPEG/PNG/WebP)' })
  @ApiResponse({
    status: 200,
    type: OrganizationLogoEnvelopeDto,
    description: 'Private URL in data.logo',
  })
  @ApiResponse({
    status: 400,
    type: OrganizationLogoErrorDto,
    description: 'ORG_LOGO_INVALID or invalid multipart form',
  })
  @ApiResponse({ status: 413, type: OrganizationLogoErrorDto, description: 'ORG_LOGO_TOO_LARGE' })
  @ApiResponse({
    status: 429,
    type: OrganizationLogoErrorDto,
    description: 'Shared media mutation limit; Retry-After header',
  })
  upload(
    @Param('organizationId') organizationId: string,
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new ApiException('ORG_LOGO_INVALID');
    return this.logos.upload(organizationId, requireSession(request).user.id, file.buffer);
  }
  @Delete()
  @HttpCode(204)
  @SetMetadata(ORG_PERMISSIONS_KEY, { organization: ['update'] })
  @UseGuards(OriginGuard, OrgPermissionGuard, MediaMutationGuard)
  @ApiOperation({ summary: 'Remove an organization logo (idempotent)' })
  @ApiResponse({ status: 204, description: 'Logo removed' })
  @ApiResponse({
    status: 429,
    type: OrganizationLogoErrorDto,
    description: 'Shared media mutation limit; Retry-After header',
  })
  remove(@Param('organizationId') organizationId: string, @Req() request: AuthenticatedRequest) {
    return this.logos.remove(organizationId, requireSession(request).user.id);
  }
  @Get(':logoId')
  @UseGuards(OrgPermissionGuard)
  @ApiOperation({ summary: 'Read an organization logo as an active member' })
  @ApiResponse({
    status: 200,
    description: 'Private WebP image',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  async read(
    @Param('organizationId') organizationId: string,
    @Param('logoId') logoId: string,
    @Res() response: Response,
  ) {
    const body = await this.logos.read(organizationId, logoId);
    response.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(body.length),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="organization-logo.webp"',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Cookie',
    });
    response.send(body);
  }
}
