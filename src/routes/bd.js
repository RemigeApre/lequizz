const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const { listBdBooks, getBdBook, insertBdBook, updateBdBook, deleteBdBook, isFavorite } = require("../db");
const { requireUser } = require("../auth");

const uploadsDir = path.join(__dirname, "..", "..", "data", "uploads", "bd");
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
  limits: { fileSize: 50 * 1024 * 1024 },
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

function applyImageOrder(existing, newFiles, orderRaw) {
  if (!orderRaw) return [...existing, ...newFiles];
  const entries = String(orderRaw).split(",").map((s) => s.trim()).filter(Boolean);
  const result = [];
  for (const entry of entries) {
    if (entry.startsWith("__new__:")) {
      const idx = Number(entry.slice(8));
      if (!isNaN(idx) && idx >= 0 && idx < newFiles.length) result.push(newFiles[idx]);
    } else if (existing.includes(entry)) {
      result.push(entry);
    }
  }
  // Append any orphaned new files not referenced in order
  const inResult = new Set(result);
  for (const p of newFiles) { if (!inResult.has(p)) result.push(p); }
  return result;
}

function buildBdRouter(config) {
  const router = express.Router();
  router.use(requireUser);

  router.get("/", (req, res) => {
    const books = listBdBooks();
    res.render("bd", { config, books });
  });

  router.get("/new", (req, res) => {
    res.render("bd-form", { config, book: null });
  });

  router.post("/", upload.array("images", 200), (req, res) => {
    const title = String(req.body.title || "").trim();
    if (!title) return res.redirect("/bd/new");
    const description = String(req.body.description || "").trim();
    const tags = applyUltraCheckbox(parseTags(req.body.tags), req.body.ultra === "on");
    const newFiles = (req.files || []).map((f) => `/uploads/bd/${f.filename}`);
    const imagePaths = applyImageOrder([], newFiles, req.body.image_order);
    const id = insertBdBook({ title, description, tags, imagePaths });
    res.redirect(`/bd/${id}`);
  });

  router.get("/:id/edit", (req, res) => {
    const book = getBdBook(Number(req.params.id));
    if (!book) return res.redirect("/bd");
    res.render("bd-form", { config, book });
  });

  router.post("/:id/delete", (req, res) => {
    const id = Number(req.params.id);
    const book = getBdBook(id);
    if (book) {
      for (const src of book.imagePaths) {
        try { fs.unlinkSync(path.join(uploadsDir, path.basename(src))); } catch (_) {}
      }
      deleteBdBook(id);
    }
    res.redirect("/bd");
  });

  router.post("/:id", upload.array("images", 200), (req, res) => {
    const id = Number(req.params.id);
    const book = getBdBook(id);
    if (!book) return res.redirect("/bd");

    const title = String(req.body.title || "").trim() || book.title;
    const description = String(req.body.description || "").trim();
    const tags = applyUltraCheckbox(parseTags(req.body.tags), req.body.ultra === "on");

    const toRemove = new Set([].concat(req.body.remove_image || []));
    for (const src of toRemove) {
      try { fs.unlinkSync(path.join(uploadsDir, path.basename(src))); } catch (_) {}
    }

    const existing = book.imagePaths.filter((p) => !toRemove.has(p));
    const newFiles = (req.files || []).map((f) => `/uploads/bd/${f.filename}`);
    const imagePaths = applyImageOrder(existing, newFiles, req.body.image_order);

    updateBdBook(id, { title, description, tags, imagePaths });
    res.redirect(`/bd/${id}`);
  });

  router.get("/:id", (req, res) => {
    const book = getBdBook(Number(req.params.id));
    if (!book) return res.redirect("/bd");
    const allBooks = listBdBooks();
    const idx = allBooks.findIndex((b) => b.id === book.id);
    const prevBook = idx < allBooks.length - 1 ? allBooks[idx + 1] : null;
    const nextBook = idx > 0 ? allBooks[idx - 1] : null;
    res.render("bd-detail", { config, book, prevBook, nextBook, isFavorite: isFavorite(req.user.id, "bd", book.id) });
  });

  router.use((err, req, res, next) => {
    if (!err) return next();
    console.error(err);
    res.redirect("/bd");
  });

  return router;
}

module.exports = buildBdRouter;
