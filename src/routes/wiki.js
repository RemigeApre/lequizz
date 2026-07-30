const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const {
  insertWikiPage,
  listWikiPages,
  getWikiPage,
  updateWikiPage,
  reactWikiPage,
  deleteWikiPage,
  incrementWikiViews,
  getWikiQuestionLinks,
  addWikiQuestionLink,
  removeWikiQuestionLink,
  getImageLinks,
  addImageLink,
  removeImageLink,
} = require("../db");

const CATEGORIES = [
  { key: "fantasmes",  label: "Fantasmes",   desc: "Sc\u00e9narios, d\u00e9sirs...",          hue: 330 },
  { key: "partenaires",label: "Partenaires", desc: "Configurations, r\u00f4les...",       hue: 210 },
  { key: "position",   label: "Position",    desc: "Kama-sutra, variantes...",        hue: 270 },
  { key: "lieux",      label: "Lieux",       desc: "Endroits, contextes...",          hue: 140 },
  { key: "objets",     label: "Objets",      desc: "Sex-toys, accessoires...",        hue:  28 },
  { key: "tenues",     label: "Tenues",      desc: "Lingerie, costumes...",           hue: 175 },
  { key: "autre",      label: "Autre",       desc: "Tout le reste",                  hue: 220 },
];

const FANTASMES_SUBCATS = [
  { key: "jeux_role",  label: "Jeux de r\u00f4le et comportement" },
  { key: "hardcore",   label: "Hardcore" },
  { key: "bdsm",       label: "BDSM" },
  { key: "classique",  label: "Classique" },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
const OWNED_CATEGORIES = ["objets", "tenues"];

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "wiki");
fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename(req, file, cb) {
      const ext = ALLOWED_EXT[file.mimetype] || "";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, Object.prototype.hasOwnProperty.call(ALLOWED_EXT, file.mimetype));
  },
});

function parseTags(raw) {
  return String(raw || "")
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeCategory(value) {
  return CATEGORY_KEYS.includes(value) ? value : "autre";
}

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

function parseMeta(category, body) {
  if (category === "position") {
    return {
      qui_dessus:  String(body.meta_qui_dessus || ""),
      canal:       arr(body.meta_canal),
      orientation: arr(body.meta_orientation),
    };
  }
  if (category === "fantasmes") {
    const sub = body.meta_sous_cat;
    const validSubs = FANTASMES_SUBCATS.map((s) => s.key);
    return {
      sous_cat: validSubs.includes(sub) ? sub : "",
    };
  }
  if (category === "partenaires") {
    const nb = (v) => ["0","1","2","3","nombreux"].includes(String(v)) ? String(v) : "";
    return {
      nb_femmes: nb(body.meta_nb_femmes),
      nb_hommes: nb(body.meta_nb_hommes),
    };
  }
  if (category === "lieux") {
    const t = body.meta_type_lieu;
    return {
      type_lieu: ["prive","public","cache"].includes(t) ? t : "",
    };
  }
  if (category === "objets") {
    const t = body.meta_type_gode;
    return {
      type_gode: ["animal","monstre","fantaisiste","ethnique","autre"].includes(t) ? t : "",
    };
  }
  return {};
}

function getAllTags(pages) {
  return Array.from(new Set(pages.flatMap((p) => p.tags))).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
}

// Liste plate de toutes les questions du quiz (construite une seule fois)
function buildQuestionIndex(config) {
  const list = [];
  (config.sections || []).forEach((s) => {
    const add = (id, text) => list.push({ section_key: s.key, section_title: s.title, question_id: id, question_text: text });
    if (s.groups) s.groups.forEach((g) => g.items.forEach((it) => add(it.id, it.text)));
    if (s.fields) s.fields.forEach((f) => add(f.id, f.label));
    if (s.spectrums) s.spectrums.forEach((f) => add("spectrum:" + f.id, f.label));
    if (s.rankings) s.rankings.forEach((f) => add("ranking:" + f.id, f.label));
    if (s.multiselects) s.multiselects.forEach((f) => add("multiselect:" + f.id, f.label));
  });
  return list;
}

function buildWikiRouter(config) {
  const router = express.Router();
  const ALL_QUESTIONS = buildQuestionIndex(config);

  const CTX = { categories: CATEGORIES, fantasmesSubs: FANTASMES_SUBCATS };

  router.get("/", (req, res) => {
    const pages = listWikiPages();
    res.render("wiki", { config, pages, allTags: getAllTags(pages), ...CTX });
  });

  router.post("/", upload.array("images", 10), (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.redirect("/wiki");

    const category   = normalizeCategory(req.body.category);
    const content    = String(req.body.content || "").trim();
    const tags       = parseTags(req.body.tags);
    const owned      = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";
    const meta       = parseMeta(category, req.body);
    const imagePaths = (req.files || []).map((f) => `/uploads/wiki/${f.filename}`);

    insertWikiPage({ title, category, content, tags, imagePaths, owned, meta });
    res.redirect("/wiki");
  });

  // ── Associations image ─────────────────────────────
  router.get("/image-links", (req, res) => {
    const src = req.query.src;
    if (!src) return res.json([]);
    res.json(getImageLinks(src));
  });

  router.post("/image-links", (req, res) => {
    const { src, page_id } = req.body;
    if (!src || !page_id) return res.status(400).json({ ok: false });
    addImageLink(src, Number(page_id));
    res.json({ ok: true });
  });

  router.delete("/image-links", (req, res) => {
    const { src, page_id } = req.body;
    if (!src || !page_id) return res.status(400).json({ ok: false });
    removeImageLink(src, Number(page_id));
    res.json({ ok: true });
  });

  // ── Recherche de questions du quiz ─────────────────
  router.get("/question-search", (req, res) => {
    const q = String(req.query.q || "").toLowerCase().trim();
    const results = q
      ? ALL_QUESTIONS.filter((x) => x.question_text.toLowerCase().includes(q) || x.section_title.toLowerCase().includes(q)).slice(0, 15)
      : ALL_QUESTIONS.slice(0, 15);
    res.json(results);
  });

  // ── Recherche de pages (pour associer) ─────────────
  router.get("/search", (req, res) => {
    const q = String(req.query.q || "").toLowerCase().trim();
    const pages = listWikiPages();
    const results = q
      ? pages.filter((p) => p.title.toLowerCase().includes(q)).slice(0, 12)
      : pages.slice(0, 12);
    res.json(results.map((p) => ({ id: p.id, title: p.title, category: p.category })));
  });

  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    incrementWikiViews(id);
    res.render("wiki-detail", { config, page, ...CTX });
  });

  router.get("/:id/edit", (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    const allTags = getAllTags(listWikiPages());
    res.render("wiki-form", { config, page, allTags, ...CTX });
  });

  router.post("/:id", upload.array("images", 10), (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!existing) return res.redirect("/wiki");

    const title    = String(req.body.title || "").trim() || existing.title;
    const category = normalizeCategory(req.body.category);
    const content  = String(req.body.content || "").trim();
    const tags     = parseTags(req.body.tags);
    const owned    = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";
    const meta     = parseMeta(category, req.body);

    // Images : on part des existantes, on retire celles cochées, on ajoute les nouvelles
    const toRemove  = [].concat(req.body.remove_image || []);
    const kept      = existing.imagePaths.filter((p) => !toRemove.includes(p));
    const added     = (req.files || []).map((f) => `/uploads/wiki/${f.filename}`);
    const imagePaths = [...kept, ...added];

    updateWikiPage(id, { title, category, content, tags, imagePaths, owned, meta });
    res.redirect(`/wiki/${id}`);
  });

  // ── Associations questions ──────────────────────────
  router.get("/:id/question-links", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json([]);
    const links = getWikiQuestionLinks(id);
    const enriched = links.map((l) => {
      const found = ALL_QUESTIONS.find((x) => x.section_key === l.section_key && x.question_id === l.question_id);
      return {
        section_key:    l.section_key,
        section_title:  found ? found.section_title  : l.section_key,
        question_id:    l.question_id,
        question_text:  found ? found.question_text  : l.question_id,
      };
    });
    res.json(enriched);
  });

  router.post("/:id/question-links", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { section_key, question_id } = req.body;
    if (!section_key || !question_id) return res.status(400).json({ ok: false });
    addWikiQuestionLink(id, section_key, question_id);
    res.json({ ok: true });
  });

  router.delete("/:id/question-links", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { section_key, question_id } = req.body;
    if (!section_key || !question_id) return res.status(400).json({ ok: false });
    removeWikiQuestionLink(id, section_key, question_id);
    res.json({ ok: true });
  });

  router.post("/:id/react", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { rating, flame, interested } = req.body;
    reactWikiPage(id, { rating, flame, interested });
    res.json({ ok: true });
  });

  router.post("/:id/delete", (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) deleteWikiPage(id);
    res.redirect("/wiki");
  });

  router.use((err, req, res, next) => {
    if (!err) return next();
    res.redirect("/wiki");
  });

  return router;
}

module.exports = buildWikiRouter;
