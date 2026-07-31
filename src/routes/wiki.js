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
  getWikiPageLinks,
  getWikiBacklinks,
  addWikiPageLink,
  removeWikiPageLink,
  getWikiQuestionLinks,
  addWikiQuestionLink,
  removeWikiQuestionLink,
  getImageLinks,
  addImageLink,
  removeImageLink,
} = require("../db");

const CATEGORIES = [
  { key: "fantasmes",  label: "Fantasmes",   desc: "Sc\u00e9narios, d\u00e9sirs...",          hue: 330 },
  { key: "jeu_de_role",label: "Jeu de r\u00f4le", desc: "Sc\u00e9narios jou\u00e9s, personnages...", hue:  60 },
  { key: "partenaires",label: "Partenaires", desc: "Configurations, r\u00f4les...",       hue: 210 },
  { key: "pratique",   label: "Pratique",    desc: "Actes et gestes sexuels...",      hue:   5 },
  { key: "position",   label: "Position",    desc: "Kama-sutra, variantes...",        hue: 270 },
  { key: "lieux",      label: "Lieux",       desc: "Endroits, contextes...",          hue: 140 },
  { key: "objets",     label: "Objets",      desc: "Sex-toys, accessoires...",        hue:  28 },
  { key: "tenues",     label: "Tenues",      desc: "Lingerie, costumes...",           hue: 175 },
  { key: "autre",      label: "Autre",       desc: "Tout le reste",                  hue: 220 },
];

// "Fantaisie" et "Jeux de r\u00f4le" ne sont plus des sous-cat\u00e9gories : la
// premi\u00e8re existe d\u00e9j\u00e0 comme tag, le second est devenu un chapitre
// complet \u00e0 part enti\u00e8re (cat\u00e9gorie "jeu_de_role").
const FANTASMES_SUBCATS = [
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

// Chaque synonyme peut être marqué "anglais" individuellement (suffixe
// interne "::en" ajouté par le widget côté client, jamais tapé par
// l'utilisateur) — remplace l'ancien réglage global "Terme anglais"
// qui s'appliquait à tort à tous les synonymes à la fois.
function parseDerivedTerms(raw) {
  return String(raw || "")
    .split(/[,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const en = /::en$/.test(t);
      return { term: en ? t.slice(0, -4).trim() : t, en };
    })
    .filter((t) => t.term);
}

function normalizeCategory(value) {
  return CATEGORY_KEYS.includes(value) ? value : "autre";
}

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

function parseMeta(category, body) {
  // Champs transversaux (toutes catégories)
  const base = {
    termes_derives: parseDerivedTerms(body.meta_termes_derives || ""),
  };

  let specific = {};
  if (category === "position") {
    specific = {
      qui_dessus:  String(body.meta_qui_dessus || ""),
      canal:       arr(body.meta_canal),
      orientation: arr(body.meta_orientation),
    };
  } else if (category === "fantasmes") {
    const sub = body.meta_sous_cat;
    const validSubs = FANTASMES_SUBCATS.map((s) => s.key);
    specific = { sous_cat: validSubs.includes(sub) ? sub : "" };
  } else if (category === "partenaires") {
    const nb = (v) => ["0","1","2","3","nombreux"].includes(String(v)) ? String(v) : "";
    specific = { nb_femmes: nb(body.meta_nb_femmes), nb_hommes: nb(body.meta_nb_hommes) };
  } else if (category === "lieux") {
    const t = body.meta_type_lieu;
    specific = { type_lieu: ["prive","public","cache"].includes(t) ? t : "" };
  } else if (category === "objets") {
    const t = body.meta_type_gode;
    specific = { type_gode: ["animal","monstre","fantaisiste","ethnique","autre"].includes(t) ? t : "" };
  }

  return { ...base, ...specific };
}

const PRESET_TAGS = ["fantaisie", "ultra"];

function getAllTags(pages) {
  return Array.from(new Set([...PRESET_TAGS, ...pages.flatMap((p) => p.tags)])).sort((a, b) =>
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

function computeSuggestions(page, allPages) {
  const pageTagSet = new Set(page.tags.map((t) => t.toLowerCase()));
  const pageDerived = new Set((page.meta.termes_derives || []).map((t) => t.toLowerCase()));
  const pageTitleWords = new Set(
    page.title.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
  );

  return allPages
    .filter((p) => p.id !== page.id)
    .map((p) => {
      let score = 0;
      // Tags communs
      p.tags.forEach((t) => { if (pageTagSet.has(t.toLowerCase())) score += 3; });
      // Même catégorie
      if (p.category === page.category) score += 2;
      // Termes dérivés communs
      (p.meta.termes_derives || []).forEach((t) => { if (pageDerived.has(t.toLowerCase())) score += 2; });
      // Mots du titre communs (> 3 lettres)
      p.title.toLowerCase().split(/\s+/).forEach((w) => { if (w.length > 3 && pageTitleWords.has(w)) score += 1; });
      return { p, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ p }) => p);
}

function buildWikiRouter(config) {
  const router = express.Router();
  const ALL_QUESTIONS = buildQuestionIndex(config);

  const CTX = { categories: CATEGORIES, fantasmesSubs: FANTASMES_SUBCATS };

  function sortedPages() {
    return listWikiPages().sort((a, b) => a.title.localeCompare(b.title, "fr", { sensitivity: "base" }));
  }

  // Une page appartient a une categorie si c'est sa categorie principale
  // OU une de ses categories supplementaires : une carte "aussi dans..."
  // doit apparaitre dans chaque chapitre concerne, pas seulement le sien.
  function pagesForCategory(pages, key) {
    return pages.filter((p) => p.category === key || (p.extraCategories || []).includes(key));
  }

  // Une page "ULTRA" porte un simple tag libre "ultra" (insensible a la casse).
  function isUltra(page) {
    return (page.tags || []).some((t) => String(t).toLowerCase() === "ultra");
  }

  // Le bouton "retour" d'une page doit ramener a l'endroit precis d'ou l'on
  // vient (sommaire, vue globale ou chapitre d'une categorie), pas toujours
  // au sommaire general.
  function wikiBackTarget(req) {
    const fallback = { href: "/wiki", label: "Sommaire" };
    const ref = req.get("referer");
    if (!ref) return fallback;
    try {
      const url = new URL(ref);
      if (url.pathname === "/wiki") return fallback;
      if (url.pathname === "/wiki/tous") return { href: "/wiki/tous" + url.search, label: "Toutes les pages" };
      const m = url.pathname.match(/^\/wiki\/categorie\/([^/]+)$/);
      if (m) {
        const cat = CATEGORIES.find((c) => c.key === m[1]);
        if (cat) return { href: url.pathname, label: cat.label };
      }
    } catch (_) {}
    return fallback;
  }

  // ── Sommaire : une "etagere" par categorie, comme les chapitres d'un livre ──
  // Vue d'accueil/decouverte : les pages ULTRA restent masquees ici par defaut
  // (elles restent consultables via /wiki/categorie/:key et /wiki/tous).
  router.get("/", (req, res) => {
    const pages = sortedPages();
    const visiblePages = pages.filter((p) => !isUltra(p));
    const chapters = CATEGORIES.map((cat) => {
      const catPages = pagesForCategory(visiblePages, cat.key);
      return { ...cat, pages: catPages, count: catPages.length, preview: catPages.slice(0, 6) };
    });
    res.render("wiki-index", { config, chapters, pages, allTags: getAllTags(pages), totalCount: pages.length, ...CTX });
  });

  // ── Vue "tout" : toutes les pages, toutes categories melangees ──
  router.get("/tous", (req, res) => {
    const pages = sortedPages();
    res.render("wiki", { config, pages, allTags: getAllTags(pages), lockedCategory: null, ...CTX });
  });

  // ── Vue par categorie : un "chapitre" du livre ──
  router.get("/categorie/:key", (req, res) => {
    const cat = CATEGORIES.find((c) => c.key === req.params.key);
    if (!cat) return res.redirect("/wiki");
    const pages = pagesForCategory(sortedPages(), cat.key);
    res.render("wiki", { config, pages, allTags: getAllTags(pages), lockedCategory: cat, ...CTX });
  });

  router.post("/", upload.array("images", 10), (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.redirect("/wiki");

    const category        = normalizeCategory(req.body.category);
    const content         = String(req.body.content || "").trim();
    const tags            = parseTags(req.body.tags);
    const owned           = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";
    const meta            = parseMeta(category, req.body);
    const imagePaths      = (req.files || []).map((f) => `/uploads/wiki/${f.filename}`);
    const extraCategories = arr(req.body.extra_categories).filter((k) => CATEGORY_KEYS.includes(k) && k !== category);

    insertWikiPage({ title, category, content, tags, imagePaths, owned, meta, extraCategories });
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
    const allPages = listWikiPages().sort((a, b) =>
      a.title.localeCompare(b.title, "fr", { sensitivity: "base" })
    );
    const idx = allPages.findIndex((p) => p.id === id);
    const prevPage = idx > 0 ? { id: allPages[idx - 1].id, title: allPages[idx - 1].title } : null;
    const nextPage = idx < allPages.length - 1 ? { id: allPages[idx + 1].id, title: allPages[idx + 1].title } : null;
    const suggestions = computeSuggestions(page, allPages);
    const back = wikiBackTarget(req);
    res.render("wiki-detail", { config, page, pages: allPages, suggestions, prevPage, nextPage, backHref: back.href, backLabel: back.label, ...CTX });
  });

  router.get("/:id/edit", (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    const pages = sortedPages();
    const allTags = getAllTags(pages);
    res.render("wiki-form", { config, page, pages, allTags, ...CTX });
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
    let imagePaths  = [...kept, ...added];

    // Réordonne selon l'image de couverture choisie
    const coverValue = String(req.body.cover_image || "");
    if (coverValue.startsWith("__new__:")) {
      const ni = Number(coverValue.replace("__new__:", ""));
      if (!isNaN(ni) && ni >= 0 && ni < added.length) {
        imagePaths = [added[ni], ...kept, ...added.filter((_, i) => i !== ni)];
      }
    } else if (coverValue && imagePaths.includes(coverValue)) {
      imagePaths = [coverValue, ...imagePaths.filter((p) => p !== coverValue)];
    }

    const extraCategories = arr(req.body.extra_categories).filter((k) => CATEGORY_KEYS.includes(k) && k !== category);
    updateWikiPage(id, { title, category, content, tags, imagePaths, owned, meta, extraCategories });
    res.redirect(`/wiki/${id}`);
  });

  // ── Liens entre pages wiki ─────────────────────────
  router.get("/:id/page-links", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json({ links: [], backlinks: [] });
    res.json({ links: getWikiPageLinks(id), backlinks: getWikiBacklinks(id) });
  });

  router.post("/:id/page-links", (req, res) => {
    const id = Number(req.params.id);
    const linked = Number(req.body.linked_page_id);
    if (!Number.isInteger(id) || !Number.isInteger(linked)) return res.status(400).json({ ok: false });
    addWikiPageLink(id, linked);
    res.json({ ok: true });
  });

  router.delete("/:id/page-links", (req, res) => {
    const id = Number(req.params.id);
    const linked = Number(req.body.linked_page_id);
    if (!Number.isInteger(id) || !Number.isInteger(linked)) return res.status(400).json({ ok: false });
    removeWikiPageLink(id, linked);
    res.json({ ok: true });
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
