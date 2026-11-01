import Image from 'next/image';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

type BrandLogoProps = Omit<ComponentProps<'span'>, 'children'> & {
  variant?: 'horizontal' | 'stacked' | 'mark' | 'wordmark' | 'signature';
  /** Background behind the logo, not the color of its lettering. */
  appearance?: 'auto' | 'light' | 'dark';
  decorative?: boolean;
  preload?: boolean;
};
const variants = {
  horizontal: {
    directory: 'logos',
    file: 'horizontal',
    width: 1168,
    height: 280,
    className: 'w-44',
  },
  signature: { directory: 'logos', file: 'signature', width: 1168, height: 280, className: 'w-64' },
  stacked: { directory: 'logos', file: 'stacked', width: 840, height: 500, className: 'w-52' },
  mark: { directory: 'marks', file: 'mark', width: 280, height: 280, className: 'w-9' },
  wordmark: { directory: 'logos', file: 'wordmark', width: 840, height: 128, className: 'w-36' },
} as const;

/** Original raster artwork; CSS selects the theme before hydration without any color filter. */
export function BrandLogo({
  variant = 'horizontal',
  appearance = 'auto',
  decorative = false,
  preload = false,
  className,
  style,
  ...props
}: BrandLogoProps) {
  const asset = variants[variant];
  return (
    <span
      data-slot="brand-logo"
      className={cn('relative inline-block shrink-0 align-middle', asset.className, className)}
      style={{ aspectRatio: `${asset.width} / ${asset.height}`, ...style }}
      {...props}
    >
      {(['light', 'dark'] as const)
        .filter((theme) => appearance === 'auto' || theme === appearance)
        .map((theme) => (
          <Image
            key={theme}
            src={`/brand/${asset.directory}/redova-${asset.file}-${theme}.png`}
            alt={decorative ? '' : 'REDOVA'}
            width={asset.width}
            height={asset.height}
            unoptimized
            loading={preload ? 'eager' : 'lazy'}
            className={cn(
              'absolute inset-0 size-full object-contain',
              appearance === 'auto' && (theme === 'light' ? 'dark:hidden' : 'hidden dark:block'),
            )}
          />
        ))}
    </span>
  );
}
