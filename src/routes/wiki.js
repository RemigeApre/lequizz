const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const {
  insertWikiPage,
  listWikiPages,
  getWikiPage,
  updateWikiPage,
  deleteWikiPage,
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
  return {};
}

function getAllTags(pages) {
  return Array.from(new Set(pages.flatMap((p) => p.tags))).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
}

function buildWikiRouter(config) {
  const router = express.Router();

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

  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
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
