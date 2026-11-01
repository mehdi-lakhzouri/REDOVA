# Logos d’organisation — stockage et exploitation

L’upload est géré par `apps/server/src/organizations`. Les règles de session, d’origine et d’appartenance sont appliquées avant la lecture du multipart. Les fichiers ne sont jamais servis statiquement.

## Configuration

Les logos réutilisent les variables du stockage avatar ; `.env.example` les documente. Aucun secret supplémentaire n’est nécessaire si ce stockage est déjà configuré.

| Mode | Configuration | Objets |
| --- | --- | --- |
| Local | `AVATAR_STORAGE=local`, éventuellement `AVATAR_LOCAL_DIR` | `<AVATAR_LOCAL_DIR>/organization-logos/<uuid>.webp` |
| AWS S3 | `AVATAR_STORAGE=s3`, `AVATAR_S3_BUCKET`, `AVATAR_S3_REGION`, rôle IAM ou paire de clés existante | Préfixe privé `organization-logos/` dans le même bucket |
| Cloudflare R2 | Configuration S3, région `auto`, `AVATAR_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, clés R2 | Même préfixe privé |

En local, monter un répertoire persistant privé et accessible au seul compte du service. Sur plusieurs réplicas, utiliser un stockage partagé ou S3/R2. Le bucket doit rester privé ; étendre les permissions IAM existantes au préfixe `organization-logos/` pour lire, écrire, supprimer et lister les objets. Les accès par rôle IAM restent possibles sans clés explicites.

`BETTER_AUTH_URL` fournit l’origine de l’URL du logo enregistrée en base. Configurer son URL publique stable avant déploiement. Le navigateur utilise le chemin `/api/v1/organizations/.../logo/...` par le proxy Next de même origine pour transmettre la session. Aucun endpoint d’image public ou CDN avec cache partagé n’est requis.

La colonne `organization.logo` existante conserve la référence courante ; aucune migration n’est ajoutée. Une URL HTTPS externe reste acceptée par les handlers natifs Better Auth. Le serveur ne télécharge pas cette URL et n’y applique pas le traitement des fichiers uploadés.

## Cycle de vie et erreurs

- POST `/api/v1/organizations/:organizationId/logo` : un champ fichier `file`, JPEG/PNG/WebP, maximum 2 MiB. Réponse 200 avec `data.logo`.
- GET `/api/v1/organizations/:organizationId/logo/:logoId` : WebP privé pour un membre actif ; l’URL doit correspondre au logo courant d’une organisation active.
- DELETE `/api/v1/organizations/:organizationId/logo` : retire la référence et l’ancien objet géré ; réponse 204, y compris si le logo était déjà absent.

Les mutations exigent `organization:update`. Une tentative d’un non-membre retourne 404 ; un membre sans permission reçoit 403. Les écritures partagent la limite Redis des médias avec les avatars : dix modifications par utilisateur sur dix minutes, avec `Retry-After` si dépassée. Les contrôles métier restent applicables lorsque le rate limit est désactivé dans un environnement de test.

Un problème de stockage pendant l’upload ne nécessite pas de recréer l’organisation. Réessayer sur le même ID. Les fichiers sont publiés sous des clés neuves ; le swap de référence est sérialisé en PostgreSQL. En cas d’échec de base après écriture, le nouvel objet est supprimé. Un échec de nettoyage est loggé et peut laisser un orphelin privé, traité par la commande ci-dessous.

## Nettoyage des orphelins

Après build du serveur, vérifier les candidats sans suppression :

```sh
pnpm --filter @redova/server logos:prune
```

Puis appliquer explicitement le nettoyage :

```sh
pnpm --filter @redova/server logos:prune --apply
```

La commande utilise la configuration d’environnement normale du serveur. Elle ne supprime que les objets du préfixe des logos, âgés d’au moins 24 heures et non référencés par une organisation. Les objets récents sont conservés pour protéger les uploads en cours. Les URLs externes ne sont jamais supprimées. Un remplacement par URL externe via Better Auth peut laisser l’ancien objet géré jusqu’à ce passage.

Planifier cette commande avec l’ordonnanceur d’exploitation si souhaité ; aucun cron n’est créé automatiquement. Surveiller les erreurs de stockage, les échecs de nettoyage et l’espace occupé. Ne pas activer de politique de suppression par âge sur tout le préfixe : elle supprimerait aussi les logos courants.

## Preuves et limites

Les tests d’intégration locaux vérifient upload, proportion de l’image, audit, lecture autorisée, isolation des tenants, suspension, remplacement, retrait, fichier forgé et dépassement de taille avec PostgreSQL et Redis. Les tests des adaptateurs S3/R2 utilisent des réponses SDK simulées pour vérifier le préfixe, la confidentialité et les limites ; aucun bucket réel n’a été contacté.

Voir [l’implémentation frontend et les captures](../../frontend/onboarding.md) pour le parcours complet et les commandes de vérification.
