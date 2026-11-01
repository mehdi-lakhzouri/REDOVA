# REDOVA — Organization onboarding

Livraison locale du 1er novembre 2026. Route protégée : `/onboarding`.

Le parcours reprend les deux références : création d’organisation avec règles à droite, puis invitation d’équipe avec rôles et étape facultative. Geist Sans, logo officiel, thème sombre fixe, composants shadcn/Base UI et animations `motion/react` existants sont réutilisés. Les illustrations sont des décors séparés des textes et des formulaires HTML.

Captures de la version de production, avec données fictives et API simulées dans le navigateur :

| Étape | Desktop 1672 × 941 | Mobile 390 px |
| --- | --- | --- |
| Organisation | [Capture](onboarding-organization-desktop.png) | [Capture](onboarding-organization-mobile.png) |
| Invitations | [Capture](onboarding-invitations-desktop.png) | [Capture](onboarding-invitations-mobile.png) |

## Parcours connecté

1. Inscription → écran de vérification existant. Le backend conserve la responsabilité de la vérification et de la session.
2. Après vérification, connexion ou MFA, la destination par défaut devient `/onboarding`. Un `next` interne explicite reste respecté. Le dashboard renvoie aussi les comptes sans organisation vers cet écran.
3. Une session absente revient à la connexion ; une adresse non vérifiée revient à `/verify-email`. Ces contrôles d’interface complètent les contrôles d’autorisation serveur.
4. Le client consulte les organisations. Une organisation existante est sélectionnée puis ouverte dans `/dashboard`, sauf si une étape en cours doit être reprise ou si une création/invitation a été explicitement demandée.
5. Le nom suggère un slug jusqu’à sa modification manuelle. La disponibilité est réellement vérifiée après 400 ms ; les anciennes requêtes sont annulées et leurs réponses ignorées. Les mêmes règles de nom et de slug que le backend viennent de `@redova/core`.
6. La création native Better Auth produit l’organisation et son propriétaire. Son ID est conservé avant l’upload facultatif. Un échec d’upload laisse donc l’organisation existante et permet de réessayer. Le slug devient verrouillé après création.
7. Le logo peut venir d’un fichier PNG/JPG/WebP de 2 MiB maximum, ou d’une URL HTTPS. Le backend est l’autorité finale pour valider les pixels d’un fichier.
8. L’étape équipe permet jusqu’à dix lignes par envoi, avec `VIEWER` par défaut. Un propriétaire peut inviter un administrateur ; un administrateur ne peut attribuer que les rôles inférieurs. L’interface ne propose jamais de transférer la propriété.
9. Les emails incorrects, doublons dans la liste et auto-invitations sont refusés avant l’envoi. Les invitations sont soumises individuellement à Better Auth, sans `resend: true`. Les succès sont verrouillés et un nouvel essai ne renvoie que les lignes échouées. Après un succès partiel, le retour à l’étape précédente est désactivé pour conserver ce suivi ; « Skip for now » reste disponible.
10. Après les envois ou le saut de l’étape facultative, l’organisation active est sélectionnée côté serveur, la progression locale est effacée et le dashboard existant affiche l’espace actif. Il propose des liens pour inviter ou créer un autre espace.

La progression ne contient que l’ID d’organisation et l’étape, dans `sessionStorage`, par utilisateur. L’ID est revérifié dans les appartenances retournées par le serveur avant une reprise. Aucun mot de passe, fichier ou email invité n’est enregistré dans ce mécanisme. Après rechargement, un fichier non envoyé doit être sélectionné à nouveau. Les erreurs de lecture des organisations présentent « Retry » et ne sont jamais assimilées à une liste vide.

`/onboarding?organization=<id>` ouvre les invitations d’un espace dont l’utilisateur est membre. `/onboarding?new=1` permet une création supplémentaire ; le lien du dashboard efface l’ancienne progression avant cette nouvelle intention. Si une organisation vient d’être créée dans ce parcours et que la page est rechargée, elle est reprise plutôt que recréée. La limite de création de trois organisations reste appliquée par Better Auth ; elle est aussi indiquée et anticipée dans l’interface.

## Composants et frontières

| Élément | Responsabilité |
| --- | --- |
| `app/(app)/onboarding/page.tsx` | Route, métadonnées privées et frontière Suspense |
| `OnboardingView` | Session, chargement, étapes et orchestration des API |
| `OnboardingLayout` | Logo, hero, décor et composition responsive ; réutilise `AuthLayout` |
| `OnboardingStepper` | Progression accessible : email vérifié, organisation, équipe facultative |
| `CreateOrganizationForm` | Nom, slug et soumission validés avec React Hook Form/Zod |
| `LogoPicker` | Sélection, glisser-déposer, aperçu local avec nettoyage des URLs blob, URL HTTPS et retrait |
| `InviteTeamForm` | Lignes dynamiques, rôles, résultats partiels et reprise |
| `OrganizationRules` / `InvitationRules` | Contraintes et permissions expliquées dans les cartes latérales |
| `WorkspaceHome` | Entrée minimale du dashboard avec organisation active et raccourcis |
| `lib/onboarding/api.ts` | Adaptateurs Better Auth et API média ; messages d’erreur contrôlés |
| `lib/onboarding/policy.ts` | Validation client, rôles invitables et limites de fichiers partagées |
| `lib/onboarding/progress.ts` | Reprise facultative limitée à l’onglet |
| `useSlugAvailability` | Debounce, annulation et nouvelles tentatives |

Le client utilise les API natives Better Auth pour l’organisation, sans réimplémenter l’authentification ni importer la configuration serveur dans le navigateur. Les rôles personnalisés sont envoyés au handler natif d’invitation via une requête typée ; cela évite de les confondre avec les rôles par défaut du plugin. Référence de contrat : [documentation Organization de Better Auth](https://better-auth.com/docs/plugins/organization), vérifiée avec la version installée 1.7.14.

## API utilisées

Les routes Better Auth commencent par `/api/auth` et utilisent leurs réponses natives. Les trois routes de logo commencent par `/api/v1` ; le navigateur passe par le proxy Next de même origine.

| Méthode | Route relative | Rôle |
| --- | --- | --- |
| GET | `/api/auth/get-session` | Lire l’identité et l’état vérifié |
| GET | `/api/auth/organization/list` | Retrouver les espaces accessibles |
| POST | `/api/auth/organization/check-slug` | Vérifier la disponibilité du slug |
| POST | `/api/auth/organization/create` | Créer l’organisation et son propriétaire |
| POST | `/api/auth/organization/update` | Mettre à jour le nom ou une URL de logo HTTPS |
| GET | `/api/auth/organization/get-active-member-role?organizationId=…` | Lire le rôle réel dans l’espace ciblé |
| POST | `/api/auth/organization/invite-member` | Créer une invitation avec email et rôle ; validité serveur de sept jours |
| POST | `/api/auth/organization/set-active` | Sélectionner l’espace actif |
| POST | `/api/v1/organizations/:organizationId/logo` | Envoyer/remplacer un fichier ; multipart, champ `file` |
| GET | `/api/v1/organizations/:organizationId/logo/:logoId` | Lire le logo privé comme membre actif |
| DELETE | `/api/v1/organizations/:organizationId/logo` | Retirer le logo ; opération idempotente, HTTP 204 |

L’upload renvoie une enveloppe REDOVA dont `data.logo` contient l’URL privée. La lecture renvoie directement du WebP. Les erreurs comprennent `ORG_LOGO_INVALID` (400), `ORG_LOGO_TOO_LARGE` (413), les refus de session/permission (401/403), la non-disponibilité (404) et `RATE_LIMITED` (429). Les réponses Swagger sont documentées dans le contrôleur.

## Backend des logos

`OrganizationsModule` sépare contrôleur, DTO Swagger, interception multipart et service. Le service partage le normaliseur d’images et les adaptateurs de stockage existants avec les avatars, mais conserve un espace d’objets distinct : `organization-logos/<uuid>.webp`. La colonne `organization.logo` existe déjà : aucune migration n’est nécessaire.

Les écritures exigent une session vérifiée, une origine autorisée et la permission `organization:update` dans l’organisation du chemin. La lecture exige une appartenance active. Une organisation suspendue n’expose pas son logo et ne peut en publier un nouveau. Une organisation d’un autre tenant reste indisponible ; un rôle plateforme n’accorde pas de contournement implicite.

Les limites sont appliquées avant traitement multipart puis sur les pixels : un fichier, 2 MiB, signature JPEG/PNG/WebP, maximum 16 millions de pixels, refus des animations, décodage strict et délai Sharp. La sortie WebP est orientée correctement, dépourvue de métadonnées et limitée à 512 × 512 en conservant les proportions, sans agrandir les petits fichiers.

Une clé UUID neuve est écrite avant publication de sa référence en base. Un verrou PostgreSQL par organisation sérialise les remplacements/suppressions. Un échec de publication nettoie le nouvel objet ; un succès retire l’ancien objet géré. Une URL externe n’est jamais supprimée du stockage. Les anciennes URLs cessent d’être lisibles après remplacement. L’audit `org.updated` enregistre le champ modifié, sans le contenu de l’image.

Les lectures utilisent `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Vary: Cookie` et ne passent pas par un dossier public. Les mutations réutilisent le budget Redis des médias : dix modifications par utilisateur et fenêtre de dix minutes, partagé avec les avatars lorsque les limites sont activées.

Configuration et reprise opérateur : [runbook des logos](../user-management/runbooks/organization-logos.md).

## Responsive, mouvement et confidentialité

La première référence guide les proportions de création ; la seconde utilise une colonne hero légèrement plus large pour son illustration d’équipe. Les espacements se compactent sur desktop peu haut. Sous 1100 px, les sections passent en une colonne ; sur téléphone, les rôles passent sous les emails. Les pages peuvent défiler verticalement pour garder les champs et boutons accessibles.

Les cartes et le hero réutilisent `AuthReveal` : fondu avec translation courte et décalages cohérents ; la carte rejoue son entrée au changement d’étape. Aucun mouvement continu. `prefers-reduced-motion` rend les contenus immédiatement visibles. Labels, annonces d’erreurs, états de chargement, progression, noms des contrôles et lien d’évitement restent accessibles au clavier.

Les métadonnées partagées fournissent titre, description, canonique sans paramètres et viewport sombre. `/onboarding` est privé : `noindex, nofollow, noarchive` et `Referrer-Policy: no-referrer`. Aucun score SEO de 100 n’est revendiqué pour une page authentifiée.

## Vérifications exécutées

- Lint, TypeScript et build passent pour le frontend et le serveur.
- Frontend Vitest : 55 tests, dont les nouvelles validations et courses de requêtes de disponibilité.
- Serveur Vitest unitaire : 76 tests ; Jest unitaire : 85 tests.
- Intégration serveur : 188 tests passent avec PostgreSQL et Redis, dont le cycle de vie réel du logo, l’autorisation entre tenants, les faux fichiers, la taille maximale et la non-régression avatar. Les services utilisent une base de test isolée et une file email capturée.
- Playwright : neuf scénarios sur `next start`, avec API interceptées pour éviter tout email réel. Ils couvrent la création sans doublon après échec d’upload et rechargement, les invitations partielles, le saut facultatif, les erreurs de lecture, le rôle viewer, les protections de session, la sélection d’un espace et le passage de la vérification email à l’onboarding.
- Comparaison visuelle effectuée avec les références et captures desktop/mobile. Absence de débordement horizontal vérifiée entre 320 et 2560 px, avec plusieurs hauteurs. Aucune erreur d’exécution ou d’hydratation observée dans le parcours contrôlé.

Commandes de reprise :

```sh
pnpm --filter @redova/web test
pnpm --filter @redova/web test:e2e
pnpm --filter @redova/server test
pnpm --filter @redova/server test:jest:unit
pnpm --filter @redova/server test:integration
```

Playwright peut démarrer lui-même un build de production sur le port 3017. Pour réutiliser un serveur, définir `PLAYWRIGHT_BASE_URL`. `PLAYWRIGHT_CHANNEL=msedge` permet d’utiliser Edge installé ; sinon installer Chromium avec `pnpm --filter @redova/web exec playwright install chromium`.

Ces tests ne certifient pas la livraison SMTP ni des credentials S3/R2 de production. Le parcours d’acceptation d’une invitation côté destinataire possède déjà une API backend ; son écran frontend dédié ne fait pas partie de ces deux maquettes. Le champ utilisateur `onboardingCompletedAt` n’est pas renseigné par ce parcours : la sélection et la présence d’une organisation déterminent l’entrée dans l’espace. Le dashboard reste une entrée minimale, sans les fonctionnalités métier de sécurité AI encore à construire.

## Décors générés

Le skill `imagegen` et l’outil intégré ont servi à créer deux illustrations seules, converties en WebP. Aucun logo n’a été régénéré et aucune capture d’interface entière ne sert de fond.

- `apps/web/public/images/onboarding/organization.webp` : 1672 × 941, environ 79 Ko. Source sélectionnée : `exec-a51684ec-3acb-44d4-91e9-3c29f3ae56e3.png`.
- `apps/web/public/images/onboarding/invitations.webp` : 1672 × 941, environ 102 Ko. Source sélectionnée : `exec-f0e2c682-952d-4696-88a0-0b64e0b617c9.png`.

Brief de génération de l’organisation :

> Reconstruct only the cinematic environmental artwork from the supplied REDOVA organization onboarding reference. Landscape 1672 × 941. Deep almost-black background, charcoal angular panels, controlled neon red diagonal seams, subtle atmospheric depth and reflective black tiled floor. Keep the right 75 percent quiet and dark for an HTML form added separately. Keep the upper-left area dark and empty for a logo and headline added separately. In the lower-left quarter, create a polished red translucent glass tile with a simple people/team symbol on a layered black metallic pedestal with red luminous edges and orbital rings, centered near x205, y645. Match the premium cybersecurity atmosphere, black #0B0F14, surface #1E242B and red #FF2D2D. Output only environment and left illustration. Remove all text, typography, wordmarks, logos, form panels, borders, inputs, buttons, stepper, labels, rules card, watermark and web interface.

Brief de génération des invitations, avec la première illustration comme référence :

> Create a sibling environment for the team invitation step, preserving the same black and red cinematic materials, angular panels, neon seams, reflective floor and quiet right 75 percent. Place the sculpture in the left quarter. Replace the people tile with a translucent red hexagonal building/organization tile on a smaller layered black and red pedestal. Add a few floating glass team/user tiles and a fine orbital ring, with a subtle red dotted wave across the bottom-left floor. Leave the upper-left empty for branding and copy rendered in HTML, and the whole right side dark for a separate form. Output environmental artwork only: no text, letters, logos, wordmarks, UI cards, form controls, panels, buttons, labels or watermark.
