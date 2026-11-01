/** Matches packages/auth/src/create-auth.ts. Character-mix tips never gate submission. */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

export const passwordRequirements = [
  {
    label: '12–128 characters (required)',
    test: (value: string) =>
      value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH,
  },
  { label: 'Uppercase letters (optional)', test: (value: string) => /[A-Z]/.test(value) },
  { label: 'Lowercase letters (optional)', test: (value: string) => /[a-z]/.test(value) },
  { label: 'Numbers (optional)', test: (value: string) => /[0-9]/.test(value) },
  { label: 'Symbols (optional)', test: (value: string) => /[^\p{L}\p{N}\s]/u.test(value) },
];

/** A local length/diversity estimate, not a breach check or a server policy. */
export function estimatePasswordStrength(value: string) {
  if (!value) return { score: 0, label: 'Not entered' };
  const variety = passwordRequirements.slice(1).filter((rule) => rule.test(value)).length;
  let score =
    Number(value.length >= 12) +
    Number(value.length >= 16) +
    Number(value.length >= 24) +
    Number(value.length >= 12 && variety >= 3);
  if (/^(.)\1+$/u.test(value)) score = 1;
  score = Math.max(1, Math.min(4, score));
  return { score, label: ['Not entered', 'Weak', 'Fair', 'Strong', 'Very strong'][score] };
}
