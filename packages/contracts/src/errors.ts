/** REDOVA API error codes (docs/user-management/README.md §18.2). */
export const ErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_CURSOR: 'INVALID_CURSOR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  MFA_ENROLLMENT_REQUIRED: 'MFA_ENROLLMENT_REQUIRED',
  REAUTHENTICATION_REQUIRED: 'REAUTHENTICATION_REQUIRED',
  FORBIDDEN_PERMISSION: 'FORBIDDEN_PERMISSION',
  ORIGIN_NOT_ALLOWED: 'ORIGIN_NOT_ALLOWED',
  ADMIN_SELF_ROLE_CHANGE_FORBIDDEN: 'ADMIN_SELF_ROLE_CHANGE_FORBIDDEN',
  ADMIN_TARGET_IS_PLATFORM_ADMIN: 'ADMIN_TARGET_IS_PLATFORM_ADMIN',
  NOT_FOUND: 'NOT_FOUND',
  ORGANIZATION_NOT_FOUND: 'ORGANIZATION_NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  LAST_PLATFORM_ADMIN: 'LAST_PLATFORM_ADMIN',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_FAILED: 400,
  INVALID_CURSOR: 400,
  UNAUTHENTICATED: 401,
  EMAIL_NOT_VERIFIED: 403,
  MFA_ENROLLMENT_REQUIRED: 403,
  REAUTHENTICATION_REQUIRED: 403,
  FORBIDDEN_PERMISSION: 403,
  ORIGIN_NOT_ALLOWED: 403,
  ADMIN_SELF_ROLE_CHANGE_FORBIDDEN: 403,
  ADMIN_TARGET_IS_PLATFORM_ADMIN: 403,
  NOT_FOUND: 404,
  ORGANIZATION_NOT_FOUND: 404,
  USER_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  LAST_PLATFORM_ADMIN: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** Safe, client-displayable default messages. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_FAILED: 'The request is invalid.',
  INVALID_CURSOR: 'The pagination cursor is invalid.',
  UNAUTHENTICATED: 'Authentication is required.',
  EMAIL_NOT_VERIFIED: 'Verify your email address to continue.',
  MFA_ENROLLMENT_REQUIRED: 'Two-factor authentication must be enabled for this action.',
  REAUTHENTICATION_REQUIRED: 'Sign in again to confirm this action.',
  FORBIDDEN_PERMISSION: 'You do not have permission to perform this action.',
  ORIGIN_NOT_ALLOWED: 'This request origin is not allowed.',
  ADMIN_SELF_ROLE_CHANGE_FORBIDDEN: 'You cannot change your own platform role.',
  ADMIN_TARGET_IS_PLATFORM_ADMIN: 'Platform administrators cannot be banned. Change their role first.',
  NOT_FOUND: 'The requested resource was not found.',
  ORGANIZATION_NOT_FOUND: 'Organization not found.',
  USER_NOT_FOUND: 'User not found.',
  SESSION_NOT_FOUND: 'Session not found.',
  LAST_PLATFORM_ADMIN: 'The last platform administrator cannot be demoted.',
  RATE_LIMITED: 'Too many requests. Try again later.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
};
