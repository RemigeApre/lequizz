const express = require("express");
const { checkCredentials, requireAdmin } = require("../auth");
const { listSubmissions, getSubmission } = require("../db");
const { createThrottle } = require("../loginThrottle");
const { slugify } = require("../scoring");

const adminThrottle = createThrottle();

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
    res.render("admin-dashboard", { config, submissions });
  });

  router.get("/:id", requireAdmin, (req, res) => {
    const submission = getSubmission(Number(req.params.id));
    if (!submission) return res.redirect("/admin");
    res.render("admin-detail", { config, submission, slugify });
  });

  return router;
}

module.exports = buildAdminRouter;
