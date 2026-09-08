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
  getPagesForQuestion,
  getImageLinks,
  addImageLink,
  removeImageLink,
  isFavorite,
  getUserNote,
  setUserNote,
  createStandaloneTag,
  insertGalleryImage,
  updateGalleryImage,
  listGalleryImages,
} = require("../db");
const { requireUser, requireUserJson, requireAdmin } = require("../auth");

const CATEGORIES = [
  { key: "position",   label: "Positions",   desc: "Postures, Kama-sutra et toutes leurs variantes.",                               hue: 270 },
  { key: "pratique",   label: "Pratiques",   desc: "Domination, BDSM, Bondage et pratiques sexuelles.",                            hue:   5 },
  { key: "lieux",      label: "Lieux",       desc: "Endroits, contextes et ambiances où se déroule l\u2019action.",                hue: 140 },
  { key: "partenaires",label: "Partenaires", desc: "Nature et nombre de partenaires : solo, duo, trio\u2026",                     hue: 210 },
  { key: "jeu_de_role",label: "Scénarios",   desc: "Jeux de rôle, scénarios joués, personnages et ambiances.",                    hue:  60 },
  { key: "tenues",     label: "Tenues",      desc: "Lingerie, costumes et tout ce qui se porte.",                                  hue: 175 },
  { key: "objets",     label: "Objets",      desc: "Sex-toys, godes, liens et accessoires hors tenues.",                          hue:  28 },
  { key: "fantasmes",  label: "Fantasmes",   desc: "Tout ce qui ne trouve pas de cat\u00e9gorie sp\u00e9cifique — le reste.",     hue: 330 },
];

// "Fantaisie" est un tag libre. "autre" a été fusionné dans "fantasmes" (migration DB).
// La clé "jeu_de_role" est conservée pour ne pas invalider les données existantes.
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

// Enrichit les tags avec le titre de la page et ses termes dérivés,
// crée les entrées tag_meta correspondantes, et synchronise les images
// de la page dans gallery_images (un enregistrement lié par page).
function autoEnrichTags(tags, title, derivedTerms) {
  const extras = [title, ...derivedTerms.map((t) => (typeof t === "string" ? t : t.term || ""))].map((s) =>
    s.trim().toLowerCase()
  ).filter(Boolean);
  const result = [...tags];
  extras.forEach((t) => {
    if (!result.map((r) => r.toLowerCase()).includes(t)) result.push(t);
    createStandaloneTag(t);
  });
  return result;
}

function syncGalleryRecord(pageId, title, imagePaths, tags) {
  if (!imagePaths || !imagePaths.length) return;
  const existing = listGalleryImages().find((g) => g.wikiPageId === pageId);
  if (existing) {
    updateGalleryImage(existing.id, { title, imagePaths, tags, wikiPageId: pageId });
  } else {
    insertGalleryImage({ imagePaths, title, tags, notes: "", category: "", wikiPageId: pageId });
  }
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
  return CATEGORY_KEYS.includes(value) ? value : "fantasmes";
}

function arr(v) { return Array.isArray(v) ? v : v ? [v] : []; }

function parseMeta(category, body) {
  // Champs transversaux (toutes catégories)
  const base = {
    termes_derives: parseDerivedTerms(body.meta_termes_derives || ""),
  };

  let specific = {};
  if (category === "position") {
    const validCats    = ["penetration","fellation_cunnilingus","anilingus","stimulation_manuelle","double_penetration","position_69","autre"];
    const validDessus  = ["femme","homme","variable","aucun"];
    const validCanal   = ["vagin","anus","bouche","mains","autre"];
    const validOri     = ["face_a_face","face_contre_dos","cote_a_cote","acrobatique","autre"];
    const validNbPart  = ["2","3","4plus","variable"];
    const validActif   = ["femme","homme","les_deux","variable"];
    const validSupport = ["lit","sol","chaise","canape","mur","table","bain","autre"];
    const oneof = (v, list) => list.includes(String(v || "")) ? String(v) : "";
    const manyof = (v, list) => arr(v).filter(x => list.includes(x));
    specific = {
      categorie:        oneof(body.meta_categorie,        validCats),
      qui_dessus:       oneof(body.meta_qui_dessus,       validDessus),
      canal:            manyof(body.meta_canal,           validCanal),
      orientation:      manyof(body.meta_orientation,     validOri),
      nb_partenaires:   oneof(body.meta_nb_partenaires,   validNbPart),
      partenaire_actif: oneof(body.meta_partenaire_actif, validActif),
      supports:         manyof(body.meta_supports,        validSupport),
    };

    // Sections textuelles spécifiques aux positions
    let variantes = [];
    try { variantes = JSON.parse(body.meta_variantes || "[]"); } catch (_) {}
    function sanitizeVar(v) {
      return {
        id: String(v.id || ""),
        nom: String(v.nom || "").slice(0, 200).trim(),
        description: String(v.description || "").slice(0, 5000),
        images: Array.isArray(v.images) ? v.images.filter((s) => typeof s === "string" && s.startsWith("/uploads/")) : [],
        variantes: Array.isArray(v.variantes) ? v.variantes.map(function (sv) {
          return {
            id: String(sv.id || ""),
            nom: String(sv.nom || "").slice(0, 200).trim(),
            description: String(sv.description || "").slice(0, 5000),
            images: Array.isArray(sv.images) ? sv.images.filter((s) => typeof s === "string" && s.startsWith("/uploads/")) : [],
          };
        }) : [],
      };
    }
    specific.variantes     = Array.isArray(variantes) ? variantes.map(sanitizeVar) : [];
    specific.infos_utiles  = String(body.meta_infos_utiles || "").slice(0, 10000);
    specific.nouvelles     = String(body.meta_nouvelles || "").slice(0, 5000);
  } else if (category === "fantasmes") {
    const sub = body.meta_sous_cat;
    const validSubs = FANTASMES_SUBCATS.map((s) => s.key);
    specific = { sous_cat: validSubs.includes(sub) ? sub : "" };
  } else if (category === "partenaires") {
    const nb = (v) => ["0","1","2","3","4","nombreux","variable"].includes(String(v)) ? String(v) : "";
    const validTypes = ["nombre", "fetichisme", "monstre", "animaux", "autre"];
    specific = {
      nb_total:    nb(body.meta_nb_total),
      nb_feminin:  nb(body.meta_nb_feminin),
      nb_masculin: nb(body.meta_nb_masculin),
      types:       arr(body.meta_types).filter(x => validTypes.includes(x)),
      scenario:    String(body.meta_scenario || "").slice(0, 5000),
    };
  } else if (category === "lieux") {
    const t = body.meta_type_lieu;
    specific = { type_lieu: ["prive","public","cache"].includes(t) ? t : "" };
  } else if (category === "objets") {
    const t = body.meta_type_gode;
    specific = { type_gode: ["animal","monstre","fantaisiste","ethnique","autre"].includes(t) ? t : "" };
  }

  return { ...base, ...specific };
}

// Injecte les chemins d'images des variantes dans le JSON meta_variantes
// avant de le passer à parseMeta. Les fichiers uploadés portent le fieldname
// "variante_img_VARID" ou "variante_sub_img_VARID" (sous-variante).
function injectVarianteImages(body, files) {
  if (!body.meta_variantes) return body;
  let variantes;
  try { variantes = JSON.parse(body.meta_variantes); } catch { return body; }
  if (!Array.isArray(variantes)) return body;

  // Index des fichiers par variante ID
  const byVar = {};
  const bySub = {};
  files.forEach((f) => {
    const mv = f.fieldname.match(/^variante_img_(.+)$/);
    if (mv) { (byVar[mv[1]] = byVar[mv[1]] || []).push(`/uploads/wiki/${f.filename}`); }
    const ms = f.fieldname.match(/^variante_sub_img_(.+)$/);
    if (ms) { (bySub[ms[1]] = bySub[ms[1]] || []).push(`/uploads/wiki/${f.filename}`); }
  });

  variantes = variantes.map((v) => {
    const existing = Array.isArray(v.images) ? v.images : [];
    const newImgs  = byVar[v.id] || [];
    const subs = Array.isArray(v.variantes) ? v.variantes.map((sv) => {
      const exSub  = Array.isArray(sv.images) ? sv.images : [];
      const newSub = bySub[sv.id] || [];
      return { ...sv, images: [...exSub, ...newSub] };
    }) : [];
    return { ...v, images: [...existing, ...newImgs], variantes: subs };
  });

  return { ...body, meta_variantes: JSON.stringify(variantes) };
}

const PRESET_TAGS = ["fantaisie", "irréaliste", "ultra"];
const SPECIAL_TAGS = new Set(["ultra", "irréaliste"]);

function getAllTags(pages) {
  const counts = new Map();
  pages.forEach((p) => p.tags.forEach((t) => counts.set(t, (counts.get(t) || 0) + 1)));
  PRESET_TAGS.forEach((t) => { if (!counts.has(t)) counts.set(t, 0); });
  return Array.from(counts.keys()).sort((a, b) => {
    const diff = (counts.get(b) || 0) - (counts.get(a) || 0);
    return diff !== 0 ? diff : a.localeCompare(b, "fr");
  });
}

function getTagCounts(pages) {
  const counts = {};
  pages.forEach(p => p.tags.forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  return counts;
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
  const pageDerived = new Set((page.meta.termes_derives || []).map((t) => (typeof t === "string" ? t : t.term || "").toLowerCase()));
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
      (p.meta.termes_derives || []).forEach((t) => { if (pageDerived.has((typeof t === "string" ? t : t.term || "").toLowerCase())) score += 2; });
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
    return (page.tags || []).some((t) => SPECIAL_TAGS.has(String(t).toLowerCase()));
  }

  // Valide qu'une URL de retour est interne (chemin relatif ou même origine).
  function safeReturnTo(url, fallback) {
    if (!url) return fallback;
    try {
      const parsed = new URL(url, "http://localhost");
      if (parsed.pathname.startsWith("/")) return parsed.pathname + parsed.search;
    } catch (_) {}
    return fallback;
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
      const allCatPages = pagesForCategory(visiblePages, cat.key);
      // count global (ultra + irréaliste inclus) pour la carte de catégorie
      const primaryCount = pages.filter((p) => p.category === cat.key).length;
      return { ...cat, pages: allCatPages, count: primaryCount, preview: allCatPages.slice(0, 6) };
    });
    const allPages = listWikiPages();
    const recentAdded = [...allPages]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 30);
    const recentUpdated = [...allPages]
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, 30);
    const popular = allPages
      .filter((p) => p.rating > 0)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 30);
    res.render("wiki-index", {
      config, chapters, pages,
      allTags: getAllTags(pages),
      tagCounts: getTagCounts(pages),
      totalCount: pages.length,
      recentAdded, recentUpdated, popular,
      ...CTX
    });
  });

  // ── Vue "tout" : toutes les pages, toutes categories melangees ──
  router.get("/tous", (req, res) => {
    const pages = sortedPages();
    res.render("wiki", { config, pages, allTags: getAllTags(pages), tagCounts: getTagCounts(pages), lockedCategory: null, ...CTX });
  });

  // ── Vue par categorie : un "chapitre" du livre ──
  router.get("/categorie/:key", (req, res) => {
    const cat = CATEGORIES.find((c) => c.key === req.params.key);
    if (!cat) return res.redirect("/wiki");
    const pages = pagesForCategory(sortedPages(), cat.key);
    res.render("wiki", { config, pages, allTags: getAllTags(pages), tagCounts: getTagCounts(pages), lockedCategory: cat, ...CTX });
  });

  router.post("/", requireAdmin, upload.any(), (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.redirect("/wiki");

    const category        = normalizeCategory(req.body.category);
    const content         = String(req.body.content || "").trim();
    const tags            = parseTags(req.body.tags);
    const owned           = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";
    const extraCategories = arr(req.body.extra_categories).filter((k) => CATEGORY_KEYS.includes(k) && k !== category);

    const files = req.files || [];
    const imagePaths = files.filter((f) => f.fieldname === "images").map((f) => `/uploads/wiki/${f.filename}`);
    const bodyWithVarianteImgs = injectVarianteImages(req.body, files);
    const meta = parseMeta(category, bodyWithVarianteImgs);
    const enrichedTags = autoEnrichTags(tags, title, meta.termes_derives || []);

    const newId = insertWikiPage({ title, category, content, tags: enrichedTags, imagePaths, owned, meta, extraCategories });
    if (imagePaths.length) syncGalleryRecord(newId, title, imagePaths, enrichedTags);
    res.redirect(`/wiki/${newId}`);
  });

  // ── Associations image ─────────────────────────────
  router.get("/image-links", requireUserJson, (req, res) => {
    const src = req.query.src;
    if (!src) return res.json([]);
    res.json(getImageLinks(src));
  });

  router.post("/image-links", requireUserJson, (req, res) => {
    const { src, page_id } = req.body;
    if (!src || !page_id) return res.status(400).json({ ok: false });
    addImageLink(src, Number(page_id));
    res.json({ ok: true });
  });

  router.delete("/image-links", requireUserJson, (req, res) => {
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

  // ── Compteurs X|Y par tag ───────────────────────────
  router.get("/tag-counts", (req, res) => {
    const pages = {};
    listWikiPages().forEach((p) => p.tags.forEach((t) => { pages[t] = (pages[t] || 0) + 1; }));
    const images = {};
    listGalleryImages().forEach((img) => img.tags.forEach((t) => { images[t] = (images[t] || 0) + 1; }));
    res.json({ pages, images });
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

  router.get("/ajouter", requireUser, (req, res) => {
    const preCategory = String(req.query.category || "");
    const pages = sortedPages();
    const blankPage = {
      id: null, title: "", category: preCategory || (CATEGORIES[0] && CATEGORIES[0].key) || "",
      content: "", tags: [], imagePaths: [], owned: false, meta: {},
      extraCategories: [], rating: 0, flame: false, interested: false,
      updatedAt: new Date().toISOString()
    };
    const returnTo = safeReturnTo(req.get("referer"), "/wiki");
    res.render("wiki-form", { config, page: blankPage, pages, allTags: getAllTags(pages), returnTo, ...CTX });
  });

  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    incrementWikiViews(id, req.user ? req.user.id : null);
    const allPages = listWikiPages().sort((a, b) =>
      a.title.localeCompare(b.title, "fr", { sensitivity: "base" })
    );
    const idx = allPages.findIndex((p) => p.id === id);
    const prevPage = idx > 0 ? { id: allPages[idx - 1].id, title: allPages[idx - 1].title } : null;
    const nextPage = idx < allPages.length - 1 ? { id: allPages[idx + 1].id, title: allPages[idx + 1].title } : null;
    const suggestions = computeSuggestions(page, allPages);
    const back = wikiBackTarget(req);
    const pageIsFavorite = req.user ? isFavorite(req.user.id, "wiki", id) : false;
    let userNote = "";
    try { userNote = req.user ? getUserNote(id, req.user.id) : ""; } catch (_) {}
    // Compteurs X|Y par tag (pages wiki | images galerie)
    const tagPageCounts = {};
    allPages.forEach((p) => p.tags.forEach((t) => { tagPageCounts[t] = (tagPageCounts[t] || 0) + 1; }));
    const tagImageCounts = {};
    listGalleryImages().forEach((img) => img.tags.forEach((t) => { tagImageCounts[t] = (tagImageCounts[t] || 0) + 1; }));
    res.render("wiki-detail", { config, page, pages: allPages, suggestions, prevPage, nextPage, backHref: back.href, backLabel: back.label, isFavorite: pageIsFavorite, userNote, tagPageCounts, tagImageCounts, ...CTX });
  });

  router.get("/:id/edit", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    const pages = sortedPages();
    const allTags = getAllTags(pages);
    const returnTo = safeReturnTo(req.get("referer"), `/wiki/${id}`);
    res.render("wiki-form", { config, page, pages, allTags, returnTo, ...CTX });
  });

  router.post("/:id", requireAdmin, upload.any(), (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!existing) return res.redirect("/wiki");

    const title    = String(req.body.title || "").trim() || existing.title;
    const category = normalizeCategory(req.body.category);
    const content  = String(req.body.content || "").trim();
    const tags     = parseTags(req.body.tags);
    const owned    = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";

    const files = req.files || [];
    const bodyWithVarianteImgs = injectVarianteImages(req.body, files);
    const meta = parseMeta(category, bodyWithVarianteImgs);

    // Images de page : on part des existantes, on retire celles cochées, on ajoute les nouvelles
    const toRemove  = [].concat(req.body.remove_image || []);
    const kept      = existing.imagePaths.filter((p) => !toRemove.includes(p));
    const added     = files.filter((f) => f.fieldname === "images").map((f) => `/uploads/wiki/${f.filename}`);
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
    const enrichedTags = autoEnrichTags(tags, title, meta.termes_derives || []);
    updateWikiPage(id, { title, category, content, tags: enrichedTags, imagePaths, owned, meta, extraCategories });
    syncGalleryRecord(id, title, imagePaths, enrichedTags);
    res.redirect(safeReturnTo(req.body._returnTo, `/wiki/${id}`));
  });

  // ── Liens entre pages wiki ─────────────────────────
  router.get("/:id/page-links", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json({ links: [], backlinks: [] });
    res.json({ links: getWikiPageLinks(id), backlinks: getWikiBacklinks(id) });
  });

  router.post("/:id/page-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    const linked = Number(req.body.linked_page_id);
    if (!Number.isInteger(id) || !Number.isInteger(linked)) return res.status(400).json({ ok: false });
    addWikiPageLink(id, linked);
    res.json({ ok: true });
  });

  router.delete("/:id/page-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    const linked = Number(req.body.linked_page_id);
    if (!Number.isInteger(id) || !Number.isInteger(linked)) return res.status(400).json({ ok: false });
    removeWikiPageLink(id, linked);
    res.json({ ok: true });
  });

  // ── Associations questions ──────────────────────────
  // Sens inverse : depuis une question du quizz, quelles pages wiki y sont
  // déjà liées (utilisé par le bouton "?" sur les questions).
  router.get("/question-links/lookup", requireUserJson, (req, res) => {
    const sectionKey = String(req.query.section_key || "");
    const questionId = String(req.query.question_id || "");
    if (!sectionKey || !questionId) return res.json([]);
    const pages = getPagesForQuestion(sectionKey, questionId);
    res.json(pages.map((p) => ({ id: p.id, title: p.title, category: p.category })));
  });

  router.get("/:id/question-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.json([]);
    const links = getWikiQuestionLinks(id);
    const enriched = links.map((l) => {
      const found = ALL_QUESTIONS.find((x) => x.section_key === l.section_key && x.question_id === l.question_id);
      return {
        section_key:    l.section_key,
        section_index:  config.sections.findIndex((s) => s.key === l.section_key),
        section_title:  found ? found.section_title  : l.section_key,
        question_id:    l.question_id,
        question_text:  found ? found.question_text  : l.question_id,
      };
    });
    res.json(enriched);
  });

  router.post("/:id/question-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { section_key, question_id } = req.body;
    if (!section_key || !question_id) return res.status(400).json({ ok: false });
    addWikiQuestionLink(id, section_key, question_id);
    res.json({ ok: true });
  });

  router.delete("/:id/question-links", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { section_key, question_id } = req.body;
    if (!section_key || !question_id) return res.status(400).json({ ok: false });
    removeWikiQuestionLink(id, section_key, question_id);
    res.json({ ok: true });
  });

  router.post("/:id/react", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    const { rating, flame, interested } = req.body;
    reactWikiPage(id, { rating, flame, interested });
    res.json({ ok: true });
  });

  router.post("/:id/note", requireUserJson, (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ ok: false });
    setUserNote(id, req.user.id, req.body.content || "");
    res.json({ ok: true });
  });

  router.post("/:id/delete", requireAdmin, (req, res) => {
    const id = Number(req.params.id);
    let cat = "";
    if (Number.isInteger(id)) {
      const page = getWikiPage(id);
      cat = page ? page.category : "";
      deleteWikiPage(id);
    }
    res.redirect(cat ? `/wiki/categorie/${cat}` : "/wiki");
  });

  router.use((err, req, res, next) => {
    if (!err) return next();
    console.error("[wiki] erreur route", req.method, req.originalUrl, err.message || err);
    res.redirect("/wiki");
  });

  return router;
}

buildWikiRouter.CATEGORIES = CATEGORIES;
module.exports = buildWikiRouter;
