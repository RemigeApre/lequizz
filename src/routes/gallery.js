const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const {
  listGalleryImages,
  getGalleryImage,
  insertGalleryImage,
  updateGalleryImage,
  reactGalleryImage,
  deleteGalleryImage,
  listWikiPages,
  getWikiPage,
} = require("../db");

const CATEGORIES = [
  { key: "fantasmes",   label: "Fantasmes",   hue: 330 },
  { key: "jeu_de_role", label: "Jeu de rôle", hue:  60 },
  { key: "partenaires", label: "Partenaires", hue: 210 },
  { key: "pratique",    label: "Pratique",    hue:   5 },
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

// La catégorie est optionnelle pour une image de galerie (contrairement au
// wiki) : une chaîne vide veut dire "pas de catégorie", pas "autre".
function normalizeCategory(value) {
  return CATEGORIES.some((c) => c.key === value) ? value : "";
}

// Fusionne la case a cocher "Marquer Ultra" du formulaire avec les tags
// tapes a la main, sans jamais faire de doublon.
function applyUltraCheckbox(tags, checked) {
  const has = tags.some((t) => t.toLowerCase() === "ultra");
  if (checked && !has) return [...tags, "ultra"];
  if (!checked && has) return tags.filter((t) => t.toLowerCase() !== "ultra");
  return tags;
}

function unlinkFiles(paths) {
  (paths || []).forEach((p) => {
    try { fs.unlinkSync(path.join(uploadsDir, path.basename(p))); } catch (_) {}
  });
}

// Une page wiki avec plusieurs photos ne fait plus qu'une seule entrée
// (album) dans la galerie, au lieu d'une carte par image.
function buildItems(galleryImages, wikiPages) {
  const wikiItems = wikiPages
    .filter((page) => page.imagePaths && page.imagePaths.length)
    .map((page) => ({
      type: "wiki",
      id: null,
      wikiPageId: page.id,
      imagePaths: page.imagePaths,
      title: page.title,
      category: page.category,
      tags: page.tags,
      notes: "",
      rating: page.rating || 0,
      flame: !!page.flame,
      interested: !!page.interested,
      date: page.updatedAt,
    }));

  const galleryItems = galleryImages.map((img) => ({
    type: "gallery",
    id: img.id,
    wikiPageId: img.wikiPageId,
    imagePaths: img.imagePaths,
    title: img.title,
    category: img.category,
    tags: img.tags,
    notes: img.notes,
    rating: img.rating,
    flame: img.flame,
    interested: img.interested,
    date: img.createdAt,
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
    res.render("gallery", { config, items, allTags, categories: CATEGORIES });
  });

  router.post("/", upload.array("images", 30), (req, res) => {
    const files = req.files || [];
    if (!files.length) return res.redirect("/galerie");
    const title = String(req.body.title || "").trim();
    const category = normalizeCategory(req.body.category);
    const tags = parseTags(req.body.tags);
    const notes = String(req.body.notes || "").trim();
    const imagePaths = files.map((f) => `/uploads/gallery/${f.filename}`);
    insertGalleryImage({ imagePaths, title, tags, notes, category });
    res.redirect("/galerie");
  });

  // ── Actions groupées : sélectionner plusieurs cartes de galerie
  // (jamais les images issues du wiki) pour les taguer/supprimer d'un coup.
  // Placé avant "/:id" pour ne pas être confondu avec un identifiant.
  router.post("/bulk", (req, res) => {
    const ids = [].concat(req.body.ids || []).map(Number).filter(Number.isInteger);
    const action = String(req.body.action || "");
    if (!ids.length) return res.json({ ok: false });

    if (action === "delete") {
      ids.forEach((id) => {
        const image = getGalleryImage(id);
        if (!image) return;
        unlinkFiles(image.imagePaths);
        deleteGalleryImage(id);
      });
    } else if (action === "ultra-on" || action === "ultra-off") {
      ids.forEach((id) => {
        const image = getGalleryImage(id);
        if (!image) return;
        const tags = applyUltraCheckbox(image.tags, action === "ultra-on");
        updateGalleryImage(id, {
          title: image.title,
          category: image.category,
          tags,
          notes: image.notes,
          imagePaths: image.imagePaths,
          wikiPageId: image.wikiPageId,
        });
      });
    } else {
      return res.json({ ok: false });
    }
    res.json({ ok: true });
  });

  router.get("/:id/edit", (req, res) => {
    const id = Number(req.params.id);
    const image = Number.isInteger(id) ? getGalleryImage(id) : null;
    if (!image) return res.redirect("/galerie");
    const { allTags } = getCtx();
    const linkedPage = image.wikiPageId ? getWikiPage(image.wikiPageId) : null;
    res.render("gallery-form", { config, image, allTags, categories: CATEGORIES, linkedPage });
  });

  router.post("/:id", upload.array("images", 30), (req, res) => {
    const id = Number(req.params.id);
    const image = Number.isInteger(id) ? getGalleryImage(id) : null;
    if (!image) return res.redirect("/galerie");

    // Images : on part des existantes, on retire celles cochées, on ajoute
    // les nouvelles, puis on remet la couverture choisie en tête.
    const toRemove = [].concat(req.body.remove_image || []);
    const kept = image.imagePaths.filter((p) => !toRemove.includes(p));
    const added = (req.files || []).map((f) => `/uploads/gallery/${f.filename}`);
    let imagePaths = [...kept, ...added];
    const cover = req.body.cover_image;
    if (cover && imagePaths.includes(cover) && imagePaths[0] !== cover) {
      imagePaths = [cover, ...imagePaths.filter((p) => p !== cover)];
    }
    unlinkFiles(toRemove);

    const tags = applyUltraCheckbox(parseTags(req.body.tags), req.body.ultra === "on");
    const category = normalizeCategory(req.body.category);
    const wikiPageIdRaw = Number(req.body.wiki_page_id);
    const wikiPageId = Number.isInteger(wikiPageIdRaw) && wikiPageIdRaw > 0 ? wikiPageIdRaw : null;

    updateGalleryImage(id, {
      title: String(req.body.title || "").trim(),
      category,
      tags,
      notes: String(req.body.notes || "").trim(),
      imagePaths,
      wikiPageId,
    });

    const rating = Math.max(0, Math.min(5, Number(req.body.rating) || 0));
    reactGalleryImage(id, {
      rating,
      flame: req.body.flame === "on",
      interested: req.body.interested === "on",
    });

    res.redirect("/galerie");
  });

  router.post("/:id/delete", (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) {
      const image = getGalleryImage(id);
      if (image) {
        unlinkFiles(image.imagePaths);
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
