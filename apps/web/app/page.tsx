import type { Metadata } from 'next';
import { BrandLogo } from '@/components/brand/brand-logo';
import { ColorSection } from './_components/color-section';
import { ComponentsSection } from './_components/components-section';
import { LogoSection } from './_components/logo-section';
import { ThemeSwitch } from './_components/theme-switch';
import { TypographySection } from './_components/typography-section';

export const metadata: Metadata = { title: 'Design system' };

const areas = [
  { href: '#logo', label: 'Logo' },
  { href: '#color', label: 'Color' },
  { href: '#typography', label: 'Typography' },
  { href: '#components', label: 'Components' },
];

/** Design system reference (temporary home page until product screens exist). */
export default function DesignSystemPage() {
  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo className="w-36" preload />
            <span className="hidden text-sm text-muted-foreground sm:inline">Design system</span>
          </div>
          <nav aria-label="Design system areas" className="hidden gap-5 text-sm md:flex">
            {areas.map((area) => (
              <a
                key={area.href}
                href={area.href}
                className="text-muted-foreground hover:text-foreground"
              >
                {area.label}
              </a>
            ))}
          </nav>
          <ThemeSwitch />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="py-14">
          <p className="type-technical text-xs text-primary">REDOVA · design system v1</p>
          <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-balance">
            The foundation every REDOVA screen is built from
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Tokens, typography, logo assets and component states for a dark-first security product.
            Specification:{' '}
            <span className="type-technical text-sm">docs/design-system/README.md</span>
          </p>
        </div>
        <LogoSection />
        <ColorSection />
        <TypographySection />
        <ComponentsSection />
      </main>
    </div>
  );
}
