# REDOVA — Logo officiel : bouclier et point rouge

La référence retenue est **ChatGPT Image Nov 1, 2026, 10_12_17 AM.png**, première image fournie, avec ses deux variantes claire et sombre. Les logos finaux viennent des pixels de cette image. Les essais de génération d’image ont été écartés : ils modifiaient les contours et le lettrage.

## Fichiers prêts à utiliser

Tous les chemins ci-dessous sont relatifs à `apps/web/public/brand`. `light` désigne un fond de destination clair ; `dark` désigne un fond sombre.

| Dossier / fichiers                                     | Usage                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `logos/redova-horizontal-{light,dark}.{png,webp,jpg}`  | Header, navigation, sidebar ouverte ; symbole et mot REDOVA sans signature      |
| `logos/redova-signature-{light,dark}.{png,webp,jpg}`   | Page d’accueil, connexion, inscription ; logo et « AI AGENT SECURITY » original |
| `logos/redova-stacked-{light,dark}.{png,webp,jpg}`     | Disposition verticale, panneau d’accueil, documents                             |
| `logos/redova-wordmark-{light,dark}.{png,webp,jpg}`    | Mot REDOVA seul, lettrage original                                              |
| `marks/redova-mark-{light,dark}.{png,webp,jpg}`        | Sidebar repliée, mobile, avatar de marque                                       |
| `icons/app-icon-{192,512,1024}.png`                    | Icône d’application, fond graphite carré                                        |
| `icons/apple-touch-icon.png`                           | Écran d’accueil iOS, 180 × 180 px                                               |
| `icons/social-avatar.{png,jpg}`                        | Avatar social, 1024 × 1024 px                                                   |
| `icons/favicon-{16,32,48,64}.png`, `icons/favicon.ico` | Favicon avec le symbole officiel ; ICO multitailles 16/32/48 px                 |
| `reference/original-crop-{light,dark}.png`             | Découpes sources exactes, avec le fond de la planche                            |
| `reference/pixel-proof.json`                           | Coordonnées et empreintes SHA-256 RGBA des découpes originales                  |
| `index.html`                                           | Aperçu local des variantes et des usages                                        |

**PNG** : transparence pour l’interface, sans compression destructive. **WebP** : export lossless avec transparence. **JPG** : fond clair ou graphite déjà appliqué ; ce format ne prend pas en charge la transparence et sa compression est destructive.

## Fidélité et résolution

Les deux fichiers `reference/original-crop-*.png` contiennent exactement les mêmes pixels RGBA que les rectangles correspondants de l’image originale : comparaison octet par octet effectuée. Le fichier `pixel-proof.json` limite explicitement cette garantie à ces découpes.

Les assets transparents retirent le fond et les traits de construction. Les variantes d’interface réassemblent les éléments et centrent le lettrage lorsque la signature est absente. Ces opérations modifient le masque alpha ou la composition ; elles ne constituent pas une garantie d’identité de tous les pixels avec la planche complète. Les couleurs et le lettrage proviennent du PNG source, sans recréation par police ni filtre d’inversion.

La source fournie mesure **1448 × 1086 px**. Un logo horizontal natif fait environ 1168 × 280 px ; le symbole fait environ 250 × 280 px avant ajout des marges. Les exports 512/1024 px sont des agrandissements et ne créent pas de détails supplémentaires. Pour une véritable version vectorielle et une impression très grand format, il faut le fichier graphique original ; aucun SVG vectoriel approximatif n’est fourni comme s’il était identique.

## Composants React

```tsx
import { BrandLogo } from '@/components/brand/brand-logo';

<BrandLogo className="w-44" />
<BrandLogo variant="signature" className="w-full max-w-3xl" />
<BrandLogo variant="mark" className="w-8" />
<BrandLogo variant="stacked" className="w-56" />
<BrandLogo variant="wordmark" className="w-36" />
<BrandLogo appearance="dark" className="w-44" />
```

Le mode `appearance="auto"` est le défaut : CSS choisit l’image selon la classe `.dark`, sans attendre de résolution de thème côté client. `appearance="light"` ou `"dark"` permet de fixer une variante sur un panneau de couleur connue. Les proportions sont réservées avant chargement. L’optimisation destructive des PNG est désactivée.

Dans un lien déjà nommé, utiliser `decorative` et donner au lien un nom accessible, par exemple `aria-label="REDOVA — Accueil"`.

```tsx
import { SidebarBrand } from '@/components/brand/sidebar-brand';
import { Sidebar, SidebarHeader, SidebarProvider } from '@/components/ui/sidebar';

<SidebarProvider>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarBrand href="/" />
    </SidebarHeader>
  </Sidebar>
</SidebarProvider>;
```

`SidebarBrand` choisit le logo horizontal à l’état ouvert, le symbole à l’état replié, et le logo complet dans le tiroir mobile. Il est fourni sans navigation métier ni contrôle d’autorisation.

## Police

Le lettrage **REDOVA** et la signature **AI AGENT SECURITY** sont conservés dans les images : leur forme ne dépend d’aucune police installée.

Geist est utilisée pour le texte et les titres ; Geist Mono pour les données techniques. Ethnocentric est réservée aux accents de marque. Le fichier actuellement fourni est une version Desktop, conservée localement avec sa licence dans `public/fonts/local/`. Son intégration comme police web nécessite une version et une licence adaptées ; les conditions sont détaillées dans `docs/design-system/README.md`, section Licensing. Orbitron a été retirée.

## Palette et composants

La palette, les thèmes et les tokens en vigueur sont définis uniquement dans `apps/web/app/globals.css` et documentés dans `docs/design-system/README.md`. Les anciens exports de tokens et leur rapport de contraste ont été retirés pour éviter plusieurs sources de vérité. Aucun script de génération de marque n’est conservé.

Ne pas étirer le logo, inverser ses couleurs avec un filtre CSS, redessiner son mot-symbole ou ajouter des effets. Conserver une marge autour du symbole et choisir une image adaptée à la surface réelle. Le symbole est préférable au logo complet dans les espaces étroits.
