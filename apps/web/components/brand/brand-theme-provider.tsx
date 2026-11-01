'use client';

import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

/**
 * Dark-first: dark is the default; the light palette is available on request (`.light`).
 * Also mounts the shared tooltip and toast hosts so every screen uses the same primitives.
 */
export function BrandThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      themes={['dark', 'light']}
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster closeButton />
    </ThemeProvider>
  );
}
