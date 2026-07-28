const path = require("path");
const fs = require("fs");

const dataDir = path.join(__dirname, "..", "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const LOG_PATH = path.join(dataDir, "log.csv");
const HEADER = "timestamp,event,code,section_key,section_index,payload_json\n";

if (!fs.existsSync(LOG_PATH)) {
  fs.writeFileSync(LOG_PATH, HEADER, "utf8");
}

function escapeCsv(value) {
  const str = String(value === undefined || value === null ? "" : value);
  if (/[",\n]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function append(event, code, sectionKey, sectionIndex, payload) {
  const row = [
    new Date().toISOString(),
    event,
    code,
    sectionKey || "",
    sectionIndex === undefined || sectionIndex === null ? "" : sectionIndex,
    JSON.stringify(payload || {}),
  ]
    .map(escapeCsv)
    .join(",");

  fs.appendFileSync(LOG_PATH, row + "\n", "utf8");
}

module.exports = { append };
