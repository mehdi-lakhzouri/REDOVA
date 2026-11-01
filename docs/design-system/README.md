# REDOVA Design System

| Field | Value |
| --- | --- |
| Scope | `apps/web` (Next.js App Router, Tailwind CSS v4, shadcn/ui Base UI "rhea") |
| Source of truth | `apps/web/app/globals.css` (tokens), this document (rules) |
| Live reference | `pnpm --filter @redova/web dev`, then `http://localhost:3000/` |
| Direction | Premium enterprise cybersecurity SaaS: dark-first, graphite, restrained red accents |

The design system defines tokens, typography, logo usage and component conventions. It contains no business screens.

## 1. Brand palette

| Name | Hex | Token | Use |
| --- | --- | --- | --- |
| Primary Red | `#FF2D2D` | `--brand-red` (`bg-brand`, `text-brand`) | Logo, primary action (dark theme), active navigation, focus, security emphasis |
| Deep Dark | `#0B0F14` | `--brand-deep` | Application background (dark) |
| Surface | `#1E242B` | `--brand-surface` | Raised surfaces, popovers, secondary controls |
| Text / Neutral | `#E5E7EB` | `--brand-neutral` | Primary text (dark) |

Red is a signal, not a decoration. Each view has at most one red primary action. Never use red for large backgrounds, body text or ornaments.

Purple and bright blue are not part of the brand. Functional status colors (success, warning, info) are allowed, and only for status.

## 2. Semantic tokens

Components use semantic Tailwind classes only (`bg-primary`, `text-muted-foreground`, `border-border`…). Hex values in components are not allowed. The brand tokens `bg-brand-deep` and `bg-brand-paper` are the only theme-independent colors, used for fixed logo backdrops.

| Token | Dark (default) | Light (prepared) | Role |
| --- | --- | --- | --- |
| `background` / `foreground` | `#0B0F14` / `#E5E7EB` | `#F7F8FA` / `#0B0F14` | Page |
| `card` / `card-foreground` | `#141920` / `#E5E7EB` | `#FFFFFF` / `#0B0F14` | Cards, panels |
| `popover` / `popover-foreground` | `#1E242B` / `#E5E7EB` | `#FFFFFF` / `#0B0F14` | Menus, tooltips, dialogs |
| `primary` / `primary-foreground` | `#FF2D2D` / `#0B0F14` | `#C8102E` / `#FFFFFF` | Main action |
| `primary-hover` | `#FF4D4D` | `#A50D26` | Hover of the main action |
| `secondary` / `secondary-foreground` | `#1E242B` / `#E5E7EB` | `#EDF0F3` / `#1E242B` | Secondary action |
| `muted` / `muted-foreground` | `#1E242B` / `#9BA5B3` | `#EDF0F3` / `#4B5563` | Quiet surfaces, supporting text |
| `accent` / `accent-foreground` | `#252C34` / `#E5E7EB` | `#E9ECF0` / `#0B0F14` | Hover and selected rows (neutral, not red) |
| `destructive` (+ `-subtle`) | `#FF6B6B` (+ `#2B1416`) | `#B91C1C` (+ `#FDECEC`) | Irreversible actions, errors, critical findings |
| `border` | `#2A313A` | `#DCE1E7` | Dividers, card outlines |
| `input` | `#5B6573` | `#8A94A3` | Field borders (≥ 3:1 against the background) |
| `ring` | `#FF2D2D` | `#C8102E` | Focus indicator |
| `success` (+ `-subtle`) | `#4ADE80` | `#15803D` | Passed checks, resolved findings |
| `warning` (+ `-subtle`) | `#FBBF24` | `#A16207` | Items needing review |
| `info` (+ `-subtle`) | `#7DC4D6` | `#0E7490` | Neutral information, scheduled items |
| `sidebar-*` | `#0E1318` base | `#FFFFFF` base | Application sidebar |
| `chart-1…5` | red and graphite steps | red and graphite steps | Data visualization |

Shape and depth:

| Token | Value | Rule |
| --- | --- | --- |
| `--radius` | `0.5rem` | Scale: `radius-sm` … `radius-4xl` derive from it |
| `shadow-card` | 1–2 px, low opacity | Cards only |
| `shadow-popover` | 12/32 px, soft | Menus and dialogs only |

No glow, neon or glassmorphism. Gradients are limited to the app icon artwork.

## 3. Typography

The application uses two product families and a separate brand face, each with its own job.

| Token | Family | Loaded by | Use |
| --- | --- | --- | --- |
| `--font-sans` | Geist Sans | `next/font/google` (variable font) | **Default.** Headings, forms, labels, buttons, navigation, dialogs, cards, tables, metrics, notifications, settings, descriptions |
| `--font-mono` | Geist Mono | `next/font/google` (variable font) | Agent, assessment and execution IDs, API values, security logs, code, timestamps |
| `--font-brand` | Ethnocentric | local `@font-face` (development only, see §9) | The REDOVA wordmark and explicit brand moments only |

Utilities:

- `type-technical`: Geist Mono with tabular figures, for identifiers, timestamps and log lines.
- `type-brand`: Ethnocentric, uppercase, wide tracking, for brand moments.

Scale (Geist Sans):

| Role | Classes |
| --- | --- |
| Page title | `text-3xl font-semibold tracking-tight` (hero: `text-4xl`) |
| Section title | `text-xl font-semibold tracking-tight` |
| Card title | `text-base font-medium` |
| Body | `text-sm` |
| Caption | `text-xs text-muted-foreground` |

### Ethnocentric restrictions

- Never use it for headings, labels, buttons, navigation, tables or body copy. `--font-heading` is Geist Sans.
- The official logo is the reference for brand lettering. Ethnocentric is close to it but **not an exact match**: the logo's letterforms are customized, for example the "O" with its central dot. Pixel-accurate branding uses the logo assets, never live text.
- Without the local font file, `--font-brand` falls back to Geist Sans. Production builds and CI therefore always render brand moments with the logo images.

## 4. Logo system

Assets live in `apps/web/public/brand/` and are rendered by `components/brand/brand-logo.tsx` (`<BrandLogo variant appearance />`). In file names, `dark`/`light` names the **background** the asset is designed for, not the ink color. `appearance="auto"` follows the theme.

| Variant | Files | Use |
| --- | --- | --- |
| `signature` | `logos/redova-signature-{dark,light}.{png,webp,jpg}` | Full logo with "AI Agent Security": sign-in and sign-up screens |
| `horizontal` | `logos/redova-horizontal-*` | Top navigation, headers (≥ 140 px wide) |
| `stacked` | `logos/redova-stacked-*` | Documents, covers, splash |
| `wordmark` | `logos/redova-wordmark-*` | Tight horizontal spaces |
| `mark` | `marks/redova-mark-*` | Collapsed sidebar (`components/brand/sidebar-brand.tsx`), avatars |
| Icons | `icons/favicon-{16…64}.png`, `favicon.ico`, `apple-touch-icon.png`, `app-icon-{192,512,1024}.png`, `social-avatar.png` | Browser, home screen, social |

Rules:

- Do not stretch, recolor, outline, add shadows to or recreate the logo with CSS or fonts.
- Keep clear space of at least ¼ of the emblem width around the logo.
- Below 24 px, use the favicon instead of the emblem.

### Assets still to supply

The current files are raster crops of the supplied branding board (`public/brand/reference/`). They preserve the identity but are not production masters. Please supply:

1. Vector masters (SVG or AI/PDF with outlined lettering) of the horizontal logo, the signature (with tagline), the stacked logo, the wordmark and the emblem.
2. For each: a version for dark backgrounds (light lettering) and one for light backgrounds (dark lettering), plus single-color black and white versions.
3. A simplified emblem designed for 16–32 px (favicon) if the full emblem loses detail at that size.

When they arrive, replace the PNG files and keep the same names so `BrandLogo` needs no change.

`app/globals.css` is the only token source. Obsolete exports from the earlier brand board have been removed.

## 5. Themes

- **Dark is the default** (`:root` and `.dark`). `BrandThemeProvider` uses `next-themes` with `defaultTheme="dark"` and no system switching.
- **Light is prepared** (`.light`) for future use. In light mode the action red darkens to `#C8102E` so that white text stays at AA. `#FF2D2D` remains the logo color on both themes.
- shadcn components rely on the `dark:` variant. It applies whenever the `dark` class is on `<html>`, which is the default.

## 6. Component conventions

These apply to the existing shadcn/ui library (`components/ui/*`, Base UI "rhea" preset). Do not reinitialize or restyle the preset globally; adjust through tokens.

| Component | Convention |
| --- | --- |
| Button | `default` (red) for the single main action. `secondary`, `outline` and `ghost` for the rest. `destructive` for irreversible actions, with confirmation. Labels name the action ("Run assessment", not "Submit"). |
| Input | `border-input`. `aria-invalid` shows the destructive state. The error message goes below the field, in `text-destructive`. |
| Card | `bg-card`, `border`, `shadow-card`. No nested cards for layout. |
| Badge | Statuses: `destructive` (open or critical), `warning` (in review), `success` (resolved), `info` (scheduled), `outline` (draft). Always with text, never color alone. |
| Checkbox / Switch | The checked state uses `primary`. Each one is wrapped by a `Label`. |
| Select / Dropdown Menu | `popover` surface, `accent` for the highlighted item, red only for a destructive menu item. |
| Dialog / Sheet | `popover` surface, `shadow-popover`. One primary action, focus trapped, closable with Escape. |
| Tabs | Neutral surfaces. The active tab uses foreground contrast, not red fill. |
| Tooltip | Short, non-essential hints. `TooltipProvider` is mounted once in `BrandThemeProvider`. |
| Table | Identifier columns use `type-technical`. Status columns use badges. Numbers are right-aligned. |
| Skeleton | `bg-muted`, shaped like the content it replaces. Mark it `aria-hidden`. |
| Toast | `sonner` (`Toaster` mounted once). The text matches the action ("Assessment scheduled"). |

Sizes stay on the preset scale: controls are `h-8` by default, `h-7` small, `h-9` large. Do not mix custom heights.

## 7. Accessibility

- **Contrast:** text meets WCAG AA (4.5:1; 3:1 for large text). Field borders and focus indicators meet 3:1. Key pairs, all checked:
  - dark theme: `#0B0F14` on `#FF2D2D` 5.2:1; `#E5E7EB` on `#0B0F14` 15.5:1; `#9BA5B3` on `#1E242B` 6.3:1;
  - light theme: `#FFFFFF` on `#C8102E` 5.9:1.
- **White on `#FF2D2D` (3.7:1) is not allowed for text.** In the dark theme, primary buttons use dark text.
- **Focus:** every interactive element shows a visible focus indicator (`ring`, 2 px outline fallback). Never remove an outline without a replacement.
- **Motion:** `prefers-reduced-motion` reduces animations and transitions globally. Motion is functional (feedback, state change), never decorative.
- **Semantics:** logos have `alt="REDOVA"`, or are decorative next to visible text. Icons inside buttons need an accessible label. Status is never conveyed by color alone.

## 8. Responsive rules

- Mobile first. The content width is `max-w-6xl` with `px-4 sm:px-6`. There is no horizontal scroll at 360 px.
- Touch targets are at least 44 × 44 px on mobile, for example `size-11` icon buttons in headers.
- Tables scroll horizontally inside their container rather than overflowing the page.
- On mobile, the navigation and the sidebar collapse into a sheet. A collapsed desktop sidebar shows the emblem.

## 9. Licensing

| Asset | License | Status |
| --- | --- | --- |
| Geist Sans, Geist Mono | SIL Open Font License 1.1 | Loaded with `next/font/google`, self-hosted by Next.js at build time |
| Ethnocentric (Typodermic) | **Typodermic Desktop EULA** (downloaded from DaFont) | **Local development only.** The file is at `apps/web/public/fonts/local/`, which is git-ignored. It is not committed, not converted and not deployed. |
| REDOVA logo artwork | Project-owned | Raster crops of the supplied board; vector masters pending (§4) |

The Desktop EULA (v260817) allows Ethnocentric on the licensee's workstation and in finished artwork (§2.2). It forbids:

- website, webfont, app and SaaS embedding (§4.3);
- conversion, for example to WOFF2 (§4.2);
- publishing or sharing the file (§4.1); the GitHub repository is public.

Before Ethnocentric can be used as live text in any deployed environment, buy a web/app embedding license (MyFonts). Then add the licensed WOFF2 with `next/font/local` as `--font-brand`. Otherwise brand typography reaches users only through the logo images, or through outlined SVG artwork created under §2.2.
