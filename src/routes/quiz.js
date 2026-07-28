const crypto = require("crypto");
const express = require("express");
const { flattenItems, computeScores } = require("../scoring");
const {
  insertSubmission,
  getAttempt,
  saveAttempt,
  deleteAttempt,
} = require("../db");

const COOKIE_NAME = "attempt";
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 90;

function ensureToken(req, res) {
  let token = req.cookies[COOKIE_NAME];
  if (!token) token = crypto.randomUUID();
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  });
  return token;
}

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
    for (const r of section.rankings || []) {
      const raw = body[`ranking_${r.id}`];
      rankings[r.id] = raw
        ? String(raw).split(",").map(Number)
        : r.items.map((_, i) => i);
    }

    const spectrums = {};
    for (const sp of section.spectrums || []) {
      const v = Number(body[`spectrum_${sp.id}`]);
      spectrums[sp.id] = Number.isNaN(v) ? 3 : v;
    }

    return { matrix, rankings, spectrums };
  }

  if (section.type === "profile") {
    const fields = {};
    for (const f of section.fields) {
      fields[f.id] = body[`field_${f.id}`];
    }
    const rankings = {};
    for (const r of section.rankings || []) {
      const raw = body[`ranking_${r.id}`];
      rankings[r.id] = raw
        ? String(raw).split(",").map(Number)
        : r.items.map((_, i) => i);
    }
    return { fields, rankings };
  }

  return {};
}

function buildQuizRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const token = ensureToken(req, res);
    const attempt = getAttempt(token) || { data: {}, nextSection: 0 };
    res.redirect(`/section/${attempt.nextSection}`);
  });

  router.get("/section/:idx", (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.redirect("/");
    }

    const token = ensureToken(req, res);
    const attempt = getAttempt(token) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];
    const existing = attempt.data[section.key] || null;

    res.render("section", {
      config,
      section,
      idx,
      total: config.sections.length,
      existing,
    });
  });

  router.post("/section/:idx", (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.redirect("/");
    }

    const token = ensureToken(req, res);
    const attempt = getAttempt(token) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];

    attempt.data[section.key] = parseSectionSubmission(config, section, req.body);

    const nextIdx = idx + 1;

    if (nextIdx >= config.sections.length) {
      const scores = computeScores(config, attempt.data);
      insertSubmission(attempt.data, scores);
      deleteAttempt(token);
      res.clearCookie(COOKIE_NAME);
      return res.render("result", { config, scores });
    }

    attempt.nextSection = Math.max(attempt.nextSection, nextIdx);
    saveAttempt(token, attempt.data, attempt.nextSection);
    res.redirect(`/section/${nextIdx}`);
  });

  return router;
}

module.exports = buildQuizRouter;
