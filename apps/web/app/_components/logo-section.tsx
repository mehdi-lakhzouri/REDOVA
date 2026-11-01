import Image from 'next/image';
import { BrandLogo } from '@/components/brand/brand-logo';
import { cn } from '@/lib/utils';
import { ShowcaseSection } from './showcase-section';

type Variant = 'signature' | 'horizontal' | 'stacked' | 'wordmark' | 'mark';

const logos: { variant: Variant; name: string; usage: string; size: string }[] = [
  { variant: 'signature', name: 'Signature', usage: 'Sign-in and sign-up screens', size: 'w-72' },
  { variant: 'horizontal', name: 'Horizontal', usage: 'Top navigation, headers', size: 'w-56' },
  { variant: 'stacked', name: 'Stacked', usage: 'Documents, covers, splash', size: 'w-44' },
  { variant: 'wordmark', name: 'Wordmark', usage: 'Tight horizontal spaces', size: 'w-48' },
  { variant: 'mark', name: 'Emblem', usage: 'Collapsed sidebar, avatars', size: 'w-14' },
];

const icons = [
  { src: '/brand/icons/app-icon-512.png', name: 'App icon', size: 'app-icon-512.png' },
  { src: '/brand/icons/social-avatar.png', name: 'Social avatar', size: 'social-avatar.png' },
  { src: '/brand/icons/favicon-64.png', name: 'Favicon', size: 'favicon-{16…64}.png' },
];

function Backdrop({ tone, children }: { tone: 'dark' | 'light'; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'flex min-h-36 min-w-0 items-center justify-center rounded-lg border p-6',
        // Fixed backdrops show each asset on its intended background, whatever the theme.
        tone === 'dark'
          ? 'border-brand-surface bg-brand-deep'
          : 'border-brand-neutral bg-brand-paper',
      )}
    >
      {children}
    </div>
  );
}

export function LogoSection() {
  return (
    <ShowcaseSection
      id="logo"
      area="brand / logo"
      title="Logo system"
      description="Original REDOVA artwork, cropped from the supplied branding board. Each asset has a dark-background and a light-background version; the file name names the background, not the ink."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        {logos.map((logo) => (
          <figure key={logo.variant} className="rounded-xl border bg-card p-4 shadow-card">
            <div className="grid gap-3 sm:grid-cols-2">
              <Backdrop tone="dark">
                <BrandLogo
                  variant={logo.variant}
                  appearance="dark"
                  decorative
                  className={cn('max-w-full', logo.size)}
                />
              </Backdrop>
              <Backdrop tone="light">
                <BrandLogo
                  variant={logo.variant}
                  appearance="light"
                  decorative
                  className={cn('max-w-full', logo.size)}
                />
              </Backdrop>
            </div>
            <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{logo.name}</span>
              <span className="text-sm text-muted-foreground">{logo.usage}</span>
            </figcaption>
          </figure>
        ))}
        <figure className="rounded-xl border bg-card p-4 shadow-card">
          <Backdrop tone="dark">
            <div className="flex items-end gap-6">
              {icons.map((icon) => (
                <Image
                  key={icon.src}
                  src={icon.src}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="size-16 rounded-xl"
                />
              ))}
            </div>
          </Backdrop>
          <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium">Icons</span>
            <span className="type-technical text-xs text-muted-foreground">
              {icons.map((icon) => icon.size).join(' · ')}
            </span>
          </figcaption>
        </figure>
      </div>
    </ShowcaseSection>
  );
}
