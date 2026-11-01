import type { ReactNode } from 'react';

/** Reference-page section: the eyebrow names the design-system area it documents. */
export function ShowcaseSection({
  id,
  area,
  title,
  description,
  children,
}: {
  id: string;
  area: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-20 border-t py-14">
      <div className="mb-8 max-w-2xl">
        <p className="type-technical text-xs text-primary">{area}</p>
        <h2 id={`${id}-title`} className="mt-2 text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}
