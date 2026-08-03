const crypto = require("crypto");

function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(plain, stored) {
  const [salt, hashHex] = String(stored || "").split(":");
  if (!salt || !hashHex) return false;
  const hash = crypto.scryptSync(plain, salt, 64);
  const storedBuf = Buffer.from(hashHex, "hex");
  if (storedBuf.length !== hash.length) return false;
  return crypto.timingSafeEqual(hash, storedBuf);
}

module.exports = { hashPassword, verifyPassword };
