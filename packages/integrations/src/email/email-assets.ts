import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EmailInlineImage } from './email-sender';

export const EMAIL_ASSETS_DIR = resolve(__dirname, '../../assets/email');
export const EMAIL_BRAND = {
  logoCid: 'redova-logo@assets.redova',
  illustrationCid: 'redova-account-security@assets.redova',
} as const;

/** Fixed package assets only: no recipient-controlled paths or remote image requests. */
export const loadEmailImages = (): EmailInlineImage[] => [
  {
    filename: 'redova-logo-light.png',
    content: readFileSync(resolve(EMAIL_ASSETS_DIR, 'redova-logo-light.png')),
    contentType: 'image/png',
    contentDisposition: 'inline',
    cid: EMAIL_BRAND.logoCid,
  },
  {
    filename: 'account-security-light.jpg',
    content: readFileSync(resolve(EMAIL_ASSETS_DIR, 'account-security-light.jpg')),
    contentType: 'image/jpeg',
    contentDisposition: 'inline',
    cid: EMAIL_BRAND.illustrationCid,
  },
];
