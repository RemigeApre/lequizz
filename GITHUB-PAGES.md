# Deployer lequizz sur GitHub Pages (sans VPS)

## Ce qui a change par rapport a la version serveur

Le site est maintenant **100% statique** : tout tourne dans le navigateur
(HTML/CSS/JS), il n'y a plus de serveur Node, plus de base de donnees,
plus de compte admin. Consequences concretes :

- La progression dans le quiz est sauvegardee dans le navigateur de la
  personne qui repond (`localStorage`), pas sur un serveur. Si elle change
  d'appareil ou vide son cache, elle repart de zero.
- Chaque personne voit son resultat instantanement, calcule dans son
  propre navigateur. Il n'y a plus de tableau de bord ou tu vois les
  reponses de tout le monde — c'est une limite technique du "tout GitHub",
  pas un choix arbitraire : une page statique ne peut recevoir et stocker
  aucune donnee venant d'un visiteur.
- Un petit "historique" local existe quand meme : si **la meme personne**
  refait le quiz plusieurs fois **sur le meme navigateur**, elle voit ses
  tentatives precedentes sur l'ecran de resultat. Ca ne centralise rien
  chez toi, ca reste range chez chaque visiteur.

## Avertissement important : le site sera public

GitHub Pages publie toujours le site a une URL accessible par n'importe
qui, **meme si le depot GitHub est prive**. Il n'existe pas de mot de
passe possible sur un site statique gratuit (une protection en JavaScript
ne serait qu'une facade : n'importe qui peut ouvrir le code source et
lire le mot de passe ou contourner le controle).

Ce que j'ai mis en place pour limiter au maximum la decouverte :
- `robots.txt` qui interdit l'indexation par les moteurs de recherche.
- Balise `noindex` sur les deux pages.
- L'URL ne sera annoncee nulle part publiquement (ni le nom du depot, ni
  un lien visible ailleurs) : seul quelqu'un a qui tu donnes le lien direct
  peut y arriver.

Ca reste de la securite par obscurite, pas une vraie protection. Si
quelqu'un met la main sur le lien exact, il accede au quiz. Si ce niveau
de risque ne te convient pas pour un contenu aussi sensible, il faudra
revenir a une solution avec un vrai serveur (le VPS, cf. `DEPLOY.md`, qui
reste utilisable si tu changes d'avis).

---

## Etape 1 — Rendre le depot prive (si ce n'est pas deja fait)

`https://github.com/RemigeApre/lequizz` -> **Settings** -> tout en bas,
**Danger Zone** -> **Change visibility** -> **Make private**.

## Etape 2 — Pousser le code

Depuis Fedora, a la racine du projet :

```bash
git add -A
git commit -m "Version statique GitHub Pages du quiz"
git push origin main
```

## Etape 3 — Activer GitHub Pages

1. Sur la page du depot, **Settings** -> **Pages** (menu de gauche).
2. Sous **Build and deployment**, **Source** : `Deploy from a branch`.
3. **Branch** : `main`, dossier `/docs`. Sauvegarde.
4. GitHub affiche l'URL du site apres quelques dizaines de secondes
   (quelque chose comme `https://remigeapre.github.io/lequizz/`).

A chaque `git push` sur `main` avec des changements dans `docs/`, le site
se republie automatiquement en 1 a 2 minutes. Plus jamais besoin de SSH.

## Etape 4 — Verifier

- Ouvre l'URL donnee par GitHub : le quiz doit s'afficher (section I).
- Remplis une section, recharge la page : la progression doit etre
  conservee (localStorage).
- Termine le quiz : le resultat doit s'afficher avec les barres par
  section.

---

## Modifier les questions (ajouter / editer / supprimer)

Deux facons, au choix :

### Option A — L'editeur visuel (`docs/editor.html`)

Ouvre `https://TON-URL-GITHUB-PAGES/editor.html`. Cette page :
1. Charge le `questions.json` actuel du site (bouton "Charger le
   questions.json du site"), ou tu peux lui donner un fichier local.
2. Te laisse choisir une section dans le menu deroulant, puis ajouter,
   modifier (tape directement dans les champs) ou supprimer des items,
   des groupes, ou des classements.
3. Bouton **Telecharger questions.json** en bas : ca te donne le fichier
   mis a jour.

Ensuite, sur GitHub :
1. Va dans `docs/questions.json` sur `github.com`.
2. Clique l'icone crayon (Edit), ou utilise "Upload files" en glissant le
   fichier telecharge pour remplacer l'ancien.
3. Commit direct sur `main`. Le site se republie tout seul.

### Option B — Editer le JSON directement sur GitHub

Pour des petites retouches (renommer un item, corriger une faute), pas
besoin de l'editeur : ouvre `docs/questions.json` sur `github.com`, clique
le crayon, modifie le texte, commit. C'est juste un fichier JSON classique
(voir la structure expliquee dans le README).

---

## Recuperer/consulter les reponses de quelqu'un d'autre

Comme rien n'est centralise, si tu veux quand meme voir le resultat de
quelqu'un d'autre, le plus simple est de lui demander une capture d'ecran
de son ecran de resultat, ou de lui faire copier les pourcentages affiches.
Ce n'est pas automatise — c'est la contrepartie du "tout statique".
