# REDOVA — Password recovery

Route : `/forgot-password`, reliée au lien « Forgot password? » de `/sign-in`. Le lien « Back to sign in » revient à la connexion. `/reset-password` reste l’étape distincte où l’utilisateur choisit son nouveau mot de passe après avoir suivi le lien reçu par email.

## Composition

- `app/(auth)/forgot-password/page.tsx` : Server Component, composition et métadonnées.
- `CenteredAuthLayout` : variante centrée d’`AuthLayout`, avec le logo officiel, le décor indépendant, le mode sombre fixe et le lien d’évitement. Il réutilise aussi le repli sans JavaScript et les adaptations de mouvement du layout existant.
- `ForgotPasswordCard` : logo, icône email, titre, explications, formulaire et retour à la connexion.
- `ForgotPasswordForm` : React Hook Form/Zod, email, validation, erreur, attente et confirmation après résolution réelle du callback.
- `AuthReveal` : apparition de la carte et progression des éléments avec `motion/react`, déjà installé. Le bouton comprime à l’appui ; l’avion et la flèche se déplacent légèrement au survol. Aucun mouvement permanent.
- `lib/auth-metadata.ts` : métadonnées et viewport partagés par les deux pages de récupération. Les URL canoniques et de partage excluent les paramètres et fragments.

Les composants `Card`, `Input`, `Label`, `Button` et `BrandLogo` sont réutilisés. Le texte est en Geist Sans. Aucune nouvelle dépendance et aucune modification du backend.

## Frontière d’intégration

```ts
type RequestPasswordResetHandler = (
  email: string,
) => Promise<{ error?: string } | void>;
```

Un adaptateur client pourra fournir `onRequestReset` à `ForgotPasswordCard`. Il sera responsable de l’appel Better Auth et de l’URL de retour de confiance vers `/reset-password`. Le formulaire transmet uniquement l’email nettoyé au callback ; il n’appelle actuellement aucune API et ne stocke ni ne journalise l’adresse. Sans adaptateur, une soumission valide affiche une indisponibilité explicite ; aucun email envoyé n’est simulé.

Lorsque le callback résout sans erreur, la confirmation reste générique : « If an account exists for this email, you’ll receive a password reset link shortly. » Le champ est alors effacé. L’adaptateur devra conserver cette neutralité pour éviter de révéler si un compte existe. Le spinner reflète uniquement une requête réellement en cours.

Le formulaire utilise `method="post"`, reste désactivé avant hydratation et explique le besoin de JavaScript si celui-ci est absent. Le champ a un libellé associé, des attributs d’autocomplétion et des erreurs accessibles. Le titre est présent côté serveur. `prefers-reduced-motion` conserve tous les contenus visibles sans translation. Les cibles d’action mesurent au moins 44 px.

## Responsive et métadonnées

À 1586×992, la carte mesure environ 624×702 px, à x=481, y=193, proche de la référence. Sous 880 px de hauteur desktop, le logo, l’icône et les espacements se compactent. Sur mobile, la carte reste centrée et défile normalement si nécessaire. Aucun zoom CSS ni détection du navigateur n’est utilisé.

Titre, description, canonique, Open Graph, Twitter et viewport sombre sont configurés côté serveur. `noindex` est volontaire pour ce parcours privé ; aucun score Lighthouse SEO de 100 n’est revendiqué. Les deux routes de récupération partagent `Referrer-Policy: no-referrer` et `X-Robots-Tag: noindex, nofollow, noarchive`. Configurer `NEXT_PUBLIC_SITE_URL` avant le build de déploiement.

Captures : [desktop](forgot-password-desktop.png), [mobile](forgot-password-mobile.png).

Validation finale : `pnpm --filter @redova/web lint`, `pnpm --filter @redova/web typecheck` et `pnpm --filter @redova/web build` réussis. Les vérifications navigateur ont aussi été exécutées sur `next start` : navigation aller-retour depuis la connexion, validation email, absence de fausse confirmation sans adaptateur, absence d’appel d’authentification et de stockage de l’adresse, préférence claire enregistrée, clavier, mouvement réduit, absence de JavaScript, métadonnées et en-têtes. La réinitialisation existante conserve son rendu et sa validation après mutualisation des métadonnées. Aucune erreur client ou d’hydratation observée.

Tailles vérifiées sans débordement horizontal : 320×740, 390×844, 768×1024, 1024×768, 1100×700, 1280×720, 1440×900, 1536×842, 1586×992, 1920×1054 et 2560×1440. Les captures ci-dessus proviennent de la version de production.

## Décor

Asset livré : `apps/web/public/images/auth/password-recovery-landscape.webp` (1586×992, environ 156 Ko). Généré avec le skill `imagegen`, outil intégré, puis converti en WebP. La capture complète n’est jamais utilisée comme fond : seuls le globe, l’eau, les reliefs et les tours sont présents dans cet asset. Les logos officiels sont des images séparées.

Consigne de génération :

> Reconstruct only the cinematic environment of the reference, landscape 1586×992. Remove every UI element, panel, wordmark, text, icon, field, divider and button. Nearly black overcast sky; huge scarlet holographic globe with dotted American continents on the left, fine orbital arcs and bright nodes. Black volcanic ridges in the lower corners, reflective lake across the lower quarter. Angular obsidian towers with narrow red light strips and antennas on the right. Keep the central area dark for a real HTML card. Realistic rock, subtle atmospheric mist, charcoal #0B0F14 and neon #FF2D2D. No rectangle silhouette, typography, logos, emblems, UI or watermark.
