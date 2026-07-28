# lequizz

Quiz minimaliste, multi-etapes, base sur le contenu de `sujets des questions.md`.
Chaque grande section (Fondamentaux, Corps, Objets, Fetichismes, Jeux de role,
BDSM, Autre hard) est remplie l'une apres l'autre.

Il existe **deux versions independantes** dans ce depot :

- `docs/` — version **statique** (GitHub Pages), sans serveur : progression
  et resultat geres uniquement dans le navigateur (localStorage), pas de
  compte admin ni de collecte centralisee. Voir `GITHUB-PAGES.md`.
- `src/` + `views/` + `public/` — version **serveur** (Express + SQLite),
  avec progression sauvegardee cote serveur, compte admin, et consultation
  centralisee des reponses. Voir `DEPLOY.md` (deploiement VPS).

Les deux versions partagent la meme source de contenu :
`docs/questions.json`.

## Structure

- `docs/questions.json` — genere depuis `sujets des questions.md` (voir
  `sections`, `scaleLabels`, `levels`). Source unique utilisee par les deux
  versions. Editable a la main, ou via `docs/editor.html`.
- `docs/index.html`, `docs/app.js`, `docs/scoring.js`, `docs/quiz.js` —
  version statique GitHub Pages (voir `GITHUB-PAGES.md`).
- `docs/editor.html` — editeur visuel pour ajouter/modifier/supprimer des
  questions sans toucher au JSON a la main.
- `src/` — serveur Express (assistant multi-etapes, scoring, SQLite).
- `views/` — templates EJS (`section.ejs` gere l'affichage matrix/profile).
- `public/` — CSS + JS client de la version serveur.
- `data/` — base SQLite (`quizz.db`), creee automatiquement (version serveur).

## Modele de donnees

Chaque section a un `type` :

- `matrix` : une liste de pratiques (regroupees en `groups`), chacune notee
  sur les 5 niveaux `a` a `e` (`config.levels`) avec l'echelle de frequence
  `config.scaleLabels` (Jamais -> Enormement). Le score de la section est le
  pourcentage du maximum theorique. Peut aussi contenir des `rankings`
  (classements en glisser-deposer) affiches mais non notes.
- `profile` : des questions de preference directe (`fields`, type `choice`)
  et/ou des `rankings`, non convertis en pourcentage — juste affiches tels
  quels dans le resultat et le detail admin.

La progression d'un repondant est stockee dans la table SQLite `attempts`
(cle = token du cookie `attempt`), fusionnee section par section. A la
derniere section, le resultat final est calcule et enregistre dans
`submissions`, puis l'attempt est supprime.

## Lancer en local

```bash
npm install
cp .env.example .env
npm run hash-password -- "mon-mot-de-passe"   # copier le hash dans .env (ADMIN_PASSWORD_HASH)
npm start
```

Le quiz est sur `http://localhost:3000`, l'admin sur `http://localhost:3000/admin/login`.

## Deploiement

- Sans serveur, via GitHub Pages : voir `GITHUB-PAGES.md`.
- Avec serveur, sur un VPS (Docker + nginx + HTTPS) : voir `DEPLOY.md`.

## Modifier le contenu

Editer `docs/questions.json` directement, ou via `docs/editor.html`
(ajout/edition/suppression d'items, groupes et classements sans toucher
au JSON a la main).
