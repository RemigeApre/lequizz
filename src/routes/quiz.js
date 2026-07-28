const crypto = require("crypto");
const express = require("express");
const { flattenItems, computeScores } = require("../scoring");
const {
  insertSubmission,
  getAttempt,
  saveAttempt,
  deleteAttempt,
} = require("../db");
const csvLog = require("../csvLog");

const COOKIE_NAME = "attempt";
const COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365;
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L, easier to type

function generateCode() {
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  }
  return code;
}

function setCodeCookie(res, code) {
  res.cookie(COOKIE_NAME, code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE,
  });
}

function ensureToken(req, res) {
  const rawRequested = typeof req.query.code === "string" ? req.query.code : "";
  const requested = rawRequested.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (requested) {
    setCodeCookie(res, requested);
    return requested;
  }

  let code = req.cookies[COOKIE_NAME];
  if (!code) {
    code = generateCode();
    setCodeCookie(res, code);
  }
  return code;
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
    const code = ensureToken(req, res);
    const attempt = getAttempt(code) || { data: {}, nextSection: 0 };
    res.redirect(`/section/${attempt.nextSection}`);
  });

  router.get("/section/:idx", (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.redirect("/");
    }

    const code = ensureToken(req, res);
    const attempt = getAttempt(code) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];
    const existing = attempt.data[section.key] || null;

    res.render("section", {
      config,
      section,
      idx,
      total: config.sections.length,
      existing,
      code,
      bookmarks: attempt.data.__bookmarks || { toTest: {}, dislike: {} },
      doneGroups: attempt.data.__doneGroups || {},
    });
  });

  router.get("/results", (req, res) => {
    const code = ensureToken(req, res);
    const attempt = getAttempt(code) || { data: {}, nextSection: 0 };
    const scores = computeScores(config, attempt.data);
    res.render("result", {
      config,
      scores,
      answers: attempt.data,
      flattenItems,
      code,
      isFinal: false,
      resumeIdx: Math.min(Math.max(attempt.nextSection, 0), config.sections.length - 1),
    });
  });

  router.post("/section/:idx", (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.redirect("/");
    }

    const code = ensureToken(req, res);
    const attempt = getAttempt(code) || { data: {}, nextSection: 0 };
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
    csvLog.append("section_save", code, section.key, idx, attempt.data[section.key]);

    const nextIdx = idx + 1;

    if (nextIdx >= config.sections.length) {
      const scores = computeScores(config, attempt.data);
      insertSubmission(attempt.data, scores);
      csvLog.append("complete", code, section.key, idx, { answers: attempt.data, scores });
      deleteAttempt(code);
      return res.render("result", { config, scores, answers: attempt.data, flattenItems, code, isFinal: true });
    }

    attempt.nextSection = Math.max(attempt.nextSection, nextIdx);
    saveAttempt(code, attempt.data, attempt.nextSection);
    res.redirect(`/section/${nextIdx}`);
  });

  return router;
}

module.exports = buildQuizRouter;
