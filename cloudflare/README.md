# Synchronisation des progrès — Cloudflare Worker + D1 (gratuit)

Sauvegarde en ligne du fichier de progrès de `srs.js` (une ligne par jeton dans
D1). Gratuit à cette échelle : Workers 100 000 requêtes/jour, D1 5 GB — et pas
de mise en pause du projet comme sur d'autres offres gratuites.

## Déploiement (5 minutes)

```bash
cd cloudflare
npx wrangler login                                   # votre compte Cloudflare
npx wrangler d1 create french-progress               # copiez « database_id » dans wrangler.toml
npx wrangler d1 execute french-progress --remote --file schema.sql
npx wrangler deploy                                  # notez l'URL du Worker
```

Générez ensuite un jeton secret et gardez-le privé :

```bash
python3 -c "import secrets; print(secrets.token_hex(20))"
```

Puis, sur la page **progres.html** du site : ouvrez « Synchronisation
Cloudflare », collez l'URL du Worker et le jeton, cliquez **Enregistrer**.
Les progrès sont désormais sauvegardés à chaque révision, et restaurés
automatiquement quand vous ouvrez la page sur un autre appareil.

## Notes

- Le jeton sert à la fois de clé et de mot de passe : qui le connaît peut lire
  et écrire vos progrès. Ne le partagez pas.
- Pour restreindre l'accès au site seulement, remplacez `'*'` par l'origine
  `https://qihuazhong.github.io` dans `worker.js` (en-tête CORS).
- Développement local : `npx wrangler dev` + `http://127.0.0.1:8787` comme URL.
- Vérification manuelle :

```bash
curl -H "Authorization: Bearer <jeton>" https://<worker>.workers.dev/progress
```
