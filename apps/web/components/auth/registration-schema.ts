import { z } from 'zod';
import { validateAvatarFile } from '@/lib/avatar/avatar-policy';
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from './password-policy';

/** Optional; uploaded once the account has a verified session (see lib/avatar). */
const avatarSchema = z
  .custom<File | null>((value) => value === null || value instanceof Blob)
  .superRefine((file, context) => {
    const problem = file ? validateAvatarFile(file) : null;
    if (problem) context.addIssue({ code: 'custom', message: problem });
  });

export const registrationSchema = z
  .object({
    avatar: avatarSchema,
    name: z
      .string()
      .trim()
      .min(1, 'Enter your full name.')
      .max(200, 'Use no more than 200 characters.'),
    email: z
      .string()
      .trim()
      .max(254, 'Enter a valid work email.')
      .email('Enter a valid work email.'),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, 'Use at least 12 characters.')
      .max(PASSWORD_MAX_LENGTH, 'Use no more than 128 characters.'),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
    acceptedTerms: z
      .boolean()
      .refine(Boolean, 'Accept the Terms of Service and Privacy Policy to continue.'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Your passwords do not match.',
  });

export type RegistrationValues = z.infer<typeof registrationSchema>;
export type RegistrationDetails = Pick<
  RegistrationValues,
  'avatar' | 'name' | 'email' | 'password'
> & {
  acceptedTerms: true;
};
export type SignUpHandler = (details: RegistrationDetails) => Promise<{ error?: string } | void>;
