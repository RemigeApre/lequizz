const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const {
  listGalleryImages,
  getGalleryImage,
  insertGalleryImage,
  updateGalleryImage,
  deleteGalleryImage,
  listWikiPages,
} = require("../db");

const CATEGORIES = [
  { key: "fantasmes",   label: "Fantasmes",   hue: 330 },
  { key: "partenaires", label: "Partenaires", hue: 210 },
  { key: "position",    label: "Position",    hue: 270 },
  { key: "lieux",       label: "Lieux",       hue: 140 },
  { key: "objets",      label: "Objets",      hue:  28 },
  { key: "tenues",      label: "Tenues",      hue: 175 },
  { key: "autre",       label: "Autre",       hue: 220 },
];
const CAT_MAP = {};
CATEGORIES.forEach((c) => { CAT_MAP[c.key] = c; });

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "gallery");
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
  return String(raw || "").split(/[,;]+/).map((t) => t.trim()).filter(Boolean);
}

// Fusionne la case a cocher "Marquer Ultra" du formulaire avec les tags
// tapes a la main, sans jamais faire de doublon.
function applyUltraCheckbox(tags, checked) {
  const has = tags.some((t) => t.toLowerCase() === "ultra");
  if (checked && !has) return [...tags, "ultra"];
  if (!checked && has) return tags.filter((t) => t.toLowerCase() !== "ultra");
  return tags;
}

function buildItems(galleryImages, wikiPages) {
  const wikiItems = wikiPages.flatMap((page) =>
    page.imagePaths.map((src) => ({
      type: "wiki",
      src,
      title: page.title,
      tags: page.tags,
      wikiPageId: page.id,
      cat: CAT_MAP[page.category] || { key: page.category, label: page.category, hue: 220 },
      date: page.updatedAt,
      id: null,
      notes: "",
    }))
  );

  const galleryItems = galleryImages.map((img) => ({
    type: "gallery",
    src: img.filename,
    title: img.title,
    tags: img.tags,
    wikiPageId: null,
    cat: null,
    date: img.createdAt,
    id: img.id,
    notes: img.notes,
  }));

  return [...galleryItems, ...wikiItems].sort((a, b) => b.date.localeCompare(a.date));
}

function getCtx() {
  const wikiPages = listWikiPages();
  const galleryImages = listGalleryImages();
  const items = buildItems(galleryImages, wikiPages);
  const allTags = Array.from(new Set(items.flatMap((i) => i.tags))).sort((a, b) =>
    a.localeCompare(b, "fr")
  );
  return { items, allTags };
}

function buildGalleryRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const { items, allTags } = getCtx();
    res.render("gallery", { config, items, allTags });
  });

  router.post("/", upload.array("images", 30), (req, res) => {
    const title = String(req.body.title || "").trim();
    const tags = parseTags(req.body.tags);
    const notes = String(req.body.notes || "").trim();
    for (const file of req.files || []) {
      insertGalleryImage({ filename: `/uploads/gallery/${file.filename}`, title, tags, notes });
    }
    res.redirect("/galerie");
  });

  router.get("/:id/edit", (req, res) => {
    const id = Number(req.params.id);
    const image = Number.isInteger(id) ? getGalleryImage(id) : null;
    if (!image) return res.redirect("/galerie");
    const { allTags } = getCtx();
    res.render("gallery-form", { config, image, allTags });
  });

  router.post("/:id", (req, res) => {
    const id = Number(req.params.id);
    const image = Number.isInteger(id) ? getGalleryImage(id) : null;
    if (!image) return res.redirect("/galerie");
    const tags = applyUltraCheckbox(parseTags(req.body.tags), req.body.ultra === "on");
    updateGalleryImage(id, {
      title: String(req.body.title || "").trim(),
      tags,
      notes: String(req.body.notes || "").trim(),
    });
    res.redirect("/galerie");
  });

  router.post("/:id/delete", (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) {
      const image = getGalleryImage(id);
      if (image) {
        const filePath = path.join(
          __dirname, "..", "..", "data", "uploads", "gallery",
          path.basename(image.filename)
        );
        try { fs.unlinkSync(filePath); } catch (_) {}
        deleteGalleryImage(id);
      }
    }
    res.redirect("/galerie");
  });

  router.use((err, req, res, next) => {
    if (!err) return next();
    res.redirect("/galerie");
  });

  return router;
}

module.exports = buildGalleryRouter;
