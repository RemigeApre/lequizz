const express = require("express");
const { flattenItems, computeScores } = require("../scoring");
const {
  insertSubmission,
  getAttempt,
  saveAttempt,
} = require("../db");
const csvLog = require("../csvLog");

// Un seul jeu de reponses partage (pas de compte, pas de code par visiteur) :
// tout le monde qui passe la barriere de mot de passe lit/ecrit la meme progression.
const SHARED_TOKEN = "shared";

function parseSectionSubmission(config, section, body) {
  if (section.type === "matrix") {
    const items = flattenItems(section);
    const matrix = {};
    items.forEach((_, i) => {
      const levels = {};
      config.levels.forEach((lvl) => {
        const v = Number(body[`m_${i}_${lvl.key}`]);
        levels[lvl.key] = Number.isNaN(v) ? 1 : v;
      });
      matrix[i] = levels;
    });

    const rankings = {};
    const rankingsChecked = {};
    for (const r of section.rankings || []) {
      const raw = body[`ranking_${r.id}`];
      rankings[r.id] = raw
        ? String(raw).split(",").map(Number)
        : r.items.map((_, i) => i);
      if (r.checkable) {
        const rawChecked = body[`ranking_${r.id}_checked`];
        rankingsChecked[r.id] = rawChecked
          ? String(rawChecked).split(",").filter(Boolean).map(Number)
          : [];
      }
    }

    const spectrums = {};
    for (const sp of section.spectrums || []) {
      const v = Number(body[`spectrum_${sp.id}`]);
      spectrums[sp.id] = Number.isNaN(v) ? 3 : v;
    }

    return { matrix, rankings, rankingsChecked, spectrums };
  }

  if (section.type === "profile") {
    const fields = {};
    for (const f of section.fields) {
      fields[f.id] = body[`field_${f.id}`];
    }
    const rankings = {};
    const rankingsChecked = {};
    for (const r of section.rankings || []) {
      const raw = body[`ranking_${r.id}`];
      rankings[r.id] = raw
        ? String(raw).split(",").map(Number)
        : r.items.map((_, i) => i);
      if (r.checkable) {
        const rawChecked = body[`ranking_${r.id}_checked`];
        rankingsChecked[r.id] = rawChecked
          ? String(rawChecked).split(",").filter(Boolean).map(Number)
          : [];
      }
    }
    return { fields, rankings, rankingsChecked };
  }

  return {};
}

function buildQuizRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    res.render("home", { config });
  });

  router.get("/section/:idx", (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.redirect("/");
    }

    const attempt = getAttempt(SHARED_TOKEN) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];
    const existing = attempt.data[section.key] || null;

    res.render("section", {
      config,
      section,
      idx,
      total: config.sections.length,
      existing,
      bookmarks: attempt.data.__bookmarks || { toTest: {}, dislike: {} },
      doneGroups: attempt.data.__doneGroups || {},
    });
  });

  router.get("/results", (req, res) => {
    const attempt = getAttempt(SHARED_TOKEN) || { data: {}, nextSection: 0 };
    const scores = computeScores(config, attempt.data);
    res.render("result", {
      config,
      scores,
      answers: attempt.data,
      flattenItems,
      isFinal: false,
      resumeIdx: Math.min(Math.max(attempt.nextSection, 0), config.sections.length - 1),
    });
  });

  router.post("/section/:idx", (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.redirect("/");
    }

    const attempt = getAttempt(SHARED_TOKEN) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];

    attempt.data[section.key] = parseSectionSubmission(config, section, req.body);

    attempt.data.__bookmarks = attempt.data.__bookmarks || { toTest: {}, dislike: {} };
    attempt.data.__doneGroups = attempt.data.__doneGroups || {};

    if (section.type === "matrix") {
      const items = flattenItems(section);
      items.forEach((_, i) => {
        const key = `${section.key}:${i}`;
        if (req.body[`test_${i}`] === "1") attempt.data.__bookmarks.toTest[key] = true;
        else delete attempt.data.__bookmarks.toTest[key];
        if (req.body[`dislike_${i}`] === "1") attempt.data.__bookmarks.dislike[key] = true;
        else delete attempt.data.__bookmarks.dislike[key];
      });
      section.groups.forEach((group, gi) => {
        const gkey = `${section.key}:${gi}`;
        if (req.body[`done_${gi}`] === "1") attempt.data.__doneGroups[gkey] = true;
        else delete attempt.data.__doneGroups[gkey];
      });
    }

    // Safety net: append every section save to a plain CSV log, independent
    // of the SQLite write below, in case that ever fails or the process dies.
    csvLog.append("section_save", SHARED_TOKEN, section.key, idx, attempt.data[section.key]);

    const nextIdx = idx + 1;
    attempt.nextSection = Math.max(attempt.nextSection, Math.min(nextIdx, config.sections.length - 1));
    saveAttempt(SHARED_TOKEN, attempt.data, attempt.nextSection);

    if (nextIdx >= config.sections.length) {
      // On garde la progression (elle reste modifiable a volonte), on
      // enregistre juste un instantane du score dans l'historique.
      const scores = computeScores(config, attempt.data);
      insertSubmission(attempt.data, scores);
      csvLog.append("complete", SHARED_TOKEN, section.key, idx, { answers: attempt.data, scores });
      return res.render("result", { config, scores, answers: attempt.data, flattenItems, isFinal: true });
    }

    res.redirect(`/section/${nextIdx}`);
  });

  return router;
}

module.exports = buildQuizRouter;
