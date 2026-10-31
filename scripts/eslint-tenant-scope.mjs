// Tenant models must use explicit scoped queries. A deliberate exception needs a local review note.
const tenantModels = new Set([
  'member',
  'invitation',
  'organizationSettings',
  'tenantSubscription',
  'tenantQuota',
  'agent',
  'assessment',
  'finding',
  'report',
]);
const propertyName = (member) =>
  member?.type === 'MemberExpression'
    ? member.computed
      ? member.property.value
      : member.property.name
    : undefined;

export const tenantScopeRule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      unscoped:
        'Use a tenant-scoped findFirst query for {{model}}, or add a reviewed tenant-scope-reviewed: <reason> comment.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!['findUnique', 'findUniqueOrThrow'].includes(propertyName(node.callee))) return;
        const model = propertyName(node.callee.object);
        if (!tenantModels.has(model)) return;
        let statement = node;
        while (statement.parent && !/(Statement|Declaration)$/.test(statement.type))
          statement = statement.parent;
        const reviewed = context.sourceCode
          .getCommentsBefore(statement)
          .some((comment) => /^tenant-scope-reviewed:\s+.{12,}$/s.test(comment.value.trim()));
        if (!reviewed) context.report({ node, messageId: 'unscoped', data: { model } });
      },
    };
  },
};

export default { rules: { 'tenant-scope': tenantScopeRule } };
