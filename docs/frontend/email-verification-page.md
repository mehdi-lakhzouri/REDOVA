# REDOVA — Email verification

Route : `/verify-email`. L’écran suit la référence « REDOVA Neon Email Verification Interface » : illustration holographique à gauche et carte sombre à droite. Le logo officiel et les textes sont rendus séparément du décor. Le mode sombre est fixe et les textes utilisent Geist Sans.

## Composition

- `app/(auth)/verify-email/page.tsx` : Server Component, métadonnées partagées et composition avec `AuthLayout`.
- `EmailVerificationHero` : logo officiel et signature ; l’illustration de gauche appartient au décor.
- `EmailVerificationCard` : titre, adresse affichée, explications, action de renvoi et note d’accès.
- `EmailVerificationBadge` : illustration de courrier en CSS et icônes Lucide. La coche est décorative et n’affirme pas que le compte est vérifié.
- `EmailVerificationActions` : callback asynchrone, attente, erreur, confirmation générique et délai avant un nouveau renvoi.
- `useCooldown` : décompte fondé sur une échéance réelle, avec arrêt et nettoyage du timer. Il tient compte du temps écoulé dans un onglet suspendu.

`AuthLayout`, `AuthReveal`, `BrandLogo`, `Card`, `Button`, les tokens et `motion/react` sont réutilisés. Aucune nouvelle dépendance et aucune modification du backend. Les couleurs, bordures et lumières propres à cet écran restent dans `email-verification.module.css`.

## Intégration et états réels

```ts
type EmailVerificationCardProps = {
  email?: string;
  verificationRequested?: boolean;
  onResend?: () => Promise<{
    error?: string;
    retryAfterSeconds?: number;
  } | void>;
};
```

Les composants de présentation exposent cette frontière d’intégration. Un adaptateur `VerifyEmailView` est également présent dans la route et a été conservé : il lit le contexte d’adresse de l’inscription via `pending-verification.ts` (stockage limité à l’onglet), appelle `authClient.sendVerificationEmail` et lit la session avec `useSession`. L’adresse du composant est uniquement destinée à l’affichage ; le callback possède son propre contexte. L’adresse et le jeton ne sont pas lus depuis les paramètres de requête pour alimenter ce contexte. Aucun mot de passe n’est ajouté à ce contexte.

En accès direct sans contexte d’inscription, le libellé « Your account email » remplace l’adresse et l’accroche invite à consulter la messagerie. L’adaptateur invite alors à se connecter pour demander un nouveau lien ; il ne lance pas un renvoi vers une adresse arbitraire de l’URL. « We’ve sent a verification link to » ne s’affiche que si le contexte fournit une adresse et `verificationRequested`. Lorsque le composant est utilisé sans callback, le bouton affiche une indisponibilité explicite : aucun envoi, délai artificiel, état vérifié ou connexion n’est simulé.

Pendant une requête réelle, le bouton est désactivé et affiche un spinner. Une protection supplémentaire empêche les doubles appels simultanés. Après résolution réelle sans erreur, la confirmation reste générique et un décompte de 60 secondes démarre, ou celui demandé par le callback. Une erreur peut aussi fournir `retryAfterSeconds`. Une exception affiche un message générique, sans révéler les détails du fournisseur. Le décompte est un confort d’interface ; les limites et protections contre l’énumération restent appliquées par le serveur et l’adaptateur.

La confirmation existante de `RegistrationForm` propose maintenant « Continue to email verification » vers `/verify-email`, uniquement après succès réel de `onSignUp`. Aucun email ou mot de passe ne passe dans ce lien. `SignUpView` mémorise l’adresse après résolution de l’inscription ; `VerifyEmailView` la relit pour l’affichage et le renvoi. Les mots de passe et jetons ne sont pas conservés par ce mécanisme.

Le backend existant configure déjà `requireEmailVerification`, `sendOnSignUp`, `sendOnSignIn`, `autoSignInAfterVerification` et réserve la création d’organisation aux adresses vérifiées. Le texte reprend ce parcours cible. L’adaptateur lit `?error=` pour présenter un problème de lien ; la redirection authentifiée dépend exclusivement de `session.user.emailVerified`, jamais d’un paramètre de succès dans l’URL. La livraison réelle, le clic dans un email et les comportements du serveur avec des liens expirés/invalides restent à valider de bout en bout avec les services réels.

## Responsive, mouvement et accessibilité

La référence desktop est 1586×992. La carte fait environ 696×724 px. Sur desktop peu haut, le badge et les espacements se compactent. Sous 1100 px, une colonne unique est utilisée ; les petites hauteurs peuvent défiler pour conserver tous les contrôles accessibles. Les adresses longues se replient dans la pastille.

La carte entre depuis la droite avec un fondu ; badge, titre et contenus apparaissent progressivement. L’icône du bouton pivote au survol et le bouton se comprime à l’appui. Aucun mouvement permanent. `prefers-reduced-motion` montre immédiatement les contenus sans translation. Le lien d’évitement cible le titre de la carte. Les erreurs et confirmations utilisent des annonces accessibles. Sans JavaScript, tous les textes restent visibles et le bouton de renvoi est désactivé avec une explication.

Titre, description, canonique, Open Graph, Twitter et viewport sombre viennent des utilitaires partagés. Les URL canoniques et de partage excluent les paramètres et fragments. La route est en `noindex`, avec `Referrer-Policy: no-referrer` et `X-Robots-Tag` correspondant. Configurer `NEXT_PUBLIC_SITE_URL` avant le build de déploiement. Aucun score SEO Lighthouse de 100 n’est revendiqué.

Captures : [desktop](email-verification-desktop.png), [mobile](email-verification-mobile.png). Elles utilisent l’adresse fictive `you@company.com` après une inscription simulée dans le navigateur de test ; aucun email réel n’est envoyé. En accès direct sans contexte, l’écran reste neutre.

## Tests

Les tests Vitest s’exécutent avec `pnpm --filter @redova/web exec vitest run`. Le fichier `vitest.config.mts` réutilise les dépendances déjà installées, configure jsdom et les alias du projet.

Les tests ciblés couvrent le décompte et son nettoyage, l’onglet suspendu, les durées invalides, l’absence d’adaptateur, les doubles clics, la confirmation et le décompte après succès réel, l’erreur avec délai serveur, l’exception sans divulgation de détails, et le lien vers la vérification après inscription réelle. Les tests acceptent les champs d’inscription additionnels existants et vérifient que la confirmation du mot de passe ne figure pas dans le payload.

Validation finale : lint, TypeScript, build et les 35 tests frontend présents ont réussi. Les dix tests ciblés ajoutés pour cet écran font partie de cette suite. Les vérifications navigateur ont aussi été exécutées sur `next start` après le build de production, avec des réponses API simulées pour la session, l’inscription et le renvoi : parcours inscription → vérification, adresse issue du contexte d’onglet, refus de renvoi sans contexte, confirmation générique et compte à rebours, paramètres URL non utilisés comme preuve de vérification, clavier, mouvement réduit et absence de JavaScript. Aucun email réel n’a été envoyé et aucune livraison réelle n’est revendiquée.

Tailles vérifiées sans débordement horizontal : 320×740, 390×844, 768×1024, 1024×768, 1100×700, 1280×720, 1440×900, 1536×842, 1586×992, 1920×1054 et 2560×1440. Les adresses longues restent dans la pastille. Les métadonnées, en-têtes et l’affichage sombre malgré une préférence claire enregistrée ont été contrôlés. Aucune erreur client ou d’hydratation observée avec ces réponses API contrôlées. Les captures livrées proviennent de cette version de production.

## Décor généré

Asset livré : `apps/web/public/images/auth/email-verification-background.webp` (1586×992, environ 121 Ko), produit avec le skill `imagegen` et l’outil intégré, puis converti en WebP. Le fond contient uniquement l’environnement et l’illustration de gauche. La capture complète n’est jamais utilisée comme arrière-plan.

Consigne de génération :

> Use case: stylized-concept. Asset type: production website background artwork, landscape 1586 x 992, aspect 16:10. Input image 1 is a visual composition reference ONLY. Reconstruct ONLY its cinematic environment and 3D illustration, removing ALL page UI, the entire right rounded card, every word, typography, logo, header and interface icon. Preserve exact scene: deep almost-black charcoal angular architecture. Left half has a giant dark scarlet glowing dotted globe with thin orbital tracks, centered around x=385,y=430 (24% width,43% height), showing America and Europe, occupying x=130..650 and y=190..650. In front of globe floats a large translucent glass envelope at x=240..560,y=395..660, with angular glowing red seams and a central white check mark inside a glowing red circular seal. This envelope is environmental 3D artwork, NOT a web UI icon. Floating glossy dark glass security tiles around globe: shield/check tile at x=75,y=380, padlock tile at x=590,y=295, paper-plane tile at x=600,y=505. A broad black metallic circular holographic pedestal at x=130..660,y=710..815 projects fine red beams up to the envelope; concentric luminous scarlet rings. Highly realistic reflective black tiled floor across lower quarter reflects neon reds. Right half from x=770..1586 is almost-black quiet negative space for a separate HTML card that will be added in code. Fine diagonal black panels and scarlet beams in top-right and bottom-right corners, including vivid red beam along top-right diagonal edge. Remove all traces of the original card; no empty card silhouette. Dramatic premium cyber-security lighting, black #0B0F14, deep gray #1E242B, controlled neon #FF2D2D, soft reflections and cinematic atmospheric depth. Constraints: output only environmental artwork and 3D left illustration. No text, letters, logos, wordmarks, page header, buttons, rectangular form panel, UI card, labels, borders, watermark or actual web interface.
