# REDOVA — Emails transactionnels clairs

Mise à jour du 1er novembre 2026. Les cinq modèles existants utilisent désormais une base commune claire : fond gris léger, carte blanche, logo officiel, illustration discrète et bouton rouge.

| Email | Usage | Aperçu |
| --- | --- | --- |
| `verify-email` | Activation de l’adresse, expiration réelle de 24 heures | [Desktop](verify-email-desktop.png), [mobile](verify-email-mobile.png) |
| `reset-password` | Lien à usage unique pour choisir un nouveau mot de passe | [Desktop](reset-password-desktop.png) |
| `existing-account` | Information lors d’une tentative de réinscription ; connexion et récupération | [Desktop](existing-account-desktop.png) |
| `security-notification` | Changement de mot de passe, MFA ou autre événement de sécurité configuré | [Desktop](security-notification-desktop.png) |
| `organization-invitation` | Invitation, rôle, échéance et accès avec la même adresse email | [Desktop](organization-invitation-desktop.png) |

Les captures utilisent uniquement des données fictives et des liens `example.com`, sans jetons réels. Les sujets existants sont conservés. Le texte des emails reste en anglais comme les écrans de l’application.

## Design et compatibilité

- Carte fluide de 600 px maximum, tables de présentation, attributs HTML de repli et styles essentiels inline.
- Fond `#F4F5F7`, carte blanche, texte `#0B0F14` / `#475467`, bordures `#E5E7EB`. Accent de marque `#FF2D2D` et bouton `#C8102E`, le rouge déjà utilisé par le thème clair du frontend, avec texte blanc.
- Arial/Helvetica/police système : aucune police web à télécharger.
- Aucun JavaScript, formulaire, iframe, SVG, vidéo, Flexbox ou Grid dans les messages envoyés.
- Bouton HTML avec lien et variante VML dans un commentaire conditionnel pour Outlook classique. L’URL est aussi affichée en texte et dans la version `text/plain`.
- Pré-en-tête discret pour l’aperçu de messagerie, titres structurés, illustration décorative avec texte alternatif vide et logo nommé.
- Marges adaptées aux petits écrans, noms et URLs longs repliés, contenu encore lisible lorsque les images et le bloc de styles du `<head>` sont retirés.

Le recours aux styles inline et aux media queries simples suit le [support CSS de Gmail](https://developers.google.com/workspace/gmail/design/css). Les tables, couleurs de fond unies et largeur limitée répondent aux [recommandations de rendu de Microsoft](https://learn.microsoft.com/en-us/troubleshoot/dynamics-365/customer-insights/journeys/email/email-troubleshoot-rendering). Le moteur Word d’Outlook classique et les thèmes sombres imposés par certaines applications peuvent produire des différences : une vérification visuelle dans les clients réels reste nécessaire. Les tests navigateur ne sont pas présentés comme un test Outlook natif.

Le design demande un affichage clair via les métadonnées de couleur ; il ne peut pas désactiver universellement les transformations de couleur décidées par chaque application de messagerie.

## Images et MIME

Le logo vient de `apps/web/public/brand/logos/redova-horizontal-light.png`, lui-même issu du logo officiel choisi. Il a été réduit pour l’email, sans régénérer le symbole ou le lettrage. L’illustration seule a été produite avec le skill `imagegen` et l’outil intégré.

Les deux assets sont livrés dans le package :

- `packages/integrations/assets/email/redova-logo-light.png` : 368 px de large, environ 10,6 Ko, affiché à 184 × 44 px.
- `packages/integrations/assets/email/account-security-light.jpg` : 1040 × 348 px, environ 6,9 Ko, affiché jusqu’à 520 × 174 px.

Le renderer charge ces fichiers fixes une seule fois et les fournit comme buffers avec des Content-IDs distincts. Nodemailer compose un message `multipart/alternative` (texte + HTML) avec une partie `multipart/related` pour les images inline, selon sa [documentation des images intégrées](https://nodemailer.com/message/embedded-images). Les emails n’utilisent pas d’URL localhost, de base64 dans l’attribut `src`, de CDN ou de téléchargement distant pour leurs images. Les Data URLs existent uniquement dans les aperçus navigateur locaux.

Les images ne portent aucun texte indispensable : si un client les masque, le contenu, le bouton et le lien de secours restent exploitables. L’ensemble des images représente environ 17,5 Ko avant encodage MIME ; le test limite le message complet de référence à 60 Ko.

## Organisation des fichiers

| Fichier ou dossier | Responsabilité |
| --- | --- |
| `packages/integrations/templates/email/layouts/base.html.hbs` | Squelette commun, pré-en-tête, logo, illustration, titre et pied de page |
| `templates/email/layouts/base.text.hbs` | Squelette de la version texte |
| `templates/email/partials/button.*.hbs` | Action et URL de secours ; HTML/VML ou texte |
| `templates/email/partials/notice.html.hbs` | Encadré d’information réutilisable |
| `templates/email/partials/security-footer.*.hbs` | Rappel de confidentialité |
| `templates/email/<type>/` | Sujet, contenu HTML et contenu texte de chaque événement |
| `src/email/email-assets.ts` | Assets fixes et Content-IDs ; aucun chemin fourni par le destinataire |
| `src/email/email-renderer.ts` | Compilation Handlebars, validation des données, HTML échappé et pièces jointes inline |
| `src/email/email-sender.ts` | Port et adaptateur SMTP ; délais de connexion et transport sécurisé |
| `scripts/preview-emails.mjs` | Aperçus locaux avec données fictives, sans envoi |
| `apps/worker/src/email-processor.ts` | Traitement habituel d’un job, rendu, envoi puis journalisation limitée aux métadonnées |

Les URLs d’action doivent utiliser HTTP/HTTPS sans identifiants dans l’URL. Les autres protocoles sont refusés avant l’envoi. Les champs utilisateur restent échappés par Handlebars ; les noms sont tronqués à 64 caractères. Aucun jeton ne doit être ajouté aux logs, captures ou aperçus publics.

## Aperçus et vérification

Depuis la racine :

```sh
pnpm --filter @redova/integrations email:preview
```

Ouvrir ensuite `.cache/email-previews/index.html`. Ce dossier contient les cinq versions HTML et texte. La commande ne lit pas la base et n’envoie aucun email.

Vérifications exécutées :

- Lint, TypeScript et build de `@redova/integrations` et `@redova/worker`.
- 32 tests du package d’intégration : snapshots des cinq modèles, échappement HTML, injection de sujet, protocoles d’URL, absence de contenu actif, correspondance des CIDs, poids des assets, MIME réel et transmission des images à l’adaptateur SMTP. Couverture V8 mesurée : 98,33 % des lignes, au-dessus du seuil configuré de 85 %.
- Trois tests unitaires du worker et trois tests d’intégration Redis + Mailpit : livraison, déduplication, nouvelle tentative après échec et garde de configuration Gmail en production.
- Vérification navigateur des cinq modèles à 320, 390, 600 et 900 px. Contrôle des noms de 64 caractères sans espace, des liens très longs, des images et de la lisibilité sans images/styles du `<head>`.

Les tests de transport utilisent Mailpit ou des mocks. Ils ne certifient pas le placement en boîte de réception ni toutes les versions de Gmail, Outlook et Apple Mail.

## Fournisseur et envoi réel demandé

Le `.env` local utilise actuellement `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=smtp.gmail.com`, port 587 et `SMTP_SECURE=false`. Sur ce port, l’adaptateur exige STARTTLS et fixe des délais de connexion. Les lectures de fichiers ou d’URLs fournies dans un message sont désactivées ; les images sont des buffers internes.

L’adresse d’expéditeur de développement était encore `no-reply@redova.local`. `EMAIL_FROM` a été aligné sur le compte SMTP authentifié, avec le nom d’affichage REDOVA ; aucune clé ni aucun mot de passe n’a été modifié. Gmail impose en général l’adresse de son compte authentifié, comme l’indique la [documentation Nodemailer pour Gmail](https://nodemailer.com/guides/using-gmail).

Le 1er novembre 2026, un seul nouvel email de vérification a été demandé via la configuration Better Auth existante pour le compte explicitement choisi par l’utilisateur en base. Le message a été envoyé avec le renderer et le processeur du worker existants, en exécution ponctuelle, sans démarrer un consommateur qui aurait traité d’autres emails en attente. Gmail SMTP a accepté l’envoi avec un Message-ID ; cela ne prouve pas son classement en boîte de réception. Le lien réel est valable 24 heures et revient vers `/verify-email` après la vérification. Le jeton n’a été ni affiché ni sauvegardé dans les aperçus.

Pour les prochains envois habituels, le backend continue à déposer les jobs dans BullMQ et le worker continue à les consommer. Après une modification des fichiers `.hbs`, redémarrer le worker car les templates sont compilés au démarrage :

```sh
cd apps/worker
pnpm dev
```

Le mode `EMAIL_TRANSPORT=api` reste distinct et sans adaptateur fournisseur implémenté. Cette livraison utilise le fournisseur SMTP réellement configuré. La protection existante qui réserve Gmail SMTP au développement est conservée ; en production, configurer un fournisseur transactionnel et son adresse d’expéditeur vérifiée.

## Illustration générée

Skill utilisé : `imagegen`, outil intégré ; aucun appel à la CLI de secours. Fichier source sélectionné : `exec-80712d17-f5a0-4430-adb9-13a2991caac9.png`. Asset final : `packages/integrations/assets/email/account-security-light.jpg`.

Prompt final :

> Use case: stylized-concept. Asset type: lightweight illustration banner for REDOVA transactional HTML emails, landscape 1536 by 512 pixels (3:1). Create a clean, understated premium SaaS account-security illustration on a uniform warm-white #FFF8F8 background. A small elegant matte porcelain-white envelope, slightly tilted in three-quarter view, sits centered horizontally with a small sculptural white shield in front carrying one simple ruby-red check mark. Fine red #FF2D2D edge details and one very faint blush orbital arc suggest secure communication. Soft studio daylight, subtle pale gray #E5E7EB contact shadows, generous quiet negative space surrounding the small central objects. Objects occupy about the middle third of the canvas width and middle two-thirds of its height, with wide empty margins. Crisp modern 3D product illustration, sophisticated, airy and light, restrained tiny red accents, no harsh neon or black scenery. The image must work as a purely decorative optional email banner; all actual content and branding are added as HTML separately. No text, typography, letters, numbers, wordmarks, brand logo, UI screenshot, form, buttons, borders, watermark, people, dark background or large red filled area.
