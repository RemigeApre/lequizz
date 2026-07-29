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
  { key: "fantasmes", label: "Fantasmes" },
  { key: "partenaires", label: "Type et nombre de partenaire" },
  { key: "position", label: "Position" },
  { key: "lieux", label: "Lieux" },
  { key: "objets", label: "Objets" },
  { key: "autre", label: "Autre" },
];
const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

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
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function normalizeCategory(value) {
  return CATEGORY_KEYS.includes(value) ? value : "autre";
}

function buildWikiRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const pages = listWikiPages();
    const allTags = Array.from(new Set(pages.flatMap((p) => p.tags))).sort((a, b) =>
      a.localeCompare(b, "fr")
    );
    res.render("wiki", { config, pages, allTags, categories: CATEGORIES });
  });

  router.post("/", upload.single("image"), (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.redirect("/wiki");

    const category = normalizeCategory(req.body.category);
    const content = String(req.body.content || "").trim();
    const tags = parseTags(req.body.tags);
    const owned = category === "objets" && req.body.owned === "on";
    const imagePath = req.file ? `/uploads/wiki/${req.file.filename}` : null;

    insertWikiPage({ title, category, content, tags, imagePath, owned });
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
    res.render("wiki-form", { config, categories: CATEGORIES, page });
  });

  router.post("/:id", upload.single("image"), (req, res) => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? getWikiPage(id) : null;
    if (!existing) return res.redirect("/wiki");

    const title = String(req.body.title || "").trim() || existing.title;
    const category = normalizeCategory(req.body.category);
    const content = String(req.body.content || "").trim();
    const tags = parseTags(req.body.tags);
    const owned = category === "objets" && req.body.owned === "on";
    const imagePath = req.file ? `/uploads/wiki/${req.file.filename}` : undefined;

    updateWikiPage(id, { title, category, content, tags, imagePath, owned });
    res.redirect(`/wiki/${id}`);
  });

  router.post("/:id/delete", (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) deleteWikiPage(id);
    res.redirect("/wiki");
  });

  // Filet de securite : une image trop lourde ou d'un type non accepte
  // (erreur multer) renvoie simplement vers le wiki plutot qu'une page
  // d'erreur brute.
  router.use((err, req, res, next) => {
    if (!err) return next();
    res.redirect("/wiki");
  });

  return router;
}

module.exports = buildWikiRouter;
