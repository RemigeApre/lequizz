require("dotenv").config();
const path = require("path");
const fs = require("fs");
const https = require("https");
const express = require("express");
const session = require("express-session");

const buildQuizRouter = require("./routes/quiz");
const buildAdminRouter = require("./routes/admin");
const { createThrottle } = require("./loginThrottle");

const gateThrottle = createThrottle();

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "docs", "questions.json"), "utf8")
);

const app = express();
const port = process.env.PORT || 3000;

// Pas de "trust proxy" ici : ce deploiement expose l'app directement
// (IP:port, sans nginx devant). L'activer sans proxy reel permettrait a
// n'importe qui de falsifier son IP via un en-tete et de contourner le
// ralentissement anti-brute-force. A reactiver seulement si un reverse
// proxy (nginx, etc.) est effectivement place devant l'app.
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      // Pas de HTTPS sur ce deploiement (IP directe, pas de certificat) :
      // un cookie "secure" serait tout simplement ignore par le navigateur.
      secure: process.env.FORCE_SECURE_COOKIE === "true",
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

const certPath = process.env.TLS_CERT_PATH;
const keyPath = process.env.TLS_KEY_PATH;

if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
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
