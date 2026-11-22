# Synchroniser la progression avec Supabase

La synchronisation est **optionnelle**. Sans elle, l'application marche exactement comme avant : la progression reste sur l'appareil. Avec elle, on se connecte (Google ou lien par e-mail) et la progression est fusionnée entre le PC et le téléphone.

Comptes nécessaires : Supabase (gratuit), et Google Cloud seulement si tu veux le bouton « Continuer avec Google ».

## Quelles clés, et où ?

| Élément | Secret ? | Où il va |
|---|---|---|
| Adresse du projet (`https://….supabase.co`) | non | `.env.local` (ton PC) et secret GitHub `SUPABASE_URL` |
| Clé **publique** (`anon` ou `sb_publishable_…`) | non, conçue pour être publique | `.env.local` et secret GitHub `SUPABASE_ANON_KEY` |
| Clé `service_role` / `sb_secret_…` | **oui** | nulle part : l'application n'en a pas besoin |
| Mot de passe de la base | **oui** | ton gestionnaire de mots de passe |
| Secret client Google | **oui** | uniquement dans le tableau de bord Supabase |

Aucune clé n'est écrite dans le code ni dans le dépôt : `.env.local` est ignoré par Git, et la publication lit les secrets GitHub. La clé publique se retrouve forcément dans l'application publiée (le navigateur en a besoin) : c'est prévu ainsi, la sécurité repose sur les règles de la table (chacun ne peut lire et écrire que sa propre ligne).

## 1. Créer le projet Supabase

1. Va sur https://supabase.com et crée un compte (« Start your project », connexion avec GitHub possible).
2. **New project** :
   - *Name* : `logique` ;
   - *Database Password* : clique sur « Generate a password » et garde-le dans ton gestionnaire de mots de passe (l'application ne s'en sert pas) ;
   - *Region* : une région européenne (Paris ou Francfort) ;
   - offre **Free**.
3. Attends une à deux minutes que le projet soit prêt.

## 2. Créer la table

1. Menu de gauche : **SQL Editor** > **New query**.
2. Colle tout le contenu du fichier [`supabase/schema.sql`](../supabase/schema.sql) et clique sur **Run**.
3. Le message « Success. No rows returned » est normal. Dans **Table Editor**, une table `progress` apparaît, avec la mention RLS activée.

## 3. Autoriser les adresses de l'application

**Authentication** > **URL Configuration** :

- *Site URL* : `https://raviolisaucepiquante.github.io/Logique/`
- *Redirect URLs* > **Add URL**, une par une :
  - `https://raviolisaucepiquante.github.io/Logique/**`
  - `http://localhost:5180/**` (développement sur ton PC)
  - `http://localhost:4180/**` (version construite testée sur ton PC)

Sans cette étape, Supabase refuse de renvoyer vers l'application après la connexion.

## 4. Connexion par e-mail (déjà active)

**Authentication** > **Sign In / Providers** > **Email** est activé par défaut. L'application envoie un **lien de connexion** (pas de mot de passe à retenir).

À savoir : l'envoi d'e-mails intégré à l'offre gratuite est limité à quelques messages par heure. Pour un usage personnel cela suffit ; sinon, Google évite cette limite.

Le lien doit être ouvert **sur l'appareil qui l'a demandé** (sécurité du lien). Pour le téléphone, demande le lien depuis le téléphone.

## 5. Connexion avec Google (facultatif)

1. Dans Supabase : **Authentication** > **Sign In / Providers** > **Google**. Note l'adresse affichée sous *Callback URL (for OAuth)* : `https://<ton-projet>.supabase.co/auth/v1/callback`.
2. Va sur https://console.cloud.google.com, crée un projet (par exemple « Logique »).
3. **APIs & Services** > **OAuth consent screen** (ou « Google Auth Platform ») :
   - type **External** ;
   - nom de l'application : `Logique`, ton e-mail comme contact ;
   - pas besoin de champs d'accès supplémentaires (e-mail et profil suffisent).
4. **Credentials** > **Create credentials** > **OAuth client ID** :
   - type **Web application** ;
   - *Authorized JavaScript origins* : `https://raviolisaucepiquante.github.io` ;
   - *Authorized redirect URIs* : l'adresse *Callback URL* notée à l'étape 1.
5. Google affiche un **Client ID** et un **Client secret**. Colle-les dans Supabase (page Google de l'étape 1), active **Enable Sign in with Google**, puis **Save**.

Tant que l'écran de consentement est en mode « Testing », ajoute ton adresse Gmail dans *Test users*, ou publie l'application (bouton « Publish app ») : pour les seules informations e-mail et profil, Google ne demande pas de vérification.

## 6. Récupérer l'adresse et la clé publique

**Project Settings** (roue dentée) > **API Keys** (ou le bouton **Connect** en haut) :

- *Project URL* : `https://xxxxxxxxxxxx.supabase.co` (si tu copies l'adresse de l'API, `…supabase.co/rest/v1/`, l'application la corrige d'elle-même) ;
- la clé **publishable** (`sb_publishable_…`) ou, onglet « Legacy », la clé **anon** (`eyJ…`). Les deux fonctionnent.

Ne copie pas la clé `service_role` / `secret`.

## 7. Configurer ton PC

Dans le dossier du projet, copie `.env.example` en `.env.local` et remplis :

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxx
```

Puis `npm run dev` : dans **Réglages**, le panneau « Compte et synchronisation » propose la connexion.

## 8. Configurer la version publiée (GitHub Pages)

Sur GitHub : dépôt **Logique** > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**, deux fois :

- `SUPABASE_URL` : l'adresse du projet ;
- `SUPABASE_ANON_KEY` : la clé publique.

Relance ensuite la publication : onglet **Actions** > « Publier sur GitHub Pages » > **Run workflow**. La version en ligne propose alors la connexion.

## Comment la synchronisation fonctionne

- La progression est **toujours** enregistrée d'abord sur l'appareil : l'application marche hors ligne.
- Connecté, chaque modification est envoyée quelques secondes après ; sans réseau, elle part dès que le réseau revient (ou quand on rouvre l'application). Un petit nuage dans l'en-tête indique l'état.
- À chaque synchronisation, la sauvegarde en ligne et celle de l'appareil sont **fusionnées** :
  - meilleur résultat par exercice, leçon et chapitre ;
  - XP de chaque appareil additionnés (sans compter deux fois ceux déjà synchronisés) ;
  - jours d'activité réunis, donc la série la plus longue est conservée.
- Les réglages (cœurs, tout débloquer) restent propres à chaque appareil.
- Se déconnecter laisse la progression sur l'appareil.
- **Réglages > Sauvegarde dans un fichier** : export et import manuels (l'import fusionne aussi, il n'efface rien).
