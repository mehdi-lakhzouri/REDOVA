import { Body, Controller, Delete, Get, HttpCode, Param, Put, Query, Req } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  adminSessionSchema,
  adminUserDetailSchema,
  adminUserListQuerySchema,
  adminUserSummarySchema,
  banUserBodySchema,
  paginatedEnvelope,
  setRoleBodySchema,
  successEnvelope,
} from '@redova/contracts';
import { fromNodeHeaders } from 'better-auth/node';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../authz/authenticated-request';
import { PlatformAdmin, PlatformAdminMutation } from '../authz/decorators';
import { type AdminActor, AdminUsersService } from './admin-users.service';

class AdminUserListQueryDto extends createZodDto(adminUserListQuerySchema) {}
class BanUserDto extends createZodDto(banUserBodySchema) {}
class SetRoleDto extends createZodDto(setRoleBodySchema) {}
class AdminUserPageDto extends createZodDto(paginatedEnvelope(adminUserSummarySchema)) {}
class AdminUserDetailEnvelopeDto extends createZodDto(successEnvelope(adminUserDetailSchema)) {}
class AdminSessionListDto extends createZodDto(successEnvelope(z.array(adminSessionSchema))) {}

/** The guards already required a session (PlatformAdminGuard). */
const actorOf = (request: AuthenticatedRequest): AdminActor => ({
  id: request.session!.user.id,
  headers: fromNodeHeaders(request.headers),
});

/**
 * Platform admin user management (README §14, §18.6). Reads need PLATFORM_ADMIN + MFA; mutations
 * also need a fresh session and a trusted Origin. Errors use the REDOVA envelope (README §18.2).
 */
@ApiTags('admin')
@ApiCookieAuth()
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  @PlatformAdmin()
  @ApiOperation({ summary: 'List and search users (cursor pagination)' })
  @ApiOkResponse({ type: AdminUserPageDto })
  list(@Query() query: AdminUserListQueryDto) {
    return this.users.list(query);
  }

  @Get(':userId')
  @PlatformAdmin()
  @ApiOperation({ summary: 'User details (404 USER_NOT_FOUND)' })
  @ApiOkResponse({ type: AdminUserDetailEnvelopeDto })
  get(@Param('userId') userId: string) {
    return this.users.get(userId);
  }

  @Put(':userId/ban')
  @PlatformAdminMutation()
  @ApiOperation({
    summary: 'Ban a user (idempotent)',
    description: 'Errors: ADMIN_TARGET_IS_PLATFORM_ADMIN, YOU_CANNOT_BAN_YOURSELF, USER_NOT_FOUND.',
  })
  @ApiOkResponse({ type: AdminUserDetailEnvelopeDto })
  ban(@Req() req: AuthenticatedRequest, @Param('userId') userId: string, @Body() body: BanUserDto) {
    return this.users.ban(actorOf(req), userId, body);
  }

  @Delete(':userId/ban')
  @PlatformAdminMutation()
  @HttpCode(204)
  @ApiOperation({ summary: 'Lift a ban (idempotent)' })
  @ApiNoContentResponse()
  unban(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.users.unban(actorOf(req), userId);
  }

  @Put(':userId/role')
  @PlatformAdminMutation()
  @ApiOperation({
    summary: 'Change the global role (idempotent)',
    description:
      'Errors: ADMIN_SELF_ROLE_CHANGE_FORBIDDEN, LAST_PLATFORM_ADMIN (409), USER_NOT_FOUND.',
  })
  @ApiOkResponse({ type: AdminUserDetailEnvelopeDto })
  setRole(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Body() body: SetRoleDto,
  ) {
    return this.users.setRole(actorOf(req), userId, body);
  }

  @Get(':userId/sessions')
  @PlatformAdmin()
  @ApiOperation({ summary: "List a user's sessions (bounded, no tokens)" })
  @ApiOkResponse({ type: AdminSessionListDto })
  listSessions(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.users.listSessions(actorOf(req), userId);
  }

  @Delete(':userId/sessions')
  @PlatformAdminMutation()
  @HttpCode(204)
  @ApiOperation({ summary: 'Sign a user out everywhere (idempotent)' })
  @ApiNoContentResponse()
  revokeAllSessions(@Req() req: AuthenticatedRequest, @Param('userId') userId: string) {
    return this.users.revokeAllSessions(actorOf(req), userId);
  }

  @Delete(':userId/sessions/:sessionId')
  @PlatformAdminMutation()
  @HttpCode(204)
  @ApiOperation({ summary: 'Revoke one session by id (404 SESSION_NOT_FOUND)' })
  @ApiNoContentResponse()
  revokeSession(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.users.revokeSession(actorOf(req), userId, sessionId);
  }
}
