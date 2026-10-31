import { RuleTester } from 'eslint';
import { tenantScopeRule } from './eslint-tenant-scope.mjs';

new RuleTester().run('tenant-scope', tenantScopeRule, {
  valid: [
    'prisma.user.findUnique({where: {id}})',
    'prisma.organization.findUnique({where: {id}})',
    'prisma.member.findFirst({where: {organizationId, id}})',
    '// tenant-scope-reviewed: bootstrap resolves tenant ownership immediately afterwards\nconst item = prisma.agent.findUnique({where: {id}})',
  ],
  invalid: [
    { code: 'prisma.agent.findUnique({where: {id}})', errors: [{ messageId: 'unscoped' }] },
    { code: 'prisma.member.findUniqueOrThrow({where: {id}})', errors: [{ messageId: 'unscoped' }] },
    {
      code: 'prisma["invitation"]["findUnique"]({where: {id}})',
      errors: [{ messageId: 'unscoped' }],
    },
    {
      code: '// tenant-scope-reviewed: short\nprisma.finding.findUnique({where: {id}})',
      errors: [{ messageId: 'unscoped' }],
    },
  ],
});
