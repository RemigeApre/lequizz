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
  // image_paths est la source de vérité. Si vide mais image_path existe (anciennes lignes), on le wrape.
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function insertWikiPage({ title, category, content, tags, imagePaths, owned, meta }) {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO wiki_pages (title, category, content, tags, image_paths, owned, meta, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, category, content, JSON.stringify(tags), JSON.stringify(imagePaths || []), owned ? 1 : 0, JSON.stringify(meta || {}), now, now);
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

function updateWikiPage(id, { title, category, content, tags, imagePaths, owned, meta }) {
  const existing = db.prepare("SELECT image_paths, image_path FROM wiki_pages WHERE id = ?").get(id);
  if (!existing) return false;
  // Si imagePaths n'est pas fourni, conserver les images existantes
  let finalImagePaths = imagePaths;
  if (finalImagePaths === undefined) {
    finalImagePaths = JSON.parse(existing.image_paths || "[]");
    if (!finalImagePaths.length && existing.image_path) finalImagePaths = [existing.image_path];
  }
  db.prepare(
    `UPDATE wiki_pages SET title = ?, category = ?, content = ?, tags = ?, image_paths = ?, owned = ?, meta = ?, updated_at = ?
     WHERE id = ?`
  ).run(title, category, content, JSON.stringify(tags), JSON.stringify(finalImagePaths), owned ? 1 : 0, JSON.stringify(meta || {}), new Date().toISOString(), id);
  return true;
}

function deleteWikiPage(id) {
  db.prepare("DELETE FROM wiki_pages WHERE id = ?").run(id);
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
  getWikiPage,
  updateWikiPage,
  deleteWikiPage,
};
