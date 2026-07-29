require("dotenv").config();
const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const session = require("express-session");

const buildQuizRouter = require("./routes/quiz");
const buildAdminRouter = require("./routes/admin");
const buildLinksRouter = require("./routes/links");
const { createThrottle } = require("./loginThrottle");

const gateThrottle = createThrottle();

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

if (!process.env.SITE_PASSWORD) {
  console.warn(
    "ATTENTION: SITE_PASSWORD n'est pas defini dans .env -> /gate refusera TOUJOURS l'acces, quel que soit le mot de passe tape."
  );
}
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
app.use(express.static(path.join(__dirname, "..", "public")));

// Casse le cache navigateur (surtout mobile, tres agressif) a chaque
// redemarrage du serveur : sans ca, un correctif JS/CSS deploye peut
// continuer a servir l'ancienne version depuis le cache pendant des jours.
const ASSET_VERSION = String(Date.now());
app.use((req, res, next) => {
  res.locals.assetVersion = ASSET_VERSION;
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

app.get("/gate", (req, res) => {
  res.render("gate", { error: null });
});

app.post("/gate", (req, res) => {
  const key = req.ip;
  const wait = gateThrottle.secondsToWait(key);
  if (wait > 0) {
    return res.render("gate", { error: `Trop de tentatives. Reessaie dans ${wait}s.` });
  }

  if (process.env.SITE_PASSWORD && req.body.password === process.env.SITE_PASSWORD) {
    gateThrottle.recordSuccess(key);
    req.session.siteUnlocked = true;
    return res.redirect("/");
  }

  gateThrottle.recordFailure(key);
  res.render("gate", { error: "Mot de passe incorrect" });
});

app.use((req, res, next) => {
  if (req.path === "/gate" || req.session.siteUnlocked) return next();
  res.redirect("/gate");
});

app.use("/", buildQuizRouter(config));
app.use("/admin", buildAdminRouter(config));
app.use("/liens", buildLinksRouter(config));

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
