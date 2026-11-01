# Gestion des médias (images)

Toutes les images envoyées par les utilisateurs (photos de profil, logos d'organisation et futurs
types) passent par un seul module serveur, `apps/server/src/media`. Les règles d'upload sont
déclarées une seule fois, dans `@redova/contracts`, et partagées par l'API et le frontend.

| Élément | Rôle |
| --- | --- |
| `packages/contracts/src/media.ts` | Règles par type : formats, extensions, taille maximale, dimensions de sortie, codes d'erreur |
| `media-upload.interceptor.ts` | Lecture du multipart (`file`, un seul champ) ; filtre type MIME, extension et taille avant tout traitement |
| `image-processor.ts` | Vérification des octets réels, décodage Sharp, redimensionnement, réencodage WebP, suppression des métadonnées |
| `media-key.ts` | Nommage et rangement des objets |
| `media-storage.ts` | Interface de stockage ; adaptateurs `local` et `s3` (AWS S3, Cloudflare R2) |
| `media.service.ts` | Point d'entrée : `store`, `read`, `discard` |
| `media-mutation.guard.ts` | Limite Redis commune : 10 modifications d'image par compte sur 10 minutes |
| `prune-media.ts`, `cli/media-prune.ts` | Nettoyage des objets orphelins |

Les services métier (`AvatarService`, `OrganizationLogoService`) gardent les règles du domaine :
autorisations, colonne de base qui référence l'image, verrou de remplacement et audit.

## Règles par type

| Type (`MediaKind`) | Formats acceptés | Extensions | Taille max. | Sortie | Erreurs |
| --- | --- | --- | --- | --- | --- |
| `avatar` | JPEG, PNG, WebP | `.jpg`, `.jpeg`, `.png`, `.webp` | 5 MiB | WebP 512 × 512 recadré (`cover`), qualité 80 | `AVATAR_INVALID` 400, `AVATAR_TOO_LARGE` 413, `AVATAR_NOT_FOUND` 404 |
| `organizationLogo` | JPEG, PNG, WebP | `.jpg`, `.jpeg`, `.png`, `.webp` | 2 MiB | WebP dans une boîte 512 × 512, proportions conservées (`inside`), qualité 85 | `ORG_LOGO_INVALID` 400, `ORG_LOGO_TOO_LARGE` 413, `ORG_LOGO_NOT_FOUND` 404 |

Pour tous les types :

- refus des SVG, GIF, HEIC, PDF et de tout format absent de la liste ;
- refus des images animées (WebP ou PNG `acTL`) et des sources de plus de 16 millions de pixels ;
- l'orientation EXIF est appliquée, puis toutes les métadonnées (EXIF, GPS, ICC) sont supprimées ;
- traitement limité à 5 secondes ; aucune image n'est agrandie.

Les contrôles sont faits dans l'ordre suivant, et un fichier refusé n'est jamais écrit :

1. Le navigateur fait un pré-contrôle (`checkMediaFile`), uniquement pour le confort de l'utilisateur.
2. L'intercepteur vérifie le type MIME déclaré, l'extension du nom de fichier et la taille.
3. Le processeur vérifie la signature binaire (magic bytes), décode l'image et la réencode.

Le nom de fichier envoyé par le client n'est utilisé que pour lire son extension. Il n'est jamais
stocké.

## Nommage et rangement

Chaque image enregistrée devient un nouvel objet immuable, identifié par un UUID v4 généré par le
serveur. Les objets sont regroupés par propriétaire :

```text
users/{userId}/avatars/{uuid}.webp
organizations/{organizationId}/logos/{uuid}.webp
```

- La même clé sert de chemin sur disque et de clé S3/R2.
- Un remplacement crée une nouvelle clé : les anciennes URLs deviennent 404 et aucun cache ne sert
  une ancienne image.
- Le regroupement par propriétaire permet l'export, l'effacement d'un compte ou d'un tenant et le
  nettoyage par simple préfixe.
- Chaque segment de clé est validé (identifiants `[A-Za-z0-9_-]`, UUID strict, extension `.webp`).
  Une clé ne peut donc pas sortir de la racine de stockage.

La base de données ne contient jamais de chemin ni d'URL présignée. Elle stocke l'URL stable de
lecture de l'API :

- `/api/v1/avatars/{uuid}` pour une photo de profil ;
- `/api/v1/organizations/{id}/logo/{uuid}` pour un logo d'organisation.

## Stockage

### Développement local (par défaut)

```dotenv
MEDIA_STORAGE=local
# Facultatif ; par défaut apps/server/.data/media (ignoré par Git)
# MEDIA_LOCAL_DIR=/var/lib/redova/media
```

Exemple d'arborescence :

```text
apps/server/.data/media/
├── users/
│   └── 3fJx…Q9/avatars/5b1c…e2.webp
└── organizations/
    └── Wm2k…a7/logos/0d7e…41.webp
```

- Les répertoires sont créés en mode 0700 et les fichiers en 0600, selon ce que permet le système.
- L'écriture est exclusive : un fichier existant n'est jamais écrasé.
- La lecture refuse les liens symboliques.
- Quand le dernier fichier d'un propriétaire est supprimé, ses répertoires vides le sont aussi.
- Le répertoire n'est jamais servi statiquement.

En production, le disque local n'est acceptable qu'avec un volume persistant et une seule instance.
Dès qu'il y a plusieurs instances, utiliser S3/R2.

### Production AWS S3

```dotenv
MEDIA_STORAGE=s3
MEDIA_S3_BUCKET=redova-media
MEDIA_S3_REGION=eu-west-3
# Sans les deux variables suivantes, le SDK utilise le rôle IAM du service (recommandé).
# MEDIA_S3_ACCESS_KEY_ID=...
# MEDIA_S3_SECRET_ACCESS_KEY=...
```

Configuration du bucket :

- privé, avec le blocage des accès publics activé ;
- chiffrement par défaut ;
- aucune règle CORS, car le navigateur passe toujours par l'API.

Droits IAM minimaux :

- `s3:PutObject`, `s3:GetObject` et `s3:DeleteObject` sur `users/*` et `organizations/*` ;
- `s3:ListBucket` limité à ces deux préfixes, pour le nettoyage.

### Production Cloudflare R2

```dotenv
MEDIA_STORAGE=s3
MEDIA_S3_BUCKET=redova-media
MEDIA_S3_REGION=auto
MEDIA_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
MEDIA_S3_ACCESS_KEY_ID=...
MEDIA_S3_SECRET_ACCESS_KEY=...
MEDIA_S3_FORCE_PATH_STYLE=false
```

- Créer un jeton R2 « Object Read & Write » limité à ce bucket.
- Ne pas activer de domaine public (`r2.dev` ou domaine personnalisé).
- L'endpoint doit être en HTTPS en production ; la configuration est refusée au démarrage sinon.

Pour les deux fournisseurs :

- chaque objet est écrit avec `If-None-Match: *` (jamais d'écrasement) et `Cache-Control: private,
  no-store` ;
- les erreurs réseau sont retentées 3 fois, avec un délai de connexion de 3 s et de requête de 10 s ;
- les secrets ne vont jamais dans une variable `NEXT_PUBLIC_*` ni dans Git ; les journaux les
  masquent (`log-redaction.ts`).

## Nettoyage des orphelins

Un orphelin est un objet que plus aucune ligne de la base ne référence. Il peut apparaître après un
échec de suppression, un arrêt brutal ou la suppression d'un compte.

```bash
# Simulation pour tous les types : rien n'est supprimé
pnpm --filter @redova/server media:prune
# Un seul type
pnpm --filter @redova/server media:prune --kind avatar
# Suppression effective des orphelins de plus de 24 h
pnpm --filter @redova/server media:prune --apply
```

- Le délai de 24 h protège les uploads en cours, car l'objet est écrit avant que la base ne le
  référence.
- Planifier `--apply` une fois par jour, avec la même base et le même stockage que l'API.
- Ne jamais lancer `--apply` avec une base vide ou issue d'un autre environnement.
- Ne pas configurer de règle d'expiration par âge sur le bucket : elle supprimerait aussi les images
  en cours d'utilisation.

## Ajouter un nouveau type d'image

1. **Règles :** ajouter une entrée à `MEDIA_POLICIES` (contracts) avec ses limites, son format de sortie
   et ses codes d'erreur. Déclarer ces codes dans `errors.ts`.
2. **Rangement :** ajouter le préfixe du propriétaire et le nom de la collection dans `LAYOUT`
   (`media-key.ts`).
3. **Nettoyage :** ajouter dans `REFERENCES` (`prune-media.ts`) la règle qui indique si un objet est
   encore référencé.
4. **Route d'envoi :** appliquer sur le contrôleur `@UseGuards(OriginGuard, …, MediaMutationGuard)`
   et `@UseInterceptors(MediaUploadInterceptor('<kind>'))`, puis appeler
   `media.store(kind, ownerId, file.buffer)`.
5. **Publication :** enregistrer la référence dans la base, puis appeler `media.discard(ancienneClé)`.
   Si l'écriture en base échoue, appeler `media.discard(nouvelleClé)`.
6. **Route de lecture :** vérifier les droits du lecteur, puis appeler `media.read(kind, ownerId, id)`
   et répondre avec `Cache-Control: private, no-store` et `X-Content-Type-Options: nosniff`.
7. **Frontend :** utiliser `mediaAccept(kind)`, `mediaRequirements(kind)` et
   `mediaFileProblem(kind, file)` (`apps/web/lib/media/media-policy.ts`).

## Changement de configuration (depuis `AVATAR_*`)

Les variables `AVATAR_STORAGE`, `AVATAR_LOCAL_DIR` et `AVATAR_S3_*` sont remplacées par
`MEDIA_STORAGE`, `MEDIA_LOCAL_DIR` et `MEDIA_S3_*`. Leurs valeurs ne changent pas.

L'ancien rangement est abandonné :

- `avatars/{uuid}.webp` ;
- `organization-logos/{uuid}.webp`.

Aucun environnement de production n'utilisait encore ce stockage. Les images de développement
créées avant ce changement ne sont plus trouvées : supprimer `apps/server/.data/avatars`, puis
renvoyer les images depuis l'application.

## Vérification

```bash
pnpm --filter @redova/contracts test
pnpm --filter @redova/server test        # politiques, clés, service logo
pnpm --filter @redova/server test:jest   # processeur d'image, adaptateurs, nettoyage
pnpm --filter @redova/server test:integration
pnpm --filter @redova/web test
```
