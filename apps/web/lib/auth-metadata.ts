import type { Metadata, Viewport } from 'next';
import { siteConfig } from '@/config/site';

/** Auth pages share privacy rules; query strings never enter canonical/share URLs. */
export function createAuthMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): Metadata {
  const canonical = new URL(path, siteConfig.url);
  canonical.search = '';
  canonical.hash = '';
  return {
    metadataBase: new URL(siteConfig.url),
    title,
    description,
    alternates: { canonical: canonical.toString() },
    referrer: 'no-referrer',
    robots: {
      index: false,
      follow: false,
      noarchive: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
    openGraph: {
      type: 'website',
      title: `${title} · REDOVA`,
      description,
      url: canonical.toString(),
      siteName: siteConfig.name,
      locale: 'en_US',
      images: [
        {
          url: '/brand/icons/app-icon-512.png',
          width: 512,
          height: 512,
          alt: 'REDOVA — AI agent security',
        },
      ],
    },
    twitter: {
      card: 'summary',
      title: `${title} · REDOVA`,
      description,
      images: ['/brand/icons/app-icon-512.png'],
    },
    formatDetection: { telephone: false, address: false, email: false },
  };
}

export const authViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0F14',
  colorScheme: 'dark',
};
