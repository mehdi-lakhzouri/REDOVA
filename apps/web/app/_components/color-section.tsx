import { cn } from '@/lib/utils';
import { ShowcaseSection } from './showcase-section';

const brand = [
  { name: 'Primary Red', hex: '#FF2D2D', token: '--brand-red', className: 'bg-brand' },
  { name: 'Deep Dark', hex: '#0B0F14', token: '--brand-deep', className: 'bg-brand-deep' },
  { name: 'Surface', hex: '#1E242B', token: '--brand-surface', className: 'bg-brand-surface' },
  {
    name: 'Text / Neutral',
    hex: '#E5E7EB',
    token: '--brand-neutral',
    className: 'bg-brand-neutral',
  },
];

/** Semantic pairs as components consume them: surface class + its foreground class. */
const semantic = [
  { token: 'background', className: 'bg-background text-foreground' },
  { token: 'card', className: 'bg-card text-card-foreground' },
  { token: 'popover', className: 'bg-popover text-popover-foreground' },
  { token: 'primary', className: 'bg-primary text-primary-foreground' },
  { token: 'secondary', className: 'bg-secondary text-secondary-foreground' },
  { token: 'muted', className: 'bg-muted text-muted-foreground' },
  { token: 'accent', className: 'bg-accent text-accent-foreground' },
  { token: 'destructive', className: 'bg-destructive-subtle text-destructive' },
  { token: 'success', className: 'bg-success-subtle text-success-foreground' },
  { token: 'warning', className: 'bg-warning-subtle text-warning-foreground' },
  { token: 'info', className: 'bg-info-subtle text-info-foreground' },
  { token: 'sidebar', className: 'bg-sidebar text-sidebar-foreground' },
];

export function ColorSection() {
  return (
    <ShowcaseSection
      id="color"
      area="tokens / color"
      title="Color"
      description="Four official colors. Red is reserved for primary actions, active navigation, focus and security emphasis; everything else is graphite."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {brand.map((color) => (
          <div key={color.token} className="overflow-hidden rounded-xl border bg-card">
            <div className={cn('h-24 border-b', color.className)} />
            <div className="space-y-1 p-4">
              <p className="font-medium">{color.name}</p>
              <p className="type-technical text-xs text-muted-foreground">
                {color.hex} · {color.token}
              </p>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mt-10 mb-4 text-sm font-medium">Semantic tokens</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {semantic.map((pair) => (
          <div
            key={pair.token}
            className={cn(
              'flex items-center justify-between rounded-lg border px-4 py-3',
              pair.className,
            )}
          >
            <span className="text-sm font-medium">{pair.token}</span>
            <span className="type-technical text-xs opacity-80">bg-{pair.token}</span>
          </div>
        ))}
        <div className="flex items-center justify-between rounded-lg border px-4 py-3">
          <span className="text-sm font-medium">border · input · ring</span>
          <span className="flex gap-2" aria-hidden>
            <span className="size-4 rounded-full bg-border" />
            <span className="size-4 rounded-full bg-input" />
            <span className="size-4 rounded-full bg-ring" />
          </span>
        </div>
      </div>
    </ShowcaseSection>
  );
}
