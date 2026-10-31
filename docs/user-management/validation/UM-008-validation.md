# UM-008 — preuves et revue de sécurité

Date : 31 octobre 2026, fuseau Africa/Lagos. Branche : `feat/um-008-e2e-ci-coverage`.

## État

UM-008 est livré sur `master` par les PR #21 à #25 (issue #8 fermée), et l'extension avatar par les
PR #27 et #28. GitHub Actions est vert sur `master` (`1a9a976`) pour `lint-typecheck-unit`,
`integration`, `e2e` et `security`. Il reste à ajouter `e2e` et `security` aux checks requis de
`master` (réglage du dépôt). Les tableaux ci-dessous détaillent les preuves locales reproductibles.

## Validation reproductible

```bash
pnpm infra:up
pnpm infra:e2e
pnpm check:workflows
pnpm test:tooling
pnpm turbo run build lint typecheck test
pnpm db:schema:check
pnpm test:integration
pnpm test:jest
pnpm test:e2e
pnpm security:audit
pnpm security:secrets
pnpm security:secrets:self-test
```

Pour reproduire les seuils localement, définir `CI=true` avant les commandes de tests. GitHub Actions
le fournit automatiquement. Sous PowerShell : `$env:CI='true'` ; sous Bash : `CI=true pnpm ...`.
Pour toute la suite d'intégration locale, utiliser `REDIS_URL=redis://localhost:6381`,
`MAILPIT_URL=http://localhost:8026`, `MAILPIT_SMTP_PORT=1026` afin de réserver les services de test.
Les E2E utilisent ces services dédiés par défaut via leurs variables `E2E_*`.

| Contrôle | Résultat local |
| --- | --- |
| Build/lint/typecheck/tests monorepo avec `CI=true` | 35 tâches réussies ; seuils unitaires activés |
| Schéma Better Auth | Génération sans différence avec le schéma suivi par Git |
| Migrations vierges | 4 migrations appliquées dans une base temporaire créée pour ce contrôle puis supprimée |
| Intégration serveur + sécurité + avatars | 183 tests réussis ; seuil de 80 % conservé |
| Intégration monorepo avec `CI=true` | 13 tâches réussies ; 194 tests d'intégration au total (DB 7, worker 3, auth 1, serveur 183) |
| Couverture serveur Vitest intégration | 81,29 % des lignes lors de la première mesure après déplacement des tests HTTP avatar |
| Jest complémentaire | 113 tests réussis ; aucun test avatar supprimé, le cycle HTTP a changé de runner |
| E2E HTTP, vrais server/worker | 8 tests réussis : 6 parcours métier + audit + recherche de secrets dans les logs |
| Couverture core | 98,57 % des lignes, seuil 95 % |
| Couverture contracts | 100 % des lignes, seuil 85 % |
| Couverture integrations | 93,87 % des lignes, seuil 85 % |
| Audit dépendances production | Gate high/critical réussi ; 2 moderate et 1 low restent signalées, sans exception au gate |
| Gitleaks historique + source courante | Aucun finding après examen de l'unique faux positif historique |
| Autotest Gitleaks | Fausse clé générée dans un répertoire temporaire détectée ; exit code de refus vérifié |
| Règle ESLint tenant | 8 cas valid/invalid vérifiés par RuleTester ; queries globales permises, modèles tenant protégés |
| Syntaxe/contrat workflow | Les cinq jobs et les étapes sécurité bloquantes sont vérifiés |

Rapports serveur : `apps/server/coverage/integration/{coverage-summary.json,lcov.info,lcov-report/}`.
Rapports unitaires : `packages/{core,contracts,integrations}/coverage/`.
Rapports Gitleaks : `test-results/security/*.json`, secrets masqués à 100 %.
Journaux E2E : `apps/server/.e2e-logs/` ; ils ne contiennent que les identifiants générés par les tests.
Ces artefacts sont ignorés par Git ; la CI les publie avec une rétention de 7 jours selon les conditions du job.

## Changements qui ferment les écarts techniques

- Les tests HTTP avatar sont dans `test/avatar.int-spec.ts`, inclus dans la couverture Vitest serveur.
  Les scénarios sont conservés ; aucune baisse de seuil ou exclusion artificielle du stockage n'est faite.
- Les rapports LCOV et JSON sont produits et publiés par les jobs CI.
- Le job `e2e` construit puis démarre le serveur et le worker, et publie les logs sur échec.
- Le job `security` applique l'audit production, Gitleaks sur historique/source et son autotest.
- Le scanner utilise l'image officielle Gitleaks 8.30.1 épinglée par digest. Le snapshot de source
  exclut les fichiers ignorés tels que `.env`. Les sorties et rapports sont masqués.
- `.gitleaksignore` vise uniquement le fingerprint du placeholder `abc123def456` dans un ancien badge
  du scaffold Nest. Aucun chemin complet, type de clé ou règle de détection n'est désactivé.
- Le faux secret est généré à l'exécution dans un répertoire temporaire, nettoyé ensuite. Cette méthode
  remplace la branche jetable suggérée par le ticket pour respecter la demande de conserver la branche actuelle.
- Redis/Mailpit E2E sont isolés des services de développement ; la boîte Mailpit n'est plus effacée globalement.
- La règle ESLint `redova/tenant-scope` bloque `findUnique` et `findUniqueOrThrow` sur les modèles tenant,
  y compris la notation calculée. Une exception exige un commentaire local `tenant-scope-reviewed: <raison>`.
- Le contrat documente le multipart avatar, les réponses binaires/204 et les 34 actions d'audit.
  L'OpenAPI avatar expose le schéma JSON de succès et les erreurs dédiées.

## Revue de menaces T1–T16

Revue technique effectuée sur le code et les tests du checkout. Cette revue fournit le contenu du
sign-off à joindre à la PR ; elle ne remplace pas une approbation externe ou un audit indépendant.

| Menace | Contrôle / preuve | Risque résiduel ou limite |
| --- | --- | --- |
| T1 — brute force | Rate limit Redis, throttle par compte, HIBP, MFA ; IT-001-07, IT-008-06, IT-004-06 | Protection réseau globale/WAF à configurer au déploiement |
| T2 — énumération | Réponses génériques, email asynchrone ; IT-002-02/05, IT-003-05, IT-008-07 | Pas d'égalisation absolue des temps de réponse |
| T3 — session volée | Cookies sécurisés, HSTS, révocation immédiate ; SEC-10, IT-002-06 | Pas de liaison de session à un appareil ; cookie volé utilisable jusqu'à révocation/expiration |
| T4 — CSRF | Origines natives et OriginGuard ; SEC-10, IT-007-14, tests avatar | Proxy/origines publics à configurer correctement |
| T5 — élévation globale | Champs protégés, admin natif HTTP désactivé, garde-fous ; IT-002-12, IT-007-07/10/15 | Les accès opérateur doivent rester restreints |
| T6 — élévation organisation | Matrice de rang et protections propriétaire ; IT-006-01…05 | Les futurs rôles doivent étendre les mêmes règles/tests |
| T7 — IDOR/tenant | Tenant du chemin, membership en base, queries filtrées, lint ; TENANT-ISO, IT-008-02 | Le kit de contrat reste obligatoire pour les futurs modules |
| T8 — contournement MFA | Challenge, verrouillage et codes à usage unique ; IT-004-04…09, E2E-04 | Reset opérateur soumis au runbook d'identité |
| T9 — fuite de tokens | Logs filtrés, métadonnées d'audit autorisées ; SEC-11, E2E SR-11 | Redis contient les liens des emails en attente : réseau privé/TLS/ACL nécessaires en production |
| T10 — surexposition API | Sélections/DTO explicites ; IT-007-04, IT-008-01, SEC-11 | Les tokens de sessions personnelles restent une exception native documentée |
| T11 — redirection ouverte | trustedOrigins ; IT-002-07, IT-003-12 | Le frontend doit conserver cette politique |
| T12 — vol d'invitation | Destinataire et email vérifié ; IT-005-06/07 | La boîte email du destinataire reste un facteur de confiance |
| T13 — audit altéré | Trigger append-only ; tests DB et IT-008-05 | Le superutilisateur PostgreSQL peut contourner le contrôle ; sauvegarde/export externe à organiser |
| T14 — injection email | Handlebars échappé, sujets sans CR/LF ; tests renderer | Validation visuelle Gmail/mobile des autres tickets reste distincte |
| T15 — panne HIBP | Refus fermé et tests d'indisponibilité | Peut bloquer les opérations qui définissent un mot de passe |
| T16 — secrets committés | Gitleaks historique/source, autotest et validation env | Rotation et gestionnaire de secrets restent des responsabilités de déploiement |

Extension avatar : signatures et décodage réels, limites de taille/pixels/temps, réencodage sans
métadonnées, bucket privé, lecture autorisée, remplacement concurrent et nettoyage d'orphelins testés.
La connexion à un bucket cloud réel reste une recette de déploiement ; les commandes SDK sont testées avec un client simulé.

## Dépendances non bloquantes à surveiller

Au 31 octobre 2026 : `js-yaml` et `minimatch` (moderate), `deepmerge` (low) dans l'arbre production.
Aucune vulnérabilité high/critical n'est autorisée par exception. Réexaminer les mises à jour compatibles
avant la mise en production et au plus tard le 30 novembre 2026. Ne pas imposer un changement majeur
transitif incompatible pour faire disparaître un avertissement sans tests de compatibilité.

## Clôture distante et contenu de PR

Protection `master` lue pendant la validation : `strict=true`, administrateurs soumis aux protections,
checks requis `lint-typecheck-unit`, `integration`, `git-hygiene`. Après publication du workflow,
ajouter **e2e** et **security**, puis vérifier une exécution réussie des cinq checks sur la PR.
Après fusion, vérifier aussi les jobs applicatifs sur `master` ; `git-hygiene` est propre aux PR.
Aucun réglage distant n'a été modifié pendant cette implémentation locale.

Les critères AC-008-11 et AC-008-13 ont leur implémentation et leurs preuves locales. La case
« six parcours verts en CI sur master » doit rester ouverte jusqu'à présence du lien d'exécution.
Le ticket ne doit pas être fermé automatiquement avant cette preuve.

Résumé à reprendre dans la PR :

> Les parcours E2E, les gates d'audit/secrets et la collecte de couverture sont ajoutés à la CI.
> La suite mesurée inclut le cycle HTTP avatar et respecte le seuil serveur de 80 %. Les services
> de test sont isolés du développement. La revue T1–T16, les risques résiduels et les commandes de
> validation sont consignés dans ce dossier. Les preuves locales sont vertes ; joindre les liens
> GitHub Actions et activer les deux nouveaux checks requis avant la clôture.
