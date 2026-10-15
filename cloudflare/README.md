# Synchronisation des progrès — Compte Google + Cloudflare Worker + D1 (gratuit)

Sauvegarde en ligne du fichier de progrès de `srs.js`, **lié à votre compte
Google** (une ligne par compte dans D1, clé = identifiant Google `sub`).
Connecté sur plusieurs appareils, les progrès se retrouvent partout.

Aucun secret n'est stocké : le navigateur obtient un jeton d'identité Google
(« Sign in with Google »), et le Worker vérifie sa signature auprès des clés
publiques de Google. Seul le Client ID (public) est nécessaire.

## 1. Créer le Client ID Google (une fois, gratuit)

1. [Google Cloud Console](https://console.cloud.google.com/) → créez un projet
   (ex. « french-lessons »).
2. **APIs & Services → OAuth consent screen** : type *External* ; en mode
   *Testing*, ajoutez votre adresse Google dans « Test users ». Aucune API
   supplémentaire n'est requise.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID** :
   type **Web application** ; *Authorized JavaScript origins* :
   - `https://qihuazhong.github.io`
   - `http://localhost:8000` (pour tester en local, optionnel)
4. Copiez le **Client ID** et collez-le dans `config.js` à la racine du dépôt :

```js
window.FR_CONFIG = {
  workerUrl: '',            // rempli à l'étape 3
  googleClientId: 'xxxx.apps.googleusercontent.com'
};
```

Le Client ID est public : le committer est normal. (Le mode *Testing* expire
les jetons toutes les ~1 h ; c'est le fonctionnement attendu — la page propose
alors de se reconnecter en un clic.)

## 2. Déployer le Worker

```bash
cd cloudflare
npx wrangler login                                   # votre compte Cloudflare
npx wrangler d1 create french-progress               # copiez « database_id » dans wrangler.toml
npx wrangler d1 execute french-progress --remote --file schema.sql
npx wrangler deploy                                  # notez l'URL du Worker
```

Collez aussi le Client ID dans `wrangler.toml` (`[vars] GOOGLE_CLIENT_ID`)
puis re-déployez. Enfin, mettez l'URL du Worker dans `config.js`
(`workerUrl`) et committez.

## 3. Utiliser

Sur **progres.html** → carte *Sauvegarde* → « Synchronisation multi-appareils —
Compte Google » → **Se connecter avec Google**. Faites de même sur chaque
appareil. Les progrès se synchronisent à chaque révision (et au retour sur
l'onglet).

## Notes

- Chaque compte Google ne voit que sa propre ligne (`user_id = sub`) ; le
  Worker rejette tout jeton non signé par Google pour votre Client ID.
- `schema.sql` recrée la table : si vous utilisiez l'ancienne version par jeton
  secret, exportez d'abord vos progrès en JSON (page *Sauvegarde*) puis
  réimportez-les après connexion.
- « Réinitialiser » se propage aux autres appareils (marque `wipedAt`).
- Développement local : `npx wrangler dev` ; ajoutez `http://localhost:8000`
  aux origines autorisées du Client ID.

```bash
# vérification manuelle (jeton visible dans le navigateur :
# localStorage « fr-lessons-session », champ idToken)
curl -H "Authorization: Bearer <idToken>" https://<worker>.workers.dev/progress
```
