import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, Inject, Param, Post, Query } from '@nestjs/common';
import {
  cursorQuerySchema,
  decodeCursor,
  encodeCursor,
  type Paginated,
  type TenantContext,
} from '@redova/contracts';
import { type PrismaClient } from '@redova/db';
import { createZodDto } from 'nestjs-zod';
import { ApiException } from '../../src/common/api-exception';
import {
  PlatformAdmin,
  PlatformAdminMutation,
  RequireOrgPermission,
  Tenant,
} from '../../src/authz';
import { PRISMA } from '../../src/config/tokens';

class CursorQueryDto extends createZodDto(cursorQuerySchema) {}

interface TestItem {
  id: string;
  organizationId: string;
  name: string;
}

/** Test-only tenant-owned table used to exercise the isolation contract kit. Never migrated. */
export const ensureTestItemTable = (prisma: PrismaClient) =>
  prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS test_tenant_item (
       id text PRIMARY KEY,
       "organizationId" text NOT NULL,
       name text NOT NULL,
       "createdAt" timestamptz NOT NULL DEFAULT now()
     )`,
  );

/** Test-only routes proving the UM-006 guards; registered only by integration tests. */
@Controller()
export class AuthzTestController {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  @Get('organizations/:organizationId/__test/members-only')
  @RequireOrgPermission({ member: ['read'] })
  membersOnly(@Tenant() tenant: TenantContext) {
    return tenant;
  }

  @Get('organizations/:organizationId/__test/audit')
  @RequireOrgPermission({ auditLog: ['read'] })
  audit(@Tenant() tenant: TenantContext) {
    return { role: tenant.role };
  }

  @Post('organizations/:organizationId/__test/items')
  @RequireOrgPermission({ agent: ['create'] })
  async createItem(@Tenant() tenant: TenantContext, @Body() body: { name?: string }) {
    // Any organizationId in the body is ignored: the tenant comes from TenantContext only.
    const id = `${Date.now().toString(36)}-${randomUUID()}`;
    await this.prisma.$executeRaw`
      INSERT INTO test_tenant_item (id, "organizationId", name)
      VALUES (${id}, ${tenant.organizationId}, ${body.name ?? 'item'})`;
    return { id, organizationId: tenant.organizationId };
  }

  @Get('organizations/:organizationId/__test/items')
  @RequireOrgPermission({ agent: ['read'] })
  async listItems(
    @Tenant() tenant: TenantContext,
    @Query() query: CursorQueryDto,
  ): Promise<Paginated<TestItem>> {
    const after = query.cursor ? decodeCursor(query.cursor).id : null;
    const rows = await this.prisma.$queryRaw<TestItem[]>`
      SELECT id, "organizationId", name FROM test_tenant_item
      WHERE "organizationId" = ${tenant.organizationId} AND (${after}::text IS NULL OR id < ${after})
      ORDER BY id DESC LIMIT ${query.limit + 1}`;
    const hasMore = rows.length > query.limit;
    const items = rows.slice(0, query.limit);
    return {
      items,
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor: hasMore ? encodeCursor({ id: items[items.length - 1].id }) : null,
      },
    };
  }

  @Get('organizations/:organizationId/__test/items/:itemId')
  @RequireOrgPermission({ agent: ['read'] })
  async getItem(@Tenant() tenant: TenantContext, @Param('itemId') itemId: string) {
    const [item] = await this.prisma.$queryRaw<TestItem[]>`
      SELECT id, "organizationId", name FROM test_tenant_item
      WHERE id = ${itemId} AND "organizationId" = ${tenant.organizationId}`;
    if (!item) throw new ApiException('NOT_FOUND');
    return item;
  }

  @Get('__test/admin')
  @PlatformAdmin()
  adminRead() {
    return { ok: true };
  }

  @Post('__test/admin')
  @PlatformAdminMutation()
  adminWrite() {
    return { ok: true };
  }
}
