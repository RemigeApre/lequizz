const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

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

function insertSubmission(answers, scores) {
  const stmt = db.prepare(
    "INSERT INTO submissions (created_at, answers, scores) VALUES (?, ?, ?)"
  );
  const info = stmt.run(
    new Date().toISOString(),
    JSON.stringify(answers),
    JSON.stringify(scores)
  );
  return info.lastInsertRowid;
}

function listSubmissions() {
  const rows = db
    .prepare("SELECT id, created_at, scores FROM submissions ORDER BY id DESC")
    .all();
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    scores: JSON.parse(row.scores),
  }));
}

function getSubmission(id) {
  const row = db
    .prepare("SELECT id, created_at, answers, scores FROM submissions WHERE id = ?")
    .get(id);
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    answers: JSON.parse(row.answers),
    scores: JSON.parse(row.scores),
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
    extraCategories: (() => { try { return JSON.parse(row.extra_categories || "[]"); } catch (_) { return []; } })(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
  incrementWikiViews,
  getImageLinks,
  addImageLink,
  removeImageLink,
};
