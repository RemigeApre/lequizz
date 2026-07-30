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

function parseMeta(category, body) {
  if (category !== "position") return {};
  const canal = body.meta_canal;
  return {
    qui_dessus:  String(body.meta_qui_dessus  || ""),
    canal:       Array.isArray(canal) ? canal : canal ? [canal] : [],
    orientation: String(body.meta_orientation || ""),
  };
}

function getAllTags(pages) {
  return Array.from(new Set(pages.flatMap((p) => p.tags))).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
}

function buildWikiRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const pages = listWikiPages();
    res.render("wiki", { config, pages, allTags: getAllTags(pages), categories: CATEGORIES });
  });

  router.post("/", upload.single("image"), (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.redirect("/wiki");

    const category = normalizeCategory(req.body.category);
    const content  = String(req.body.content || "").trim();
    const tags     = parseTags(req.body.tags);
    const owned    = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";
    const meta     = parseMeta(category, req.body);
    const imagePath = req.file ? `/uploads/wiki/${req.file.filename}` : null;

    insertWikiPage({ title, category, content, tags, imagePath, owned, meta });
    res.redirect("/wiki");
  });

  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    res.render("wiki-detail", { config, page, categories: CATEGORIES });
  });

  router.get("/:id/edit", (req, res) => {
    const id = Number(req.params.id);
    const page = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!page) return res.redirect("/wiki");
    const allTags = getAllTags(listWikiPages());
    res.render("wiki-form", { config, categories: CATEGORIES, page, allTags });
  });

  router.post("/:id", upload.single("image"), (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!existing) return res.redirect("/wiki");

    const title    = String(req.body.title || "").trim() || existing.title;
    const category = normalizeCategory(req.body.category);
    const content  = String(req.body.content || "").trim();
    const tags     = parseTags(req.body.tags);
    const owned    = OWNED_CATEGORIES.includes(category) && req.body.owned === "on";
    const meta     = parseMeta(category, req.body);

    let imagePath;
    if (req.file) {
      imagePath = `/uploads/wiki/${req.file.filename}`;
    } else if (req.body.remove_image === "on") {
      imagePath = null;
    }

    updateWikiPage(id, { title, category, content, tags, imagePath, owned, meta });
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
