# REDOVA — Login page

Route : `/sign-in`. La page `/` conserve la référence du design system.

## Composition

- `app/(auth)/sign-in/page.tsx` définit `LoginPage`, ses métadonnées et assemble `AuthLayout`, `AuthHero` et `LoginCard`.
- `components/auth/auth-layout.tsx` contient le décor, les deux colonnes et le lien d’évitement clavier.
- `auth-hero.tsx` et `hero-feature-list.tsx` affichent la présentation et les trois bénéfices.
- `login-card.tsx` compose le logo existant, le formulaire, SSO et les actions annexes.
- `login-form.tsx` gère uniquement les champs, leur validation locale et les états de présentation.
- `sso-button.tsx` expose une action asynchrone avec état d’attente.
- `hooks/use-hydrated.ts` partage le contrôle d’hydratation entre les formulaires de connexion et de réinitialisation.
- `auth.module.css` contient les styles propres à la référence. Les effets lumineux sont limités à cette page ; les tokens globaux ne sont pas modifiés.

Les contrôles réutilisent shadcn/Base UI : `Card`, `Input`, `Label`, `Checkbox`, `Button` et `Dialog`. `BrandLogo` réutilise les images officielles déjà présentes. Tout le texte de l’interface est en Geist Sans ; aucune police de marque n’est requise par cette route.

Le loader Tailwind de Turbopack exclut désormais `*.module.css` : les modules restent traités par Next, ce qui préserve les exports de leurs classes. Le loader existant continue de traiter le CSS global.

## Animations

Le paquet `motion` existant est utilisé via `motion/react`, sans dépendance supplémentaire. Les timings et la courbe d’accélération sont centralisés dans `components/auth/auth-motion.ts`.

- Carte : fondu, translation de 18 px et zoom de 95,5 % à 100 %, pendant 600 ms.
- Titre : apparition caractère par caractère sur deux lignes, à 34 ms par caractère, une seule fois à l’entrée de la route. Les lettres occupent leur place dès le rendu initial pour éviter les déplacements. Le lecteur d’écran reçoit le titre complet, sans annonce de chaque lettre.
- Accroche, description, champs, SSO et pied de carte : fondus et légères translations décalés. Les trois bénéfices glissent depuis la gauche, à 120 ms d’intervalle.
- Bouton : icône de connexion, flèche au survol, compression à l’appui et reflet lumineux bref au clic. Le spinner reste lié uniquement à l’attente réelle du callback de connexion ; aucune attente artificielle n’est ajoutée.
- `prefers-reduced-motion` : pas de zoom, translation, frappe progressive ou reflet. Le contenu apparaît immédiatement. Les styles initiaux restent identiques côté serveur et client pour préserver l’hydratation.
- Sans JavaScript : un repli `noscript` conserve tous les textes et la carte visibles. Le formulaire reste désactivé comme auparavant. Un focus anticipé rend immédiatement visible son groupe animé.

Vérifications navigateur : progression réelle du titre, fin du zoom, retour visuel à l’appui, validation du formulaire, affichage sans mouvement, rendu sans JavaScript et absence d’erreurs d’hydratation.

## Frontière d’intégration

`LoginCardProps` expose :

```ts
type LoginCardProps = {
  onSignIn?: (credentials: {
    email: string;
    password: string;
    rememberMe: boolean;
  }) => Promise<{ error?: string } | void>;
  onSSO?: () => Promise<void>;
  forgotPasswordHref?: string;
  signUpHref?: string;
};
```

Le futur adaptateur Better Auth sera un composant client à l’entrée de la route. Il fournira les callbacks et les URL une fois les parcours disponibles. L’adaptateur restera responsable de l’authentification, des messages serveur présentables, des redirections, de la vérification d’email et des éventuels défis MFA. Aucun composant de présentation n’appelle actuellement `authClient`.

Sans adaptateur, le formulaire affiche une indisponibilité explicite après validation. « Forgot password? » mène à `/forgot-password`, l’écran de demande du lien de récupération, et « Create account » mène à `/sign-up`. SSO ouvre un dialogue d’information accessible. Aucune réussite de connexion n’est simulée et aucun lien ne mène vers une route absente.

Seule la présence du mot de passe est vérifiée localement : la politique de mots de passe appartient au serveur. Les identifiants ne sont ni journalisés ni conservés dans les stockages du navigateur. « Remember me » est transmis au callback ; il n’enregistre jamais le mot de passe. Les contrôles sont désactivés avant hydratation pour éviter une soumission native sans gestionnaire. Le formulaire utilise aussi `method="post"` pour éviter l’envoi de champs dans l’URL.

## Responsive et vérification visuelle

La référence desktop fait 1586 × 992 px. La carte se place à environ x=942, y=81, largeur 598 px et hauteur 845 px. Les titres, espacements et champs ont été raffinés à partir de captures navigateur, sans placer la capture de référence en arrière-plan.

Sous 1100 px, les colonnes deviennent une seule colonne. La liste de bénéfices et les annotations décoratives sont retirées ; la carte remonte sous une présentation compacte. Les petites hauteurs desktop peuvent défiler normalement. Les cibles tactiles principales mesurent au moins 44 px sur mobile.

Contrôles navigateur effectués aux tailles 1586×992, 1440×900, 1280×800, 1100×768, 1024×768, 768×1024, 390×844, 320×740 et 2560×1440 : aucun débordement horizontal ni carte coupée. Validation email/mot de passe, affichage du mot de passe, case Remember me, lien d’évitement, dialogues, état sans JavaScript et absence d’appels d’authentification ont aussi été vérifiés.

## Décor

Asset livré : apps/web/public/images/auth/security-landscape-template.webp (1585×992, environ 177 Ko). L'outil intégré image_gen a modifié le paysage propre à partir de la capture de référence pour y intégrer le monument métallique « œil / R » du template. Il est maintenant physiquement intégré à la roche, avec son point lumineux rouge et ses reflets. Aucun formulaire, texte ou logo d'en-tête n'est inclus dans le fond. L'ancien monogramme superposé par CSS a été retiré ; les logos d'en-tête et de carte restent les assets officiels.

Consigne de génération (outil intégré, mode édition ; paysage précédent et template comme images de référence) :

> Integrate the sculptural REDOVA eye/R emblem from the login template into the clean volcanic landscape. Preserve the red angular R, horizontal diamond-shaped eye, glowing red spherical pupil, dark brushed gunmetal surfaces, wet rocks, water and monoliths. Make it a solid physical monument embedded in the front rock mound, with coherent red lighting and reflections. Keep the upper left dark for HTML text and the right dark for a separately rendered login card. Output only the environmental artwork and the single eye/R sculpture: no typography, wordmark, header logo, form, panel, annotations, icons or grid. Do not substitute a shield, P shape, star or generic R.
