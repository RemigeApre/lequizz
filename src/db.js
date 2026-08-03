const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { hashPassword } = require("./passwords");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "quizz.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    answers TEXT NOT NULL,
    scores TEXT NOT NULL
  )
`);
// Multi-profil : chaque soumission appartient a un profil (avant, un seul
// jeu de reponses partage entre tout le monde).
try { db.exec("ALTER TABLE submissions ADD COLUMN user_id INTEGER"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS attempts (
    token TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    next_section INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'site',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'autre',
    content TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    image_path TEXT,
    owned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
// Migrations non destructives
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN meta TEXT NOT NULL DEFAULT '{}'"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN image_paths TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN rating INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN flame INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN interested INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN views INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN extra_categories TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}
try { db.exec("ALTER TABLE wiki_pages ADD COLUMN featured INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS gallery_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
// Migrations non destructives (même approche que wiki_pages) : catégorie,
// réactions, lien vers une page wiki, et plusieurs images par entrée
// (album) au lieu d'une seule image par ligne.
try { db.exec("ALTER TABLE gallery_images ADD COLUMN category TEXT NOT NULL DEFAULT ''"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN rating INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN flame INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN interested INTEGER NOT NULL DEFAULT 0"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN wiki_page_id INTEGER"); } catch (_) {}
try { db.exec("ALTER TABLE gallery_images ADD COLUMN image_paths TEXT NOT NULL DEFAULT '[]'"); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS bd_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    image_paths TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_page_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id INTEGER NOT NULL,
    linked_page_id INTEGER NOT NULL,
    UNIQUE(page_id, linked_page_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_question_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wiki_page_id INTEGER NOT NULL,
    section_key TEXT NOT NULL,
    question_id TEXT NOT NULL,
    UNIQUE(wiki_page_id, section_key, question_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS wiki_image_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    src TEXT NOT NULL,
    page_id INTEGER NOT NULL,
    UNIQUE(src, page_id)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, item_type, item_id)
  )
`);

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    isAdmin: !!row.is_admin,
    createdAt: row.created_at,
  };
}

function createUser({ username, displayName, passwordHash, isAdmin }) {
  const info = db
    .prepare(
      "INSERT INTO users (username, display_name, password_hash, is_admin, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(username, displayName, passwordHash, isAdmin ? 1 : 0, new Date().toISOString());
  return info.lastInsertRowid;
}

function getUserByUsername(username) {
  const row = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  return rowToUser(row);
}

// Renvoie le hash : reserve a la verification de mot de passe au login,
// jamais expose au reste de l'app (rowToUser ne le contient pas).
function getUserCredentials(username) {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) || null;
}

function getUserById(id) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  return rowToUser(row);
}

function listUsers() {
  return db.prepare("SELECT * FROM users ORDER BY id ASC").all().map(rowToUser);
}

function updateUserPassword(id, passwordHash) {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, id);
}

function addFavorite(userId, itemType, itemId) {
  db.prepare(
    "INSERT OR IGNORE INTO favorites (user_id, item_type, item_id, created_at) VALUES (?, ?, ?, ?)"
  ).run(userId, itemType, itemId, new Date().toISOString());
}

function removeFavorite(userId, itemType, itemId) {
  db.prepare("DELETE FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?").run(userId, itemType, itemId);
}

function isFavorite(userId, itemType, itemId) {
  return !!db.prepare("SELECT 1 FROM favorites WHERE user_id = ? AND item_type = ? AND item_id = ?").get(userId, itemType, itemId);
}

function listFavoriteRows(userId) {
  return db.prepare("SELECT item_type, item_id FROM favorites WHERE user_id = ? ORDER BY id DESC").all(userId);
}

function countFavorites() {
  return db.prepare("SELECT COUNT(*) AS c FROM favorites").get().c;
}

// Cree les profils initiaux au demarrage a partir des variables d'env
// (idempotent : ne fait rien si le profil existe deja). Sans mot de passe
// fourni, avertit et laisse le profil non cree plutot que planter.
function seedInitialUsers() {
  const profiles = [
    {
      username: process.env.ADMIN_USERNAME || "admin",
      displayName: process.env.ADMIN_DISPLAY_NAME || "Admin",
      password: process.env.ADMIN_PASSWORD,
      isAdmin: true,
    },
    {
      username: process.env.MANON_USERNAME || "manon",
      displayName: process.env.MANON_DISPLAY_NAME || "Manon",
      password: process.env.MANON_PASSWORD,
      isAdmin: false,
    },
  ];
  profiles.forEach((p) => {
    if (getUserByUsername(p.username)) return;
    if (!p.password) {
      console.warn(
        `ATTENTION: profil "${p.username}" non cree (mot de passe manquant dans .env) -> connexion impossible pour ce profil tant que ce n'est pas renseigne.`
      );
      return;
    }
    createUser({
      username: p.username,
      displayName: p.displayName,
      passwordHash: hashPassword(p.password),
      isAdmin: p.isAdmin,
    });
  });
}

// Migration ponctuelle : les reponses de quizz existantes (avant les
// profils) etaient un seul jeu partage sous le token "shared". On les
// rattache au profil de Manon des que celui-ci existe. Idempotent : une
// fois migre, il n'y a plus de ligne "shared" / user_id NULL a traiter.
function migrateSharedDataToManon() {
  const manon = getUserByUsername(process.env.MANON_USERNAME || "manon");
  if (!manon) return;
  const newToken = "user:" + manon.id;
  db.prepare("UPDATE attempts SET token = ? WHERE token = 'shared'").run(newToken);
  db.prepare("UPDATE submissions SET user_id = ? WHERE user_id IS NULL").run(manon.id);
}

seedInitialUsers();
migrateSharedDataToManon();

function insertSubmission(userId, answers, scores) {
  const stmt = db.prepare(
    "INSERT INTO submissions (created_at, answers, scores, user_id) VALUES (?, ?, ?, ?)"
  );
  const info = stmt.run(
    new Date().toISOString(),
    JSON.stringify(answers),
    JSON.stringify(scores),
    userId || null
  );
  return info.lastInsertRowid;
}

function listSubmissions() {
  const rows = db
    .prepare(
      `SELECT s.id, s.created_at, s.scores, s.user_id, u.display_name
       FROM submissions s LEFT JOIN users u ON u.id = s.user_id
       ORDER BY s.id DESC`
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    scores: JSON.parse(row.scores),
    userId: row.user_id,
    userDisplayName: row.display_name || null,
  }));
}

function getSubmission(id) {
  const row = db
    .prepare(
      `SELECT s.id, s.created_at, s.answers, s.scores, s.user_id, u.display_name
       FROM submissions s LEFT JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`
    )
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    answers: JSON.parse(row.answers),
    scores: JSON.parse(row.scores),
    userId: row.user_id,
    userDisplayName: row.display_name || null,
  };
}

function getAttempt(token) {
  const row = db.prepare("SELECT data, next_section, updated_at FROM attempts WHERE token = ?").get(token);
  if (!row) return null;
  return { data: JSON.parse(row.data), nextSection: row.next_section, updatedAt: row.updated_at };
}

function saveAttempt(token, data, nextSection) {
  db.prepare(
    `INSERT INTO attempts (token, data, next_section, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(token) DO UPDATE SET data = excluded.data, next_section = excluded.next_section, updated_at = excluded.updated_at`
  ).run(token, JSON.stringify(data), nextSection, new Date().toISOString());
}

function deleteAttempt(token) {
  db.prepare("DELETE FROM attempts WHERE token = ?").run(token);
}

function insertLink({ url, title, description, type, tags }) {
  const info = db
    .prepare(
      "INSERT INTO links (url, title, description, type, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .run(url, title, description, type, JSON.stringify(tags), new Date().toISOString());
  return info.lastInsertRowid;
}

function listLinks() {
  const rows = db.prepare("SELECT * FROM links ORDER BY id DESC").all();
  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    title: row.title,
    description: row.description,
    type: row.type,
    tags: JSON.parse(row.tags),
    createdAt: row.created_at,
  }));
}

function deleteLink(id) {
  db.prepare("DELETE FROM links WHERE id = ?").run(id);
}

function rowToWikiPage(row) {
  let imagePaths = JSON.parse(row.image_paths || "[]");
  if (!imagePaths.length && row.image_path) imagePaths = [row.image_path];
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    content: row.content,
    tags: JSON.parse(row.tags),
    imagePaths,
    owned: !!row.owned,
    meta: JSON.parse(row.meta || "{}"),
    rating: row.rating || 0,
    flame: !!row.flame,
    interested: !!row.interested,
    views: row.views || 0,
    featured: !!row.featured,
    extraCategories: (() => { try { return JSON.parse(row.extra_categories || "[]"); } catch (_) { return []; } })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function setWikiPageFeatured(id, featured) {
  db.prepare("UPDATE wiki_pages SET featured = ? WHERE id = ?").run(featured ? 1 : 0, id);
}

function listFeaturedWikiPages() {
  return db.prepare("SELECT * FROM wiki_pages WHERE featured = 1").all().map(rowToWikiPage);
}

function insertWikiPage({ title, category, content, tags, imagePaths, owned, meta, extraCategories }) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO wiki_pages (title, category, content, tags, image_paths, owned, meta, extra_categories, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, category, content, JSON.stringify(tags), JSON.stringify(imagePaths || []), owned ? 1 : 0, JSON.stringify(meta || {}), JSON.stringify(extraCategories || []), now, now);
  return info.lastInsertRowid;
}

function listWikiPages() {
  const rows = db.prepare("SELECT * FROM wiki_pages ORDER BY id DESC").all();
  return rows.map(rowToWikiPage);
}

function getWikiPage(id) {
  const row = db.prepare("SELECT * FROM wiki_pages WHERE id = ?").get(id);
  if (!row) return null;
  return rowToWikiPage(row);
}

function updateWikiPage(id, { title, category, content, tags, imagePaths, owned, meta, extraCategories }) {
  const existing = db.prepare("SELECT image_paths, image_path FROM wiki_pages WHERE id = ?").get(id);
  if (!existing) return false;
  // Si imagePaths n'est pas fourni, conserver les images existantes
  let finalImagePaths = imagePaths;
  if (finalImagePaths === undefined) {
    finalImagePaths = JSON.parse(existing.image_paths || "[]");
    if (!finalImagePaths.length && existing.image_path) finalImagePaths = [existing.image_path];
  }
  db.prepare(
    `UPDATE wiki_pages SET title = ?, category = ?, content = ?, tags = ?, image_paths = ?, owned = ?, meta = ?, extra_categories = ?, updated_at = ?
     WHERE id = ?`
  ).run(title, category, content, JSON.stringify(tags), JSON.stringify(finalImagePaths), owned ? 1 : 0, JSON.stringify(meta || {}), JSON.stringify(extraCategories || []), new Date().toISOString(), id);
  return true;
}

function reactWikiPage(id, { rating, flame, interested }) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  db.prepare("UPDATE wiki_pages SET rating = ?, flame = ?, interested = ? WHERE id = ?")
    .run(r, flame ? 1 : 0, interested ? 1 : 0, id);
}

function deleteWikiPage(id) {
  db.prepare("DELETE FROM wiki_pages WHERE id = ?").run(id);
}

function getWikiPageLinks(pageId) {
  return db.prepare(
    `SELECT w.id, w.title, w.category FROM wiki_page_links pl
     JOIN wiki_pages w ON w.id = pl.linked_page_id
     WHERE pl.page_id = ? ORDER BY w.title`
  ).all(pageId).map(rowToPageLink);
}

function getWikiBacklinks(pageId) {
  return db.prepare(
    `SELECT w.id, w.title, w.category FROM wiki_page_links pl
     JOIN wiki_pages w ON w.id = pl.page_id
     WHERE pl.linked_page_id = ? ORDER BY w.title`
  ).all(pageId).map(rowToPageLink);
}

function rowToPageLink(row) {
  return { id: row.id, title: row.title, category: row.category };
}

function addWikiPageLink(pageId, linkedPageId) {
  if (pageId === linkedPageId) return;
  db.prepare("INSERT OR IGNORE INTO wiki_page_links (page_id, linked_page_id) VALUES (?, ?)").run(pageId, linkedPageId);
}

function removeWikiPageLink(pageId, linkedPageId) {
  db.prepare("DELETE FROM wiki_page_links WHERE page_id = ? AND linked_page_id = ?").run(pageId, linkedPageId);
}

function getWikiQuestionLinks(wikiPageId) {
  return db.prepare("SELECT section_key, question_id FROM wiki_question_links WHERE wiki_page_id = ? ORDER BY id").all(wikiPageId);
}

function addWikiQuestionLink(wikiPageId, sectionKey, questionId) {
  db.prepare("INSERT OR IGNORE INTO wiki_question_links (wiki_page_id, section_key, question_id) VALUES (?, ?, ?)").run(wikiPageId, sectionKey, questionId);
}

function removeWikiQuestionLink(wikiPageId, sectionKey, questionId) {
  db.prepare("DELETE FROM wiki_question_links WHERE wiki_page_id = ? AND section_key = ? AND question_id = ?").run(wikiPageId, sectionKey, questionId);
}

// Sens inverse : depuis une question du quizz, quelles pages wiki y sont liées.
function getPagesForQuestion(sectionKey, questionId) {
  return db.prepare(`
    SELECT wp.id, wp.title, wp.category
    FROM wiki_question_links wql
    JOIN wiki_pages wp ON wp.id = wql.wiki_page_id
    WHERE wql.section_key = ? AND wql.question_id = ?
    ORDER BY wp.title COLLATE NOCASE
  `).all(sectionKey, questionId);
}

// Pour une section entière : quelles questions ont au moins un lien, afin
// d'afficher le bouton "?" différemment sans faire un aller-retour par
// question au chargement de la page.
function getLinkedQuestionIds(sectionKey) {
  return db.prepare("SELECT DISTINCT question_id FROM wiki_question_links WHERE section_key = ?")
    .all(sectionKey)
    .map((r) => r.question_id);
}

function incrementWikiViews(id) {
  db.prepare("UPDATE wiki_pages SET views = views + 1 WHERE id = ?").run(id);
}

function getImageLinks(src) {
  return db.prepare(
    `SELECT w.id, w.title, w.category FROM wiki_image_links il
     JOIN wiki_pages w ON w.id = il.page_id
     WHERE il.src = ? ORDER BY w.title`
  ).all(src);
}

function addImageLink(src, pageId) {
  db.prepare("INSERT OR IGNORE INTO wiki_image_links (src, page_id) VALUES (?, ?)").run(src, pageId);
}

function removeImageLink(src, pageId) {
  db.prepare("DELETE FROM wiki_image_links WHERE src = ? AND page_id = ?").run(src, pageId);
}

function rowToBdBook(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    tags: JSON.parse(row.tags || "[]"),
    imagePaths: JSON.parse(row.image_paths || "[]"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listBdBooks() {
  return db.prepare("SELECT * FROM bd_books ORDER BY updated_at DESC").all().map(rowToBdBook);
}

function getBdBook(id) {
  const row = db.prepare("SELECT * FROM bd_books WHERE id = ?").get(id);
  return row ? rowToBdBook(row) : null;
}

function insertBdBook({ title, description, tags, imagePaths }) {
  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO bd_books (title, description, tags, image_paths, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(title, description, JSON.stringify(tags || []), JSON.stringify(imagePaths || []), now, now);
  return info.lastInsertRowid;
}

function updateBdBook(id, { title, description, tags, imagePaths }) {
  db.prepare(
    `UPDATE bd_books SET title = ?, description = ?, tags = ?, image_paths = ?, updated_at = ? WHERE id = ?`
  ).run(title, description, JSON.stringify(tags || []), JSON.stringify(imagePaths || []), new Date().toISOString(), id);
}

function deleteBdBook(id) {
  db.prepare("DELETE FROM bd_books WHERE id = ?").run(id);
}

function rowToGalleryImage(row) {
  let imagePaths = [];
  try { imagePaths = JSON.parse(row.image_paths || "[]"); } catch (_) {}
  if (!imagePaths.length && row.filename) imagePaths = [row.filename];
  return {
    id: row.id,
    filename: imagePaths[0] || row.filename,
    imagePaths,
    title: row.title || "",
    category: row.category || "",
    tags: (() => { try { return JSON.parse(row.tags || "[]"); } catch(_) { return []; } })(),
    notes: row.notes || "",
    rating: row.rating || 0,
    flame: !!row.flame,
    interested: !!row.interested,
    wikiPageId: row.wiki_page_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function listGalleryImages() {
  return db.prepare("SELECT * FROM gallery_images ORDER BY created_at DESC").all().map(rowToGalleryImage);
}

function getGalleryImage(id) {
  const row = db.prepare("SELECT * FROM gallery_images WHERE id = ?").get(id);
  return row ? rowToGalleryImage(row) : null;
}

function insertGalleryImage({ imagePaths, title, tags, notes, category, wikiPageId }) {
  const now = new Date().toISOString();
  const paths = imagePaths || [];
  const info = db.prepare(
    `INSERT INTO gallery_images (filename, image_paths, title, tags, notes, category, wiki_page_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(paths[0] || "", JSON.stringify(paths), title || "", JSON.stringify(tags || []), notes || "", category || "", wikiPageId || null, now, now);
  return info.lastInsertRowid;
}

function updateGalleryImage(id, { title, category, tags, notes, imagePaths, wikiPageId }) {
  const existing = db.prepare("SELECT image_paths, filename FROM gallery_images WHERE id = ?").get(id);
  if (!existing) return false;
  // Si imagePaths n'est pas fourni, conserver les images existantes
  let finalImagePaths = imagePaths;
  if (finalImagePaths === undefined) {
    finalImagePaths = JSON.parse(existing.image_paths || "[]");
    if (!finalImagePaths.length && existing.filename) finalImagePaths = [existing.filename];
  }
  db.prepare(
    `UPDATE gallery_images SET title = ?, category = ?, tags = ?, notes = ?, filename = ?, image_paths = ?, wiki_page_id = ?, updated_at = ?
     WHERE id = ?`
  ).run(title || "", category || "", JSON.stringify(tags || []), notes || "", finalImagePaths[0] || "", JSON.stringify(finalImagePaths), wikiPageId || null, new Date().toISOString(), id);
  return true;
}

function reactGalleryImage(id, { rating, flame, interested }) {
  const r = Math.max(0, Math.min(5, Number(rating) || 0));
  db.prepare("UPDATE gallery_images SET rating = ?, flame = ?, interested = ? WHERE id = ?")
    .run(r, flame ? 1 : 0, interested ? 1 : 0, id);
}

function deleteGalleryImage(id) {
  db.prepare("DELETE FROM gallery_images WHERE id = ?").run(id);
}

module.exports = {
  db,
  insertSubmission,
  listSubmissions,
  getSubmission,
  getAttempt,
  saveAttempt,
  deleteAttempt,
  insertLink,
  listLinks,
  deleteLink,
  insertWikiPage,
  listWikiPages,
  reactWikiPage,
  getWikiPage,
  updateWikiPage,
  deleteWikiPage,
  getWikiPageLinks,
  getWikiBacklinks,
  addWikiPageLink,
  removeWikiPageLink,
  getWikiQuestionLinks,
  addWikiQuestionLink,
  removeWikiQuestionLink,
  getPagesForQuestion,
  getLinkedQuestionIds,
  incrementWikiViews,
  getImageLinks,
  addImageLink,
  removeImageLink,
  listGalleryImages,
  getGalleryImage,
  insertGalleryImage,
  updateGalleryImage,
  reactGalleryImage,
  deleteGalleryImage,
  setWikiPageFeatured,
  listFeaturedWikiPages,
  listBdBooks,
  getBdBook,
  insertBdBook,
  updateBdBook,
  deleteBdBook,
  getUserByUsername,
  getUserCredentials,
  getUserById,
  listUsers,
  createUser,
  updateUserPassword,
  addFavorite,
  removeFavorite,
  isFavorite,
  listFavoriteRows,
  countFavorites,
};
