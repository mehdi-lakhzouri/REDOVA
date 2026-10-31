# Gestion des avatars

Le module Nest `profile` gère le cycle de vie des photos de profil. `storage` fournit une interface
interchangeable avec deux adaptateurs : disque local et API S3 (AWS S3 ou Cloudflare R2).
`User.image` conserve l'URL stable de lecture de l'API, jamais une URL présignée ni un chemin disque.
Aucune migration de base de données supplémentaire n'est nécessaire.

## API

| Méthode | Route | Résultat |
| --- | --- | --- |
| POST | `/api/v1/users/me/avatar` | Upload ou remplacement ; enveloppe `{ data: { image }, meta, error: null }` |
| DELETE | `/api/v1/users/me/avatar` | Suppression idempotente ; HTTP 204 sans corps |
| GET | `/api/v1/avatars/:avatarId` | Image WebP binaire ; accès privé |

Les trois routes exigent une session valide avec email vérifié. Les mutations exigent également
un `Origin` correspondant à `WEB_ORIGIN` (ou le signal navigateur `Sec-Fetch-Site: same-origin`).
L'identité vient exclusivement de la session : aucun `userId` fourni par le client n'est accepté.

Lecture : propriétaire, membres actifs d'une même organisation active, ou administrateur plateforme
avec MFA activé. Les autres utilisateurs reçoivent 404. Les réponses portent
`Cache-Control: private, no-store` et `Vary: Cookie`, pour éviter la mise en cache partagée.
Le bucket et le répertoire disque ne doivent pas être servis publiquement.

Le formulaire multipart doit contenir **un seul champ fichier nommé `file`**, sans autre champ :

```bash
curl -X POST http://localhost:3001/api/v1/users/me/avatar \
  -H 'Origin: http://localhost:3000' \
  -b cookies.txt \
  -F 'file=@photo.png'

curl -X DELETE http://localhost:3001/api/v1/users/me/avatar \
  -H 'Origin: http://localhost:3000' \
  -b cookies.txt
```

`cookies.txt` doit provenir d'une connexion authentifiée. Sous PowerShell, utiliser `curl.exe` et
mettre la commande sur une ligne, ou remplacer les continuations Bash par des accents graves.

Dans le navigateur :

```typescript
const form = new FormData();
form.append('file', file);
const response = await fetch('/api/v1/users/me/avatar', {
  method: 'POST',
  credentials: 'include',
  body: form,
});
```

Ne pas définir `Content-Type` manuellement : le navigateur génère la frontière multipart.
Après une mutation, rafraîchir la session et les données du profil. L'URL change à chaque remplacement.
Le frontend doit utiliser le routage de même origine prévu pour les API et leurs cookies.
Pour Next Image, utiliser un rendu sans optimiseur (`unoptimized`) ou un relais authentifié adapté :
l'optimiseur serveur ne dispose pas automatiquement des cookies de session du navigateur.

Les endpoints Better Auth `/update-user` et `/sign-up/email` refusent désormais le champ `image`
avec `AVATAR_MANAGED_BY_SERVER`, pour empêcher le contournement du traitement sécurisé.

## Validation et sécurité

- JPEG, PNG et WebP uniquement ; limite de 5 MiB avant décodage.
- Le type MIME est filtré, puis les octets réels sont décodés par Sharp ; une extension seule ne suffit pas.
- Limite de 16 millions de pixels ; WebP et PNG animés refusés ; temps de traitement limité.
- Réorientation, recadrage jusqu'à 512 × 512 sans agrandissement, puis réencodage WebP.
- Les métadonnées source, dont EXIF et GPS, ne sont pas conservées.
- Identifiant UUID généré côté serveur ; aucun nom de fichier client n'est utilisé dans le stockage.
- Limite partagée Redis : 10 mutations par compte sur une fenêtre de 10 minutes, avant lecture du fichier.
  Elle suit `RATE_LIMIT_ENABLED` et renvoie 429 avec `Retry-After`.
- Événements d'audit `profile.avatar.updated` et `profile.avatar.deleted`, sans contenu de fichier.

Erreurs dédiées : `AVATAR_INVALID` (400), `AVATAR_TOO_LARGE` (413), `AVATAR_NOT_FOUND` (404).
Les erreurs de stockage et de base sont masquées par le filtre global.

## Développement local

Le mode par défaut fonctionne sans modification de `.env` :

```dotenv
AVATAR_STORAGE=local
# Facultatif : chemin absolu, privé et persistant.
# AVATAR_LOCAL_DIR=/var/lib/redova/avatars
```

Le répertoire par défaut est `apps/server/.data/avatars`, créé au premier upload et ignoré par Git.
Les permissions demandées sont 0700 pour le répertoire et 0600 pour les fichiers, selon les capacités
du système. Le répertoire doit être contrôlé par le compte de service. Aucun serveur statique n'est exposé.

```bash
pnpm turbo run build --filter=@redova/server
pnpm --filter @redova/server dev
```

En production sur disque local, un volume persistant est indispensable. Plusieurs réplicas doivent
partager le même stockage ; utiliser S3/R2 pour un déploiement distribué.

## Production AWS S3

```dotenv
AVATAR_STORAGE=s3
AVATAR_S3_BUCKET=redova-avatars
AVATAR_S3_REGION=eu-west-3
```

Utiliser de préférence un rôle IAM attaché au service. Le SDK utilise sa chaîne de credentials standard
si les deux variables de credentials ci-dessous sont absentes. Pour des credentials explicites :

```dotenv
AVATAR_S3_ACCESS_KEY_ID=...
AVATAR_S3_SECRET_ACCESS_KEY=...
```

Garder le bucket privé, activer le blocage des accès publics et attribuer uniquement les droits nécessaires :
`GetObject`, `PutObject`, `DeleteObject` sur `avatars/*` ; `ListBucket` sur ce préfixe pour le nettoyage.
Configurer le chiffrement et la rétention des éventuelles versions précédentes au niveau du bucket.
Le code ne demande pas d'ACL publique. Le navigateur n'accède pas directement au bucket : aucun CORS
de bucket n'est nécessaire pour ce parcours.

## Production Cloudflare R2

```dotenv
AVATAR_STORAGE=s3
AVATAR_S3_BUCKET=redova-avatars
AVATAR_S3_REGION=auto
AVATAR_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
AVATAR_S3_ACCESS_KEY_ID=...
AVATAR_S3_SECRET_ACCESS_KEY=...
AVATAR_S3_FORCE_PATH_STYLE=false
```

Utiliser des credentials S3 R2 limités au bucket concerné. Ne pas activer d'accès public.
Le paramètre endpoint doit utiliser HTTPS en production. Les secrets ne doivent pas être exposés
par des variables `NEXT_PUBLIC_*`, ni committés. Les paramètres sont décrits dans `.env.example`.

Les credentials réels et le bucket doivent être fournis par le déploiement ; les tests automatiques
valident l'adaptateur avec un client SDK simulé, sans compte cloud externe.

## Remplacement, concurrence et nettoyage

Chaque upload écrit un nouvel objet avant de publier son URL en base. Un verrou transactionnel PostgreSQL
par utilisateur sérialise les remplacements et suppressions entre réplicas. Si la mise à jour échoue,
le nouvel objet est supprimé ; après succès, l'ancien objet est supprimé. Les anciennes URLs deviennent 404.
Une suppression répétée reste sans effet et ne produit pas d'événement d'audit supplémentaire.

Une panne de stockage pendant la suppression est journalisée sans annuler une mise à jour déjà validée.
Les objets orphelins après incident, arrêt brutal ou suppression d'utilisateur sont récupérés par :

```bash
# Simulation : aucun objet supprimé.
pnpm --filter @redova/server avatars:prune
# Suppression des objets non référencés datant de plus de 24 heures.
pnpm --filter @redova/server avatars:prune --apply
```

Planifier cette dernière commande quotidiennement dans le déploiement, avec la même configuration de
stockage et de base que l'API. La commande ne parcourt que les clés d'avatars UUID reconnues et conserve
toutes les images référencées par les utilisateurs. Le délai protège les uploads en cours.
Ne jamais l'exécuter avec le stockage de production et une base vide ou issue d'un autre environnement.
Le bucket/préfixe doit être réservé à une seule base applicative.

Avant de changer de fournisseur, copier les fichiers actifs : `<AVATAR_LOCAL_DIR>/<uuid>.webp`
correspond à la clé S3 `avatars/<uuid>.webp`. Vérifier la copie avant de basculer `AVATAR_STORAGE`.
Les liens en base conservent l'origine publique de l'API : préserver cette origine ou migrer les URLs
lors d'un changement de domaine.

## Vérification

```bash
pnpm --filter @redova/server test:jest
pnpm --filter @redova/server test
pnpm --filter @redova/server test:integration
pnpm --filter @redova/server typecheck
pnpm --filter @redova/server lint
```

Le cycle HTTP est testé par Vitest dans `apps/server/test/avatar.int-spec.ts`, pour participer à la
couverture serveur exigée en CI. Les tests unitaires image/stockage/compensation restent dans Jest.
Les tests couvrent les formats et fichiers corrompus, les métadonnées, les dimensions, les limites,
les permissions, les origines, le contournement Better Auth, le remplacement concurrent, la suppression,
les compensations en cas de panne, le nettoyage d'orphelins et les commandes SDK S3/R2.

Références : [NestJS upload](https://docs.nestjs.com/techniques/file-upload),
[Sharp](https://sharp.pixelplumbing.com/api-constructor/),
[R2 et AWS SDK v3](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/).
