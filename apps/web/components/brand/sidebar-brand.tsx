'use client';

import Link from 'next/link';
import { BrandLogo } from './brand-logo';
import { useSidebar } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';

/** Place in SidebarHeader under SidebarProvider. Mobile drawers retain the full logo. */
export function SidebarBrand({ href = '/', className }: { href?: string; className?: string }) {
  const { state, isMobile } = useSidebar();
  const collapsed = state === 'collapsed' && !isMobile;
  return (
    <Link
      href={href}
      aria-label="REDOVA — Accueil"
      className={cn(
        'flex min-h-11 items-center overflow-hidden rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar',
        collapsed ? 'justify-center' : 'px-2',
        className,
      )}
    >
      <BrandLogo
        variant={collapsed ? 'mark' : 'horizontal'}
        decorative
        className={collapsed ? 'w-8' : 'w-44 max-w-full'}
      />
    </Link>
  );
}
