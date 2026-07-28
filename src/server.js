require("dotenv").config();
const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");

const buildQuizRouter = require("./routes/quiz");
const buildAdminRouter = require("./routes/admin");

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "docs", "questions.json"), "utf8")
);

const app = express();
const port = process.env.PORT || 3000;

app.set("trust proxy", 1);
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
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 90,
    },
  })
);

app.get("/gate", (req, res) => {
  res.render("gate", { error: null });
});

app.post("/gate", (req, res) => {
  if (process.env.SITE_PASSWORD && req.body.password === process.env.SITE_PASSWORD) {
    req.session.siteUnlocked = true;
    return res.redirect("/");
  }
  res.render("gate", { error: "Mot de passe incorrect" });
});

app.use((req, res, next) => {
  if (req.path === "/gate" || req.session.siteUnlocked) return next();
  res.redirect("/gate");
});

app.use("/", buildQuizRouter(config));
app.use("/admin", buildAdminRouter(config));

app.listen(port, () => {
  console.log(`lequizz listening on port ${port}`);
});
