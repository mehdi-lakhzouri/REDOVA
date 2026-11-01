import { ShowcaseSection } from './showcase-section';

const scale = [
  { role: 'Page title', className: 'text-3xl font-semibold tracking-tight', sample: 'Assessments' },
  {
    role: 'Section title',
    className: 'text-xl font-semibold tracking-tight',
    sample: 'Open findings',
  },
  {
    role: 'Card title',
    className: 'text-base font-medium',
    sample: 'Prompt injection via tool output',
  },
  {
    role: 'Body',
    className: 'text-sm',
    sample: 'The agent followed an instruction hidden in a retrieved document.',
  },
  {
    role: 'Caption',
    className: 'text-xs text-muted-foreground',
    sample: 'Updated 4 minutes ago by Olivia Martin',
  },
];

const technical = [
  { label: 'Agent ID', value: 'agt_01JB9M3V7Q8K2R5T6Y' },
  { label: 'Assessment ID', value: 'asm_2026_11_01_0042' },
  { label: 'Execution ID', value: 'exe_7f3c9a1e' },
  { label: 'Timestamp', value: '2026-11-01T10:42:22.061Z' },
  { label: 'Log line', value: '[WARN] tool=web_fetch policy=deny reason=untrusted_origin' },
];

export function TypographySection() {
  return (
    <ShowcaseSection
      id="typography"
      area="tokens / typography"
      title="Typography"
      description="Two families with separate jobs: Geist Sans for every interface text, Geist Mono for technical data. The brand face appears only in REDOVA brand moments."
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border bg-card p-6 lg:col-span-1">
          <p className="type-technical text-xs text-muted-foreground">
            --font-brand · Ethnocentric
          </p>
          <p className="type-brand mt-6 text-4xl text-foreground">
            RED<span className="text-brand">O</span>VA
          </p>
          <p className="mt-6 text-sm text-muted-foreground">
            Brand moments only. Never headings, labels, buttons or body copy. Production logos use
            the image assets, not live text.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 lg:col-span-2">
          <p className="type-technical text-xs text-muted-foreground">--font-sans · Geist Sans</p>
          <dl className="mt-4 divide-y">
            {scale.map((step) => (
              <div
                key={step.role}
                className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:items-baseline"
              >
                <dt className="text-xs text-muted-foreground">{step.role}</dt>
                <dd className={step.className}>{step.sample}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rounded-xl border bg-card p-6 lg:col-span-3">
          <p className="type-technical text-xs text-muted-foreground">--font-mono · Geist Mono</p>
          <dl className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {technical.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="type-technical text-sm break-all">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </ShowcaseSection>
  );
}
