const express = require("express");
const {
  listSubmissions,
  getSubmission,
  getAttempt,
  listLinks,
  listWikiPages,
  setWikiPageFeatured,
  getWikiPage,
  listUsers,
  getUserByUsername,
  createUser,
  updateUserPassword,
  countFavorites,
} = require("../db");
const { verifyLogin, requireAdmin, tokenForUser } = require("../auth");
const { hashPassword } = require("../passwords");
const { createThrottle } = require("../loginThrottle");
const { slugify, computeScores, flattenItemsRaw } = require("../scoring");

const loginThrottle = createThrottle();

// Redirection sure apres connexion : n'accepte qu'un chemin relatif de
// l'appli elle-meme, jamais une URL absolue ni "//hote" (open redirect).
function safeNext(next) {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function buildAdminRouter(config) {
  const router = express.Router();

  router.get("/login", (req, res) => {
    res.render("admin-login", { error: null, users: listUsers(), next: safeNext(req.query.next) || "" });
  });

  router.post("/login", (req, res) => {
    const key = req.ip;
    const wait = loginThrottle.secondsToWait(key);
    const next = safeNext(req.body.next);
    if (wait > 0) {
      return res.render("admin-login", { error: `Trop de tentatives. Reessaie dans ${wait}s.`, users: listUsers(), next: next || "" });
    }

    const user = verifyLogin(req.body.username, req.body.password);
    if (user) {
      loginThrottle.recordSuccess(key);
      req.session.userId = user.id;
      return res.redirect(next || (user.isAdmin ? "/admin" : "/favoris"));
    }

    loginThrottle.recordFailure(key);
    res.render("admin-login", { error: "Identifiants incorrects", users: listUsers(), next: next || "" });
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
  });

  router.get("/", requireAdmin, (req, res) => {
    const users = listUsers();
    const userStates = users.map((u) => {
      const attempt = getAttempt(tokenForUser(u));
      const liveScores = attempt ? computeScores(config, attempt.data) : null;
      let liveRaw = 0;
      let liveMax = 0;
      if (liveScores) {
        for (const key of Object.keys(liveScores.sections)) {
          const s = liveScores.sections[key];
          if (s.type === "matrix") {
            liveRaw += s.raw;
            liveMax += s.max;
          }
        }
      }
      const livePercentage = liveMax ? Math.round((liveRaw / liveMax) * 1000) / 10 : 0;
      return { user: u, attempt, liveScores, livePercentage };
    });

    const submissions = listSubmissions();

    const wikiPages = listWikiPages().sort((a, b) => b.views - a.views);
    const allWikiPagesSorted = listWikiPages().sort((a, b) =>
      a.title.localeCompare(b.title, "fr", { sensitivity: "base" })
    );
    res.render("admin-dashboard", {
      config,
      userStates,
      submissions,
      favoritesCount: countFavorites(),
      linksCount: listLinks().length,
      wikiPages,
      allWikiPagesSorted,
    });
  });

  router.get("/live/:userId", requireAdmin, (req, res) => {
    const user = listUsers().find((u) => u.id === Number(req.params.userId));
    if (!user) return res.redirect("/admin");
    const attempt = getAttempt(tokenForUser(user));
    const scores = attempt ? computeScores(config, attempt.data) : computeScores(config, {});
    const submission = {
      id: "live",
      createdAt: attempt ? attempt.updatedAt : new Date().toISOString(),
      answers: attempt ? attempt.data : {},
      scores,
    };
    res.render("admin-detail", { config, submission, slugify, flattenItemsRaw, isLive: true, liveUser: user });
  });

  router.post("/wiki-featured/:id", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const page = getWikiPage(id);
    if (!page) return res.status(404).json({ ok: false });
    const newVal = !page.featured;
    setWikiPageFeatured(id, newVal);
    res.json({ ok: true, featured: newVal });
  });

  // ── Gestion des profils ──────────────────────────────
  router.get("/profils", requireAdmin, (req, res) => {
    res.render("admin-profiles", { config, users: listUsers(), error: null });
  });

  router.post("/profils", requireAdmin, (req, res) => {
    const username = String(req.body.username || "").trim().toLowerCase();
    const displayName = String(req.body.display_name || "").trim();
    const password = String(req.body.password || "");
    const isAdmin = req.body.is_admin === "on";

    if (!username || !displayName || !password) {
      return res.render("admin-profiles", { config, users: listUsers(), error: "Tous les champs sont obligatoires." });
    }
    if (getUserByUsername(username)) {
      return res.render("admin-profiles", { config, users: listUsers(), error: "Ce nom d'utilisateur existe deja." });
    }

    createUser({ username, displayName, passwordHash: hashPassword(password), isAdmin });
    res.redirect("/admin/profils");
  });

  router.post("/profils/:id/password", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const password = String(req.body.password || "");
    if (!password) {
      return res.render("admin-profiles", { config, users: listUsers(), error: "Le nouveau mot de passe ne peut pas etre vide." });
    }
    updateUserPassword(id, hashPassword(password));
    res.redirect("/admin/profils");
  });

  router.get("/:id", requireAdmin, (req, res) => {
    const submission = getSubmission(Number(req.params.id));
    if (!submission) return res.redirect("/admin");
    res.render("admin-detail", { config, submission, slugify, flattenItemsRaw, isLive: false });
  });

  return router;
}

module.exports = buildAdminRouter;
