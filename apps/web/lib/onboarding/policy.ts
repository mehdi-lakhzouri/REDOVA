import { z } from 'zod';
import { ORG_NAME_MIN_LENGTH, ORG_NAME_MAX_LENGTH, validateOrgSlug } from '@redova/core';
import { ORGANIZATION_LOGO_MAX_BYTES, ORGANIZATION_LOGO_TYPES, OrgRole } from '@redova/contracts';

export const INVITABLE_ROLES = [
  'ORG_ADMIN',
  'SECURITY_ENGINEER',
  'AI_DEVELOPER',
  'AUDITOR',
  'VIEWER',
] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];
export const MAX_INVITATION_ROWS = 10;
export const organizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(ORG_NAME_MIN_LENGTH, 'Use at least 2 characters.')
    .max(ORG_NAME_MAX_LENGTH, 'Use no more than 64 characters.'),
  slug: z.string().superRefine((value, ctx) => {
    const issue = validateOrgSlug(value);
    if (issue)
      ctx.addIssue({
        code: 'custom',
        message:
          issue === 'ORG_SLUG_RESERVED'
            ? 'This slug is reserved. Choose another.'
            : 'Use 3–48 lowercase letters, numbers or hyphens, starting and ending with a letter or number.',
      });
  }),
});
export type OrganizationInput = z.infer<typeof organizationSchema>;
export type LogoSelection =
  { kind: 'keep' } | { kind: 'none' } | { kind: 'file'; file: File } | { kind: 'url'; url: string };
export function logoProblem(logo: LogoSelection): string | null {
  if (logo.kind === 'file') {
    if (!(ORGANIZATION_LOGO_TYPES as readonly string[]).includes(logo.file.type))
      return 'Use a PNG, JPG or WebP image.';
    if (!logo.file.size || logo.file.size > ORGANIZATION_LOGO_MAX_BYTES)
      return 'Choose a non-empty image no larger than 2 MB.';
  }
  if (logo.kind === 'url') {
    try {
      if (logo.url.trim().length > 2048 || new URL(logo.url.trim()).protocol !== 'https:')
        return 'Use an HTTPS URL of no more than 2,048 characters.';
    } catch {
      return 'Enter a valid HTTPS image URL.';
    }
  }
  return null;
}
export function suggestSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 48)
    .replace(/^-+|-+$/g, '');
}
export function invitationSchema(currentEmail: string) {
  return z
    .object({
      members: z
        .array(
          z.object({
            email: z
              .string()
              .trim()
              .max(254)
              .refine(
                (value) => !value || z.email().safeParse(value).success,
                'Enter a valid work email.',
              ),
            role: z.enum(INVITABLE_ROLES),
          }),
        )
        .min(1)
        .max(MAX_INVITATION_ROWS),
    })
    .superRefine((values, ctx) => {
      const seen = new Set<string>();
      values.members.forEach((member, index) => {
        const email = member.email.toLowerCase();
        if (!email) return;
        if (email === currentEmail.toLowerCase())
          ctx.addIssue({
            code: 'custom',
            path: ['members', index, 'email'],
            message: 'You are already a member of this organization.',
          });
        else if (seen.has(email))
          ctx.addIssue({
            code: 'custom',
            path: ['members', index, 'email'],
            message: 'This email is already in the list.',
          });
        seen.add(email);
      });
    });
}
export type InvitationValues = z.infer<ReturnType<typeof invitationSchema>>;
export function canInvite(role: string): boolean {
  return role === OrgRole.enum.ORG_OWNER || role === OrgRole.enum.ORG_ADMIN;
}
export const allowedInvitationRoles = (role: string): InvitableRole[] =>
  role === 'ORG_OWNER'
    ? [...INVITABLE_ROLES]
    : role === 'ORG_ADMIN'
      ? INVITABLE_ROLES.filter((value) => value !== 'ORG_ADMIN')
      : [];
