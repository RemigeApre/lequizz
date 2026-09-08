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
const { db } = require("./db");

// Store de sessions SQLite : survit aux redemarrages contrairement au
// memory store par defaut. Implémenté directement avec better-sqlite3
// sans dépendance supplémentaire.
class SqliteSessionStore extends session.Store {
  constructor(database) {
    super();
    this._db = database;
    this._db.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid  TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      exp  INTEGER NOT NULL
    )`);
    // Nettoyage des sessions expirées toutes les heures
    setInterval(() => {
      this._db.prepare("DELETE FROM sessions WHERE exp < ?").run(Date.now());
    }, 60 * 60 * 1000).unref();
  }
  get(sid, cb) {
    const row = this._db.prepare("SELECT sess, exp FROM sessions WHERE sid = ?").get(sid);
    if (!row || row.exp < Date.now()) return cb(null, null);
    try { cb(null, JSON.parse(row.sess)); } catch { cb(null, null); }
  }
  set(sid, sess, cb) {
    const exp = sess.cookie && sess.cookie.expires
      ? new Date(sess.cookie.expires).getTime()
      : Date.now() + 1000 * 60 * 60 * 24 * 90;
    this._db.prepare(
      "INSERT OR REPLACE INTO sessions (sid, sess, exp) VALUES (?, ?, ?)"
    ).run(sid, JSON.stringify(sess), exp);
    if (cb) cb(null);
  }
  destroy(sid, cb) {
    this._db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
    if (cb) cb(null);
  }
  touch(sid, sess, cb) { this.set(sid, sess, cb); }
}

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
    store: new SqliteSessionStore(db),
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

// Expose le chemin courant pour que le lien "Se connecter" dans la nav
// puisse y revenir après connexion (paramètre ?next=).
// Expose aussi les catégories wiki pour le menu déroulant desktop.
app.use((req, res, next) => {
  res.locals.currentPath = req.originalUrl;
  res.locals.wikiCategories = buildWikiRouter.CATEGORIES || [];
  next();
});

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

// ── Recherche globale multi-section ─────────────────────────────────────────
app.get("/api/search", function (req, res) {
  var q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json({ results: {} });
  var ql = q.toLowerCase();
  var pat = "%" + ql + "%";
  var results = {};

  // Wiki — public (texte accessible sans connexion)
  try {
    var wikiRows = db
      .prepare(
        "SELECT id, title FROM wiki_pages WHERE lower(title) LIKE ? OR lower(content) LIKE ? OR lower(tags) LIKE ? OR lower(meta) LIKE ? LIMIT 6"
      )
      .all(pat, pat, pat, pat);
    if (wikiRows.length)
      results.wiki = wikiRows.map(function (r) {
        return { title: r.title, url: "/wiki/" + r.id };
      });
  } catch (_) {}

  // Contenus privés — connexion requise
  if (req.user) {
    try {
      var galRows = db
        .prepare(
          "SELECT id, title FROM gallery_images WHERE lower(title) LIKE ? OR lower(notes) LIKE ? OR lower(tags) LIKE ? LIMIT 5"
        )
        .all(pat, pat, pat);
      if (galRows.length)
        results.galerie = galRows.map(function (r) {
          return { title: r.title || "Image #" + r.id, url: "/galerie" };
        });
    } catch (_) {}

    try {
      var bdRows = db
        .prepare(
          "SELECT id, title FROM bd_books WHERE lower(title) LIKE ? OR lower(description) LIKE ? OR lower(tags) LIKE ? LIMIT 5"
        )
        .all(pat, pat, pat);
      if (bdRows.length)
        results.bd = bdRows.map(function (r) {
          return { title: r.title, url: "/bd" };
        });
    } catch (_) {}

    try {
      var linkRows = db
        .prepare(
          "SELECT id, title FROM links WHERE lower(title) LIKE ? OR lower(description) LIKE ? LIMIT 5"
        )
        .all(pat, pat);
      if (linkRows.length)
        results.liens = linkRows.map(function (r) {
          return { title: r.title, url: "/liens" };
        });
    } catch (_) {}

    try {
      var quizzResults = [];
      (config.sections || []).forEach(function (s, si) {
        (s.questions || []).forEach(function (qq) {
          if (quizzResults.length >= 5) return;
          if ((qq.question || "").toLowerCase().indexOf(ql) !== -1)
            quizzResults.push({ title: qq.question, url: "/section/" + si });
        });
      });
      if (quizzResults.length) results.quizz = quizzResults;
    } catch (_) {}
  }

  res.json({ results: results });
});

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
