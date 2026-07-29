const express = require("express");
const { flattenItems, flattenItemsRaw, computeScores, slugify } = require("../scoring");
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
    const rawItems = flattenItemsRaw(section);
    const matrix = {};
    rawItems.forEach((item) => {
      if (item.variants) {
        matrix[item.id] = {};
        item.variants.forEach((variantLabel) => {
          const vKey = slugify(variantLabel);
          const levels = {};
          config.levels.forEach((lvl) => {
            const v = Number(body[`m_${item.id}_${vKey}_${lvl.key}`]);
            levels[lvl.key] = Number.isNaN(v) ? 1 : v;
          });
          matrix[item.id][vKey] = levels;
        });
      } else {
        const levels = {};
        config.levels.forEach((lvl) => {
          const v = Number(body[`m_${item.id}_${lvl.key}`]);
          levels[lvl.key] = Number.isNaN(v) ? 1 : v;
        });
        matrix[item.id] = levels;
      }
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

    const multiselects = {};
    for (const ms of section.multiselects || []) {
      multiselects[ms.id] = ms.options
        .map((_, i) => i)
        .filter((i) => body[`ms_${ms.id}_${i}`] === "on" || body[`ms_${ms.id}_${i}`] === "1");
    }

    return { matrix, rankings, rankingsChecked, spectrums, multiselects };
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

function applySectionSubmission(config, attempt, section, idx, body) {
  attempt.data[section.key] = parseSectionSubmission(config, section, body);

  attempt.data.__bookmarks = Object.assign(
    { favorite: {} },
    attempt.data.__bookmarks || {}
  );
  attempt.data.__doneGroups = attempt.data.__doneGroups || {};

  if (section.type === "matrix") {
    const rawItems = flattenItemsRaw(section);
    rawItems.forEach((item) => {
      const key = `${section.key}:${item.id}`;
      if (body[`fav_${item.id}`] === "1") attempt.data.__bookmarks.favorite[key] = true;
      else delete attempt.data.__bookmarks.favorite[key];
    });
    section.groups.forEach((group) => {
      const gkey = `${section.key}:${group.id}`;
      if (body[`done_${group.id}`] === "1") attempt.data.__doneGroups[gkey] = true;
      else delete attempt.data.__doneGroups[gkey];
    });
  }

  // Filet de securite : chaque sauvegarde (soumission finale ou autosave)
  // part aussi dans un CSV en texte brut, independant de SQLite.
  csvLog.append("section_save", SHARED_TOKEN, section.key, idx, attempt.data[section.key]);
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
      slugify,
      idx,
      total: config.sections.length,
      existing,
      bookmarks: Object.assign({ favorite: {} }, attempt.data.__bookmarks || {}),
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
      flattenItemsRaw,
      slugify,
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

    applySectionSubmission(config, attempt, section, idx, req.body);

    const nextIdx = idx + 1;
    attempt.nextSection = Math.max(attempt.nextSection, Math.min(nextIdx, config.sections.length - 1));
    saveAttempt(SHARED_TOKEN, attempt.data, attempt.nextSection);

    if (nextIdx >= config.sections.length) {
      // On garde la progression (elle reste modifiable a volonte), on
      // enregistre juste un instantane du score dans l'historique.
      const scores = computeScores(config, attempt.data);
      insertSubmission(attempt.data, scores);
      csvLog.append("complete", SHARED_TOKEN, section.key, idx, { answers: attempt.data, scores });
      return res.render("result", { config, scores, answers: attempt.data, flattenItems, flattenItemsRaw, slugify, isFinal: true });
    }

    res.redirect(`/section/${nextIdx}`);
  });

  // Sauvegarde silencieuse a chaque modification (select, coche, favori...),
  // sans avancer la progression ni finaliser le quiz : evite de perdre une
  // reponse si on ferme l'onglet ou qu'on repart vers une autre section
  // sans avoir clique sur le bouton "Section suivante".
  router.post("/section/:idx/autosave", (req, res) => {
    const idx = Number(req.params.idx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= config.sections.length) {
      return res.status(400).json({ ok: false });
    }

    const attempt = getAttempt(SHARED_TOKEN) || { data: {}, nextSection: 0 };
    const section = config.sections[idx];

    applySectionSubmission(config, attempt, section, idx, req.body);
    saveAttempt(SHARED_TOKEN, attempt.data, attempt.nextSection);

    res.json({ ok: true });
  });

  return router;
}

module.exports = buildQuizRouter;
