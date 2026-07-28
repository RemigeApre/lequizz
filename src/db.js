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
  const row = db.prepare("SELECT data, next_section FROM attempts WHERE token = ?").get(token);
  if (!row) return null;
  return { data: JSON.parse(row.data), nextSection: row.next_section };
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

module.exports = {
  db,
  insertSubmission,
  listSubmissions,
  getSubmission,
  getAttempt,
  saveAttempt,
  deleteAttempt,
};
