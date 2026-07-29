const express = require("express");
const { checkCredentials, requireAdmin } = require("../auth");
const { listSubmissions, getSubmission, getAttempt, listLinks, listWikiPages } = require("../db");
const { createThrottle } = require("../loginThrottle");
const { slugify, computeScores, flattenItemsRaw } = require("../scoring");

const adminThrottle = createThrottle();
const SHARED_TOKEN = "shared";

function buildAdminRouter(config) {
  const router = express.Router();

  router.get("/login", (req, res) => {
    res.render("admin-login", { error: null });
  });

  router.post("/login", (req, res) => {
    const key = req.ip;
    const wait = adminThrottle.secondsToWait(key);
    if (wait > 0) {
      return res.render("admin-login", { error: `Trop de tentatives. Reessaie dans ${wait}s.` });
    }

    const { username, password } = req.body;
    if (checkCredentials(username, password)) {
      adminThrottle.recordSuccess(key);
      req.session.isAdmin = true;
      return res.redirect("/admin");
    }

    adminThrottle.recordFailure(key);
    res.render("admin-login", { error: "Identifiants incorrects" });
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/admin/login"));
  });

  router.get("/", requireAdmin, (req, res) => {
    const submissions = listSubmissions();
    const attempt = getAttempt(SHARED_TOKEN);
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
    const favoritesCount = attempt && attempt.data.__bookmarks
      ? Object.keys(attempt.data.__bookmarks.favorite || {}).length
      : 0;

    res.render("admin-dashboard", {
      config,
      submissions,
      attempt,
      liveScores,
      livePercentage,
      favoritesCount,
      linksCount: listLinks().length,
      wikiCount: listWikiPages().length,
    });
  });

  router.get("/live", requireAdmin, (req, res) => {
    const attempt = getAttempt(SHARED_TOKEN);
    const scores = attempt ? computeScores(config, attempt.data) : computeScores(config, {});
    const submission = {
      id: "live",
      createdAt: attempt ? attempt.updatedAt : new Date().toISOString(),
      answers: attempt ? attempt.data : {},
      scores,
    };
    res.render("admin-detail", { config, submission, slugify, flattenItemsRaw, isLive: true });
  });

  router.get("/:id", requireAdmin, (req, res) => {
    const submission = getSubmission(Number(req.params.id));
    if (!submission) return res.redirect("/admin");
    res.render("admin-detail", { config, submission, slugify, flattenItemsRaw, isLive: false });
  });

  return router;
}

module.exports = buildAdminRouter;
