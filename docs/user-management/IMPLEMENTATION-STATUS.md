# État réel du backend User Management après les avatars

> **Complément local du 1er novembre 2026 — onboarding et logos d’organisation.**
> Le frontend relie désormais la vérification/connexion à la création d’organisation, au logo
> facultatif et aux invitations d’équipe. Une API d’upload/remplacement/lecture/suppression du logo
> privé a été ajoutée au backend, avec stockage local ou S3/R2 partagé avec les avatars.
> Voir [le parcours, les API, les captures et les tests](../frontend/onboarding.md) et
> [le runbook de stockage](runbooks/organization-logos.md).
> Ce complément décrit le checkout local ; il ne constitue pas une nouvelle preuve CI ou de production.

> **Mise à jour du 31 octobre 2026 — livraison.** UM-008 et l'extension avatar sont fusionnés sur
> `master` par les PR #23 à #28 (issues #8 et #26 fermées). Sur `master` (`1a9a976`), les jobs
> `lint-typecheck-unit`, `integration`, `e2e` et `security` sont verts : couverture serveur 81,4 % des
> lignes (seuil 80 %), six parcours E2E et scan des logs, audit des dépendances et gitleaks.
> Restent pour la clôture formelle : exiger `e2e` et `security` dans la protection de `master`, les
> contrôles manuels UM-003/004/005, la démo, le tag `v0.1.0` et la rétrospective (§11).
> Les sections ci-dessous restent la photographie **avant** cette livraison. Voir aussi le
> [dossier de validation](validation/UM-008-validation.md).

Analyse du 31 octobre 2026, sur la branche locale `feat/um-008-e2e-ci-coverage`.
Ce document décrit le code du checkout, y compris les changements non commités. Il ne certifie pas
les résultats GitHub Actions, les protections de `master` ni une validation de production.
Sources : code, dépendances installées, tickets UM-001 à UM-008, SPRINT-01 et configuration CI.
L'inventaire natif a été lu sur les handlers de l'instance Better Auth 1.7.14 configurée par le projet,
en excluant explicitement les routes désactivées des fonctionnalités disponibles.

## 1. Où en est le projet ?

Le socle backend d'identité et d'organisation est implémenté : comptes email/mot de passe,
vérification email, sessions, récupération de compte, MFA TOTP, organisations, invitations,
RBAC, administration, audit, emails asynchrones, logs et avatars privés.

La clôture formelle des huit tickets reste incomplète : la couverture Vitest serveur mesurée est
de **75,19 %**, sous le seuil CI de **80 %**. UM-008 attend aussi les jobs CI E2E et sécurité,
les preuves sur `master`, plusieurs validations manuelles et la réconciliation des documents.
Les DoD globales restent décochées dans les tickets.

Deux périmètres existent dans SPRINT-01 :

- **Engagement solo : UM-001 + UM-002, 11 SP**, avec UM-006 en stretch.
- **Backlog du module entier : UM-001 à UM-008, 44 SP**, prévu sur plusieurs sprints solo.

Le code dépasse donc largement l'engagement fonctionnel solo. Les huit tickets ne doivent pas être
présentés comme le seul engagement initial du sprint 1 sans une replanification explicite.
Le frontend est hors périmètre de ce sprint backend ; son absence n'empêche pas sa clôture.

## 2. Architecture et exécution

| Élément | Responsabilité réelle |
| --- | --- |
| `apps/server` | API NestJS, orchestration, validation, autorisation et réponses HTTP |
| `packages/auth` | Better Auth, plugins admin/organisation/MFA/HIBP, hooks d'audit et protections métier |
| `packages/contracts` | Schémas Zod, formats de réponse, erreurs, rôles et catalogue d'audit |
| `packages/core` | Politiques métier pures : hiérarchie des rôles, garde-fous admin et validation d'organisation |
| `packages/db` | Prisma, migrations, accès PostgreSQL et repositories |
| `packages/queue` | Production des tâches email BullMQ, identifiants de déduplication et retries |
| `apps/worker` | Consommation de la file email, rendu puis envoi SMTP |
| `packages/integrations` | Templates Handlebars et adaptateur SMTP |
| `server/src/authz` | Guards de permissions, origine, MFA administrateur et session récente |
| `server/src/audit` | Écriture et consultation de l'audit, avec filtrage des métadonnées |
| `server/src/profile` | Cycle de vie des avatars et traitement Sharp |
| `server/src/storage` | Port de stockage et adaptateurs local/S3-R2 ; nettoyage des orphelins |
| `server/src/logging` | Pino, identifiants de requête, sérialisation et masquage des secrets |
| PostgreSQL | Identités, sessions, appartenances, invitations, paramètres SaaS et audit |
| Redis | Rate limits, throttle de connexion et BullMQ ; les sessions restent dans PostgreSQL |
| `apps/web` | Squelette Next.js ; parcours métier non intégrés |

SMTP est implémenté. `EMAIL_TRANSPORT=api` est reconnu mais refuse de démarrer sans adaptateur
fournisseur implémenté, même avec une clé. Le fournisseur transactionnel HTTP reste une décision D-11.
Un fournisseur transactionnel SMTP peut être utilisé sans créer cet adaptateur HTTP.

## 3. Contrat commun des API

- Préfixe Better Auth : `/api/auth`. Réponses natives, erreurs `{ code, message }`.
- Préfixe REDOVA : `/api/v1`. Réponses JSON `{ data, meta, error }` et identifiant de requête.
- Exceptions explicites : HTTP 204 sans corps ; lecture d'avatar en WebP binaire.
- Session en cookie HTTP-only ; pas d'API Key ni de Bearer configurés pour ce périmètre.
- Les mutations doivent respecter `WEB_ORIGIN`. Le navigateur doit passer par le proxy de même origine
  prévu, ou CORS devra être configuré explicitement : il est actuellement désactivé.
- Les listes REDOVA utilisent des curseurs. Les listes natives suivent le contrat Better Auth.
- Le tenant des routes REDOVA vient du chemin, jamais du corps ni de l'organisation active de session.

Légende d'accès : **S** = session avec email vérifié ; **A** = PLATFORM_ADMIN avec MFA activé ;
**AM** = A + session de moins d'une heure + origine autorisée ; **O** = permission dans l'organisation.
Les conditions natives supplémentaires, dont session récente et mot de passe, restent applicables.

## 4. Inventaire des API natives utilisées

Toutes les routes des tableaux 4.1 à 4.4 sont précédées de `/api/auth`.

### 4.1 Comptes, profil et sessions — UM-002 et UM-003

| Méthode | Route | Rôle et workflow |
| --- | --- | --- |
| POST | `/sign-up/email` | Crée un compte non vérifié ; déclenche l'email de vérification ; aucune session avant vérification |
| POST | `/sign-in/email` | Vérifie les identifiants ; session ou étape MFA ; refuse les comptes bannis/non vérifiés |
| GET / POST | `/get-session` | Retourne la session et l'utilisateur ; absence de session normalement représentée par `null` |
| POST | `/sign-out` | Révoque la session courante et retire son cookie |
| POST | `/send-verification-email` | Envoie ou renvoie le lien de vérification |
| GET | `/verify-email` | Consomme le lien ; marque l'email vérifié ; auto-connexion puis redirection lorsque demandée |
| POST | `/request-password-reset` | Réponse générique ; envoie un lien si le compte existe |
| GET | `/reset-password/:token` | Valide le lien reçu et redirige vers `redirectTo` avec le token ou une erreur |
| POST | `/reset-password` | Change le mot de passe avec un token valide ; révoque les sessions existantes |
| POST | `/change-password` | Change le mot de passe connecté ; exige le mot de passe actuel ; envoyer `revokeOtherSessions: true` pour révoquer les autres sessions |
| POST | `/verify-password` | Vérifie le mot de passe du compte connecté ; ne pas l'assimiler à une nouvelle connexion ou à un renouvellement de fraîcheur |
| POST | `/update-user` | Modifie le nom et les champs de profil autorisés ; `image` est refusé, dates de suivi non modifiables par le client |
| GET | `/list-sessions` | Liste les sessions personnelles ; attention aux tokens natifs et à l'exigence de session récente |
| POST | `/revoke-session` | Révoque une session personnelle identifiée par son token |
| POST | `/revoke-sessions` | Révoque l'ensemble des sessions personnelles selon le comportement natif |
| POST | `/revoke-other-sessions` | Révoque les autres sessions en conservant la session courante |
| GET | `/list-accounts` | Liste les comptes de connexion rattachés à l'utilisateur |
| POST | `/unlink-account` | Délie un compte de connexion sous les protections natives ; aucun parcours OAuth REDOVA n'est configuré |

### 4.2 MFA — UM-004

| Méthode | Route | Rôle et conditions |
| --- | --- | --- |
| POST | `/two-factor/enable` | Prépare l'enrôlement avec mot de passe ; retourne URI TOTP et codes de secours ; confirmation TOTP nécessaire |
| POST | `/two-factor/verify-totp` | Confirme l'enrôlement ou termine une connexion MFA avec un code TOTP valide |
| POST | `/two-factor/verify-backup-code` | Termine le challenge avec un code de secours à usage unique |
| POST | `/two-factor/generate-backup-codes` | Régénère les codes de secours ; les anciens ne doivent plus être utilisés |
| POST | `/two-factor/get-totp-uri` | Récupère l'URI TOTP dans les conditions natives, notamment mot de passe ; donnée secrète |
| POST | `/two-factor/disable` | Désactive le MFA avec mot de passe ; refusé pour PLATFORM_ADMIN par la politique REDOVA |

### 4.3 Organisations, membres et invitations — UM-005 et UM-006

| Méthode | Route | Rôle et conditions |
| --- | --- | --- |
| POST | `/organization/create` | Utilisateur vérifié ; crée une organisation et son ORG_OWNER ; maximum trois organisations créées |
| POST | `/organization/update` | Modifie nom/logo autorisés selon O ; slug immuable ; logo actuellement URL HTTPS, sans upload de logo |
| GET | `/organization/list` | Liste les organisations de l'utilisateur |
| GET | `/organization/get-organization` | Consulte les informations d'une organisation dans le périmètre autorisé par le plugin |
| GET | `/organization/get-full-organization` | Consulte l'organisation et les collections associées selon les contrôles natifs |
| POST | `/organization/set-active` | Sélectionne l'organisation active ; ne donne pas de permission supplémentaire |
| POST | `/organization/check-slug` | Vérifie la disponibilité d'un slug ; ne réserve pas ce slug |
| GET | `/organization/list-members` | Liste les membres de l'organisation autorisée |
| GET | `/organization/get-active-member` | Consulte sa propre appartenance dans le contexte d'organisation |
| GET | `/organization/get-active-member-role` | Consulte son rôle d'organisation |
| POST | `/organization/update-member-role` | Change un rôle ; `organizationId` obligatoire ; règles de rang, auto-modification et dernier propriétaire |
| POST | `/organization/remove-member` | Retire un membre ; `organizationId` obligatoire ; garde-fous de rang et propriétaire |
| POST | `/organization/leave` | Quitte l'organisation ; le dernier propriétaire ne peut pas abandonner l'organisation |
| POST | `/organization/invite-member` | Invite ou réinvite avec rôle ; contrôle de permission et de rang ; email asynchrone |
| GET | `/organization/get-invitation` | Consulte une invitation avec authentification et contrôle du destinataire/appartenance selon la politique |
| GET | `/organization/list-invitations` | Liste les invitations de l'organisation ; consultation possible pour les membres selon le comportement natif adopté |
| GET | `/organization/list-user-invitations` | Liste les invitations reçues par l'utilisateur connecté |
| POST | `/organization/accept-invitation` | Destinataire connecté avec email vérifié ; invitation encore valide ; crée l'appartenance |
| POST | `/organization/reject-invitation` | Refuse l'invitation reçue |
| POST | `/organization/cancel-invitation` | Annule une invitation selon O et les protections de rôle |
| POST | `/organization/has-permission` | Évalue les permissions dans l'organisation ; ne remplace pas les contrôles des routes métier |

### 4.4 Routes natives techniques, auxiliaires ou non exploitables dans la configuration actuelle

Ces handlers existent dans la bibliothèque ; leur présence ne signifie pas que le produit configure
le fournisseur ou les champs nécessaires.

| Méthode | Route | État réel |
| --- | --- | --- |
| POST | `/update-session` | Ne modifie que les champs supplémentaires de session autorisés ; aucun configuré ici, pas un endpoint générique d'édition de session |
| POST | `/sign-in/social` | Handler natif ; aucun fournisseur social configuré |
| GET / POST | `/callback/:id` | Callback OAuth ; aucun fournisseur social configuré |
| POST | `/link-social` | Liaison OAuth ; aucun fournisseur social configuré |
| POST | `/refresh-token` | Renouvellement de token fournisseur ; pas de parcours OAuth configuré |
| POST | `/get-access-token` | Token de fournisseur OAuth ; pas un système d'API Keys REDOVA |
| GET | `/account-info` | Informations de compte fournisseur selon le contrat natif ; pas un module de profil REDOVA à construire autour de cette route |
| GET | `/delete-user/callback` | Callback natif de suppression ; la suppression utilisateur n'est pas activée |
| GET | `/ok` | Vérifie que le handler Better Auth répond ; ne sonde pas PostgreSQL et Redis comme `/api/v1/health` |
| GET | `/error` | Route technique native d'erreur |
| GET | `/open-api/generate-schema` | Schéma OpenAPI natif, hors production uniquement |
| GET | `/reference` | Interface de documentation native, hors production uniquement |

## 5. API REDOVA

Toutes les routes ci-dessous sont précédées de `/api/v1`.

### 5.1 Administration — UM-007

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| GET | `/admin/users` | A | Recherche, filtres et pagination des utilisateurs |
| GET | `/admin/users/:userId` | A | Détails d'un utilisateur, compteurs d'appartenances et de sessions |
| PUT | `/admin/users/:userId/ban` | AM | Bannissement avec raison et durée ; auto-bannissement et cible admin protégés |
| DELETE | `/admin/users/:userId/ban` | AM | Lève le bannissement, de façon idempotente |
| PUT | `/admin/users/:userId/role` | AM | Change USER / PLATFORM_ADMIN ; auto-modification et suppression du dernier administrateur interdites |
| GET | `/admin/users/:userId/sessions` | A | Liste les sessions d'un utilisateur sans exposer leurs tokens |
| DELETE | `/admin/users/:userId/sessions` | AM | Révoque toutes ses sessions |
| DELETE | `/admin/users/:userId/sessions/:sessionId` | AM | Révoque une session appartenant à cet utilisateur |

### 5.2 Audit — UM-008

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| GET | `/admin/audit-events` | A | Tous les événements autorisés à l'échelle plateforme ; filtres et curseur |
| GET | `/admin/audit-events/:eventId` | A | Détail d'un événement plateforme |
| GET | `/organizations/:organizationId/audit-events` | O | Événements de cette organisation seulement ; ORG_OWNER, ORG_ADMIN ou AUDITOR |
| GET | `/organizations/:organizationId/audit-events/:eventId` | O | Détail d'un événement de cette organisation ; événement d'un autre tenant masqué par 404 |

### 5.3 Avatars — extension hors backlog initial

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| POST | `/users/me/avatar` | S + origine autorisée | Un champ multipart `file` ; validation, réencodage, stockage, remplacement, mise à jour de `User.image` |
| DELETE | `/users/me/avatar` | S + origine autorisée | Suppression idempotente ; image remise à `null` ; HTTP 204 |
| GET | `/avatars/:avatarId` | S + règle de visibilité | WebP privé : propriétaire, membres actifs d'une organisation active commune, ou PLATFORM_ADMIN avec MFA ; sinon 404 |

La visibilité administrateur des avatars est une règle explicite du module de profil. Elle ne donne
pas d'accès implicite aux futurs agents, assessments ou autres ressources métier des organisations.
Limites : 5 MiB, 16 mégapixels, JPEG/PNG/WebP, animations refusées, sortie jusqu'à 512 × 512, sans
métadonnées source. Redis limite les mutations à 10 par compte sur 10 minutes lorsque le rate limit est activé.

Stockage local privé ou bucket S3/R2 privé. Pas d'URL présignée stockée en base. Les lectures passent
par l'API pour appliquer les permissions. Les anciens fichiers sont supprimés après publication du nouveau.
Les mutations concurrentes sont sérialisées ; un échec base après écriture déclenche une compensation.
Le nettoyage des orphelins est disponible mais doit être planifié dans le déploiement.
Voir [Gestion des avatars](../avatars.md).

### 5.4 Exploitation et documentation

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/api/v1/health` | Public ; santé PostgreSQL/Redis ; 200 ou 503 dans l'enveloppe |
| GET | `/api/v1/docs` | Swagger REDOVA hors production |
| GET | `/api/v1/docs-json` | Document OpenAPI REDOVA généré par Swagger, hors production |

Les chemins de ce dernier tableau sont complets.

## 6. Routes explicitement désactivées

Préfixe `/api/auth`. Elles ne constituent pas des API à intégrer côté frontend.

| Méthode | Route | Motif |
| --- | --- | --- |
| GET | `/admin/list-users` | Remplacée par REDOVA |
| GET | `/admin/get-user` | Remplacée par REDOVA |
| POST | `/admin/ban-user` | Remplacée par REDOVA |
| POST | `/admin/unban-user` | Remplacée par REDOVA |
| POST | `/admin/set-role` | Remplacée par REDOVA |
| POST | `/admin/list-user-sessions` | Remplacée par REDOVA |
| POST | `/admin/revoke-user-session` | Remplacée par REDOVA |
| POST | `/admin/revoke-user-sessions` | Remplacée par REDOVA |
| POST | `/admin/create-user` | Hors périmètre |
| POST | `/admin/update-user` | Hors périmètre |
| POST | `/admin/remove-user` | Hors périmètre |
| POST | `/admin/set-user-password` | Hors périmètre |
| POST | `/admin/impersonate-user` | Hors périmètre |
| POST | `/admin/stop-impersonating` | Hors périmètre |
| POST | `/admin/has-permission` | Exclue de la surface HTTP |
| POST | `/organization/delete` | Suppression d'organisation désactivée |
| POST | `/two-factor/send-otp` | MFA OTP email/SMS non configuré |
| POST | `/two-factor/verify-otp` | MFA OTP email/SMS non configuré |
| POST | `/delete-user` | Suppression de compte hors périmètre |
| POST | `/change-email` | Changement d'email hors périmètre |

## 7. Workflows disponibles de bout en bout

### A. Inscription et première organisation

1. Inscription email/mot de passe, contrôle HIBP si activé, utilisateur non vérifié.
2. Tâche email BullMQ ; le worker délivre le message via SMTP.
3. Ouverture du lien de vérification ; email vérifié, session créée.
4. Création d'organisation ; appartenance ORG_OWNER.
5. Envoi d'invitations puis consultation des membres.

### B. Invitation d'un collègue

1. Propriétaire/admin autorisé invite une adresse avec un rôle admissible.
2. L'invité reçoit le lien ; s'il n'a pas de compte, il s'inscrit et vérifie son email.
3. Il accepte connecté avec l'adresse destinataire et une invitation non expirée/non annulée.
4. Une appartenance est créée ; les permissions viennent de son rôle.
5. Un autre utilisateur ou un compte non vérifié ne peut pas accepter à sa place.

### C. Connexion MFA et récupération

1. L'utilisateur connecté prépare l'enrôlement puis confirme un premier code TOTP.
2. Aux connexions suivantes, le mot de passe conduit à un challenge MFA si le terminal n'est pas approuvé.
3. Un code TOTP ou un code de secours inutilisé termine la connexion.
4. La perte de tous les facteurs suit le runbook et la commande opérateur de reset, avec audit.

### D. Mot de passe oublié

1. Demande de récupération avec réponse générique, compte existant ou non.
2. Email asynchrone si le compte existe ; lien valable 30 minutes.
3. Nouveau mot de passe via token ; contrôle de robustesse/HIBP selon configuration.
4. Anciennes sessions révoquées ; reconnexion nécessaire ; notification et audit.

### E. Administration

1. Un opérateur promeut le premier utilisateur vérifié avec la CLI.
2. L'administrateur active le MFA avant d'accéder aux routes admin.
3. Il recherche un utilisateur puis bannit, débannit, change le rôle ou révoque des sessions.
4. Les écritures exigent une session récente et une origine autorisée.
5. Les effets sont vérifiés à la requête suivante ; les actions sont auditées.

### F. Multi-organisation

1. Un utilisateur possède plusieurs appartenances, potentiellement avec des rôles différents.
2. L'organisation active facilite la navigation.
3. Chaque appel REDOVA reste autorisé à partir de `:organizationId` et d'une appartenance active.
4. Changer l'organisation active ou un paramètre de requête ne permet pas de traverser les tenants.

### G. Avatar

1. L'utilisateur envoie son fichier authentifié et avec l'origine autorisée.
2. Limitation Redis, parsing multipart borné, signatures et décodage réels, contrôle des dimensions.
3. Réencodage WebP sans métadonnées ; stockage sous UUID généré.
4. Publication de l'URL en base, suppression de l'ancien objet, audit.
5. Le lecteur doit satisfaire les règles de visibilité ; suppression et anciennes versions deviennent 404.
6. Un job d'exploitation quotidien peut récupérer les orphelins de plus de 24 heures via la CLI de nettoyage.

## 8. État et Definition of Done par ticket

Les cases cochées des fichiers de tickets sont des déclarations documentaires ; seules les preuves
de tests et de livraison permettent la clôture. La DoD globale reste exigée pour chaque ticket.

| Ticket | Fonctionnalité / critères de sortie | État technique observé | Reste pour clôture formelle |
| --- | --- | --- | --- |
| UM-001 — 8 SP | Monorepo, infra, schéma, migrations, Better Auth, conventions, santé et outillage | Implémenté ; tests foundation et configuration présents | DoD globale, preuve CI complète, schéma/génération et migration vierge sur l'état livré, documentation des extensions |
| UM-002 — 3 SP | Inscription, connexion, déconnexion, sessions et hooks d'audit | Implémenté et testé localement | DoD globale ; livraison/CI et contrat à réconcilier avec le nouveau traitement d'image |
| UM-003 — 5 SP | Vérification, récupération, emails asynchrones, templates et anti-énumération | SMTP/queue/worker implémentés ; tests automatisés présents | Vérifications Gmail web/mobile avec captures ; E2E-03 en CI ; adaptateur HTTP fournisseur différé selon D-11 |
| UM-004 — 5 SP | Enrôlement et challenge MFA, codes de secours, notifications et reset opérateur | Implémenté et testé localement | Deux applications authenticator réelles ; captures des notifications ; E2E-04 en CI ; DoD globale |
| UM-005 — 5 SP | Organisations, invitations, rôles, départ et sélection active | Implémenté et testé en intégration | E2E-01/02/06 verts en CI ; vérification visuelle invitation Gmail/Mailpit ; DoD globale |
| UM-006 — 5 SP | RBAC, anti-escalade, isolation et kit de contrats | Implémenté ; couverture core mesurée au-dessus de 95 % | Preuve de toutes les branches d'escalade, livraison/CI et DoD globale ; règle lint P1 sur `findUnique` explicitement différée dans les notes UM-008 |
| UM-007 — 5 SP | Administration avec MFA/session récente, garde-fous, sessions et bootstrap | Implémenté et testé localement | E2E-05 en CI, preuves de livraison et DoD globale |
| UM-008 — 8 SP | Audit consultable, catalogue complet, sécurité transversale, E2E, couverture et gates CI | Audit/hardening implémentés ; harnais E2E et six parcours présents localement | Couverture serveur 75,19 % < 80 %, jobs E2E/sécurité absents, audit/gitleaks non exécutés par CI, logs non publiés, protections GitHub non vérifiées, preuve sur master, revue de menaces/sign-off |
| Avatars — extension sans ticket dédié | Upload/lecture/remplacement/suppression privés, local/S3-R2, nettoyage et tests | Implémenté ; intégration locale et SDK simulé testés | Rattacher à un ticket d'extension ; config et smoke test bucket réel, planification nettoyage, contrat/OpenAPI/DoD à aligner |

### DoD de l'extension avatar

- Fonctionnel et testé : formats/limites, permissions positives/négatives, origine, rate limit,
  refus du contournement Better Auth, remplacement concurrent, suppression idempotente et audit.
- Fonctionnel et testé : stockage local réel, commandes SDK S3 simulées, compensations et nettoyage d'orphelins.
- À valider dans le déploiement : credentials et permissions du bucket privé, connexion réelle S3/R2,
  persistance du volume si mode local, origine publique et routage des cookies.
- À organiser : exécution quotidienne de `avatars:prune --apply` sur la bonne base/le bon stockage.
- À formaliser : ticket, critères, exceptions JSON/binaire/multipart et schémas d'erreurs OpenAPI détaillés.

## 9. Preuves disponibles et limites de validation

Après l'implémentation avatar, les dernières exécutions locales ont donné :

| Vérification | Résultat |
| --- | --- |
| Jest backend, unitaires et intégration | 127 tests réussis |
| Vitest backend unitaires/support | 62 tests réussis |
| Vitest backend intégration/sécurité | 169 tests réussis |
| `packages/auth` unitaires | 173 tests réussis |
| `packages/contracts` unitaires | 31 tests réussis |
| Build backend, TypeScript et lint backend | Réussis |
| CLI nettoyage en simulation | Réussie, aucune suppression effectuée |
| Validation syntaxique des workflows | Réussie pendant cette analyse |
| Vitest backend intégration avec couverture | 169 tests réussis ; commande en échec sur le seuil de lignes : 75,19 % < 80 % |

Couverture mesurée pendant cette analyse : core **98,57 %** des lignes (91 tests), contracts **100 %**
(31 tests), integrations **93,87 %** (21 tests). Ces trois seuils de lignes passent.
Le résultat core global ne démontre pas à lui seul les 100 % exigés sur les branches d'escalade.

La couverture Jest backend mesurée avant la dernière vérification de signature était de **85,70 %**.
Elle ne remplace pas la mesure Vitest d'intégration activée par `CI=true`, car les suites, les
transformations et la mesure des lignes diffèrent. Pendant cette analyse, la commande
`pnpm --filter @redova/server exec vitest run -c vitest.integration.config.mts --coverage`
a exécuté **169 tests réussis**, puis a terminé en **échec** : **75,19 % de lignes** contre
**80 % requis**. Cette configuration est celle de la couverture serveur du job integration.
Les tests avatar sont majoritairement dans Jest ; leur couverture n'est pas combinée avec Vitest.
Ce contrôle empêche de conclure que la CI complète de l'état actuel serait verte.

Les six parcours E2E, plus le parcours de lecture d'audit et la recherche de secrets dans les logs,
existent dans `test/e2e/journeys.e2e-spec.ts`. Leur présence n'est pas une preuve d'exécution réussie.
Ils n'ont pas été relancés pendant cette analyse : leur setup efface la boîte Mailpit commune.
Une exécution dédiée/isolée doit fournir la preuve avant clôture.

Les résultats GitHub Actions et les réglages du dépôt distant n'ont pas été vérifiés ici.
Les avatars et les derniers tests/configurations comportent encore des fichiers non commités.

## 10. Écarts précis à traiter

### Priorité de clôture

1. **Rétablir le seuil de couverture serveur.** La commande avec couverture échoue actuellement à
   **75,19 % < 80 %**. Couvrir les chemins manquants dans la suite mesurée (notamment les nouveaux
   composants avatar/stockage), ou définir une collecte commune fiable intégrant les tests Jest.
   Les pourcentages Jest et Vitest ne se combinent pas par addition ou moyenne. Conserver le seuil
   attendu et les tests de comportement ; ne pas masquer le problème par des exclusions arbitraires.
2. **UM-008 : compléter CI.** Ajouter un job E2E avec server/worker construits, services et journaux
   publiés sur échec ; ajouter le gate `pnpm audit --prod --audit-level=high` et gitleaks.
   Déclarer les dépendances entre jobs si la chaîne décrite par le ticket doit être séquentielle.
   Les jobs locaux actuels sont `lint-typecheck-unit`, `integration`, `git-hygiene` ; sans `needs`.
3. **Vérifier les critères sur la CI livrée.** Les tests Jest sont exécutés mais sans collecte de
   couverture dans ce job ; la couverture serveur exigée est portée par Vitest intégration.
   S'assurer que l'extension avatar n'a pas dégradé ce seuil, puis publier la preuve des packages requis.
4. **Exécuter les six E2E et le scan de logs**, sur environnement isolé ; apporter les preuves en CI.
5. **Terminer les contrôles manuels** UM-003/004/005 et conserver captures/résultats dans la PR.
6. **Réconcilier la documentation** et rattacher les avatars à un ticket d'extension accepté.
7. **Livrer les fichiers**, revoir la PR, vérifier les checks requis/protections `master`, fusionner,
   mettre à jour les tickets et conserver les liens de preuve.

### Écarts documentaires depuis les avatars

- Le contrat §15 dit JSON uniquement : ajouter l'exception multipart pour l'upload.
- La DoD §20 exige une enveloppe pour toute route REDOVA : ajouter les exceptions binaire/204.
- L'inventaire §18.6 ne contient pas les routes avatar.
- Le catalogue §17.4 doit intégrer `profile.avatar.updated` et `profile.avatar.deleted` (34 actions en code).
- La décision D-12 prévoit Vitest seul ; le projet utilise désormais Vitest plus Jest complémentaire.
- L'architecture/les variables et le périmètre initial doivent référencer les nouveaux modules de stockage.
- OpenAPI avatar décrit l'upload et la lecture, mais la réponse JSON reste une description textuelle :
  ajouter les schémas d'enveloppe et les réponses d'erreur spécifiques pour une intégration frontend typée.
- Plusieurs passages évoquent un adaptateur email API de production ; le code ne fournit que SMTP.
- Le statut principal « Design approved for implementation » est dépassé par l'état du code.

### Éléments futurs qui ne bloquent pas le sprint initial

- Frontend et consommation navigateur des API.
- API Keys, OAuth social, SSO, passkeys, paiement et modules d'agents/assessments/findings/reports.
- Application métier des quotas, abonnements et paramètres de sécurité par organisation : leurs tables
  sont présentes mais les services d'application ne sont pas implémentés.
- Mise à jour de `lastLoginAt`, `lastActiveAt`, `onboardingCompletedAt` : les champs existent et sont
  protégés en entrée, mais aucune logique d'écriture de ces dates n'a été trouvée dans le code applicatif.
- Upload du logo d'organisation : seule l'URL HTTPS est actuellement gérée.
- Fournisseur email HTTP : tâche P1 dépendante de D-11, avec refus explicite déjà implémenté.

## 11. Quand déclarer le sprint terminé ?

**Sprint solo initial** : UM-001 et UM-002 satisfont leur DoD, preuves CI/livraison comprises ;
UM-006 ne compte dans le réalisé que si le stretch est accepté et satisfait aussi sa DoD.
Puis démonstration, acceptation, documentation, revue/rétrospective et replanification suivant SPRINT-01.
La checklist prévoit aussi un tag `v0.1.0` sur `master` et des notes de release ; aucun tag local n'a été
observé pendant cette analyse, sans conclusion sur les tags du dépôt distant.

**Module User Management complet** : toutes les DoD UM-001 à UM-008 satisfaites, ou reports P1
explicitement acceptés et tracés, six parcours E2E verts en CI, gates de sécurité et couvertures verts,
validations manuelles réalisées et preuves sur la version livrée.

Les avatars ajoutent une capacité utile. Ils ne ferment pas automatiquement les critères CI,
manuels et de livraison qui restaient ouverts avant leur implémentation.
