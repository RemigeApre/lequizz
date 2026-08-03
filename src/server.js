require("dotenv").config();
const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const session = require("express-session");

const buildQuizRouter = require("./routes/quiz");
const buildAdminRouter = require("./routes/admin");
const buildLinksRouter = require("./routes/links");
const buildWikiRouter = require("./routes/wiki");
const buildGalleryRouter = require("./routes/gallery");
const buildBdRouter = require("./routes/bd");
const buildFavoritesRouter = require("./routes/favorites");
const { attachUser } = require("./auth");

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "docs", "questions.json"), "utf8")
);

const app = express();
const port = process.env.PORT || 3000;

// Source unique de verite pour savoir si le site tourne en HTTPS : le
// cookie de session doit etre "secure" si et seulement si le serveur sert
// reellement du HTTPS. Aucun flag manuel a part qui pourrait se
// desynchroniser (c'est exactement ce qui causait la boucle de connexion).
const certPath = process.env.TLS_CERT_PATH;
const keyPath = process.env.TLS_KEY_PATH;
const usingHttps = Boolean(
  certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)
);

if (certPath && keyPath && !usingHttps) {
  console.warn(
    `ATTENTION: TLS_CERT_PATH/TLS_KEY_PATH sont definis dans .env mais les fichiers sont introuvables (${certPath}, ${keyPath}) -> demarrage en HTTP. Si tu comptais servir du HTTPS, regenere les certificats (voir DEPLOY.md).`
  );
}

// Pas de "trust proxy" ici : ce deploiement expose l'app directement
// (IP:port, sans nginx devant). L'activer sans proxy reel permettrait a
// n'importe qui de falsifier son IP via un en-tete et de contourner le
// ralentissement anti-brute-force. A reactiver seulement si un reverse
// proxy (nginx, etc.) est effectivement place devant l'app.
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

// Casse le cache navigateur (surtout mobile, tres agressif) a chaque
// redemarrage du serveur : sans ca, un correctif JS/CSS deploye peut
// continuer a servir l'ancienne version depuis le cache pendant des jours.
const ASSET_VERSION = String(Date.now());
app.use((req, res, next) => {
  res.locals.assetVersion = ASSET_VERSION;
  next();
});

// Le contenu est personnel : jamais d'indexation, meme sur les pages
// publiques (wiki texte). Complete la balise <meta name="robots"> et
// public/robots.txt (ceinture et bretelles).
app.use((req, res, next) => {
  res.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  next();
});

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: usingHttps,
      maxAge: 1000 * 60 * 60 * 24 * 90,
    },
  })
);

app.use(attachUser);

// Le wiki (texte) est desormais public : plus de portail de mot de passe
// unique devant tout le site. Les images, elles, restent un contenu prive
// (wiki/galerie/BD) : jamais servies sans etre connecte a un profil.
const uploadsDir = path.join(__dirname, "..", "data", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use(
  "/uploads",
  (req, res, next) => (req.user ? next() : res.status(403).end()),
  express.static(uploadsDir)
);

app.use("/", buildQuizRouter(config));
app.use("/admin", buildAdminRouter(config));
app.use("/liens", buildLinksRouter(config));
app.use("/wiki", buildWikiRouter(config));
app.use("/galerie", buildGalleryRouter(config));
app.use("/bd", buildBdRouter(config));
app.use("/favoris", buildFavoritesRouter(config));

if (usingHttps) {
  https
    .createServer(
      {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath),
      },
      app
    )
    .listen(port, () => {
      console.log(`lequizz listening on port ${port} (HTTPS)`);
    });
} else {
  app.listen(port, () => {
    console.log(`lequizz listening on port ${port} (HTTP)`);
  });
}
