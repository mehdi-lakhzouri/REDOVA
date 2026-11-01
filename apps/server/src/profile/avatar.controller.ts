import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
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
import { errorEnvelope, successEnvelope } from '@redova/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { requireSession, type AuthenticatedRequest } from '../authz/authenticated-request';
import { OriginGuard } from '../authz/origin.guard';
import { ApiException } from '../common/api-exception';
import { MediaMutationGuard } from '../media/media-mutation.guard';
import { MediaUploadInterceptor } from '../media/media-upload.interceptor';
import { AvatarService } from './avatar.service';

class AvatarUploadEnvelopeDto extends createZodDto(successEnvelope(z.object({ image: z.url() }))) {}
class AvatarErrorEnvelopeDto extends createZodDto(errorEnvelope) {}

@ApiTags('profile')
@ApiCookieAuth()
@Controller()
export class AvatarController {
  constructor(private readonly avatars: AvatarService) {}

  @Post('users/me/avatar')
  @HttpCode(200)
  @UseGuards(OriginGuard, MediaMutationGuard)
  @UseInterceptors(MediaUploadInterceptor('avatar'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({
    summary: 'Upload or replace your avatar (5 MiB, JPEG/PNG/WebP, normalized to WebP)',
  })
  @ApiResponse({
    status: 200,
    type: AvatarUploadEnvelopeDto,
    description: 'REDOVA envelope containing data.image (stable private URL)',
  })
  @ApiResponse({
    status: 400,
    type: AvatarErrorEnvelopeDto,
    description: 'AVATAR_INVALID or invalid multipart form',
  })
  @ApiResponse({
    status: 413,
    type: AvatarErrorEnvelopeDto,
    description: 'AVATAR_TOO_LARGE (maximum 5 MiB)',
  })
  @ApiResponse({
    status: 429,
    type: AvatarErrorEnvelopeDto,
    description: 'RATE_LIMITED; Retry-After header',
  })
  upload(@Req() req: AuthenticatedRequest, @UploadedFile() file?: Express.Multer.File) {
    const user = requireSession(req).user;
    if (!file) throw new ApiException('AVATAR_INVALID');
    return this.avatars.upload(user.id, file.buffer);
  }

  @Delete('users/me/avatar')
  @HttpCode(204)
  @UseGuards(OriginGuard, MediaMutationGuard)
  @ApiOperation({ summary: 'Remove your avatar (idempotent)' })
  @ApiResponse({ status: 204, description: 'Avatar removed' })
  @ApiResponse({
    status: 429,
    type: AvatarErrorEnvelopeDto,
    description: 'RATE_LIMITED; Retry-After header',
  })
  remove(@Req() req: AuthenticatedRequest) {
    return this.avatars.remove(requireSession(req).user.id);
  }

  @Get('avatars/:avatarId')
  @ApiOperation({ summary: 'Private avatar: owner, active co-members or MFA platform admin' })
  @ApiResponse({
    status: 200,
    description: 'WebP image',
    content: { 'image/webp': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({
    status: 404,
    type: AvatarErrorEnvelopeDto,
    description: 'AVATAR_NOT_FOUND, including unauthorized viewers',
  })
  async read(
    @Param('avatarId') id: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const body = await this.avatars.read(id, requireSession(req).user);
    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': String(body.length),
      'Cache-Control': 'private, no-store',
      'Content-Disposition': 'inline; filename="avatar.webp"',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Cookie',
    });
    res.send(body);
  }
}
