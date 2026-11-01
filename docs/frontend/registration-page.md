# REDOVA — Registration

Route : `/sign-up`, accessible depuis « Create account » sur `/sign-in`. Le lien « Sign in » revient à la connexion. La page suit la référence « REDOVA Secure AI Registration UI » : serveur et bouclier lumineux à gauche, formulaire sombre à droite, branding officiel et texte Geist Sans.

## Composition

- `app/(auth)/sign-up/page.tsx` : Server Component, composition et métadonnées via `createAuthMetadata`.
- `AuthLayout`, `BrandLogo`, `AuthReveal` et `HeroFeatureList` : décor, marque, présentations et animations partagés avec les autres écrans.
- `RegistrationHero` : titre en deux lignes, description, bénéfices et citation décorative.
- `RegistrationCard` : présentation du formulaire, bouton SSO, retour à la connexion et dialogues de disponibilité.
- `RegistrationForm` : React Hook Form/Zod, état de soumission et frontière d’intégration.
- `AuthTextField` : structure commune du nom et de l’email, avec icône, libellé et erreur.
- `PasswordField`, `PasswordStrength` et `password-policy.ts` : contrôles et estimation existants, réutilisés avec des styles spécifiques. Les champs de la réinitialisation gardent leur comportement.
- `RegistrationConsent` : contrôle d’acceptation, liens ou boutons des documents, erreur accessible. Les actions de consultation des documents ne cochent pas la case.
- `registration-schema.ts` : validation et types. Le nom et l’email sont nettoyés ; le mot de passe est conservé tel que saisi.

Le bouton SSO existant accepte maintenant une classe, une icône et un élément final facultatifs. La connexion conserve son apparence initiale. Aucune dépendance supplémentaire ni modification du backend.

## Validation et intégration

Champs : nom complet, email, mot de passe, confirmation et acceptation. Tous commencent vides ; la case est décochée. Le nom accepte aussi les noms composés d’un seul mot et est limité à 200 caractères côté interface. L’email est limité à 254 caractères. Les mots de passe utilisent la règle réelle du serveur : 12–128 caractères. Les mélanges de caractères sont des conseils facultatifs et ne bloquent pas une phrase de passe valide. La confirmation doit être identique. La robustesse affichée est une estimation locale, pas un contrôle des mots de passe compromis.

```ts
type RegistrationDetails = {
  name: string;
  email: string;
  password: string;
  acceptedTerms: true;
};
type SignUpHandler = (
  details: RegistrationDetails,
) => Promise<{ error?: string } | void>;
```

`RegistrationCard` accepte `onSignUp`, `onSSO`, `termsHref` et `privacyHref`. Un adaptateur client fournira l’appel Better Auth, l’URL de vérification de confiance, la gestion des erreurs et les redirections appropriées. Le mot de passe de confirmation n’est pas envoyé au callback. Sans adaptateur, une soumission valide affiche une indisponibilité explicite : aucune création de compte ou émission d’email n’est simulée. Le spinner reflète uniquement une promesse réelle. Après résolution réelle sans erreur, les valeurs sont effacées et une confirmation générique invite à consulter la messagerie sans révéler si un compte existe.

L’utilisateur a confirmé ne pas avoir encore d’URL pour les documents juridiques. « Terms of Service » et « Privacy Policy » ouvrent donc des dialogues de disponibilité, sans contenu juridique inventé ni liens cassés. La case sert à préparer le parcours visuel ; le recueil de consentement en production, sa version et son enregistrement restent à définir avec les documents réels et l’intégration serveur. La validation finale reste appliquée côté serveur.

## Responsive, mouvement et accessibilité

À 1586×992, la carte mesure environ 720×922 px, à x=805, y=34. À 1536×842, elle se compacte à environ 699×784 px. Sur desktop à faible hauteur (760 px ou moins), nom et email se présentent côte à côte pour réduire la hauteur ; à 1280×720, la carte mesure environ 663×684 px. Sous 1100 px de large, une seule colonne est affichée et les bénéfices/citation décoratifs sont retirés. Sur mobile, la page peut défiler pour garder tous les contrôles accessibles.

La carte apparaît avec un fondu et une translation courte ; les deux lignes du titre et les groupes de champs apparaissent progressivement. Les barres de robustesse suivent la saisie. Le bouton se comprime à l’appui et sa flèche se décale au survol. Les points rouges/gris en haut de carte sont uniquement décoratifs ; ils n’annoncent pas un assistant à plusieurs étapes. Pas d’animation permanente.

Le mode sombre est fixe, même si une préférence claire est enregistrée sur une autre page. Le lien d’évitement cible le nom. Les libellés et erreurs sont associés aux champs, la robustesse utilise un indicateur accessible, chaque mot de passe possède un contrôle de visibilité indépendant. `prefers-reduced-motion` supprime les déplacements et affiche immédiatement les contenus. Sans JavaScript, les contenus restent visibles et les champs, l’acceptation et les soumissions restent désactivés. Le formulaire utilise `method="post"`. Les identifiants ne sont ni journalisés, ni enregistrés dans les stockages du navigateur, ni transmis dans l’URL.

## Métadonnées

Titre, description, canonique, Open Graph, Twitter, icônes et viewport sombre sont configurés côté serveur via les utilitaires partagés. Les paramètres de requête n’entrent pas dans les URL canoniques/de partage. La page d’authentification est en `noindex`, avec `Referrer-Policy: no-referrer` et l’en-tête robots correspondant. Configurer `NEXT_PUBLIC_SITE_URL` avant le build de production. Aucun score SEO Lighthouse de 100 n’est revendiqué.

Captures : [desktop](registration-desktop.png), [mobile](registration-mobile.png).

## Validation effectuée

`pnpm --filter @redova/web lint`, `pnpm --filter @redova/web typecheck` et `pnpm --filter @redova/web build` réussis. Les vérifications navigateur ont aussi été exécutées sur `next start`, après le build de production : navigation depuis/vers la connexion, champs vides et invalides, confirmation différente, acceptation au clavier, consultation des documents sans cocher automatiquement la case, SSO, visibilité indépendante des mots de passe et phrase de passe sans mélange obligatoire. Sans adaptateur, aucune fausse réussite, aucun appel d’authentification et aucun stockage d’identifiants.

Tailles vérifiées : 320×740, 390×844, 768×1024, 1024×768, 1100×700, 1280×720, 1440×900, 1536×842, 1586×992, 1920×1054 et 2560×1440. Aucun débordement horizontal. Métadonnées et en-têtes, préférence claire enregistrée, clavier, mouvement réduit et absence de JavaScript vérifiés. Les composants de mot de passe et SSO ont aussi été revérifiés sur les pages existantes, ainsi que les validations de récupération. Aucune erreur client/d’hydratation observée. Les captures livrées proviennent de la version de production.

## Décor généré

Asset : `apps/web/public/images/auth/registration-security-background.webp` (1586×992, environ 76 Ko), produit avec le skill `imagegen` et l’outil intégré, puis converti en WebP. L’image contient uniquement l’environnement ; les textes, logos et formulaires sont des éléments séparés.

Consigne de génération :

> Use case: stylized-concept. Asset type: production website background artwork, wide 1586 x 992 (16:10). Input image 1 is only a composition/style reference for the environment. Reconstruct ONLY the cinematic data-center corridor background, remove ALL UI, text, logos, headers, buttons, cards, fields and quote. Preserve exact reference composition: almost-black background, a long perspective futuristic server-room corridor begins across the lower left and recedes toward a vanishing point at x=595 y=580 (37.5% width, 58.5% height). Tall obsidian server racks along both corridor walls, fine vivid scarlet strips and small red indicators. Overhead rectangular red light bars recede into distance. Glossy black tiled floor in the lower half reflects red light in perspective. A red luminous holographic shield with a simple closed padlock at its center floats near the vanishing point, centered at x=595 y=550, shield about 130 pixels wide and 175 pixels high. This shield/padlock is environmental artwork, not a UI badge; keep it behind the text-safe foreground. Keep LEFT upper foreground from x=0 to 600, y=0 to 420 very dark with subtle architecture so HTML headlines can be placed there; racks start mostly at x=400. RIGHT half x=805 to 1586 must be dark nearly black quiet negative space for a separate real HTML registration card. Extend black server room naturally behind where the reference form was, no ghost rectangle or rounded panel. Premium realistic polished obsidian and graphite materials, black #0B0F14, muted #1E242B, controlled neon scarlet #FF2D2D, atmospheric security aesthetic. Constraints: ONLY environmental background; absolutely no readable letters, logos, wordmarks, text, UI fields, buttons, borders, floating UI panels, annotations, watermarks. Do not render a webpage screenshot.
