# REDOVA — Reset password

Route : `/reset-password`. La page reprend la référence du 1 novembre 2026 à 12:39, avec les logos officiels existants et Geist Sans. Le fond est une illustration séparée ; les textes, contrôles, panneaux et lumières de l’interface sont rendus en HTML/CSS.

## Composition

- `app/(auth)/reset-password/page.tsx` : Server Component, composition et métadonnées.
- `lib/auth-metadata.ts` : règles de métadonnées et viewport partagées avec `/forgot-password`.
- `AuthLayout` : décor, colonnes, mode sombre fixe et lien d’évitement. La connexion et la réinitialisation fournissent chacune leur héros et leur carte.
- `ResetPasswordHero` : titre en trois lignes, bénéfices via `HeroFeatureList` et annotation décorative.
- `ResetPasswordCard` : logo, cadenas, explications, formulaire et lien réel vers `/sign-in`.
- `ResetPasswordForm` : React Hook Form, Zod, états de validation et callback asynchrone.
- `PasswordField` : libellé, contrôle de visibilité indépendant, association des aides et erreurs au champ.
- `PasswordStrength` et `PasswordRequirements` : estimation locale de robustesse, barres animées et liste de conseils.
- `password-policy.ts` : longueur 12–128 alignée sur `packages/auth/src/create-auth.ts`. Les majuscules, minuscules, chiffres et symboles sont des conseils facultatifs ; ils ne bloquent pas une phrase de passe valide.
- `reset-password.module.css` : styles spécifiques et responsive, avec une variante compacte pour les écrans de faible hauteur. Les composants shadcn/Base UI, tokens et animations partagés sont réutilisés sans nouvelle dépendance. La page reste sombre même si une préférence claire a été enregistrée sur une autre page. Le message d’inscription et le changement de thème ont été retirés.

## Animations et accessibilité

La carte entre depuis la droite avec un fondu, sans reprendre le zoom de la connexion. Le titre apparaît ligne par ligne derrière un masque. Les bénéfices, champs et conseils arrivent progressivement avec de légères translations. Les barres de robustesse évoluent à la saisie ; le bouton comprime à l’appui, fait pivoter son icône au survol et déplace sa flèche.

`prefers-reduced-motion` affiche immédiatement le contenu et supprime les déplacements. Les lecteurs d’écran reçoivent le titre complet, les erreurs associées aux champs et une estimation de robustesse accessible. Le lien d’évitement rejoint le premier champ. Les boutons de visibilité disposent de noms distincts et de cibles de 44 px. Sans JavaScript, les contenus restent visibles et le formulaire est désactivé avec une explication. Aucun mouvement permanent n’est utilisé.

## Intégration future

```ts
type ResetPasswordHandler = (
  newPassword: string,
) => Promise<{ error?: string } | void>;
```

Un adaptateur client pourra fournir `onResetPassword` à `ResetPasswordCard`. Il devra gérer le jeton Better Auth, l’appel de réinitialisation, les liens invalides/expirés et l’écran ou la redirection de réussite. La présentation n’appelle actuellement aucune API, ne lit aucun jeton, ne simule aucune réussite et affiche une indisponibilité explicite après une soumission valide sans adaptateur. Le spinner est lié uniquement à la promesse réelle du callback.

Les champs commencent vides. La capture remplie utilise une valeur fictive saisie uniquement pendant la vérification navigateur. Aucun mot de passe n’est journalisé, conservé dans le stockage du navigateur ou transmis dans l’URL. La politique et la vérification des mots de passe compromis restent appliquées par le serveur lors de la future intégration. L’indicateur de robustesse est une estimation de longueur/diversité, pas un contrôle de compromission.

## Métadonnées et confidentialité

Titre, description, canonique, Open Graph, Twitter, icônes héritées du layout et viewport responsive sont rendus côté serveur. Le canonique et les URL de partage excluent tous les paramètres de requête. Configurer `NEXT_PUBLIC_SITE_URL` avec l’origine publique du frontend avant le build de déploiement.

La récupération de compte est volontairement exclue de l’indexation : balise robots et en-tête `X-Robots-Tag: noindex, nofollow, noarchive`. `Referrer-Policy: no-referrer` évite de transmettre l’URL de récupération comme référent. Ne pas bloquer cette route dans `robots.txt` : les moteurs doivent pouvoir lire son `noindex`.

Un score SEO Lighthouse de 100 n’est pas revendiqué : son audit d’indexabilité considère `noindex` comme un échec, alors que cette exclusion est adaptée à une page de récupération de compte. Références : [audit Lighthouse](https://developer.chrome.com/docs/lighthouse/seo/is-crawlable), [documentation Google sur noindex](https://developers.google.com/search/docs/crawling-indexing/block-indexing).

## Vérification

La carte est limitée à 640 px de large et mesure environ 743 px de haut, contre 784×878 px auparavant. Elle est centrée dans la colonne de droite et tient entièrement à 1536×842. Pour une hauteur de viewport inférieure ou égale à 800 px sur desktop, les espacements, le cadenas et l’en-tête se compactent davantage. Les contrôles conservent au moins 44 px de hauteur. Le formulaire reste vide au chargement. Sous 1100 px, les colonnes deviennent une seule colonne et les petites hauteurs défilent normalement.

Vérification navigateur : aucun débordement horizontal ni carte coupée sur mobile, tablette et desktop, notamment à 1536×842 et 1920×1054. Contrôles supplémentaires : maintien du mode sombre malgré une préférence claire enregistrée, retrait des actions d’inscription/thème, validation, confirmation différente et visibilité indépendante. Les contrôles précédents de mouvement réduit, absence de JavaScript, absence de stockage/appel d’authentification, métadonnées et en-têtes sans fuite de jeton restent documentés. La connexion conserve son comportement et aucune erreur client/d’hydratation n’a été observée.

Captures de la version de production : [desktop](reset-password-desktop.png), [mobile](reset-password-mobile.png).

Validation finale : `pnpm --filter @redova/web lint`, `pnpm --filter @redova/web typecheck` et `pnpm --filter @redova/web build` réussis. Les vérifications navigateur ont également été exécutées sur `next start`, après le build de production.

## Illustration

Asset : `apps/web/public/images/auth/reset-security-background.webp`, 1586×992, environ 60 Ko. Généré avec l’outil intégré image_gen à partir de la référence, puis converti en WebP. Le bouclier officiel est affiché séparément avec `BrandLogo` ; aucune police Ethnocentric n’est requise.

Consigne de génération :

> Reconstruct only the cinematic background from the supplied reset-password UI, not the webpage. Wide 16:10 landscape. No text, letters, logos, cards, forms, buttons, icons, annotations or watermark. Almost-black graphite angular architecture with diagonal faceted panels and thin scarlet seams near 40% width. Quiet dark space at top-left for HTML text. Bottom-left: detailed armored robot head and shoulder facing right, brushed gunmetal, scarlet concentric ear core and finely illuminated edges. Right half nearly black for the separate form. Realistic materials and controlled haze.
