import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { BrandThemeProvider } from '@/components/brand/brand-theme-provider';
import { cn } from '@/lib/utils';

/** Application typography. Geist ships as variable fonts: no per-weight files to manage. */
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: { default: 'REDOVA — AI agent security', template: '%s · REDOVA' },
  description: 'Agentic AI security testing and automated red teaming.',
  icons: {
    icon: [{ url: '/brand/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/brand/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn('h-full antialiased', geistSans.variable, geistMono.variable, 'font-sans')}
    >
      <body className="flex min-h-full flex-col">
        <BrandThemeProvider>{children}</BrandThemeProvider>
      </body>
    </html>
  );
}
